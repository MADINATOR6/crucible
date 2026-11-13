# Local video operations

Deterministic FFmpeg edits of local files; no Higgsfield calls or credits.
Only A1–A3 are implemented. Python with `pycairo` and FFmpeg/ffprobe on PATH
is required. `VIDEO_OPS_FFMPEG` and `VIDEO_OPS_FFPROBE` override executable paths.
This repository's prepared Python is `finance-shorts/.venv/Scripts/python.exe`.

| Function | Replaces Higgsfield effect | CLI example (from repo root) |
| --- | --- | --- |
| `camera_move(src, dst, move="push", amount=0.12, duration=None, fps=30)` | Camera Pan / push / truck / crane | `python -m video_ops.camera_move photo.png move.mp4 --move push --duration 4` |
| `join_clips(clips, dst, transition="cut", duration=0.5, fps=30, size=None)` | video-montage / shot assembly | `python -m video_ops.join_clips joined.mp4 first.mp4 second.mp4 --transition cut` |
| `text_overlay(src, dst, lines, start=2.0, stagger=0.16, fade_in=0.3, dim_to=0.30, dim_dur=0.6, fade_out=0.45)` | Generated captions / lower thirds / end cards | `python -m video_ops.text_overlay clip.mp4 card.mp4 "First line" "Second line"` |

Each returns a `Path` and accepts keyword-only `overwrite=False` (`--overwrite`).
Existing destinations are refused by default; input paths are always protected,
including when overwrite is enabled. Output parents must already exist.
Outputs use H.264, yuv420p, CRF 20, 12M maxrate, square pixels, BT.709 tags and faststart.

Camera moves: `push`, `pull`, `truck_left`, `truck_right`, `crane_up`, `crane_down`.
Amount must be 0.02–0.4; truck/crane amount is the fraction of input width/height
travelled within a fixed crop. Stills default to four seconds; videos use their
duration, or `--duration` trims them. Dimensions round down to even pixels.
Camera and join default to 30 FPS as specified in the task signatures;
pass `--fps 24` explicitly to retain a 24 FPS source rate. Text retains source FPS.

Joins normalize size (first clip by default, or `--size WIDTH HEIGHT`), FPS,
SAR and pixel format. Cuts are the default. Fade duration must be positive and
shorter than every clip; its output duration is the sum minus duration per join
(within one output frame). Audio is retained only when every clip has audio:
cuts concatenate it and fades crossfade it. Other edits retain optional audio.

Text uses Arial bold rendered by Cairo into temporary transparent PNGs under
`media-out/video_ops/`, removed after each call. One to four non-empty lines are
centered and fitted to width; line fades start at `start + i*stagger`. The whole
frame dims linearly from `start - 0.4` (clamped to zero) over `dim_dur`;
`dim_to` is remaining brightness. The final `fade_out` seconds fade to black.
Clips too short to show all lines before that final fade are rejected.
No blur or drawtext is used. Audio does not fade out with the picture.

Run synthetic CLI/integration and invalid-input tests:

```powershell
$env:VIDEO_OPS_FFMPEG = (Resolve-Path media-out/video_ops/tools/ffmpeg.exe).Path
$env:VIDEO_OPS_FFPROBE = (Resolve-Path media-out/video_ops/tools/ffprobe.exe).Path
& finance-shorts/.venv/Scripts/python.exe -m unittest discover -s video_ops/tests -t . -v
```
