"""Profile picture: python avatar.py  ->  output/avatar.png (1080x1080, logo mark centered inside Instagram's circle crop)."""
import json
from pathlib import Path

from PIL import Image, ImageDraw

S = 1080
here = Path(__file__).parent
c = json.loads((here / "brand.json").read_text(encoding="utf-8"))["colors"]
rgb = lambda h: tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))

img = Image.new("RGB", (S, S))
d = ImageDraw.Draw(img)
a, b = rgb(c["bg1"]), rgb(c["bg2"])
for y in range(S):
    t = y / (S - 1)
    d.line([(0, y), (S, y)], fill=tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3)))

d.rounded_rectangle((230, 230, 850, 850), 150, fill=rgb(c["accent"]))
bolt = [(600, 290), (400, 580), (520, 580), (470, 800), (690, 480), (565, 480)]
d.polygon(bolt, fill=rgb(c["bg1"]))
d.ellipse((765, 285, 815, 335), fill=rgb(c["accent2"]))

out = here / "output"
out.mkdir(exist_ok=True)
img.save(out / "avatar.png")
print(out / "avatar.png")
