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
# 種目の画像の一覧（images/exercises/index.json）を index.html に書きこむ
import re
ex_files = json.loads((here / "images" / "exercises" / "index.json").read_text(encoding="utf-8"))
src_html = (here / "index.html").read_text(encoding="utf-8")
src_html2 = re.sub(r"/\*EXFILES-BEGIN\*/.*?/\*EXFILES-END\*/", lambda m: "/*EXFILES-BEGIN*/" + json.dumps(ex_files, ensure_ascii=False) + "/*EXFILES-END*/", src_html, count=1, flags=re.S)
if src_html2 != src_html:
    (here / "index.html").write_text(src_html2, encoding="utf-8")
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
ex_data = {n: "data:image/webp;base64," + base64.b64encode((here / "images" / "exercises" / f).read_bytes()).decode() for n, f in ex_files.items()}
assert "/*@@EXDATA@@*/null" in s
s = s.replace("/*@@EXDATA@@*/null", json.dumps(ex_data, ensure_ascii=False))
outfits = {k: "data:image/png;base64," + base64.b64encode((here / "images" / "outfits" / f"{k}.png").read_bytes()).decode()
           for k in ("white_tank", "business_suit", "orange_gi", "hero_cape", "running")}
chars = {}
for n in range(1, 7):
    d = here / "images" / "chars" / f"c{n}"
    u = lambda p: "data:image/png;base64," + base64.b64encode(p.read_bytes()).decode()
    chars[f"c{n}"] = {"stand": u(d / "stand.png"), **{k: [u(d / f"{k}-{i}.png") for i in range(4)] for k in ("pullup", "pushup", "squat")}}
assert "/*@@CHARS@@*/null" in s
s = s.replace("/*@@CHARS@@*/null", json.dumps(chars))
assert "/*@@OUTFITS@@*/null" in s
s = s.replace("/*@@OUTFITS@@*/null", json.dumps(outfits))
osprites = {o: {k: ["data:image/png;base64," + base64.b64encode((here / "images" / "workout" / o / f"{k}-{i}.png").read_bytes()).decode() for i in range(4)]
                for k in ("pullup", "pushup", "squat")} for o in outfits}
assert "/*@@OSPRITES@@*/null" in s
s = s.replace("/*@@OSPRITES@@*/null", json.dumps(osprites))
assert "/*@@SPRITES@@*/null" in s
s = s.replace("/*@@SPRITES@@*/null", json.dumps(sprites))
(here / "claude-page.html").write_text(s, encoding="utf-8")
print("claude-page.html", len(s.encode()), "bytes")

# ---- 専用アプリ版（GitHub Pages の quest/ に置く。ホーム画面に置くと全画面で開く） ----
q = (here / "index.html").read_text(encoding="utf-8")
q = q.replace("<?!= boot ?>", "").replace("/*@@COMPUTE@@*/", (here / "web-compute.js").read_text(encoding="utf-8"))   # 計算もアプリ側で行う
head = """<title>筋トレクエスト</title>
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icon-192.png">
<link rel="apple-touch-icon" href="icon-180.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="筋トレクエスト">
<meta name="apple-mobile-web-app-status-bar-style" content="black">
<script>window.QS_STANDALONE = true; window.QS_BUILD = "@@BUILD@@";
// あたらしい版が でていたら 読みなおす（ホーム画面のアプリは 古いページを おぼえたままに なりやすいので）。
// version.json は キャッシュを使わずに読み、ちがえば ?v=版 を つけて 読みなおす。入力中（ダイアログが開いている）は しない
(function () {
  function check() {
    try {
      if (document.querySelector && document.querySelector('dialog[open]')) return;
      fetch('version.json?t=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (j) {
        if (!j || !j.v || j.v === window.QS_BUILD) return;
        try { if (sessionStorage.getItem('qs.reloadFor') === j.v) return; sessionStorage.setItem('qs.reloadFor', j.v); } catch (e) {}
        location.replace(location.pathname + '?v=' + j.v);
      }).catch(function () {});
    } catch (e) {}
  }
  check();
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') check(); });
})();
</script>"""
assert "<title>筋トレ冒険者ステータス</title>" in q
import hashlib, shutil
base_q = q
def write_app(q, folder):
    build = hashlib.sha1(q.encode("utf-8")).hexdigest()[:10]
    q = q.replace("@@BUILD@@", build)
    out = here.parent / folder
    out.mkdir(exist_ok=True)
    (out / "index.html").write_text(q, encoding="utf-8")
    (out / "version.json").write_text(json.dumps({"v": build}), encoding="utf-8")
    # オリジナルキャラの絵は 同じ場所に おく（色を ぬりかえるため。別のサイトの絵は ぬりかえられない）
    if (out / "chars").exists(): shutil.rmtree(out / "chars")
    shutil.copytree(here / "images" / "chars", out / "chars", ignore=shutil.ignore_patterns("original", "lineup.png"))
    print(folder + "/index.html", len(q.encode()), "bytes", "build", build)

write_app(base_q.replace("<title>筋トレ冒険者ステータス</title>", head, 1), "quest")

# ---- 配布版（GitHub Pages の play/）：だれでも つかえるように、個人の名前・似顔絵・似ている恐れのある ふくを はずす ----
dist_head = head.replace("window.QS_STANDALONE = true;", "window.QS_STANDALONE = true; window.QS_DIST = true;")
dq = base_q.replace("<title>筋トレ冒険者ステータス</title>", dist_head, 1)
dq = dq.replace(AVATAR_URL, "chars/c1/stand.png")
dq = dq.replace("ちゃんズ", "ぼうけんしゃ")
dq = re.sub(r"var SHEET_ID = '[^']*';", "var SHEET_ID = '';", dq)
write_app(dq, "play")
mf = json.loads((here.parent / "quest" / "manifest.webmanifest").read_text(encoding="utf-8"))
(here.parent / "play" / "manifest.webmanifest").write_text(json.dumps(mf, ensure_ascii=False, indent=2), encoding="utf-8")
shutil.copy(here / "images" / "chars" / "lineup.png", here.parent / "play" / "chars-lineup.png")   # はじめかた（play/guide.html）の絵
