# END-2 — End-date calculator in the PhilGEPS extension sidebar

Owner: Claude (implementer). Reviewer: Codex (`-Role verify`). Mode: Dispatch. tool: none.
Route: normal and clear, so Claude wrote this spec (AGENTS.md, Routing).

## Goal

In the PhilGEPS Print Layout Helper sidebar, from a proceed date, show the end date "1 month after", excluding
Saturdays, Sundays and Philippine holidays. The existing field and layout tools keep working unchanged.

The user corrected the first attempt (a separate page): the calculator belongs **in the sidebar**. The extension's
source now lives in this repo at `philgeps-layout/`, copied unchanged from `philgeps-layout.zip` v2.0.

## Business rules (resolved by the user, 2026-11-07)

1. "1 month" is the same date next month, then moved forward to the next working day. Not a count of working days.
2. A date the next month does not have uses that month's last day (31 Jan 2026 → 28 Feb 2026), then rule 1 moves it.
3. Non-working: Saturday, Sunday, the proclaimed regular holidays and special (non-working) days, and any day the user adds.
4. A special **working** day stays a working day (EDSA Anniversary, 25 Feb).
5. Holidays come from the official proclamations, never memory. The user can add days declared later.
6. A day declared for one area counts only when the user turns that area on. If the end date lands on such a day
   with the area off, say so.
7. A result that passed through a year with no loaded list is flagged unconfirmed, not presented as final. A year
   whose Eid dates are not yet proclaimed shows a warning.

## Sources

| Dates | Source |
| --- | --- |
| 2026 list | Proclamation No. 1006, s. 2025 (https://pco.gov.ph/wp-content/uploads/2025/09/20250903-PROC-1006-FRM.pdf.pdf) |
| 20 Mar 2026, Eid'l Fitr | Proclamation No. 1189, s. 2026 (https://pco.gov.ph/news_releases/palace-declares-march-20-regular-holiday-nationwide-for-eidl-fitr/) |
| 27 May 2026, Eid'l Adha | Proclamation No. 1264, s. 2026 (https://pco.gov.ph/wp-content/uploads/2026/05/20260521-PROC-1264-FRM.pdf) |
| 2027 list | Proclamation No. 1427, s. 2026 (https://pco.gov.ph/wp-content/uploads/2026/09/20260908-PROC-1427-FRM.pdf) |
| 16–18 Nov 2026, NCR only | Proclamation No. 1447, s. 2026 (https://pco.gov.ph/news_releases/palace-declares-nov-16-18-as-special-non-working-days-in-ncr-for-asean-summit/) |

2027 Eid dates are not proclaimed yet. Other local one-town days are not loaded; the user adds what applies.

## Write allowlist

- `philgeps-layout/` (new)
- `tasks/END-2.md`, `tasks/END-2-review.md`

## Out of scope

Changing the field or layout tools, including how saved values carry over; any working-day count mode; a build step;
runtime dependencies; AGENTS.md or CLAUDE.md; pushing or publishing; the live PhilGEPS site.

## Done When

- [ ] Claude: `calc.js` applies rules 1–7, with tests covering month end, leap year, year rollover, chained skips,
      special working day, area on and off, added days, unconfirmed year, pending Eid and invalid input.
- [ ] Claude: `holidays.js` matches the sources above, with weekdays checked against the proclamations' printed weekdays.
- [ ] Claude: the End date section works in the real extension: survives the site rewriting the popup, is hidden in
      print, added days and the NCR choice persist across popups, and a field can still be added and filled beside it.
- [ ] Codex: independent review of the diff, including re-checking `holidays.js` against the sources.

## Verify

- `cd philgeps-layout; node --test`
- `node philgeps-layout/tools/browser-check.cjs` from the repo root (loads the unpacked extension in installed Edge or
  Chrome with a throwaway profile; every philgeps.gov.ph request is answered locally). Its temporary profile under
  `%TEMP%` is allowed for the verifier.

For the review: `philgeps-layout/` is untracked, so there is no git diff. The unchanged v2.0 baseline to diff against
is `C:\Users\Madison\Downloads\philgeps-layout\philgeps-layout\` (`content.js`, `manifest.json`). If the sandbox blocks
the network, name the denied command and mark the source re-check as not run.

## Review 1 (Codex), resolved by Claude

- Two open popups overwrote each other's saved days. Fixed: `chrome.storage.onChanged` keeps open popups current.
  Covered by the two-popup section of `tools/browser-check.cjs`.
- Extreme years gave a wrong date or a TypeError. Fixed: years outside 1900–2999 return the validation error. A date box
  reports 0002, 0020, 0202 while a year is typed, so this could really happen. Covered in `test/calc.test.js`.
- Source flag, Chinese New Year 2026: the PCO news release says "17 January (Tuesday)". The signed Proclamation 1006
  says 17 February 2026 (Tuesday) in both its recital and its table, and 17 January 2026 is a Saturday. The proclamation
  governs: 17 February stays.
- Source flag, NCR days: the PCO issuance index says 1449. The signed text and the Official Gazette both say
  Proclamation No. 1447 (https://www.officialgazette.gov.ph/downloads/2026/09sep/20260917-PROC-1447-FRM.pdf). 1447 stays.
- Proclamation 1264's signed text was re-read: Wednesday, 27 May 2026.

The browser check cannot run in Codex's read-only sandbox (`EPERM` creating its profile under `%TEMP%`). Claude's run,
with the real extension in installed Edge, is the evidence for it. A re-review should not repeat that attempt; attack the
two fixes by reading them and running `node --test`.

## Review 2 (Codex), resolved by Claude

Two popups saving at the same moment could still lose a day, because each wrote one shared settings object. Fixed at
the cause: each added day and the NCR choice have their own storage key, so no write contains another popup's data.
Covered by the simultaneous-save section of `tools/browser-check.cjs`.

A re-review should check this one change: the storage keys in `philgeps-layout/content.js` (`storeEnd`, `applyEnd`,
`addDay`, `removeDay`, the `onChanged` listener) and `node --test`. Report any defect that loses or corrupts a saved day.

## Stop conditions

A source disagrees with another on a date: stop and report it. Verification fails twice: stop and ask the user.
