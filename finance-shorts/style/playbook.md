# Shorts playbook

Distilled from `references.json` and `results.json`. The script prompt injects this file on every run, so every lesson here changes the next video. Update it whenever a new reference is analysed or one of our own videos reports numbers. Copy structure and pacing, never content, faces, logos or scripts.

## What the high-view references share (observed 2026-10-10, 5 Shorts)
1. **A new visual every 2-4 s.** No reference holds one picture for more than about 4 s; the 7M-view one changes expression and caption every ~2 s. Our first render held empty backgrounds for 4-7 s: that is the "bland" feedback.
2. **One huge on-screen anchor per beat**: a price label, a ticking dollar counter with the year, a two-word title card, or a big loss figure. The viewer can follow with the sound off.
3. **A concrete hook in under 2 s**, built on a number, a question or a pain the viewer knows ("where does $1,000 end up in 30 years?"), not a definition ("compound interest is...").
4. **Escalation or progression** (price ladder, year 0 -> 31 counter, numbered tips). Progression keeps people watching to the end and makes the video loop-friendly.
5. **Relatable analogy beats abstraction** (snowball, stubbed toe = money pain). One analogy per video.
6. **Assumptions shown on screen** (start amount, rate, yearly deposit as small chips at the top). It reads as credible and is also our compliance requirement.
7. **Word-by-word highlighted captions**, 2-4 words at a time, centered in the lower-middle, bold with a thick outline; the active word changes colour.
8. **Sound design**: light background music plus small effects (tick, chime, whoosh). The one reference without any dialogue still held attention with sound effects and text alone.
9. **A recurring character or visual motif** (stick figure, flat-illustration guy, the rolling ball). We use an original coin-head mascot.
10. **Length 12-35 s.** Longer (49 s) with 308 views is a weak data point, not a rule. Aim for 25-35 s.
11. **Ends on an interaction prompt** (a question to answer in the comments), not "follow for more".

## Rules the renderer and script follow
- 8-11 scenes, each narration line at most ~12 words; a scene with more should be split.
- Scene 1 is a hook slam (text animates in word by word, mascot reacts). Last scene asks a comment question.
- Visual types: `hook`, `ledger` (rows of values appearing one by one), `counter` (animated growth with assumption chips), `lines` (stacked big-text lines), `footage` (stock clip with Ken Burns). Nothing static.
- Every number shown or spoken comes from the fact brief or is computed from assumptions stated in it.
- Safe areas: captions at about y=1400, disclaimer at about y=1590; the bottom ~300 px and right edge are covered by the Shorts interface.

## Owner direction (2026-10-10)
- Persona: an old-school wisecracking tracksuit narrator, original character "Big Nickel" (`persona.md`); never a real show's character, voice or catchphrases.
- Sound: silly, meme-quality klezmer-style background music plus cartoon effects (boing on hook slams). Music licensing note: the built-in track is original; a real song should be added through YouTube's own audio picker at upload (render with `--no-music`).
- Voice pacing lesson: a gruffer, slower voice (Roger) ran 50 s for 77 words at +0% rate; at +22% with per-clip silence trimmed it runs 36 s. Always check duration after changing voice.

## Do not copy
- Celebrity faces or voices, sports-team or brand logos (a 30k-view reference used both).
- Token promotion and trading hype (the 7M-view reference's channel sells a memecoin; its reach comes from an existing brand, not from the format).
- "Become a millionaire" and "make money while you sleep" claims (the 406k-view reference opens with one); our checker bans them.
- Unsourced "fun facts" about money (a recent animated reference states several with no sources). We cite.

## Open questions (update from results.json)
- Does the counter format outperform ledger-only videos on average viewed %?
- Does a question hook beat a number hook?
- Best length between 25 and 35 s for this niche.
