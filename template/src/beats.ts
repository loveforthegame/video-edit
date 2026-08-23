/**
 * Reading a beat grid inside Remotion.
 *
 * `engine/beatgrid.mjs` writes the JSON this module consumes. Every helper here
 * is a pure function of the frame number, exactly like `lib/helpers/motion.ts`:
 * nothing accumulates across rendered frames, so any frame can be rendered on
 * its own and the render stays deterministic across machines.
 */

export type Beat = {
  i: number;
  t: number;
  frame: number;
  strength: number;
  beatInBar: number;
  bar: number;
  downbeat: boolean;
};

export type Onset = { t: number; frame: number; strength: number };

export type SectionLevel = 'low' | 'mid' | 'high';

export type Section = {
  start: number;
  end: number;
  startFrame: number;
  endFrame: number;
  level: SectionLevel;
  energy: number;
  /** true where the track jumps up into this section — the drop */
  drop: boolean;
};

/** Which slice of the spectrum drives an effect. */
export type Band = 'all' | 'low' | 'mid' | 'high';

export type BeatGrid = {
  source: string;
  fps: number;
  duration: number;
  durationInFrames: number;
  bpm: number;
  beatPeriod: number;
  beatPeriodFrames: number;
  offset: number;
  beatsPerBar: number;
  /** 0..1 agreement between the track's transients and this grid */
  confidence: number;
  beats: Beat[];
  beatFrames: number[];
  downbeatFrames: number[];
  onsets: Onset[];
  sections: Section[];
  envelope: Record<Band, number[]>;
  bands: number[][];
};

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

/** Last index whose value is <= x, or -1. Assumes a sorted array. */
const floorIndex = (sorted: number[], x: number): number => {
  let lo = 0;
  let hi = sorted.length - 1;
  let out = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= x) { out = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return out;
};

/** Sample a per-frame array with clamped ends. */
const at = (arr: number[] | undefined, frame: number): number => {
  if (!arr || !arr.length) return 0;
  return arr[Math.min(arr.length - 1, Math.max(0, Math.round(frame)))] ?? 0;
};

/** Onset-flux envelope at this frame, 0..1. Continuous — good for idle motion. */
export const envAt = (grid: BeatGrid, frame: number, band: Band = 'all'): number =>
  clamp(at(grid.envelope?.[band], frame));

/** One log-spaced band of the spectrum at this frame, 0..1. For visualizers. */
export const bandAt = (grid: BeatGrid, frame: number, index: number): number =>
  clamp(at(grid.bands?.[index], frame));

/** Where we are in the bar, 0..1. Useful for effects that breathe per bar. */
export const barPhase = (grid: BeatGrid, frame: number): number => {
  const bar = grid.beatPeriodFrames * grid.beatsPerBar;
  if (bar <= 0) return 0;
  const first = grid.offset * grid.fps;
  return ((((frame - first) % bar) + bar) % bar) / bar;
};

export type BeatInfo = {
  /** the beat we are on or just past, null before the first one */
  beat: Beat | null;
  /** frames since that beat landed */
  since: number;
  /** frames until the next one */
  until: number;
  /** 0 on the beat, approaching 1 just before the next */
  phase: number;
};

/** Which beat the playhead is on. */
export const beatAt = (grid: BeatGrid, frame: number): BeatInfo => {
  const i = floorIndex(grid.beatFrames, frame);
  const period = grid.beatPeriodFrames || 1;
  if (i < 0) {
    const next = grid.beatFrames[0] ?? frame;
    return { beat: null, since: Infinity, until: next - frame, phase: 0 };
  }
  const beat = grid.beats[i] ?? null;
  const since = frame - grid.beatFrames[i];
  const nextFrame = grid.beatFrames[i + 1] ?? grid.beatFrames[i] + period;
  return { beat, since, until: nextFrame - frame, phase: clamp(since / period) };
};

export type PulseOptions = {
  /** exponential decay in frames — smaller is snappier (default 5) */
  decay?: number;
  /** fire this many times per beat: 1 beats, 2 eighths, 4 sixteenths */
  subdivide?: number;
  /** only fire on beat one of the bar */
  downbeatsOnly?: boolean;
  /** scale the spike by this band's energy at the hit */
  weightBy?: Band;
  /** ignore beats quieter than this (0..1) */
  minStrength?: number;
  /** frames of rise before the peak — 0 is an instant attack */
  attack?: number;
};

/**
 * The workhorse: a 0..1 spike on every beat, decaying away before the next.
 * Multiply anything by this — scale, blur radius, opacity, shake amplitude —
 * and it lands on the music.
 *
 * Subdivisions are computed from tempo and phase rather than read from the beat
 * list, so `subdivide: 4` keeps working past the end of the detected beats.
 */
export const pulse = (grid: BeatGrid, frame: number, o: PulseOptions = {}): number => {
  const { decay = 5, subdivide = 1, downbeatsOnly = false, weightBy, minStrength = 0, attack = 0 } = o;
  const period = grid.beatPeriodFrames;
  if (!period || period <= 0) return 0;

  let hit: number;
  if (downbeatsOnly) {
    const i = floorIndex(grid.downbeatFrames, frame);
    if (i < 0) return 0;
    hit = grid.downbeatFrames[i];
  } else if (subdivide > 1) {
    const step = period / subdivide;
    const first = grid.offset * grid.fps;
    hit = first + Math.floor((frame - first) / step) * step;
    if (hit > frame) hit -= step;
  } else {
    const i = floorIndex(grid.beatFrames, frame);
    if (i < 0) return 0;
    hit = grid.beatFrames[i];
  }

  if (minStrength > 0 && subdivide <= 1) {
    const b = grid.beats[floorIndex(grid.beatFrames, frame)];
    if (b && b.strength < minStrength) return 0;
  }

  const since = frame - hit;
  if (since < 0) return 0;
  // rise then fall, so a slow attack reads as a swell instead of a click
  const shape = attack > 0 && since < attack
    ? since / attack
    : Math.exp(-(since - attack) / decay);
  const weight = weightBy ? envAt(grid, hit, weightBy) : 1;
  return clamp(shape * weight);
};

/** A spike on every detected transient, not just on the grid. Follows fills. */
export const onsetPulse = (grid: BeatGrid, frame: number, decay = 4): number => {
  const frames = grid.onsets.map((o) => o.frame);
  const i = floorIndex(frames, frame);
  if (i < 0) return 0;
  const o = grid.onsets[i];
  return clamp(Math.exp(-(frame - o.frame) / decay) * o.strength);
};

/** Which arrangement section the playhead is in. */
export const sectionAt = (grid: BeatGrid, frame: number): Section | null =>
  grid.sections.find((s) => frame >= s.startFrame && frame < s.endFrame) ?? null;

/** How hard to push effects here: quiet section 0.45, drop 1. */
export const intensityAt = (grid: BeatGrid, frame: number): number => {
  const s = sectionAt(grid, frame);
  if (!s) return 0.7;
  const base = s.level === 'high' ? 1 : s.level === 'mid' ? 0.7 : 0.45;
  return s.drop ? Math.min(1, base + 0.15) : base;
};

/** Frame of beat `n` (0-based over the detected grid). */
export const beatFrame = (grid: BeatGrid, n: number): number =>
  grid.beatFrames[Math.max(0, Math.min(grid.beatFrames.length - 1, n))] ?? 0;

/** Frame where bar `n` starts. Bars are numbered from the first downbeat. */
export const barFrame = (grid: BeatGrid, n: number): number =>
  grid.downbeatFrames[Math.max(0, Math.min(grid.downbeatFrames.length - 1, n))] ?? 0;

/**
 * `from`/`durationInFrames` for a `<Sequence>` covering whole bars, so a scene
 * can be written as "bars 4 to 8" instead of hand-counted frame numbers.
 */
export const bars = (grid: BeatGrid, fromBar: number, count = 1) => {
  const from = barFrame(grid, fromBar);
  const end = fromBar + count < grid.downbeatFrames.length
    ? barFrame(grid, fromBar + count)
    : Math.min(grid.durationInFrames, from + grid.beatPeriodFrames * grid.beatsPerBar * count);
  return { from, durationInFrames: Math.max(1, Math.round(end - from)) };
};

/** Every nth beat frame, for scheduling one cut/scene per hit. */
export const everyNthBeat = (grid: BeatGrid, n: number, offset = 0): number[] =>
  grid.beatFrames.filter((_, i) => i >= offset && (i - offset) % n === 0);

/** The loudest beats in the track — where the biggest hits belong. */
export const accents = (grid: BeatGrid, count = 8): number[] =>
  [...grid.beats]
    .sort((a, b) => b.strength - a.strength)
    .slice(0, count)
    .map((b) => b.frame)
    .sort((a, b) => a - b);

/** Frames where the track jumps up a level. */
export const drops = (grid: BeatGrid): number[] =>
  grid.sections.filter((s) => s.drop).map((s) => s.startFrame);
