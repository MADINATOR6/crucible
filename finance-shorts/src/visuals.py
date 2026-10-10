"""Animated scene renderers (pycairo, 1080x1920). Every scene type moves from its first frame to its last.

A scene spec is `{"type": ..., ...}`. `draw_frame` paints one frame; `events_for` lists the sound effects a
scene wants, as (seconds, kind, volume). `render_scene` pipes frames into ffmpeg.
"""
from __future__ import annotations

import math
import subprocess
import sys
from pathlib import Path

import cairo

W, H, FPS = 1080, 1920, 30
NAVY_TOP, NAVY_BOT = (0.043, 0.114, 0.227), (0.02, 0.05, 0.11)
GREEN, GOLD, WHITE, MUTED = (0.24, 0.86, 0.59), (1.0, 0.82, 0.40), (0.96, 0.97, 0.99), (0.56, 0.64, 0.75)
FONT = "Arial"  # "Arial Black" silently falls back to regular weight through cairo's toy API; bold + embolden below


# ---------- helpers ----------

def clamp(x: float, a: float = 0.0, b: float = 1.0) -> float:
    return max(a, min(b, x))


def ease_out_back(x: float, s: float = 1.70158) -> float:
    x = clamp(x)
    return 1 + (s + 1) * (x - 1) ** 3 + s * (x - 1) ** 2


def ease_out_cubic(x: float) -> float:
    return 1 - (1 - clamp(x)) ** 3


def mix(a: tuple, b: tuple, k: float) -> tuple:
    return tuple(x + (y - x) * k for x, y in zip(a, b))


def money(v: float) -> str:
    return f"${v:,.0f}" if abs(v - round(v)) < 1e-9 else f"${v:,.2f}"


def compound_value(principal: float, rate: float, years: float, add: float = 0.0) -> float:
    """Balance after `years` (fractional ok), compounded annually, deposits at year end. Matches the CFPB example at whole years."""
    g = (1 + rate) ** years
    return principal * g + (add * (g - 1) / rate if rate else add * years)


def set_font(c: cairo.Context, size: float) -> None:
    c.select_font_face(FONT, cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_BOLD)
    c.set_font_size(size)


def text_w(c: cairo.Context, s: str, size: float) -> float:
    set_font(c, size)
    return c.text_extents(s).x_advance


def draw_text(c, s, cx, base, size, color=WHITE, alpha=1.0, scale=1.0, outline=0.0):
    """Centered text with baseline `base`; `scale` pops it about its middle."""
    if alpha <= 0 or scale <= 0:
        return
    set_font(c, size)
    x = cx - c.text_extents(s).x_advance / 2
    c.save()
    pivot = base - size * 0.3
    c.translate(cx, pivot)
    c.scale(scale, scale)
    c.translate(-cx, -pivot)
    c.set_line_join(cairo.LINE_JOIN_ROUND)
    if outline:
        c.move_to(x, base)
        c.text_path(s)
        c.set_source_rgba(0, 0, 0, alpha * 0.85)
        c.set_line_width(outline + size * 0.04)
        c.stroke()
    c.move_to(x, base)
    c.text_path(s)
    c.set_source_rgba(*color, alpha)
    c.fill_preserve()
    c.set_line_width(size * 0.04)  # embolden: stroke in the fill colour for an Arial-Black-like weight
    c.stroke()
    c.restore()


def rrect(c, x, y, w, h, r):
    c.new_sub_path()
    c.arc(x + w - r, y + r, r, -math.pi / 2, 0)
    c.arc(x + w - r, y + h - r, r, 0, math.pi / 2)
    c.arc(x + r, y + h - r, r, math.pi / 2, math.pi)
    c.arc(x + r, y + r, r, math.pi, 1.5 * math.pi)
    c.close_path()


def wrap(c, text: str, size: float, max_w: float) -> list[list[str]]:
    lines: list[list[str]] = [[]]
    for w in text.split():
        trial = " ".join(lines[-1] + [w])
        if lines[-1] and text_w(c, trial, size) > max_w:
            lines.append([w])
        else:
            lines[-1].append(w)
    return lines


def is_num(word: str) -> bool:
    return any(ch.isdigit() or ch in "$%" for ch in word)


def background(c, t: float) -> None:
    g = cairo.LinearGradient(0, 0, 0, H)
    g.add_color_stop_rgb(0, *NAVY_TOP)
    g.add_color_stop_rgb(1, *NAVY_BOT)
    c.set_source(g)
    c.paint()
    for i in range(14):  # slow drifting discs: parallax so even quiet moments move
        a = i * 2.399
        x = W * (0.5 + 0.45 * math.sin(a * 1.7)) + 40 * math.sin(t * 0.4 + a)
        y = H + 120 - (t * (24 + (i % 5) * 11) + i * 151) % (H + 240)
        c.arc(x, y, 26 + (i * 29) % 70, 0, 2 * math.pi)
        c.set_source_rgba(1, 1, 1, 0.03 + 0.012 * (i % 3))
        c.fill()


# ---------- mascot: Big Nickel, an original coin-head character (see style/persona.md) ----------

TRACK, STRIPE, SKIN, GOLD_D = (0.82, 0.16, 0.20), (0.97, 0.97, 1.0), (0.98, 0.88, 0.72), (0.72, 0.50, 0.10)


def _limb(c, pts, width, stripe=True):
    c.set_line_cap(cairo.LINE_CAP_ROUND)
    c.set_line_join(cairo.LINE_JOIN_ROUND)
    for col, w in ((TRACK, width), (STRIPE, width * 0.2)) if stripe else ((TRACK, width),):
        c.move_to(*pts[0])
        for p in pts[1:]:
            c.line_to(*p)
        c.set_source_rgb(*col)
        c.set_line_width(w)
        c.stroke()


def mascot(c, x: float, feet: float, s: float, t: float, pose: str = "idle") -> None:
    jump = abs(math.sin(t * 7)) * 34 * s if pose == "cheer" else 0
    f = feet - jump
    leg, torso, r = 95 * s, 115 * s, 60 * s
    hip = (x, f - leg)
    neck = (x, hip[1] - torso)
    head = (x, neck[1] - r - 6 * s + (4 * s * math.sin(t * 4) if pose != "cheer" else 0))
    spread = (40 if pose == "cheer" else 28) * s
    for dx in (-spread, spread):  # legs + white sneakers
        _limb(c, [hip, (x + dx, f - 10 * s)], 22 * s)
        c.save()
        c.translate(x + dx + 6 * s * (1 if dx > 0 else -1), f - 4 * s)
        c.scale(1.7, 1)
        c.arc(0, 0, 11 * s, 0, 2 * math.pi)
        c.restore()
        c.set_source_rgb(*STRIPE)
        c.fill()
    # jacket: rounded torso, zip line, collar
    c.move_to(x - 50 * s, neck[1] + 12 * s)
    c.line_to(x + 50 * s, neck[1] + 12 * s)
    c.line_to(x + 40 * s, hip[1] + 12 * s)
    c.line_to(x - 40 * s, hip[1] + 12 * s)
    c.close_path()
    c.set_source_rgb(*TRACK)
    c.fill_preserve()
    c.set_line_join(cairo.LINE_JOIN_ROUND)
    c.set_line_width(14 * s)
    c.stroke()
    c.move_to(x, neck[1] + 6 * s)
    c.line_to(x, hip[1] + 12 * s)
    c.set_source_rgb(*STRIPE)
    c.set_line_width(4 * s)
    c.stroke()
    sh_l, sh_r = (x - 46 * s, neck[1] + 20 * s), (x + 46 * s, neck[1] + 20 * s)
    sway = 5 * s * math.sin(t * 4)
    if pose == "cheer":
        w = 10 * s * math.sin(t * 7)
        arms = [[sh_l, (x - 80 * s, sh_l[1] - 50 * s), (x - 98 * s, sh_l[1] - 115 * s + w)],
                [sh_r, (x + 80 * s, sh_r[1] - 50 * s), (x + 98 * s, sh_r[1] - 115 * s - w)]]
    elif pose == "shrug":  # palms out
        arms = [[sh_l, (x - 78 * s, sh_l[1] + 52 * s), (x - 112 * s, sh_l[1] + 14 * s)],
                [sh_r, (x + 78 * s, sh_r[1] + 52 * s), (x + 112 * s, sh_r[1] + 14 * s)]]
    else:
        arms = [[sh_l, (x - 62 * s, sh_l[1] + 52 * s), (x - 70 * s, sh_l[1] + 100 * s + sway)],
                [sh_r, (x + 62 * s, sh_r[1] + 52 * s), (x + 70 * s, sh_r[1] + 100 * s - sway)]]
    for a in arms:
        _limb(c, a, 18 * s)
        c.arc(*a[-1], 10 * s, 0, 2 * math.pi)
        c.set_source_rgb(*SKIN)
        c.fill()
    # gold chain with pendant
    c.arc(x, neck[1] - 4 * s, 34 * s, 0.12 * math.pi, 0.88 * math.pi)
    c.set_source_rgb(1.0, 0.82, 0.30)
    c.set_line_width(5 * s)
    c.stroke()
    c.arc(x, neck[1] + 32 * s, 10 * s, 0, 2 * math.pi)
    c.fill()
    # coin head
    coin = cairo.RadialGradient(head[0] - r * 0.3, head[1] - r * 0.35, r * 0.1, head[0], head[1], r)
    coin.add_color_stop_rgb(0, 1.0, 0.92, 0.55)
    coin.add_color_stop_rgb(1, 0.95, 0.70, 0.18)
    c.arc(*head, r, 0, 2 * math.pi)
    c.set_source(coin)
    c.fill_preserve()
    c.set_source_rgb(*GOLD_D)
    c.set_line_width(6 * s)
    c.stroke()
    c.arc(*head, r - 11 * s, 0, 2 * math.pi)
    c.set_source_rgba(*GOLD_D, 0.45)
    c.set_line_width(3 * s)
    c.stroke()
    dark = (0.2, 0.12, 0.05)
    blink = 0.15 if (t % 3.2) < 0.12 else 1.0
    for dx in (-21 * s, 21 * s):
        c.save()
        c.translate(head[0] + dx, head[1] - 4 * s)
        c.scale(1, 1.4 * blink)
        c.arc(0, 0, 6.5 * s, 0, 2 * math.pi)
        c.restore()
        c.set_source_rgb(*dark)
        c.fill()
    c.set_source_rgb(*dark)
    c.set_line_cap(cairo.LINE_CAP_ROUND)
    c.set_line_width(6 * s)
    hx, hy = head
    if pose == "shrug":  # both brows up, flat mouth
        for sx in (-1, 1):
            c.move_to(hx + sx * 34 * s, hy - 26 * s)
            c.line_to(hx + sx * 10 * s, hy - 32 * s)
        c.move_to(hx - 14 * s, hy + 24 * s)
        c.line_to(hx + 14 * s, hy + 22 * s)
        c.stroke()
        draw_text(c, "?", hx + 64 * s, hy - 52 * s, 90 * s, GOLD, outline=6 * s)
    else:  # skeptical: one brow cocked, smirk
        c.move_to(hx - 36 * s, hy - 20 * s)
        c.line_to(hx - 10 * s, hy - 30 * s)
        c.move_to(hx + 10 * s, hy - 24 * s)
        c.line_to(hx + 36 * s, hy - 16 * s)
        c.stroke()
        c.move_to(hx - 16 * s, hy + 24 * s)
        if pose == "cheer":
            c.arc(hx, hy + 8 * s, 25 * s, 0.1 * math.pi, 0.9 * math.pi)
        else:
            c.curve_to(hx - 4 * s, hy + 32 * s, hx + 10 * s, hy + 28 * s, hx + 22 * s, hy + 12 * s)
        c.stroke()


# ---------- scene types ----------

def draw_hook(c, t, dur, sp):
    """Big text slams in word by word; mascot reacts underneath."""
    text = sp["text"]
    size, lines = 150, []
    while size >= 76:
        lines = wrap(c, text, size, 900)
        if len(lines) <= 4:
            break
        size -= 8
    gap = min(0.3, dur * 0.5 / max(len(text.split()), 1))
    base_y = 640 - (len(lines) - 1) * size * 0.58
    idx = 0
    for li, words in enumerate(lines):
        space = text_w(c, " ", size)
        widths = [text_w(c, w, size) for w in words]
        x = W / 2 - (sum(widths) + space * (len(words) - 1)) / 2
        for w, ww in zip(words, widths):
            k = ease_out_back((t - (0.1 + idx * gap)) / 0.28)
            draw_text(c, w, x + ww / 2, base_y + li * size * 1.14, size, GOLD if is_num(w) else WHITE,
                      alpha=clamp(k * 1.5), scale=max(0.01, 0.4 + 0.6 * k), outline=size * 0.09)
            x += ww + space
            idx += 1
    if sp.get("bubble"):
        bx, by = W / 2, 880
        rrect(c, bx - 150, by - 70, 300, 140, 70)
        c.set_source_rgba(1, 1, 1, 0.14)
        c.fill()
        for i in range(3):
            up = 14 * max(0, math.sin(t * 6 - i * 0.9))
            c.arc(bx - 70 + i * 70, by - up, 18, 0, 2 * math.pi)
            c.set_source_rgba(*GOLD, 0.95)
            c.fill()
    mascot(c, W / 2, 1300, 0.95, t, sp.get("mascot", "shrug"))


def draw_ledger(c, t, dur, sp):
    """Cards for each row; only the newest row animates, earlier rows are already settled."""
    rows, upto = sp["rows"], sp.get("upto", len(sp["rows"]))
    if sp.get("title"):
        draw_text(c, sp["title"].upper(), W / 2, 300, 40, MUTED)
    for i in range(upto):
        row = rows[i]
        newest = i == upto - 1
        k = ease_out_back((t - 0.1) / 0.45) if newest else 1.0
        y = 370 + i * 270 + (1 - k) * 90
        a = clamp(k * 1.6)
        rrect(c, 70, y, 940, 230, 36)
        c.set_source_rgba(1, 1, 1, 0.09 * a)
        c.fill_preserve()
        c.set_source_rgba(1, 1, 1, 0.2 * a)
        c.set_line_width(3)
        c.stroke()
        draw_text(c, row["label"].upper(), 270, y + 92, 44, MUTED, alpha=a)
        prev = rows[i - 1]["value"] if i else row["value"]
        shown = prev + (row["value"] - prev) * ease_out_cubic((t - 0.25) / 0.75) if newest and i else row["value"]
        draw_text(c, money(shown), 400 if not row.get("gain") else 360, y + 190, 100, WHITE, alpha=a)
        if row.get("gain"):
            pulse = 1 + (0.06 * math.sin(t * 7) if newest and sp.get("highlight") and t > 1.0 else 0)
            gx, gw = 800, 300
            rrect(c, gx - gw / 2 + 100, y + 60, gw - 60, 100, 50)
            c.set_source_rgba(*(GOLD if sp.get("highlight") and newest else GREEN), 0.95 * a)
            c.fill()
            draw_text(c, "+" + money(row["gain"]), gx + 70, y + 130, 52, (0.05, 0.1, 0.2), alpha=a, scale=pulse)


def draw_counter(c, t, dur, sp):
    """Year-by-year growth: ticking dollar number, drawing curve, assumption chips (like the 406k-view reference)."""
    P, r, Y, add = sp["principal"], sp["rate"], sp["years"], sp.get("annual_add", 0)
    hold = min(1.6, dur * 0.22)
    p = clamp(t / max(dur - hold, 0.1))
    yrs = Y * p
    val = compound_value(P, r, yrs, add)
    vmax = compound_value(P, r, Y, add) * 1.04
    chips = [f"START {money(P)}", f"{r * 100:g}% / YEAR", f"{Y} YEARS"] + ([f"+{money(add)} / YEAR"] if add else [])
    fs = 34
    widths = [text_w(c, s, fs) + 56 for s in chips]
    x = W / 2 - (sum(widths) + 18 * (len(chips) - 1)) / 2
    for s, w in zip(chips, widths):
        rrect(c, x, 205, w, 76, 38)
        c.set_source_rgba(1, 1, 1, 0.10)
        c.fill_preserve()
        c.set_source_rgba(1, 1, 1, 0.28)
        c.set_line_width(2)
        c.stroke()
        draw_text(c, s, x + w / 2, 255, fs, WHITE)
        x += w + 18
    done = p >= 1
    draw_text(c, f"YEAR {Y if done else int(yrs)}", W / 2, 470, 64, mix(MUTED, WHITE, p))
    label = f"${val:,.0f}"
    size = 176
    while text_w(c, label, size) > 960:
        size -= 6
    pulse = 1 + (0.035 * math.sin(t * 8) if done else 0.045 * max(0, 1 - (yrs % 1) * 6))
    draw_text(c, label, W / 2, 650, size, mix(WHITE, GREEN, p), scale=pulse, outline=4)
    ax, ay, aw, ah = 90, 800, 900, 400
    c.move_to(ax, ay + ah)
    c.line_to(ax + aw, ay + ah)
    c.set_source_rgba(1, 1, 1, 0.3)
    c.set_line_width(3)
    c.stroke()
    ypr = ay + ah * (1 - P / vmax)
    c.set_dash([14, 12])
    c.move_to(ax, ypr)
    c.line_to(ax + aw, ypr)
    c.set_source_rgba(1, 1, 1, 0.35)
    c.stroke()
    c.set_dash([])
    draw_text(c, "WHAT YOU PUT IN", ax + aw - 130, ypr - 14, 28, MUTED)
    n = max(2, int(120 * max(p, 0.02)))
    pts = [(ax + aw * (yrs * j / n) / Y, ay + ah * (1 - compound_value(P, r, yrs * j / n, add) / vmax)) for j in range(n + 1)]
    c.move_to(pts[0][0], ay + ah)
    for px, py in pts:
        c.line_to(px, py)
    c.line_to(pts[-1][0], ay + ah)
    c.close_path()
    fill = cairo.LinearGradient(0, ay, 0, ay + ah)
    fill.add_color_stop_rgba(0, *GREEN, 0.45)
    fill.add_color_stop_rgba(1, *GREEN, 0.02)
    c.set_source(fill)
    c.fill()
    c.move_to(*pts[0])
    for px, py in pts[1:]:
        c.line_to(px, py)
    c.set_source_rgb(*GREEN)
    c.set_line_width(9)
    c.set_line_join(cairo.LINE_JOIN_ROUND)
    c.stroke()
    hx, hy = pts[-1]
    glow = cairo.RadialGradient(hx, hy, 2, hx, hy, 52)
    glow.add_color_stop_rgba(0, 1, 1, 1, 0.55)
    glow.add_color_stop_rgba(1, 1, 1, 1, 0)
    c.set_source(glow)
    c.arc(hx, hy, 52, 0, 2 * math.pi)
    c.fill()
    c.arc(hx, hy, 15, 0, 2 * math.pi)
    c.set_source_rgb(1, 1, 1)
    c.fill()
    draw_text(c, "0", ax, ay + ah + 44, 30, MUTED)
    draw_text(c, f"{Y} YEARS", ax + aw - 60, ay + ah + 44, 30, MUTED)
    draw_text(c, "ILLUSTRATION, NOT A PREDICTION", W / 2, 1290, 32, MUTED)


def draw_lines(c, t, dur, sp):
    """Stacked big-text lines pop in one by one."""
    lines = sp["lines"]
    step = min(1.5, dur * 0.7 / len(lines))
    for i, line in enumerate(lines):
        t0 = 0.12 + i * step
        k = ease_out_back((t - t0) / 0.3)
        size = 150
        while text_w(c, line, size) > 940:
            size -= 6
        last = i == len(lines) - 1
        col = GREEN if last else (GOLD if is_num(line) else WHITE)
        base = 500 + i * 210
        draw_text(c, line, W / 2, base, size, col, alpha=clamp(k * 1.6), scale=max(0.01, 0.35 + 0.65 * k), outline=size * 0.08)
        if last and k > 0:
            ul = ease_out_cubic((t - t0 - 0.2) / 0.5)
            w = text_w(c, line, size) * ul
            c.rectangle(W / 2 - w / 2, base + 26, w, 12)
            c.set_source_rgb(*GREEN)
            c.fill()
    done = t > 0.12 + (len(lines) - 1) * step + 0.4
    mascot(c, W / 2, 1300, 0.8, t, "cheer" if done else "idle")


def draw_footage_fallback(c, t, dur, sp):
    draw_hook(c, t, dur, {"text": sp.get("text", "")} if sp.get("text") else {"text": " "})


RENDERERS = {"hook": draw_hook, "ledger": draw_ledger, "counter": draw_counter, "lines": draw_lines,
             "footage": draw_footage_fallback}


def draw_frame(c, spec: dict, t: float, dur: float) -> None:
    c.save()
    background(c, t)
    RENDERERS[spec["type"]](c, t, dur, spec)
    c.restore()


def events_for(spec: dict, dur: float) -> list[tuple[float, str, float]]:
    typ = spec["type"]
    ev: list[tuple[float, str, float]] = [(0.0, "boing" if typ == "hook" else "whoosh", 0.7)]
    if typ == "hook":
        n = len(spec["text"].split())
        gap = min(0.3, dur * 0.5 / max(n, 1))
        ev += [(0.1 + i * gap, "pop", 0.35) for i in range(n)]
    elif typ == "ledger":
        ev.append((0.35, "pop", 0.6))
        if spec["rows"][spec.get("upto", len(spec["rows"])) - 1].get("gain"):
            ev.append((0.9, "cash", 0.6))
    elif typ == "counter":
        hold = min(1.6, dur * 0.22)
        run = max(dur - hold, 0.1)
        Y = spec["years"]
        ev += [(run * k / Y, "tick", 0.3 + 0.4 * k / Y) for k in range(1, Y + 1)]
        ev.append((run, "chime", 0.9))
    elif typ == "lines":
        step = min(1.5, dur * 0.7 / len(spec["lines"]))
        ev += [(0.12 + i * step, "pop", 0.55) for i in range(len(spec["lines"]))]
    return [e for e in ev if e[0] < dur]


def render_scene(spec: dict, dur: float, out: Path) -> None:
    n = max(1, round(dur * FPS))
    surf = cairo.ImageSurface(cairo.FORMAT_ARGB32, W, H)
    c = cairo.Context(surf)
    ff = subprocess.Popen(
        ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "bgra", "-s", f"{W}x{H}", "-r", str(FPS),
         "-i", "-", "-frames:v", str(n), "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-pix_fmt", "yuv420p",
         str(out)], stdin=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        for i in range(n):
            draw_frame(c, spec, i / FPS, dur)
            surf.flush()
            ff.stdin.write(surf.get_data())
        ff.stdin.close()
        err = ff.stderr.read().decode(errors="replace")
        if ff.wait():
            raise RuntimeError(f"ffmpeg failed rendering {out.name}: {err[-800:]}")
    finally:
        if ff.poll() is None:
            ff.kill()


def preview(spec: dict, t: float, dur: float, out: Path) -> None:
    """Dev helper: one frame to PNG."""
    surf = cairo.ImageSurface(cairo.FORMAT_ARGB32, W, H)
    draw_frame(cairo.Context(surf), spec, t, dur)
    surf.write_to_png(str(out))


if __name__ == "__main__":  # python -m src.visuals <script.json> <scene#> <t> <out.png>
    import json
    script = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8-sig"))
    sc = script["scenes"][int(sys.argv[2]) - 1]
    preview(sc["visual"], float(sys.argv[3]), float(sc.get("_dur", 4.0)), Path(sys.argv[4]))
