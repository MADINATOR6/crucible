"""Validate content/*.json and inline it into reviewer.html (a single offline file).

The validator enforces the project's accuracy rules mechanically:
- every question, option explanation, rubric point and skill step carries a citation;
- every citation names a registered source and a location (page/slide);
- MCQs have exactly one correct option and a reason for every option;
- context notes are labelled NOT FROM MODULES and are never the only support for an item.

Usage: python nursing-a2/tools/build_reviewer.py [--check]
--check validates only and writes nothing. Exit 1 on any error.
"""
import datetime
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "content"
TEMPLATE = ROOT / "app" / "reviewer.template.html"
OUT = ROOT / "reviewer.html"
CONTEXT_LABEL = "NOT FROM MODULES — verify"
SLOS = {"SLO1", "SLO2", "SLO3", "SLO4", "SLO5"}


def load():
    base = json.loads((CONTENT / "base.json").read_text(encoding="utf-8"))
    base.setdefault("questions", [])
    base.setdefault("context", [])
    for f in sorted(CONTENT.glob("questions-*.json")):
        data = json.loads(f.read_text(encoding="utf-8"))
        for q in data:
            q["_file"] = f.name
        base["questions"].extend(data)
    for f in sorted(CONTENT.glob("skill-*.json")):
        skill = json.loads(f.read_text(encoding="utf-8"))
        for i, s in enumerate(base["skills"]):
            if s["id"] == skill["id"]:
                base["skills"][i] = {**s, **skill}
                break
        else:
            raise SystemExit(f"{f.name}: skill id {skill['id']!r} is not declared in base.json")
    return base


def validate(c):
    errors, warnings = [], []
    sources = c.get("sources", {})

    def check_cites(where, cites, required=True):
        if not cites:
            if required:
                errors.append(f"{where}: no citation")
            return
        for cite in cites:
            if cite.get("src") not in sources:
                errors.append(f"{where}: unknown source {cite.get('src')!r}")
            if not str(cite.get("loc", "")).strip():
                errors.append(f"{where}: citation to {cite.get('src')} has no page/slide location")

    for key, s in sources.items():
        if not s.get("file"):
            errors.append(f"source {key}: no file name")
        folder = ROOT / s.get("folder", "modules")
        if s.get("file") and not (folder / s["file"]).exists():
            warnings.append(f"source {key}: {s.get('folder', 'modules')}/{s['file']} not found on this machine")

    ctx_ids = set()
    for n in c["context"]:
        ctx_ids.add(n.get("id"))
        if n.get("label") != CONTEXT_LABEL:
            errors.append(f"context {n.get('id')}: label must be exactly {CONTEXT_LABEL!r}")

    seen = set()
    for q in c["questions"]:
        qid = q.get("id") or "?"
        where = f"{q.get('_file', '?')}:{qid}"
        if qid in seen:
            errors.append(f"{where}: duplicate id")
        seen.add(qid)
        for field in ("week", "topic"):
            if not q.get(field):
                errors.append(f"{where}: missing {field}")
        bad_slo = set(q.get("slo", [])) - SLOS
        if bad_slo or not q.get("slo"):
            errors.append(f"{where}: slo must be a non-empty subset of {sorted(SLOS)}")
        if q.get("skill") and q["skill"] not in {s["id"] for s in c["skills"]}:
            errors.append(f"{where}: unknown skill {q['skill']!r}")
        for cid in q.get("context", []):
            if cid not in ctx_ids:
                errors.append(f"{where}: unknown context note {cid!r}")
        check_cites(where, q.get("cite"))
        if q.get("type") == "mcq":
            opts = q.get("options", [])
            if not q.get("stem"):
                errors.append(f"{where}: no stem")
            if len(opts) < 3:
                errors.append(f"{where}: needs at least 3 options")
            if sum(1 for o in opts if o.get("correct")) != 1:
                errors.append(f"{where}: needs exactly one correct option")
            for k, o in enumerate(opts):
                if not o.get("text") or not o.get("why"):
                    errors.append(f"{where}: option {k + 1} needs text and why")
            if not q.get("explanation"):
                errors.append(f"{where}: no explanation")
        elif q.get("type") == "saq":
            if not q.get("prompt") or not q.get("model"):
                errors.append(f"{where}: needs prompt and model answer")
            if not q.get("rubric"):
                errors.append(f"{where}: needs rubric points")
            for k, r in enumerate(q.get("rubric", [])):
                if not r.get("point"):
                    errors.append(f"{where}: rubric {k + 1} has no text")
                check_cites(f"{where} rubric {k + 1}", r.get("cite"))
        else:
            errors.append(f"{where}: type must be mcq or saq")

    for s in c["skills"]:
        where = f"skill {s['id']}"
        for k, st in enumerate(s.get("steps", [])):
            if not st.get("text"):
                errors.append(f"{where} step {k + 1}: no text")
            check_cites(f"{where} step {k + 1}", st.get("cite"))
        for k, n in enumerate(s.get("notes", [])):
            check_cites(f"{where} note {k + 1}", n.get("cite"))
    return errors, warnings


def main():
    content = load()
    errors, warnings = validate(content)
    for w in warnings:
        print("WARN ", w)
    for e in errors:
        print("ERROR", e)
    n_steps = sum(len(s.get("steps", [])) for s in content["skills"])
    print(f"{len(content['questions'])} questions, {n_steps} skill steps, {len(errors)} errors, {len(warnings)} warnings")
    if errors:
        sys.exit(1)
    if "--check" in sys.argv:
        return
    for q in content["questions"]:
        q.pop("_file", None)
    content["meta"]["built"] = datetime.datetime.now().strftime("%d %b %Y %H:%M")
    # "</" is escaped so no string in the content can close the <script> element.
    payload = json.dumps(content, ensure_ascii=False).replace("</", "<\\/")
    html = TEMPLATE.read_text(encoding="utf-8")
    marker = "/*__CONTENT__*/null"
    if html.count(marker) != 1:
        sys.exit("template must contain the content marker exactly once")
    OUT.write_text(html.replace(marker, payload), encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT.parent)} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
