# 🎬 video-edit — footage in, finished edit out

A single Claude Code plugin. Give it raw footage and a one-line brief, get back a rendered video with contextual motion graphics playing over your footage: glassmorphism cards, hand-built animated SVGs (self-drawing checkmarks, flying envelopes, toggles, cursors, sparkles), punch-in energy, and SFX — all synced to what the narration is actually saying.

**It runs autonomously.** No questions, no approval gate, no options to pick. It infers what you would have chosen, and writes every call it made — and the evidence behind it — to `edit/decisions.md` alongside the video.

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
```

The skill will:
1. Send a **blind scout** over the footage — it sees the frames but never your brief, and writes a fixed-schema occupancy grid to `footage.md` so nothing downstream has to guess where the face is
2. Transcribe locally, pick a preset from the evidence, and decide the cut — recording each call rather than asking
3. Rough-cut retakes/dead air if the footage needs it (engine adapted from Manthan Patel's open-source rough-cut engine — runs fully local)
4. Build 2–4 overlay variants, render them as **stills** (seconds, not minutes) and let an **adversarial critic** pick the winner — the maker never approves its own work
5. Render the winner, audit the result against the grid with assertions rather than impressions, and hand you the file plus `decisions.md`

## Presets

| Preset | Look | Best for |
|---|---|---|
| `glass` | frosted translucent cards, soft springs | bright UGC / SaaS ads (default) |
| `dark-hud` | dark panels, neon edges | tech, gaming, dev tools |
| `neo-brutal` | solid white, thick black outlines, hard shadows | loud punchy UGC |
| `minimal` | near-opaque white, hairline borders, serif | premium, fashion, lifestyle |

All four drive the same scene system: notification stacks, brand cards, toggles, task→email automations, click-to-approve panels, pulsing CTAs — plus custom scenes written per video.

## What's inside

```
video-edit/
├── .claude-plugin/plugin.json
├── skills/video-edit/SKILL.md   # the pipeline the agent follows
├── agents/footage-scout.md      # blind perception -> footage.md occupancy grid
├── agents/edit-critic.md        # adversarial gate: scores plans, audits renders
├── engine/                      # rough-cut engine + perceive.sh frame sampler
└── template/                    # Remotion overlay project (presets, scenes, animated SVG icons)
```

SFX are optional and resolved at runtime from a local library if you have one (`sfx/` next to your footage). Renders work fine without them.

## Credits

- Rough-cut engine adapted from [leadgenman-video-skills](https://github.com/manthanpatelll/leadgenman-video-skills) by Manthan Patel (MIT). Changes: portable ffmpeg path, local whisper.cpp fallback (no OpenAI key), env-tunable thresholds, fixed packaging.
- `DigitRoll` component and motion helpers from [video-shotcraft](https://github.com/vincentwei1021/video-shotcraft) (Apache-2.0).

See `THIRD_PARTY_NOTICES.md`.

## License

MIT
