# Instagram carousels

Standalone, offline Pillow renderer. From `instagram/`:

```powershell
.\.venv\Scripts\python.exe -m carousel prompts-that-save-hours
.\.venv\Scripts\python.exe -m unittest discover -s tests -t .
```

Use `--post <path>` for another JSON input and `--out <new-directory>` for another output directory. Existing non-empty output is preserved; choose a new directory for revisions. Output is ten (or eight to nine) 1080×1350 PNGs and `caption.txt`. Requires the existing Pillow environment and Windows Arial / Arial Bold / Consolas fonts; installs nothing.

Edit `brand.json` for the page name, handle, tagline and six hex colors. Posts contain `title`, ISO `verified_on`, named HTTPS `sources`, `caption`, exactly five `hashtags`, optional `disclosure`, and 8–10 `slides`. First role is `hook`, last `cta`, middle roles `point`. Each slide has a headline (1–9 words), optional kicker, up to three body strings (18 words each), up to three chips and an optional prompt (45 words). All content must fit the safe margins; shorten rejected text rather than clipping it. Money amounts require boolean `allow_money: true`; banned claims remain banned. Sponsored or affiliate content requires disclosure on the CTA and in the caption.

The example uses generic instructions and supplied context, rather than vendor features or promises of a measured time saving. The title is an editorial hook; actual results depend on the task and human review.

**Human review gate:** the owner verifies claims and source dates, checks every image and caption, chooses the final page name/handle and posts manually. Review slides 1, 4 and 10 for visual approval. A source URL and date are metadata, not proof of accuracy. Comment-keyword delivery is copy only; no messaging or posting is automated. The tagline is available as brand metadata; the header shows the name.
