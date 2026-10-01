#!/usr/bin/env python3
"""公開するたびに実行する：index.html の BUILD と version.json を同じ新しい値にそろえる。

  python3 vansaba/tools/bump_version.py            # 日付＋連番を自動で付ける
  python3 vansaba/tools/bump_version.py 2026-10-02.1

遊んでいる人の画面は、version.json の値と自分の BUILD が違うと
「新しいバージョンがあります［更新する］」を出す。
"""
import datetime, json, pathlib, re, sys

root = pathlib.Path(__file__).resolve().parent.parent
html = root / 'index.html'
src = html.read_text(encoding='utf-8')
m = re.search(r"const BUILD = '([^']+)';", src)
if not m:
    sys.exit('index.html に BUILD が見つかりません')
old = m.group(1)
if len(sys.argv) > 1:
    new = sys.argv[1]
else:
    today = datetime.date.today().isoformat()
    n = int(old.split('.')[1]) + 1 if old.startswith(today + '.') else 1
    new = f'{today}.{n}'
html.write_text(src.replace(m.group(0), f"const BUILD = '{new}';"), encoding='utf-8')
(root / 'version.json').write_text(json.dumps({'build': new}, ensure_ascii=False) + '\n', encoding='utf-8')
print(old, '->', new)
