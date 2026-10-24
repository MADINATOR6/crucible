# Higgsfield playbook

Distilled from four public tutorials (Roboverse x2, Metics Media, Zinho Automates; see "Sources"). The tool-routing table in section 6 is where the Zinho video's feature tour landed. Model names and credit prices change weekly: confirm with `models_explore` and `get_cost:true`, never trust the numbers here. Affiliate links and paid "bonus packs" in those videos are ignored.

Bookkeeping helper (no network, spends nothing): `scripts/higgsfield.ps1 new|element|log|summary -Project <name>`. State lives in gitignored `media-out/higgsfield/<project>/`.

## 1. Settings intake (ask once, then reuse)

Before the first generation of a project, ask ONE question covering: image model, video model, aspect ratio, resolution, duration, quality. Then `higgsfield.ps1 new -Project <name> -Image .. -Video .. -Aspect .. -Resolution ..` and reuse those silently for every later call in the project. Override only when the user says so.

Defaults when the user has no preference: image `gpt_image_2` (high quality), video a Seedance model, 16:9, 1080p for finals, 8 s per clip. Use 480p or the lowest resolution for the first draft of any video.

## 2. Order of work (each step feeds the next)

1. **Story first.** Give the characters, ask for 4 story ideas, user picks one. List every character, location and prop the story needs: each one needs a reference before any video.
2. **Hero image.** Full body, whole silhouette visible, clear lighting. This is the one image worth running 2-3 times; everything downstream builds on it.
3. **Angles (optional).** The Higgsfield app *Angles 2.0* turns one finished image into the same scene from 12 camera positions with no prompt (observed ~2.4 credits per run). It sometimes returns a glitched frame: run it twice and swap in the good one. Find it with `apps_search`.
4. **Reference sheets**, then **elements** (section 3).
5. **Video shots** with elements bound (section 4). Draft at low resolution, fix only what failed.
6. **Upscale last**, once the take is final (section 5).
7. Assemble in an editor (CapCut or similar): cut dead frames, add music and captions there, not in the generator.

## 3. Reference sheets and elements (consistency)

- **Character:** three panels in one image: full body front, full body back, face close-up. Plain grey background, flat studio lighting. Dramatic light gets baked into every later shot, so never build a reference in it.
- **Prop or product:** plain background, soft light, nothing else in frame. Keep any label or wordmark big and simple (text is where image models fail).
- **Location:** generate it EMPTY, no people. A person in the reference competes with the character element and the wrong one shows up.
- **Same image model for the hero and every reference.** A reference built on one model reads differently on another and consistency drifts.
- Save each as an element (`manage_reference_elements` action `create`; category `character`, `environment` or `prop`; name at most 32 chars), then register it: `higgsfield.ps1 element -Project p -Name runner -Category character -Id <uuid>`, which prints the placeholder.
- Tool-call rules: put `<<<ELEMENT-UUID>>>` inside `params.prompt`. `@name` does not work in tool calls, and element ids must not go in `medias`. Only elements with status `completed` are usable. `kling3_0` ignores elements unless a `start_image` is also supplied; otherwise pick another video model.
- Reuse beats rebuilding: the same prop element can drive a cinematic scene and a product ad.

## 4. Video prompting

- One dense paragraph per shot: scene and mood, camera angle, lighting, atmosphere, then technical camera language at the end. Claude should write this from plain-English intent; the user does not write prompts.
- Name the lens as a field of view in degrees per shot (for example 8 degrees super-telephoto wide, 84 degrees handheld at the shoulder) rather than "cinematic wide shot". A number is something the model can act on.
- Multi-shot in one generation works: bind all elements as references, name 3-4 shots, leave the start frame EMPTY. A start frame locks the opening composition to that image.
- Spoken dialogue goes in word for word, in quotes. Paraphrase causes drift and ad-libs.
- Describe sound too, and check audio sync in the draft (a wrong beat before the action is a common defect).
- Fix by regenerating ONLY the failed shot with a plain-English correction ("it looks like it runs on a treadmill"). Never regenerate a whole multi-clip set for one bad clip.
- Batch size multiplies credits (1 image 6.5, 2 images 13 in one tutorial). Prefer `count: 1` for drafts.
- **Draft mode** (web UI, pricey models like Seedance): render a cheap low-quality preview, then send that exact shot to the full-quality render. If `generate_video` / `models_explore` exposes no draft option, the equivalent is the lowest resolution at `count: 1`.
- Model fit (one tutorial's opinion; confirm with `models_explore recommend`): image: Nano Banana = speed and reference work, GPT Image = clean edits and text, Soul = cinematic editorial look. Video: Kling 3.0 = affordable all-rounder, Seedance = best cinematic but costly, Veo 3.1 and Sora 2 = premium, with built-in sound.

## 5. Finishing

- `upscale_video` last, after the cut is final: upscaling a take that gets cut wastes credits and about 14 minutes per 20 s (Topaz to 4K). Providers: `topaz` (resolution 1080p/2160p, aspect) or `bytedance` (needs source width and height; presets common/aigc/short_series/ugc/old_film). The tutorial's Topaz preset "Rhea" for skin and fabric detail is a web-UI setting that the MCP tool does not expose; tell the user if they want it.
- Most video models cap at 1080p; 4K is always a separate upscale pass.

## 6. Other Higgsfield surfaces worth routing to

| Need | Use |
| --- | --- |
| Product ad (vertical, 15 s, 5 segments) | Marketing Studio (`marketing_studio_video`), preset "hyper motion" for high-energy product shots, reuse the product element. Load `get_workflow_instructions` `ads-studio` first |
| Explainer from one line | Higgsfield Explainer: pick animation style, voice, length, 16:9 or 9:16; leave subtitles off and add them in the edit. `get_explainer_presets` / `resolve_explainer_preset` |
| Many shorts from one take | Shorts Studio: a flat, well-lit 4-120 s source video, then a style preset does the restyle with no prompt; speech timing and audio are preserved. `shorts_studio_create` with `get_cost:true` first (720p only) |
| Character generation | `soul_cast` / AI Cast for characters, a cinematic-locations model for environments, `ai_influencer_prepare` then `_generate` |
| Voiceover | `generate_audio` with a plain-English voice description ("warm, calm, friendly"); or a voice sample for a specific voice |
| Change an existing video, keep the rest | Genjutsu via `generate_video`: motion transfer = `hf_mult_motion_control`, object/product swap = `hf_mult_replace_object`, restyle (20+ styles) via presets. Film once, swap many products |
| Motion-graphics edit from one product photo | Katana (`get_workflow_instructions` `katana`, `get_katana_config`); styles aura farming, motion, clipping. Runs well straight from Claude |
| Product ad from a URL (UGC, unboxing, review, TV spot, try-on) | Marketing Studio: fetch the product page, pick format and avatar; script, video and lip-sync in one pass. For UGC load workflow `ugc-video` |
| Other bundled workflows (load with `get_workflow_instructions`) | `character-sheet`, `product-photoshoot`, `thumbnail-generation`, `video-montage` (assemble clips, music, captions), `video-editing`, `narration`, `ads-studio`, `brand-asset-creation`, `website-builder-flow` |
| 10 variants of an ad that works | Ad Multiplier (`get_workflow_instructions` `ad-multiplier`, one supplied 4-30 s video), then `reframe` for 9:16 |
| Same video in another language | `dubbing` (about 18 languages, lip-synced) |
| Whole faceless-channel episodes | Faceless Studio (theme, script, visuals, voice; saves style and voice). Load workflow `faceless-video` (only when a faceless channel is explicitly asked for) |
| Recurring AI persona | `ai_influencer_prepare` then `_generate` (character builder, shuffle for ideas), saved as an element. Genjutsu can swap her into real footage |
| Directed multi-character scene | Cinema Studio 4.0: up to 50 references, shots to 30 s, 30+ camera presets, per-character emotion setting, extend forward or back. Web UI features; the MCP route is `create_project` with surface `cinematic_studio` |
| Project-style shot management | `create_project` (Cinema Studio surface `cinematic_studio`): keeps elements and generations in one place. Only on user request |

## 7. Claude MCP versus Higgsfield's built-in assistant

Prompt writing, planning and iteration through Claude uses Claude tokens. The in-app Higgsfield assistant spends Higgsfield credits on every chat message. Keep planning, prompt drafting and story work in Claude and send only generation calls to Higgsfield.

## Verified on the live MCP (2026-10-24 smoke test, 5 credits)

- Hero `gpt_image_2` 16:9 (default 1k, low quality): 0.5 credits. Character sheet from the hero as a reference (`medias: [{value: <hero job id>, role: "image"}]`): 0.5 credits, came back as clean front/back/face panels on grey.
- `manage_reference_elements` create from the sheet's `image_job` id and its url: status `completed` at once.
- `seedance_2_0`, `mode: "fast"`, 480p, 4 s, `generate_audio: false`, prompt `<<<ELEMENT-UUID>>> walks ...` and NO start frame: 4 credits (`get_cost` quoted exactly 4). The keeper's hat, coat, beard and lantern all held in the clip.
- `std` mode is needed for 1080p/4k; `fast` allows 480p/720p only. A 4 s fast clip took about 3 minutes; poll `jobs_wait` sparingly (`type` reads `image` for videos, ignore it).
- Total matched the balance drop (574 to 569) and `higgsfield.ps1 summary` (5.0).

## Sources

`Lj-PpzAlqek` (Roboverse, Claude + Higgsfield MCP), `dJSJMt4ESEU` (Roboverse, advanced settings), `3W1VhiKLNp4` (Metics Media, beginner). `ssviusnvaec` (Zinho Automates, beginner guide; transcript via the video-vision tool because YouTube captions returned 429). Workflow names in section 6 were checked against the live `get_workflow_instructions` catalog on 2026-10-24.
