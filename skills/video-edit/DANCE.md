# Music mode — dance reels and beat-cut edits

Read this instead of steps 4-7 of `SKILL.md` when the footage is carried by music
rather than by narration. Steps 0, 1 and 8 are unchanged.

The difference is not cosmetic. Narration mode asks "what is being said, and what
should appear to illustrate it". Music mode asks "where are the hits, and what
should the picture do on them". A dance reel is usually **one continuous take you
do not want to cut** — the edit is carried by punch, shake, trails, stutter,
speed and grade, all locked to the beat.

## Step M0 — Extra dependencies: none

`engine/beatgrid.mjs` is plain Node with no packages. It reads `.wav` directly,
and shells out to ffmpeg only for other containers. whisper is **not** needed
unless the user wants the lyrics on screen.

## Step M1 — Where is the music?

Three cases, and they change what you feed the analyser:

| Case | Analyse | Audio in the render |
|---|---|---|
| Clip already has the track on it | the clip itself | keep the original: `<FootageFX audio>` |
| User supplied a separate track | that file | `<Audio src={staticFile('music.mp3')} />`, footage muted |
| Clip has only room noise | ask for the track — do not guess | as above |

Never analyse one file and render another: a beat grid from a different master,
or from a version trimmed differently, drifts and every effect lands late.

## Step M2 — Build the beat grid

```bash
node <plugin>/engine/beatgrid.mjs "<audio-or-video>" --fps <footage fps> --out <work>/src/beats.json
```

It prints a summary to stderr — read it, it is the input to your checkpoint:

- **BPM and first downbeat.** Sanity-check the BPM against the genre. If the
  track is obviously 174 and it says 87, rerun with `--bpm 174`.
- **Confidence.** How well the track's transients agree with the grid.
  Above ~0.65 is solid. **Below ~0.55 means there is no clear percussive pulse**
  (ambient, live instrumentation, heavy sidechaining) — get the tempo from the
  user or the track metadata and pass `--bpm`, rather than shipping a grid that
  drifts.
- **Sections.** `low`/`mid`/`high` energy blocks, with `drop: true` where the
  track jumps up a level. This is your effect budget map.

Useful flags: `--bpm`, `--offset`, `--beats-per-bar 3` for waltz-time,
`--bands 0` if you are not using a visualizer, `--debug` to see how the octave
was chosen.

Verify before continuing: `beatFrames` should be evenly spaced, and the count
should be roughly `duration * bpm / 60`.

## Step M3 — The one checkpoint

Same rule as narration mode: ONE card, then stop for approval.

- What the footage is, and what the track is: BPM, bars, where the drop lands.
- **Cut plan: no cut.** Say so explicitly. See Step M4.
- Chosen look + accent colours, and the effect plan *per section* — not per
  beat. "Bars 1-8 punch and trails only; drop at bar 9 adds glitch and strobe;
  bars 17-24 slow-mo ramp."
- What will not be touched: the choreography (never crop the dancer out of
  frame), the music (never time-stretched).

## Step M4 — Do not run the speech rough cut

`engine/roughcut.py` finds speech chunks by RMS silence and detects retakes by
transcript. On a continuous music track the RMS never drops, so it either keeps
everything or cuts on musical rests. **Skip it.** Cutting a dance take is a
choreography decision, not an automatic one.

If the user does want cuts on the beat, cut with `<Sequence>` boundaries taken
from `everyNthBeat(grid, 4)` or `accents(grid)` — on the grid, deliberately, and
only where they asked.

## Step M5 — Beat map

There is no transcript to map. Work down from the arrangement instead, and let
the helpers in `template/src/beats.ts` do the arithmetic:

- `bars(grid, 8, 4)` — spread into `<Sequence {...bars(grid, 8, 4)}>` for "four
  bars starting at bar 8". Never hand-count frames.
- `accents(grid, 6)` — the loudest beats. Where the big hits belong.
- `drops(grid)` — where the track opens up.
- `intensityAt(grid, frame)` — 0.45 in quiet sections, 1 at a drop. `FootageFX`
  applies this automatically; pass `intensity` only to override it.
- `pulse(grid, frame, {...})` — the workhorse. Multiply anything by it.
- `envAt` / `bandAt` — continuous energy, for motion that never fully stops.

Assign **one idea per section**, not per beat. An effect on every beat for 30
seconds reads as noise and hides the dancing.

## Step M6 — Build the overlay project

As narration mode, plus:

1. Write `beats.json` into `<work>/src/` (the `--out` above). The template ships a
   placeholder grid so it typechecks before you run anything — **check that
   `placeholder` is gone and `source` names your track**, or the whole edit is
   timed to a 120bpm sample loop.
2. Copy footage to `public/footage.mp4`; the music to `public/`.
3. `Root.tsx`: size, fps and `durationInFrames` must match the footage. Cross-check
   against `grid.durationInFrames`.
4. Write `src/Timeline.tsx` from **`Dance.example.tsx`** (not `Timeline.example.tsx`),
   composing from `dance.tsx`:

| Primitive | What it does | Cost |
|---|---|---|
| `FootageFX` | the footage layer: punch, shake, wobble, grade, echo trails | 1 decode + 1 per trail |
| `BeatStutter` | holds the picture a few frames on the beat (`<Freeze>`) | free |
| `TimeWarp` + `rampTimeline` | real speed ramps and slow motion | free |
| `Flash`, `Strobe`, `Vignette`, `LightLeak`, `BeatProgress` | full-frame overlays | cheap |
| `BeatBars`, `BeatRing` | audio-reactive graphics from the band envelopes | cheap |
| `LyricHit` | kinetic type landing on a hit, with chromatic entry | cheap |
| `RGBSplit`, `GlitchSlice` | chromatic split, sliced displacement | **3x / Nx decode** |
| `Grain` | film noise | expensive (`feTurbulence` per frame) |

### Hard rules

- **The dancer is the subject.** Narration mode's "overlays live in the top 35%"
  does not apply — the body uses the whole frame. Keep the centre column clear,
  work in the corners and margins, and never crop or cover the feet: footwork is
  usually the point.
- **Never cover the face on a hit.** A flash is fine; a card over the head is not.
- **The loud effects go on the accents only.** `RGBSplit`, `GlitchSlice` and
  `Strobe` belong in `<Sequence durationInFrames={6..8}>` bursts on
  `accents(grid)` or `drops(grid)`. Left on for the whole track they triple the
  render time and flatten the impact.
- **Do not stack `Flash` and `Strobe` on the same frames** — together they wash
  the frame out to white and the dancer disappears.
- **`TimeWarp` is video only.** Anything inside it gets time-remapped, so the
  music track must sit outside. Ramps should roughly balance (a slow-mo followed
  by a speed-up) or the tail of the footage runs past the end of the composition.
- **Original audio stays untouched.** SFX mix on top at volume <= 0.45, and under
  a music track they usually want <= 0.35.
- IG safe zones still apply: keep text out of the top 280px and bottom 422px at
  1080x1920.
- Something must always be moving, but the *dancer* is that something. If the
  footage is doing the work, an idle bar with only grade and vignette is correct.

## Step M7 — Render + QA (mandatory, max 2 fix loops)

```bash
npx remotion render src/index.ts Main <out>.mp4 --codec h264 --crf 17
```

Then extract frames and **actually view them**. Pick the frames from the grid,
not at random — a still halfway between beats shows nothing:

- a `downbeatFrames` frame, and that frame + 3 (is the punch visible? does it recover?)
- an `accents()` frame + 1 (is the chromatic hit landing, or just mush?)
- a `drops()` frame + 2 (glitch and strobe together — is the dancer still readable?)
- one frame inside a slow-mo ramp (is it smooth, or stepping?)
- the last frame (did a ramp run the footage off the end into black?)

Check specifically: the dancer never leaves frame during a punch (`look.punch`
too high crops the feet), text is inside the safe zones, and no frame is washed
to white.

## Step M8 — Deliver

As `SKILL.md`. Also report BPM, detected confidence, bar count, and which
effects were placed where — the user's next note is almost always "more/less on
the drop", and they need the vocabulary to say it.
