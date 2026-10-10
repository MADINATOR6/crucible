"""Offline self-check: python .claude/skills/generate/test_generate.py  (no network, no keys needed)."""
import json, os, sys, tempfile
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).parent))
import generate as g

MODELS = json.loads((Path(__file__).parent / "models.json").read_text(encoding="utf-8"))
for k in g.KEYS.values():
    os.environ.pop(k, None)

# routing: only providers with keys, cheapest first
os.environ["FAL_KEY"] = os.environ["KIE_API_KEY"] = "x"
assert [p["p"] for p in g.route("gpt-image-2", MODELS)] == ["kie", "fal"]
assert [p["p"] for p in g.route("gpt-image-2", MODELS, "fal")] == ["fal"]
del os.environ["KIE_API_KEY"]
assert [p["p"] for p in g.route("gpt-image-2", MODELS)] == ["fal"]

args = lambda **k: SimpleNamespace(model="gpt-image-2", prompt="p", aspect="1:1", n=1, budget=1.0, provider=None, dry_run=False, **k)

# budget guard: fal is $0.33 each, 4 of them blows a $1 budget before any request is made
try:
    g.run(SimpleNamespace(**{**vars(args()), "n": 4}), MODELS)
    raise AssertionError("budget not enforced")
except SystemExit as e:
    assert "exceeds budget" in str(e)

# no key -> clear error
del os.environ["FAL_KEY"]
try:
    g.run(args(), MODELS)
    raise AssertionError("missing key not reported")
except SystemExit as e:
    assert "KIE_API_KEY" in str(e)

# fallback: first provider raises, second succeeds, file + log written
os.environ["KIE_API_KEY"] = os.environ["FAL_KEY"] = "x"
tmp = Path(tempfile.mkdtemp())
g.OUT = tmp
png = tmp / "src.png"
png.write_bytes(b"\x89PNG")
g.PROVIDERS["kie"] = lambda e, p, a: (_ for _ in ()).throw(RuntimeError("kie down"))
g.PROVIDERS["fal"] = lambda e, p, a: [png.as_uri()]
g.run(args(), MODELS)
log = [json.loads(l) for l in (tmp / "log.jsonl").read_text().splitlines()]
assert log[0]["provider"] == "fal" and (tmp / log[0]["file"]).read_bytes() == b"\x89PNG"

# gallery renders the log
g.gallery()
assert log[0]["file"] in (tmp / "index.html").read_text(encoding="utf-8")
print("ok")
