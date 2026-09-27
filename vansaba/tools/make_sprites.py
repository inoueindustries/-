#!/usr/bin/env python3
"""キャラ画像を作って（または取り込んで）ゲーム用に整える。

準備: pip install pillow

1) 画像生成AIで作る
   OpenAI（ChatGPT の画像生成）:  OPENAI_API_KEY を設定して
       python3 vansaba/tools/make_sprites.py generate --provider openai
   Gemini:                          GEMINI_API_KEY を設定して
       python3 vansaba/tools/make_sprites.py generate --provider gemini
   一部だけ作るとき: --only player_screw,bug
   モデルを指定するとき: 環境変数 IMAGE_MODEL（省略時は使えるモデルから自動で選ぶ）

2) ChatGPT などで作った画像を取り込む
       python3 vansaba/tools/make_sprites.py import 画像.png player_screw
   背景が単色なら自動で透明にする。

どちらも vansaba/sprites/<名前>.png（256×256・背景透明）を作り、sprites/sprites.json に登録する。
ゲームは sprites.json を読み込み、登録された画像でキャラを描く。
"""
import argparse, base64, io, json, os, sys, time, urllib.error, urllib.request

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'sprites')
SIZE = 256

STYLE = ('Cute chibi character for a 2D top-down action game, 2-head-tall proportions, round silhouette, '
         'big shiny eyes with highlights, light pink cheeks, thick dark outline, flat colors with one level of shading, '
         'facing slightly right, full body, one character only, centered with margin, no text, no ground, no shadow. ')
BG_T = 'Transparent background.'
BG_KEY = 'Plain solid pure magenta (#FF00FF) background everywhere around the character, nothing else in the background.'

CHARS = {
    'player_screw': 'A night-shift factory worker: yellow hard hat with a green cross on the front, blue coverall with white reflective stripe, white cotton gloves, brown safety shoes. Cheerful smile, gender-neutral.',
    'player_smt':   'The same factory worker character in a cleanroom outfit: white puffy cleanroom cap with a light blue band, light blue anti-static smock with white collar, blue rubber gloves, white shoes.',
    'player_line':  'The same factory worker character as a team leader: white work cap with two black stripes and a small gold badge and a visor, dark green work uniform, yellow armband on the left arm, white gloves. Confident smile.',
    'player_mgr':   'The same character promoted to manager: no hat, neat side-parted black hair, navy business suit, white shirt, red necktie, black leather shoes. Calm confident smile.',
    'bug':    'Enemy "burr bug": a round orange-brown (#c56b3c) blob covered in small jagged metal burrs, slightly angry eyebrows but cute.',
    'chip':   'Enemy "metal chip": a small silver (#b9c2cc) teardrop creature with a curled metal shaving on its head like a cowlick, mouth open in an "o".',
    'rust':   'Enemy "rust lump": a chunky dark brown (#8a4a2a) rock creature with orange rust spots, sleepy half-closed eyes.',
    'boss':   'Boss "quality inspector": a round red (#b8323a) creature with a navy cap, round glasses, a clipboard in one hand, strict but cute face. Large.',
    'tomb':   'Enemy "tombstoned chip": a tiny black rectangular SMD chip resistor standing upright with silver metal ends, surprised "o" mouth.',
    'solder': 'Enemy "solder ball": a tiny shiny silver sphere with pink cheeks.',
    'ic':     'Enemy "lifted-lead IC": a black IC chip with four silver legs on each side, one leg on the top right bent upward, white angry eyebrows.',
    'reflow': 'Boss "reflow oven guardian": a grey box-shaped reflow oven, the front window glows orange with big eyes inside, steam from a chimney, a "245" display. Large.',
    'choco':  'Enemy "minor stoppage": a brown chocolate bar creature with silver foil peeled at one corner, pink cheeks.',
    'tag':    'Enemy "defect tag": a red shipping tag with a string, white text "NG" at the bottom, angry eyebrows, fluttering.',
    'lot':    'Enemy "defective lot": two stacked cardboard boxes with packing tape and a red "NG" sticker, sleepy eyes on the lower box.',
    'takt':   'Boss "takt time king": a red alarm clock with two bells on top, hands spinning, impatient angry eyebrows. Large.',
    'recall': 'Final boss "recall demon king": a big dark purple (#3b2350) round creature with a jagged cape at the bottom, a crown of five red "NG" tags, a yellow warning triangle on its forehead, small fangs. Cute chibi final boss. Very large.',
    'claim':  'Event enemy "complaint phone": an angry red old rotary telephone creature with a shaking handset and a yellow warning triangle above its head.',
}


def need_pil():
    try:
        from PIL import Image  # noqa
        return Image
    except ImportError:
        sys.exit('Pillow が必要です: pip install pillow')


def http(url, body=None, headers=None):
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'Content-Type': 'application/json', **(headers or {})})
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.loads(r.read())


def retry(fn):
    for attempt in range(6):
        try:
            return fn()
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 503) and attempt < 5:
                time.sleep(20 * (attempt + 1)); continue
            print(e.read().decode(errors='replace')[:500]); raise


# ---- 画像生成 ----
def gen_openai(prompt, model):
    key = os.environ['OPENAI_API_KEY']
    res = retry(lambda: http('https://api.openai.com/v1/images/generations',
                             {'model': model, 'prompt': prompt + BG_T, 'size': '1024x1024', 'background': 'transparent', 'n': 1},
                             {'Authorization': 'Bearer ' + key}))
    return base64.b64decode(res['data'][0]['b64_json'])


def pick_openai_model():
    key = os.environ['OPENAI_API_KEY']
    ids = [m['id'] for m in http('https://api.openai.com/v1/models', headers={'Authorization': 'Bearer ' + key})['data']]
    cands = sorted([i for i in ids if 'image' in i], reverse=True)
    if not cands: sys.exit('画像生成モデルが見つかりません。IMAGE_MODEL で指定してください。')
    return cands[0]


def gen_gemini(prompt, model, ref=None):
    key = os.environ['GEMINI_API_KEY']
    parts = [{'text': prompt + BG_KEY}]
    if ref:   # 主人公の着せ替えは1枚目を参考画像として渡して、同じキャラにそろえる
        parts.insert(0, {'inlineData': {'mimeType': 'image/png', 'data': base64.b64encode(ref).decode()}})
        parts[1]['text'] = 'Keep exactly the same character (face, hair, body) as the reference image. ' + parts[1]['text']
    res = retry(lambda: http(f'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}',
                             {'contents': [{'parts': parts}], 'generationConfig': {'responseModalities': ['IMAGE', 'TEXT']}}))
    for p in res['candidates'][0]['content']['parts']:
        if 'inlineData' in p:
            return base64.b64decode(p['inlineData']['data'])
    sys.exit('画像が返ってきませんでした')


def pick_gemini_model():
    key = os.environ['GEMINI_API_KEY']
    names = [m['name'].split('/')[-1] for m in http(f'https://generativelanguage.googleapis.com/v1beta/models?key={key}&pageSize=200').get('models', [])]
    cands = sorted([n for n in names if 'image' in n and 'gemini' in n], key=lambda n: ('preview' in n, n), reverse=False)
    if not cands: sys.exit('画像生成モデルが見つかりません。IMAGE_MODEL で指定してください。')
    return cands[-1]


# ---- 背景を透明にして 256×256 に整える ----
def finish(png_bytes, name):
    Image = need_pil()
    im = Image.open(io.BytesIO(png_bytes)).convert('RGBA')
    px = im.load(); w, h = im.size
    alpha_used = any(px[x, y][3] < 250 for x in range(0, w, max(1, w // 32)) for y in range(0, h, max(1, h // 32)))
    if not alpha_used:
        # 四隅の色を背景色とみなし、その色に近い画素を透明にする（縁は少しぼかす）
        corners = [px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1]]
        bg = tuple(sorted(c[i] for c in corners)[1] for i in range(3))
        for y in range(h):
            for x in range(w):
                r, g, b, a = px[x, y]
                d = abs(r - bg[0]) + abs(g - bg[1]) + abs(b - bg[2])
                if d < 60: px[x, y] = (r, g, b, 0)
                elif d < 120: px[x, y] = (r, g, b, int(a * (d - 60) / 60))
    box = im.getbbox()
    if box: im = im.crop(box)
    s = max(im.size); canvas = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    canvas.paste(im, ((s - im.size[0]) // 2, (s - im.size[1]) // 2))
    canvas = canvas.resize((SIZE, SIZE), Image.LANCZOS)
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, name + '.png')
    canvas.save(path, optimize=True)
    manifest_path = os.path.join(OUT, 'sprites.json')
    man = json.load(open(manifest_path, encoding='utf-8')) if os.path.exists(manifest_path) else {}
    man[name] = 'sprites/' + name + '.png'
    json.dump(man, open(manifest_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('作成:', path)


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='cmd', required=True)
    g = sub.add_parser('generate'); g.add_argument('--provider', choices=['openai', 'gemini'], required=True); g.add_argument('--only', default='')
    i = sub.add_parser('import'); i.add_argument('file'); i.add_argument('name', choices=list(CHARS))
    a = ap.parse_args()
    if a.cmd == 'import':
        finish(open(a.file, 'rb').read(), a.name); return
    need_pil()
    only = [x for x in a.only.split(',') if x] or list(CHARS)
    if a.provider == 'openai':
        if not os.environ.get('OPENAI_API_KEY'): sys.exit('OPENAI_API_KEY が設定されていません。')
        model = os.environ.get('IMAGE_MODEL') or pick_openai_model()
    else:
        if not os.environ.get('GEMINI_API_KEY'): sys.exit('GEMINI_API_KEY が設定されていません。')
        model = os.environ.get('IMAGE_MODEL') or pick_gemini_model()
    print('モデル:', model)
    ref = None
    for name in only:
        prompt = STYLE + CHARS[name] + ' '
        if a.provider == 'openai':
            raw = gen_openai(prompt, model)
        else:
            raw = gen_gemini(prompt, model, ref if name.startswith('player_') and name != 'player_screw' else None)
        if name == 'player_screw': ref = raw
        finish(raw, name)
        time.sleep(3)


if __name__ == '__main__':
    main()
