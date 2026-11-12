"""激しい版の音を作る: BGM(120BPM)+効果音(ドン/バン/シュッ/キラーン/上昇音)+ナレーション。

usage: python3 audio_hype.py <ナレーションのフォルダ> <無音の映像.mp4> <完成.mp4>
timeline.json の秒数に合わせて鳴らす。外部の音源は使わず、すべてここで合成する。
"""
import json
import os
import subprocess
import sys
import wave

import numpy as np

SR = 48000
HERE = os.path.dirname(os.path.abspath(__file__))
TL = json.load(open(os.path.join(HERE, 'timeline.json')))
LENGTH = TL['length']
BEAT = 60 / TL['bpm']
BAR = BEAT * 4
rng = np.random.default_rng(42)


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def tt(sec):
    return np.arange(int(sec * SR)) / SR


def add(buf, at, sig, gain=1.0, pan=0.0):
    i = int(at * SR)
    if i >= buf.shape[1] or i + len(sig) <= 0:
        return
    if i < 0:
        sig, i = sig[-i:], 0
    sig = sig[: buf.shape[1] - i]
    buf[0, i:i + len(sig)] += sig * gain * np.sqrt((1 - pan) / 2) * 1.414
    buf[1, i:i + len(sig)] += sig * gain * np.sqrt((1 + pan) / 2) * 1.414


def band_noise(sec, lo, hi):
    """lo〜hi Hz だけを残したノイズ。"""
    n = int(sec * SR)
    spec = np.fft.rfft(rng.standard_normal(n))
    f = np.fft.rfftfreq(n, 1 / SR)
    spec *= (f >= lo) & (f <= hi)
    x = np.fft.irfft(spec, n)
    return x / (np.max(np.abs(x)) + 1e-9)


def saw(f, t, n_harm=10):
    return sum(np.sin(2 * np.pi * f * h * t) / h for h in range(1, n_harm + 1) if f * h < 12000)


def sweep_tone(t, f0, f1, curve=3.0):
    """f0→f1 へ指数的に下がる/上がる音程の正弦波。"""
    f = f1 + (f0 - f1) * np.exp(-t * curve * 10)
    return np.sin(2 * np.pi * np.cumsum(f) / SR)


def reverb(x, seconds=2.2, wet=0.25, seed=1):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    r = np.random.default_rng(seed)
    out = np.empty_like(x)
    size = 1 << int(np.ceil(np.log2(x.shape[1] + n)))
    for ch in range(2):
        ir = r.standard_normal(n) * np.exp(-t / (seconds / 6))
        ir = np.convolve(ir, np.ones(8) / 8, mode='same')
        ir /= np.sqrt(np.sum(ir ** 2))
        w = np.fft.irfft(np.fft.rfft(x[ch], size) * np.fft.rfft(ir, size), size)[: x.shape[1]]
        out[ch] = x[ch] * (1 - wet) + w * wet
    return out


# ---------------- ドラム・楽器 ----------------
def kick():
    t = tt(0.45)
    body = sweep_tone(t, 160, 45, 2.5) * np.exp(-t * 7)
    click = band_noise(0.45, 2000, 8000) * np.exp(-t * 300) * 0.4
    return np.tanh((body + click) * 1.6)


def clap():
    t = tt(0.3)
    nz = band_noise(0.3, 900, 6000)
    env = sum(np.exp(-np.clip(t - d, 0, None) * 60) * (t >= d) for d in (0, 0.012, 0.024)) + 0.6 * np.exp(-t * 18)
    return nz * env * 0.55


def hat(open_=False):
    t = tt(0.25)
    return band_noise(0.25, 7000, 16000) * np.exp(-t * (14 if open_ else 55)) * 0.28


def bass(m, dur):
    t = tt(dur)
    f = hz(m)
    sig = np.sin(2 * np.pi * f * t) + 0.5 * saw(f * 2, t, 5) * 0.4
    env = np.clip(t / 0.005, 0, 1) * np.exp(-t * 3) * np.clip((dur - t) / 0.02, 0, 1)
    return np.tanh(sig * env * 1.4) * 0.5


def stab(notes, dur=0.22, bright=10):
    t = tt(dur + 0.1)
    sig = sum(saw(hz(m) * 2 ** (c / 1200), t, bright) for m in notes for c in (-9, 0, 9))
    env = np.clip(t / 0.004, 0, 1) * np.exp(-t * 9) * np.clip((dur + 0.1 - t) / 0.08, 0, 1)
    return sig * env / (len(notes) * 3) * 0.9


def pad(notes, dur):
    t = tt(dur + 0.6)
    sig = sum(saw(hz(m) * 2 ** (c / 1200), t, 5) for m in notes for c in (-12, 0, 12))
    env = np.clip(t / 0.4, 0, 1) * np.clip((dur + 0.6 - t) / 0.6, 0, 1)
    return sig * env / (len(notes) * 3) * 0.5


# ---------------- 効果音 ----------------
def se_don(big=False):
    d = 2.6 if big else 1.4
    t = tt(d)
    sub = sweep_tone(t, 130, 38, 1.2) * np.exp(-t * (2.4 if big else 2.6))
    thump = sweep_tone(t, 300, 70, 4) * np.exp(-t * 10) * 0.6
    crack = band_noise(d, 150, 3000) * np.exp(-t * 18) * 0.5
    x = np.tanh((sub + thump + crack) * 2.2)
    if big:
        x += band_noise(d, 4000, 15000) * np.exp(-t * 2.6) * 0.22     # シンバル
    return x


def se_ban():
    t = tt(0.8)
    crack = band_noise(0.8, 800, 7000) * np.exp(-t * 22)
    body = sweep_tone(t, 260, 120, 3) * np.exp(-t * 16) * 0.8
    low = sweep_tone(t, 110, 50, 2) * np.exp(-t * 7) * 0.7
    return np.tanh((crack + body + low) * 1.8) * 0.85


def se_kira():
    t = tt(1.6)
    x = sum(np.sin(2 * np.pi * f * t) * np.exp(-t * d) * a
            for f, a, d in ((2637, .5, 3), (3520, .4, 3.5), (5274, .3, 4.5), (7040, .2, 6)))
    for k in range(10):                                            # キラキラの粒
        s = 0.03 + k * 0.06
        f = 3000 + rng.uniform(0, 5000)
        x += np.sin(2 * np.pi * f * t) * np.exp(-np.clip(t - s, 0, None) * 25) * (t >= s) * 0.15
    return x * 0.5


def filtered_sweep(sec, f0, f1, q=0.6):
    """時間とともに通す帯域が f0→f1 へ動くノイズ(シュッ・上昇音の素)。"""
    n = int(sec * SR)
    noise = rng.standard_normal(n)
    out = np.zeros(n)
    low = band = 0.0
    for i in range(n):
        fc = f0 * (f1 / f0) ** (i / n)
        g = 2 * np.sin(np.pi * fc / SR)
        high = noise[i] - low - q * band
        band += g * high
        low += g * band
        out[i] = band
    return out / (np.max(np.abs(out)) + 1e-9)


def se_whoosh(sec):
    t = tt(sec)
    x = filtered_sweep(sec, 250, 5000)
    return x * (t / sec) ** 2 * 0.7


def se_riser(sec):
    t = tt(sec)
    x = filtered_sweep(sec, 200, 9000, 0.4) * 0.6
    f = 180 * (1300 / 180) ** (t / sec)
    x += np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.25
    return x * (0.35 + 0.65 * (t / sec) ** 1.5)


# ---------------- BGM ----------------
PROG = [([57, 60, 64, 69], 33), ([53, 57, 60, 65], 29), ([55, 60, 64, 67], 36), ([55, 59, 62, 67], 31)]  # Am F C G


def bgm():
    buf = np.zeros((2, int((LENGTH + 2) * SR)))
    K, C, H, HO = kick(), clap(), hat(), hat(True)
    bars = int(np.ceil(LENGTH / BAR))
    for b in range(bars):
        t0 = b * BAR
        notes, root = PROG[b % 4]
        drums = 2.0 <= t0 < 27.0 or 33.0 <= t0 < 41.4
        drop = t0 >= 33.0
        breakdown = 27.0 <= t0 < 33.0
        add(buf, t0, pad([n - 12 for n in notes], BAR), 0.35 if not breakdown else 0.5)
        for beat in range(4):
            tb = t0 + beat * BEAT
            if tb >= 41.4:
                break
            if drums:
                add(buf, tb, K, 0.9)
                if beat in (1, 3):
                    add(buf, tb, C, 0.55)
                for e in range(2 if not drop else 4):
                    step = BEAT / (2 if not drop else 4)
                    add(buf, tb + e * step, H, 0.5 if not drop else 0.4, pan=0.3)
                add(buf, tb + BEAT / 2, HO, 0.25, pan=-0.3)
                for e in range(2):                                          # 8分のベース
                    add(buf, tb + e * BEAT / 2, bass(root + (12 if e else 0), BEAT / 2 - 0.01), 0.7)
                add(buf, tb + BEAT / 2, stab([n + 12 for n in notes], bright=12 if drop else 8), 0.55 if drop else 0.4)
            elif breakdown and beat in (0, 2):
                add(buf, tb, bass(root, BEAT * 2 - 0.02), 0.5)
    for k in range(32):                                                     # 31.1〜33秒のスネアロール
        s = 31.1 + 1.9 * (1 - (1 - k / 32) ** 1.6)
        add(buf, s, C, 0.3 + 0.9 * k / 32)
    notes, root = PROG[0]                                                   # 最後の決め
    add(buf, 41.4, stab([n + 12 for n in notes] + [n for n in notes], dur=0.9, bright=12), 0.9)
    add(buf, 41.4, bass(root, 0.9), 0.9)
    return reverb(buf[:, : int(LENGTH * SR)], 1.6, 0.18, seed=3)


def effects():
    buf = np.zeros((2, int((LENGTH + 3) * SR)))
    for h in TL['hits']:
        k = h['kind']
        if k == 'don':
            add(buf, h['t'], se_don(h.get('big', False)), 1.0 if h.get('big') else 0.85)
        elif k == 'ban':
            add(buf, h['t'], se_ban(), 0.7)
        elif k == 'kira':
            add(buf, h['t'], se_kira(), 0.45, pan=0.2)
        elif k == 'riser':
            add(buf, h['t'], se_riser(h['dur']), 1.2)
        elif k == 'whoosh':
            nxt = min((x['t'] for x in TL['hits'] if x['t'] > h['t'] and x['kind'] in ('don', 'ban')), default=h['t'] + .45)
            add(buf, h['t'], se_whoosh(nxt - h['t']), 0.55)
        if h.get('fireworks'):
            for j in range(14):                                             # パチパチ
                s = h['t'] + 0.15 + rng.uniform(0, 1.1)
                t = tt(0.12)
                add(buf, s, band_noise(0.12, 2000, 9000) * np.exp(-t * 60) * 0.3, 1.0, pan=rng.uniform(-.8, .8))
    return reverb(buf[:, : int(LENGTH * SR)], 2.4, 0.22, seed=5)


# 声の仕上げ。VOICE_STYLE=trailer で、映画予告のような低く太い迫力のある声にする
VOICE_FX = {
    'clear': '[0:a]highpass=f=90,equalizer=f=3000:t=q:w=1:g=3,acompressor=threshold=0.1:ratio=3:attack=5:release=80[out]',
    'trailer': (
        '[0:a]aresample=48000,rubberband=pitch=0.94,highpass=f=70,'
        'equalizer=f=110:t=q:w=1:g=4,equalizer=f=350:t=q:w=1.2:g=-3,equalizer=f=2800:t=q:w=1:g=4,equalizer=f=6000:t=q:w=1:g=2,'
        'acompressor=threshold=0.08:ratio=5:attack=3:release=60:makeup=2,volume=1.6,asoftclip=type=tanh,asplit[a][b];'
        '[b]rubberband=pitch=0.5,lowpass=f=500,volume=0.12[sub];'                    # 1オクターブ下を薄く重ねて厚みを出す
        '[a][sub]amix=inputs=2:normalize=0,aecho=0.85:0.5:35|70:0.16|0.09[out]'       # 短い残響で響きを足す
    ),
}


def load_voice(path):
    fx = VOICE_FX[os.environ.get('VOICE_STYLE', 'clear')]
    raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', path, '-filter_complex', fx, '-map', '[out]',
                                   '-ar', str(SR), '-ac', '1', '-f', 'f32le', '-'])
    return np.frombuffer(raw, '<f4').astype(np.float64)


def narration(folder):
    buf = np.zeros((2, int((LENGTH + 2) * SR)))
    for n in TL['narration']:
        v = load_voice(os.path.join(folder, n['file']))
        v /= np.max(np.abs(v)) + 1e-9
        end = n['at'] + len(v) / SR
        print(f"  {n['file']}: {n['at']:.2f}s → {end:.2f}s")
        add(buf, n['at'], v, n.get('gain', 1.0))       # gain: 盛り上がる区間で声だけ持ち上げる
    return buf[:, : int(LENGTH * SR)]


def main(folder, video, out):
    voice = narration(folder)
    music, fx = bgm(), effects()
    # ナレーションが鳴っている間はBGMを下げる
    env = np.abs(voice[0])
    k = int(0.15 * SR)
    env = np.convolve(env, np.ones(k) / k, mode='same')
    env = np.clip(env / (np.max(env) + 1e-9) * 3, 0, 1)
    music *= 1 - 0.9 * env
    fx *= 1 - 0.75 * env
    mix = music * 0.45 + fx * 0.7 + voice
    t = np.arange(mix.shape[1]) / SR
    mix *= np.clip((LENGTH - t) / 0.35, 0, 1)
    mix = np.tanh(mix / np.max(np.abs(mix)) * 1.2) / np.tanh(1.2) * 0.95    # 軽く頭を丸める
    tmp = os.path.splitext(out)[0] + '_audio.wav'
    with wave.open(tmp, 'wb') as w:
        w.setnchannels(2), w.setsampwidth(2), w.setframerate(SR)
        w.writeframes((np.clip(mix.T, -1, 1) * 32767).astype('<i2').tobytes())
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', video, '-i', tmp, '-map', '0:v', '-map', '1:a',
                    '-c:v', 'copy', '-af', 'loudnorm=I=-14:TP=-1.0:LRA=9', '-ar', str(SR), '-c:a', 'aac', '-b:a', '192k',
                    '-t', str(LENGTH), '-movflags', '+faststart', out], check=True)
    print('done:', out)


if __name__ == '__main__':
    main(*sys.argv[1:4])
