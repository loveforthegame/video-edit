/**
 * Regression tests for engine/beatgrid.mjs.
 *
 *   node engine/test/beatgrid.test.mjs
 *
 * No npm install, no pip, no ffmpeg, no fixture files in the repo: the drum
 * patterns are synthesised here at known BPM and offset, so the detector is
 * always scored against ground truth rather than against its own last output.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  makeFft, parseWav, tatumRatio, gridLineStrengths, normalise, rectify,
} from '../beatgrid.mjs';

const ENGINE = join(dirname(fileURLToPath(import.meta.url)), '..', 'beatgrid.mjs');
const dir = mkdtempSync(join(tmpdir(), 'beatgrid-test-'));

let failures = 0;
let checks = 0;
const ok = (cond, label, detail = '') => {
  checks++;
  if (!cond) { failures++; console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`); }
  else console.log(`  ok   ${label}${detail ? ` — ${detail}` : ''}`);
};

// ------------------------------------------------------------------ synthesis

/** Deterministic noise so a failure is always reproducible. */
const lcg = (seed) => () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x3fffffff) - 1;

const SR = 44100;

function writeWav(path, channels, floatFmt = false) {
  const frames = channels[0].length;
  const ch = channels.length;
  const bytes = floatFmt ? 4 : 2;
  const data = Buffer.alloc(frames * ch * bytes);
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < ch; c++) {
      const v = Math.max(-1, Math.min(1, channels[c][i]));
      const off = (i * ch + c) * bytes;
      if (floatFmt) data.writeFloatLE(v, off);
      else data.writeInt16LE(Math.round(v * 32767), off);
    }
  }
  const head = Buffer.alloc(44);
  head.write('RIFF', 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write('WAVE', 8);
  head.write('fmt ', 12);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(floatFmt ? 3 : 1, 20);
  head.writeUInt16LE(ch, 22);
  head.writeUInt32LE(SR, 24);
  head.writeUInt32LE(SR * ch * bytes, 28);
  head.writeUInt16LE(ch * bytes, 32);
  head.writeUInt16LE(bytes * 8, 34);
  head.write('data', 36);
  head.writeUInt32LE(data.length, 40);
  writeFileSync(path, Buffer.concat([head, data]));
  return path;
}

/**
 * A drum loop at a known tempo. `pattern` names which voices fire on each beat
 * of the bar; subdivisions are always quieter than the beat itself, which is
 * what makes the intended tempo the musically correct answer rather than a
 * matter of taste.
 */
function drums({ bpm, offset, bars = 16, pattern = 'backbeat', quietIntroBars = 0, hats = 'eighth', seed = 7 }) {
  const rand = lcg(seed);
  const spb = 60 / bpm;
  const beatsPerBar = 4;
  const total = offset + bars * beatsPerBar * spb + 1;
  const n = Math.ceil(total * SR);
  const buf = new Float32Array(n);

  const add = (t0, dur, gen) => {
    const start = Math.round(t0 * SR);
    const len = Math.round(dur * SR);
    for (let i = 0; i < len; i++) {
      const k = start + i;
      if (k >= 0 && k < n) buf[k] += gen(i / SR);
    }
  };
  const kick = (t) => Math.sin(2 * Math.PI * (120 * Math.exp(-t * 28) + 42) * t) * Math.exp(-t * 11);
  const snare = (t) => 0.55 * (rand() * Math.exp(-t * 34) + Math.sin(2 * Math.PI * 190 * t) * Math.exp(-t * 26));
  // a real hi-hat lives above ~4kHz; broadband noise would smear into the
  // bands the beat tracker reads, which is not how a hat actually sounds
  const hat = (t) => 0.3 * rand() * Math.exp(-t * 150) * Math.sin(2 * Math.PI * 9000 * t);

  for (let b = 0; b < bars * beatsPerBar; b++) {
    const t = offset + b * spb;
    const bar = Math.floor(b / beatsPerBar);
    const pos = b % beatsPerBar;
    const intro = bar < quietIntroBars;
    if (!intro) {
      if (pattern === 'fourfloor') add(t, 0.35, kick);
      else {
        if (pos === 0 || pos === 2) add(t, 0.33, kick);
        if (pos === 1 || pos === 3) add(t, 0.2, snare);
      }
    }
    if (hats === 'eighth') { add(t, 0.05, hat); add(t + spb / 2, 0.05, hat); }
    else if (hats === 'offbeat') add(t + spb / 2, 0.06, hat);
  }
  // a sustained pad, so the track is not pure percussion
  for (let i = 0; i < n; i++) {
    const tt = i / SR;
    if (tt > offset) buf[i] += 0.06 * Math.sin(2 * Math.PI * 110 * tt) * Math.sin(2 * Math.PI * 0.25 * tt);
  }
  let peak = 1e-9;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(buf[i]));
  for (let i = 0; i < n; i++) buf[i] = (buf[i] / peak) * 0.89;
  return buf;
}

/** Legato pad with no transients at all — exercises the no-onset fallback. */
function ambient(seconds = 20) {
  const n = seconds * SR;
  const buf = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    buf[i] = 0.4 * (Math.sin(2 * Math.PI * 110 * t) + 0.6 * Math.sin(2 * Math.PI * 164.8 * t))
      * (0.6 + 0.4 * Math.sin(2 * Math.PI * 0.11 * t));
  }
  return buf;
}

const run = (file, extra = []) => JSON.parse(
  execFileSync('node', [ENGINE, file, '--quiet', ...extra], { maxBuffer: 1 << 28 }).toString(),
);

// ------------------------------------------------------------------ e2e cases

const CASES = [
  { name: '120bpm backbeat',        bpm: 120, offset: 0,     opts: {} },
  { name: '128bpm off-grid start',  bpm: 128, offset: 0.371, opts: {} },
  { name: '90bpm (tatum trap)',     bpm: 90,  offset: 0.75,  opts: {} },
  { name: '174bpm dnb (half trap)', bpm: 174, offset: 0.2,   opts: {} },
  { name: '100bpm quiet intro',     bpm: 100, offset: 0.5,   opts: { quietIntroBars: 2 } },
  { name: '140bpm four-on-floor',   bpm: 140, offset: 0.11,  opts: { pattern: 'fourfloor', hats: 'offbeat' } },
];

console.log('beat grid — tempo and phase against ground truth');
const fps = 60;
for (const c of CASES) {
  const file = writeWav(join(dir, `${c.bpm}-${Math.round(c.offset * 1000)}.wav`),
    [drums({ bpm: c.bpm, offset: c.offset, ...c.opts })]);
  const g = run(file, ['--fps', String(fps)]);

  const period = 60 / c.bpm;
  let dp = (g.offset - c.offset) % period;
  if (dp > period / 2) dp -= period;
  if (dp < -period / 2) dp += period;
  const bpmErr = (Math.abs(g.bpm - c.bpm) / c.bpm) * 100;

  ok(bpmErr < 2, `${c.name}: tempo`, `got ${g.bpm} want ${c.bpm} (${bpmErr.toFixed(2)}%)`);
  // one frame at 60fps is 16.7ms; stay inside that and animation lands on the hit
  ok(Math.abs(dp) < 0.04, `${c.name}: phase`, `${(dp * 1000).toFixed(0)}ms off the beat`);

  const mono = g.beatFrames.every((f, i) => i === 0 || f > g.beatFrames[i - 1]);
  ok(mono, `${c.name}: beat frames strictly increasing`);
  ok(['all', 'low', 'mid', 'high'].every((k) => g.envelope[k].length === g.durationInFrames),
    `${c.name}: envelopes are one value per video frame`, `${g.durationInFrames} frames`);
  ok(g.bands.length === 8 && g.bands.every((b) => b.length === g.durationInFrames),
    `${c.name}: 8 band envelopes at frame rate`);
  ok(g.onsets.every((o) => o.frame >= 0 && o.frame <= g.durationInFrames),
    `${c.name}: onsets inside the timeline`);
  ok(g.beats.every((b) => b.downbeat === (b.beatInBar === 0)) && g.downbeatFrames.length > 0,
    `${c.name}: downbeats are beat one of each bar`, `${g.downbeatFrames.length} bars`);
  const gaps = g.downbeatFrames.slice(1).map((f, i) => f - g.downbeatFrames[i]);
  const wantGap = g.beatPeriodFrames * g.beatsPerBar;
  ok(gaps.every((x) => Math.abs(x - wantGap) <= 1.5), `${c.name}: bars evenly spaced`,
    `gap ${gaps[0]} vs ${wantGap.toFixed(1)}`);
  ok(g.sections.length > 0 && g.sections.every((s) => s.endFrame > s.startFrame),
    `${c.name}: sections non-empty`);
  ok(g.confidence > 0.5, `${c.name}: reports confidence in a real beat`, `${g.confidence}`);
}

// ------------------------------------------------------------------ options and edge cases

console.log('\noptions and edge cases');
{
  const file = writeWav(join(dir, 'forced.wav'), [drums({ bpm: 120, offset: 0 })]);
  const g = run(file, ['--fps', '30', '--bpm', '100']);
  ok(Math.abs(g.bpm - 100) < 0.01, 'forced --bpm overrides estimation', `got ${g.bpm}`);
  const g2 = run(file, ['--fps', '30', '--bpm', '120', '--offset', '0.25']);
  ok(Math.abs(g2.offset - 0.25) < 0.01, 'forced --offset overrides phase', `got ${g2.offset}`);
  const g3 = run(file, ['--fps', '24']);
  ok(g3.beats.every((b) => b.frame === Math.round(b.t * 24)), 'frame numbers follow --fps');
  const g4 = run(file, ['--fps', '30', '--bands', '0']);
  ok(g4.bands.length === 0, '--bands 0 emits no band data');
}
{
  const file = writeWav(join(dir, 'ambient.wav'), [ambient()]);
  let g = null;
  let threw = null;
  try { g = run(file, ['--fps', '30']); } catch (e) { threw = e; }
  ok(!threw, 'legato track with no transients does not crash',
    threw ? String(threw.message).slice(0, 80) : '');
  if (g) {
    ok(Number.isFinite(g.bpm) && g.bpm >= 60 && g.bpm <= 200, 'ambient still yields an in-range tempo', `${g.bpm}bpm`);
    ok(g.confidence < 0.35, 'ambient reports no confidence', `${g.confidence}`);
  }
}
{
  // stereo 32-bit float must parse and agree with the mono 16-bit read
  const m = drums({ bpm: 128, offset: 0.2 });
  const mono = writeWav(join(dir, 's-mono.wav'), [m]);
  const stereo = writeWav(join(dir, 's-stereo.wav'), [m, m], true);
  const a = run(mono, ['--fps', '30']);
  const b = run(stereo, ['--fps', '30']);
  ok(Math.abs(a.bpm - b.bpm) < 1, 'stereo float32 wav agrees with mono int16', `${a.bpm} vs ${b.bpm}`);
}

// ------------------------------------------------------------------ unit tests

console.log('\nDSP units');
{
  // FFT against a naive DFT
  const n = 64;
  const rand = lcg(11);
  const sig = Array.from({ length: n }, () => rand());
  const re = Float64Array.from(sig);
  const im = new Float64Array(n);
  makeFft(n)(re, im);
  let worst = 0;
  for (let k = 0; k < n; k++) {
    let dr = 0;
    let di = 0;
    for (let t = 0; t < n; t++) {
      const a = (-2 * Math.PI * k * t) / n;
      dr += sig[t] * Math.cos(a);
      di += sig[t] * Math.sin(a);
    }
    worst = Math.max(worst, Math.abs(dr - re[k]), Math.abs(di - im[k]));
  }
  ok(worst < 1e-9, 'radix-2 FFT matches a naive DFT', `max error ${worst.toExponential(1)}`);
}
{
  const buf = Buffer.alloc(0);
  let threw = false;
  try { parseWav(buf); } catch { threw = true; }
  ok(threw, 'parseWav rejects a non-WAVE buffer');

  const sig = Float32Array.from({ length: 1000 }, (_, i) => Math.sin(i / 10) * 0.5);
  const w = parseWav(readFileSync(writeWav(join(dir, 'rt.wav'), [sig])));
  ok(w.channels === 1 && w.sampleRate === SR, 'parseWav reads fmt chunk', `${w.channels}ch ${w.sampleRate}Hz`);
  let maxDiff = 0;
  for (let i = 0; i < sig.length; i++) maxDiff = Math.max(maxDiff, Math.abs(w.data[i] - sig[i]));
  ok(maxDiff < 1 / 32767 + 1e-6, 'parseWav round-trips 16-bit samples', `max diff ${maxDiff.toExponential(1)}`);
}
{
  // tatumRatio: a grid alternating loud/quiet is sitting on subdivisions
  const alt = Array.from({ length: 40 }, (_, i) => ({ i: i * 10, strength: i % 2 ? 0.35 : 0.95 }));
  const even = Array.from({ length: 40 }, (_, i) => ({ i: i * 10, strength: 0.9 }));
  const envRate = 43.07;
  ok(tatumRatio(alt, 10, 0, envRate, 400) >= 1.7, 'tatumRatio flags an alternating grid',
    tatumRatio(alt, 10, 0, envRate, 400).toFixed(2));
  ok(tatumRatio(even, 10, 0, envRate, 400) < 1.7, 'tatumRatio leaves an even grid alone',
    tatumRatio(even, 10, 0, envRate, 400).toFixed(2));
  const lines = gridLineStrengths(alt, 20, 0, envRate, 400);
  ok(lines.length === 20 && lines.every((v) => v > 0.9), 'gridLineStrengths finds the strong subset');
}
{
  const x = Float64Array.from({ length: 200 }, (_, i) => (i === 100 ? 10 : 0.1));
  const r = rectify(x, 20);
  ok(r[100] > 0 && r[10] === 0, 'rectify keeps peaks and floors the baseline');
  const nrm = normalise(Float64Array.from([0, 1, 2, 8, 100]));
  ok(nrm.every((v) => v >= 0 && v <= 1), 'normalise stays inside 0..1');
}

rmSync(dir, { recursive: true, force: true });
console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) { console.log(`${failures} FAILING`); process.exit(1); }
