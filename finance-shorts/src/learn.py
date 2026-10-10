"""The learning loop: file reference Shorts and our own results so style/playbook.md stays evidence-based.

  python -m src.learn add <url> --hook "..." --visual "..." --captions "..." --audio "..." --why "..." --avoid "..."
  python -m src.learn rank                       # references by views per day, with what they share
  python -m src.learn result <slug> --views N --avg-pct P [--notes "..."]   # our own posted video
After adding or logging, update style/playbook.md; the script prompt injects it on every run.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import subprocess
import sys
from pathlib import Path

STYLE = Path(__file__).resolve().parent.parent / "style"
OBS = ("hook", "visual", "captions", "audio", "why", "avoid")


def load(name: str) -> list[dict]:
    p = STYLE / name
    return json.loads(p.read_text(encoding="utf-8-sig")) if p.exists() else []


def save(name: str, rows: list[dict]) -> None:
    STYLE.mkdir(exist_ok=True)
    (STYLE / name).write_text(json.dumps(rows, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def fetch_meta(url: str) -> dict:
    p = subprocess.run(["yt-dlp", "--dump-json", "--no-download", "--no-warnings", url], capture_output=True, text=True)
    if p.returncode:
        raise SystemExit(f"yt-dlp failed: {p.stderr[-400:]}")
    j = json.loads(p.stdout)
    return {"id": j["id"], "url": f"https://www.youtube.com/shorts/{j['id']}", "channel": j.get("channel"),
            "title": j.get("title"), "views": j.get("view_count"), "likes": j.get("like_count"),
            "comments": j.get("comment_count"), "duration_s": j.get("duration"), "uploaded": j.get("upload_date"),
            "checked": dt.date.today().isoformat()}


def add(a: argparse.Namespace) -> None:
    meta = fetch_meta(a.url)
    rows = load("references.json")
    row = next((r for r in rows if r["id"] == meta["id"]), None)
    if row is None:
        rows.append(row := {})
    row.update(meta)  # refresh numbers, keep earlier observations
    for k in OBS:
        if getattr(a, k):
            row[k] = getattr(a, k)
    save("references.json", rows)
    print(f"{meta['channel']}: {meta['title']!r} | {meta['views']:,} views, {meta['duration_s']}s")


def rank(_: argparse.Namespace) -> None:
    def per_day(r: dict) -> float:
        up = dt.datetime.strptime(r["uploaded"], "%Y%m%d").date()
        return (r["views"] or 0) / max((dt.date.today() - up).days, 1)

    for r in sorted(load("references.json"), key=per_day, reverse=True):
        print(f"{per_day(r):>10,.0f}/day {r['views']:>10,} views {r['duration_s']:>3}s  {r['channel']}: {r['title'][:50]}")
        print(f"{'':>26}hook: {r.get('hook', '-')}\n{'':>26}visual: {r.get('visual', '-')}")


def result(a: argparse.Namespace) -> None:
    rows = load("results.json")
    rows.append({"slug": a.slug, "views": a.views, "avg_viewed_pct": a.avg_pct, "notes": a.notes,
                 "logged": dt.date.today().isoformat()})
    save("results.json", rows)
    print(f"logged {a.slug}: {a.views:,} views, {a.avg_pct}% average viewed. Now update style/playbook.md open questions.")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("add")
    s.add_argument("url")
    for k in OBS:
        s.add_argument(f"--{k}")
    s.set_defaults(fn=add)
    sub.add_parser("rank").set_defaults(fn=rank)
    r = sub.add_parser("result")
    r.add_argument("slug")
    r.add_argument("--views", type=int, required=True)
    r.add_argument("--avg-pct", type=float, required=True)
    r.add_argument("--notes", default="")
    r.set_defaults(fn=result)
    a = ap.parse_args()
    a.fn(a)
    return 0


if __name__ == "__main__":
    sys.exit(main())
