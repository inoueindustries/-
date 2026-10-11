"""ナレーション(Gemini TTS または Google Cloud TTS・女性)+BGMを42秒動画に合成する。

usage:
  python3 build_audio.py gemini              # GEMINI_API_KEY で Gemini TTS(女性の声)の6区間を生成 → voice/01..06.wav
  python3 build_audio.py gemini 2 6          # 指定した区間だけ作り直す
  python3 build_audio.py tts                 # GOOGLE_TTS_API_KEY で6区間の音声を生成 → voice/01..06.mp3
  python3 build_audio.py mix <bgm> <video> <out.mp4>
音声を自分で用意する場合は voice/01.mp3〜06.mp3 を置いて mix だけ実行する。
"""
import base64, json, os, subprocess, sys, time, urllib.error, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
VOICE_DIR = os.path.join(HERE, 'voice')
VOICE = os.environ.get('TTS_VOICE', 'ja-JP-Neural2-B')  # 女性の声
RATE = float(os.environ.get('TTS_RATE', '0.95'))

# シーン開始秒(台本の仮タイムライン)とナレーション。読み: Zoom=ズーム、一人=ひとり、一時間=いちじかん
SEGMENTS = [
    (0, '今の毎日を、<break time="150ms"/>少し変えてみたい。<break time="400ms"/>そんな思いを、次の一歩につなげませんか。'),
    (8, '<sub alias="ひとり">一人</sub>では踏み出せなくても、<break time="200ms"/>同じ思いの仲間がいれば、<break time="200ms"/>挑戦は始められる。'),
    (16, '新しい出会いから学び、<break time="200ms"/>自分の可能性を、<break time="150ms"/>少しずつ広げていく。'),
    (23, '成長したい。<break time="300ms"/>仲間と夢を追いたい。<break time="300ms"/>その気持ちを、大切に。'),
    (29, 'まずは、<break time="150ms"/>ズームセミナーでお会いしましょう。'),
    (34, 'あなたのこれからを考える、<sub alias="いちじかん">一時間</sub>。<break time="400ms"/>新しい挑戦を、<break time="150ms"/>ここから一緒に。'),
]
LEAD = 0.3        # 各シーン頭から声が出るまで
VIDEO_LEN = 42.0
LAST_WORD_BY = 40.8


def tts():
    key = os.environ['GOOGLE_TTS_API_KEY']
    os.makedirs(VOICE_DIR, exist_ok=True)
    for i, (_, ssml) in enumerate(SEGMENTS, 1):
        body = {
            'input': {'ssml': f'<speak>{ssml}</speak>'},
            'voice': {'languageCode': 'ja-JP', 'name': VOICE},
            'audioConfig': {'audioEncoding': 'MP3', 'speakingRate': RATE, 'sampleRateHertz': 48000},
        }
        req = urllib.request.Request(
            'https://texttospeech.googleapis.com/v1/text:synthesize',
            data=json.dumps(body).encode(), headers={'Content-Type': 'application/json', 'X-Goog-Api-Key': key})
        with urllib.request.urlopen(req) as r:
            audio = base64.b64decode(json.load(r)['audioContent'])
        with open(os.path.join(VOICE_DIR, f'{i:02d}.mp3'), 'wb') as f:
            f.write(audio)
        print(f'voice {i:02d} ok')


# Gemini TTS はSSML非対応なので、読みはかなで渡し、話し方は自然文で指示する
GEMINI_VOICE = os.environ.get('GEMINI_VOICE', 'Kore')  # 女性の声。Aoede / Leda / Zephyr なども可
GEMINI_MODELS = [m for m in [os.environ.get('GEMINI_TTS_MODEL'),
                             'gemini-3.1-flash-tts-preview', 'gemini-2.5-flash-preview-tts'] if m]
GEMINI_STYLE = ('次の日本語を、温かく落ち着いたプロの女性ナレーターとして読んでください。'
                '営業調や大げさな抑揚は避け、句読点で自然に息継ぎします。'
                'ゆっくりすぎず、CMナレーションの自然なテンポで。間は短めに。{tone}\n\n')
GEMINI_LINES = [
    ('冒頭なので、そっと問いかけるように。', '今の毎日を、少し変えてみたい。そんな思いを、次の一歩につなげませんか。'),
    ('', 'ひとりでは踏み出せなくても、同じ思いの仲間がいれば、挑戦は始められる。'),
    ('', '新しい出会いから学び、自分の可能性を、少しずつ広げていく。'),
    ('少し明るく、前向きに。', '成長したい。仲間と夢を追いたい。その気持ちを、大切に。'),
    ('明るく、前向きに。', 'まずは、ズームセミナーでお会いしましょう。'),
    ('明るく前向きに、最後は余韻を残して。', 'あなたのこれからを考える、いちじかん。新しい挑戦を、ここから一緒に。'),
]


def gemini(only=()):
    key = os.environ['GEMINI_API_KEY']
    os.makedirs(VOICE_DIR, exist_ok=True)
    for i, (tone, text) in enumerate(GEMINI_LINES, 1):
        if only and i not in only:
            continue
        body = {
            'contents': [{'parts': [{'text': GEMINI_STYLE.format(tone=tone) + text}]}],
            'generationConfig': {'responseModalities': ['AUDIO'], 'speechConfig': {
                'voiceConfig': {'prebuiltVoiceConfig': {'voiceName': GEMINI_VOICE}}}},
        }
        pcm = model = None
        for model in GEMINI_MODELS:
            for wait in (0, 20, 40, 60):              # 1分あたりの回数制限(429)は待って同じモデルで再挑戦
                time.sleep(wait)
                req = urllib.request.Request(
                    f'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent',
                    data=json.dumps(body).encode(), headers={'Content-Type': 'application/json', 'x-goog-api-key': key})
                try:
                    with urllib.request.urlopen(req) as r:
                        pcm = base64.b64decode(json.load(r)['candidates'][0]['content']['parts'][0]['inlineData']['data'])
                    break
                except urllib.error.HTTPError as e:
                    print(f'{model}: HTTP {e.code}')
                    if e.code != 429:
                        break
            if pcm:
                break
        if not pcm:
            sys.exit('Gemini TTS の呼び出しに失敗しました')
        # 返ってくるのは 24kHz・16bit・モノラルのPCM
        out = os.path.join(VOICE_DIR, f'{i:02d}.wav')
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 's16le', '-ar', '24000', '-ac', '1', '-i', '-',
                        out], input=pcm, check=True)
        tighten(out)
        print(f'voice {i:02d} ok ({model}, {GEMINI_VOICE}) {duration(out):.2f}s')


MAX_GAP = float(os.environ.get('MAX_GAP', '0.45'))   # 文中の間の上限(秒)


def tighten(path, floor_db=-45, max_gap=MAX_GAP):
    """前後の無音を切り、長すぎる間を max_gap 秒に縮める(声そのものの速さは変えない)。"""
    import wave
    import numpy as np
    with wave.open(path) as w:
        sr = w.getframerate()
        x = np.frombuffer(w.readframes(w.getnframes()), '<i2').astype(float)
    hop = sr // 100
    rms = np.sqrt(np.convolve(x ** 2, np.ones(hop) / hop, 'same'))[::hop]
    loud = 20 * np.log10(rms / 32768 + 1e-9) > floor_db
    idx = np.flatnonzero(loud)
    if not len(idx):
        return
    keep, last, fade = [], None, int(0.01 * sr)
    for f in idx:
        if last is not None and f - last > 1:
            gap = (f - last - 1) * hop
            if gap > max_gap * sr:                  # 間の前後を残し、真ん中を短く切って継ぐ
                half = int(max_gap * sr / 2)
                keep.append((seg_start, last * hop + hop + half))
                seg_start = f * hop - half
        if last is None:
            seg_start = max(0, f * hop - int(0.05 * sr))
        last = f
    keep.append((seg_start, min(len(x), last * hop + hop + int(0.15 * sr))))
    parts = []
    for a, b in keep:
        p = x[a:b].copy()
        p[:fade] *= np.linspace(0, 1, fade)
        p[-fade:] *= np.linspace(1, 0, fade)
        parts.append(p)
    y = np.concatenate(parts)
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(np.clip(y, -32768, 32767).astype('<i2').tobytes())


def voice_file(i):
    for ext in ('wav', 'mp3', 'm4a'):
        p = os.path.join(VOICE_DIR, f'{i:02d}.{ext}')
        if os.path.exists(p):
            return p
    sys.exit(f'voice/{i:02d}.* がありません')


def duration(path):
    out = subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path])
    return float(out)


def check_timing():
    """各区間が次のシーンまでに収まるか実測して表示。収まらなければ止める。"""
    ok = True
    for i, (start, _) in enumerate(SEGMENTS):
        d = duration(voice_file(i + 1))
        end = start + LEAD + d
        limit = SEGMENTS[i + 1][0] if i + 1 < len(SEGMENTS) else LAST_WORD_BY
        flag = 'OK' if end <= limit else 'はみ出し'
        ok &= end <= limit
        print(f'シーン{i + 1}: {start + LEAD:5.1f}s → {end:5.2f}s (上限 {limit}s) {flag}')
    return ok


def mix(bgm, video, out):
    if not check_timing():
        sys.exit('ナレーションが区間に収まりません。TTS_RATE を上げるか区間を調整してください。')
    inputs, filters, labels = ['-i', video, '-stream_loop', '-1', '-i', bgm], [], []
    for i, (start, _) in enumerate(SEGMENTS):
        inputs += ['-i', voice_file(i + 1)]
        ms = int((start + LEAD) * 1000)
        filters.append(f'[{i + 2}:a]aresample=48000,adelay={ms}|{ms},apad[v{i}]')
        labels.append(f'[v{i}]')
    filters.append(f'{"".join(labels)}amix=inputs={len(SEGMENTS)}:normalize=0,atrim=0:{VIDEO_LEN},asplit[voice][key]')
    # BGMは控えめに敷き、声が出ている間はさらに下げる(サイドチェイン・ダッキング)。最後1.5秒でフェードアウト
    filters.append(f'[1:a]aresample=48000,atrim=0:{VIDEO_LEN},volume=0.35,afade=t=in:d=0.8,'
                   f'afade=t=out:st={VIDEO_LEN - 1.5}:d=1.5[bgm]')
    filters.append('[bgm][key]sidechaincompress=threshold=0.02:ratio=6:attack=20:release=400[duck]')
    filters.append(f'[voice][duck]amix=inputs=2:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000,atrim=0:{VIDEO_LEN}[a]')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', *inputs, '-filter_complex', ';'.join(filters),
                    '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
                    '-t', str(VIDEO_LEN), '-movflags', '+faststart', out], check=True)
    print('done:', out, f'{duration(out):.3f}s')


if __name__ == '__main__':
    if sys.argv[1] == 'gemini':
        gemini({int(a) for a in sys.argv[2:]})
    elif sys.argv[1] == 'tts':
        tts()
    elif sys.argv[1] == 'mix':
        mix(*sys.argv[2:5])
