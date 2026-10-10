# finance-shorts

Turns a US personal-finance topic into a ~30-35 s, 1080x1920 animated YouTube Short with word-highlight captions, sound effects and an on-screen "Educational only. Not financial advice." It never posts: you watch `output/<slug>.mp4` and upload it yourself.

## One-time setup (PowerShell, from this folder)

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env   # then fill in the keys below
```

Needs `ffmpeg`/`ffprobe` on PATH, and `yt-dlp` for `src.learn`. Keys, all optional for a first test:

- `ANTHROPIC_API_KEY` (console.anthropic.com, cents per script). Without it, pass `--script file.json` (Claude Code can write that file in a session).
- `PEXELS_API_KEY` (free, pexels.com/api) only matters for `footage` scenes. The default scene types are drawn in code and need no key.
- Music: an original smoky mafia-jazz track is synthesised for every video (`src/music.py`, not any existing song), mixed quietly under the voice (about 18 dB below it, and it ducks while he talks). `--music klezmer` gives the silly alternative; `python -m src.music` writes audition samples to `assets/music-samples/`; `SHORTS_MUSIC_VOL` sets the level. To use your own, drop an `.mp3` in `assets/music/`. To add a licensed track in YouTube's audio picker at upload instead, render with `--no-music` so the two don't clash.
- Persona: the narrator is "Big Nickel", an original coin-head tracksuit wise guy (`style/persona.md`). Voice: `python -m src.voices` writes samples to `assets/voice-samples/`; set `SHORTS_VOICE`, `SHORTS_RATE`, `SHORTS_PITCH` in `.env`.

## Making a video

```powershell
.\.venv\Scripts\python.exe -m src.pipeline --list                  # topics + brief status
.\.venv\Scripts\python.exe -m src.pipeline <slug>                  # script via Anthropic API
.\.venv\Scripts\python.exe -m src.pipeline <slug> --script my.json # script supplied by you / Claude Code
```

1. **Fact brief** (`briefs/<slug>.json`). If missing, the first run writes a template and stops. Fill in 2+ sources on SEC/Investor.gov, FINRA, CFPB, IRS, Federal Reserve or BLS domains and the facts they state, check every fact against the page yourself, then set `"reviewed": true`. `briefs/compound-interest.json` is a worked example, unreviewed on purpose.
2. **Script**: scene plan as JSON from the brief only (`prompts/script_prompt.txt` + `style/playbook.md`). Code rejects it (and asks Claude to repair, twice) for a number not in the brief (spoken or on screen), a number with no `fact_ids`, guarantee/ticker/"you should buy"/"millionaire" phrases, fewer than 6 scenes, a first scene that is not a hook, or the wrong length.
3. **Scenes** (`src/visuals.py`, pycairo): `hook` (words slam in, coin-head mascot reacts), `ledger` (cards appear one by one), `counter` (year-by-year growth with assumption chips), `lines` (big text pops in), `footage` (Pexels clip with a slow pan). `examples/compound-interest.script.json` uses all but `footage`.
4. **Sound** (`src/sfx.py`): synthesised whoosh, pop, tick, chime and cash sounds timed to each scene, mixed under the AI voice (Edge TTS).
5. **Output**: `output/<slug>.mp4` plus `output/<slug>.txt` (title, description, sources, tags, pre-post checklist).

## The learning loop

Everything learned from reference Shorts lives in `style/` and changes the next video:

```powershell
.\.venv\Scripts\python.exe -m src.learn add <shorts-url> --hook "..." --visual "..." --captions "..." --audio "..." --why "..." --avoid "..."
.\.venv\Scripts\python.exe -m src.learn rank                                  # references by views per day
.\.venv\Scripts\python.exe -m src.learn result <slug> --views N --avg-pct P   # your own video after ~48 h
```

`references.json` holds analysed Shorts, `results.json` your own numbers, and `playbook.md` the distilled rules; the script prompt injects the playbook on every run. After adding a reference, update the playbook.

## Tests

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -t .
```

Includes a test that fails if any scene type renders the same picture early and late, and tests for every guardrail.

## Known limits

- Edge TTS is Microsoft's unofficial read-aloud endpoint. If the channel earns, swap `synth_voice` in `src/pipeline.py` for Azure Speech (same voices, official, free tier).
- Caption timing spreads words across each scene by character count, so it can drift a few tenths of a second.
- `footage` scenes show the clip only (no text overlay); without a Pexels key they fall back to an animated text hook.
- The checks catch invented numbers and banned phrases, not wrong claims inside a brief. Verifying the brief is your job, and the part that keeps the channel original.
- Before posting: watch it with sound, recheck numbers, use YouTube's synthetic-content disclosure if it applies to the AI voice, and add FTC disclosures if you ever add affiliate links.
