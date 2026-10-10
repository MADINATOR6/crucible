#!/usr/bin/env python3
"""Pay-as-you-go image and video generation across kie.ai / fal.ai / WaveSpeed. Stdlib only.

  generate.py list
  generate.py run <model> "<prompt>" [--aspect 1:1] [-n 1] [--budget 1.0] [--provider kie] [--dry-run]
                                     [--duration 5] [--image <url|local file>]   (video models)
  generate.py gallery

Keys come from the environment or the repo-root .env (gitignored): KIE_API_KEY, FAL_KEY, WAVESPEED_API_KEY.
Output and log go to media-out/generations/ (gitignored). Never prints keys.
"""
import argparse, base64, json, mimetypes, os, subprocess, sys, time, urllib.request, urllib.error
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
OUT = ROOT / "media-out" / "generations"
KEYS = {"kie": "KIE_API_KEY", "fal": "FAL_KEY", "wavespeed": "WAVESPEED_API_KEY"}
FAL_SIZE = {"1:1": "square_hd", "16:9": "landscape_16_9", "9:16": "portrait_16_9", "4:3": "landscape_4_3", "3:4": "portrait_4_3"}
TIMEOUT = 900  # seconds to wait for one generation (video can be slow)


def env_files():
    """Repo-root .env, plus the main checkout's when running in a git worktree (.env is gitignored, so worktrees lack it)."""
    yield ROOT / ".env"
    try:
        out = subprocess.run(["git", "-C", str(ROOT), "rev-parse", "--path-format=absolute", "--git-common-dir"],
                             capture_output=True, text=True, timeout=10).stdout.strip()
        if out:
            yield Path(out).parent / ".env"
    except (OSError, subprocess.SubprocessError):
        pass


def load_env():
    if os.environ.get("GENERATE_NO_DOTENV"):  # tests: ignore any real .env
        return
    for f in env_files():
        if f.is_file():
            for line in f.read_text(encoding="utf-8").splitlines():
                k, sep, v = line.partition("=")
                if sep and not line.lstrip().startswith("#"):
                    os.environ.setdefault(k.strip(), v.strip().strip("\"'"))


def http(url, key_header, data=None):
    h = {"Content-Type": "application/json", "User-Agent": "generate-skill/1", **key_header}
    req = urllib.request.Request(url, json.dumps(data).encode() if data is not None else None, h)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"HTTP {e.code} from {url.split('?')[0]}: {e.read()[:300].decode(errors='replace')}")


def poll(fetch, done, failed):
    end = time.time() + TIMEOUT
    while time.time() < end:
        r = fetch()
        if done(r):
            return r
        if failed(r):
            raise RuntimeError(f"generation failed: {json.dumps(r)[:300]}")
        time.sleep(3)
    raise RuntimeError("timed out waiting for generation")


# Transports: (provider entry, model id, input dict) -> list of output URLs.
def kie(p, mid, inp):
    h = {"Authorization": "Bearer " + os.environ["KIE_API_KEY"]}
    r = http("https://api.kie.ai/api/v1/jobs/createTask", h, {"model": mid, "input": inp})
    if r.get("code") != 200:
        raise RuntimeError(f"kie rejected task: {r}")
    tid = r["data"]["taskId"]
    d = poll(lambda: http(f"https://api.kie.ai/api/v1/jobs/recordInfo?taskId={tid}", h)["data"],
             lambda d: d.get("state") == "success", lambda d: d.get("state") == "fail")
    return json.loads(d["resultJson"])["resultUrls"]


def fal(p, mid, inp):
    h = {"Authorization": "Key " + os.environ["FAL_KEY"]}
    q = http("https://queue.fal.run/" + mid, h, inp)
    poll(lambda: http(q["status_url"], h), lambda s: s.get("status") == "COMPLETED", lambda s: s.get("status") in ("FAILED", "ERROR"))
    d = http(q["response_url"], h)
    return [i["url"] for i in d["images"]] if "images" in d else [d["video"]["url"]]


def wavespeed(p, mid, inp):
    h = {"Authorization": "Bearer " + os.environ["WAVESPEED_API_KEY"]}
    t = http("https://api.wavespeed.ai/api/v3/" + mid, h, inp)
    t = t.get("data", t)
    res = f"https://api.wavespeed.ai/api/v3/predictions/{t['id']}/result"
    r = poll(lambda: (lambda b: b.get("data", b))(http(res, h)), lambda r: r.get("status") == "completed",
             lambda r: r.get("status") in ("failed", "cancelled", "timeout", "deleted"))
    return r["outputs"]


PROVIDERS = {"kie": kie, "fal": fal, "wavespeed": wavespeed}


def is_video(m):
    return m.get("type") == "video"


def get_model(models, name):
    if name not in models or name.startswith("_"):
        raise SystemExit(f"unknown model '{name}'. known: {', '.join(k for k in models if not k.startswith('_'))}")
    return models[name]


def is_local(image):
    return bool(image) and "://" not in image


def image_value(p, image):
    """URL or asset:// as-is; a local file only for providers that accept a base64 data URI."""
    if not is_local(image):
        return image
    path = Path(image)
    mime = mimetypes.guess_type(path.name)[0] or "image/png"
    return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode()


def model_id(p, image):
    return p.get("id_i2v", p["id"]) if image else p["id"]


def build_input(p, m, prompt, aspect, duration=None, image=None):
    inp = {"prompt": prompt, **p.get("extra", {})}
    if not is_video(m):
        inp["image_size" if p["p"] == "fal" else "aspect_ratio"] = FAL_SIZE.get(aspect, aspect) if p["p"] == "fal" else aspect
        return inp
    if not (image and p.get("i2v_no_aspect")):
        inp["aspect_ratio"] = aspect
    inp["duration"] = str(duration) if p.get("dur_str") else duration
    if image:
        v = image_value(p, image)
        inp[p["img_key"]] = [v] if p.get("img_list") else v
    return inp


def unit_cost(p, m, duration):
    return p["cost_s"] * duration if is_video(m) else p["cost"]


def validate(m, a):
    if not is_video(m):
        if a.image:
            raise SystemExit("--image needs a video model (image models here are text-to-image only)")
        return
    if "dur_in" in m and a.duration not in m["dur_in"]:
        raise SystemExit(f"duration must be one of {m['dur_in']} seconds for this model")
    if "dur_min" in m and not m["dur_min"] <= a.duration <= m["dur_max"]:
        raise SystemExit(f"duration must be {m['dur_min']}-{m['dur_max']} seconds for this model")
    if m.get("aspects") and a.aspect not in m["aspects"]:
        raise SystemExit(f"aspect must be one of {m['aspects']} for this model")
    if is_local(a.image) and not Path(a.image).is_file():
        raise SystemExit(f"image file not found: {a.image}")


def route(model, models, want=None, local_image=False):
    """Providers for `model` that have a key, cheapest first (ponytail: static cost table, edit models.json)."""
    ps = [p for p in get_model(models, model)["providers"] if os.environ.get(KEYS[p["p"]]) and (not want or p["p"] == want)
          and (not local_image or p.get("data_uri"))]
    return sorted(ps, key=lambda p: p.get("cost", p.get("cost_s")))


def run(a, models):
    m = get_model(models, a.model)
    validate(m, a)
    local = is_local(a.image)
    ps = route(a.model, models, a.provider, local)
    if not ps:
        if local:
            raise SystemExit("a local image file needs a provider that accepts base64 images (fal); otherwise pass a public image URL")
        need = " or ".join(KEYS[p["p"]] for p in models[a.model]["providers"])
        raise SystemExit(f"no provider available for {a.model}: set {need} in the environment or repo .env")
    best = ps[0]
    total = unit_cost(best, m, a.duration) * a.n
    tag = " (estimate)" if best.get("est") else ""
    what = f"{a.n} x {a.model}" + (f" {a.duration}s" if is_video(m) else "")
    print(f"quote: {what} via {best['p']} = ${total:.2f}{tag}; budget ${a.budget:.2f}", file=sys.stderr)
    if total > a.budget:
        raise SystemExit(f"refusing: quote ${total:.2f} exceeds budget ${a.budget:.2f} (raise --budget to allow)")
    if a.dry_run:
        return
    OUT.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    for i in range(a.n):
        urls, used, errs = None, None, []
        for p in ps:  # fall back to the next-cheapest provider on error
            try:
                inp = build_input(p, m, a.prompt, a.aspect, a.duration, a.image)
                urls, used = PROVIDERS[p["p"]](p, model_id(p, a.image), inp), p
                break
            except Exception as e:
                errs.append(f"{p['p']}: {e}")
                print(f"{p['p']} failed, trying next: {e}", file=sys.stderr)
        if not urls:
            raise SystemExit("all providers failed:\n" + "\n".join(errs))
        for j, u in enumerate(urls):
            ext = Path(u.split("?")[0]).suffix or (".mp4" if is_video(m) else ".png")
            f = OUT / f"{stamp}-{a.model}-{i + 1}{'-' + str(j + 1) if j else ''}{ext}"
            req = urllib.request.Request(u, headers={"User-Agent": "generate-skill/1"})
            f.write_bytes(urllib.request.urlopen(req, timeout=300).read())
            rec = {"ts": datetime.now().isoformat(timespec="seconds"), "model": a.model, "provider": used["p"],
                   "cost": unit_cost(used, m, a.duration), "est": bool(used.get("est")), "aspect": a.aspect,
                   "prompt": a.prompt, "file": f.name}
            if is_video(m):
                rec.update(duration=a.duration, image=a.image)  # path or URL as given, never the data URI
            with open(OUT / "log.jsonl", "a", encoding="utf-8") as lf:
                lf.write(json.dumps(rec) + "\n")
            print(f)


def gallery():
    log = OUT / "log.jsonl"
    rows = [json.loads(l) for l in log.read_text(encoding="utf-8").splitlines() if l.strip()] if log.exists() else []
    esc = lambda s: s.replace("&", "&amp;").replace("<", "&lt;").replace('"', "&quot;")
    media = lambda f: (f'<video src="{esc(f)}" controls loop muted preload="metadata"></video>' if f.lower().endswith((".mp4", ".webm", ".mov"))
                       else f'<a href="{esc(f)}"><img src="{esc(f)}" loading="lazy"></a>')
    cards = "".join(
        f'<figure>{media(r["file"])}'
        f'<figcaption><b>{esc(r["model"])}</b> · {esc(r["provider"])} · ${r["cost"]:.2f}<br>{esc(r["prompt"])}</figcaption></figure>'
        for r in reversed(rows))
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "index.html").write_text(
        '<!doctype html><meta charset="utf-8"><title>Generations</title><style>'
        'body{font:14px system-ui;background:#111;color:#ddd;margin:16px}.g{columns:260px;gap:12px}'
        'figure{break-inside:avoid;margin:0 0 12px}img,video{width:100%;border-radius:6px;display:block}'
        'figcaption{padding:4px 2px;font-size:12px;color:#999}a{color:inherit}</style>'
        f'<h1>Generations ({len(rows)}) · ${sum(r["cost"] for r in rows):.2f}</h1><div class="g">{cards}</div>', encoding="utf-8")
    print(OUT / "index.html")


def main(argv=None):
    load_env()
    models = json.loads((HERE / "models.json").read_text(encoding="utf-8"))
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("list")
    sub.add_parser("gallery")
    r = sub.add_parser("run")
    r.add_argument("model")
    r.add_argument("prompt")
    r.add_argument("--aspect", default="1:1")
    r.add_argument("-n", type=int, default=1)
    r.add_argument("--budget", type=float, default=1.0, help="max USD for this call (default 1.00)")
    r.add_argument("--provider", choices=list(KEYS))
    r.add_argument("--duration", type=int, default=5, help="seconds (video models)")
    r.add_argument("--image", help="first-frame image for video: public URL, or a local file (fal only)")
    r.add_argument("--dry-run", action="store_true", help="print the quote and stop")
    a = ap.parse_args(argv)
    if a.cmd == "list":
        for k, v in models.items():
            if k.startswith("_"):
                continue
            cost = lambda p: f"${p['cost_s']:.3f}/s" if "cost_s" in p else f"${p['cost']:.2f}"
            print(f"{k} ({'video' if is_video(v) else 'image'}): " + ", ".join(
                f"{p['p']} {cost(p)}{'?' if p.get('est') else ''}{'' if os.environ.get(KEYS[p['p']]) else ' (no key)'}" for p in v["providers"]))
    elif a.cmd == "gallery":
        gallery()
    else:
        run(a, models)


if __name__ == "__main__":
    main()
