"""Local whisper.cpp adapter mimicking the OpenAI client surface roughcut.py uses.

Used automatically when OPENAI_API_KEY is not set. Requires whisper-cli on PATH
and a ggml model (WHISPER_GGML env var or the default path below).
"""

import json
import os
import subprocess
import tempfile
from types import SimpleNamespace

MODEL = os.environ.get(
    "WHISPER_GGML",
    os.path.expanduser("~/.cache/whisper-ggml/ggml-base.en.bin"),
)


def _run_whisper(wav_path, max_len=0):
    out_base = wav_path + ".lw"
    cmd = ["whisper-cli", "-m", MODEL, "-f", wav_path, "-oj", "-of", out_base, "-l", "en"]
    if max_len:
        cmd += ["-ml", str(max_len)]
    subprocess.run(cmd, capture_output=True)
    json_path = out_base + ".json"
    if not os.path.exists(json_path):
        return []
    with open(json_path, encoding="utf-8") as f:
        data = json.load(f)
    os.remove(json_path)
    return data.get("transcription", [])


def _ensure_wav(path):
    if path.lower().endswith(".wav"):
        return path, False
    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False).name
    subprocess.run(
        ["ffmpeg", "-y", "-i", path, "-ar", "16000", "-ac", "1",
         "-acodec", "pcm_s16le", tmp],
        capture_output=True,
    )
    return tmp, True


class _Transcriptions:
    def create(self, model=None, file=None, response_format="text",
               language="en", timestamp_granularities=None):
        wav, is_tmp = _ensure_wav(file.name)
        try:
            if response_format == "text":
                segs = _run_whisper(wav)
                return " ".join(s["text"].strip() for s in segs).strip()

            # verbose_json: word granularity via token-level segments (-ml 1)
            granularity = (timestamp_granularities or ["segment"])[0]
            segs = _run_whisper(wav, max_len=1 if granularity == "word" else 60)
            words, segments = [], []
            for s in segs:
                text = s["text"].strip()
                start = s["offsets"]["from"] / 1000.0
                end = s["offsets"]["to"] / 1000.0
                if text:
                    words.append(SimpleNamespace(word=text, start=start, end=end))
                    segments.append(SimpleNamespace(text=text, start=start, end=end))
            return SimpleNamespace(words=words, segments=segments)
        finally:
            if is_tmp and os.path.exists(wav):
                os.remove(wav)


class _Audio:
    transcriptions = _Transcriptions()


class LocalWhisper:
    audio = _Audio()
