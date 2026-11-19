---
name: blender
description: Build, fix and render Blender scenes with Claude and Codex - realism diagnosis (scale, construction, contact, materials, light), staged scene building from scripts, safe handling of downloaded .blend files and add-ons, and resumable background renders with automatic frame checks. Use for /blender, "make this Blender scene look real", "render this .blend", "batch render", a Blender animation or short film, or auditing a downloaded .blend.
---

# Blender (Claude + Codex)

Shared method for both agents. Codex does not read `.claude/skills`, so it prints this file with `blender.ps1 show`. Sources and licences: [NOTICE.md](NOTICE.md).

```powershell
.\scripts\blender.ps1 show                                   # this method
.\scripts\blender.ps1 version                                # which Blender the wrapper found
.\scripts\blender.ps1 audit  -Blend <file> -Out <new.json> [-Match "Chair|Sofa"]   # exit 3 = safety findings to read
.\scripts\blender.ps1 render -Blend <file> -Out <dir> -Frames 1-240 [-Samples 128] [-Percent 50] [-Engine CYCLES] [-Device GPU] [-Camera <name>] [-PersistentData] [-TrustedFile]
.\scripts\blender.ps1 check  -Out <dir> -Frames 1-240 [-Cuts 61,121]
.\scripts\blender.ps1 test                                   # offline self-test
```

Blender is found through `CRUCIBLE_BLENDER_EXE`, then `blender` on PATH, then the newest `Program Files\Blender Foundation\Blender *\blender.exe`. Python for `check`/`test`: `CRUCIBLE_PYTHON_EXE`, else `python` or `python3` on PATH (skipping the Microsoft Store stubs in `WindowsApps`), else the newest `%LOCALAPPDATA%\Programs\Python\Python3*\python.exe`. The scripts run in Blender 4.4 or newer; they were tested on Blender 5.3. The wrapper never installs anything, never goes online and never saves a `.blend`.

## Roles and gates

- **Claude** builds (scene scripts), runs Blender, looks at the renders and reports. **Codex** plans pipeline code under the usual Roles, reviews scene scripts and checks the evidence read-only (audit JSON, `check` output, stills). If Codex's sandbox cannot start Blender (as with the WinGet ffmpeg in FRICTION.md), Claude runs it and Codex works from the saved files.
- **The user decides**: the brief or storyboard before anything is built; every download (asset, add-on, texture pack); any render estimated over 30 minutes; any live control of their open Blender window.
- **Never**: install an add-on or run a script nobody has read; sleep or shut down the PC after a render; commit `.blend` files, renders or downloaded assets; put private data (the workbook, `nursing-a2/`, personal photos) into a scene or a third-party tool; present a 2D generated or retouched image as a fixed 3D model.
- Blender is free and local, so there is no paid-action gate. Paid assets or generators (`/generate`, Higgsfield) keep their own L4 rules.

## Project layout

Everything under gitignored `media-out/blender/<project>/`:

| Path | Holds |
| --- | --- |
| `scene/<name>-v001.blend`, `-v002` ... | Never overwrite a version; save the next one. A low-res test copy never replaces the delivery file. |
| `scripts/NN_<stage>.py` | Scene-specific build scripts, one per stage. Promote one into the repo only when the user asks. |
| `assets/` + `ASSETS.md` | Each asset: source URL, author, licence, date, audit result. |
| `review/` | Audit JSONs, `ISSUES.md`, test stills, before/after pairs. |
| `renders/<run>/f_####.png` | One folder per run and settings; `render-manifest.json` and `status.json` sit beside the frames. |

## Untrusted files first

A `.blend` can carry Python that runs on open when auto-run is on. Before using anything you did not make:

1. List each archive before unpacking. Any `.exe .dll .bat .cmd .ps1 .vbs .js .py .pyc .sh` inside: stop and tell the user. Before unpacking, ask the user to scan the download folder with Windows Security (Defender).
2. Run `blender.ps1 audit` (factory settings, auto-run off). Exit 3 means text blocks, scripted drivers, OSL script nodes or linked libraries exist: read each one and record the result in `ASSETS.md` before the file is ever opened with auto-run on.
3. Add-ons: read the source first. Compiled-only (`.pyc`) code cannot be read, so it is not installed. A small script of our own usually replaces an add-on (a scatter, a car rig, a camera shake).
4. Renders keep auto-run off. `-TrustedFile` is for the user's own file whose scripted drivers need Python.

Live control: some public Blender skills run a socket listener inside Blender that executes any code sent to it. Any program on the machine can then run code as the user. Do not set one up by default; background scripts do the same work. If the user wants to watch changes live, make it a separate task: bind 127.0.0.1 only, require a per-session token, and stop it afterwards. Claude may also see a `Blender` MCP connector (`mcp__Blender__*`) that drives the user's open window; it is still live control of their file, so use it only when the user asks for that session, inspect before changing, and never save over their file.

## New scene

1. **Brief first.** Shot list: each shot's timing, camera move, lens, where the subject is, mood, sound cue. Delivery: stills or video, resolution, fps, length. Nothing is built until the user approves it, and every later choice is checked against it.
   - **A tutorial or reference clip is the best brief.** When the user gives a tutorial link, read its whole transcript and take the reference shots apart instead of inventing a look: find the cuts (`ffmpeg -vf "select='gt(scene,0.3)',showinfo"`) and look at the frames either side of every detected cut, since short shots slip through. Then for each shot write the cut times and an estimate of camera height, lens, move and speed, marked as estimates with the assumption behind each (a known object size, a door height, metadata); frames alone do not pin these down. Credit the tutorial's author in `ASSETS.md`. Its paid add-ons are replaced by our own scripts, never installed unread.
2. **Real assets over invented ones.** Use the user's own, CC0 (Poly Haven, ambientCG) or properly licensed models for organic and complex things. Script the simple things (roads, terrain, walls, scatter, rigs) and the cameras; scripted hero models (houses, cars, characters) read as flat boxes beside scanned assets, so get the hero from an asset or cut it from the shot. Record the licence.
3. **Build in stages**, one script per stage, saving a new version after each. Scripts must be safe to re-run: get-or-create by name, never duplicate. Layout data that several stages share (paths, positions, camera spots) lives in one JSON; look values you will tweak (haze, exposure, density) live in a params JSON, not in code.
4. **Test after every stage**: a small still (`-Percent 25 -Samples 16`) next to the reference frame (`ffmpeg ... -filter_complex hstack` into `review/`), fixed before moving on. A clay or Workbench pass checks layout and timing in minutes; render one of the whole clip before the final run, so a camera or timing mistake costs minutes, not hours. When the render-and-compare loops get long (many stages or cameras), a subagent on a cheaper model can run them with a tight brief (stage, cameras, reference frames, what to compare) and return a short report, so the main session keeps the plan. Use `video-expert` for judging clips; Claude still makes the fix decisions, and Codex's review role is unchanged.
5. **Motion from physics or measurement**, not guessed curves: a speed profile, wheels turning by distance over radius, front wheels steering toward the path's direction a little ahead, body roll and a small suspension bounce from the road, banking from acceleration, a camera height and lens measured from the reference. If a hero asset still looks wrong after honest fixes, swap the hero and keep the world, path and cameras.
6. **Look**: lighting first, grade last and only where a shot needs it. At night the practical lights (lamps, windows, headlights) light the scene, not the sky. Use subtle real-feeling camera shake, a plausible lens and depth of field. Details in Cinematic look below.
7. Then render, check and encode (below). Renders are silent: sound is its own step (CC0 or properly licensed effects, each listed in `ASSETS.md`, mixed with ffmpeg or by the user in their editor).

## Cinematic look

The realism ladder, biggest win first. When a shot looks CG, find the lowest rung it is missing before touching anything higher:

1. Real textures at real scale (Surface scale and Material optics in the table below).
2. Path-traced light (Cycles): soft contact shadows under objects, correct reflections. EEVEE is for previews and stylised work.
3. Depth of field with a focus object, so the eye knows where to look.
4. Motion blur on anything that moves, the camera included.
5. Framing: a wide aspect set by the render resolution (2.39:1, e.g. 1920x804, rather than bars painted on top).
6. Grade last: contrast, white balance, a slight vignette.

Lighting and camera rules of thumb (starting points from tutorials; judge by eye, and keep the reason in the params JSON):

- **Key light behind or beside the subject** is the usual default: backlight and rim give shape and separation, while a key straight from the camera flattens. A motivated frontal key or a soft fill is fine when the reference or story calls for it. Indoors, large emission planes (top and back) with ray visibility Camera off make soft studio light.
- **Lens**: about 24 mm for environments, 50-85 mm for characters and products. Set a real sensor size.
- **Depth of field**: f-stops only mean what they mean at real-world scale, so fix scale first. Tutorials quote f/0.1-0.8 for their scenes; at true scale start nearer f/1.4-4 and stop down until it stops looking like a miniature. Eight blades round the bokeh; aperture ratio 2 gives an anamorphic oval (a style choice).
- **Fog**: a box with Volume Scatter (density about 0.01, anisotropy about 0.7, which scatters forward and gives god rays behind the subject) is real but slow. Background haze is almost free: enable the pass in View Layer > Passes > Data > Mist, set Start and Depth in World > Mist Pass, and in the compositor use Mist as the factor of a Mix between the image and a haze colour.
- **Compositor finishing**, all subtle: Glare (bloom or fog glow) on bright highlights, Lens Distortion with a little dispersion for chromatic aberration, vignette. If you can name the effect when you watch, it is too strong.
- **Output depth**: 8-bit bands in skies and fog. The wrapper always writes PNG; set `image_settings.color_depth = '16'` in the render-settings stage script (the wrapper keeps the file's depth). That PNG has the AgX view transform baked in, so it suits delivery and light grading. Heavy grading wants scene-linear half-float EXR, which the wrapper does not write yet; that is a separate wrapper change.

## Fixing realism in an existing scene

1. Audit, then render the current state from the problem cameras. Find the user's "that chair" by camera and position; ask only when two objects fit and the fix would differ.
2. Keep `review/ISSUES.md`: ID | where (object, camera, frame) | what looks wrong | likely physical cause | change | evidence (version, stills, measurement) | state.
3. Diagnose by cause (table). State a testable hypothesis and isolate it before rebuilding anything: swap in a neutral grey material, light with a neutral studio setup, look from an orthographic or 50 mm view.
4. Order: structure before surface; what the main shots show most; shared assets that appear in many shots.
5. Re-render with the same camera, exposure and framing as before. Open the images and look. A script exiting 0 or a finished sample count is not a visual pass.
6. Re-render every view that sees the changed object, its shadow or its reflection.

| Cause | Typical symptoms | Check | Usual fix |
| --- | --- | --- | --- |
| Scale and silhouette | toy-like, odd proportions, edges too round or razor sharp | units, real dimensions against a reference, lens, bevel width | correct size and bevels; judge in a 35-50 mm view |
| Construction | reads as one solid block, seams that make no sense | panels, wall thickness, parts, fasteners, openings | model the parts and thicknesses the real object has |
| Load and contact | floating, intersecting, soft things look rigid | supports, gravity, compression, contact shadow; low side views | seat it, compress it (cloth or soft-body sim), add contact geometry |
| Surface scale | giant wood grain, fabric like a grid, stretched grass | UV or mapping space, object scale, real texture size | fix the mapping, use world-size textures, break repetition |
| Material optics | metal reads as plastic, glass vanishes, every surface equally bright | metal vs dielectric, roughness range, thickness, normals, colour space (roughness and normal maps are Non-Color) | right material class, roughness variation, something for shiny things to reflect |
| Light and imaging | flat, grey, blown out, no depth | light direction and size, HDRI, exposure, view transform (AgX), white balance, depth of field | fix the light; never paint shading into base colour |
| Environment logic | plants where nothing grows, furniture you could not use | ground zones, walkways, door swing, growing areas | arrange by function |
| Variation | copy-paste look, too clean, random damage | instance repetition, where hands, feet and water actually go | variation with a cause, not uniform noise |

Choose the right level: geometry for anything that changes the silhouette, occlusion or contact; normal or bump for detail inside the silhouette; roughness for how reflections spread; base colour for colour only. More samples, noise or polygons never fix wrong geometry.

Record four states separately: **modelled**, **rendered at the current version**, **checked by eye**, **approved by the user** (with the version and their words). Never mark something approved without a real reply.

## Rendering

The wrapper already uses absolute paths, keeps auto-run off, writes a PNG sequence, resumes, and refuses to mix frames from a changed file or changed settings. Command-line facts (Blender manual): arguments apply in order, so `-o`, `-s`/`-e` and `-S` go before `-a` or `-f`; render one scene per process; `--factory-startup` gives a clean run.

- Never render inside the live UI session; render in background Blender from a saved file. Do not save the `.blend` while a render of it runs: the manifest will then (correctly) refuse to resume.
- Test small, render big: `-Percent 25 -Samples 16` stills while building; final quality only at the end. Judge fine textures (gravel, fabric) at production samples, because the denoiser smears them at low samples.
- Benchmark before a long job: render the same 3-5 frames at two settings (for example 256 samples, then 128 with denoising) into two folders, compare the seconds on the `FRAME` lines and the stills side by side, and keep the cheapest that looks the same.
- Speed levers: adaptive sampling with denoising (feed the denoiser at least the Albedo pass); fewer bounces where the scene allows (night); caustics off and clamp indirect for fireflies; `-PersistentData` for heavy static scenes (a likely cause when the GPU idles between frames while the CPU prepares a big scatter; it costs memory, so benchmark with and without it and check memory headroom); bake particles and simulations to disk first (otherwise every frame re-simulates); texture limits and simplify for tests only; camera culling.
- Render only the frames the edit uses (`-Frames 1-60,121-180`). A crash then costs one frame.
- An overnight render needs the machine awake but never a sleep or shutdown command: the user's power settings, or the desktop app's keep-awake, cover it.
- Light per shot when the reference does: one sun angle per camera is a standard cheat. Set it in that shot's stage, or keyframe it at each cut with Constant interpolation (otherwise the sun turns during the shot and shadows crawl). Keep the angle where two shots must match.
- Estimate before the final run: average seconds per frame from a test times the frame count. Tell the user, and over 30 minutes wait for their OK.
- After rendering: `blender.ps1 check` with the planned cuts, then look at the first, middle and last frame of every shot and at every cut. Then encode with ffmpeg (`-pix_fmt yuv420p` for ordinary players).
- Do not hard-code OptiX, CUDA or one machine's GPU. `-Device GPU` uses the devices set in that machine's Blender Preferences. When none is usable (Preferences > System set to None, or a driver too old for OptiX), Cycles quietly renders on the CPU; `render` then prints a `WARN ... runs on the CPU` line, so read it before trusting a GPU timing.

## Blender Python pitfalls

- Render engines and other enums are registered at run time, and the listed items can be incomplete (in Blender 5.3 the list shows only `BLENDER_EEVEE`, yet `CYCLES` works). Set the value and catch `TypeError`. EEVEE's identifier is `BLENDER_EEVEE` in 5.x (checked on 5.3); 4.2-4.5 used `BLENDER_EEVEE_NEXT` (release notes, not re-checked here).
- Blender 5 actions are layered: `action.fcurves` no longer exists (checked on 5.3). Use `bpy_extras.anim_utils.action_get_channelbag_for_slot(action, slot)`.
- From 5.x, set `image_settings.media_type = 'IMAGE'` before choosing a still format.
- Imported objects often rotate by quaternion; writing `rotation_euler` then does nothing. Check `rotation_mode`, parents and constraints, and confirm orientation from the geometry (the seat faces the table), not from numbers. `audit` lists these objects.
- Node display names are localised and renamed between versions. Find nodes by type (`node.type == 'BSDF_PRINCIPLED'`), not by the name "Principled BSDF".
- Object scale changes Object-space texture size. Applying scale can break instances, rigs and animation; check before you apply.
- A ray cast that misses does not prove contact, and non-overlapping bounding boxes do not prove thin parts (legs, leaves, cloth) don't intersect.
- A particle emitter hidden from the camera can also hide its particles; use `show_instancer_for_render = False`.
- Motion blur samples sub-frame times, so only animation Blender can evaluate between frames blurs: keyframes, drivers, constraints. A `frame_change` handler or per-frame script that sets values from the integer frame is frozen inside each frame (wheels that spin but never blur); a handler only blurs if it reads the fractional time (`frame_current_final`). Baking such motion to keyframes is the reliable fix; then check a moving part in a still at full samples.
- Geometry Nodes trees built from Python break easily (socket names and node types change between versions). Keep generated trees small, find sockets by identifier or type, and prefer plain Python plus instancing for scatter.
- Relative paths (`//textures/...`) resolve against the `.blend`. When saving a copy elsewhere, check `relative_remap` and reopen to confirm; pack or ship textures for a portable delivery, and re-run `audit` on the copy.
- A script that edits materials or node links may not be safe to re-run after it crashed halfway. Work on a version copy.

## Done

Report per issue ID what changed, the evidence paths (audit JSON, stills, `check` output), the four states, the model and render paths, and an `Untested:` line for anything no check or look covered. Opening the result in the user's Blender window is a separate step: a background load does not mean the user can see it.
