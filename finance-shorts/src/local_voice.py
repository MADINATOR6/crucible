"""Run the approved offline Paulie clone in its separate Qwen environment."""
from __future__ import annotations

import json
import os
import subprocess
import sys
import wave
from array import array
from pathlib import Path


# AppData is redirected inside Codex's Windows package and differs in Claude Code.
LOCAL = Path.home() / ".local/share/PaulieVoice"
PYTHON = LOCAL / "qwen-venv" / "Scripts" / "python.exe"
REFERENCE = LOCAL / "qwen-audition-results.json"
LAUGH = LOCAL / "paulie-laugh.wav"
MODEL = LOCAL / "qwen-sharded-20261011"


def read_chuckle(sample_rate: int) -> list[float]:
    """Use the requested recorded laugh rather than synthesising the syllable 'heh'."""
    if not LAUGH.is_file():
        raise RuntimeError(f"Paulie laugh sample missing: {LAUGH}")
    with wave.open(str(LAUGH), "rb") as audio:
        if audio.getnchannels() != 1 or audio.getsampwidth() != 2 or audio.getframerate() != sample_rate:
            raise RuntimeError("Paulie laugh must be mono PCM16 at the narration sample rate")
        if not 0.15 < audio.getnframes() / sample_rate < 3:
            raise RuntimeError("Paulie laugh must be between 0.15 and 3 seconds")
        frames = audio.getnframes()
        samples = array("h", audio.readframes(frames))
    if sys.byteorder != "little":
        samples.byteswap()
    if len(samples) != frames:
        raise RuntimeError("Paulie laugh sample is truncated")
    if not samples or max(abs(value) for value in samples) < 164:
        raise RuntimeError("Paulie laugh sample is silent")
    return [value / 32768 for value in samples]


def generate(scenes: list[dict], work: Path) -> None:
    for path in (PYTHON, REFERENCE, MODEL):
        if not path.exists():
            raise RuntimeError(f"local Paulie prerequisite missing: {path}")
    result = subprocess.run([str(PYTHON), "-X", "faulthandler", str(Path(__file__).resolve()), str(work)],
                            input=json.dumps([{"text": scene["narration"], "chuckle": scene.get("chuckle", False)}
                                              for scene in scenes]),
                            capture_output=True, text=True, encoding="utf-8", errors="replace")
    if result.returncode:
        error_log = work / "qwen-error.log"
        error_log.write_text(result.stderr, encoding="utf-8")
        raise RuntimeError(f"Qwen exited {result.returncode}: {result.stderr[-2500:]}\nFull log: {error_log}")


def _run(work: Path) -> None:
    os.environ["TOKENIZERS_PARALLELISM"] = "false"
    os.environ.setdefault("CUDA_MODULE_LOADING", "LAZY")
    os.environ["HF_ENABLE_PARALLEL_LOADING"] = "false"
    import numpy as np
    import soundfile as sf
    import torch
    import functools
    import transformers.modeling_utils as loader
    from qwen_tts import Qwen3TTSModel

    # Reduce Windows mapping pressure; shards also limit the temporary metadata mapping.
    loader.safe_open = functools.partial(loader.safe_open, backend="pread")

    if not torch.cuda.is_available():
        raise RuntimeError("CUDA required for Paulie voice; CPU fallback disabled")
    ref = json.loads(REFERENCE.read_text(encoding="utf-8"))[1]["reference"]
    if not Path(ref["path"]).is_file() or not ref["transcript"].strip():
        raise RuntimeError("approved Paulie reference is missing or invalid")
    texts = json.load(sys.stdin)
    # Validate before loading the GPU model; never silently substitute a synthetic laugh.
    if any(scene["chuckle"] for scene in texts):
        read_chuckle(24000)
    torch.set_num_threads(2)
    torch.cuda.set_per_process_memory_fraction(0.90)
    dtype = torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16
    model = Qwen3TTSModel.from_pretrained(str(MODEL), device_map="cuda:0", dtype=dtype,
                                           attn_implementation="sdpa", low_cpu_mem_usage=True,
                                           local_files_only=True)
    prompt = model.create_voice_clone_prompt(ref_audio=ref["path"], ref_text=ref["transcript"],
                                              x_vector_only_mode=False)
    speech_durations = []
    for i, scene in enumerate(texts, 1):
        torch.manual_seed(1234)
        torch.cuda.empty_cache()
        waves, sr = model.generate_voice_clone(text=scene["text"], language="English", voice_clone_prompt=prompt,
                                                max_new_tokens=240)
        wav = np.asarray(waves[0], dtype=np.float32)
        if not np.isfinite(wav).all() or not 0.5 < len(wav) / sr < 20:
            raise RuntimeError(f"invalid generated speech for scene {i}")
        raw = work / f"voice{i}raw.wav"
        out = work / f"voice{i}.wav"
        peak = float(np.max(np.abs(wav)))
        if peak < 0.005:
            raise RuntimeError(f"silent generated scene {i}")
        wav *= min(1.0, 0.95 / peak)
        sf.write(raw, wav, sr, subtype="PCM_16")
        # Trim speech before the laugh; silence trapped inside the joined clip cannot be endpoint-trimmed.
        trim = ("silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.04,areverse,"
                "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.08,areverse")
        result = subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(raw), "-af", trim,
                                 "-ac", "1", "-ar", str(sr), str(out)], capture_output=True, text=True)
        if result.returncode:
            raise RuntimeError(f"speech trim failed: {result.stderr[-1000:]}")
        wav, sr = sf.read(out, dtype="float32")
        if not 0.5 < len(wav) / sr < 20:
            raise RuntimeError(f"invalid trimmed speech for scene {i}")
        speech_durations.append(len(wav) / sr)
        if scene["chuckle"]:
            chuckle = np.asarray(read_chuckle(sr), dtype=np.float32)
            chuckle *= min(1.0, float(np.max(np.abs(wav))) / float(np.max(np.abs(chuckle))))
            wav = np.concatenate((wav, np.zeros(round(sr * 0.15), dtype=np.float32), chuckle))
        duration = len(wav) / sr
        if not np.isfinite(wav).all() or not 0.5 < duration < 20:
            raise RuntimeError(f"invalid generated scene {i}: duration or samples")
        peak = float(np.max(np.abs(wav)))
        if peak < 0.005:
            raise RuntimeError(f"silent generated scene {i}")
        if peak > 0.95:
            wav *= 0.95 / peak
        sf.write(work / f"voice{i}.wav", wav, sr, subtype="PCM_16")
        del wav, waves
    (work / "speech-durations.json").write_text(json.dumps(speech_durations), encoding="utf-8")


if __name__ == "__main__":
    _run(Path(sys.argv[1]))
