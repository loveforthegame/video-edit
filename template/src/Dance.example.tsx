// EXAMPLE Timeline for MUSIC MODE — a dance reel (1080x1920 @ 60fps).
//
// Copy to Timeline.tsx and rewrite for YOUR clip. Unlike the narration build in
// Timeline.example.tsx, none of these numbers are hand-counted: they all come
// from beats.json, which `engine/beatgrid.mjs` wrote from the track itself. Say
// "bar 8" and mean it.
//
//   node engine/beatgrid.mjs footage.mp4 --fps 60 --out template/src/beats.json
import { AbsoluteFill, Audio, Sequence, staticFile } from 'remotion';
import type { BeatGrid } from './beats';
import { accents, bars, barFrame, drops } from './beats';
import { hype } from './dance-presets';
import {
  BeatBars, BeatRing, BeatStutter, Flash, FootageFX, GlitchSlice, Grain,
  LightLeak, LyricHit, RGBSplit, Strobe, TimeWarp, Vignette, rampTimeline,
} from './dance';
import grid from './beats.json';

const g = grid as BeatGrid;
const look = hype(); // 'hype' | 'neon' | 'film' | 'clean' — picked at the checkpoint

// Slow the first half of bar 5 to 45%, then run 1.35x to bar 7 so the footage
// lands back in sync with the music. Ramps must roughly balance or the tail of
// the clip runs off the end of the composition.
const warp = rampTimeline(g.durationInFrames, [
  { from: barFrame(g, 4), to: barFrame(g, 5), rate: 0.45 },
  { from: barFrame(g, 5), to: barFrame(g, 7), rate: 1.35 },
]);

export const Timeline: React.FC = () => (
  <AbsoluteFill style={{ background: '#000' }}>
    {/* The footage, punching and shaking on the kick for the whole runtime.
        Overlays go inside so they sit above the grade but below the flashes. */}
    <TimeWarp sourceFrameAt={warp}>
      <BeatStutter grid={g} hold={3} every={8}>
        <FootageFX src={staticFile('footage.mp4')} grid={g} look={look} driver="low">
          <Vignette grid={g} look={look} />
          <LightLeak grid={g} look={look} opacity={0.22} />
        </FootageFX>
      </BeatStutter>
    </TimeWarp>

    {/* Chromatic hits on the loudest beats only — three video decodes each, so
        they stay inside 6-frame bursts rather than running the whole track. */}
    {accents(g, 6).map((f) => (
      <Sequence key={`acc-${f}`} from={f} durationInFrames={6} layout="none">
        <RGBSplit amount={look.split} angle={12}>
          <AbsoluteFill style={{ background: look.accent, opacity: 0.16 }} />
        </RGBSplit>
      </Sequence>
    ))}

    {/* Slice glitch across each drop */}
    {drops(g).map((f, i) => (
      <Sequence key={`drop-${f}`} from={f} durationInFrames={8} layout="none">
        <GlitchSlice amount={26} slices={7} seed={i}>
          <AbsoluteFill style={{ background: `${look.accent2}22` }} />
        </GlitchSlice>
        <Strobe grid={g} subdivide={4} duty={0.35} opacity={0.28} />
      </Sequence>
    ))}

    {/* Cheap full-frame reactions, safe to leave on */}
    <Flash grid={g} look={look} on="downbeat" decay={4} />
    <BeatRing grid={g} look={look} size={520} y="40%" />
    <BeatBars grid={g} look={look} inset={470} maxHeight={190} opacity={0.7} />
    <Grain look={look} />

    {/* Type on the bar lines. `bars(g, 8, 2)` = two bars starting at bar 8. */}
    <Sequence {...bars(g, 2, 2)}>
      <LyricHit look={look} dur={bars(g, 2, 2).durationInFrames} text="drop it" y={430} />
    </Sequence>
    <Sequence {...bars(g, 12, 2)}>
      <LyricHit look={look} dur={bars(g, 12, 2).durationInFrames} text="again" y={430} size={140} />
    </Sequence>

    {/* The music. Kept OUTSIDE TimeWarp — anything inside gets time-remapped. */}
    <Audio src={staticFile('music.mp3')} />

    {/* Optional accent SFX layered over the track; delete lines whose file the
        skill could not resolve. Keep them well under the music. */}
    {drops(g).map((f) => (
      <Sequence key={`sfx-${f}`} from={f} layout="none">
        <Audio src={staticFile('sfx/bass-hit-short.mp3')} volume={0.35} />
      </Sequence>
    ))}
  </AbsoluteFill>
);
