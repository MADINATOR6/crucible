# RES-1: Independent read of "How To Make $10,000/Month With Higgsfield" (Iman Gadzhi)

Task ID: RES-1. Type research, class normal, risk low, owner codex, role research (read-only). Base: `ccr-1f93be83-oia0nt` branch.
Video: https://www.youtube.com/watch?v=vOBKA8n15vg (21:55, uploaded Wed 28 Oct 2026).

## Goal

Give Claude an independent second read of this video before the user spends money or study time on it. The user is an international student in Australia on a student visa, studying nursing and working in healthcare, and wants side income through Crucible. Claude has written its own analysis separately; do not read `handoffs/2026-10-29-claude-higgsfield-income-video.md`, so the two reads stay independent. Claude merges them.

## Input

The English auto-captions, prepared before dispatch outside the repo (Codex's sandbox may block the network):

```powershell
yt-dlp --skip-download --write-auto-subs --sub-langs en --sub-format vtt -o "$env:TEMP\crucible-res1\v.%(ext)s" "https://www.youtube.com/watch?v=vOBKA8n15vg"
```

Read `%TEMP%\crucible-res1\v.en.vtt`. If it is missing, report BLOCKED with the exact path checked. Never commit the transcript.

## Questions

1. **Claims.** List every factual or numeric claim in the video (growth, earnings, prices, RPM figures, platform rules). For each: who could verify it, whether you verified it (VERIFIED with source, or UNVERIFIED), and whether the speaker has a stated interest in it.
2. **Arithmetic.** Recompute every money calculation in the video with working (method 1 Airbnb uplift and $500 x 20 clients; method 2 $2,000 / 12 ads and 5 clients; method 3 watch hours). Name the assumption each result depends on most.
3. **Platform rules.** Check the current rules each method depends on, with primary sources: YouTube Partner Program entry thresholds (including any change announced for 2027) and its policy on mass-produced or AI content; Airbnb's rules on edited or AI listing photos; Meta's rules on AI-generated ad creative.
4. **Fit for this user.** Using only what is stated in Goal, rank the three methods on: time to first dollar, recurring vs one-off, sales effort, policy risk, and how much of the production Crucible already covers (`finance-shorts/`, `instagram/`, `.claude/skills/higgsfield/playbook.md`, the Media task in `HANDOFF.md`). Do not give migration or tax advice; name the questions a registered migration agent or tax agent must answer.
5. **Workflow lessons.** What, if anything, should Crucible change (playbook rules, task types, ledger use) to run the best-ranked method? Propose only; do not edit.

## Rules

- Read-only. Never edit, create or delete repository files. No Higgsfield, Generate or other paid calls.
- Mark every answer VERIFIED or UNVERIFIED with its source (URL, path:line, or command and output).
- Out of scope: signing up to the video's challenge or prompt links, any outreach, any spend.

## Done When

- [ ] Codex: answers to questions 1-5 in the Researcher report format, Status READY_FOR_CLAUDE_REVIEW, PARTIAL or BLOCKED.
- [ ] Claude: merge with its own analysis, note agreements and disagreements, update the handoff note.

## Launch (Windows, repo root)

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\ccx.ps1 task add -Id RES-1 -Title "Higgsfield income video: independent read" -Type research -Class normal -Risk low -Owner codex -TaskFile tasks/RES-1.md
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\codex-dispatch.ps1 -Role research -TaskFile tasks\RES-1.md -TaskId RES-1
```
