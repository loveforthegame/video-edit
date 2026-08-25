# 🎬 video-edit — footage in, finished edit out

A single Claude Code plugin. Give it raw footage and a one-line brief, get back a rendered video with contextual motion graphics playing over your footage: glassmorphism cards, hand-built animated SVGs (self-drawing checkmarks, flying envelopes, toggles, cursors, sparkles), punch-in energy, and SFX — all synced to what the narration is actually saying.

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
1. Ask at most 2 short questions (your brief if you didn't give one, and a preset pick with a suggestion)
2. Watch the footage + transcribe it, then show you ONE plan card to approve
3. Rough-cut retakes/dead air if the footage needs it (engine adapted from Manthan Patel's open-source rough-cut engine — runs fully local)
4. Build the motion graphics in Remotion, QA its own frames, render, and hand you the file

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
├── engine/                      # local rough-cut engine (waveform + whisper, no API key)
└── template/                    # Remotion overlay project (presets, scenes, animated SVG icons)
```

SFX are optional and resolved at runtime from a local library if you have one (`sfx/` next to your footage). Renders work fine without them.

## Credits

- Rough-cut engine adapted from [leadgenman-video-skills](https://github.com/manthanpatelll/leadgenman-video-skills) by Manthan Patel (MIT). Changes: portable ffmpeg path, local whisper.cpp fallback (no OpenAI key), env-tunable thresholds, fixed packaging.
- `DigitRoll` component and motion helpers from [video-shotcraft](https://github.com/vincentwei1021/video-shotcraft) (Apache-2.0).

See `THIRD_PARTY_NOTICES.md`.

## License

MIT
