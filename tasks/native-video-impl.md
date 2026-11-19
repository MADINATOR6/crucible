# VO-1: native video_ops module (Bucket A of the hybrid Higgsfield pipeline)

User directive 2026-11-07: Codex implements `video_ops/`; first 3 functions only, then stop for the user's approval. Normal rule (Codex plans, Claude implements) is overridden by the user for this task. Zero Higgsfield credits: nothing here calls Higgsfield.

Source of truth for techniques: `playbook/video-editing.yaml` (ids `T-nnn` below). Hybrid split: Higgsfield stays for generation (Bucket B); deterministic edits run locally (Bucket A). Inputs are local video or image files, including raw clips downloaded from Higgsfield (Kling 24 fps 1920x1080 or 1080x1920, H.264, usually no audio).

## Bucket A: native capable (FFmpeg / pycairo / Python)

| # | Higgsfield effect it replaces | Native strategy | Playbook | Phase |
| --- | --- | --- | --- | --- |
| A1 | camera pan / push / truck / crane on a still or clip | `zoompan` on a 4x pre-scaled input (linear expressions, constant speed) | T-013 | 2 (first 3) |
| A2 | transitions / assembling shots (video-montage, one-take morph) | `concat` for hard cuts, `xfade` chain for crossfades, normalised size/fps/SAR | T-013, T-014 | 2 (first 3) |
| A3 | captions, lower thirds, end card (text in generator) | pycairo PNG per line + `overlay` with alpha `fade`; black-overlay dim | T-008, T-015 | 2 (first 3) |
| A4 | camera shake removal on raw Kling takes | `vidstabdetect` + `vidstabtransform`, FFV1 intermediate | T-005, T-006, T-011 | later |
| A5 | reframe 16:9 to 9:16 | blurred, darkened copy as background, picture window over it | T-014 | later |
| A6 | grade / look match across shots | `signalstats` per shot, per-shot `curves`/`eq`, one shared master chain | T-007 | later |
| A7 | slow motion / speed match / 24 to 30 or 60 fps | `setpts` + `minterpolate` (mci) | T-019 | later |
| A8 | remove an artefact at the frame edge (invented person/doorway) | exact 16:9 edge crop 15% from the artefact side, then scale | T-002 | later |
| A9 | export for delivery | CRF/maxrate encode, `h264_metadata` SAR 1:1 + BT.709, faststart, two-pass to a size cap | T-009, T-016, T-021 | later |
| A10 | QC of a clip | ffprobe + full decode `-xerror` + per-frame interval + atom check; `signalstats` YDIF motion check | T-017, T-006 | later |
| A11 | switch a TV off | `geq` near-black four-corner fill | T-018 | later |
| A12 | extend a dark ceiling to reach 9:16 | pad with OpenCV after painting out cut-off lights | T-022 | later, needs opencv |
| A13 | filmed-feel parallax from a still | depth-anything ONNX + Blender EEVEE | T-020 | deferred (heavy, Blender dependency) |

### Codex Task per Bucket A item

Common rules for every item: one function per module under `video_ops/`, `from __future__ import annotations`, type hints, `pathlib.Path`, plain `subprocess` (as in `finance-shorts/src/visuals.py:456-472`), `RuntimeError(f"ffmpeg failed ...: {err[-800:]}")` on a nonzero exit, a small `main()` with argparse so `python -m video_ops.<module>` is the CLI, and a unittest for it. Accept any local file, never assume Higgsfield. Never overwrite the input; refuse an existing `dst` unless `overwrite=True` (`--overwrite`).

- **A1 camera_move** (`video_ops/camera_move.py`): `camera_move(src, dst, move="push", amount=0.12, duration=None, fps=30) -> Path`. Moves: `push`, `pull`, `truck_left`, `truck_right`, `crane_up`, `crane_down`. Image input: loop it for `duration` s (default 4). Video input: apply the move across the clip. Higgsfield "Camera Pan" becomes `zoompan` with zoom/x/y linear in the frame counter (`on`) for constant speed, fed from the input pre-scaled 4x with `scale=...:flags=lanczos` to remove zoompan's integer-rounding jitter, then scaled back to the source size (even dimensions). `amount` is the zoom gained (push/pull) or the fraction of width/height travelled (truck/crane); `pull` is `push` reversed; reject `amount` outside 0.02-0.4 and unknown moves with `ValueError`. Output H.264 yuv420p via `_ff.encode_args()`.
- **A2 join_clips** (`video_ops/join_clips.py`): `join_clips(clips, dst, transition="cut", duration=0.5, fps=30, size=None) -> Path`. `cut` = hard cuts (`concat` filter, the default; playbook says dissolves invent geometry), `fade` = `xfade` chain with offsets computed from ffprobe durations. Normalise every clip to one size (first clip's, or `size`), fps, `setsar=1`, `yuv420p` before joining. Audio: keep only if every clip has audio, otherwise output video only. Final duration for fade is `sum(d) - duration*(n-1)`. Need at least 2 clips; `duration` must be shorter than the shortest clip.
- **A3 text_overlay** (`video_ops/text_overlay.py`): `text_overlay(src, dst, lines, start=2.0, stagger=0.16, fade_in=0.3, dim_to=0.30, dim_dur=0.6, fade_out=0.45) -> Path`. Render each line to a transparent PNG with pycairo (`set_font`/`draw_text` approach in `finance-shorts/src/visuals.py`, copy the `FONT` value, do not import from finance-shorts), centred, white, sized for the clip width; `overlay` them at `start + i*stagger` with an alpha `fade`. Before the text the whole frame dims linearly to `dim_to` of its brightness over `dim_dur` (a black layer with fading alpha, no blur), starting at `start - 0.4`; the final `fade_out` s fades to black. Replaces the generator's text and the lower-third that clashed with branded floors (T-008). Do not use `drawtext` (fontconfig is missing here, T-015). Max 4 lines, each non-empty, else `ValueError`.
- **A4 stabilise**: `stabilise(src, dst, smoothing=30, zoom=4, shakiness=5, accuracy=15, stepsize=6) -> Path` with `optzoom=0`, `interpol=bicubic`, `crop=black`, FFV1 when `dst` ends `.mkv`. First measure with `jitter(src)` and skip (copy) when before-jitter < 0.2 (T-005). Needs ffmpeg built with libvidstab: check `ffmpeg -filters` first and report if absent.
- **A5 fit_vertical**: `fit_vertical(src, dst, size=(1080,1920), window=1680, blur=40, dim=0.5) -> Path`. Background = scaled-to-fill blurred, darkened copy; foreground window of `window` px width centred (optional `focus_x`). Keep SAR 1:1, BT.709.
- **A6 shot_stats / grade_match**: `shot_stats(clip) -> (mean_y, mean_sat)` from `signalstats` YAVG/SATAVG; `grade_match(clips, dst_dir, target_y=(40, 80)) -> list[Path]` applies a per-shot curve only to clips outside the range, then one shared master chain. Report Y/Sat before and after as JSON.
- **A7 retime**: `retime(src, dst, speed=0.5, fps=60) -> Path` using `setpts` and `minterpolate=mi_mode=mci`. Keep native fps unless `fps` is given (T-019).
- **A8 edge_crop**: `edge_crop(src, dst, side="right", frac=0.15, y=0) -> Path`; computes an exact 16:9 crop (1920x1080 gives 1632x918, x=0 for right, x=288 for left), applied before scaling back to the source size.
- **A9 export**: `export(src, dst, crf=20, maxrate="12M", max_mb=None, grain=0) -> Path`; BT.709 tags, SAR 1:1 via `h264_metadata`, faststart; two-pass when `max_mb` is set. Refuse to overwrite an existing `dst`.
- **A10 verify_clip**: `verify_clip(path, width=None, height=None, fps=None, frames=None, duration=None, max_mb=None) -> list[str]` returns problems (empty = pass): full decode with `-xerror`, ffprobe fields, consecutive frame interval check, top-level atoms `ftyp`,`moov` before `mdat`.
- **A11 screen_off**: `screen_off(src_image, dst, quad) -> Path` fills the four corners (given as 8 numbers) with near-black using `geq`; saves a 1:1 crop with `drawgrid` for review.
- **A12 pad_ceiling**: `pad_ceiling(src_image, dst, rows) -> Path` (needs `opencv-python`; ask before adding the dependency).
- **A13 depth_parallax**: not scheduled; see `memory higgsfield-rea-local-video`. Requires Blender 5.2 and ONNX models; separate task.

## Bucket B: Higgsfield dependent (stays on the MCP/CLI; not implemented here)

| Id | Technique | Why it cannot be native | Local stand-in (what breaks) |
| --- | --- | --- | --- |
| T-023 | Kling i2v parallax from a real photo | invents occluded geometry, real depth | A13 depth+Blender (no occlusion fill, no subject motion) |
| T-024 | Seedance omni_reference timed-beat character clips | generates character action and synced audio | none |
| T-025 | Blender previz to video reference | generation step is Seedance | previz itself is local and free |
| T-026 | Element reference sheets / consistency | image generation | none |
| - | Genjutsu motion transfer / object swap, Marketing Studio, Katana, dubbing, upscale, new scenes, complex motion | model inference | Wan 2.2 HF Space (quota, 832x480 at 16 fps) |

## Phase 2 scope (this dispatch): A1, A2, A3 only

Write allowlist (exact):
- `video_ops/__init__.py`, `video_ops/_ff.py`, `video_ops/camera_move.py`, `video_ops/join_clips.py`, `video_ops/text_overlay.py`
- `video_ops/tests/__init__.py`, `video_ops/tests/test_camera_move.py`, `video_ops/tests/test_join_clips.py`, `video_ops/tests/test_text_overlay.py`
- `video_ops/README.md`, `video_ops/requirements.txt` (only `pycairo`; no new dependency)
- scratch output only under `media-out/video_ops/`

`_ff.py` holds the shared pieces: `ffmpeg_bin()` / `ffprobe_bin()` (env `VIDEO_OPS_FFMPEG` / `VIDEO_OPS_FFPROBE` first, else PATH), `run_ff(args)` (raises `RuntimeError` with the stderr tail), `probe(path) -> dict` (width, height, fps, duration, frames, has_audio), `encode_args()` (libx264 crf 20, maxrate 12M, bufsize 24M, yuv420p, `-colorspace/-color_primaries/-color_trc bt709`, `-movflags +faststart`, `setsar=1`).

Out of scope: A4-A13; any change to `finance-shorts/`, `lifting-tracker/`, `scripts/`, workflow files; Higgsfield calls; installing tools or packages; committing, staging, branching.

Environment (Windows, PowerShell 5.1): Python `finance-shorts\.venv\Scripts\python.exe` (3.13, pycairo 1.29.2, pillow). Codex's sandbox cannot see the WinGet ffmpeg (FRICTION.md 2026-10-30/11-05): task-local copies are in `media-out/video_ops/tools/ffmpeg.exe` and `ffprobe.exe`; set `$env:VIDEO_OPS_FFMPEG` and `$env:VIDEO_OPS_FFPROBE` to those paths before running tests. Tests must create their own synthetic input with ffmpeg `lavfi` (`testsrc2`, `color`); no real media, no private data.

## Done When

1. [ ] [Codex] `camera_move`, `join_clips`, `text_overlay` exist with the signatures above, plus a working CLI each (`python -m video_ops.camera_move --help` exits 0).
2. [ ] [Codex] One unittest per function that runs the CLI through `subprocess` on a synthetic clip and asserts with ffprobe: camera_move output keeps source size, has the requested frames and its last frame differs from its first (mean abs diff > 0); join_clips cut duration equals the sum of inputs, fade duration equals `sum - duration*(n-1)`; text_overlay changes pixels only inside the text/dim region (frame at t=0 identical within 1 level, frame after `start+1` darker background by about 0.30x and text pixels brighter than the background).
3. [ ] [Codex] Error paths tested: bad move, <2 clips, `duration` longer than a clip, empty/too many lines, existing `dst` without overwrite.
4. [ ] [Codex] `video_ops/README.md` lists each function, its CLI line, and the Higgsfield effect it replaces.
5. [ ] [Claude] Re-run the verify command, review the diff against this allowlist, apply the Judge checklist (`INTENT:` / `TWINS:` lines when required), then `ccx verify` / `task review` / `task done`.
6. [ ] [User] Approves continuing with A4 onwards. Codex does not continue on its own.

## Verify

```powershell
$py = "finance-shorts\.venv\Scripts\python.exe"
$env:VIDEO_OPS_FFMPEG = (Resolve-Path media-out\video_ops\tools\ffmpeg.exe).Path
$env:VIDEO_OPS_FFPROBE = (Resolve-Path media-out\video_ops\tools\ffprobe.exe).Path
& $py -m unittest discover -s video_ops/tests -t . -v
& $py -m video_ops.camera_move --help
& $py -m video_ops.join_clips --help
& $py -m video_ops.text_overlay --help
```

## Stop conditions

Stop and report UNKNOWN / CHECKED / NEEDED when: ffmpeg cannot run in the sandbox (do not request full access or install anything); a required filter is missing (`ffmpeg -filters`); a signature here conflicts with the playbook; more than the first three functions would be needed; two repair attempts at the same failing test. Never weaken a test to pass.

Decisions already made (do not reopen): `drawtext` is not used (no fontconfig); `ffmpeg-python` is not installed, so plain `subprocess`; hard cuts are the default join; Kling clips stay at their native fps unless `fps` is passed.
