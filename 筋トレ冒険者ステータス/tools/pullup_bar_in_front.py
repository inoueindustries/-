"""けんすいのコマ：横棒を キャラの顔・体の手前に かさね直す（手だけは 棒の上に のこす）。
入力：キャラが棒の手前にいるコマ（4枚）と、キャラなしの鉄棒の絵。出力：out3/pullup-{0..3}.png"""
import sys
from pathlib import Path
from PIL import Image
d = Path(sys.argv[1]); src = d / sys.argv[2]; bar = Image.open(d / sys.argv[3]).convert("RGBA")
out = d / "out3"; out.mkdir(exist_ok=True)
W, H = bar.size; bp = bar.load()
cols = [x for x in range(W) if any(bp[x, y][3] > 127 for y in range(H))]
x0, x1 = min(cols), max(cols); mid = (x0 + x1) // 2
rows = [y for y in range(H) if bp[mid, y][3] > 127]          # 横棒の高さ（まんなかの列で見る）
y0, y1 = min(rows), max(rows)
def diffcols(fp):
    return [x for x in range(x0, x1 + 1) if any(fp[x, y] != bp[x, y] for y in range(y0, y1 + 1))]
def clusters(xs, gap=3):
    cs = []
    for x in xs:
        if cs and x - cs[-1][1] <= gap: cs[-1][1] = x
        else: cs.append([x, x])
    return cs
frames = [Image.open(src / f"pullup-{i}.png").convert("RGBA") for i in range(4)]
# 手の位置：コマ0（ぶら下がり。頭は棒の下）で、棒に かさなっている所＝手
h0 = clusters(diffcols(frames[0].load()))
left0 = [c for c in h0 if c[1] < mid]; right0 = [c for c in h0 if c[0] > mid]
print("bar x", x0, x1, "crossbar y", y0, y1, "frame0 hands", h0)
for i, f in enumerate(frames):
    fp = f.load(); cs = clusters(diffcols(fp))
    # まんなか（頭・首）に かかる かたまりは 棒を手前に。左右の かたまり（手）は そのまま
    lefts = [c for c in cs if c[1] < mid - 8]; rights = [c for c in cs if c[0] > mid + 8]
    centre = [c for c in cs if c not in lefts and c not in rights]
    restored = 0
    for c in centre:
        a, b = c
        # 頭と手が つながって 1つの かたまりに なっているときは、コマ0の手の内がわまでに かぎる
        if left0: a = max(a, max(k[1] for k in left0) + 1) if a <= max(k[1] for k in left0) else a
        if right0: b = min(b, min(k[0] for k in right0) - 1) if b >= min(k[0] for k in right0) else b
        for x in range(a, b + 1):
            for y in range(y0, y1 + 1):
                if bp[x, y][3] > 127 and fp[x, y] != bp[x, y]: fp[x, y] = bp[x, y]; restored += 1
        # 棒の すぐ下に 1px の かげ（棒が手前だと わかるように）
        for x in range(a, b + 1):
            y = y1 + 1
            if y < H and fp[x, y][3] > 127 and bp[x, y][3] <= 127:
                r, g, b_, al = fp[x, y]; fp[x, y] = (int(r * .55), int(g * .55), int(b_ * .6), al)
    f.save(out / f"pullup-{i}.png")
    print(i, "clusters", cs, "centre", centre, "restored px", restored)
