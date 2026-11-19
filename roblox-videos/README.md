# roblox-videos: ForgeGUI shorts (Windows)

Windows port of the BloxClips / ForgeGUI partner-video workflow. 9:16 (1080x1920) Roblox Studio gameplay, a chat panel that types each request, a local Kokoro voice, subtitles, and the official logo with an on-screen call to action.

## One-time setup (done on this machine)
- `tools/kokoro/.venv` (uv, Python 3.12) with `kokoro soundfile numpy pillow pip`. First voice line downloads the model weights.
- ffmpeg is on PATH. NVENC is **not** usable (driver too old for this ffmpeg), so everything encodes with libx264. `forge.video_encoder()` switches to NVENC automatically after a driver update.
- Put the official `forgegui_badge.png` in `forge_kit/assets/` (gitignored). It is the only logo allowed; the build stops with a message if it is missing.

## Making a video
1. Copy `00-template` to `NN-name`. Build the thing in Roblox Studio (the Luau scripts go in `NN-name/studio/`; press Ctrl+S yourself, scripts here never save the place).
2. Studio must be the front window. Record: `.\tools\record.ps1 -Episode NN-name -Seconds 30`.
3. Save Studio's `[FILM] <mark> <time>` output lines to `footage/console.txt` (optional; you can also just hand-pick cut times).
4. Fill in `edit.py` (CUTS, REQUESTS, NARRATION), then render:
   `.\tools\kokoro\.venv\Scripts\python.exe NN-name\edit.py`
5. Check frame grabs, then post with the kit below.

## Standing rules (from the partner program)
- Voice: say "Forge G-U-I" via the 4th narration field (subtitle shows ForgeGUI). Never say "AI". Casual, short lines. First line mentions ForgeGUI and what is being made.
- Chat panel only visible while a request is typed and sent. Panel sits at y 1200-1455 so the platform's description text doesn't cover it.
- **Call to action:** spoken "Try ForgeGUI today." plus on-screen "Try ForgeGUI today" with the logo, >= 3 s (`logo_dur`) over the final gameplay. This is the fix for the "Missing forgeGUI CTA" rejection.
- Post kit after every video: title (with ForgeGUI), description ("I used ForgeGUI..."), TikTok caption, pinned comment. Hashtags in exactly this order: `#forgeguipartner #robloxdev #roblox`.
- No bots, alt accounts, like-for-like or paid promotion. Max 3 posts a day per account. Never upload or post on your behalf: you do that.

## Notes
- Rendering is CPU-only: about 5-10x realtime plus voice-line generation (cached in `build/voice`).
- `footage/`, `build/`, `*.mp4` and the venv are gitignored.
