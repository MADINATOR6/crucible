# Instagram faceless-page playbook

Distilled 2026-10-10 from four creator videos (transcripts) plus Meta/Instagram policy pages. This project is separate from `finance-shorts/` (YouTube) and `roblox-videos/`: its own niche, name, persona and files. Nothing here is shared with them except the repo workflow. Niche: not chosen yet (owner decision pending); everything below is niche-neutral.

Sources: V1 Luke Gosseling "faceless Instagram business in 30 minutes" (SVM6h593K4c), V2 Digital Income Project "$500K with AI carousels" (ukSsYecrQDI), V3 Pasha Mogadam "5 ways to use Claude" (UtFoP_UByLY), V4 Luke Gosseling "lazy way with AI" (MkXYWALKcRc). V3 and V4 were read through a page summary, V1 and V2 through the full transcript. All four sell coaching or courses, and their income figures are self-reported and unverified.

## What the videos agree on
1. **One niche, one audience, one format**, stated in one sentence (topic + audience + format). Mixed topics confuse the algorithm. Money niches monetize best (V1 names philosophy, AI, marketing, stoicism, self-improvement, business).
2. **Idea beats production.** A strong idea with weak editing can go viral, the reverse cannot (V1). Hook and first slide or first 2 s decide it (V2, V4).
3. **Saves and shares are the carousel triggers** (V2): about 7% of viewers saving and about 4% sharing is the author's rule of thumb for going viral; also watch whether new viewers follow. Carousels work with sound off.
4. **Carousel formula** (V2): slide 1 bold hook plus striking visual, slides 2-9 one point per slide with a clean readable layout, slide 10 the call to action. 3:4 or 4:5 so the post fills the screen. Consistent fonts (header + body), 2-3 brand colors, a recurring mascot.
5. **Caption** reinforces the hook, carries niche keywords (it teaches Instagram who the audience is) and ends with the CTA. Trending audio matched to the vibe (V2).
6. **Research system**: a sheet of 20-40 growing pages in the niche, small ones included (big-page results do not transfer), scanned daily; save outliers (V1: 100k+ likes or 1M+ views, under 30 days old); Claude ranks outliers for brand fit (V3, V4). Post at least ~100 pieces before trusting the data (V4); review at 30 days.
7. **Batch and be consistent**: one or two production days a week, a pipeline sheet (idea / ready to edit / ready to post), 1-2 posts a day (V1) or 3-5 a week (other research).
8. **Early growth tactics**: genuine, substantive comments on peer pages (V1 "$1.80 strategy", 90 comments a day), collabs with same-niche pages, follow-for-follow only within the niche, never random mass-following (limits and bans).
9. **Profile**: memorable username with no numbers, underscores or doubled letters; minimal 2-3 color logo that reads when tiny; page name with keywords; bio = one-line mission, then contact, then one link (V1).
10. **Monetization ladder by size** (V1): clipping/UGC deals from any size; digital products from ~100k; shoutouts from ~250k; newsletter (Beehiiv boosts, ~1k subs) once a list exists; physical products only at 1M+ (low margin). Automate comments-to-DM link delivery with ManyChat on the CTA keyword (V2). Lead magnet to paid product via email (V3).

## Where the videos conflict with our rules or the 2026 facts
- **"Remodel viral content from other pages" (V1, V3, V4) is the risky part.** Since March-May 2026 Meta demotes accounts that mostly post unoriginal content, and Instagram stopped recommending such accounts for photos and carousels as well as reels; repeat offenders lose monetization. We copy *format, structure and pacing* only, never another page's text, images or script . Every post has our own ideas, our own graphics.
- **Instagram payouts are far away.** The photo/carousel bonus is invite-only and needs 5M views a month for 3 consecutive months (US); Reels bonus is invite-only and counts only original content. At 1k followers: gifts, affiliate links, Creator Marketplace; 10k: subscriptions. Brand deals have no follower minimum. Plan for 3-6 months with no income; most pages with real income took 6-18 months.
- **Disclosure and claims.** Any affiliate link or sponsored post is disclosed with the endorsement itself, in the same language, not only in the bio (FTC "Disclosures 101 for Social Media Influencers": the influencer is responsible). No income or result promises. Regulated topics (money, health) add their own rules once a niche is picked.
- **AI visuals**: Instagram labels profiles that look like an AI-generated person. Use illustrated graphics, a cartoon mascot, charts and text, not a fake human.
- **Claims to ignore**: view and income screenshots, "guaranteed viral" thresholds. Treat the 7% / 4% numbers as targets to test, not laws.

## Decision for us (cheapest path to a first dollar)
1. **Separate project.** Own niche, own page name, own mascot/brand kit, own content folder (`instagram/`). No shared briefs, personas, characters or code with `finance-shorts/` or `roblox-videos/`.
2. **Carousel-first**: zero ad spend, no voice or footage cost, saves-friendly content (checklists, step lists, comparisons, templates). Reels only if a niche needs them.
3. **Niche (owner chose 2026-10-10): AI tools and productivity.** Statement: *practical AI workflows, prompts and tool comparisons for busy beginners, as 10-slide visual carousels.* Pillars: (a) copy-paste prompts for a job-to-be-done, (b) "tool A vs tool B" for one task, (c) workflows in 5 steps, (d) mistakes and fixes, (e) weekly "what changed" digests. Every claim about a tool's features, limits or prices is checked against its official page by the owner before posting (tools change fast); each post file records the sources and the check date.
   - Honest caveats: AI prompt packs and "AI hustle" pages are crowded and full of income claims; our edge is accurate, original, tested workflows. Gumroad takes 10% + $0.50 per sale plus card fees; Payhip 5% on its free plan, so start on Payhip.
4. Slide template: S1 hook (number or question), S2-S9 one idea each, S10 CTA = "Save this" plus a comment-keyword prompt. Not a flat background: gradient or pattern, one huge anchor per slide, pill-shaped chips, brand mascot or icon, slide counter, swipe cue (the owner rejected plain navy slides on 2026-10-10).
5. First money, in order: (a) a $9-29 digital product from our own material (Gumroad or Payhip), (b) free lead magnet to an email list (Beehiiv), (c) brand deals once ~5-10k engaged followers, (d) affiliate offers only with disclosure and only for products we would recommend. Sell nothing before ~1k engaged followers.
6. Metrics to log per post: views, saves %, shares %, follows from post, profile visits (file to be created with the niche). Revisit this file at 30 posts.
7. Human gates stay: the owner looks at every carousel and posts it. Nothing is posted automatically.
8. Renderer: `carousel.py` (see `README.md`), standalone Pillow code with its own validation; first post `posts/prompts-that-save-hours.json`. Brand name and handle in `brand.json` are placeholders until the owner picks them.

## Open questions
- Page name and handle (memorable, no numbers or underscores); owner checks availability.
- Do number-hook carousels out-save question-hook carousels?
- Does a carousel with music reach more people than one without (music carousels can surface in the Reels tab)?
