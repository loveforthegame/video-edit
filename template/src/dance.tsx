/**
 * Beat-driven effect primitives for music mode.
 *
 * `scenes.tsx` puts information ON the footage — cards that explain what the
 * narration is saying. These do something different: they act ON the footage
 * itself, on the beat. A dance reel is usually one continuous take you do not
 * want to cut, so the edit is carried by punch, shake, trails, stutter and
 * grade rather than by cutting between clips.
 *
 * Every effect is a pure function of the frame, driven by a BeatGrid from
 * `engine/beatgrid.mjs`. Nothing is stateful, so frames stay independently
 * renderable.
 *
 * COST NOTE — anything that duplicates its children duplicates the video decode
 * behind them. `FootageFX` trails, `RGBSplit` and `GlitchSlice` all do. Keep
 * trail counts low and wrap the loud ones in short `<Sequence>` bursts on the
 * accents rather than leaving them on for the whole track.
 */
import { useId } from 'react';
import {
  AbsoluteFill,
  Freeze,
  OffthreadVideo,
  Sequence,
  interpolate,
  random,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import type { Band, BeatGrid } from './beats';
import { barPhase, bandAt, beatAt, envAt, intensityAt, onsetPulse, pulse } from './beats';
import type { DanceLook } from './dance-presets';
import { fadeOut } from './components/Card';
import { dampedSettle } from './lib/helpers/motion';

const fill: React.CSSProperties = { width: '100%', height: '100%', objectFit: 'cover' };

/**
 * Smooth value noise in [-1, 1]. Per-frame `random()` alone is white noise and
 * reads as digital jitter; interpolating between samples gives the low-frequency
 * wander that actually looks like a handheld camera.
 */
export const noise = (seed: string, x: number): number => {
  const i = Math.floor(x);
  const t = x - i;
  const a = random(`${seed}-${i}`) * 2 - 1;
  const b = random(`${seed}-${i + 1}`) * 2 - 1;
  return a + (b - a) * (t * t * (3 - 2 * t));
};

// ---------- FootageFX: the footage layer, moving on the beat ----------

export const FootageFX: React.FC<{
  src: string;
  grid: BeatGrid;
  look: DanceLook;
  /** overall effect strength; defaults to the arrangement section's intensity */
  intensity?: number;
  /** which part of the spectrum drives the punch — 'low' follows the kick */
  driver?: Band;
  punch?: boolean;
  shake?: boolean;
  trails?: boolean;
  grade?: boolean;
  /** keep the original audio; off by default because music mode adds its own */
  audio?: boolean;
  children?: React.ReactNode;
}> = ({
  src, grid, look, intensity, driver = 'low',
  punch = true, shake = true, trails = true, grade = true, audio = false, children,
}) => {
  const frame = useCurrentFrame();
  const amt = intensity ?? intensityAt(grid, frame);
  const hit = pulse(grid, frame, { decay: look.punchDecay, weightBy: driver });

  const scale = 1 + (punch ? look.punch * hit * amt : 0);
  const sx = shake ? noise('fx-x', frame / 2.5) * look.shake * hit * amt : 0;
  const sy = shake ? noise('fx-y', frame / 2.5) * look.shake * hit * amt : 0;
  const rot = shake ? noise('fx-r', frame / 3) * look.wobble * hit * amt : 0;

  const echoes = trails && look.trail.count > 0 ? look.trail.count : 0;

  return (
    <AbsoluteFill style={{ background: '#000', overflow: 'hidden' }}>
      <AbsoluteFill
        style={{
          transform: `translate(${sx}px, ${sy}px) rotate(${rot}deg) scale(${scale})`,
          filter: grade ? look.grade : undefined,
        }}
      >
        <OffthreadVideo src={src} muted={!audio} style={fill} />

        {/* Echo trails. A trailing layer is the same footage sampled earlier,
            which `<Sequence from={n}>` gives for free: the child's timeline is
            shifted back by n frames. They sit in front of the main layer and
            blend, since behind it they would simply be hidden. */}
        {Array.from({ length: echoes }).map((_, i) => (
          <Sequence key={i} from={(i + 1) * look.trail.gap} name={`trail-${i + 1}`}>
            <AbsoluteFill
              style={{
                opacity: look.trail.opacity * (1 - i / (echoes + 1)) * amt,
                mixBlendMode: look.trail.blend,
              }}
            >
              <OffthreadVideo src={src} muted style={fill} />
            </AbsoluteFill>
          </Sequence>
        ))}
      </AbsoluteFill>
      {children}
    </AbsoluteFill>
  );
};

// ---------- Time: stutter and speed ramps ----------

/**
 * Hold the picture for a few frames on each beat, then let it snap back. The
 * classic on-beat stutter. `<Freeze>` pins the child's frame, so this costs
 * nothing extra — it is the same single video layer.
 */
export const BeatStutter: React.FC<{
  grid: BeatGrid;
  /** frames to hold (2-5 reads as a stutter, more reads as a freeze frame) */
  hold?: number;
  /** stutter every nth beat — 4 means once a bar */
  every?: number;
  children: React.ReactNode;
}> = ({ grid, hold = 3, every = 1, children }) => {
  const frame = useCurrentFrame();
  const { beat, since } = beatAt(grid, frame);
  if (beat && beat.i % every === 0 && since >= 0 && since < hold) {
    return <Freeze frame={beat.frame}>{children}</Freeze>;
  }
  return <>{children}</>;
};

export type Ramp = {
  from: number;
  to: number;
  /** playback rate: 0.4 is slow motion, 2 is double speed */
  rate: number;
};

/**
 * Build a source-frame mapping for `TimeWarp` from a list of ramps. Frames
 * outside every ramp play at 1x.
 *
 * Slowing a passage down pushes everything after it later, so the tail of the
 * footage runs off the end of the composition. Either balance a slow-mo with a
 * matching speed-up, or lengthen the composition.
 */
export const rampTimeline = (totalFrames: number, ramps: Ramp[] = []) => {
  const cum = new Float64Array(totalFrames + 2);
  for (let f = 0; f <= totalFrames; f++) {
    const r = ramps.find((x) => f >= x.from && f < x.to);
    cum[f + 1] = cum[f] + (r ? r.rate : 1);
  }
  return (f: number) => cum[Math.max(0, Math.min(totalFrames + 1, Math.round(f)))];
};

/**
 * Arbitrary time remapping — slow motion, speed-ups, ramps into a hit.
 *
 * `<Sequence from={frame - source}>` makes the child render at exactly
 * `source`, and recomputing `from` every frame is what turns a fixed offset
 * into a variable rate. VIDEO ONLY: never put the music track inside this, or
 * the audio gets remapped along with the picture.
 */
export const TimeWarp: React.FC<{
  sourceFrameAt: (frame: number) => number;
  children: React.ReactNode;
}> = ({ sourceFrameAt, children }) => {
  const frame = useCurrentFrame();
  const source = Math.max(0, Math.round(sourceFrameAt(frame)));
  return (
    <Sequence from={frame - source} layout="none" name="timewarp">
      {children}
    </Sequence>
  );
};

// ---------- Chromatic and glitch wrappers ----------

/**
 * Chromatic aberration: the three channels pulled apart and screened back
 * together. Renders its children three times, so drive `amount` from a pulse
 * and keep it inside a short burst on the accents.
 */
export const RGBSplit: React.FC<{
  amount: number;
  /** direction of the split in degrees */
  angle?: number;
  children: React.ReactNode;
}> = ({ amount, angle = 0, children }) => {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  if (amount <= 0.01) return <>{children}</>;
  const rad = (angle * Math.PI) / 180;
  const dx = Math.cos(rad) * amount;
  const dy = Math.sin(rad) * amount;
  const chan = (r: string) => (
    <filter id={r} colorInterpolationFilters="sRGB" key={r}>
      <feColorMatrix
        type="matrix"
        values={
          r.startsWith('dfxR')
            ? '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0'
            : r.startsWith('dfxG')
              ? '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0'
              : '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0'
        }
      />
    </filter>
  );
  return (
    <AbsoluteFill>
      <svg width={0} height={0} style={{ position: 'absolute' }} aria-hidden>
        <defs>{[`dfxR${uid}`, `dfxG${uid}`, `dfxB${uid}`].map(chan)}</defs>
      </svg>
      <AbsoluteFill style={{ filter: `url(#dfxR${uid})`, transform: `translate(${dx}px, ${dy}px)` }}>
        {children}
      </AbsoluteFill>
      <AbsoluteFill style={{ filter: `url(#dfxG${uid})`, mixBlendMode: 'screen' }}>
        {children}
      </AbsoluteFill>
      <AbsoluteFill
        style={{ filter: `url(#dfxB${uid})`, transform: `translate(${-dx}px, ${-dy}px)`, mixBlendMode: 'screen' }}
      >
        {children}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/**
 * Horizontal bands of the picture shoved sideways. `seed` should change per hit
 * (pass the beat index) so consecutive glitches do not repeat the same pattern.
 * Returns children untouched at amount 0, so it is free when idle.
 */
export const GlitchSlice: React.FC<{
  amount: number;
  slices?: number;
  seed?: string | number;
  children: React.ReactNode;
}> = ({ amount, slices = 6, seed = 0, children }) => {
  if (amount <= 0.5) return <>{children}</>;
  return (
    <AbsoluteFill>
      {Array.from({ length: slices }).map((_, i) => {
        const top = (i / slices) * 100;
        const bottom = 100 - ((i + 1) / slices) * 100;
        const dx = (random(`glitch-${seed}-${i}`) - 0.5) * 2 * amount;
        return (
          <AbsoluteFill
            key={i}
            style={{ clipPath: `inset(${top}% 0% ${bottom}% 0%)`, transform: `translateX(${dx}px)` }}
          >
            {children}
          </AbsoluteFill>
        );
      })}
    </AbsoluteFill>
  );
};

// ---------- Full-frame overlays (cheap: no extra video decode) ----------

/** A colour wash on the beat. `on` picks what triggers it. */
export const Flash: React.FC<{
  grid: BeatGrid;
  look: DanceLook;
  on?: 'beat' | 'downbeat' | 'onset';
  decay?: number;
  intensity?: number;
  blend?: 'screen' | 'overlay' | 'normal';
}> = ({ grid, look, on = 'beat', decay = 3, intensity = 1, blend = 'screen' }) => {
  const frame = useCurrentFrame();
  const v = on === 'onset'
    ? onsetPulse(grid, frame, decay)
    : pulse(grid, frame, { decay, downbeatsOnly: on === 'downbeat' });
  const o = look.flash * v * intensity * intensityAt(grid, frame);
  if (o <= 0.002) return null;
  return <AbsoluteFill style={{ background: look.flashColor, opacity: o, mixBlendMode: blend }} />;
};

/** Hard on/off flicker locked to a subdivision. Use in short bursts. */
export const Strobe: React.FC<{
  grid: BeatGrid;
  subdivide?: number;
  /** fraction of each step the strobe is lit */
  duty?: number;
  color?: string;
  opacity?: number;
}> = ({ grid, subdivide = 4, duty = 0.5, color = '#FFFFFF', opacity = 0.5 }) => {
  const frame = useCurrentFrame();
  const step = grid.beatPeriodFrames / subdivide;
  if (step <= 0) return null;
  const first = grid.offset * grid.fps;
  const phase = (((frame - first) % step) + step) % step;
  if (phase >= step * duty) return null;
  return <AbsoluteFill style={{ background: color, opacity, mixBlendMode: 'screen' }} />;
};

/** Edge darkening that breathes with the track. */
export const Vignette: React.FC<{ grid?: BeatGrid; look: DanceLook; pump?: number }> = ({
  grid, look, pump = 0.25,
}) => {
  const frame = useCurrentFrame();
  const e = grid ? envAt(grid, frame, 'low') : 0;
  const a = look.vignette * (1 - pump * e);
  if (a <= 0.002) return null;
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 45%, rgba(0,0,0,${a}) 100%)`,
      }}
    />
  );
};

/**
 * Film grain. The one genuinely expensive overlay: `feTurbulence` is recomputed
 * every frame at full resolution. Leave it at 0 unless the look calls for it.
 */
export const Grain: React.FC<{ look: DanceLook; scale?: number }> = ({ look, scale = 0.8 }) => {
  const frame = useCurrentFrame();
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  if (look.grain <= 0) return null;
  return (
    <AbsoluteFill style={{ opacity: look.grain, mixBlendMode: 'overlay', pointerEvents: 'none' }}>
      <svg width="100%" height="100%" aria-hidden>
        <filter id={`grain${uid}`}>
          {/* seed advances every other frame: 60fps grain shimmers too fast to read */}
          <feTurbulence type="fractalNoise" baseFrequency={scale} numOctaves={1} seed={Math.floor(frame / 2)} />
        </filter>
        <rect width="100%" height="100%" filter={`url(#grain${uid})`} />
      </svg>
    </AbsoluteFill>
  );
};

/** A soft coloured sweep across the frame, once per bar. */
export const LightLeak: React.FC<{ grid: BeatGrid; look: DanceLook; opacity?: number }> = ({
  grid, look, opacity = 0.3,
}) => {
  const frame = useCurrentFrame();
  const x = barPhase(grid, frame) * 140 - 20;
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at ${x}% 30%, ${look.accent}CC 0%, rgba(0,0,0,0) 42%)`,
        opacity: opacity * (0.5 + 0.5 * envAt(grid, frame, 'high')),
        mixBlendMode: 'screen',
      }}
    />
  );
};

// ---------- Audio-reactive graphics ----------

/** Spectrum bars from the grid's band envelopes. */
export const BeatBars: React.FC<{
  grid: BeatGrid;
  look: DanceLook;
  count?: number;
  maxHeight?: number;
  align?: 'bottom' | 'top';
  /** distance from that edge, in px */
  inset?: number;
  barWidth?: number;
  gap?: number;
  opacity?: number;
}> = ({ grid, look, count, maxHeight = 220, align = 'bottom', inset = 470, barWidth = 16, gap = 10, opacity = 0.85 }) => {
  const frame = useCurrentFrame();
  const n = Math.min(count ?? grid.bands.length, grid.bands.length);
  if (!n) return null;
  // The row lives in an inner absolute div rather than on the AbsoluteFill:
  // AbsoluteFill pins all four edges and lays out as a column, so styling it
  // directly stacks the bars vertically and fights `height`.
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: align === 'top' ? inset : undefined,
          bottom: align === 'bottom' ? inset : undefined,
          height: maxHeight,
          display: 'flex',
          flexDirection: 'row',
          alignItems: align === 'top' ? 'flex-start' : 'flex-end',
          justifyContent: 'center',
          gap,
          opacity,
        }}
      >
        {Array.from({ length: n }).map((_, i) => (
          <div
            key={i}
            style={{
              width: barWidth,
              height: Math.max(6, bandAt(grid, frame, i) * maxHeight),
              borderRadius: barWidth / 2,
              background: i % 2 ? look.accent2 : look.accent,
            }}
          />
        ))}
      </div>
    </AbsoluteFill>
  );
};

/** A ring that kicks outward on every beat and fades as it grows. */
export const BeatRing: React.FC<{
  grid: BeatGrid;
  look: DanceLook;
  size?: number;
  x?: string;
  y?: string;
  thickness?: number;
  decay?: number;
}> = ({ grid, look, size = 460, x = '50%', y = '42%', thickness = 6, decay = 9 }) => {
  const frame = useCurrentFrame();
  const p = pulse(grid, frame, { decay, weightBy: 'low' });
  if (p <= 0.01) return null;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          left: x,
          top: y,
          width: size,
          height: size,
          marginLeft: -size / 2,
          marginTop: -size / 2,
          borderRadius: '50%',
          border: `${thickness}px solid ${look.accent}`,
          transform: `scale(${0.7 + (1 - p) * 0.75})`,
          opacity: p * 0.8,
        }}
      />
    </AbsoluteFill>
  );
};

/**
 * Big type that lands on a hit and recoils. Place it inside a `<Sequence>` the
 * way the scenes in `scenes.tsx` are placed; it animates from its local frame 0.
 */
export const LyricHit: React.FC<{
  look: DanceLook;
  dur: number;
  text: string;
  size?: number;
  y?: number;
  /** chromatic split on the entrance */
  split?: boolean;
  align?: 'center' | 'left' | 'right';
}> = ({ look, dur, text, size = 118, y = 520, split = true, align = 'center' }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 11, stiffness: 200 }, durationInFrames: 26 });
  const recoil = dampedSettle(frame, 0.1, 0.2) * 14;
  const out = fadeOut(frame, dur - 16);
  const body = (
    <AbsoluteFill style={{ justifyContent: 'flex-start', alignItems: 'center' }}>
      <div
        style={{
          position: 'absolute',
          top: y + recoil,
          left: 60,
          right: 60,
          textAlign: align,
          fontFamily: look.font,
          fontWeight: 900,
          fontSize: size,
          lineHeight: 0.96,
          letterSpacing: -2,
          color: look.ink,
          textTransform: 'uppercase',
          textShadow: `0 10px 40px rgba(0,0,0,0.55), 0 0 2px ${look.accent}`,
          transform: `scale(${0.72 + s * 0.28})`,
          opacity: s * out,
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
  if (!split) return body;
  // the split is strongest on the entrance frame and gone within ~10 frames
  const amount = interpolate(frame, [0, 10], [look.split, 0], { extrapolateRight: 'clamp' });
  return <RGBSplit amount={amount}>{body}</RGBSplit>;
};

/** Thin progress bar along the bottom — cheap, and it reads as "reel". */
export const BeatProgress: React.FC<{ grid: BeatGrid; look: DanceLook; height?: number }> = ({
  grid, look, height = 6,
}) => {
  const frame = useCurrentFrame();
  const w = Math.min(100, (frame / Math.max(1, grid.durationInFrames)) * 100);
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end' }}>
      <div style={{ height, width: `${w}%`, background: look.accent, opacity: 0.9 }} />
    </AbsoluteFill>
  );
};
