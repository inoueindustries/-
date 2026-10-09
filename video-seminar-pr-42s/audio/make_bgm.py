"""42秒のオリジナルBGMを合成する(外部音源なし・使用権の心配なし)。

usage: python3 make_bgm.py <out.wav>

Dメジャー、16小節ちょうどで42秒(約91BPM)。シーンに合わせて楽器が増えていく。
  1〜3小節 (0〜8秒)    パッドだけ。静かに問いかける
  4〜8小節 (8〜21秒)   ピアノのアルペジオが入る
  7小節〜 (16秒〜)      ベースが入る
  9〜14小節 (21〜37秒) 刻みとベルで明るく前向きに
  15〜16小節 (37〜42秒) Dに解決して余韻、最後はフェードアウト
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

# コード進行と、パッドの和音(MIDI番号)、ベースのルート
CHORDS = {
    'D':   ([50, 57, 62, 66, 69], 38),
    'A':   ([52, 57, 61, 64, 69], 33),
    'Bm':  ([54, 59, 62, 66, 71], 35),
    'G':   ([55, 59, 62, 67, 71], 31),
    'F#m': ([54, 57, 61, 66, 69], 30),
}
PROGRESSION = ['D', 'A', 'Bm', 'G', 'D', 'A', 'Bm', 'G',
               'G', 'A', 'F#m', 'Bm', 'G', 'A', 'D', 'D']


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def place(buf, start, sig, pan=0.0):
    """sig を start 秒の位置に、pan(-1左〜+1右)で足し込む。"""
    i = int(start * SR)
    if i >= buf.shape[1]:
        return
    sig = sig[: buf.shape[1] - i]
    buf[0, i:i + len(sig)] += sig * np.sqrt((1 - pan) / 2)
    buf[1, i:i + len(sig)] += sig * np.sqrt((1 + pan) / 2)


def pad_note(m, dur, attack=0.7, release=1.0):
    n = int((dur + release) * SR)
    t = np.arange(n) / SR
    sig = np.zeros(n)
    for cents in (-7, 0, 7):
        f = hz(m) * 2 ** (cents / 1200)
        phase = rng.uniform(0, 2 * np.pi)
        for h in range(1, 7):
            sig += np.sin(2 * np.pi * f * h * t + phase * h) / h ** 1.6
    env = np.clip(t / attack, 0, 1) * np.clip((dur + release - t) / release, 0, 1)
    return sig * env * 0.05


def piano_note(m, dur=1.6, vel=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = hz(m)
    sig = np.zeros(n)
    for h in range(1, 9):
        fh = f * h * np.sqrt(1 + 0.0004 * h * h)       # 弦らしいわずかなずれ
        sig += np.sin(2 * np.pi * fh * t) * np.exp(-t * (1.0 + 0.7 * h)) / h ** 1.4
    attack = np.clip(t / 0.004, 0, 1)
    tail = np.clip((dur - t) / 0.2, 0, 1)
    return sig * attack * tail * 0.11 * vel


def bass_note(m, dur):
    n = int((dur + 0.3) * SR)
    t = np.arange(n) / SR
    f = hz(m)
    sig = np.sin(2 * np.pi * f * t) + 0.45 * np.sin(4 * np.pi * f * t) + 0.18 * np.sin(6 * np.pi * f * t)
    env = np.clip(t / 0.03, 0, 1) * np.exp(-t * 0.6) * np.clip((dur + 0.3 - t) / 0.3, 0, 1)
    return sig * env * 0.14


def pluck(m, vel=1.0):
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    f = hz(m)
    sig = np.sin(2 * np.pi * f * t) + 0.3 * np.sin(4 * np.pi * f * t)
    return sig * np.clip(t / 0.003, 0, 1) * np.exp(-t * 14) * 0.05 * vel


def bell(m):
    n = int(3.0 * SR)
    t = np.arange(n) / SR
    f = hz(m)
    sig = sum(a * np.sin(2 * np.pi * f * r * t) * np.exp(-t * d)
              for r, a, d in ((1, 1, 1.2), (2.76, 0.4, 2.5), (5.4, 0.2, 4), (8.93, 0.1, 6)))
    return sig * np.clip(t / 0.002, 0, 1) * 0.035


def reverb(dry, seconds=2.6, wet=0.32):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    out = np.empty_like(dry)
    size = 1 << int(np.ceil(np.log2(dry.shape[1] + n)))
    for ch in range(2):
        ir = rng.standard_normal(n) * np.exp(-t / (seconds / 5))
        ir = np.convolve(ir, np.ones(6) / 6, mode='same')      # 少し丸い響きに
        ir /= np.sqrt(np.sum(ir ** 2))
        w = np.fft.irfft(np.fft.rfft(dry[ch], size) * np.fft.rfft(ir, size), size)[: dry.shape[1]]
        out[ch] = dry[ch] * (1 - wet) + w * wet
    return out


def highpass(mix, cutoff=70.0):
    """スマホで鳴らない重低音を削って、声の邪魔をしないようにする。"""
    spec = np.fft.rfft(mix, axis=1)
    f = np.fft.rfftfreq(mix.shape[1], 1 / SR)
    spec *= np.clip((f - cutoff * 0.6) / (cutoff * 0.4), 0, 1)
    return np.fft.irfft(spec, mix.shape[1], axis=1)


def triad(name):
    """アルペジオ用の三和音。ルートを G3〜F#4(55〜66)に置く。"""
    root = 55 + (CHORDS[name][1] - 55) % 12
    third = root + (3 if name.endswith('m') else 4)
    return root, third, root + 7


def build():
    buf = np.zeros((2, int((LENGTH + 3) * SR)))
    for b, name in enumerate(PROGRESSION):
        start = b * BAR
        pad, root = CHORDS[name]
        last = b == BARS - 1
        lift = 1.0 if b < 8 else 1.2
        for k, m in enumerate(pad):
            place(buf, start, pad_note(m, BAR if not last else BAR * 0.6) * lift, pan=(k - 2) * 0.25)

        r, t3, t5 = triad(name)
        if 3 <= b < BARS - 1:                                       # ピアノのアルペジオ
            vel = 0.75 if b < 8 else 1.0
            for i, m in enumerate([r, t5, r + 12, t3 + 12, t5 + 12, t3 + 12, r + 12, t5]):
                place(buf, start + i * BEAT / 2, piano_note(m, vel=vel * (1.1 if i == 0 else 0.9)),
                      pan=(m - 72) / 30)
        if last:                                                    # 最後は和音をひとつ置いて余韻
            for m in (r, t3, t5, r + 12):
                place(buf, start, piano_note(m, dur=3.5, vel=0.8), pan=(m - 72) / 30)

        if 6 <= b < BARS - 1:                                       # ベース(2分音符)
            for half in range(2):
                place(buf, start + half * BAR / 2, bass_note(root + 12, BAR / 2) * (0.8 if b < 8 else 1.0))
        if 8 <= b < 14:                                             # 8分の刻み
            for i in range(8):
                place(buf, start + i * BEAT / 2, pluck(r - 12 if i % 2 == 0 else t5 - 12, 1.0 if i % 4 == 0 else 0.6))
        if b in (8, 10, 12, 14):                                    # 頭にベル
            place(buf, start, bell(t3 + 24), pan=0.3)

    mix = highpass(reverb(buf)[:, : int(LENGTH * SR)])
    t = np.arange(mix.shape[1]) / SR
    mix *= np.clip(t / 0.8, 0, 1) * np.clip((LENGTH - t) / 2.5, 0, 1)   # 頭0.8秒で入り、最後2.5秒で消える
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
