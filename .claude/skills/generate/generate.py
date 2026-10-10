#!/usr/bin/env python3
"""Pay-as-you-go image generation across kie.ai / fal.ai / WaveSpeed. Stdlib only.

  generate.py list
  generate.py run <model> "<prompt>" [--aspect 1:1] [-n 1] [--budget 1.0] [--provider kie] [--dry-run]
  generate.py gallery

Keys come from the environment or the repo-root .env (gitignored): KIE_API_KEY, FAL_KEY, WAVESPEED_API_KEY.
Output and log go to media-out/generations/ (gitignored). Never prints keys.
"""
import argparse, json, os, subprocess, sys, time, urllib.request, urllib.error
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
OUT = ROOT / "media-out" / "generations"
KEYS = {"kie": "KIE_API_KEY", "fal": "FAL_KEY", "wavespeed": "WAVESPEED_API_KEY"}
FAL_SIZE = {"1:1": "square_hd", "16:9": "landscape_16_9", "9:16": "portrait_16_9", "4:3": "landscape_4_3", "3:4": "portrait_4_3"}
TIMEOUT = 600  # seconds to wait for one generation


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


def kie(entry, prompt, aspect):
    h = {"Authorization": "Bearer " + os.environ["KIE_API_KEY"]}
    inp = {"prompt": prompt, "aspect_ratio": aspect, **entry.get("extra", {})}
    r = http("https://api.kie.ai/api/v1/jobs/createTask", h, {"model": entry["id"], "input": inp})
    if r.get("code") != 200:
        raise RuntimeError(f"kie rejected task: {r}")
    tid = r["data"]["taskId"]
    d = poll(lambda: http(f"https://api.kie.ai/api/v1/jobs/recordInfo?taskId={tid}", h)["data"],
             lambda d: d.get("state") == "success", lambda d: d.get("state") == "fail")
    return json.loads(d["resultJson"])["resultUrls"]


def fal(entry, prompt, aspect):
    h = {"Authorization": "Key " + os.environ["FAL_KEY"]}
    inp = {"prompt": prompt, "image_size": FAL_SIZE.get(aspect, aspect), **entry.get("extra", {})}
    q = http("https://queue.fal.run/" + entry["id"], h, inp)
    poll(lambda: http(q["status_url"], h), lambda s: s.get("status") == "COMPLETED", lambda s: s.get("status") in ("FAILED", "ERROR"))
    return [i["url"] for i in http(q["response_url"], h)["images"]]


def wavespeed(entry, prompt, aspect):
    h = {"Authorization": "Bearer " + os.environ["WAVESPEED_API_KEY"]}
    inp = {"prompt": prompt, "aspect_ratio": aspect, **entry.get("extra", {})}
    t = http("https://api.wavespeed.ai/api/v3/" + entry["id"], h, inp)
    t = t.get("data", t)
    res = f"https://api.wavespeed.ai/api/v3/predictions/{t['id']}/result"
    r = poll(lambda: (lambda b: b.get("data", b))(http(res, h)), lambda r: r.get("status") == "completed",
             lambda r: r.get("status") in ("failed", "cancelled", "timeout", "deleted"))
    return r["outputs"]


PROVIDERS = {"kie": kie, "fal": fal, "wavespeed": wavespeed}


def route(model, models, want=None):
    """Providers for `model` that have a key, cheapest first (ponytail: static cost table, edit models.json)."""
    if model not in models:
        raise SystemExit(f"unknown model '{model}'. known: {', '.join(k for k in models if not k.startswith('_'))}")
    ps = [p for p in models[model]["providers"] if os.environ.get(KEYS[p["p"]]) and (not want or p["p"] == want)]
    return sorted(ps, key=lambda p: p["cost"])


def run(a, models):
    ps = route(a.model, models, a.provider)
    if not ps:
        need = " or ".join(KEYS[p["p"]] for p in models[a.model]["providers"])
        raise SystemExit(f"no provider available for {a.model}: set {need} in the environment or repo .env")
    best = ps[0]
    total = best["cost"] * a.n
    tag = " (estimate)" if best.get("est") else ""
    print(f"quote: {a.n} x {a.model} via {best['p']} = ${total:.2f}{tag}; budget ${a.budget:.2f}", file=sys.stderr)
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
                urls, used = PROVIDERS[p["p"]](p, a.prompt, a.aspect), p
                break
            except Exception as e:
                errs.append(f"{p['p']}: {e}")
                print(f"{p['p']} failed, trying next: {e}", file=sys.stderr)
        if not urls:
            raise SystemExit("all providers failed:\n" + "\n".join(errs))
        for j, u in enumerate(urls):
            ext = Path(u.split("?")[0]).suffix or ".png"
            f = OUT / f"{stamp}-{a.model}-{i + 1}{'-' + str(j + 1) if j else ''}{ext}"
            req = urllib.request.Request(u, headers={"User-Agent": "generate-skill/1"})
            f.write_bytes(urllib.request.urlopen(req, timeout=120).read())
            rec = {"ts": datetime.now().isoformat(timespec="seconds"), "model": a.model, "provider": used["p"],
                   "cost": used["cost"], "est": bool(used.get("est")), "aspect": a.aspect, "prompt": a.prompt, "file": f.name}
            with open(OUT / "log.jsonl", "a", encoding="utf-8") as lf:
                lf.write(json.dumps(rec) + "\n")
            print(f)


def gallery():
    log = OUT / "log.jsonl"
    rows = [json.loads(l) for l in log.read_text(encoding="utf-8").splitlines() if l.strip()] if log.exists() else []
    esc = lambda s: s.replace("&", "&amp;").replace("<", "&lt;").replace('"', "&quot;")
    cards = "".join(
        f'<figure><a href="{esc(r["file"])}"><img src="{esc(r["file"])}" loading="lazy"></a>'
        f'<figcaption><b>{esc(r["model"])}</b> · {esc(r["provider"])} · ${r["cost"]:.2f}<br>{esc(r["prompt"])}</figcaption></figure>'
        for r in reversed(rows))
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "index.html").write_text(
        '<!doctype html><meta charset="utf-8"><title>Generations</title><style>'
        'body{font:14px system-ui;background:#111;color:#ddd;margin:16px}.g{columns:260px;gap:12px}'
        'figure{break-inside:avoid;margin:0 0 12px}img{width:100%;border-radius:6px;display:block}'
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
    r.add_argument("--dry-run", action="store_true", help="print the quote and stop")
    a = ap.parse_args(argv)
    if a.cmd == "list":
        for m, v in models.items():
            if m.startswith("_"):
                continue
            print(m + ": " + ", ".join(f"{p['p']} ${p['cost']:.2f}{'?' if p.get('est') else ''}{'' if os.environ.get(KEYS[p['p']]) else ' (no key)'}" for p in v["providers"]))
    elif a.cmd == "gallery":
        gallery()
    else:
        run(a, models)


if __name__ == "__main__":
    main()
