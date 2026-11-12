"""42秒のオリジナルBGM(壮大・盛り上がる映画風オーケストラ)を合成する。外部音源なし・使用権の心配なし。

usage: python3 make_bgm.py <out.wav>

Dメジャー、16小節ちょうどで42秒(約91BPM)。Bm→G→D→A の王道進行で、シーンに合わせて大きくなる。
  1〜3小節  (0〜8秒)    低弦と合唱だけ。静かに問いかける。最後にシンバルが膨らむ
  4〜6小節  (8〜16秒)   弦の刻み(8分)とティンパニが入り、動き出す
  7〜9小節  (16〜23秒)  ホルンの主旋律と太鼓。前へ進む力
  10〜11小節(23〜29秒)  刻みが16分に。スネアのロールと上昇音で溜める
  12〜15小節(29〜39秒)  29秒で大きな一撃。金管・合唱・太鼓が全部そろう頂点(ズームセミナーの告知)
  16小節    (39〜42秒)  Dの和音で締めの一撃。余韻を残して消える
声の邪魔にならないよう、合成側(build_audio.py)で声の間だけ音量を下げる。
"""
import sys
import wave

import numpy as np

SR = 48000
LENGTH = 42.0
BARS = 16
BAR = LENGTH / BARS          # 2.625秒
BEAT = BAR / 4
rng = np.random.default_rng(7)

# 小節ごとのコード(ルートのMIDI番号, 短調か)
CHORD = {'D': (62, False), 'A': (57, False), 'Bm': (59, True), 'G': (55, False), 'Asus': (57, None)}
PROGRESSION = ['Bm', 'G', 'D', 'A', 'Bm', 'G', 'D', 'A',
               'Bm', 'G', 'Asus', 'D', 'Bm', 'G', 'A', 'D']
CLIMAX = 11                  # 28.9秒

# ホルン/トランペットの主旋律: 小節 → [(拍, MIDI, 拍数)]
MELODY = {
    6: [(0, 66, 2), (2, 69, 2)],
    7: [(0, 73, 3), (3, 71, 1)],
    8: [(0, 74, 2), (2, 73, 1), (3, 71, 1)],
    9: [(0, 71, 2), (2, 74, 2)],
    10: [(0, 76, 4)],
    11: [(0, 78, 2), (2, 76, 1), (3, 74, 1)],
    12: [(0, 74, 2), (2, 73, 2)],
    13: [(0, 71, 2), (2, 74, 2)],
    14: [(0, 76, 3), (3, 73, 1)],
    15: [(0, 74, 6)],
}


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def chord_tones(name):
    """ルート・3度・5度(MIDI)。sus4 は3度の代わりに4度。"""
    root, minor = CHORD[name]
    third = root + (5 if minor is None else 3 if minor else 4)
    return root, third, root + 7


def place(buf, start, sig, pan=0.0):
    """sig を start 秒の位置に、pan(-1左〜+1右)で足し込む。"""
    i = int(start * SR)
    if i >= buf.shape[1] or i < 0:
        return
    sig = sig[: buf.shape[1] - i]
    buf[0, i:i + len(sig)] += sig * np.sqrt((1 - pan) / 2)
    buf[1, i:i + len(sig)] += sig * np.sqrt((1 + pan) / 2)


def eq(x, hp=None, lp=None):
    """FFTで高域・低域をなだらかに削る(1本の信号でもステレオでも可)。"""
    n = x.shape[-1]
    spec = np.fft.rfft(x, axis=-1)
    f = np.fft.rfftfreq(n, 1 / SR)
    g = np.ones_like(f)
    if hp:
        g *= 1 / np.sqrt(1 + (hp / np.maximum(f, 1)) ** 4)
    if lp:
        g *= 1 / np.sqrt(1 + (f / lp) ** 4)
    return np.fft.irfft(spec * g, n, axis=-1)


def env_adsr(t, dur, attack, release):
    return np.clip(t / attack, 0, 1) * np.clip((dur + release - t) / release, 0, 1)


def phase_of(f, n, vib_rate=5.2, vib_depth=0.0):
    """ビブラートつきの位相(ゆっくり深くなる)。"""
    t = np.arange(n) / SR
    depth = vib_depth * np.clip(t / 0.6, 0, 1)
    inst = f * (1 + depth * np.sin(2 * np.pi * vib_rate * t + rng.uniform(0, 6.28)))
    return 2 * np.pi * np.cumsum(inst) / SR + rng.uniform(0, 6.28)


def ensemble_saw(m, dur, attack, release, voices=4, detune=9, vib=0.004, top=7000):
    """弦楽合奏: 少しずつずらしたノコギリ波を重ねる。"""
    n = int((dur + release) * SR)
    t = np.arange(n) / SR
    f0 = hz(m)
    sig = np.zeros(n)
    for v in range(voices):
        f = f0 * 2 ** (detune * (v / max(voices - 1, 1) - 0.5) / 600)
        ph = phase_of(f, n, vib_rate=rng.uniform(4.8, 5.8), vib_depth=vib)
        for h in range(1, int(top / f0) + 1):
            sig += np.sin(h * ph) / h
    return sig * env_adsr(t, dur, attack, release) / voices


def strings(m, dur, attack=0.5, release=0.8):
    return ensemble_saw(m, dur, attack, release) * 0.07


def spiccato(m, length=0.16, vel=1.0):
    """弦の刻み(短く弾む音)。"""
    n = int((length + 0.08) * SR)
    t = np.arange(n) / SR
    sig = ensemble_saw(m, length, 0.006, 0.08, voices=3, detune=12, vib=0, top=6000)[:n]
    return sig * np.exp(-t * 9) * 0.06 * vel


def brass(m, dur, vel=1.0, attack=0.12, release=0.35):
    """金管: 音量が上がるほど倍音が増えて明るくなる。"""
    n = int((dur + release) * SR)
    t = np.arange(n) / SR
    f0 = hz(m)
    env = env_adsr(t, dur, attack, release) * (0.75 + 0.25 * np.clip(t / (dur + 0.01), 0, 1)) * vel
    sig = np.zeros(n)
    for v, cents in enumerate((-6, 0, 6)):
        ph = phase_of(f0 * 2 ** (cents / 1200), n, vib_rate=5.0, vib_depth=0.0025)
        for h in range(1, int(5000 / f0) + 1):
            sig += np.sin(h * ph) / h * env ** (1 + 0.35 * (h - 1))
    return sig * 0.04


def choir(m, dur, attack=0.9, release=1.2):
    """合唱の「アー」: 声の共鳴(フォルマント)を倍音の重みで作る。"""
    n = int((dur + release) * SR)
    t = np.arange(n) / SR
    f0 = hz(m)
    sig = np.zeros(n)
    for v in range(5):
        f = f0 * 2 ** (rng.uniform(-12, 12) / 1200)
        ph = phase_of(f, n, vib_rate=rng.uniform(4.5, 5.5), vib_depth=0.006)
        for h in range(1, int(5000 / f0) + 1):
            fh = f * h
            w = (np.exp(-((fh - 750) / 160) ** 2) + 0.6 * np.exp(-((fh - 1150) / 180) ** 2)
                 + 0.25 * np.exp(-((fh - 2800) / 300) ** 2) + 0.15 / h)
            sig += np.sin(h * ph) * w
    return sig * env_adsr(t, dur, attack, release) * 0.012


def taiko(vel=1.0, f0=72.0):
    n = int(1.6 * SR)
    t = np.arange(n) / SR
    f = f0 * (1 + 0.6 * np.exp(-t * 30))
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t * 4.5) + 0.4 * np.sin(2.3 * ph) * np.exp(-t * 9)
    skin = eq(rng.standard_normal(n) * np.exp(-t * 45), hp=150, lp=2500)
    return (body + 0.5 * skin) * np.clip(t / 0.002, 0, 1) * 0.35 * vel


def timpani(m, vel=1.0):
    n = int(2.5 * SR)
    t = np.arange(n) / SR
    f = hz(m)
    sig = sum(a * np.sin(2 * np.pi * f * r * t) * np.exp(-t * d)
              for r, a, d in ((1, 1, 1.8), (1.5, 0.5, 2.5), (1.99, 0.35, 3), (2.44, 0.2, 4)))
    hit = eq(rng.standard_normal(n) * np.exp(-t * 60), lp=1500)
    return (sig + 0.4 * hit) * np.clip(t / 0.003, 0, 1) * 0.2 * vel


def boom(vel=1.0):
    """大きな一撃の低音。"""
    n = int(3.0 * SR)
    t = np.arange(n) / SR
    f = 38 + 50 * np.exp(-t * 5)
    sig = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 1.6)
    return sig * np.clip(t / 0.004, 0, 1) * 0.55 * vel


def crash(vel=1.0, decay=1.0, seconds=4.0):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    noise = eq(rng.standard_normal(n), hp=3500, lp=14000)
    return noise * (np.exp(-t * decay) + 0.8 * np.exp(-t * 12)) * np.clip(t / 0.002, 0, 1) * 0.06 * vel


def swell(seconds, vel=1.0):
    """逆再生シンバル風の上昇音。終わりの瞬間がいちばん大きい。"""
    n = int(seconds * SR)
    t = np.arange(n) / SR
    noise = eq(rng.standard_normal(n), hp=2500, lp=12000)
    return noise * (t / seconds) ** 3 * 0.07 * vel


def snare(vel=1.0):
    n = int(0.25 * SR)
    t = np.arange(n) / SR
    noise = eq(rng.standard_normal(n), hp=1200, lp=8000) * np.exp(-t * 22)
    tone = np.sin(2 * np.pi * 190 * t) * np.exp(-t * 30)
    return (noise + 0.6 * tone) * 0.09 * vel


def reverb(dry, seconds=3.2):
    """ホールの残響(100%ウェット)。"""
    n = int(seconds * SR)
    t = np.arange(n) / SR
    out = np.empty_like(dry)
    size = 1 << int(np.ceil(np.log2(dry.shape[1] + n)))
    for ch in range(2):
        ir = rng.standard_normal(n) * np.exp(-t / (seconds / 6.5)) * np.clip(t / 0.02, 0, 1)
        ir = eq(ir, lp=6000)
        ir /= np.sqrt(np.sum(ir ** 2))
        out[ch] = np.fft.irfft(np.fft.rfft(dry[ch], size) * np.fft.rfft(ir, size), size)[: dry.shape[1]]
    return out


def build():
    total = int((LENGTH + 4) * SR)
    S, B, C, P = (np.zeros((2, total)) for _ in range(4))   # 弦・金管・合唱・打楽器
    for b, name in enumerate(PROGRESSION):
        s = b * BAR
        root, third, fifth = chord_tones(name)
        last = b == BARS - 1
        big = b >= CLIMAX
        dur = BAR * 1.8 if last else BAR

        # 低弦(チェロ・コントラバス)はずっと鳴らす
        low = root - 24 if root >= 57 else root - 12
        place(S, s, strings(low, dur) * (0.8 + 0.4 * (b / BARS)), pan=-0.2)
        place(S, s, strings(low + 12, dur) * (0.5 + 0.5 * big), pan=0.2)
        # バイオリン・ビオラの和音は4小節目(8秒)から。頂点で1オクターブ上を足す
        if b >= 3:
            for k, m in enumerate((third, fifth, root + 12)):
                place(S, s, strings(m, dur) * (0.4 if b < 6 else 0.55 if b < 9 else 0.8), pan=(k - 1) * 0.5)
        if big:
            for k, m in enumerate((root + 12, third + 12, fifth + 12, root + 24)):
                place(S, s, strings(m, dur, attack=0.15) * 0.55, pan=(k - 1.5) * 0.4)

        # 合唱: 冒頭はそっと、頂点で全開
        if b < 3:
            for k, m in enumerate((root - 12, fifth - 12, third)):
                place(C, s, choir(m, dur) * (0.6 + 0.3 * b), pan=(k - 1) * 0.6)
        if big:
            for k, m in enumerate((root - 12, third - 12 if third - 12 > 50 else third, fifth, root + 12 if root < 64 else root)):
                place(C, s, choir(m, dur, attack=0.25) * 1.3, pan=(k - 1.5) * 0.5)

        # 弦の刻み: 4〜9小節は8分、10小節目からは16分
        if 3 <= b < BARS - 1:
            sub = 4 if b >= 9 else 2
            pattern = [root - 12, root, fifth - 12, root, third - 12, root, fifth - 12, root]
            for i in range(4 * sub):
                m = pattern[i % len(pattern)]
                accent = 1.25 if i % sub == 0 else 0.8
                grow = 0.7 + 0.5 * min(b, 11) / 11
                place(S, s + i * BEAT / sub, spiccato(m, length=BEAT / sub * 0.85, vel=accent * grow),
                      pan=0.35 if i % 2 else -0.35)

        # 金管の主旋律(頂点からはトランペット＋1オクターブ下のホルン)
        for beat, m, beats in MELODY.get(b, []):
            d = beats * BEAT * (0.95 if not last else 1)
            v = 0.8 if b < 9 else 1.0 if b < CLIMAX else 1.25
            place(B, s + beat * BEAT, brass(m - 12, d, vel=v), pan=-0.15)
            if big or b == 10:
                place(B, s + beat * BEAT, brass(m, d, vel=v * 0.7), pan=0.15)
        # トロンボーンの和音(10小節目から)
        if b >= 9:
            for k, m in enumerate((root - 12, fifth - 12)):
                place(B, s, brass(m, dur * 0.97, vel=0.9 if big else 0.7, attack=0.25), pan=(k - 0.5) * 0.6)

        # 打楽器
        if 3 <= b < 6:
            place(P, s, timpani(root - 24 if root >= 57 else root - 12, vel=0.7 + 0.15 * (b - 3)))
            if b == 5:
                place(P, s + 2 * BEAT, timpani(root - 24 if root >= 57 else root - 12, vel=0.8))
        if 6 <= b < 9 or (big and not last):
            v = 1.0 if big else 0.75
            for beat, hv in ((0, 1.0), (1.5, 0.6), (2, 0.9), (3, 0.55), (3.5, 0.7)):
                place(P, s + beat * BEAT, taiko(v * hv, f0=72 if hv > 0.8 else 95), pan=0.1 if beat % 1 else -0.1)
        if b == 9:                                       # 8分で太鼓を連打して溜める
            for i in range(8):
                place(P, s + i * BEAT / 2, taiko(0.55 + 0.05 * i, f0=88))
        if b == 10:                                      # スネアのロールが加速して一撃へ
            hits, x = [], 0.0
            while x < BAR - 0.02:
                hits.append(x)
                x += 0.13 - 0.08 * (x / BAR)
            for x in hits:
                place(P, s + x, snare(0.3 + 0.9 * (x / BAR) ** 2), pan=rng.uniform(-0.2, 0.2))
            for i in range(4):
                place(P, s + i * BEAT, taiko(0.7 + 0.1 * i))

        # 頂点と締めの一撃
        if b in (CLIMAX, BARS - 1):
            place(P, s, boom(1.0 if b == CLIMAX else 0.9))
            place(P, s, crash(1.0, decay=0.9), pan=-0.3)
            place(P, s, crash(0.8, decay=1.1), pan=0.3)
            for k in range(3):
                place(P, s + k * 0.012, taiko(1.0, f0=65 + 8 * k), pan=(k - 1) * 0.3)
            place(P, s, timpani(root - 24 if root >= 57 else root - 12, vel=1.2))
        if b == 14:
            place(P, s + 2 * BEAT, snare(0.8))
            place(P, s + 3 * BEAT, taiko(0.9))
            place(P, s + 3.5 * BEAT, taiko(1.0))

    # 区切りに向けてシンバルを膨らませる
    for at, secs, v in ((3 * BAR, 2.2, 0.7), (6 * BAR, 2.0, 0.8), (CLIMAX * BAR, BAR * 1.0, 1.4),
                        ((BARS - 1) * BAR, 1.8, 1.0)):
        place(P, at - secs, swell(secs, v), pan=0.0)

    S = eq(S, hp=35, lp=7000)
    B = eq(B, hp=60, lp=4200)
    C = eq(C, hp=120, lp=6000)
    P = eq(P, hp=30, lp=15000)
    dry = S + 0.9 * B + 0.9 * C + P
    wet = reverb(0.6 * S + 0.5 * B + 0.8 * C + 0.25 * P)
    mix = (dry + 0.55 * wet)[:, : int(LENGTH * SR)]

    # ゆるいコンプレッサー(大きいところを少し抑える)で、静かな頭と頂点の差を聞きやすく
    level = np.sqrt(np.convolve(np.mean(mix ** 2, axis=0), np.ones(SR // 10) / (SR // 10), 'same')) + 1e-6
    ref = np.percentile(level, 80)
    gain = np.where(level > ref, (level / ref) ** -0.35, 1.0)
    mix *= gain

    t = np.arange(mix.shape[1]) / SR
    mix *= np.clip(t / 0.5, 0, 1) * np.clip((LENGTH - t) / 2.0, 0, 1)   # 頭0.5秒で入り、最後2秒で消える
    return mix / np.max(np.abs(mix)) * 0.89                              # ピーク -1dBFS


def save(path, mix):
    pcm = (np.clip(mix.T, -1, 1) * 32767).astype('<i2')
    with wave.open(path, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


if __name__ == '__main__':
    save(sys.argv[1], build())
    print('done:', sys.argv[1])
