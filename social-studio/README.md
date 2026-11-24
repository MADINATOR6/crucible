# Social Studio

A solo creator's social media workspace for TikTok, Instagram and YouTube. It takes you from research to a measured post and back to the next idea:

**Scout** (AI trends and niches, each with sources) → **Plan** (ideas tied to a goal, a brief, drafts, week calendar) → **Pipeline** (Idea → Drafting → Ready for review → Approved → Posted → Measured, with the next action on every item) → **Results** (CSV import, observations kept apart from hypotheses, "Turn into idea").

Plain JavaScript ES modules, no build step, no runtime dependencies, offline PWA. Data lives in this browser's IndexedDB on this device only.

## Run it

```powershell
node social-studio/dev-server.mjs 5175
```

Open http://127.0.0.1:5175/. In Claude Code the launch entry is `social-studio` (`.claude/launch.json`).

Tests (Node 18+; synthetic data only):

```powershell
cd social-studio; node --test
```

## Honesty rules built in

- **Trends are never invented.** The scout calls Claude (`claude-opus-5-5`) with the server-side web search tool. A claim is kept only if its source URL came back from that search; others are dropped and counted in the run log. Momentum without a source is shown as "unknown". Missing source dates stay "date not shown".
- **Metrics come only from your imports.** Columns are matched by name; unrecognised columns are listed, never guessed. Impressions are not views, watch time needs a unit, duplicate columns and broken quoting are refused. Re-importing the same file does nothing; a newer export replaces each post's numbers instead of adding to them.
- **Observations vs hypotheses.** Results shows facts from your data separately from guesses, which carry their sample size and confidence.
- **Nothing is posted for you.** You approve the exact hook, script, caption and hashtags; any edit after approval needs approval again. You post by hand and paste the link, which must be a post URL on that item's platform.
- **SAMPLE data** (Setup → Load SAMPLE data) is labelled everywhere, uses example.com sources, and is ignored by Results as soon as real data exists.

## Your Claude API key

Scout and "Draft with AI" use your own Anthropic API key, entered in Setup. It is stored in this browser only, sent only to `api.anthropic.com` (with the `anthropic-dangerous-direct-browser-access` header), never cached by the service worker and never included in backups. Anyone with access to this browser profile could read it. Each run is billed to your Anthropic account; the run log shows searches and tokens used.

## Getting your analytics CSVs

- **TikTok:** TikTok Studio → Analytics → Content → export (desktop web).
- **Instagram:** Meta Business Suite → Insights → Content → Export data.
- **YouTube:** YouTube Studio → Analytics → Advanced mode → Export current view → CSV (the "Content" column holds the video ID, which links rows to posts).

Platform export layouts change. If an import says a column was not recognised, that is the app refusing to guess; tell Claude the header names to add an alias in `src/importer.js`.

## Install on a phone

Installing needs HTTPS (or localhost). Plain `http://<PC address>:5175` over Wi-Fi works as a website but cannot be installed offline. Hosting is a separate, explicit step; it is not set up.

## Later (not in v1)

Direct publishing through the platform APIs (still behind your approval), live analytics through platform APIs, scheduled automatic scouting and competitor tracking over time, turning a brief into a Higgsfield video, stale-tab conflict checks, team roles, multiple brands, cloud sync.
