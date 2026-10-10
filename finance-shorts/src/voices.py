"""Audition Edge TTS voices: python -m src.voices  ->  assets/voice-samples/<Voice>.mp3 (same line, current pitch/rate)."""
from __future__ import annotations

import asyncio

import edge_tts

from .pipeline import PITCH, RATE, ROOT

LINE = "Kid, here's the deal. Over 30 years at 7 percent, 1,000 dollars grows to about 7,612. Example only, not a prediction."
VOICES = ("en-US-RogerNeural", "en-US-GuyNeural", "en-US-ChristopherNeural", "en-US-EricNeural")


async def main() -> None:
    out = ROOT / "assets" / "voice-samples"
    out.mkdir(parents=True, exist_ok=True)
    for v in VOICES:
        name = v.split("-")[2].removesuffix("Neural")
        await edge_tts.Communicate(LINE, v, rate=RATE, pitch=PITCH).save(str(out / f"{name}.mp3"))
        print("wrote", out / f"{name}.mp3")


if __name__ == "__main__":
    asyncio.run(main())
