#!/usr/bin/env python3
"""index.html（GAS用）から claude.ai 公開ページ用の claude-page.html を作る。
- <!DOCTYPE>/<html>/<head>/<body> を外す（claude.ai が自分で付けるため）
- ブラウザ側の計算 web-compute.js を埋め込む
"""
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
(here / "claude-page.html").write_text(s, encoding="utf-8")
print("claude-page.html", len(s.encode()), "bytes")
