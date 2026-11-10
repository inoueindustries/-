"""鉄棒を4コマで そろえ直した けんすいのコマ（420×460 の透過PNG）を、アプリ用（210×230・64色）にして置く。
下半分に残った 小さな点（はなれ小島）は消す。
使い方: python3 tools/install_pullup_frames.py <衣装ID または armor> <コマの入ったフォルダ>
"""
import sys
from pathlib import Path
from collections import deque
from PIL import Image

outfit, src = sys.argv[1], Path(sys.argv[2])
root = Path(__file__).resolve().parent.parent / "images" / "workout"
dst = root if outfit == "armor" else root / outfit

def despeckle(im, min_px=60, y_from=230):
    a = im.getchannel("A"); w, h = im.size; px = a.load(); seen = bytearray(w * h); removed = 0
    out = im.load()
    for y0 in range(h):
        for x0 in range(w):
            if px[x0, y0] < 128 or seen[y0 * w + x0]: continue
            comp = []; q = deque([(x0, y0)]); seen[y0 * w + x0] = 1
            while q:
                x, y = q.popleft(); comp.append((x, y))
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx] and px[nx, ny] >= 128:
                            seen[ny * w + nx] = 1; q.append((nx, ny))
            if len(comp) < min_px and min(p[1] for p in comp) >= y_from:
                for x, y in comp: out[x, y] = (0, 0, 0, 0)
                removed += len(comp)
    return removed

for i in range(4):
    im = Image.open(src / f"pullup-{i}.png").convert("RGBA")
    assert im.size == (420, 460), im.size
    n = despeckle(im)
    if outfit == "armor": im.save(root / "original" / f"red-pullup-{i}.png")
    sm = im.resize((210, 230), Image.LANCZOS)
    sm.putalpha(sm.getchannel("A").point(lambda v: 255 if v >= 128 else 0))
    sm.quantize(colors=64, method=Image.FASTOCTREE).save(dst / f"pullup-{i}.png", optimize=True)
    print(outfit, i, "removed specks px:", n)
