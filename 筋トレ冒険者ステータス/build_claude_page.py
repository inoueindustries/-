#!/usr/bin/env python3
"""index.html（GAS用）から claude.ai 公開ページ用の claude-page.html を作る。
- <!DOCTYPE>/<html>/<head>/<body> を外す（claude.ai が自分で付けるため）
- ブラウザ側の計算 web-compute.js を埋め込む
- キャラのドット絵（images/chanz.gif）と筋トレのアニメ（images/workout/*.png）を data URI で埋め込む（公開ページは外部の画像を読めないため）
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
assert "/*@@SPRITES@@*/null" in s
s = s.replace("/*@@SPRITES@@*/null", json.dumps(sprites))
(here / "claude-page.html").write_text(s, encoding="utf-8")
print("claude-page.html", len(s.encode()), "bytes")
