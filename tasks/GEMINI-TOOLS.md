# GEMINI-TOOLS: Gemini API wrapper for all three agents; Rea and Higgsfield MCP for Antigravity

Owner: claude. Reviewer: Codex. Approved by the user in chat on 2026-11-27 ("5. do this", "6. do this"; "take note that my gemini is in pro account"), items #5 and #6 of `handoffs/GEMINI-UPGRADE-approvals.md`. Gemini authored none of it.

## #6 Gemini API wrapper
- `gemini-api` v0.5.0 from Google's GitHub release, SHA256 checked against the release `checksums.txt`, installed outside the repo at `%LOCALAPPDATA%\Crucible\tools\gemini-api\v0.5.0\bin`.
- `scripts/gemini-api.ps1`: only `version`, `analyze` and `transcribe`, on default models; refuses other commands and options, non-YouTube URLs and private paths before anything is sent; transcripts only under this checkout's `media-out/`, checked on the resolved folder (Codex review, 2026-11-28). Key from `GEMINI_API_KEY`, never printed (the CLI redacts it in dry runs).
- `scripts/test-gemini-api.ps1`: offline, fake binary.

## #5 Antigravity MCP
- `.agents/plugins/crucible-tools/` (`plugin.json`, `mcp_config.json`): the same pinned `rea` stdio command as `.mcp.json` and `.codex/config.toml`.
- Higgsfield moved to GEMINI-REVIEWER (2026-11-28, to save a verify): it joins the plugin in the same change as the launcher deny `mcp(crucible-tools_higgsfield/*)`, so it is never reachable without the deny. Claude's probes on 2026-11-27: a wildcard `mcp(...)` deny blocked a Rea call under `--dangerously-skip-permissions`, and the same call without the rule went through.

## Write allowlist
`scripts/gemini-api.ps1`, `scripts/test-gemini-api.ps1`, `EXTERNAL-TOOLS.md`, `.agents/plugins/`, `tasks/GEMINI-TOOLS.md`.

## Done When
- `scripts/test-gemini-api.ps1` passes; one live `analyze` on a synthetic file returns an answer (or a recorded transient 503: 2026-11-27 and 11-28, every model, so a live answer is UNTESTED).
- A headless agy probe from the repo lists `crucible-tools_rea`.
- `ccx verify -TaskId GEMINI-TOOLS` passes; Codex reviews.

## Untested by design
Higgsfield inside Antigravity needs the user's own sign-in in the Antigravity app; until then the server is absent (probe, 2026-11-27).
