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
- Narrator: the default is the user-approved Paulie audition 2, generated locally with Qwen3-TTS. `style/paulie.md` supplies original character phrasing, dry reactions and conversational rhythm to future scripts. One scene may set `"chuckle": true` to append the recorded laugh excerpt selected from the user's reference compilation. The coin-head mascot remains the visual character. Existing scripts keep their wording; regeneration is needed to change their personality.
- Other voices remain available with `--voice edge`, using the original Big Nickel persona (`style/persona.md`). `python -m src.voices` still auditions Roger, Guy, Christopher and Eric. Set `SHORTS_VOICE`, `SHORTS_RATE`, `SHORTS_PITCH` in `.env` to select an Edge voice. Paulie ignores those Edge settings.

### Approved local voice on this PC

The shared runtime is `%USERPROFILE%\.local\share\PaulieVoice\qwen-venv\Scripts\python.exe`. Its private `qwen-audition-results.json` selects audition 2's WAV and transcript; the selected WAV is copied to `reference.wav` beside it. The base interpreter is bundled in the shared folder's `python/` directory. Avoid the old AppData location: Codex's Windows package redirects it, so Claude Code sees a different folder. Model: Qwen3-TTS-12Hz-0.6B-Base, cached Hugging Face snapshot `5d83992436eae1d760afd27aff78a71d676296fc`, loaded from the byte-verified sharded copy at `PaulieVoice/qwen-sharded-20261011`. Checkpoints load serially to limit Windows memory demand. Audio and model weights stay outside Git. No project dependency installation is needed on this PC.

`src/local_voice.py` loads only that cached model, requires CUDA, uses two CPU threads and caps the GPU allocator at 90%. The child process selects SafeTensors' `pread` reader through Transformers to reduce Windows memory-mapping commit spikes; this was tested with SafeTensors 0.8.0 and Transformers 4.57.3. Recheck real generation when upgrading those dependencies. It stops on missing prerequisites or generation errors, with no CPU or stock-voice fallback. Moving the project to another PC requires provisioning the same local runtime/model/reference first. Existing Edge voices use their online service.

From `finance-shorts` in Claude Code or PowerShell:

```powershell
.\.venv\Scripts\python.exe -m src.pipeline <slug> --voice paulie
.\.venv\Scripts\python.exe -m src.pipeline <slug> --voice paulie --script my.json
.\.venv\Scripts\python.exe -m src.pipeline <slug> --voice edge --script my.json
```

`SHORTS_VOICE_PROFILE=paulie` or `edge` sets the preference; `--voice` takes priority. With no profile, Paulie is used even if old Edge tuning settings remain. Script generation receives the matching persona. This is a script/performance profile, not personality training in the model's weights. Physical gestures are not changed.

On this PC, Claude Code also has `/render-paulie <slug> --script <absolute-script.json> --brief <absolute-reviewed-brief.json>`. Restart Claude Code if it has not discovered the user-local skill. It calls `%USERPROFILE%\.local\share\PaulieVoice\render-paulie.cmd`, which also runs directly from PowerShell. Use `--list` to check topics first. Existing brief/script validation remains required; the command does not override Claude's rules or verify commercial voice/audio rights. Error 1455 or MemoryError during model loading requires releasing Windows memory; get permission before terminating background apps.

The laugh cue is `%USERPROFILE%\.local\share\PaulieVoice\paulie-laugh.wav`: mono PCM16, 24 kHz, 1.65 seconds from the opening of the user's [laugh compilation](https://www.youtube.com/watch?v=nMwNkEzR6Lg). It retains the recorded pitch/rhythm with brief fades and optional downward gain adjustment to sit under the speech peak. It is third-party recorded audio, not newly AI-generated laughter; output metadata identifies this when used. Missing/invalid laugh audio stops a requested chuckle rather than substituting a synthetic laugh. Other voice profiles never use this cue. Private source/selection details are retained in the original app-private runtime.

Narration is trimmed before adding the 150 ms laugh beat, so TTS padding cannot create an accidental long pause. `speech-durations.json` in each render's working folder keeps spoken caption timing separate from the full scene length. Captions finish before the laugh, while the picture and sound continue through it.

## Making a video

```powershell
.\.venv\Scripts\python.exe -m src.pipeline --list                  # topics + brief status
.\.venv\Scripts\python.exe -m src.pipeline <slug>                  # script via Anthropic API
.\.venv\Scripts\python.exe -m src.pipeline <slug> --script my.json # script supplied by you / Claude Code
```

1. **Fact brief** (`briefs/<slug>.json`). If missing, the first run writes a template and stops. Fill in 2+ sources on SEC/Investor.gov, FINRA, CFPB, IRS, Federal Reserve or BLS domains and the facts they state, check every fact against the page yourself, then set `"reviewed": true`. `briefs/compound-interest.json` is a worked example, unreviewed on purpose.
2. **Script**: scene plan as JSON from the brief only (`prompts/script_prompt.txt` + `style/playbook.md`). Code rejects it (and asks Claude to repair, twice) for a number not in the brief (spoken or on screen), a number with no `fact_ids`, guarantee/ticker/"you should buy"/"millionaire" phrases, fewer than 6 scenes, a first scene that is not a hook, or the wrong length.
3. **Scenes** (`src/visuals.py`, pycairo): `hook` (words slam in, coin-head mascot reacts), `ledger` (cards appear one by one), `counter` (year-by-year growth with assumption chips), `lines` (big text pops in), `footage` (Pexels clip with a slow pan). `examples/compound-interest.script.json` uses all but `footage`.
4. **Sound** (`src/sfx.py`): synthesised whoosh, pop, tick, chime and cash sounds timed to each scene, mixed under the selected AI voice (local Qwen by default, or Edge).
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

- Optional Edge TTS is Microsoft's unofficial read-aloud endpoint.
- Voice cloning does not guarantee exact actor likeness or pronunciation. Listen to every number and the transition into the recorded laugh before posting. AI narration must be identified as synthetic, not actual actor speech.
- Caption timing spreads words across each scene by character count, so it can drift a few tenths of a second.
- `footage` scenes show the clip only (no text overlay); without a Pexels key they fall back to an animated text hook.
- The checks catch invented numbers and banned phrases, not wrong claims inside a brief. Verifying the brief is your job, and the part that keeps the channel original.
- Before posting: watch it with sound, recheck numbers, use YouTube's synthetic-content disclosure if it applies to the AI voice, and add FTC disclosures if you ever add affiliate links.
