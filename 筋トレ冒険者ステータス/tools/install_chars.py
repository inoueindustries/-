"""配布版のオリジナルキャラ（Codex 作成）を アプリ用（210×230・64色・透過）にして置く。
使い方: python3 tools/install_chars.py <作業フォルダ>
  作業フォルダ/lineup/out/char-N.png（立ち姿）と 作業フォルダ/cN/out/{pullup,pushup,squat}-{0..3}.png を読む
出力: images/chars/cN/stand.png と images/chars/cN/{pullup,pushup,squat}-{0..3}.png、images/chars/lineup.png
"""
import sys, shutil
from pathlib import Path
from PIL import Image

src = Path(sys.argv[1])
root = Path(__file__).resolve().parent.parent / "images" / "chars"
root.mkdir(exist_ok=True)

def small(im):
    im = im.convert("RGBA").resize((210, 230), Image.LANCZOS)
    im.putalpha(im.getchannel("A").point(lambda v: 255 if v >= 128 else 0))
    return im.quantize(colors=96, method=Image.FASTOCTREE)

for n in range(1, 7):
    d = root / f"c{n}"; d.mkdir(exist_ok=True)
    small(Image.open(src / "lineup" / "out" / f"char-{n}.png")).save(d / "stand.png", optimize=True)
    for k in ("pullup", "pushup", "squat"):
        for i in range(4):
            small(Image.open(src / f"c{n}" / "out" / f"{k}-{i}.png")).save(d / f"{k}-{i}.png", optimize=True)
shutil.copy(src / "lineup" / "out" / "preview.png", root / "lineup.png")
print("ok")
