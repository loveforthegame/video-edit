# Third-party notices

## engine/roughcut.py

Adapted from **leadgenman-video-skills** by Manthan Patel
https://github.com/manthanpatelll/leadgenman-video-skills — MIT License, Copyright (c) 2026 Manthan Patel.

Modifications in this repo:
- Portable `ffmpeg` invocation (was hardcoded `/usr/local/bin/ffmpeg`)
- Local whisper.cpp fallback via `engine/local_whisper.py` when `OPENAI_API_KEY` is not set
- `RC_SILENCE_MERGE` / `RC_MIN_CHUNK` environment overrides for short-form footage
- `numpy` added to dependencies; packaging fixed for `uv run`

## template/src/lib/DigitRoll.tsx, template/src/lib/helpers/motion.ts

From **video-shotcraft** — Apache License 2.0.
Used unmodified. See the Apache-2.0 license text: http://www.apache.org/licenses/LICENSE-2.0

## Sound effects

No audio files are bundled. The skill resolves SFX at runtime from libraries already on the user's machine (e.g. their own `sfx/` folder). Users are responsible for the licenses of audio they supply.
