#!/usr/bin/env python3
"""Gemini TTS でレベルアップ時のボイスを作る。

使い方:
  環境変数 GEMINI_API_KEY に Google AI Studio の API キーを入れてから
    python3 vansaba/tools/make_voices_gemini.py
  を実行すると、vansaba/voice/ に wav ファイルと voices.json ができる。
  ゲームは voice/voices.json を読み込み、書かれているファイルを優先して鳴らす。

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
# セリフ（ゲームの LINES と同じ）
LINES = {
    'male':   {'level': ['よし、レベルアップだ！', 'まだまだいけるぞ！', '改善完了！'], 'lucky': ['おっ、ラッキー！', 'ツイてるぞ！'], 'awaken': ['覚醒！ 全力でいくぞ！']},
    'female': {'level': ['レベルアップ！', 'いい調子です！', '改善、完了です！'], 'lucky': ['ラッキー！', 'やったね！'], 'awaken': ['覚醒！ 見せてあげる！']},
    'boy':    {'level': ['やったー！ レベルアップ！', '強くなったぞ！', 'まだまだー！'], 'lucky': ['ラッキー！ やったぁ！', 'ツイてるー！'], 'awaken': ['かくせい！ いっけぇー！']},
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


def main():
    key = os.environ.get('GEMINI_API_KEY')
    if not key:
        sys.exit('環境変数 GEMINI_API_KEY が設定されていません。')
    model = pick_model(key)
    print('モデル:', model)
    os.makedirs(OUT, exist_ok=True)
    manifest = {'credit': 'ボイス：Gemini TTS（' + model + '）'}
    for vid, cfg in VOICES.items():
        manifest[vid] = {}
        for kind, lines in LINES[vid].items():
            manifest[vid][kind] = []
            for i, line in enumerate(lines, 1):
                name = f'{vid}_{kind}{i}.wav'
                pcm = speak(key, model, cfg['voice'], f"{cfg['style']}: {line}")
                with wave.open(os.path.join(OUT, name), 'wb') as w:   # 24kHz・16bit・モノラル
                    w.setnchannels(1); w.setsampwidth(2); w.setframerate(24000); w.writeframes(pcm)
                manifest[vid][kind].append('voice/' + name)
                print('作成:', name, line)
                time.sleep(4)
    with open(os.path.join(OUT, 'voices.json'), 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)
    print('voices.json を書き出しました')


if __name__ == '__main__':
    main()
