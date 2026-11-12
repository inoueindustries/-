"""AI Studio で1本にまとめて書き出したナレーションを、文ごと(n01〜n07.wav)に切り分ける。

usage: python3 split_voice.py <ナレーション.wav> <出力フォルダ> [文の数=7]
文と文の間の「長い無音」のうち長いものから順に (文の数-1) か所を切れ目にする。
切った各文の長さを表示するので、timeline.json の枠に収まるか確認する。
"""
import os
import re
import subprocess
import sys


def silences(path, noise='-40dB', min_len=0.25):
    log = subprocess.run(['ffmpeg', '-i', path, '-af', f'silencedetect=n={noise}:d={min_len}', '-f', 'null', '-'],
                         capture_output=True, text=True).stderr
    starts = [float(x) for x in re.findall(r'silence_start: ([0-9.]+)', log)]
    ends = [float(x) for x in re.findall(r'silence_end: ([0-9.]+)', log)]
    return list(zip(starts, ends))


def duration(path):
    return float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path]))


def main(src, outdir, n=7):
    n = int(n)
    os.makedirs(outdir, exist_ok=True)
    total = duration(src)
    gaps = silences(src)
    # 頭と最後の無音は切れ目に数えない
    inner = [(a, b) for a, b in gaps if a > 0.05 and b < total - 0.05]
    cuts = sorted(sorted(inner, key=lambda g: g[1] - g[0], reverse=True)[: n - 1])
    if len(cuts) < n - 1:
        sys.exit(f'切れ目が {len(cuts)} か所しか見つかりません。文ごとに別ファイルで書き出してください。')
    # 各文 = 前の無音の終わり 〜 次の無音の始まり(頭と最後の無音も除く)
    head = next((b for a, b in gaps if a <= 0.05), 0.0)
    tail = next((a for a, b in gaps if b >= total - 0.05), total)
    starts = [head] + [b for a, b in cuts]
    ends = [a for a, b in cuts] + [tail]
    for i in range(n):
        out = os.path.join(outdir, f'n{i + 1:02d}.wav')
        a, b = max(starts[i] - 0.03, 0), min(ends[i] + 0.08, total)       # 言葉の頭と余韻を少し残す
        subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', src, '-ss', f'{a:.3f}', '-to', f'{b:.3f}', out], check=True)
        print(f'n{i + 1:02d}: {duration(out):.2f}秒')


if __name__ == '__main__':
    main(*sys.argv[1:4])
