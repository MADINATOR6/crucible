"""Compliance and quality guardrails. Pure functions, no network: every check returns a list of problems (empty = ok)."""
from __future__ import annotations

import re
from urllib.parse import urlparse

TRUSTED_DOMAINS = (
    "investor.gov", "sec.gov", "finra.org", "consumerfinance.gov",
    "irs.gov", "federalreserve.gov", "bls.gov",
)
DISCLAIMER = "Educational only. Not financial advice."
MIN_WORDS, MAX_WORDS = 50, 80   # ~2.2 words/s with the default voice: ~23-36 s
MIN_SCENES, MAX_SCENE_WORDS = 6, 24  # playbook: a new visual every 2-4 s
VISUAL_TYPES = {"hook", "ledger", "counter", "lines", "footage"}

BANNED = [re.compile(p, re.I) for p in (
    r"\bguarantee[sd]?\b", r"\brisk[- ]free\b", r"\bcan'?t lose\b", r"\bget rich\b",
    r"\bmillionaire\b", r"\bwill make you\b", r"\bwill (double|triple|be worth)\b",
    r"\byou (should|must|need to) (buy|sell|invest in)\b",
    r"\bwhile you sleep\b", r"\bpassive income\b",
)]
TICKER = re.compile(r"\$[A-Z]{2,5}\b|\b(?:NYSE|NASDAQ):")  # case-sensitive on purpose
_NUM = re.compile(r"\d[\d,]*(?:\.\d+)?")
_INDEX_LABEL = re.compile(r"^(year|month|day|step)\s+\d+$", re.I)


def _norm(s: str) -> str:
    v = float(s.replace(",", ""))
    return str(int(v)) if v.is_integer() else str(v)


def numbers(text: str) -> set[str]:
    """Every number in text, normalised: "$1,102.50" -> "1102.5", "5.0%" -> "5"."""
    return {_norm(m) for m in _NUM.findall(text)}


def _trusted(url: str) -> bool:
    host = (urlparse(url).hostname or "").lower()
    return any(host == d or host.endswith("." + d) for d in TRUSTED_DOMAINS)


def check_brief(brief: dict) -> list[str]:
    errs = []
    if not brief.get("reviewed"):
        errs.append('brief is not marked "reviewed": true (a human must verify the facts against the sources first)')
    sources = brief.get("sources", [])
    good = {s["url"] for s in sources if _trusted(s.get("url", ""))}
    if len(good) < 2:
        errs.append(f"need at least 2 distinct sources on trusted domains {TRUSTED_DOMAINS}; found {len(good)}")
    facts = brief.get("facts", [])
    if not facts:
        errs.append("brief has no facts")
    for f in facts:
        src = f.get("source")
        if not isinstance(src, int) or not 0 <= src < len(sources):
            errs.append(f"fact {f.get('id')}: 'source' must be an index into sources")
        elif not _trusted(sources[src].get("url", "")):
            errs.append(f"fact {f.get('id')}: cites a source that is not on a trusted domain")
    return errs


def brief_text(brief: dict) -> str:
    return " ".join(x["text"] for x in brief.get("facts", []) + brief.get("assumptions", []))


def visual_numbers(v: dict) -> set[str]:
    """Numbers a scene's visual puts on screen that a viewer will read as facts (computed growth values excluded)."""
    out = numbers(" ".join([v.get("text", ""), v.get("title", ""), *v.get("lines", [])]))
    for r in v.get("rows", []):
        if not _INDEX_LABEL.match(r.get("label", "")):  # "Year 1" is a time index, not a claim
            out |= numbers(r.get("label", ""))
        out |= {_norm(str(r[k])) for k in ("value", "gain") if r.get(k)}
    if v.get("type") == "counter":
        out |= {_norm(str(v.get(k, 0))) for k in ("principal", "years", "annual_add") if v.get(k)}
        out.add(_norm(str(round(v.get("rate", 0) * 100, 2))))
    return out


def check_visual(i: int, v: dict) -> list[str]:
    t = v.get("type")
    if t not in VISUAL_TYPES:
        return [f"scene {i}: visual type {t!r} not in {sorted(VISUAL_TYPES)}"]
    need = {"hook": ("text",), "ledger": ("rows",), "counter": ("principal", "rate", "years"),
            "lines": ("lines",), "footage": ("keywords",)}[t]
    errs = [f"scene {i}: {t} visual needs {k!r}" for k in need if not v.get(k)]
    if t == "lines" and len(v.get("lines", [])) > 3:
        errs.append(f"scene {i}: at most 3 lines (4+ run into the mascot)")
    if t == "ledger" and v.get("rows") and not 1 <= v.get("upto", len(v["rows"])) <= len(v["rows"]):
        errs.append(f"scene {i}: ledger 'upto' out of range")
    return errs


def check_script(script: dict, brief: dict) -> list[str]:
    scenes = script.get("scenes", [])
    if not scenes:
        return ["script has no scenes"]
    errs = []
    allowed = numbers(brief_text(brief))
    ids = {f["id"] for f in brief.get("facts", []) + brief.get("assumptions", [])}
    words = 0
    if len(scenes) < MIN_SCENES:
        errs.append(f"{len(scenes)} scenes; want at least {MIN_SCENES} so the picture changes every few seconds")
    if scenes[0].get("visual", {}).get("type") != "hook":
        errs.append("scene 1 must use a 'hook' visual")
    for i, sc in enumerate(scenes, 1):
        text = sc.get("narration", "")
        n = len(text.split())
        words += n
        if n > MAX_SCENE_WORDS:
            errs.append(f"scene {i}: {n} words; split it (max {MAX_SCENE_WORDS})")
        for pat in BANNED:
            if pat.search(text):
                errs.append(f"scene {i}: banned phrase /{pat.pattern}/")
        if TICKER.search(text):
            errs.append(f"scene {i}: looks like a stock ticker (no specific picks)")
        vis = sc.get("visual", {})
        errs += check_visual(i, vis)
        loose = (numbers(text) | visual_numbers(vis)) - allowed
        if loose:
            errs.append(f"scene {i}: numbers not in the fact brief: {sorted(loose)}")
        if (numbers(text) or visual_numbers(vis)) and not sc.get("fact_ids"):
            errs.append(f"scene {i}: has numbers but no fact_ids")
        for fid in sc.get("fact_ids", []):
            if fid not in ids:
                errs.append(f"scene {i}: unknown fact id {fid!r}")
    if not MIN_WORDS <= words <= MAX_WORDS:
        errs.append(f"narration is {words} words; want {MIN_WORDS}-{MAX_WORDS}")
    return errs
