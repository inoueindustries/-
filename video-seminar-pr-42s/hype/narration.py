"""激しい版のナレーションを作る。

usage: python narration.py kokoro <outdir>   # Kokoro(この環境で動くオープンソースの音声合成・Apache-2.0)
       python narration.py gemini <outdir>   # Gemini TTS(GEMINI_API_KEY が必要)
outdir に n01.wav〜 を書き出し、長さを表示する。
"""
import base64, json, os, subprocess, sys, urllib.error, urllib.request

# (読み上げ用の文, Gemini への話し方の指示)。読みはかなで渡す
LINES = [
    ('あなたは、このままの人生で、満足ですか？', '低めの声で、鋭く問いかけるように。'),
    ('いっかげつで、せんにんの組織づくりに、挑む。', '力強く、決意を込めて。'),
    ('結果を出してきた人たちと、本気で組む。', '自信をもって、力強く。'),
    ('現状を変えたい。成長したい。仲間と、夢を追いたい。', 'たたみかけるように、だんだん熱く。'),
    ('求めているのは、本気で挑戦する、あなただ。', 'まっすぐ呼びかけるように、熱く。'),
    ('これは、説明会ではない。人生を変える、挑戦のスタートだ。', '一番熱く、言い切るように。'),
    ('まずは、いちじかん。ズームセミナーで、待っている。', '最後は力強く、温かさも残して。'),
]


def kokoro(outdir):
    import soundfile as sf
    from kokoro_onnx import Kokoro
    from misaki import ja
    here = os.environ.get('KOKORO_DIR', 'kokoro')
    k = Kokoro(f'{here}/kokoro-v1.0.onnx', f'{here}/voices-v1.0.bin')
    g2p = ja.JAG2P()
    voice = os.environ.get('KOKORO_VOICE', 'jf_alpha')
    for i, (text, _) in enumerate(LINES, 1):
        r = g2p(text)
        ph = r[0] if isinstance(r, tuple) else r
        s, sr = k.create(ph, voice=voice, speed=float(os.environ.get('SPEED', '1.08')), is_phonemes=True)
        path = f'{outdir}/n{i:02d}.wav'
        sf.write(path, s, sr)
        print(f'n{i:02d} {len(s) / sr:5.2f}s  {ph}')


def gemini(outdir):
    key = os.environ['GEMINI_API_KEY']
    voice = os.environ.get('GEMINI_VOICE', 'Kore')
    model = os.environ.get('GEMINI_TTS_MODEL', 'gemini-2.5-flash-preview-tts')
    for i, (text, tone) in enumerate(LINES, 1):
        prompt = ('人材募集のPR動画の、熱く力強いナレーターとして読んでください。'
                  f'叫ばず、張りのある声で。{tone}\n\n{text}')
        body = {'contents': [{'parts': [{'text': prompt}]}],
                'generationConfig': {'responseModalities': ['AUDIO'], 'speechConfig': {
                    'voiceConfig': {'prebuiltVoiceConfig': {'voiceName': voice}}}}}
        req = urllib.request.Request(
            f'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent',
            data=json.dumps(body).encode(), headers={'Content-Type': 'application/json', 'x-goog-api-key': key})
        with urllib.request.urlopen(req) as r:
            pcm = base64.b64decode(json.load(r)['candidates'][0]['content']['parts'][0]['inlineData']['data'])
        path = f'{outdir}/n{i:02d}.wav'
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 's16le', '-ar', '24000', '-ac', '1', '-i', '-',
                        '-af', 'silenceremove=start_periods=1:start_threshold=-45dB:stop_periods=1:stop_threshold=-45dB:stop_duration=0.3',
                        path], input=pcm, check=True)
        print(f'n{i:02d} ok')


if __name__ == '__main__':
    os.makedirs(sys.argv[2], exist_ok=True)
    {'kokoro': kokoro, 'gemini': gemini}[sys.argv[1]](sys.argv[2])
