# Laptop Efficiency Prompt

Paste everything below the line into Claude Code on your Windows laptop (PowerShell).
Run it from a normal, non-admin terminal.

---

You are helping me make my Windows laptop run faster and stay organised. Work in phases. Do not skip ahead.

## Hard rules
- Phase 1 is READ-ONLY. Do not delete, move, rename, uninstall, disable or change any file, setting, service, startup item, scheduled task or registry key.
- Never run anything that needs Administrator rights. Never touch the registry, Windows services, drivers or security settings (Defender, firewall, UAC).
- Never recommend "RAM cleaners", "registry optimisers" or third-party "PC booster" tools.
- Do not read the contents of personal documents. File names, sizes and dates only.
- Do not print, copy or store passwords, keys, tokens or anything in `.env`, `*.pem` or `*.key` files.
- In PowerShell, use `npm.cmd` / `npx.cmd` / `codex.cmd`, not the plain names.
- If a command fails, show me the relevant error lines and move on. Do not work around it with elevated permissions.
- Label every claim as FACT (you measured it), ESTIMATE or UNKNOWN. Do not guess numbers.

## Phase 1: Audit (read-only)
Collect and report:
1. **Hardware:** CPU model, total RAM, disk type (SSD or HDD), total and free space per drive, Windows version.
2. **Memory and CPU right now:** the 10 processes using the most RAM and the 10 using the most CPU.
3. **Startup apps:** everything that launches at login (`Get-CimInstance Win32_StartupCommand`, plus the startup folders). For each: what it is, and whether it is safe to disable (Yes / Probably / No, with a one-line reason).
4. **Disk usage:** the 20 largest folders under my user profile (`$env:USERPROFILE`), with sizes in GB. Flag the usual space wasters: Downloads, old `node_modules`, `.venv`, `__pycache__`, temp folders, OneDrive files stored locally, old installers (`.exe`, `.msi`, `.iso`, `.zip` in Downloads).
5. **Duplicates:** exact duplicate files (same SHA256 hash) over 10 MB in Documents, Downloads, Desktop and Pictures. List the paths and the total space they waste.
6. **Battery (laptops only):** run `powercfg /batteryreport /output "$env:TEMP\battery.html"` and report design capacity against full charge capacity as a percentage.
7. **Pending updates:** is Windows Update waiting for a restart? (Report only.)

Then give me a **ranked action list**: the top 5 changes by expected impact, each with:
- what to do
- expected gain (ESTIMATE, stated as a range)
- risk (Low / Medium / High)
- whether I do it by hand or a script could do it

End Phase 1 with the honest bottom line: is this laptop's slowness mainly software (fixable) or hardware (for example too little RAM or an HDD), where no cleanup will help much?

**STOP after Phase 1 and wait for me to say which actions to take.**

## Phase 2: Only the actions I approve
For each action I approve:
- **Settings I change by hand** (for example disabling a startup app): give me the exact click path. Do not do it for me.
- **Scripts** (for example sorting Downloads or finding stale dev caches): write a PowerShell script into a `scripts\` folder in this repo that:
  - defaults to dry-run and prints what it *would* do
  - only makes changes when run with `-Apply`
  - moves files to a dated folder or the Recycle Bin rather than deleting them permanently
  - logs every action to a `.log` file next to it
- If the task is well specified and this repo has HANDOFF.md, you may write TASK.md and hand the script to Codex under the Dispatch mode. Review Codex's diff before I run anything.
- Run every script in dry-run first and show me the output before I approve `-Apply`.

## Phase 3: Keep it maintained (optional)
Offer, but do not create without my approval:
- a weekly health-check script that appends free disk space, battery health and the top 5 RAM users to a CSV
- a `winget export` of my installed apps, so rebuilding a laptop takes minutes

## Report format
Short. Tables for the numbers. No filler. Lead with the bottom line.
