#!/usr/bin/env python3
"""Gemini TTS でレベルアップ時のボイスを作る。

使い方:
  環境変数 GEMINI_API_KEY に Google AI Studio の API キーを入れてから
    python3 vansaba/tools/make_voices_gemini.py
  を実行すると、vansaba/voice/ に wav ファイルと voices.json ができる。
  ゲームは voice/voices.json を読み込み、書かれているファイルを優先して鳴らす。

  一部だけ作るとき（ほかのボイスはそのまま残し、voices.json に追記する）:
    python3 vansaba/tools/make_voices_gemini.py --only male:ko,female:ko
  「声:種類」をカンマで並べる。種類だけ（例: --only ko）なら全員分。
  種類は level（レベルアップ）・lucky（ラッキー）・awaken（覚醒）・ko（やられた時）。

  声やモデルを変えたいときは、下の VOICES と環境変数 GEMINI_TTS_MODEL で指定する。
"""
import base64, json, os, sys, time, urllib.error, urllib.request, wave

API = 'https://generativelanguage.googleapis.com/v1beta'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'voice')

# 声ごとの設定：Gemini の声の名前と、読み方の指示（英語で指示し、セリフは日本語）
VOICES = {
    'male':   {'voice': 'Fenrir', 'style': 'Say in Japanese, energetically, like a confident young man shouting a video game level-up call'},
    'female': {'voice': 'Zephyr', 'style': 'Say in Japanese, brightly and cheerfully, like an energetic young woman in a video game'},
    'boy':    {'voice': 'Puck',   'style': 'Say in Japanese, in a high, innocent and excited voice, like an elementary school boy in a video game'},
}
# やられた時（ko）だけは読み方を変える
KO_STYLE = {
    'male':   'Say in Japanese, like a young man in a video game who has just been defeated: frustrated, out of breath, fading to a weak mutter at the end',
    'female': 'Say in Japanese, like a young woman in a video game who has just been defeated: a short cry of pain, then weak and disappointed',
    'boy':    'Say in Japanese, like an elementary school boy in a video game who has just been defeated: a wailing cry, then sulky',
}
# セリフ（ゲームの LINES と同じ）
LINES = {
    'male':   {'level': ['よし、レベルアップだ！', 'まだまだいけるぞ！', '改善完了！'], 'lucky': ['おっ、ラッキー！', 'ツイてるぞ！'], 'awaken': ['覚醒！ 全力でいくぞ！'],
               'ko': ['くっ……ここまで、か……。ライン、止めちまった……。']},
    'female': {'level': ['レベルアップ！', 'いい調子です！', '改善、完了です！'], 'lucky': ['ラッキー！', 'やったね！'], 'awaken': ['覚醒！ 見せてあげる！'],
               'ko': ['きゃっ……！ うぅ……もう、限界です……。']},
    'boy':    {'level': ['やったー！ レベルアップ！', '強くなったぞ！', 'まだまだー！'], 'lucky': ['ラッキー！ やったぁ！', 'ツイてるー！'], 'awaken': ['かくせい！ いっけぇー！'],
               'ko': ['うわぁーん、やられたー！']},
}


def call(url, body=None):
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body else None,
                                 headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())


def pick_model(key):
    if os.environ.get('GEMINI_TTS_MODEL'):
        return os.environ['GEMINI_TTS_MODEL']
    models = call(f'{API}/models?key={key}&pageSize=200').get('models', [])
    tts = [m['name'].split('/')[-1] for m in models if 'tts' in m['name']]
    if not tts:
        sys.exit('TTS に対応したモデルが見つかりません。GEMINI_TTS_MODEL で指定してください。')
    tts.sort(key=lambda n: ('flash' not in n, n))   # flash（速くて安い）を優先
    return tts[0]


def speak(key, model, voice, text):
    body = {
        'contents': [{'parts': [{'text': text}]}],
        'generationConfig': {
            'responseModalities': ['AUDIO'],
            'speechConfig': {'voiceConfig': {'prebuiltVoiceConfig': {'voiceName': voice}}},
        },
    }
    for attempt in range(6):
        try:
            res = call(f'{API}/models/{model}:generateContent?key={key}', body)
            return base64.b64decode(res['candidates'][0]['content']['parts'][0]['inlineData']['data'])
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 503) and attempt < 5:   # 回数制限などは待ってやり直す
                time.sleep(20 * (attempt + 1)); continue
            raise


def parse_only(argv):
    # --only male:ko,female:ko → {('male','ko'), ('female','ko')}。指定なしは None（全部作る）
    if '--only' not in argv:
        return None
    i = argv.index('--only')
    if i + 1 >= len(argv):
        sys.exit('--only のあとに「声:種類」を書いてください（例: --only male:ko,female:ko）')
    want = set()
    for item in argv[i + 1].split(','):
        vid, _, kind = item.strip().partition(':')
        if not kind:                                 # 「ko」だけなら全員分
            vid, kind = '', vid
        for v in ([vid] if vid else VOICES):
            if v not in VOICES or kind not in LINES[v]:
                sys.exit(f'知らない指定です: {item}')
            want.add((v, kind))
    return want


def main():
    key = os.environ.get('GEMINI_API_KEY')
    if not key:
        sys.exit('環境変数 GEMINI_API_KEY が設定されていません。')
    only = parse_only(sys.argv[1:])
    model = pick_model(key)
    print('モデル:', model)
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, 'voices.json')
    if only and os.path.exists(path):              # 一部だけ作るときは、今の voices.json に追記する
        with open(path, encoding='utf-8') as f:
            manifest = json.load(f)
    else:
        manifest = {'credit': 'ボイス：Gemini TTS（' + model + '）'}
    for vid, cfg in VOICES.items():
        manifest.setdefault(vid, {})
        for kind, lines in LINES[vid].items():
            if only and (vid, kind) not in only:
                continue
            manifest[vid][kind] = []
            for i, line in enumerate(lines, 1):
                name = f'{vid}_{kind}{i}.wav'
                style = KO_STYLE[vid] if kind == 'ko' else cfg['style']
                pcm = speak(key, model, cfg['voice'], f"{style}: {line}")
                with wave.open(os.path.join(OUT, name), 'wb') as w:   # 24kHz・16bit・モノラル
                    w.setnchannels(1); w.setsampwidth(2); w.setframerate(24000); w.writeframes(pcm)
                manifest[vid][kind].append('voice/' + name)
                print('作成:', name, line)
                time.sleep(4)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)
    print('voices.json を書き出しました')


if __name__ == '__main__':
    main()
