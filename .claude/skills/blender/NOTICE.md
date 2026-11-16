# Sources for the Blender skill

Read on 2026-11-16. Everything in this folder was written for Crucible; no file was copied.

| Source | Licence | What we took |
| --- | --- | --- |
| [zwl0520/codex-blender-skill](https://github.com/zwl0520/codex-blender-skill) (`blender-realism`, commit f6121ee) | None stated; its RIGHTS.md grants no reuse. | Ideas only, rewritten in our own words and code: diagnose by physical cause before changing, an issue register, separate modelled / rendered / checked / approved states, and its API pitfalls (quaternion rotation, localised node names, dynamic enums, object scale and textures, ray casts as weak evidence). No text or code copied. |
| [mromidev/claude-blender-skills](https://github.com/mromidev/claude-blender-skills) (`blender-film`, `blender-forest`, `blender-car-film`, commit 567116b) | MIT, Copyright (c) 2026 Mr omi | Workflow lessons: storyboard first, real assets, staged build scripts with a test still after each stage, physics-driven motion, practical lights at night, benchmark samples with denoising, persistent data, baked caches, render only the edit's frames, resumable PNG sequences, check every frame before encoding, audit downloaded `.blend` files with auto-run off, read add-ons before installing, the particle-emitter visibility lesson. Our `render.py` and `audit.py` are new code inspired by its render and audit scripts. Its live socket bridge was deliberately not adopted (any local program could run code in Blender). |
| [ilisho/blender-cmd-rendering-cheatsheet](https://github.com/ilisho/blender-cmd-rendering-cheatsheet) (topic `blender-batch-render`, commit e70609e) | None stated | Command-line facts that are also in the [Blender manual](https://docs.blender.org/manual/en/latest/advanced/command_line/arguments.html): argument order, one scene per process, `--python-expr`, `--factory-startup`. Its sleep/shutdown-after-render commands were deliberately not adopted. |

The other two repositories under the `blender-batch-render` topic ("Blender 3D Pro" Windows downloads) were not used: Blender is free from blender.org, and repackaged "Pro" Windows builds are a common malware pattern.

MIT licence of mromidev/claude-blender-skills, in full:

```text
MIT License

Copyright (c) 2026 Mr omi

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files
(the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify,
merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```
