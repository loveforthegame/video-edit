# 🎬 video-edit — footage in, finished edit out

A single Claude Code plugin. Give it raw footage and a one-line brief, get back a rendered video. It runs in one of two modes, picked automatically from the footage:

- **Narration mode** — someone is talking. Contextual motion graphics play over the footage: glassmorphism cards, hand-built animated SVGs (self-drawing checkmarks, flying envelopes, toggles, cursors, sparkles), punch-in energy, and SFX — all synced to what the narration is actually saying.
- **Music mode** — the footage is carried by a track (a dance reel, a music video). It detects the tempo and beat grid from the audio, then drives effects on the footage itself: zoom punch on the kick, camera shake, echo trails, on-beat stutter, speed ramps and slow motion, chromatic split, slice glitch, strobe, and audio-reactive graphics — all locked to the beat.

## Install (one step)

In Claude Code:

```
/plugin install github:loveforthegame/video-edit
```

Or clone it straight into your skills folder:

```bash
git clone https://github.com/loveforthegame/video-edit.git ~/.claude/skills/video-edit
```

That's it. **No other setup.** The skill checks and installs its own prerequisites the first time it runs (Node.js, ffmpeg, whisper.cpp, the whisper model, uv). No API keys needed — transcription runs locally via whisper.cpp.

## Use

```
/video-edit C:\path\to\footage.mp4
/video-edit ./raw.mp4 make this a launch ad for our app, CTA is "start free trial", brand is dark blue
/video-edit ./dance.mp4 cut this to the beat, hype look
```

The skill will:
1. Ask at most 2 short questions (your brief if you didn't give one, and a preset/look pick with a suggestion)
2. Watch the footage + transcribe it, then show you ONE plan card to approve
3. **Narration mode:** rough-cut retakes/dead air if the footage needs it (engine adapted from Manthan Patel's open-source rough-cut engine — runs fully local)
   **Music mode:** detect BPM, downbeats, onsets and energy sections, and skip the speech rough cut entirely — it would damage a continuous take
4. Build the graphics in Remotion, QA its own frames, render, and hand you the file

## Presets

| Preset | Look | Best for |
|---|---|---|
| `glass` | frosted translucent cards, soft springs | bright UGC / SaaS ads (default) |
| `dark-hud` | dark panels, neon edges | tech, gaming, dev tools |
| `neo-brutal` | solid white, thick black outlines, hard shadows | loud punchy UGC |
| `minimal` | near-opaque white, hairline borders, serif | premium, fashion, lifestyle |

All four drive the same scene system: notification stacks, brand cards, toggles, task→email automations, click-to-approve panels, pulsing CTAs — plus custom scenes written per video.

## Looks (music mode)

| Look | Feel | Best for |
|---|---|---|
| `hype` | hard punch, fast trails, high contrast | dance reels, hype edits (default) |
| `neon` | cool grade, glowing trails, heavy chromatic split | club, night, electronic |
| `film` | soft contrast, grain, restrained motion | choreography pieces, performance |
| `clean` | almost no grade, tight punch, no trails | when the dancing carries it |

Effects available on the beat: `FootageFX` (punch / shake / wobble / grade / echo trails), `BeatStutter`, `TimeWarp` + `rampTimeline` (speed ramps and slow motion), `Flash`, `Strobe`, `RGBSplit`, `GlitchSlice`, `Vignette`, `Grain`, `LightLeak`, `BeatBars`, `BeatRing`, `LyricHit`, `BeatProgress`.

## Beat detection

`engine/beatgrid.mjs` is self-contained: WAV parsing, FFT, spectral flux, tempo estimation and peak picking are all implemented against the Node stdlib. **No npm install, no pip, no model download, no API key**, and `.wav` input needs no ffmpeg either.

```bash
node engine/beatgrid.mjs track.mp3 --fps 60 --out beats.json
```

It emits BPM, a phase-locked beat grid with bars and downbeats, detected onsets, per-video-frame energy envelopes (kick / body / hats), log-spaced band envelopes for visualizers, and energy sections with the drop flagged. It also publishes a `confidence` score — how well the track's transients actually agree with the grid — so a track with no clear pulse says so instead of quietly drifting.

Tempo estimation handles the two failure modes that matter: it tracks the kick-and-snare body rather than the full spectrum (hi-hats on the eighths otherwise look exactly like the beat, and the grid comes out at double tempo), and it sub-samples each candidate period before comparing them (a 1% period error walks the grid off the beat within ~20 bars).

```bash
node engine/test/beatgrid.test.mjs   # 77 checks, no fixtures or deps needed
```

The suite synthesises drum patterns at known BPM and offset and scores the detector against ground truth — tempo within 0.05% and phase within 12ms across 120/128/90/174/100/140 BPM, including the half-tempo and tatum traps — plus a legato track with no transients, forced-BPM overrides, stereo float32 parsing, and unit tests for the FFT and WAV reader.

## What's inside

```
video-edit/
├── .claude-plugin/plugin.json
├── skills/video-edit/
│   ├── SKILL.md                 # the pipeline the agent follows (narration mode)
│   └── DANCE.md                 # music mode: beat grid in, beat-locked effects out
├── engine/
│   ├── roughcut.py              # local rough-cut engine (waveform + whisper, no API key)
│   ├── beatgrid.mjs             # local beat/tempo/section detection (zero dependencies)
│   └── test/beatgrid.test.mjs   # ground-truth regression suite for the above
└── template/                    # Remotion project
    ├── src/scenes.tsx           # narration overlays (cards, animated SVG icons)
    ├── src/dance.tsx            # music-mode effects (punch, trails, stutter, warp, glitch)
    ├── src/beats.ts             # pure helpers for reading a beat grid per frame
    ├── src/presets.ts           # 4 card presets     · dance-presets.ts — 4 dance looks
    └── src/Timeline.example.tsx # worked narration build · Dance.example.tsx — worked music build
```

SFX are optional and resolved at runtime from a local library if you have one (`sfx/` next to your footage). Renders work fine without them.

## Credits

- Rough-cut engine adapted from [leadgenman-video-skills](https://github.com/manthanpatelll/leadgenman-video-skills) by Manthan Patel (MIT). Changes: portable ffmpeg path, local whisper.cpp fallback (no OpenAI key), env-tunable thresholds, fixed packaging.
- `DigitRoll` component and motion helpers from [video-shotcraft](https://github.com/vincentwei1021/video-shotcraft) (Apache-2.0).

See `THIRD_PARTY_NOTICES.md`.

## License

MIT
