# LT-UI-7: share backup, backup reminder, screen awake and vibration

## Mode and owner
LT-UI-7 · normal · risk low (touches the settings schema) · Dispatch in its own worktree. Codex implements; Claude styles, reviews and owns all Git. Synthetic data only. The user trains with an Android phone; everything must also work (or degrade quietly) on iPhone.

## Goal
Backups are easy to move off the phone and the app reminds you when one is overdue; the screen stays on while you train; the phone buzzes on a one-tap log and when rest ends (with both switchable).

## Relevant files
- `lifting-tracker/src/ui/views/data.js` (Backup card, `#export-json`, Settings card), `src/ui/views/train.js` (header, `logAsPlanned` path, `startRest`), `src/ui/rest-timer.js`.
- `lifting-tracker/src/store/programme-schema.js` (`DEFAULT_SETTINGS`, `sanitizeSettings`), `src/store/backup.js`, `src/ui/state.js` (`saveSettings`, `exportBackup`, `sets`, `usingExample`), `src/ui/dom.js` (`download`, `toast`).
- `lifting-tracker/UI-CLASSES.md` (contract), `test/store/schema.test.js`, `test/store/backup.test.js`.

## Write allowlist
`lifting-tracker/src/ui/views/data.js`, `src/ui/views/train.js`, `src/ui/rest-timer.js`, `src/store/programme-schema.js`, `src/store/backup.js`, `test/store/schema.test.js`, `test/store/backup.test.js`. No new modules (the offline cache list is Claude's), no CSS, no `sw.js`.

## Resolved rules

### Settings
1. Add to `DEFAULT_SETTINGS` and `sanitizeSettings`: `keepAwake` (boolean, default true), `vibrate` (boolean, default true), `lastBackupAt` (strict ISO date or null), `backupSnoozeUntil` (strict ISO date or null). Bad values fall back to the defaults, like the existing fields. Data → Settings gets two checkbox rows: "Keep the screen on while training" and "Vibrate on one-tap logs and when rest ends".

### Share backup
2. Data → Backup: when `navigator.canShare?.({ files: [new File(['{}'], 'b.json', { type: 'application/json' })] })` is true, add a primary "Share backup" button first in the `.actions` group: it builds the same JSON as Export and calls `navigator.share({ files: [file], title: 'Lifting Tracker backup' })` (Android's share sheet: Drive, Files, email…). A cancelled share (`AbortError`) does nothing; any other error falls back to the download. Export stays as is.
3. After a successful share or download, `saveSettings({ lastBackupAt: todayIso(), backupSnoozeUntil: null })`. The Backup card shows "Last backup: ${long date}" or "No backup yet".

### Reminder
4. Pure `backupReminder({ lastBackupAt, backupSnoozeUntil, loggedDates, today })` in `store/backup.js` (`loggedDates` = the distinct dates of the athlete's own logged sets). Returns `{ due: boolean, sessions }` where `sessions` = logged dates after `lastBackupAt` (all of them if never backed up). Due when not snoozed (`today >= backupSnoozeUntil` or no snooze) and either: never backed up and `sessions >= 3`; or `sessions >= 5`; or `sessions >= 1` and `lastBackupAt` is 14 or more days before `today`.
5. Train shows it (only with real data, never `usingExample`) as a `.banner` under the header: "${sessions} sessions since your last backup." (or "…and no backup yet."), with `.btn.small primary` "Back up" (share when available, else download, then rule 3) and `.btn.small ghost` "Later" (`backupSnoozeUntil` = today + 3 days).

### Screen awake
6. While the Train screen is showing and `keepAwake` is on, hold `navigator.wakeLock.request('screen')` when available; re-request on `visibilitychange` to visible (the browser drops the lock when the app is hidden); release it when Train is left or the setting is turned off. Unsupported or refused requests are ignored silently. Use the same "detect leaving the view" approach as `muscles.js` (a `MutationObserver` on the root), or something simpler if it holds.

### Vibration
7. `startRest(seconds, { vibrate = true } = {})`: the existing end-of-rest buzz only when `vibrate`. Train passes the setting. A successful one-tap log buzzes once (`navigator.vibrate?.(30)`) when `vibrate` is on. Never throw when vibration is unsupported (iPhone).
8. Fix the garbled close label in `rest-timer.js` (`Ã—` must be `×`).

## Out of scope
CSS, `sw.js`, new files, docs.

## Verify
- `cd lifting-tracker && node --test` (baseline: 281 pass, 1 skip; may only go up).
- `schema.test.js`: the four settings (defaults, valid, invalid). `backup.test.js`: `backupReminder` cases (never backed up with 2 and 3 sessions; 4 and 5 sessions since a backup; 1 session after 13 and 14 days; snoozed until tomorrow; snooze ended today).
- `git diff --check`; no `Ã` left in `src/`.

## Done When
1. (Codex) Rules 1–3. 2. (Codex) Rules 4–5 with tests. 3. (Codex) Rules 6–8. 4. (Codex) Report: classes wanted, what the browser check could not cover. 5. (Claude) Styling, phone check, review, commit.

## Stop conditions
Stop and report (UNKNOWN / CHECKED / NEEDED) if a rule needs a file outside the allowlist or breaks restoring an older backup (old settings without the new fields must load).
