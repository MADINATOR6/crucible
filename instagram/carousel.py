"""Standalone, offline Instagram carousel renderer (Pillow only)."""
import argparse
from datetime import date
import io
import json
from pathlib import Path
import re
import sys
from urllib.parse import urlparse

from PIL import Image, ImageColor, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
FONTS = Path('C:/Windows/Fonts')
SIZE = (1080, 1350)
BANNED = re.compile(
    r"\bguarantee(?:d)?\b|\bget rich\b|\bpassive income\b|"
    r"\b(?:make|earn)\s+\$\s*\d|\b10x your income\b|\bovernight\b|"
    r"\bsecret that\b|\bthey don['’]t want you to know\b", re.I)


def font(size, bold=False, mono=False):
    return ImageFont.truetype(str(FONTS / ('consola.ttf' if mono else
                                          'arialbd.ttf' if bold else 'arial.ttf')), size)


def texts(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for item in value.values():
            yield from texts(item)
    elif isinstance(value, list):
        for item in value:
            yield from texts(item)


def wrap(text, face, width):
    lines = []
    for paragraph in text.split('\n'):
        line = ''
        for word in paragraph.split():
            if face.getlength(word) > width:
                raise ValueError('a word exceeds the available width')
            candidate = f'{line} {word}'.strip()
            if face.getlength(candidate) > width:
                lines.append(line)
                line = word
            else:
                line = candidate
        lines.append(line)
    return lines


def block(text, size, width=900, bold=False, mono=False):
    face = font(size, bold, mono)
    lines = wrap(text, face, width)
    step = size + 12
    return (lines, face, step, len(lines) * step)


def layout(slide, disclosure=''):
    minimum = 110 if slide['role'] == 'hook' else 90
    for size in range(136 if slide['role'] == 'hook' else 112, minimum - 1, -2):
        try:
            headline = block(slide['headline'], size, 892, bold=True)
        except ValueError:
            continue
        if len(headline[0]) <= 4:
            break
    else:
        raise ValueError('headline cannot fit within 4 lines at the minimum font size')
    parts = [('headline', headline, headline[3])]
    if slide.get('chips'):
        chips = slide['chips']
        if sum(font(36).getlength(t) + 44 for t in chips) + 16 * (len(chips) - 1) > 900:
            raise ValueError('chips cannot fit on one row')
        parts.append(('chips', chips, 64))
    if slide.get('body'):
        body = block('\n'.join(slide['body']), 44, 828)
        parts.append(('body', body, body[3] + 64))
    if slide.get('prompt'):
        prompt = block(slide['prompt'], 32, 828, mono=True)
        parts.append(('prompt', prompt, prompt[3] + 104))
    if slide['role'] == 'hook':
        parts.append(('illustration', None, 360))
    if disclosure and slide['role'] == 'cta':
        notice = block(disclosure, 28, 828)
        parts.append(('disclosure', notice, notice[3] + 56))
    occupied = sum(p[2] for p in parts)
    gap = (1155 - 245 - occupied) / max(1, len(parts) - 1)
    if gap < 22:
        raise ValueError('slide content cannot fit inside the safe margins')
    # A single headline still has an anchor panel to fill the central band.
    if len(parts) == 1:
        parts.append(('illustration', None, 360))
        gap = 1155 - 245 - occupied - 360
        if gap < 22:
            raise ValueError('slide content cannot fit inside the safe margins')
    cards = sum(kind in ('body', 'prompt', 'disclosure') for kind, _, _ in parts)
    if cards and gap > 90:
        extra = (gap - 90) * (len(parts) - 1) / cards
        parts = [(kind, value, height + extra if kind in ('body', 'prompt', 'disclosure') else height)
                 for kind, value, height in parts]
        gap = 90
    return parts, min(gap, 160), block(slide.get('kicker', slide['role'].upper()), 36, 820, bold=True)


def validate(post, brand):
    errors = []
    if not isinstance(post, dict) or not isinstance(brand, dict):
        return ['post and brand must be JSON objects']
    for key in ('title', 'caption'):
        if not isinstance(post.get(key), str) or not post[key].strip():
            errors.append(f'{key} must be a non-empty string')
    for key in ('allow_money', 'sponsored'):
        if key in post and not isinstance(post[key], bool):
            errors.append(f'{key} must be a boolean')
    disclosure = post.get('disclosure', '')
    if not isinstance(disclosure, str):
        errors.append('disclosure must be a string')
    try:
        checked = post.get('verified_on')
        if not isinstance(checked, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', checked):
            raise ValueError()
        date.fromisoformat(checked)
    except ValueError:
        errors.append('verified_on must be an ISO date (YYYY-MM-DD)')
    sources = post.get('sources')
    if not isinstance(sources, list) or not sources:
        errors.append('sources must contain at least one HTTPS reference')
    else:
        for source in sources:
            url = source.get('url') if isinstance(source, dict) else None
            parsed = urlparse(url) if isinstance(url, str) else None
            if not parsed or parsed.scheme != 'https' or not parsed.netloc or not isinstance(source.get('name'), str) or not source['name'].strip():
                errors.append('each source needs a name and an HTTPS URL')
    hashtags = post.get('hashtags')
    if not isinstance(hashtags, list) or len(hashtags) != 5 or any(
            not isinstance(t, str) or not re.fullmatch(r'#[\w]+', t) for t in hashtags):
        errors.append('hashtags must contain exactly 5 tags beginning with #')
    for text in texts(post):
        if BANNED.search(text):
            errors.append('banned claim: ' + repr(text))
        if post.get('allow_money') is not True and re.search(r'\$\s*\d', text):
            errors.append('money amounts require allow_money: true')
    slide_text = '\n'.join(texts([post.get('caption'), post.get('slides')]))
    if (post.get('sponsored') is True or re.search(r'affiliate|link in bio to buy', slide_text, re.I)) and (
            not isinstance(disclosure, str) or not disclosure.strip()):
        errors.append('affiliate or sponsored content requires disclosure')
    for key in ('name', 'handle', 'tagline'):
        if not isinstance(brand.get(key), str) or not brand[key].strip():
            errors.append(f'brand {key} must be a non-empty string')
    colors = brand.get('colors', {})
    for key in ('bg1', 'bg2', 'accent', 'accent2', 'text', 'card'):
        if not isinstance(colors, dict) or not re.fullmatch(r'#[0-9a-fA-F]{6}', str(colors.get(key, ''))):
            errors.append(f'brand color {key} must be #RRGGBB')
    slides = post.get('slides')
    if not isinstance(slides, list) or not 8 <= len(slides) <= 10:
        errors.append('slides must contain 8 to 10 slides')
    if isinstance(slides, list):
        for index, slide in enumerate(slides):
            prefix = f'slide {index + 1}: '
            if not isinstance(slide, dict):
                errors.append(prefix + 'must be an object')
                continue
            before = len(errors)
            role = 'hook' if index == 0 else 'cta' if index == len(slides) - 1 else 'point'
            if slide.get('role') != role:
                errors.append(prefix + f'role must be {role}')
            headline = slide.get('headline')
            if not isinstance(headline, str) or not headline.strip() or len(headline.split()) > 9:
                errors.append(prefix + 'headline must contain 1 to 9 words')
            for key, maximum, words in (('body', 3, 18), ('chips', 3, None)):
                values = slide.get(key, [])
                if not isinstance(values, list) or len(values) > maximum or any(
                        not isinstance(v, str) or not v.strip() or (words and len(v.split()) > words) for v in values):
                    errors.append(prefix + f'{key} allows at most {maximum} non-empty strings' + (f', {words} words each' if words else ''))
            for key in ('kicker', 'prompt'):
                if key in slide and (not isinstance(slide[key], str) or not slide[key].strip()):
                    errors.append(prefix + f'{key} must be a non-empty string')
            if isinstance(slide.get('prompt'), str) and len(slide['prompt'].split()) > 45:
                errors.append(prefix + 'prompt allows at most 45 words')
            if before == len(errors):
                try:
                    parts, gap, kicker = layout(slide, disclosure if isinstance(disclosure, str) else '')
                    if len(kicker[0]) != 1:
                        raise ValueError('kicker cannot fit on one line')
                except ValueError as exc:
                    errors.append(prefix + str(exc))
    if not errors:
        for key, size, width in (('handle', 32, 770), ('name', 24, 770), ('tagline', 28, 900)):
            if len(wrap(brand[key], font(size), width)) != 1:
                errors.append(f'brand {key} cannot fit on one line')
    return errors


def draw_block(draw, value, x, y, fill, outline=False):
    lines, face, step, _ = value
    for line in lines:
        draw.text((x, y), line, font=face, fill=fill, anchor='lt',
                  stroke_width=3 if outline else 0, stroke_fill='#090B20')
        y += step


def illustration(draw, y, accent, secondary):
    draw.rounded_rectangle((130, y + 12, 950, y + 310), 64, fill='#16253F', outline=accent, width=5)
    draw.polygon([(250, y + 300), (250, y + 350), (330, y + 300)], fill=accent)
    draw.polygon([(581, y + 43), (450, y + 179), (541, y + 179),
                  (496, y + 270), (658, y + 125), (571, y + 125)], fill=accent)
    for x in (230, 770, 850):
        draw.ellipse((x, y + 135, x + 24, y + 159), fill=secondary)


def render(slide, brand, index, total, disclosure):
    colors = {key: ImageColor.getrgb(value) for key, value in brand['colors'].items()}
    image = Image.new('RGB', SIZE)
    draw = ImageDraw.Draw(image)
    for y in range(SIZE[1]):
        ratio = y / (SIZE[1] - 1)
        color = tuple(round(a + (b - a) * ratio) for a, b in zip(colors['bg1'], colors['bg2']))
        draw.line((0, y, 1079, y), fill=color)
    overlay = Image.new('RGBA', SIZE)
    motif = ImageDraw.Draw(overlay)
    accent = colors['accent2'] if slide['role'] == 'point' else colors['accent']
    for x in range(30, 1080, 60):
        for y in range(30, 1350, 60):
            motif.ellipse((x, y, x + 3, y + 3), fill=(*accent, 38))
    motif.ellipse((530, -260, 1330, 540), outline=(*accent, 28), width=44)
    image = Image.alpha_composite(image.convert('RGBA'), overlay).convert('RGB')
    draw = ImageDraw.Draw(image)
    text_color = colors['text']
    draw.rounded_rectangle((90, 90, 154, 154), 18, fill=accent)
    draw.polygon([(125, 101), (111, 125), (124, 125), (117, 144), (140, 117), (128, 117)], fill=colors['bg1'])
    draw.text((177, 103), brand['handle'], font=font(32, bold=True), fill=text_color, anchor='lt')
    draw.text((177, 143), brand['name'], font=font(24), fill=text_color, anchor='lt')
    parts, gap, kicker = layout(slide, disclosure)
    pill_width = kicker[1].getlength(kicker[0][0]) + 44
    draw.rounded_rectangle((90, 176, 90 + pill_width, 230), 27, fill=accent)
    draw_block(draw, kicker, 112, 185, colors['bg1'])
    y = 245
    for kind, value, height in parts:
        if kind == 'headline':
            draw_block(draw, value, 94, y, accent, True)
        elif kind == 'chips':
            x = 90
            for chip in value:
                width = font(36).getlength(chip) + 44
                draw.rounded_rectangle((x, y, x + width, y + height), 32, fill=accent)
                draw.text((x + 22, y + 13), chip, font=font(36), fill=colors['bg1'], anchor='lt')
                x += width + 16
        elif kind == 'illustration':
            illustration(draw, y, accent, colors['accent2'])
        else:
            panel = Image.new('RGBA', SIZE)
            pd = ImageDraw.Draw(panel)
            pd.rounded_rectangle((90, y, 990, y + height), 32,
                                 fill=(*colors['card'], 224), outline=(*accent, 95), width=2)
            image = Image.alpha_composite(image.convert('RGBA'), panel).convert('RGB')
            draw = ImageDraw.Draw(image)
            if kind == 'prompt':
                draw.text((126, y + 26), 'COPY THIS PROMPT', font=font(24, bold=True), fill=accent, anchor='lt')
            top = y + (70 if kind == 'prompt' else (height - value[3]) / 2)
            draw_block(draw, value, 126, top, text_color)
        y += height + gap
    draw.text((90, 1190), f'{index} / {total}', font=font(32, bold=True), fill=text_color, anchor='lt')
    if index == 1:
        draw.text((795, 1190), 'SWIPE', font=font(30, bold=True), fill=accent, anchor='lt')
        draw.line((925, 1206, 987, 1206), fill=accent, width=4)
        draw.line((972, 1194, 987, 1206, 972, 1218), fill=accent, width=4)
    draw.rounded_rectangle((90, 1240, 990, 1252), 6, fill=colors['card'])
    draw.rounded_rectangle((90, 1240, 90 + 900 * index / total, 1252), 6, fill=accent)
    return image


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('slug')
    parser.add_argument('--post', type=Path)
    parser.add_argument('--out', type=Path)
    args = parser.parse_args(argv)
    if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', args.slug):
        print('slug must contain lowercase letters, numbers and separating hyphens', file=sys.stderr)
        return 1
    try:
        post = json.loads((args.post or ROOT / 'posts' / f'{args.slug}.json').read_text(encoding='utf-8'))
        brand = json.loads((ROOT / 'brand.json').read_text(encoding='utf-8'))
        errors = validate(post, brand)
        if errors:
            print('\n'.join(errors), file=sys.stderr)
            return 1
        # Render in memory first: even a fitting error must leave output untouched.
        images = []
        for index, slide in enumerate(post['slides'], 1):
            buffer = io.BytesIO()
            render(slide, brand, index, len(post['slides']), post.get('disclosure', '')).save(buffer, format='PNG')
            images.append(buffer.getvalue())
        caption = post['caption'].rstrip()
        if post.get('disclosure', '').strip():
            caption += '\n\n' + post['disclosure'].strip()
        caption += '\n\n' + ' '.join(post['hashtags']) + '\n'
        out = args.out or ROOT / 'output' / args.slug
        if out.exists() and any(out.iterdir()):
            raise ValueError('output directory must be new or empty; choose --out to preserve previous renders')
        out.mkdir(parents=True, exist_ok=True)
        for index, png in enumerate(images, 1):
            (out / f'slide-{index:02}.png').write_bytes(png)
        (out / 'caption.txt').write_text(caption, encoding='utf-8')
        print(f'Rendered {len(images)} slides and caption.txt to {out}')
        return 0
    except (OSError, ValueError, TypeError) as exc:
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
