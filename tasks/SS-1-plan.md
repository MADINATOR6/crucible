Follow HANDOFF.md, Planner instruction (it replaces the Researcher instruction for this task).

# SS-1 plan brief: social-studio MVP

## Goal
A new standalone app `social-studio/` in this repo: a solo creator's social media workspace that runs the loop research → trends → ideas → drafts → calendar → approve → (manual) post → import results → insights → next ideas.

## User requirements (decided in chat, 2026-11-22)
- Solo user, no accounts, no backend. Works on Android and iOS (installable PWA), desktop too.
- Platforms: TikTok, Instagram, YouTube (Shorts first).
- Goals: grow followers, engagement, sales/leads, personal brand; money is the main one. Every idea links to a goal; every recommendation links to its evidence.
- Data: (1) manual CSV import of each platform's analytics export; (2) in-app AI scouting: a button calls the Anthropic Messages API from the browser with the user's own API key (stored only on device, IndexedDB/localStorage), using the server-side web search tool so trends carry real source URLs and dates. Niche open: the AI also suggests niches with monetization evidence.
- Never fabricate trends, metrics, citations or publishing ability. Sample data clearly labelled SAMPLE. No auto-posting in v1: user copies caption, posts by hand, pastes the post URL back. Approval step required before an item counts as ready to post.
- Five screens: Setup, Scout (research + trends + research log), Plan (ideas, brief, platform drafts, week calendar), Pipeline (Idea → Drafting → Ready → Approved → Posted → Measured, next action per item), Results (CSV import, top/bottom posts, Observations vs Hypotheses, recommended actions with "Turn into idea").
- Strong empty, loading and error states; accessible controls; responsive.

## Constraints
- Same stack as lifting-tracker (AGENTS.md Stack): plain JS ES modules, no build step, no runtime dependencies, service worker, IndexedDB. Do not import from or modify `lifting-tracker/`; copying small patterns is fine.
- Tests with `node --test` on pure logic (CSV parsing, AI response parsing, pipeline state rules, insights). Synthetic data only. The user has no real exports yet: CSV importers must map columns by header name with tolerant aliases and report unrecognised headers instead of guessing.
- Not deployed in this task (no Pages workflow change). No secrets in the repo. Browser call needs header `anthropic-dangerous-direct-browser-access: true`. Model id from the claude-api skill (Claude decides; Codex need not).
- `.claude/launch.json` may gain a `social-studio` entry.

## Relevant paths
`lifting-tracker/dev-server.mjs`, `lifting-tracker/sw.js`, `lifting-tracker/src/store/`, `lifting-tracker/package.json`, `lifting-tracker/playwright.config.js`, `.claude/launch.json`, `ccx/policy.json` (verify.stages).

## Wanted from the plan
Module layout, data model (stores and fields), write allowlist, Done When, Verify commands (only ones that exist or that this task creates with a stated path), stop conditions, risks.
