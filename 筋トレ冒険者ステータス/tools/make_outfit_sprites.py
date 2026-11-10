"""Codex が作った衣装ごとの筋トレのコマ（420×460 の透過PNG）を、アプリ用の 210×230・64色に ちぢめる。
使い方: python3 tools/make_outfit_sprites.py <衣装ID> <コマの入ったフォルダ>
出力: images/workout/<衣装ID>/{pullup,pushup,squat}-{0..3}.png と original/<衣装ID>-sheet.png
"""
import sys, shutil
from pathlib import Path
from PIL import Image

outfit, src = sys.argv[1], Path(sys.argv[2])
root = Path(__file__).resolve().parent.parent / "images" / "workout"
dst = root / outfit
dst.mkdir(exist_ok=True)
for k in ("pullup", "pushup", "squat"):
    for i in range(4):
        im = Image.open(src / f"{k}-{i}.png").convert("RGBA")
        assert im.size == (420, 460), im.size
        im = im.resize((210, 230), Image.LANCZOS)
        a = im.getchannel("A").point(lambda v: 255 if v >= 128 else 0)
        im.putalpha(a)
        im.quantize(colors=64, method=Image.FASTOCTREE).save(dst / f"{k}-{i}.png", optimize=True)
if (src / "sheet.png").exists():
    shutil.copy(src / "sheet.png", root / "original" / f"{outfit}-sheet.png")
print(outfit, "ok")
