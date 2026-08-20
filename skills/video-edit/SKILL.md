---
name: video-edit
description: "Full video edit pipeline: raw footage in, finished motion-graphics edit out. Invoke as /video-edit with a video file path and optionally a free-text brief. Views the footage, transcribes locally with whisper.cpp (no API key), optionally rough-cuts retakes/dead air, then builds contextual animated overlays (glassmorphism and 3 more presets, hand-built animated SVGs, SFX) in Remotion and renders the final video. Use when the user says /video-edit, wants a video edited, wants motion graphics added to footage, or wants a raw recording turned into a polished reel/ad."
---

# /video-edit — footage to finished edit

One command. The user gives raw footage plus (optionally) a free-text brief. You deliver a rendered video with contextual motion graphics playing OVER the footage.

## Step 0 — Dependencies (handle silently, install what's missing)

Check, and install only what is missing. Never reinstall what exists.

| Tool | Check | Install (Windows) | Install (macOS/Linux) |
|---|---|---|---|
| Node.js 18+ | `node --version` | `winget install OpenJS.NodeJS.LTS` or `scoop install nodejs-lts` | `brew install node` / distro pkg |
| ffmpeg | `ffmpeg -version` | `winget install Gyan.FFmpeg` or `scoop install ffmpeg` | `brew install ffmpeg` / `apt install ffmpeg` |
| whisper-cli | `whisper-cli --help` | `scoop install whisper-cpp` or `winget install ggerganov.whisper.cpp` | `brew install whisper-cpp` |
| uv (only if rough cut needed) | `uv --version` | `winget install astral-sh.uv` | `curl -LsSf https://astral.sh/uv/install.sh \| sh` |
| Whisper model | `~/.cache/whisper-ggml/ggml-base.en.bin` exists | `curl -sL -o ~/.cache/whisper-ggml/ggml-base.en.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin` (create dir first) | same |

Remotion itself needs no global install: the scaffold step runs `npm install` inside the working copy of `template/`.

SFX are optional and not bundled (licensing). Resolution order: a `sfx/` folder next to the footage → `~/.claude/skills/video-shotcraft/assets/audio/` if present → render without SFX (delete the `<Audio>` lines). Never block on missing SFX.

## Step 1 — Intake (1-2 questions maximum)

If the invocation already contains a brief, skip the brief question. Ask at most:

1. **Brief** (free text): "What's this video for, and what should it push the viewer to do?" Accept whatever they write; parse goal, CTA, brand names, tone from it.
2. **Preset** — text descriptions only, with a suggestion based on the footage (bright footage → glass; dark/tech → dark-hud; loud UGC/meme energy → neo-brutal; fashion/premium → minimal):
   - **glass** — frosted translucent cards, soft springs. Default for bright UGC/SaaS ads.
   - **dark-hud** — dark translucent panels, neon edges. Tech, gaming, dev tools.
   - **neo-brutal** — solid white cards, thick black outlines, hard offset shadows. Loud, punchy.
   - **minimal** — near-opaque white, hairline borders, serif. Premium, fashion, lifestyle.

Never ask more than these two. Everything else is inferred.

## Step 2 — Understand the footage (always, before any plan)

1. `ffprobe`: resolution, fps, duration, audio.
2. Extract frames (`fps=0.5..1`, scaled small) and **actually view them**. Note: burned-in captions? talking head or b-roll? where is the face? bright or dark?
3. Extract 16kHz mono WAV, transcribe with `whisper-cli -m <model> -f audio.wav -osrt -ml 60` for sentence lines.
4. Detect existing BGM: measure RMS (`astats`) in a speech gap. If ≥ -30dB there is music — add no BGM, keep SFX subtle.

## Step 3 — The one checkpoint

Present ONE confirmation card, then stop for approval. It contains:
- What the footage is (one line) and what the narration says (beat list with timestamps).
- Cut plan: rough cut or no cut. Rough-cut only when the footage is a raw recording with retakes/dead air. Skip cutting when speech is wall-to-wall or captions are burned in (cutting desyncs nothing but looks jarring mid-caption).
- Chosen preset + accent colors (from brand/footage) and the planned overlay scene per beat.
- What will NOT be touched (existing captions, original audio).

After approval, run to the end with no further questions.

## Step 4 — Rough cut (only if planned)

Bundled engine (adapted from Manthan Patel's leadgenman-video-skills, MIT):

```bash
cd <plugin>/engine
PYTHONPATH=. uv run --no-project --with "openai,rapidfuzz,numpy" python roughcut.py "<video>"
```

- No `OPENAI_API_KEY` needed — it falls back to local whisper-cli automatically.
- Tune per footage: `RC_SILENCE_MERGE` (0.3 default; 0.6-1.2 for tight ad reads) and `RC_MIN_CHUNK` (1.0 default; 0.4 for short clips). If the transcript shows the hook or CTA was dropped, raise `RC_SILENCE_MERGE` and rerun.
- Verify the output transcript still contains first and last narration lines before proceeding.

## Step 5 — Beat map

Word-level timestamps on the (cut or original) audio: `whisper-cli -ml 1 -oj`. Convert to a table of sentence beats: start/end frame at the footage fps. Each beat gets one overlay scene concept that VISUALIZES what is being said (emails piling up, a toggle flipping, a button being clicked) — never generic decoration.

## Step 6 — Build the overlay project

1. Copy `template/` to a working dir (scratchpad). `npm install --no-audit --no-fund` inside it.
2. Copy footage into `public/footage.mp4`; resolve SFX into `public/sfx/`.
3. Set `Root.tsx`: durationInFrames/fps/width/height to match the footage exactly.
4. Write `src/Timeline.tsx` composing the scene primitives from `src/scenes.tsx` (see `Timeline.example.tsx` for a complete real build):
   - `NotificationStack` — cascading message/notification cards + odometer counter
   - `BrandCard` — logo + name + tagline with shine sweep
   - `SideToggleCard` — labeled switch + confirmation pill
   - `TaskAutomation` — task card, self-drawing checkbox, flying envelope with dotted trail, toast, typing dots
   - `ApprovePanel` — product mock + button, cursor click, burst rays, follow-up pill
   - `CtaPill` — pulsing action button + sparkles over the running footage
   Write custom scenes in the same style when the narration needs something these don't cover: hand-built SVGs, springs, `dampedSettle` recoil, everything a pure function of the frame.

### Hard layout rules
- Overlays live in the top ~35% and side margins. NEVER cover the speaker's eyes or mouth. NEVER cover burned-in captions (usually bottom ~500px of 1920).
- Existing captions/subtitles are untouched. Original audio untouched (SFX mixed on top at volume ≤ 0.45).
- Graphics run over the footage while it plays. A dead outro card alone is a failure.
- Something must always be moving: entrances via spring, idle via `floatY`, exits before the sequence ends.
- IG safe zones: keep critical text out of top 280px and bottom 422px when 1080x1920.

## Step 7 — Render + QA (mandatory, max 2 fix loops)

1. `npx remotion render src/index.ts Main <out>.mp4 --codec h264 --crf 17` (background it; 60fps verticals take minutes).
2. Extract one frame per overlay scene and **view them**. Check: face/caption occlusion, text overflowing cards, overlap between simultaneous cards.
3. Fix and re-render (whole video re-renders are fine). Two loops max, then ship with known issues stated.

## Step 8 — Deliver

Final mp4 into `exports/final/` next to the footage. Open the folder. Report: duration, scenes built, preset, anything cut, any known issues. Do not paste transcripts or file contents into chat.
