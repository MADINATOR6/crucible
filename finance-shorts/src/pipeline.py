"""Topic -> reviewed fact brief -> script -> voiceover -> animated scenes -> captioned 1080x1920 Short.

Never posts anything. A human watches output/<slug>.mp4 and uploads it.
Run from finance-shorts/:  python -m src.pipeline <slug> [--script file.json] [--brief file.json]
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import subprocess
import sys
from pathlib import Path

from .checks import DISCLAIMER, check_brief, check_script
from .music import write_music
from .sfx import write_sfx
from .visuals import events_for, render_scene

ROOT = Path(__file__).resolve().parent.parent
VOICE = os.environ.get("SHORTS_VOICE", "en-US-RogerNeural")
RATE = os.environ.get("SHORTS_RATE", "+22%")  # Roger is slow at +0%: ~1.8 words/s, too long for a 30 s Short
PITCH = os.environ.get("SHORTS_PITCH", "-6Hz")  # slightly lower = gruffer; Edge TTS has no accents
MODEL = os.environ.get("SHORTS_MODEL", "claude-sonnet-5-5")
FPS = 30

# Safe areas: the Shorts interface covers roughly the bottom 300 px, so captions sit at y~1400, disclaimer at y~1590.
ASS_HEAD = """[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,Arial,84,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,8,3,2,50,50,500,1
Style: Disc,Arial,34,&H00E6E6E6,&H00E6E6E6,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,3,0,2,60,60,330,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
HILITE = r"{\c&H0066D1FF&\fscx114\fscy114}"  # active caption word: gold, slightly larger (ASS colours are BGR)


class PipelineError(Exception):
    pass


def load_env() -> None:
    from dotenv import load_dotenv
    load_dotenv(ROOT / ".env")
    load_dotenv(ROOT.parent / ".env")  # repo-root .env is gitignored too


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8-sig"))  # tolerate the BOM Windows editors add


def sh(cmd: list[str], cwd: Path) -> None:
    p = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    if p.returncode:
        raise PipelineError(f"{cmd[0]} failed:\n{p.stderr[-1500:]}")


def audio_seconds(path: Path) -> float:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                         capture_output=True, text=True, check=True).stdout
    return float(out)


# ---------- inputs ----------

def load_topic(slug: str) -> dict:
    for t in read_json(ROOT / "topics.json"):
        if t["slug"] == slug:
            return t
    raise PipelineError(f"unknown topic {slug!r}; run with --list")


def load_brief(slug: str, path: Path | None) -> dict:
    path = path or ROOT / "briefs" / f"{slug}.json"
    if not path.exists():
        template = {"reviewed": False,
                    "sources": [{"name": "", "url": ""}, {"name": "", "url": ""}],
                    "facts": [{"id": "f1", "text": "", "source": 0}],
                    "assumptions": []}
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(template, indent=2), encoding="utf-8")
        raise PipelineError(f"no fact brief. Wrote a template to {path}.\n"
                            "Fill in 2+ trusted sources (SEC/Investor.gov, FINRA, CFPB, IRS, Fed, BLS) and the facts, "
                            'verify them against the sources, then set "reviewed": true.')
    return read_json(path)


def extract_json(text: str) -> dict:
    try:
        return json.loads(text[text.index("{"):text.rindex("}") + 1])
    except ValueError as e:
        raise ValueError(f"no valid JSON object in the reply ({e})") from e


def generate_script(topic: dict, brief: dict) -> dict:
    import anthropic
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise PipelineError("ANTHROPIC_API_KEY not set. Put it in finance-shorts/.env, or pass --script <file.json>.")
    client = anthropic.Anthropic()
    playbook = (ROOT / "style" / "playbook.md").read_text(encoding="utf-8-sig")
    prompt = ((ROOT / "prompts" / "script_prompt.txt").read_text(encoding="utf-8")
              .replace("{{TOPIC}}", json.dumps(topic)).replace("{{BRIEF}}", json.dumps(brief, indent=1))
              .replace("{{PLAYBOOK}}", playbook)
              .replace("{{PERSONA}}", (ROOT / "style" / "persona.md").read_text(encoding="utf-8-sig")))
    msgs = [{"role": "user", "content": prompt}]
    errs: list[str] = []
    for _ in range(3):  # initial try + 2 repairs
        resp = client.messages.create(model=MODEL, max_tokens=8000, messages=msgs)
        text = "".join(b.text for b in resp.content if b.type == "text")  # replies may start with a thinking block
        try:
            script = extract_json(text)
            errs = check_script(script, brief)
        except ValueError as e:
            errs = [str(e)]
        if not errs:
            return script
        msgs += [{"role": "assistant", "content": text},
                 {"role": "user", "content": "Fix these problems and return the full JSON again:\n- " + "\n- ".join(errs)}]
    raise PipelineError("script failed the compliance checks after 3 tries:\n- " + "\n- ".join(errs))


# ---------- media ----------

def synth_voice(scenes: list[dict], work: Path) -> list[float]:
    """One mp3 per scene so scene length == narration length. Returns durations in seconds.

    ponytail: edge-tts is Microsoft's unofficial Edge read-aloud endpoint. If the channel earns,
    swap this one function for Azure Speech (same voices, official, free tier).
    """
    import edge_tts

    async def all_() -> None:
        for i, sc in enumerate(scenes, 1):
            await edge_tts.Communicate(sc["narration"], VOICE, rate=RATE, pitch=PITCH).save(str(work / f"voice{i}.mp3"))

    asyncio.run(all_())
    trim = ("silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.04,areverse,"
            "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.08,areverse")  # TTS pads each clip with ~0.3 s of silence
    for i in range(1, len(scenes) + 1):
        sh(["ffmpeg", "-y", "-i", f"voice{i}.mp3", "-af", trim, f"voice{i}t.mp3"], work)
    durs = [audio_seconds(work / f"voice{i}t.mp3") for i in range(1, len(scenes) + 1)]
    (work / "voices.txt").write_text("".join(f"file 'voice{i}t.mp3'\n" for i in range(1, len(scenes) + 1)), encoding="utf-8")
    sh(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", "voices.txt", "-c:a", "aac", "-b:a", "160k", "voice.m4a"], work)
    return durs


def fetch_footage(query: str, dest: Path, used: set[int]) -> Path | None:
    import requests
    key = os.environ.get("PEXELS_API_KEY")
    if not key:
        return None
    if dest.exists():
        return dest
    r = requests.get("https://api.pexels.com/videos/search", headers={"Authorization": key}, timeout=30,
                     params={"query": query, "orientation": "portrait", "size": "medium", "per_page": 10})
    r.raise_for_status()
    for v in r.json().get("videos", []):
        files = [f for f in v.get("video_files", []) if f.get("file_type") == "video/mp4"
                 and f.get("width") and f.get("height", 0) > f["width"]]
        if v["id"] in used or not files:
            continue
        best = min(files, key=lambda f: abs(f["width"] - 1080))
        with requests.get(best["link"], stream=True, timeout=60) as dl:
            dl.raise_for_status()
            with open(dest, "wb") as fh:
                for chunk in dl.iter_content(1 << 20):
                    fh.write(chunk)
        used.add(v["id"])
        return dest
    return None


def footage_segment(work: Path, i: int, dur: float, clip: Path) -> None:
    """Stock clip filling 1080x1920 with a slow pan, so even footage scenes keep moving."""
    vf = (f"scale=1188:2112:force_original_aspect_ratio=increase,crop=1080:1920:x='(iw-1080)*t/{dur:.2f}':y='(ih-1920)/2',"
          "setsar=1,eq=brightness=-0.12")
    sh(["ffmpeg", "-y", "-stream_loop", "-1", "-i", clip.name, "-t", f"{dur:.3f}", "-vf", vf, "-r", str(FPS), "-an",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", f"seg{i}.mp4"], work)


def ass_time(t: float) -> str:
    cs = round(t * 100)
    h, cs = divmod(cs, 360000)
    m, cs = divmod(cs, 6000)
    s, cs = divmod(cs, 100)
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def build_ass(scenes: list[dict], durs: list[float]) -> str:
    """Word-by-word captions: 3 words on screen, the spoken word highlighted.

    ponytail: word times are spread across each scene by character count, not true word timing.
    Drift is under ~0.3 s per scene; use edge-tts word boundaries or whisper if it ever bothers you.
    """
    def clean(s: str) -> str:
        return s.replace("{", "(").replace("}", ")").replace("\n", " ")

    lines, t0 = [], 0.0
    for sc, d in zip(scenes, durs):
        words = clean(sc["narration"]).split()
        total = sum(len(w) + 1 for w in words) or 1
        t = t0
        for k in range(0, len(words), 3):
            chunk = words[k:k + 3]
            for j, w in enumerate(chunk):
                e = t + d * (len(w) + 1) / total
                shown = " ".join(f"{HILITE}{x}{{\\r}}" if n == j else x for n, x in enumerate(chunk))
                lines.append(f"Dialogue: 0,{ass_time(t)},{ass_time(e)},Cap,,0,0,0,,{shown}")
                t = e
        t0 += d
    lines.append(f"Dialogue: 0,{ass_time(0)},{ass_time(t0)},Disc,,0,0,0,,{DISCLAIMER}")
    return ASS_HEAD + "\n".join(lines) + "\n"


def pick_music(total: float, work: Path) -> Path | None:
    """Your own .mp3 in assets/music/ wins; else the synthesised original klezmer-style loop; SHORTS_MUSIC=off disables."""
    mine = sorted((ROOT / "assets" / "music").glob("*.mp3")) if (ROOT / "assets" / "music").exists() else []
    if mine:
        return mine[0]
    if os.environ.get("SHORTS_MUSIC", "klezmer").lower() == "off":
        return None
    write_music(total, work / "music.wav")
    return work / "music.wav"


def assemble(work: Path, n: int, ass: str, out: Path, music: Path | None) -> None:
    (work / "segs.txt").write_text("".join(f"file 'seg{i}.mp4'\n" for i in range(1, n + 1)), encoding="utf-8")
    (work / "captions.ass").write_text(ass, encoding="utf-8")
    sh(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", "segs.txt", "-c", "copy", "video.mp4"], work)
    out.parent.mkdir(parents=True, exist_ok=True)
    cmd = ["ffmpeg", "-y", "-i", "video.mp4", "-i", "voice.m4a", "-i", "sfx.wav"]
    flt = "[0:v]ass=captions.ass[v];[1:a]volume=1.0[a1];[2:a]volume=0.5[a2]"  # relative filter path: no Windows drive colon
    if music:
        cmd += ["-stream_loop", "-1", "-i", str(music)]
        flt += ";[3:a]volume=0.16[a3];[a1][a2][a3]amix=inputs=3:duration=first:normalize=0[a]"
    else:
        flt += ";[a1][a2]amix=inputs=2:duration=first:normalize=0[a]"
    cmd += ["-filter_complex", flt, "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "medium", "-crf", "20",
            "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", str(out)]
    sh(cmd, work)


def write_metadata(script: dict, brief: dict, out: Path, music: Path | None) -> None:
    credit = ("Music: original synthesised track." if music and music.suffix == ".wav"
              else "Music: your own file (check its licence)." if music else "No music.")
    src = "\n".join(f"- {s['name']}: {s['url']}" for s in brief["sources"])
    out.write_text(
        f"TITLE: {script.get('title', '')}\n\nDESCRIPTION:\n{script.get('description', '')}\n\nSources:\n{src}\n\n"
        f"{DISCLAIMER} General education only, not personalized advice.\n"
        f"Voiceover is AI-generated. Sound effects are synthesised. {credit}\n\n"
        f"TAGS: {', '.join(script.get('tags', []))}\n\n"
        "BEFORE YOU POST:\n"
        "- Watch the whole video with sound; check every number against the sources.\n"
        "- Upload with the altered/synthetic content disclosure if YouTube's wording applies to the AI voice.\n"
        "- Pin the sources in a comment. No affiliate links without an FTC disclosure.\n"
        "- After 48 h: python -m src.learn result <slug> --views N --avg-pct P  (feeds style/playbook.md)\n",
        encoding="utf-8")


# ---------- orchestration ----------

def render(slug: str, script_path: Path | None, brief_path: Path | None) -> Path:
    topic = load_topic(slug)
    brief = load_brief(slug, brief_path)
    errs = check_brief(brief)
    if errs:
        raise PipelineError("fact brief not ready:\n- " + "\n- ".join(errs))

    work = ROOT / "assets" / slug
    work.mkdir(parents=True, exist_ok=True)
    if script_path:
        script = read_json(script_path)
        errs = check_script(script, brief)
        if errs:
            raise PipelineError("script failed the checks:\n- " + "\n- ".join(errs))
    else:
        script = generate_script(topic, brief)
    (work / "script.json").write_text(json.dumps(script, indent=2), encoding="utf-8")

    scenes = script["scenes"]
    print(f"[1/4] voiceover ({VOICE}, {len(scenes)} scenes)")
    durs = synth_voice(scenes, work)
    total = sum(durs)
    print(f"      narration {total:.1f}s")
    if total > 59:
        raise PipelineError(f"{total:.0f}s is too long for a Short; shorten the script")

    print("[2/4] animating scenes + sound effects")
    used: set[int] = set()
    sfx, t0 = [], 0.0
    for i, (sc, d) in enumerate(zip(scenes, durs), 1):
        vis = sc["visual"]
        clip = fetch_footage(vis["keywords"], work / f"footage{i}.mp4", used) if vis["type"] == "footage" else None
        if clip:
            footage_segment(work, i, d, clip)
            sfx.append((t0, "whoosh", 0.7))
        else:  # no clip (or not a footage scene): animated renderer, footage falls back to a text hook
            vis = vis if vis["type"] != "footage" else {"type": "hook", "text": sc["narration"].split(".")[0]}
            render_scene(vis, d, work / f"seg{i}.mp4")
            sfx += [(t0 + t, k, v) for t, k, v in events_for(vis, d)]
        t0 += d
    write_sfx(sfx, total, work / "sfx.wav")

    print("[3/4] assemble: captions + voice + effects")
    out = ROOT / "output" / f"{slug}.mp4"
    music = pick_music(total, work)
    assemble(work, len(scenes), build_ass(scenes, durs), out, music)
    write_metadata(script, brief, out.with_suffix(".txt"), music)
    print(f"[4/4] done: {out}")
    return out


def list_topics() -> None:
    for t in read_json(ROOT / "topics.json"):
        b = ROOT / "briefs" / f"{t['slug']}.json"
        state = "no brief" if not b.exists() else ("reviewed" if read_json(b).get("reviewed") else "brief needs review")
        print(f"{t['slug']:<24} {state:<18} {t['title']}")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("slug", nargs="?")
    ap.add_argument("--list", action="store_true", help="show topics and brief status")
    ap.add_argument("--script", type=Path, help="use this script.json instead of calling the Anthropic API")
    ap.add_argument("--brief", type=Path, help="fact brief path (default briefs/<slug>.json)")
    ap.add_argument("--no-music", action="store_true", help="skip the built-in music, e.g. to add a licensed track in YouTube's audio picker")
    a = ap.parse_args()
    load_env()
    if a.no_music:
        os.environ["SHORTS_MUSIC"] = "off"
    if a.list or not a.slug:
        list_topics()
        return 0
    try:
        out = render(a.slug, a.script, a.brief)
    except PipelineError as e:
        print(f"STOP: {e}", file=sys.stderr)
        return 1
    print(f"\nReview before posting: open {out}\nMetadata + checklist: {out.with_suffix('.txt')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
