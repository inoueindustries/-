"""ホーム画面用アイコンを作る：青いオーラが放射状に広がる背景（光のすじ・きらめき）＋ キャラのドット絵。
使い方: python3 tools/make_app_icon.py
出力: images/app-icon.png（1024）と ../quest/icon-{180,192,512}.png
"""
import math, random
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageChops

here = Path(__file__).resolve().parent.parent
S = 1024
random.seed(7)
cx, cy = S * 0.5, S * 0.46

# 1) 放射グラデーション（中心は白っぽい水色 → 青 → 濃い青）
stops = [(0.0, (236, 250, 255)), (0.22, (150, 222, 255)), (0.5, (52, 140, 235)), (0.8, (24, 70, 190)), (1.0, (10, 28, 120))]
def col(t):
    for (a, ca), (b, cb) in zip(stops, stops[1:]):
        if t <= b:
            k = (t - a) / (b - a)
            return tuple(int(ca[i] + (cb[i] - ca[i]) * k) for i in range(3))
    return stops[-1][1]
small = Image.new("RGB", (256, 256))
px = small.load()
rmax = math.hypot(max(cx, S - cx), max(cy, S - cy)) / S * 256
for y in range(256):
    for x in range(256):
        px[x, y] = col(min(1.0, math.hypot(x - cx / 4, y - cy / 4) / rmax))
bg = small.resize((S, S), Image.BICUBIC)

# 2) 放射状の光のすじ
rays = Image.new("L", (S, S), 0)
d = ImageDraw.Draw(rays)
a = 0.0
while a < 360:
    w = random.uniform(2.5, 9)
    if random.random() < 0.62:
        r1 = random.uniform(0.08, 0.2) * S
        p = [(cx + r1 * math.cos(math.radians(a + w / 2)), cy + r1 * math.sin(math.radians(a + w / 2)))]
        for ang in (a, a + w):
            p.append((cx + S * 1.1 * math.cos(math.radians(ang)), cy + S * 1.1 * math.sin(math.radians(ang))))
        d.polygon(p, fill=random.randint(70, 150))
    a += w + random.uniform(1.5, 7)
rays = rays.filter(ImageFilter.GaussianBlur(3))
bg = Image.composite(Image.new("RGB", (S, S), (225, 246, 255)), bg, rays)

# 3) きらめき（十字の星と小さな粒）
sp = Image.new("L", (S, S), 0)
d = ImageDraw.Draw(sp)
for _ in range(60):
    x, y = random.uniform(0, S), random.uniform(0, S)
    if math.hypot(x - cx, y - cy) < S * 0.2: continue
    r = random.choice([3, 4, 5, 7])
    d.ellipse([x - r, y - r, x + r, y + r], fill=random.randint(150, 255))
for _ in range(14):
    x, y = random.uniform(40, S - 40), random.uniform(40, S - 40)
    if math.hypot(x - cx, y - cy) < S * 0.28: continue
    L = random.uniform(22, 46); t = L * 0.13
    d.polygon([(x, y - L), (x + t, y - t), (x + L, y), (x + t, y + t), (x, y + L), (x - t, y + t), (x - L, y), (x - t, y - t)], fill=255)
glow = sp.filter(ImageFilter.GaussianBlur(6))
bg = Image.composite(Image.new("RGB", (S, S), (255, 255, 255)), bg, ImageChops.lighter(sp, glow))

# 4) キャラ（クリーム色の背景を、四すみから つながっている所だけ ぬく）
src = Image.open(here / "images" / "chanz-source.png").convert("RGB")
mask = Image.new("L", src.size, 255)
for corner in [(0, 0), (src.width - 1, 0), (0, src.height - 1), (src.width - 1, src.height - 1), (src.width // 2, 0)]:
    tmp = src.copy()
    ImageDraw.floodfill(tmp, corner, (255, 0, 255), thresh=28)
    m = tmp.point(lambda v: 0).convert("L")
    tp = tmp.load(); mp = mask.load()
    for y in range(src.height):
        for x in range(src.width):
            if tp[x, y] == (255, 0, 255): mp[x, y] = 0
ch = src.convert("RGBA"); ch.putalpha(mask)
scale = 1.84
ch = ch.resize((int(src.width * scale), int(src.height * scale)), Image.NEAREST)
pos = (int((S - ch.width) / 2), int(S - ch.height + S * 0.02))
# 白いふちどり（オーラ）
alpha = Image.new("L", (S, S), 0); alpha.paste(ch.getchannel("A"), pos)
edge = alpha.filter(ImageFilter.MaxFilter(21)).filter(ImageFilter.GaussianBlur(10))
bg = Image.composite(Image.new("RGB", (S, S), (235, 250, 255)), bg, edge.point(lambda v: int(v * 0.85)))
bg.paste(ch, pos, ch)

bg.save(here / "images" / "app-icon.png")
out = here.parent / "quest"
for n in (180, 192, 512):
    bg.resize((n, n), Image.LANCZOS).save(out / f"icon-{n}.png")
print("ok")
