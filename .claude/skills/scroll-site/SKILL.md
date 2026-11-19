---
name: scroll-site
description: Build a scroll-driven website (the page plays a video as you scroll, e.g. a car that gets washed, a house that gets built) from a Higgsfield clip and a no-build canvas template. Use for "scroll website", "scroll to reveal", "interactive landing page from a video", or a client-style one-page site with a hero clip.
---

# /scroll-site

A scroll-scrubbed page is a frame sequence drawn to a `<canvas>` by scroll position. No framework, no build step, no dependency (same stance as `lifting-tracker/`). Template: [template/index.html](template/index.html). Codex does not read `.claude/skills`; it reads this file and the template by path.

## Pipeline

1. **Storyboard in Claude (free).** 3-5 beats, one caption each, one clip per beat or one clip for the whole page. Decide aspect for the device that matters: portrait 9:16 for phones, 16:9 for desktop. Both Android and iOS must work (user rule), so test a narrow viewport.
2. **Generate the clip(s) through Higgsfield**, never by hand: a ccx `media-generate` task (HANDOFF.md, Media task) with a credit cap, a quote first and the user's approval. Follow `.claude/skills/higgsfield/playbook.md`: start frame and end frame as references, cheap draft first, regenerate only the failed beat. For a precise camera path (the scroll pacing depends on it) use the grey-box scene step in the playbook. No faces of real people without their agreement; no private data in prompts.
3. **Extract frames (local, free, `media-edit` L2, Codex).** Work inside the task's one owned folder, gitignored `media-out/higgsfield/<project>/`, with the clip there:

   ```powershell
   New-Item -ItemType Directory -Force site/frames | Out-Null
   ffmpeg -i clip.mp4 -vf "fps=15,scale=960:-2" -c:v libwebp -quality 70 site/frames/f%04d.webp
   ```

   Two budgets, both for a phone: download under about 8 MB, and **decoded memory** (frames x width x height x 4 bytes, because every frame stays resident as a bitmap) under about 150 MB. 75 frames at 960x540 is about 156 MB; a 5 s clip at 15 fps lands there. Over budget: lower fps, then width, before anything else. For a portrait clip swap to `scale=540:-2`. Commit a site only after the user approves the media.
4. **Wire the template (Claude, plain files).** Copy `template/index.html` to `site/index.html`; set `FRAMES`, the caption texts and `data-at` values, and the `#track` height (taller = slower scrub). Serve statically (`python -m http.server` in `site/`); `fetch` needs http, not file://.
5. **Verify.** Run it in the browser pane: resize to a phone width, scroll to 0, 50 and 100 percent and check the canvas draws and the right caption shows; check the console is clean. `prefers-reduced-motion` users still get working scroll.
6. **Review media.** The video-expert agent checks the clip against the brief; Claude reviews the page.

## Not included (ask before building)

Booking form, lead capture, SMS or email, a dashboard: those need a backend and third-party accounts. They are separate L4-adjacent work with their own task, never part of the template. Publishing or deploying the site needs the user's explicit request for that exact action.
