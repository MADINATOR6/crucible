"""ForgeGUI short-video kit (Windows port).

Run with the Kokoro venv python: tools/kokoro/.venv/Scripts/python.exe edit.py
Renders a 1080x1920 vertical short: gameplay cuts + typed chat-panel requests
+ Kokoro voice + subtitles + official logo with an on-screen call to action.
"""
import os
import re
import subprocess
import sys
import wave

import numpy as np
from PIL import Image, ImageDraw, ImageFont

W, H, FPS = 1080, 1920, 30
KIT = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.join(os.path.dirname(KIT), "tools")
PY = os.path.join(TOOLS, "kokoro", ".venv", "Scripts", "python.exe")
LOGO = os.path.join(KIT, "assets", "forgegui_badge.png")
FONTS = r"C:\Windows\Fonts"
SR = 24000


def font(size, bold=True):
    for name in (("segoeuib.ttf" if bold else "segoeui.ttf"), "arialbd.ttf", "arial.ttf"):
        p = os.path.join(FONTS, name)
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


# ---------- footage marks ----------
def read_marks(console_txt, sync_txt):
    """Return ({mark: seconds}, flash_time). Console lines look like '[FILM] name 12.34'."""
    marks = {}
    for line in open(console_txt, encoding="utf8", errors="ignore"):
        m = re.search(r"\[FILM\]\s+(\S+)\s+([\d.]+)", line)
        if m:
            marks[m.group(1)] = float(m.group(2))
    return marks, float(open(sync_txt).read().strip())


def find_flash(raw_mp4, thresh=200):
    """First time (s) the average luma exceeds thresh (the white sync flash)."""
    out = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", raw_mp4, "-vf", "signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-",
         "-an", "-f", "null", "-"], capture_output=True, text=True).stdout
    t = None
    for line in out.splitlines():
        if line.startswith("frame:"):
            t = float(re.search(r"pts_time:([\d.]+)", line).group(1))
        elif "YAVG=" in line and float(line.split("=")[1]) > thresh:
            return t
    return None


# ---------- voice ----------
def wav_len(path):
    with wave.open(path) as w:
        return w.getnframes() / w.getframerate()


def speak(text, speed, cache_dir, said=None):
    os.makedirs(cache_dir, exist_ok=True)
    key = re.sub(r"[^a-z0-9]+", "_", (said or text).lower())[:50] + f"_{speed}"
    out = os.path.join(cache_dir, key + ".wav")
    if not os.path.exists(out):
        subprocess.run([PY, os.path.join(TOOLS, "speak.py"), out, said or text, str(speed)], check=True)
    return out


def read_wav(path):
    import soundfile as sf
    a, sr = sf.read(path, dtype="float32")
    if a.ndim > 1:
        a = a.mean(1)
    if sr != SR:
        raise ValueError(f"{path}: expected {SR} Hz")
    return a


def load_audio(path):
    """Decode any audio file to mono float32 at SR via ffmpeg."""
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32)


# ---------- drawing ----------
def wrap(draw, text, fnt, maxw):
    lines, cur = [], ""
    for word in text.split():
        t = (cur + " " + word).strip()
        if draw.textlength(t, font=fnt) <= maxw or not cur:
            cur = t
        else:
            lines.append(cur)
            cur = word
    return lines + ([cur] if cur else [])


PANEL = (40, 1200, 1040, 1455)


def panel_overlay(text):
    x0, y0, x1, y1 = PANEL
    im = Image.new("RGBA", (x1 - x0, y1 - y0), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    w, h = im.size
    d.rounded_rectangle((0, 0, w - 1, h - 1), 38, fill=(18, 19, 24, 225), outline=(255, 255, 255, 40), width=2)
    f = font(50)
    y = 28
    for line in wrap(d, text + "|", f, w - 70)[:3]:
        d.text((35, y), line, font=f, fill=(255, 255, 255, 255))
        y += 62
    by = h - 78  # button row
    d.ellipse((30, by, 90, by + 60), fill=(60, 62, 72, 255))  # image-plus
    d.rectangle((52, by + 18, 68, by + 42), outline=(255, 255, 255, 255), width=3)
    d.line((60, by + 24, 60, by + 36), fill="white", width=3)
    d.line((54, by + 30, 66, by + 30), fill="white", width=3)
    d.rounded_rectangle((104, by, 250, by + 60), 30, fill=(60, 62, 72, 255))  # sparkle pill
    cx, cy = 140, by + 30
    d.polygon([(cx, cy - 15), (cx + 5, cy - 5), (cx + 15, cy), (cx + 5, cy + 5), (cx, cy + 15),
               (cx - 5, cy + 5), (cx - 15, cy), (cx - 5, cy - 5)], fill=(255, 255, 255, 255))
    d.line((200, by + 26, 212, by + 38, 224, by + 26), fill="white", width=4)  # chevron
    d.ellipse((w - 100, by - 4, w - 30, by + 66), fill=(46, 120, 255, 255))  # send
    d.polygon([(w - 82, by + 12), (w - 46, by + 31), (w - 82, by + 50), (w - 74, by + 31)], fill="white")
    return im


def text_overlay(text, size, y_center, stroke=6, maxw=940, color=(255, 255, 255, 255)):
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    f = font(size)
    lines = wrap(d, text, f, maxw)
    lh = int(size * 1.2)
    y = y_center - lh * len(lines) // 2
    for line in lines:
        tw = d.textlength(line, font=f)
        d.text(((W - tw) / 2, y), line, font=f, fill=color, stroke_width=stroke, stroke_fill=(0, 0, 0, 255))
        y += lh
    return im


def blend(frame, overlay, pos=(0, 0), opacity=1.0):
    """Alpha-blend an RGBA PIL image onto an HxWx3 uint8 frame in place."""
    ov = np.asarray(overlay, dtype=np.float32)
    x, y = pos
    h, w = ov.shape[:2]
    y0, y1, x0, x1 = max(y, 0), min(y + h, H), max(x, 0), min(x + w, W)
    if y1 <= y0 or x1 <= x0:
        return
    ov = ov[y0 - y:y1 - y, x0 - x:x1 - x]
    a = (ov[..., 3:4] / 255.0) * opacity
    reg = frame[y0:y1, x0:x1].astype(np.float32)
    frame[y0:y1, x0:x1] = (reg * (1 - a) + ov[..., :3] * a).astype(np.uint8)


def video_encoder():
    """NVENC when the driver supports this ffmpeg's NVENC API, otherwise libx264."""
    ok = subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=s=1080x1920:d=0.1", "-c:v",
                         "h264_nvenc", "-f", "null", "-"], capture_output=True).returncode == 0
    if ok:
        return ["-c:v", "h264_nvenc", "-preset", "p5", "-b:v", "16M"]
    return ["-c:v", "libx264", "-preset", "veryfast", "-crf", "18"]


# ---------- main build ----------
def build(out, footage, cuts, requests=(), narration=(), title=None, title_label=None, title_until=None,
          logo_at=None, logo_dur=3.5, logo_y=760, cta_text="Try ForgeGUI today", crop_x=0.5,
          speak_requests=True, subtitle_y=((0, 0, 1132),), music=None, music_gain=0.10, sfx=(),
          work="build", logo=LOGO):
    """cuts: [(src_start_s, duration_s)] from the raw footage.
    requests: [(t, text)] chat requests typed at output time t (voice reads them if speak_requests).
    narration: [(t, text, speed, said)] commentary with subtitles; `said` = what Kokoro pronounces.
    subtitle_y: [(start, end, y)] ranges that move subtitles; default y=1132.
    sfx: [(t, path, gain)]."""
    work = os.path.abspath(work)
    os.makedirs(work, exist_ok=True)
    total = sum(d for _, d in cuts)
    nframes = int(round(total * FPS))

    # --- voice + panel timeline ---
    audio = np.zeros(int((total + 1) * SR), dtype=np.float32)

    def put(t, a, gain=1.0):
        i = int(t * SR)
        seg = a[: max(len(audio) - i, 0)]
        audio[i:i + len(seg)] += seg * gain

    panels = []  # (t_start, t_send, text, type_end)
    for rt, text, *hold in requests:  # optional 3rd item: seconds the finished request stays readable
        if speak_requests:
            wav = speak(text, 1.05, os.path.join(work, "voice"))
            put(rt, read_wav(wav))
            dur = max(wav_len(wav), 0.9)
        else:
            dur = max(len(text) * 0.045, 0.9)
        panels.append((rt, rt + dur, rt + dur + (hold[0] if hold else 0.45), text))
    subs = []
    for item in narration:
        t, text, speed = item[0], item[1], item[2]
        said = item[3] if len(item) > 3 else None
        wav = speak(text, speed, os.path.join(work, "voice"), said)
        put(t, read_wav(wav))
        subs.append((t, t + wav_len(wav) + 0.15, text))
    for t, path, g in sfx:
        put(t, load_audio(path), g)
    if music:
        m = load_audio(music)[: len(audio)]
        audio[: len(m)] += m * music_gain
    mix = os.path.join(work, "mix.wav")
    import soundfile as sf
    sf.write(mix, np.clip(audio, -1, 1), SR)

    # --- overlays that don't change ---
    title_im = None
    if title or title_label:
        title_im = text_overlay(title_label or title, 78, 170, maxw=900)
    logo_im = None
    if logo_at is not None:
        if not os.path.exists(logo):
            sys.exit(f"Official logo missing: put forgegui_badge.png at {logo} (or pass logo=)")
        lg = Image.open(logo).convert("RGBA")
        lw = 380
        lg = lg.resize((lw, int(lg.height * lw / lg.width)), Image.LANCZOS)
        logo_im = lg
    cta_im = text_overlay(cta_text, 92, logo_y - 290, stroke=8, maxw=960) if (logo_im and cta_text) else None
    sub_cache, panel_cache = {}, {}

    # --- video: pipe frames from ffmpeg decode into ffmpeg encode ---
    vf = f"scale=-2:{H},crop={W}:{H}:(iw-{W})*{crop_x}:0,fps={FPS}"
    enc_v = video_encoder()
    silent = os.path.join(work, "video.mp4")
    enc = subprocess.Popen(["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
                            "-r", str(FPS), "-i", "-", *enc_v, "-pix_fmt", "yuv420p", silent],
                           stdin=subprocess.PIPE)
    fsize = W * H * 3
    i = 0
    for src_start, dur in cuts:
        n = int(round(dur * FPS))
        dec = subprocess.Popen(["ffmpeg", "-v", "error", "-ss", str(src_start), "-i", footage, "-t", str(dur + 0.2),
                                "-vf", vf, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                               stdout=subprocess.PIPE)
        last = None
        for _ in range(n):
            buf = dec.stdout.read(fsize)
            if len(buf) == fsize:
                last = np.frombuffer(buf, np.uint8).reshape(H, W, 3).copy()
            elif last is None:
                last = np.zeros((H, W, 3), np.uint8)
            fr = last.copy()
            t = i / FPS
            if title_im is not None and (title_until is None or t < title_until):
                fade = 1.0 if title_until is None else min(1.0, max(0.0, (title_until - t) / 0.4))
                blend(fr, title_im, opacity=fade)
            for ts, te, hide, text in panels:
                if ts <= t < hide:
                    if t < te:  # typing: reveal proportionally over the voice duration
                        shown = text[: max(1, int(len(text) * (t - ts) / (te - ts)) + 1)]
                    else:
                        shown = text
                    if shown not in panel_cache:
                        panel_cache[shown] = panel_overlay(shown)
                    blend(fr, panel_cache[shown], PANEL[:2])
            for ss, se, stext in subs:
                if ss <= t < se:
                    y = 1132
                    for a, b, yy in subtitle_y:
                        if a <= t < b:
                            y = yy
                    k = (stext, y)
                    if k not in sub_cache:
                        sub_cache[k] = text_overlay(stext, 56, y)
                    blend(fr, sub_cache[k])
            if logo_im is not None and logo_at <= t < logo_at + logo_dur:
                op = min(1.0, (t - logo_at) / 0.3, (logo_at + logo_dur - t) / 0.3 + 0.0)
                op = max(0.0, min(1.0, op))
                blend(fr, logo_im, ((W - logo_im.width) // 2, logo_y - logo_im.height // 2), op)
                if cta_im is not None:
                    blend(fr, cta_im, opacity=op)
            enc.stdin.write(fr.tobytes())
            i += 1
        dec.stdout.close()
        dec.wait()
    enc.stdin.close()
    enc.wait()

    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", silent, "-i", mix, "-map", "0:v", "-map", "1:a",
                    "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
                    "-shortest", out], check=True)
    print("wrote", out, f"({total:.1f}s)")
