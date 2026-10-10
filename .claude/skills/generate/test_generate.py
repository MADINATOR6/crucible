"""Offline self-check: python .claude/skills/generate/test_generate.py  (no network, no keys needed)."""
import json, os, sys, tempfile
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).parent))
import generate as g

MODELS = json.loads((Path(__file__).parent / "models.json").read_text(encoding="utf-8"))
for k in g.KEYS.values():
    os.environ.pop(k, None)


def args(**k):
    base = dict(model="gpt-image-2", prompt="p", aspect="1:1", n=1, budget=1.0, provider=None, dry_run=False, duration=5, image=None)
    return SimpleNamespace(**{**base, **k})


def refuses(a, text):
    try:
        g.run(a, MODELS)
    except SystemExit as e:
        assert text in str(e), f"expected '{text}' in '{e}'"
        return
    raise AssertionError(f"expected refusal containing '{text}'")


# routing: only providers with keys, cheapest first
os.environ["FAL_KEY"] = os.environ["KIE_API_KEY"] = "x"
assert [p["p"] for p in g.route("gpt-image-2", MODELS)] == ["kie", "fal"]
assert [p["p"] for p in g.route("gpt-image-2", MODELS, "fal")] == ["fal"]
assert [p["p"] for p in g.route("seedance-2-fast", MODELS)] == ["kie", "fal"]
assert [p["p"] for p in g.route("seedance-2-fast", MODELS, local_image=True)] == ["fal"]  # only fal takes base64
del os.environ["KIE_API_KEY"]
assert [p["p"] for p in g.route("gpt-image-2", MODELS)] == ["fal"]
refuses(args(model="nope"), "unknown model")

# budget guard: fal image is $0.33 each, 4 blows a $1 budget before any request
refuses(args(n=4), "exceeds budget")
# video quote = cost_s * duration: fal seedance 10s = $2.42 > $1
refuses(args(model="seedance-2-fast", duration=10), "exceeds budget")

# validation happens before any spend
refuses(args(model="seedance-2-fast", duration=2), "4-15")
refuses(args(model="kling-2.6", duration=7), "one of [5, 10]")
refuses(args(model="seedance-2-fast", aspect="2:1"), "aspect must be")
refuses(args(image="x.png"), "needs a video model")
refuses(args(model="seedance-2-fast", image="does-not-exist.png"), "not found")

# no key -> clear error
del os.environ["FAL_KEY"]
refuses(args(), "KIE_API_KEY")

# a local image with no data-uri provider (kie only) -> clear error, never uploads
os.environ["KIE_API_KEY"] = "x"
tmp = Path(tempfile.mkdtemp())
png = tmp / "src.png"
png.write_bytes(b"\x89PNG")
refuses(args(model="seedance-2-fast", image=str(png)), "base64")

# input shapes per provider (what actually goes on the wire)
img_m, vid = MODELS["gpt-image-2"], MODELS["seedance-2-fast"]
kie_p, fal_p = vid["providers"][0], vid["providers"][1]
assert g.build_input(MODELS["gpt-image-2"]["providers"][1], img_m, "p", "16:9") == {"prompt": "p", "quality": "high", "image_size": "landscape_16_9"}
assert g.build_input(kie_p, vid, "p", "16:9", 6) == {"prompt": "p", "resolution": "720p", "aspect_ratio": "16:9", "duration": 6}
assert g.build_input(kie_p, vid, "p", "16:9", 6, "https://x/i.png")["first_frame_url"] == "https://x/i.png"
fi = g.build_input(fal_p, vid, "p", "16:9", 6, str(png))
assert fi["duration"] == "6" and fi["image_url"].startswith("data:image/png;base64,")
kl = MODELS["kling-2.6"]
kp = kl["providers"][0]
assert g.model_id(kp, None) == "kling-2.6/text-to-video" and g.model_id(kp, "u") == "kling-2.6/image-to-video"
ki = g.build_input(kp, kl, "p", "16:9", 5, "https://x/i.png")
assert ki["image_urls"] == ["https://x/i.png"] and ki["duration"] == "5" and "aspect_ratio" not in ki and ki["sound"] is False

# fallback: first provider raises, second succeeds; file + log written (image and video)
os.environ["KIE_API_KEY"] = os.environ["FAL_KEY"] = "x"
g.OUT = tmp
mp4 = tmp / "src.mp4"
mp4.write_bytes(b"MP4")
g.PROVIDERS["kie"] = lambda p, mid, inp: (_ for _ in ()).throw(RuntimeError("kie down"))
g.PROVIDERS["fal"] = lambda p, mid, inp: [png.as_uri()]
g.run(args(), MODELS)
g.PROVIDERS["fal"] = lambda p, mid, inp: [mp4.as_uri()]
g.run(args(model="seedance-2-fast", budget=5.0, duration=5, image=str(png)), MODELS)
log = [json.loads(l) for l in (tmp / "log.jsonl").read_text().splitlines()]
assert log[0]["provider"] == "fal" and (tmp / log[0]["file"]).read_bytes() == b"\x89PNG"
assert log[1]["file"].endswith(".mp4") and abs(log[1]["cost"] - 5 * 0.242) < 1e-9 and log[1]["duration"] == 5
assert "base64" not in json.dumps(log)  # the data URI is never logged

# gallery renders images as <img> and videos as <video>
g.gallery()
html = (tmp / "index.html").read_text(encoding="utf-8")
assert f'<img src="{log[0]["file"]}"' in html and f'<video src="{log[1]["file"]}"' in html
print("ok")
