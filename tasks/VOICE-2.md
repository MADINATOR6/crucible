# VOICE-2: approved Paulie narration and personality

Mode: Dispatch. Owner: Codex. No staging, commits, push, publication or mirror sync.

Goal: use the user-approved Qwen audition 2 as finance-shorts' default local narrator. Pair it with character phrasing and delivery in future scripts. Preserve existing voices, original persona, financial checks, private recordings and unrelated WIP.

Write allowlist:
- tasks/VOICE-2.md
- finance-shorts/src/pipeline.py
- finance-shorts/src/local_voice.py
- finance-shorts/tests/test_voice.py
- finance-shorts/prompts/script_prompt.txt
- finance-shorts/style/paulie.md
- finance-shorts/README.md
- finance-shorts/.env.example

Audio implementation ownership: worker owns pipeline.py, local_voice.py, test_voice.py, .env.example. Parent owns persona, prompt, README and this task. Do not touch style/persona.md (existing WIP), checks.py or FS-1.

Done When:
- [x] Pipeline defaults to approved local Qwen voice; explicit Edge voices remain available. Missing local runtime/reference/CUDA fails clearly without fallback.
- [x] Script prompt selects Paulie personality for Paulie voice, original persona for Edge. Character mannerisms do not override sourced numbers or compliance.
- [x] Local reference remains outside Git; model works offline on CUDA within tested hardware budget.
- [x] Offline tests and real integrated voice generation pass; initial video draft decodes. Revised number pronunciation is being checked separately below.
- [x] Document selection, limitations and exact local commands for Claude Code.

Verification: project unittest suite, Python compilation, CLI help, one real local voice scene, ffprobe/ffmpeg decode for existing approved-voice video. No paid script API call or publishing. Claude final review/acceptance remains pending; do not self-approve ccx done.

Stop on overlapping edits, a need to read credentials, CPU fallback, changes to financial validation, or destructive operations.

## Implementation and evidence

The approved reference is audition 2 in the existing private local runtime. The default now remains Paulie even when old SHORTS_VOICE Edge tuning exists. Explicit `--voice edge` keeps all previously available Edge voices; no additional character models were invented.

Future generated scripts receive style/paulie.md. Existing scripts are not silently rewritten. Persona covers skeptical pride, blunt conversational clauses, comic indignation and dry reactions, with one optional separate recorded chuckle. Model weights were not retrained; physical acting and mascot poses are unchanged. Exact generated-speech likeness requires user listening feedback.

PASS: `.venv/Scripts/python.exe -m unittest discover -s tests -t .` (22 tests); Python compilation; CLI --help; git diff --check. PASS: after loading project dotenv, voice_profile() returns paulie. PASS: actual synth_voice generated the character/chuckle test line on CUDA, 6.736292 seconds after trimming, and ffmpeg decoded it.

Local review audio: `C:/Users/Madison/Downloads/Paulie-personality-chuckle-preview.wav`.
Local video: `C:/Users/Madison/Downloads/compound-interest-paulie-qwen.mp4` (draft).
Local evidence/scripts: `%LOCALAPPDATA%/PaulieVoice/project-smoke.log`, `project-smoke/result.json`, `number-repair.log`, `numbers-qa.log`, `qwen-finish.log`.

Initial ASR flagged two unclear spoken amounts in the draft. They were regenerated with the identical values spelled out for synthesis only (one thousand fifty dollars; one thousand one hundred two dollars and fifty cents). Original source script, captions, fact brief and original output remain intact. Never mark the unreviewed financial brief reviewed on this evidence.

Claude continuation: from finance-shorts, run `.venv/Scripts/python.exe -m unittest discover -s tests -t .`, inspect only this allowlist's diff, audition the preview, and review the task through ccx. No paid API generation or publication has occurred. No commit, push or mirror sync. Claude final review/acceptance remains pending.

## Reference refinement

User supplied laugh compilation nMwNkEzR6Lg and delivery Shorts uGhmRnQnMyQ, VQggSC2oYa0, QFREy0lPPNg, and requested exact Paulie likeness. Exact new-speech likeness cannot be guaranteed. The previous synthesized heh-heh has been replaced by a 1.65-second recorded opening laugh excerpt, mono PCM16 at 24 kHz. Private assets and laugh-selection.json live under %LOCALAPPDATA%/PaulieVoice, outside Git. Only brief fades/sample-rate conversion and downward gain matching are applied; no pitch or timing shift.

read_chuckle validates existence, sample format, duration, non-silence and complete frame data, before GPU load when requested. A missing/invalid asset fails without fallback. Narration remains approved audition 2; new delivery clips contain other voices/music and are retained as writing/performance references, not mixed blindly into speaker training. style/paulie.md records per-reference delivery guidance. Output metadata identifies a recorded laugh when used.

New preview target: C:/Users/Madison/Downloads/Paulie-reference-laugh-preview.wav. Preserve the earlier audition and preview files. User must judge new-speech likeness and transition; Claude review remains pending. This is speech cloning plus a writing persona and recorded cue, not retraining an entire personality.

Refinement verification PASS: 25 project unit tests, Python compilation, git diff --check, real CUDA project synth_voice call (8.178333 seconds after trimming), ffmpeg decode of preview and recorded cue. Independent waveform comparison confirms the exact recorded cue remains at the end with constant gain and under two PCM quantization units of error. Local ASR and waveform evidence: reference-laugh-qa.log; generation: reference-laugh-smoke.log. No paid calls, new dependencies or publication. Commercial reuse rights for the recorded excerpt have not been checked.

## Astra/high performance pass

User explicitly requested Astra/high and implementation in the side-income project. A read-only Astra/high review found and rechecked two repaired defects: TTS silence trapped before the laugh, and captions stretched across the laugh. The runner now trims narration before appending the cue and writes speech-durations.json. The pipeline preserves the complete cue and uses spoken duration for captions while keeping full scene offsets. Edge keeps its original trim path. The reviewer reported no blocking finding after the fixes; this is not Claude's final acceptance.

Controlled three-take experiment: identical original text, seed 1234, installed Qwen model, unchanged sampling. Approved reference: 5.0725 seconds; text-first conditioning: 4.94754 seconds; conversational reference from VQggSC2oYa0: 12.24008 seconds. All three ASR checks recovered the complete requested words. Disjoint-reference speaker-encoder cosine scores were .9530/.9380/.9328 respectively, but the encoder belongs to the synthesis model and these scores are not proof of perceived likeness or acting. Keep approved audition 2 as production voice. Alternatives are retained for user listening; do not silently promote them.

Local experiment evidence: %LOCALAPPDATA%/PaulieVoice/performance-comparison/results.json and qa.json. Speech-only alternatives are Downloads/Paulie-performance-approved.wav, Paulie-performance-full-sentence.wav and Paulie-performance-conversational.wav. New integrated three-scene demo target: Downloads/Paulie-performance-refined.wav; local final-performance/ contains script, timings and captions. No new dependency, paid request or CPU generation fallback.

Final verification: 26 tests PASS; compilation and git diff --check PASS. Actual CUDA generation produced three scenes and speech-duration metadata. The integration exposed sub-microsecond ffprobe rounding versus sample-precise durations; fixed with a 10-microsecond validation tolerance and clamping to scene length, with a regression example. Assembly then passed using the same generated clips. Final preview is 10.26875 seconds and decodes. Waveform QA confirms the inserted gap is exactly 3600 silent samples at 24 kHz, followed by the recorded cue with only constant gain/PCM rounding. Word checking is local ASR, not a perceptual likeness verdict. Private final-performance/qa.json and preview.json hold evidence. Astra/high review found no blocking timing issue; Claude final review/acceptance still pending. No commit/push/publishing.

## 2026-10-11 runtime continuation

The user requested a working direct route for finance-shorts after Claude declined voice production. A user-local launcher exists at `%LOCALAPPDATA%/PaulieVoice/render-paulie.cmd`; help and topic listing exit 0, invalid arguments fail, and it preserves the pipeline's brief/script checks. It requires a reviewed brief and an existing script for a render without a paid API call. This launcher does not change Claude's safeguards or establish commercial rights.

Current checks: 26 project tests PASS, three assistant input/audio tests PASS, compilation and git diff --check PASS. Real generation failed with Windows paging-file error 1455. The PC has approximately 8 GB physical RAM and a system-managed 23 GB paging file; open Claude and Discord processes leave insufficient commit memory for model loading. Runtime failures now include the Qwen subprocess exit code, with a regression assertion.

An experimental sharded copy of the cached model was prepared outside Git at `%LOCALAPPDATA%/PaulieVoice/qwen-sharded-20261011`. SHA-256 checks verified every original weight byte and copied configuration file. Sharding plus SafeTensors pread reached tensor loading but then failed with MemoryError. Both experimental loader changes were removed; the original cached model and voice reference remain selected. Local preparation/check scripts and verification.json retain evidence. No original model files were overwritten or system settings changed.

The user explicitly approved terminating all remaining claude.exe and Discord.exe processes after saving work. After termination, the original model successfully generated a one-segment reply, exit 0. Output: `C:/Users/Madison/AppData/Local/Packages/OpenAI.Codex_2p2nqsd0c76g0/LocalCache/Local/PaulieVoice/assistant-replies/reply-795x5de1/reply.wav`. ffprobe confirms 7.294542 seconds, mono PCM16 at 24 kHz; ffmpeg decode exits 0. The check uses original non-financial dialogue and no recorded laugh. Perceptual likeness and commercial permissions are unverified.

Installed a user-local Claude Code `/render-paulie` skill at `C:/Users/Madison/.claude/skills/render-paulie/SKILL.md`, following the official Claude Code skills format. It invokes the direct launcher with an existing script and reviewed brief, preserves validation, discloses synthetic narration, and does not fabricate rights or override model rules. Claude Code version 2.1.287 is installed. Discovery and model compliance in a fresh Claude session are still unverified; no paid model call was used to test the skill. Claude review/acceptance remains pending. No commit, push, sync or publication.

## Shared-path repair after fresh Claude test

The user's Claude test discovered the skill but found only its newly written input in AppData/Local/PaulieVoice. Python resolved Codex's runtime to its package-private LocalCache/Local/PaulieVoice and the base interpreter to package-private LocalCache/Roaming/uv/python. The previous installation claim did not establish cross-app runtime visibility.

Copied the existing base interpreter, 5.4 GB Qwen environment, assistant runner/tests, launcher, selected reference and laugh into `C:/Users/Madison/.local/share/PaulieVoice`. The copied venv's pyvenv.cfg points to that shared folder's python directory. The selected reference is byte-identical and manifest-selected locally; no original install was deleted or overwritten. No dependency reinstall or voice substitution. Both agents' paulie-voice skills, Claude's render-paulie skill, project loader, README and .env.example now use the shared root instead of LOCALAPPDATA. Added a regression for an unrelated app-private LOCALAPPDATA value. CUDA lazy module loading is defaulted before torch import. Native child failures enable faulthandler and retain complete stderr in the output folder's qwen-error.log.

PASS: copied Python confirms both sys.prefix and sys.base_prefix are under the shared root; three assistant helper tests; shared render launcher --list; copied CUDA tensor calculation; copied Qwen import; 27 project tests, compilation and diff whitespace check. Full narration from the copied environment failed twice with Windows native access violation 3221225477 while torch/storage.py __getitem__ was called from transformers/modeling_utils.py _load_state_dict_into_meta_model during weight loading. Approximately 0.8 GB physical RAM and 6 GB commit memory were available after failure, but a memory cause for this access violation is not established. No new shared-runtime WAV or playback success is claimed. The missing-path issue is repaired; full shared-runtime narration and fresh Claude invocation remain partial. Preserve the working old install and prior WAV while investigating the native weight-load crash. No further loader patching, commits, app termination or publishing in this repair.

## Subsequent user-requested crash diagnosis and fresh-session tests

Both mmap and pread loaded the identical largest original tensor intact on CUDA in the shared interpreter. This rules out a general inability to read that tensor; it does not establish the earlier native access violation's exact cause. A full pread probe completed exit 0. The normal shared speak_reply.py --play then completed exit 0 and produced `C:/Users/Madison/.local/share/PaulieVoice/assistant-replies/reply-5arye31e/reply.wav` (4.475583 seconds, mono PCM16, 24 kHz; ffmpeg decode exit 0). Playback returned without error; audible output requires user confirmation.

Fresh Claude discovered the skill and reached the shared runner, but pread alone still hit Windows error 1455 while opening the unsharded checkpoint. SafeTensors 0.8.0 creates a temporary whole-file copy-on-write mapping even for pread metadata parsing. The dependency source explains why sharding can reduce this remaining commit requirement; it does not prove the earlier access violation was an out-of-memory error.

The previously byte-verified sharded model completed a full probe exit 0, including the speech tokenizer shards. Copied that model into shared PaulieVoice/qwen-sharded-20261011; all 30 copied files match source SHA-256, recorded in shared-shards-verification.json. local_voice.py now selects this shared copy, disables parallel checkpoint loading, and uses pread in its dedicated child process. Original weights/reference are preserved; there is no voice substitution or dependency reinstall. Recheck real narration after dependency upgrades because this uses Transformers' internal safe_open binding.

Fresh Claude's next test exposed a subprocess decoding failure under cp1252, hiding the underlying child result. Output capture now explicitly decodes UTF-8 with replacement for invalid bytes so native errors remain reportable. Fresh tests are serial and local; no project generation API or publication was requested.

Fresh Codex CLI test discovered the skill but failed before speech execution: Windows sandbox helper reported `apply deny-read ACLs`; input creation also failed. No sandbox protections were disabled. This test does not establish a voice failure or fresh Codex playback success. Evidence: shared fresh-codex-test.jsonl, fresh-codex-test.stderr.log and fresh-codex-result.txt. Additional fresh Claude test evidence is retained in shared fresh-claude-*-test.json files. Test-run permission allowlists were per invocation, not global settings.

PASS: after the UTF-8 capture fix, a fresh Claude Code invocation discovered paulie-voice, generated `C:/Users/Madison/.local/share/PaulieVoice/assistant-replies/reply-vlrzvsqv/reply.wav`, and completed the plain --play command successfully, with no permission denials. Independent ffprobe confirms 2.260625 seconds, mono PCM16 at 24 kHz; ffmpeg decode exits 0. Evidence: fresh-claude-utf8-test.json, session 13aea5fa-ec9c-4902-bed5-6fdef1249686. Audible speaker output and perceptual likeness are user checks.

PASS: 28 project unit tests, including a real child-process regression emitting invalid text bytes; three assistant helper tests; source compilation; whitespace checks. A second fresh Codex CLI test from the intended finance-shorts project, explicitly adding the shared folder to its writable scope, failed with the same Windows sandbox helper error before speech started. Evidence: fresh-codex-repo-test.jsonl, fresh-codex-repo-test.stderr.log and fresh-codex-repo-result.txt. Fresh Codex desktop invocation remains unverified; a CLI sandbox failure is distinct from the speech runtime.

Source for the Windows mapping diagnosis: https://github.com/huggingface/safetensors/blob/v0.8.0/bindings/python/src/lib.rs#L620-L677 and https://learn.microsoft.com/en-us/windows/win32/api/memoryapi/nf-memoryapi-mapviewoffile . No settings, pagefile, system permissions, commercial-rights assertions or safety controls were changed. No further app termination, commit, push, sync or publication.

PASS: the current Codex desktop chat invoked the final shared sharded configuration via speak_reply.py --play, exit 0, generating `C:/Users/Madison/.local/share/PaulieVoice/assistant-replies/reply-fs377g6p/reply.wav`. This proves execution from the current desktop chat; it does not replace the blocked fresh-session Codex test. Final remaining check: open a fresh Codex desktop chat and explicitly invoke `$paulie-voice` for one short read-aloud; confirm audible output. The skill provides turn-based generated WAVs, not native live-voice replacement.
