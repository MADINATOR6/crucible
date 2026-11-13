# Agent Pals wallpaper

A local 1920×1080 SVG scene: Claude plans, Codex builds, Gemini reviews.
No build, dependencies, network requests, external images or fonts.
The panels are short policy/tool labels, not live installation probes.

In Lively, choose **Add Wallpaper → Choose a file** and select `index.html`.
Keep the whole `wallpaper` folder together. `wallpaper.html` redirects here.
Open `index.html#still` for a static frame; reduced-motion preferences also
disable all animation. The left 220 px and bottom 50 px are reserved.

From the repository root, run the optional helper in a visible terminal:
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File wallpaper\status-writer.ps1
```
Stop it with Ctrl+C in that terminal. For one snapshot, append `-Once`.
Use `-Repo <path>` to select another ccx checkout; default is this folder's parent.
The helper replaces `status.js` atomically every five seconds. The page polls
using local script tags. Missing, disabled or >60-second-old data uses demo mode.
Unchanged display values do not restart the animation.

Privacy: only lane states, UTC timestamps, validated task IDs and counts leave
ccx state. No task titles, notes, approval quotes, paths or branch names are
exported. `status.js` is generated, local and git-ignored. It is executable JS:
keep the folder trusted. All displayed fields are validated and escaped.
`pals.html` and `launch.ps1` remain the separate, unchanged mascot window.

Checks (Node 18+ and Windows PowerShell):
```powershell
node --test "wallpaper/test/*.test.js"
powershell -NoProfile -ExecutionPolicy Bypass -File wallpaper\status-writer.ps1 -Once
node -e "require('./wallpaper/scene.js').renderScene({live:false},{})"
```
Claude owns Edge demo/live visual checks, ccx verification and final review.
