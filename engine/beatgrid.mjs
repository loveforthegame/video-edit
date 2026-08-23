#!/usr/bin/env node
/**
 * beatgrid.mjs — music analysis for /video-edit music mode.
 *
 * Audio or video in, a beat grid out. No npm install, no pip, no model
 * download, no API key: WAV parsing, FFT, spectral flux, tempo estimation and
 * peak picking are all implemented here against the Node stdlib.
 *
 *   node beatgrid.mjs <audio-or-video> [options] > beats.json
 *
 * Options
 *   --fps <n>        video fps the frame numbers should be expressed in (default 30)
 *   --out <path>     write JSON here instead of stdout
 *   --bands <n>      log-spaced band envelopes to emit per video frame (default 8, 0 disables)
 *   --bpm <n>        force tempo, skip estimation (phase is still detected)
 *   --offset <sec>   force the first downbeat, skip phase detection
 *   --bpm-min <n>    tempo search floor (default 60)
 *   --bpm-max <n>    tempo search ceiling (default 200)
 *   --beats-per-bar <n>  meter for downbeat detection (default 4)
 *   --quiet          suppress the human-readable summary on stderr
 *
 * .wav input is parsed directly, so this runs with no ffmpeg present. Any other
 * container is decoded by piping through ffmpeg.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const SR = 22050;   // analysis sample rate
const WIN = 1024;   // FFT size -> 46ms window
const HOP = 512;    // 23ms hop -> 43.07 analysis frames/sec
const CENTRE = WIN / 2 / SR; // an analysis frame describes its window's centre, not its start

// ---------------------------------------------------------------- CLI

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : fallback;
};
const flag = (name) => argv.includes(`--${name}`);

const positional = (() => {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      // options that consume a value
      if (!['quiet'].includes(argv[i].slice(2))) i++;
      continue;
    }
    out.push(argv[i]);
  }
  return out;
})();

const src = positional[0];

const fps = Number(opt('fps', 30));
const bandCount = Number(opt('bands', 8));
const bpmMin = Number(opt('bpm-min', 60));
const bpmMax = Number(opt('bpm-max', 200));
const beatsPerBar = Number(opt('beats-per-bar', 4));
const forcedBpm = opt('bpm', null) ? Number(opt('bpm')) : null;
const forcedOffset = opt('offset', null) ? Number(opt('offset')) : null;
const outPath = opt('out', null);
const quiet = flag('quiet');
const debug = flag('debug') || !!process.env.BEATGRID_DEBUG;

// ---------------------------------------------------------------- decode

/** Parse a RIFF/WAVE buffer into { data: Float32Array (interleaved), channels, sampleRate }. */
export function parseWav(buf) {
  if (buf.length < 12 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('not a RIFF/WAVE file');
  }
  let pos = 12;
  let fmt = null;
  let data = null;
  while (pos + 8 <= buf.length) {
    const id = buf.toString('ascii', pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    const body = pos + 8;
    if (id === 'fmt ' && body + 16 <= buf.length) {
      fmt = {
        format: buf.readUInt16LE(body),
        channels: buf.readUInt16LE(body + 2),
        sampleRate: buf.readUInt32LE(body + 4),
        bits: buf.readUInt16LE(body + 14),
      };
      // WAVE_FORMAT_EXTENSIBLE: the real format tag lives in the subformat GUID
      if (fmt.format === 0xfffe && body + 26 <= buf.length) {
        fmt.format = buf.readUInt16LE(body + 24);
      }
    } else if (id === 'data') {
      // streamed wavs declare 0xffffffff; clamp to what we actually have
      data = buf.subarray(body, Math.min(body + size, buf.length));
    }
    if (size === 0xffffffff) break;
    pos = body + size + (size & 1);
  }
  if (!fmt || !data) throw new Error('wav is missing a fmt or data chunk');

  const { bits, format, channels, sampleRate } = fmt;
  const bytes = bits >> 3;
  const n = Math.floor(data.length / bytes);
  const out = new Float32Array(n);
  if (format === 3 && bits === 32) {
    for (let i = 0; i < n; i++) out[i] = data.readFloatLE(i * 4);
  } else if (format === 3 && bits === 64) {
    for (let i = 0; i < n; i++) out[i] = data.readDoubleLE(i * 8);
  } else if (bits === 8) {
    for (let i = 0; i < n; i++) out[i] = (data[i] - 128) / 128;
  } else if (bits === 16) {
    for (let i = 0; i < n; i++) out[i] = data.readInt16LE(i * 2) / 32768;
  } else if (bits === 24) {
    for (let i = 0; i < n; i++) {
      const o = i * 3;
      const v = (data[o] | (data[o + 1] << 8) | (data[o + 2] << 16)) << 8;
      out[i] = v / 2147483648;
    }
  } else if (bits === 32) {
    for (let i = 0; i < n; i++) out[i] = data.readInt32LE(i * 4) / 2147483648;
  } else {
    throw new Error(`unsupported wav sample format (tag ${format}, ${bits}-bit)`);
  }
  return { data: out, channels: channels || 1, sampleRate: sampleRate || SR };
}

/** Interleaved multi-channel -> mono. */
function downmix({ data, channels }) {
  if (channels === 1) return data;
  const frames = Math.floor(data.length / channels);
  const mono = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) sum += data[i * channels + c];
    mono[i] = sum / channels;
  }
  return mono;
}

/** Linear resample. Good enough: we only need envelope timing, not fidelity. */
function resample(mono, from, to) {
  if (from === to) return mono;
  const ratio = from / to;
  const n = Math.floor(mono.length / ratio);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = i * ratio;
    const i0 = Math.floor(x);
    const i1 = Math.min(i0 + 1, mono.length - 1);
    const t = x - i0;
    out[i] = mono[i0] * (1 - t) + mono[i1] * t;
  }
  return out;
}

function decode(path) {
  if (/\.wav$/i.test(path)) {
    try {
      const wav = parseWav(readFileSync(path));
      return resample(downmix(wav), wav.sampleRate, SR);
    } catch (err) {
      if (!quiet) console.error(`[beatgrid] direct wav read failed (${err.message}), falling back to ffmpeg`);
    }
  }
  const res = spawnSync(
    'ffmpeg',
    ['-v', 'error', '-i', path, '-vn', '-ac', '1', '-ar', String(SR), '-f', 'wav', '-'],
    { maxBuffer: 1 << 30 },
  );
  if (res.error || res.status !== 0) {
    const why = res.error?.code === 'ENOENT'
      ? 'ffmpeg not found on PATH (only .wav can be read without it)'
      : (res.stderr?.toString().trim() || `ffmpeg exited ${res.status}`);
    throw new Error(`could not decode ${path}: ${why}`);
  }
  const wav = parseWav(res.stdout);
  return resample(downmix(wav), wav.sampleRate, SR);
}

// ---------------------------------------------------------------- FFT

/** In-place iterative radix-2 Cooley-Tukey. Returns a reusable transform. */
export function makeFft(n) {
  const rev = new Uint32Array(n);
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    rev[i] = j;
  }
  const half = n >> 1;
  const cos = new Float64Array(half);
  const sin = new Float64Array(half);
  for (let i = 0; i < half; i++) {
    cos[i] = Math.cos((-2 * Math.PI * i) / n);
    sin[i] = Math.sin((-2 * Math.PI * i) / n);
  }
  return (re, im) => {
    for (let i = 0; i < n; i++) {
      const j = rev[i];
      if (j > i) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const h = len >> 1;
      const step = n / len;
      for (let i = 0; i < n; i += len) {
        for (let k = 0; k < h; k++) {
          const a = i + k;
          const b = a + h;
          const w = k * step;
          const wr = cos[w];
          const wi = sin[w];
          const xr = re[b] * wr - im[b] * wi;
          const xi = re[b] * wi + im[b] * wr;
          re[b] = re[a] - xr;
          im[b] = im[a] - xi;
          re[a] += xr;
          im[a] += xi;
        }
      }
    }
  };
}

// ---------------------------------------------------------------- STFT + flux

function analyse(mono) {
  const fft = makeFft(WIN);
  const window = new Float64Array(WIN);
  for (let i = 0; i < WIN; i++) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (WIN - 1));

  const bins = WIN / 2;
  const frames = Math.max(1, Math.floor((mono.length - WIN) / HOP) + 1);
  const hzPerBin = SR / WIN;
  const binOf = (hz) => Math.max(1, Math.min(bins - 1, Math.round(hz / hzPerBin)));

  // percussive bands: kick / snare-body / hats
  const lowTop = binOf(180);
  const midTop = binOf(2000);
  const highTop = bins - 1;

  // log-spaced bands for visualizers
  const edges = [];
  if (bandCount > 0) {
    const lo = 40;
    const hi = Math.min(12000, SR / 2 - hzPerBin);
    for (let i = 0; i <= bandCount; i++) edges.push(binOf(lo * Math.pow(hi / lo, i / bandCount)));
  }

  const fluxAll = new Float64Array(frames);
  const fluxLow = new Float64Array(frames);
  const fluxMid = new Float64Array(frames);
  const fluxHigh = new Float64Array(frames);
  const rms = new Float64Array(frames);
  const bandEnergy = bandCount > 0
    ? Array.from({ length: bandCount }, () => new Float64Array(frames))
    : [];

  const re = new Float64Array(WIN);
  const im = new Float64Array(WIN);
  let prev = new Float64Array(bins);
  let mag = new Float64Array(bins);

  for (let f = 0; f < frames; f++) {
    const start = f * HOP;
    let energy = 0;
    for (let i = 0; i < WIN; i++) {
      const s = start + i < mono.length ? mono[start + i] : 0;
      energy += s * s;
      re[i] = s * window[i];
      im[i] = 0;
    }
    rms[f] = Math.sqrt(energy / WIN);
    fft(re, im);
    for (let k = 0; k < bins; k++) {
      // log-compressed magnitude: matches perceived onset strength far better
      // than raw linear magnitude, and keeps quiet passages usable
      mag[k] = Math.log1p(100 * Math.hypot(re[k], im[k]));
    }
    for (let k = 1; k < bins; k++) {
      const d = mag[k] - prev[k];
      if (d > 0) {
        fluxAll[f] += d;
        if (k <= lowTop) fluxLow[f] += d;
        else if (k <= midTop) fluxMid[f] += d;
        else if (k <= highTop) fluxHigh[f] += d;
      }
    }
    for (let b = 0; b < bandCount; b++) {
      let sum = 0;
      for (let k = edges[b]; k < edges[b + 1]; k++) sum += mag[k];
      bandEnergy[b][f] = sum / Math.max(1, edges[b + 1] - edges[b]);
    }
    const swap = prev;
    prev = mag;
    mag = swap;
  }
  return { frames, fluxAll, fluxLow, fluxMid, fluxHigh, rms, bandEnergy, envRate: SR / HOP };
}

// ---------------------------------------------------------------- helpers

/** Subtract a moving median-ish baseline and half-wave rectify. */
export function rectify(x, radius) {
  const n = x.length;
  const out = new Float64Array(n);
  // moving mean is cheap and behaves well enough on rectified flux
  const win = radius * 2 + 1;
  let sum = 0;
  for (let i = 0; i < Math.min(radius + 1, n); i++) sum += x[i];
  let count = Math.min(radius + 1, n);
  for (let i = 0; i < n; i++) {
    const add = i + radius;
    const drop = i - radius - 1;
    if (i > 0) {
      if (add < n) { sum += x[add]; count++; }
      if (drop >= 0) { sum -= x[drop]; count--; }
    }
    const mean = sum / Math.max(1, count);
    out[i] = Math.max(0, x[i] - mean);
  }
  return out;
}

function percentile(x, p) {
  const arr = Array.from(x).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!arr.length) return 0;
  return arr[Math.min(arr.length - 1, Math.max(0, Math.floor(p * (arr.length - 1))))];
}

export function normalise(x, p = 0.98) {
  const scale = percentile(x, p) || Math.max(...x) || 1;
  const out = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = Math.min(1, Math.max(0, x[i] / scale));
  return out;
}

export const idxToTime = (i) => i * (HOP / SR) + CENTRE;
const timeToIdx = (t) => (t - CENTRE) * (SR / HOP);

/** Sample an analysis-rate signal at a video frame, linearly interpolated. */
function sampleAt(sig, envRate, frame) {
  const x = timeToIdx(frame / fps);
  const i0 = Math.floor(x);
  if (i0 < 0) return sig[0] ?? 0;
  if (i0 >= sig.length - 1) return sig[sig.length - 1] ?? 0;
  const t = x - i0;
  return sig[i0] * (1 - t) + sig[i0 + 1] * t;
}

// ---------------------------------------------------------------- tempo

/** Mean of env sampled on a grid of period/phase, in analysis frames. */
function gridScore(env, period, phase) {
  let sum = 0;
  let n = 0;
  for (let t = phase; t < env.length; t += period) {
    const i = Math.round(t);
    if (i >= 0 && i < env.length) { sum += env[i]; n++; }
  }
  return n ? sum / n : 0;
}

function bestPhase(env, period) {
  let best = { phase: 0, score: -1 };
  const limit = Math.ceil(period);
  for (let p = 0; p < limit; p += 0.25) {
    const score = gridScore(env, period, p);
    if (score > best.score) best = { phase: p, score };
  }
  return best;
}

const TOL = (envRate) => 0.07 * envRate; // absolute, so no octave gets a wider window

/** Strength of the strongest onset sitting on each line of a period/phase grid. */
export function gridLineStrengths(onsets, period, phase, envRate, len) {
  const tol = TOL(envRate);
  const out = [];
  for (let g = phase; g < len; g += period) {
    let best = 0;
    for (const o of onsets) {
      if (Math.abs(o.i - g) <= tol && o.strength > best) best = o.strength;
    }
    out.push(best);
  }
  return out;
}

/**
 * How well a period/phase grid explains the track's transients, weighted by
 * onset strength.
 *   recall    = share of total transient energy that lands on a grid line
 *   precision = how strong an onset the average grid line actually lands on
 * Recall alone always prefers the faster grid (doubling never loses an onset);
 * precision alone always prefers the slower one. We weight precision higher
 * (F-beta, beta=0.5) because an empty or weak grid line is the more visible
 * failure: animation fires on a frame where nothing happened.
 */
export function gridScoreF(onsets, period, phase, envRate, len) {
  if (!onsets.length) return 0;
  const tol = TOL(envRate);
  const scale = percentile(onsets.map((o) => o.strength), 0.9) || 1;

  let totalW = 0;
  let coveredW = 0;
  for (const o of onsets) {
    totalW += o.strength;
    const g = phase + Math.round((o.i - phase) / period) * period;
    if (g >= -tol && g < len + tol && Math.abs(o.i - g) <= tol) coveredW += o.strength;
  }
  const recall = totalW > 0 ? coveredW / totalW : 0;

  const lines = gridLineStrengths(onsets, period, phase, envRate, len);
  const mean = lines.length ? lines.reduce((a, b) => a + b, 0) / lines.length : 0;
  const precision = Math.min(1, mean / scale);

  const b2 = 0.25; // beta = 0.5
  const denom = b2 * precision + recall;
  return denom > 0 ? ((1 + b2) * precision * recall) / denom : 0;
}

/**
 * Tatum test. If every other line of a grid is markedly weaker than its
 * neighbours, the grid is sitting on subdivisions (eighth-note hi-hats) rather
 * than on the beat. Returns the strong/weak ratio; >= 1.7 means halve the
 * tempo. This is the check that separates "90bpm with hats on the eighths"
 * from "a genuine 180bpm".
 */
export function tatumRatio(onsets, period, phase, envRate, len) {
  const lines = gridLineStrengths(onsets, period, phase, envRate, len);
  if (lines.length < 6) return 0;
  const parity = [0, 1].map((r) => {
    const vals = lines.filter((_, i) => i % 2 === r);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  });
  const strong = Math.max(parity[0], parity[1]);
  const weak = Math.min(parity[0], parity[1]);
  return weak > 1e-9 ? strong / weak : 0;
}

const tempoPrior = (bpm) => Math.exp(-0.5 * Math.pow(Math.log2(bpm / 120) / 0.9, 2));

function estimateTempo(env, envRate, onsets = []) {
  const minLag = Math.floor((60 / bpmMax) * envRate);
  const maxLag = Math.ceil((60 / bpmMin) * envRate);
  const n = env.length;
  const bpmOf = (lag) => (60 * envRate) / lag;

  // autocorrelation over the plausible beat-period range
  const ac = new Float64Array(maxLag + 1);
  for (let lag = minLag; lag <= maxLag && lag < n; lag++) {
    let sum = 0;
    for (let i = 0; i + lag < n; i++) sum += env[i] * env[i + lag];
    ac[lag] = sum / (n - lag);
  }

  // comb score: reward a period whose multiples also correlate
  let best = { lag: minLag, score: -1 };
  for (let lag = minLag; lag <= maxLag && lag < n; lag++) {
    let score = 0;
    for (let k = 1; k <= 4; k++) {
      const l = lag * k;
      if (l <= maxLag && l < n) score += ac[l] / k;
    }
    // prior centred on 120bpm; wide enough not to fight a real 90 or 170
    score *= tempoPrior(bpmOf(lag));
    if (score > best.score) best = { lag, score };
  }

  /**
   * Sub-sample the period around a seed. Autocorrelation only resolves whole
   * analysis frames, and a 1% period error walks the grid clean off the beat
   * within ~20 bars — which also wrecks any judgement made about the grid, so
   * every candidate must be refined BEFORE it is scored, not after it wins.
   */
  const refineAround = (seed) => {
    let out = { lag: seed, phase: 0, energy: -1 };
    const step = Math.max(seed * 0.001, 0.01);
    for (let lag = seed * 0.97; lag <= seed * 1.03; lag += step) {
      if (lag < minLag * 0.9 || lag > maxLag * 1.1) continue;
      const { phase, score } = bestPhase(env, lag);
      if (score > out.energy) out = { lag, phase, energy: score };
    }
    return out;
  };

  // octave check across half / chosen / double tempo
  const candidates = [...new Set([best.lag / 2, best.lag, best.lag * 2])]
    .filter((lag) => lag >= minLag && lag <= maxLag && lag < n);

  let chosen = null;
  let anyScore = false;
  for (const seed of candidates) {
    const r = refineAround(seed);
    const f = gridScoreF(onsets, r.lag, r.phase, envRate, n);
    if (f > 0) anyScore = true;
    // the onset fit decides the octave; the tempo prior only breaks near-ties
    const score = f * Math.pow(tempoPrior(bpmOf(r.lag)), 0.25);
    if (debug) {
      console.error(`[dbg] candidate ${bpmOf(r.lag).toFixed(2)}bpm lag=${r.lag.toFixed(3)} phase=${r.phase.toFixed(2)} fit=${f.toFixed(3)} score=${score.toFixed(3)}`);
    }
    if (!chosen || score > chosen.score) chosen = { ...r, score, fit: f };
  }
  if (!anyScore) {
    // no usable transients (ambient/legato) — fall back to grid energy alone.
    // There is nothing to verify the grid against, so it reports no confidence.
    chosen = null;
    for (const seed of candidates) {
      const r = refineAround(seed);
      const score = r.energy * Math.pow(tempoPrior(bpmOf(r.lag)), 0.5);
      if (!chosen || score > chosen.score) chosen = { ...r, score, fit: 0 };
    }
  }

  // tatum guard: if the winning grid alternates strong/weak lines it is sitting
  // on subdivisions, so the real period is twice this one. Re-refine after each
  // halving, since the doubled period needs its own sub-sample fit.
  for (let pass = 0; pass < 2 && onsets.length; pass++) {
    if (bpmOf(chosen.lag * 2) < bpmMin) break;
    const ratio = tatumRatio(onsets, chosen.lag, chosen.phase, envRate, n);
    if (debug) console.error(`[dbg] tatum pass ${pass}: ${bpmOf(chosen.lag).toFixed(2)}bpm ratio=${ratio.toFixed(2)}`);
    if (ratio < 1.7) break;
    const r = refineAround(chosen.lag * 2);
    const f = gridScoreF(onsets, r.lag, r.phase, envRate, n);
    chosen = { ...r, score: f, fit: f };
    if (debug) console.error(`[dbg] tatum halved tempo -> ${bpmOf(chosen.lag).toFixed(2)}bpm`);
  }

  // Above about four onsets per beat the peak picker is tracking texture rather
  // than hits (a legato pad measures ~6), so the grid deserves less trust even
  // when it fits what was detected.
  const lines = chosen.lag > 0 ? n / chosen.lag : 0;
  const density = lines > 0 ? onsets.length / lines : 0;
  const support = density > 4 ? 4 / density : 1;

  return {
    lag: chosen.lag,
    phase: chosen.phase,
    bpm: bpmOf(chosen.lag),
    // How well the track's transients actually agree with this grid: every beat
    // lands on a strong hit, and most hits land on a beat. A track with no real
    // pulse scores low instead of pretending to be certain, which is the whole
    // point of publishing this number.
    confidence: round(Math.max(0, Math.min(1, (chosen.fit ?? 0) * support)), 3),
  };
}

// ---------------------------------------------------------------- onsets

export function findOnsetPeaks(env, envRate) {
  const minGap = Math.max(2, Math.round(0.07 * envRate));
  const radius = Math.round(0.25 * envRate);
  const out = [];
  let last = -Infinity;
  for (let i = 1; i < env.length - 1; i++) {
    if (env[i] <= env[i - 1] || env[i] < env[i + 1]) continue;
    let sum = 0;
    let n = 0;
    for (let j = Math.max(0, i - radius); j <= Math.min(env.length - 1, i + radius); j++) { sum += env[j]; n++; }
    const local = sum / Math.max(1, n);
    if (env[i] < local * 1.4 + 0.02) continue;
    if (i - last < minGap) {
      if (out.length && env[i] > out[out.length - 1].strength) {
        out[out.length - 1] = { i, strength: env[i] };
        last = i;
      }
      continue;
    }
    out.push({ i, strength: env[i] });
    last = i;
  }
  return out;
}

const formatOnsets = (peaks) => peaks.map(({ i, strength }) => ({
  t: round(idxToTime(i), 4),
  frame: Math.round(idxToTime(i) * fps),
  strength: round(Math.min(1, strength), 3),
}));

// ---------------------------------------------------------------- sections

function buildSections(rms, envRate, beatTimes) {
  const barSec = beatTimes.length > 1
    ? (beatTimes[1] - beatTimes[0]) * beatsPerBar
    : 2;
  const total = rms.length / envRate;
  const windows = [];
  for (let t = 0; t < total; t += barSec) {
    const a = Math.max(0, Math.floor(timeToIdx(t)));
    const b = Math.min(rms.length, Math.floor(timeToIdx(t + barSec)));
    let sum = 0;
    for (let i = a; i < b; i++) sum += rms[i] * rms[i];
    windows.push({ t, energy: Math.sqrt(sum / Math.max(1, b - a)) });
  }
  const peak = Math.max(...windows.map((w) => w.energy), 1e-9);
  const levelled = windows.map((w) => {
    const e = w.energy / peak;
    return { ...w, norm: e, level: e > 0.66 ? 'high' : e > 0.33 ? 'mid' : 'low' };
  });

  const sections = [];
  for (const w of levelled) {
    const prev = sections[sections.length - 1];
    if (prev && prev.level === w.level) {
      prev.end = w.t + barSec;
      prev._sum += w.norm;
      prev._n += 1;
    } else {
      sections.push({
        start: w.t, end: w.t + barSec, level: w.level,
        drop: !!prev && w.level === 'high' && prev.level !== 'high',
        _sum: w.norm, _n: 1,
      });
    }
  }
  return sections.map((s) => ({
    start: round(s.start, 3),
    end: round(Math.min(s.end, total), 3),
    startFrame: Math.round(s.start * fps),
    endFrame: Math.round(Math.min(s.end, total) * fps),
    level: s.level,
    energy: round(s._sum / s._n, 3),
    drop: s.drop,
  }));
}

// ---------------------------------------------------------------- run

const round = (v, d = 3) => {
  const m = Math.pow(10, d);
  return Math.round(v * m) / m;
};

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  if (!src) {
    console.error('usage: node beatgrid.mjs <audio-or-video> [--fps 30] [--out beats.json]');
    process.exit(2);
  }
  const mono = decode(src);
  const duration = mono.length / SR;
  if (duration < 1) throw new Error(`audio is only ${duration.toFixed(2)}s — nothing to analyse`);

  const a = analyse(mono);
  const smooth = Math.round(a.envRate * 0.4);
  const envAll = normalise(rectify(a.fluxAll, smooth));
  const envLow = normalise(rectify(a.fluxLow, smooth));
  const envMid = normalise(rectify(a.fluxMid, smooth));
  const envHigh = normalise(rectify(a.fluxHigh, smooth));

  // Tempo tracking runs on the kick+snare body only. Hi-hats sit on subdivisions,
  // so including them makes an eighth-note tatum look exactly like the beat and
  // the grid comes out at double tempo.
  const envBeat = new Float64Array(envAll.length);
  for (let i = 0; i < envAll.length; i++) envBeat[i] = 0.55 * envLow[i] + 0.45 * envMid[i];

  const onsetPeaks = findOnsetPeaks(envBeat, a.envRate);

  let tempo;
  if (forcedBpm) {
    const lag = (60 * a.envRate) / forcedBpm;
    const phase = forcedOffset != null ? timeToIdx(forcedOffset) : bestPhase(envBeat, lag).phase;
    tempo = { lag, phase, bpm: forcedBpm, confidence: 1 };
  } else {
    tempo = estimateTempo(envBeat, a.envRate, onsetPeaks);
    if (forcedOffset != null) tempo.phase = timeToIdx(forcedOffset);
  }

  const period = tempo.lag / a.envRate; // seconds per beat
  const first = idxToTime(tempo.phase);

  // beat list (rigid grid — musical and drift-free; use `onsets` for real transients)
  const beatTimes = [];
  for (let t = first; t < duration; t += period) beatTimes.push(t);
  // keep a pickup beat if the grid starts late enough to have missed one
  if (beatTimes.length && beatTimes[0] - period >= 0) beatTimes.unshift(beatTimes[0] - period);

  const strengthAt = (t) => {
    const i = Math.round(timeToIdx(t));
    return i >= 0 && i < envBeat.length ? Math.min(1, envBeat[i]) : 0;
  };

  // meter: whichever bar phase carries the most weight is beat one
  let barPhase = 0;
  let barBest = -1;
  for (let p = 0; p < beatsPerBar; p++) {
    let sum = 0;
    let n = 0;
    for (let i = p; i < beatTimes.length; i += beatsPerBar) { sum += strengthAt(beatTimes[i]); n++; }
    const score = n ? sum / n : 0;
    if (score > barBest) { barBest = score; barPhase = p; }
  }

  const beats = beatTimes.map((t, i) => {
    const rel = ((i - barPhase) % beatsPerBar + beatsPerBar) % beatsPerBar;
    return {
      i,
      t: round(t, 4),
      frame: Math.round(t * fps),
      strength: round(strengthAt(t), 3),
      beatInBar: rel,
      bar: Math.floor((i - barPhase) / beatsPerBar),
      downbeat: rel === 0,
    };
  });

  const videoFrames = Math.floor(duration * fps);
  const perFrame = (sig) => Array.from({ length: videoFrames }, (_, f) => round(sampleAt(sig, a.envRate, f), 3));

  const bands = bandCount > 0
    ? a.bandEnergy.map((b) => {
        const n = normalise(b, 0.97);
        return Array.from({ length: videoFrames }, (_, f) => round(sampleAt(n, a.envRate, f), 3));
      })
    : [];

  const grid = {
    source: src,
    fps,
    duration: round(duration, 3),
    durationInFrames: videoFrames,
    bpm: round(tempo.bpm, 2),
    beatPeriod: round(period, 5),
    beatPeriodFrames: round(period * fps, 3),
    offset: round(first, 4),
    beatsPerBar,
    confidence: round(tempo.confidence, 3),
    beats,
    beatFrames: beats.map((b) => b.frame),
    downbeatFrames: beats.filter((b) => b.downbeat).map((b) => b.frame),
    onsets: formatOnsets(onsetPeaks),
    sections: buildSections(a.rms, a.envRate, beatTimes),
    envelope: { all: perFrame(envAll), low: perFrame(envLow), mid: perFrame(envMid), high: perFrame(envHigh) },
    bands,
  };

  const json = JSON.stringify(grid);
  if (outPath) writeFileSync(outPath, json);
  else process.stdout.write(json);

  if (!quiet) {
    const pct = (v) => `${Math.round(v * 100)}%`;
    const lines = [
      `[beatgrid] ${src}`,
      `  ${round(duration, 2)}s @ ${fps}fps -> ${videoFrames} frames`,
      `  ${round(tempo.bpm, 1)} BPM, first downbeat ${round(first, 3)}s, confidence ${pct(tempo.confidence)}`,
      `  ${beats.length} beats (${grid.downbeatFrames.length} downbeats), ${grid.onsets.length} onsets`,
      `  sections: ${grid.sections.map((s) => `${s.level}${s.drop ? '*' : ''}@${s.start}s`).join(' ')}`,
    ];
    if (tempo.confidence < 0.35) {
      lines.push('  ! low confidence — check the BPM against the track and rerun with --bpm if it is wrong');
    }
    console.error(lines.join('\n'));
  }
}
