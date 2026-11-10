#!/usr/bin/env python3
"""index.html（GAS用）から claude.ai 公開ページ用の claude-page.html を作る。
- <!DOCTYPE>/<html>/<head>/<body> を外す（claude.ai が自分で付けるため）
- ブラウザ側の計算 web-compute.js を埋め込む
- キャラのドット絵（images/chanz.gif）と筋トレのアニメ（images/workout/*.png）、修行の背景（images/scenes/*.webp）を data URI で埋め込む（公開ページは外部の画像を読めないため）
"""
import base64
import json
from pathlib import Path
here = Path(__file__).resolve().parent
s = (here / "index.html").read_text(encoding="utf-8")
head_end = s.index("<title>")
s = s[head_end:]
s = s.replace("<title>筋トレ冒険者ステータス</title>",
              '<title>筋トレ冒険者ステータス</title>\n<meta name="claude:viewport-fit-sides" content="cover">', 1)
for t in ["</head>\n<body>\n", "</body>\n</html>\n"]:
    assert t in s, t
    s = s.replace(t, "")
s = s.replace("<?!= boot ?>", "")
s = s.replace("/*@@COMPUTE@@*/", (here / "web-compute.js").read_text(encoding="utf-8"))
AVATAR_URL = "https://raw.githubusercontent.com/inoueindustries/-/main/%E7%AD%8B%E3%83%88%E3%83%AC%E5%86%92%E9%99%BA%E8%80%85%E3%82%B9%E3%83%86%E3%83%BC%E3%82%BF%E3%82%B9/images/chanz.gif"
assert AVATAR_URL in s
s = s.replace(AVATAR_URL, "data:image/gif;base64," + base64.b64encode((here / "images" / "chanz.gif").read_bytes()).decode())
sprites = {k: ["data:image/png;base64," + base64.b64encode((here / "images" / "workout" / f"{k}-{i}.png").read_bytes()).decode() for i in range(4)]
           for k in ("pullup", "pushup", "squat")}
scenes = {k: "data:image/webp;base64," + base64.b64encode((here / "images" / "scenes" / f"{k}.webp").read_bytes()).decode()
          for k in ("mountain", "waterfall", "sunset", "night")}
assert "/*@@SCENES@@*/null" in s
s = s.replace("/*@@SCENES@@*/null", json.dumps(scenes))
assert "/*@@SPRITES@@*/null" in s
s = s.replace("/*@@SPRITES@@*/null", json.dumps(sprites))
(here / "claude-page.html").write_text(s, encoding="utf-8")
print("claude-page.html", len(s.encode()), "bytes")

# ---- 専用アプリ版（GitHub Pages の quest/ に置く。ホーム画面に置くと全画面で開く） ----
q = (here / "index.html").read_text(encoding="utf-8")
q = q.replace("<?!= boot ?>", "").replace("/*@@COMPUTE@@*/", "")
head = """<title>筋トレクエスト</title>
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icon-192.png">
<link rel="apple-touch-icon" href="icon-180.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="筋トレクエスト">
<meta name="apple-mobile-web-app-status-bar-style" content="black">
<script>window.QS_STANDALONE = true;</script>"""
assert "<title>筋トレ冒険者ステータス</title>" in q
q = q.replace("<title>筋トレ冒険者ステータス</title>", head, 1)
out = here.parent / "quest"
out.mkdir(exist_ok=True)
(out / "index.html").write_text(q, encoding="utf-8")
print("quest/index.html", len(q.encode()), "bytes")
