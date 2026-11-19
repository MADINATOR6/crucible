import os
import runpy
import sys
import tempfile
import types
import unittest
import wave
from array import array
from pathlib import Path
from unittest.mock import patch

from src import local_voice, pipeline


class Voice(unittest.TestCase):
    def test_runtime_is_shared_when_appdata_is_redirected(self):
        with patch.dict(os.environ, {"LOCALAPPDATA": "C:/different-app-private-folder"}):
            namespace = runpy.run_path(str(Path(local_voice.__file__)))
        shared = Path.home() / ".local/share/PaulieVoice"
        self.assertEqual(namespace["LOCAL"], shared)
        for key in ("PYTHON", "REFERENCE", "LAUGH", "MODEL"):
            self.assertTrue(namespace[key].is_relative_to(shared))

    def test_captions_end_before_laugh_but_next_scene_keeps_full_timing(self):
        ass = pipeline.build_ass([{"narration": "One line."}, {"narration": "Next."}], [4.8, 2.0], [3.0, 2.0])
        captions = [line.split(",") for line in ass.splitlines() if line.startswith("Dialogue:") and ",Cap," in line]
        self.assertEqual(captions[1][2], "0:00:03.00")
        self.assertEqual(captions[2][1], "0:00:04.80")
        self.assertEqual(captions[2][2], "0:00:06.80")
        with self.assertRaises(pipeline.PipelineError):
            pipeline.build_ass([{"narration": "Wrong."}], [1.0], [2.0])
        # PCM samples retain precision that ffprobe's six decimal places do not.
        self.assertIn("Cap", pipeline.build_ass([{"narration": "Rounded."}], [2.385583], [2.3855833333333334]))

    def test_metadata_identifies_recorded_laugh_only_when_used(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "metadata.txt"
            for chuckle in (False, True):
                pipeline.write_metadata({"scenes": [{"chuckle": chuckle}]}, {"sources": []}, out, None)
                self.assertEqual("recorded laugh excerpt" in out.read_text(encoding="utf-8"), chuckle)

    def test_recorded_chuckle_preserves_samples_and_rejects_wrong_format(self):
        with tempfile.TemporaryDirectory() as tmp:
            laugh = Path(tmp) / "laugh.wav"
            samples = array("h", [1000, -1000] * 2400)
            if sys.byteorder != "little":
                samples.byteswap()
            with wave.open(str(laugh), "wb") as audio:
                audio.setparams((1, 2, 24000, 0, "NONE", "not compressed"))
                audio.writeframes(samples.tobytes())
            with patch.object(local_voice, "LAUGH", laugh):
                values = local_voice.read_chuckle(24000)
                self.assertEqual(values[:2], [1000 / 32768, -1000 / 32768])
                self.assertEqual(len(values), 4800)
                with self.assertRaisesRegex(RuntimeError, "sample rate"):
                    local_voice.read_chuckle(48000)

    def test_recorded_chuckle_missing_or_silent_stops(self):
        with tempfile.TemporaryDirectory() as tmp:
            laugh = Path(tmp) / "laugh.wav"
            with patch.object(local_voice, "LAUGH", laugh):
                with self.assertRaisesRegex(RuntimeError, "missing"):
                    local_voice.read_chuckle(24000)
                with wave.open(str(laugh), "wb") as audio:
                    audio.setparams((1, 2, 24000, 0, "NONE", "not compressed"))
                    audio.writeframes(bytes(9600))
                with self.assertRaisesRegex(RuntimeError, "silent"):
                    local_voice.read_chuckle(24000)

    def test_profile_default_legacy_and_invalid(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(pipeline.voice_profile(), "paulie")
            os.environ["SHORTS_VOICE"] = "en-US-GuyNeural"
            self.assertEqual(pipeline.voice_profile(), "paulie")
            os.environ["SHORTS_VOICE_PROFILE"] = "paulie"
            self.assertEqual(pipeline.voice_profile(), "paulie")
            os.environ["SHORTS_VOICE_PROFILE"] = "invalid"
            with self.assertRaises(pipeline.PipelineError):
                pipeline.voice_profile()

    def test_persona_follows_profile(self):
        with patch.dict(os.environ, {"SHORTS_VOICE_PROFILE": "paulie"}):
            self.assertEqual(pipeline.narrator_persona(), (pipeline.ROOT / "style" / "paulie.md").read_text(encoding="utf-8-sig"))
        with patch.dict(os.environ, {"SHORTS_VOICE_PROFILE": "edge"}):
            self.assertEqual(pipeline.narrator_persona(), (pipeline.ROOT / "style" / "persona.md").read_text(encoding="utf-8-sig"))

    def test_local_generates_wav_then_uses_existing_media_path(self):
        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ, {"SHORTS_VOICE_PROFILE": "paulie"}):
            with patch("src.local_voice.generate") as generate, patch.object(pipeline, "sh") as sh, \
                 patch.object(pipeline, "audio_seconds", return_value=2.0):
                self.assertEqual(pipeline.synth_voice([{"narration": "Hello"}], Path(tmp)), [2.0])
            generate.assert_called_once()
            self.assertEqual(sh.call_args_list[0].args[0][3], "voice1.wav")
            self.assertNotIn("-af", sh.call_args_list[0].args[0])
            self.assertEqual(sh.call_args_list[-1].args[0][-1], "voice.m4a")

    def test_local_failure_has_no_edge_fallback(self):
        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ, {"SHORTS_VOICE_PROFILE": "paulie"}):
            with patch("src.local_voice.generate", side_effect=RuntimeError("CUDA required")), \
                 patch.object(pipeline, "sh") as sh:
                with self.assertRaisesRegex(pipeline.PipelineError, "CUDA required"):
                    pipeline.synth_voice([{"narration": "Hello"}], Path(tmp))
            sh.assert_not_called()

    def test_edge_uses_custom_voice_after_env_load(self):
        calls = []

        class Communicate:
            def __init__(self, text, voice, **kwargs):
                calls.append((text, voice, kwargs))

            async def save(self, path):
                pass

        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ, {
            "SHORTS_VOICE_PROFILE": "edge", "SHORTS_VOICE": "en-US-GuyNeural"}), \
             patch.dict(sys.modules, {"edge_tts": types.SimpleNamespace(Communicate=Communicate)}), \
             patch.object(pipeline, "sh") as sh, patch.object(pipeline, "audio_seconds", return_value=2.0):
            pipeline.synth_voice([{"narration": "Hello"}], Path(tmp))
        self.assertEqual(calls[0][1], "en-US-GuyNeural")
        self.assertEqual(sh.call_args_list[0].args[0][3], "voice1.mp3")
        self.assertIn("-af", sh.call_args_list[0].args[0])

    def test_chuckle_validation(self):
        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ, {"SHORTS_VOICE_PROFILE": "paulie"}):
            for scenes in ([{"narration": "Hi", "chuckle": "yes"}],
                           [{"narration": "Hi", "chuckle": True}, {"narration": "Bye", "chuckle": True}]):
                with self.assertRaisesRegex(pipeline.PipelineError, "chuckle"):
                    pipeline.synth_voice(scenes, Path(tmp))
        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ, {"SHORTS_VOICE_PROFILE": "edge"}):
            with self.assertRaisesRegex(pipeline.PipelineError, "requires the Paulie"):
                pipeline.synth_voice([{"narration": "Hi", "chuckle": True}], Path(tmp))

    def test_runner_failure_does_not_reuse_existing_audio(self):
        with tempfile.TemporaryDirectory() as tmp:
            work = Path(tmp)
            for name in ("python.exe", "reference.json"):
                (work / name).touch()
            (work / "model").mkdir()
            (work / "voice1.wav").touch()
            with patch.object(local_voice, "PYTHON", work / "python.exe"), \
                 patch.object(local_voice, "REFERENCE", work / "reference.json"), \
                 patch.object(local_voice, "MODEL", work / "model"), \
                 patch.object(local_voice.subprocess, "run", return_value=types.SimpleNamespace(returncode=1, stderr="CUDA required")) as run:
                with self.assertRaisesRegex(RuntimeError, "Qwen exited 1: CUDA required"):
                    local_voice.generate([{"narration": "New scene"}], work)
            self.assertEqual(run.call_args.kwargs["input"], '[{"text": "New scene", "chuckle": false}]')
            self.assertEqual((work / "qwen-error.log").read_text(encoding="utf-8"), "CUDA required")

    def test_native_error_with_invalid_text_bytes_is_retained(self):
        with tempfile.TemporaryDirectory() as tmp:
            work = Path(tmp)
            child = work / "child.py"
            child.write_text("import sys\nsys.stderr.buffer.write(bytes([129]) + b'Qwen loading error\\n')\nsys.exit(7)\n",
                             encoding="utf-8")
            reference = work / "reference.json"
            reference.touch()
            with patch.object(local_voice, "PYTHON", Path(sys.executable)), \
                 patch.object(local_voice, "REFERENCE", reference), \
                 patch.object(local_voice, "MODEL", work), \
                 patch.object(local_voice, "__file__", str(child)):
                with self.assertRaisesRegex(RuntimeError, "Qwen exited 7: .*Qwen loading error"):
                    local_voice.generate([{"narration": "Test"}], work)
            self.assertIn("Qwen loading error", (work / "qwen-error.log").read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
