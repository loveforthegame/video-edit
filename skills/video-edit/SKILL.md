---
name: video-edit
description: "Full video edit pipeline: raw footage in, finished motion-graphics edit out, autonomously. Invoke as /video-edit with a video file path and optionally a free-text brief. Perceives the footage into a fixed-schema grid, transcribes locally with whisper.cpp (no API key), optionally rough-cuts retakes/dead air, plans overlay variants judged by an adversarial critic on cheap stills, then renders contextual animated overlays (glassmorphism and 3 more presets, hand-built animated SVGs, SFX) in Remotion and audits its own render. Use when the user says /video-edit, wants a video edited, wants motion graphics added to footage, or wants a raw recording turned into a polished reel/ad."
---

# /video-edit — footage to finished edit

One command, one autonomous run. The user gives raw footage plus (optionally) a
free-text brief. You deliver a rendered video with contextual motion graphics
playing OVER the footage, and a record of every decision you made on their
behalf.

**Nobody is watching this run.** You do not ask questions, you do not stop for
approval, and you do not present options. Every choice a user would have made
becomes an inference plus a written assumption. See Autonomy below — it governs
every step that follows.

## Autonomy

1. **Never ask. Infer, then record.** Anything you would have asked gets decided
   from evidence and written to `edit/decisions.md` with the evidence and the
   alternative you rejected. The old approval card is not deleted — it is
   inverted, from a prompt before the work into a record delivered with it.
2. **No gate may halt.** Every check below has a defined degrade path: retry
   with different parameters, fall back to the safer variant, or ship and state
   the defect. "Stop and ask" is never one of them.
3. **Stop only for a blocker, never for a preference.** An unreadable input
   file, or a missing `ffmpeg` / `whisper-cli` that you could not install, is a
   blocker: report it plainly and stop. A missing brief, an ambiguous preset, an
   uncertain cut call — those are preferences. Decide them.
4. **Resume, do not restart.** Every stage writes a file keyed to the input's
   hash. On a re-run, reuse what is still valid. A run that died at step 6 picks
   up at step 6.
5. **State assumptions in the handoff**, not mid-run. The user reads once, at
   the end.

## Hard Rules (correctness — non-negotiable)

Deviating here produces silent failures, not different taste. Everything outside
this section is a worked example you should override when the material calls for
it.

1. **Read `edit/footage.md` end to end before writing the beat map.** Never grep
   it for the timestamps you think you need. The row you skip is the row where
   an overlay lands on someone's mouth. If it exceeds one `Read` call, issue
   sequential reads with `offset`/`limit` until every row is covered.
2. **Never place an overlay in a cell marked `F` or `t` at that time.** This is
   the skill's oldest rule and it is now mechanically checkable — check it
   rather than eyeballing it.
3. **Speech decides *when*, the grid decides *where*.** Beat timing comes from
   word-level whisper output; placement comes from `footage.md`. When they
   conflict about placement, the grid wins.
4. **A preset expands to explicit numbers before use** — entrance frames, hold
   frames, exit frames, accent hex. Never invent ad-hoc timing values inline.
   Same for the rough cut: use a named pacing preset, never a raw guess.
5. **Perception is cached by source hash.** Never re-run the scout unless the
   file changed or the sample rate changed. If the rate changes, re-run the
   whole pass — never splice two rates into one `footage.md`.
6. **Never self-compact to dodge rule 1.** If `footage.md` genuinely will not
   fit, say so in the handoff and fall back to the mode-A header alone with
   `confidence: low` behaviour — do not silently summarise it and plan from the
   summary.
7. **QA asserts, it does not impress.** The render gate passes on assertions
   (cells, boxes, collisions), never on "it looks fine." Three passes maximum,
   then ship and state what is still wrong.
8. **The scout never sees the brief or the plan.** Its blindness is what makes
   its output trustworthy. Do not "helpfully" pass it context.

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

If `ffmpeg` or `whisper-cli` cannot be installed, that is a blocker under
Autonomy 3. Everything else degrades.

## Step 1 — Intake (no questions)

**Brief.** If the invocation contains one, parse goal, CTA, brand names and tone
from it. If it does not, derive one from the transcript after Step 2 and record
it in `decisions.md` as `brief: assumed`. Never ask for it — a missing brief is
a preference, and the narration almost always contains the goal and the CTA.

**Preset.** Decide from the mode-A header, and record the rule that fired:

| Evidence | Preset | Look |
|---|---|---|
| `brightness: bright`, talking head or product | **glass** | frosted translucent cards, soft springs — the default |
| `brightness: dark`, screen-recording, dev/tech vocabulary in the transcript | **dark-hud** | dark panels, neon edges |
| fast cuts, loud delivery, meme cadence, heavy burned-in captions | **neo-brutal** | solid white, thick black outlines, hard shadows |
| slow pacing, fashion/lifestyle/premium vocabulary | **minimal** | near-opaque white, hairline borders, serif |

Ties go to `glass`. Accent colours come from the brand named in the brief, else
sampled from the footage, else the preset default.

## Step 2 — Perceive (mode A, then transcribe)

1. `ffprobe`: resolution, fps, duration, audio.
2. Dispatch **`video-edit:footage-scout`** with the video path and `global`.
   It returns `path=` / `rows=` / `samples=`. Read `edit/footage.md` yourself.
   **You never look at raw frames.** The scout absorbs the images; you read
   rows. This is what keeps a long run inside its context.
3. Extract 16kHz mono WAV, transcribe with `whisper-cli -m <model> -f audio.wav
   -osrt -ml 60` for sentence lines.
4. Detect existing BGM: measure RMS (`astats`) in a speech gap. If ≥ -30dB there
   is music — add no BGM, keep SFX subtle.

**Degrade path:** `confidence: low` in the header does not stop the run. It
shrinks the overlay envelope — place only in cells that are `.` across the
entire scene span, and prefer the side margins over the upper third.

## Step 3 — Decide the cut (no checkpoint)

Rough-cut only when the evidence says the footage is a raw recording. Decide
from `footage.md` and the transcript, and write the call plus its evidence into
`decisions.md`:

- Silence gaps ≥ the pacing preset's threshold, or visible retakes → cut.
- Speech wall-to-wall, or `burned_in_text` present → do not cut. Cutting
  desyncs nothing but looks jarring mid-caption.

Pacing presets, since Hard Rule 4 forbids ad-hoc numbers:

| Preset | `RC_SILENCE_MERGE` | `RC_MIN_CHUNK` | Use when |
|---|---:|---:|---|
| calm | 1.2 | 1.0 | long-form, cinematic, considered delivery |
| measured | 0.9 | 1.0 | explainer, demo, tutorial |
| paced | 0.6 | 0.6 | **default** — tight ad reads, most UGC |
| energetic | 0.3 | 0.4 | fast reads, short-form hooks, short clips |

`RC_SILENCE_MERGE` is a *merge* threshold — gaps shorter than it get absorbed,
so **higher means calmer**: fewer, longer chunks. `RC_MIN_CHUNK` drops fragments
below its length. The engine's own defaults are `0.30` / `1.0`; `paced` sits at
0.6 because tight ad reads need more merging than conversational speech.

Never slice inside a fluently delivered sentence. Ordinary 30–200ms inter-word
gaps are articulation, not cut targets; multiple cuts inside one spoken sentence
is a red flag to re-check the gap maths, not a style.

## Step 4 — Rough cut (only if decided)

Bundled engine (adapted from Manthan Patel's leadgenman-video-skills, MIT):

```bash
cd <plugin>/engine
RC_SILENCE_MERGE=<preset> RC_MIN_CHUNK=<preset> \
PYTHONPATH=. uv run --no-project --with "openai,rapidfuzz,numpy" python roughcut.py "<video>"
```

- No `OPENAI_API_KEY` needed — it falls back to local whisper-cli automatically.
- Verify the output transcript still contains the first and last narration lines.
  **Degrade path:** if the hook or CTA was dropped, step one preset calmer and
  re-run. If it drops again, keep the uncut footage and record why.

## Step 5 — Perceive the cut (mode B) and build the beat map

1. Dispatch **`video-edit:footage-scout`** again on the *cut* footage with rate
   `1`. Assert `rows == samples`; if not, re-dispatch once, then proceed with
   `confidence: low` behaviour.
2. Read `edit/footage.md` in full (Hard Rule 1).
3. Word-level timestamps on the cut audio: `whisper-cli -ml 1 -oj`. Convert to
   sentence beats with start/end frames at the footage fps.
4. Each beat gets one scene concept that VISUALIZES what is being said — emails
   piling up, a toggle flipping, a button being clicked — never generic
   decoration. Then assign each scene its cells, choosing only from cells that
   are free across the beat's whole span (Hard Rules 2 and 3).

## Step 6 — Build, then let the critic pick

1. Copy `template/` to a working dir (scratchpad). `npm install --no-audit --no-fund` inside it.
2. Copy footage into `public/footage.mp4`; resolve SFX into `public/sfx/`.
3. Set `Root.tsx`: durationInFrames/fps/width/height to match the footage exactly.
4. Write `src/Timeline.tsx` composing the scene primitives from `src/scenes.tsx`
   (see `Timeline.example.tsx` for a complete real build):
   - `NotificationStack` — cascading message/notification cards + odometer counter
   - `BrandCard` — logo + name + tagline with shine sweep
   - `SideToggleCard` — labeled switch + confirmation pill
   - `TaskAutomation` — task card, self-drawing checkbox, flying envelope with dotted trail, toast, typing dots
   - `ApprovePanel` — product mock + button, cursor click, burst rays, follow-up pill
   - `CtaPill` — pulsing action button + sparkles over the running footage
   Write custom scenes in the same style when the narration needs something these don't cover: hand-built SVGs, springs, `dampedSettle` recoil, everything a pure function of the frame.
5. **Produce 2–4 variants**, differing in placement and scene choice — not in
   preset. Render each to stills only, which costs seconds rather than minutes:
   `npx remotion still src/index.ts Main <out>.png --frame <n>` per scene.
6. Dispatch **`video-edit:edit-critic`** in mode `plan` with the brief,
   `footage.md`, the manifest and the stills. Take its `verdict` variant.
   **Degrade path:** if the winner still carries hard fails, fix those specific
   cited scenes and re-run the critic once. Then proceed regardless — a stated
   defect beats a stalled run.

### Hard layout rules
- Overlays live in the top ~35% and side margins, and only in cells `footage.md` says are free.
- NEVER cover the speaker's eyes or mouth. NEVER cover burned-in captions — usually the bottom ~500px of a 1920-tall frame, and whatever band mode A reported as `burned_in_text`. The grid enforces this per-frame; these are the fallbacks when a cell reads ambiguous.
- Existing captions/subtitles are untouched. Original audio untouched (SFX mixed on top at volume ≤ 0.45).
- Graphics run over the footage while it plays. A dead outro card alone is a failure.
- Something must always be moving: entrances via spring, idle via `floatY`, exits before the sequence ends.
- IG safe zones: keep critical text out of top 280px and bottom 422px when 1080x1920.

## Step 7 — Render + audit (max 2 fix loops)

1. `npx remotion render src/index.ts Main <out>.mp4 --codec h264 --crf 17`
   (background it; 60fps verticals take minutes).
2. Dispatch **`video-edit:edit-critic`** in mode `render` with `footage.md`, the
   manifest and the mp4. You do not view frames yourself.
3. On `verdict=fail`, fix the cited scenes and re-render. Two loops maximum,
   then ship and state the remaining findings verbatim in the handoff.

## Step 8 — Deliver

Final mp4 into `exports/final/` next to the footage, alongside `edit/decisions.md`.
Open the folder. Report: duration, scenes built, preset and the rule that chose
it, anything cut, every assumption you made, and any finding the critic raised
that you shipped anyway. Do not paste transcripts or file contents into chat.

`edit/decisions.md` accumulates across runs — append, never overwrite, so a
second pass on the same footage can see what the first one decided and why.

## Anti-patterns

Things that fail regardless of style:

- **Asking the user anything.** There is no user in the loop. A question is a
  crashed run wearing a polite face.
- **Viewing raw frames in the main thread.** That is the scout's job, and doing
  it yourself burns the context the beat map needs.
- **Partial-reading `footage.md`** — first-N-rows, grep-and-plan-from-matches,
  or abandoning a chunked read because "the rest looks similar." The scout
  already wrote one row per sample precisely so every row is signal.
- **Passing the brief to the scout** to "help it." It destroys the only
  independent read of the footage you have.
- **Letting the critic propose fixes,** or taking its silence as approval. It
  states defects; you decide the remedy.
- **Rendering full variants to compare them.** Stills cost seconds and answer
  the same question; full renders cost minutes each.
- **Generic decoration.** A card that would fit anywhere in the video fits
  nowhere in it. If the scene does not visualise the sentence under it, cut the
  scene.
- **Treating a low-confidence header as a failure.** It is a correct answer
  about dark or fast footage, and it should change placement, not stop the run.
- **Shipping silently over a hard finding.** Shipping with a stated defect is
  fine; shipping without stating it is not.
- **Re-running perception on unchanged sources.** Immutable outputs of immutable
  inputs.
