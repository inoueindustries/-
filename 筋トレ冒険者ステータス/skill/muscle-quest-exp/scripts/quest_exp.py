#!/usr/bin/env python3
"""筋トレ報告から獲得EXP・部位配分・レベルの変化を計算する。

スプシ『食事・運動・体組成ログ_まとめ』と同じ式で計算する:
  実質負荷重量 = ROUND(体重 × 自重換算係数 + 重量, 1)   （有酸素・リカバリーは対象外）
  総ボリューム = 実質負荷重量 × 回数 × セット数
  基礎獲得EXP = ROUND(総ボリューム × 基礎EXP倍率)
  有酸素・リカバリー（ウォーキング・サイクリング・サウナ）は 1回 50 EXP
  Lv = MIN(99, INT((有効EXP / 係数) ^ (1 / 乗数)) + 1)

使い方:
  python quest_exp.py "サイドレイズ 8kg 12回 3セット" --bw 67.2
  python quest_exp.py "加重懸垂 +6kg 10回 2セット\nプッシュアップ 自重 20回" --bw 67.2 \
      --total 4193 --parts 肩=1080,胸=778,背中=393,腕=1147,脚=645,腹筋・体幹=151
オプション --json で結果をJSONで出す。
"""
import argparse
import json
import math
import re
import sys
import unicodedata
from pathlib import Path

MASTER = json.loads((Path(__file__).resolve().parent.parent / "references" / "master.json").read_text(encoding="utf-8"))
EXERCISES = {e["name"]: e for e in MASTER["exercises"]}
CARDIO_EXP = 50   # スプシ『トレーニング・運動ログ』N列：部位が「有酸素・リカバリー」なら 50
MAJORS = ["肩", "胸", "背中", "腕", "脚", "腹筋・体幹"]
KANA = {"肩": "かた", "胸": "むね", "背中": "せなか", "腕": "うで", "脚": "あし", "腹筋・体幹": "ふっきん"}

# よくある呼び方 → マスタの種目名
ALIASES = {
    "懸垂": "懸垂（チンニング）", "チンニング": "懸垂（チンニング）", "チンアップ": "懸垂（チンニング）",
    "ディップス": "加重ディップス", "腕立て": "プッシュアップ", "腕立て伏せ": "プッシュアップ",
    "ベンチプレス": "ダンベルベンチプレス", "インクラインプレス": "インクラインダンベルプレス",
    "ショルダープレス": "ダンベルショルダープレス", "カール": "ダンベルカール",
    "インクラインカール": "インクラインダンベルカール", "フレンチプレス": "ダンベルフレンチプレス",
    "シュラッグ": "ダンベルシュラッグ", "ワンハンドロウ": "ワンハンドダンベルロウ",
    "リアレイズ": "リアデルトレイズ", "ブルガリアン": "ブルガリアンスクワット",
    "腹筋ローラー": "アブローラー", "膝コロ": "アブローラー", "レッグレイズ": "ハンギングレッグレイズ",
    "カーフ": "カーフレイズ", "サイクリング": "ロードサイクリング", "散歩": "ウォーキング",
}


def nfkc(s):
    return unicodedata.normalize("NFKC", s).replace(" ", "").replace("　", "")


def find_exercise(text):
    t = nfkc(text)
    names = sorted(EXERCISES, key=len, reverse=True)       # 長い名前を先に（サイドレイズ < インクラインサイドレイズ）
    for n in names:
        if nfkc(n) in t:
            return n
    for a in sorted(ALIASES, key=len, reverse=True):
        if a in t:
            return ALIASES[a]
    return None


def rhu(x, nd=0):
    """スプシの ROUND と同じ四捨五入（0.5 は切り上げ）"""
    k = 10 ** nd
    return math.floor(x * k + 0.5 + 1e-9) / k if x >= 0 else -rhu(-x, nd)


def num(s):
    return float(nfkc(s))


def parse_line(line):
    """「サイドレイズ 8kg 12回 3セット」「加重懸垂 +6kg×10回×2セット」「スクワット 自重 30回」を読む"""
    t = nfkc(line)
    name = find_exercise(t)
    if not name:
        return None
    rest = t
    for n in [name] + [a for a, v in ALIASES.items() if v == name]:
        rest = rest.replace(nfkc(n), " ")
    w = re.search(r"[+＋]?(\d+(?:\.\d+)?)\s*(?:kg|キロ|㎏)", rest, re.I)
    r = re.search(r"(\d+)\s*(?:回|reps?|レップ)", rest, re.I)
    s = re.search(r"(\d+)\s*(?:セット|sets?)", rest, re.I)
    weight = num(w.group(1)) if w else 0.0
    if not r:   # 「8kg×12×3」のような書き方
        nums = re.findall(r"(?:×|x|\*)(\d+)", rest)
        reps = int(nums[0]) if nums else None
        sets = int(nums[1]) if len(nums) > 1 else (int(s.group(1)) if s else 1)
    else:
        reps = int(r.group(1))
        sets = int(s.group(1)) if s else 1
    return {"name": name, "weight": weight, "reps": reps, "sets": sets, "raw": line.strip()}


def calc_entry(p, bw):
    ex = EXERCISES[p["name"]]
    cardio = ex["category"] in ("有酸素運動", "リカバリー")
    if cardio:
        load, volume = None, 0
        exp = CARDIO_EXP if ex["major"] == "有酸素・リカバリー" else 0
    elif not p["reps"]:
        load, volume, exp = None, 0, 0
    else:
        if ex["bodyweight_coef"] > 0 and bw is None:
            raise SystemExit(f"{p['name']} は自重種目なので体重が必要です（--bw で指定）")
        load = rhu((bw or 0) * ex["bodyweight_coef"] + p["weight"], 1)
        volume = load * p["reps"] * p["sets"]
        exp = int(rhu(volume * ex["exp_multiplier"]))
    fines = {f: exp * r for f, r in ex["ratios"].items()} if exp else {}
    majors = {}
    for f, v in fines.items():
        m = MASTER["major_of"][f]
        majors[m] = majors.get(m, 0) + v
    return dict(p, major=ex["major"], load=load, volume=volume, exp=exp,
                multiplier=ex["exp_multiplier"], coef=ex["bodyweight_coef"], fines=fines, majors=majors, cardio=cardio)


def lv_of(e, a, p):
    n = math.floor(math.pow(max(0.0, e) / a, 1 / p) + 1e-9) + 1
    return max(1, min(99, n))


def need_for(lv, a, p):
    return round(a * math.pow(lv, p))   # Lv+1 に必要な有効EXP


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("report", help="筋トレ報告（複数行OK）")
    ap.add_argument("--bw", type=float, help="体重kg（体組成ログの最新値）")
    ap.add_argument("--total", type=float, help="いまの現在総有効EXP（ステータスシートC6）")
    ap.add_argument("--parts", help="大部位の現在有効EXP 例: 肩=1080,胸=778,...")
    ap.add_argument("--a", type=float, default=15.9, help="Lv曲線 係数（ステータスシートI8）")
    ap.add_argument("--p", type=float, default=1.5, help="Lv曲線 乗数（ステータスシートK8）")
    ap.add_argument("--name", default="ちゃんズ")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()

    lines = [l for l in a.report.replace("\\n", "\n").splitlines() if l.strip()]
    entries, unknown = [], []
    for l in lines:
        p = parse_line(l)
        (entries.append(calc_entry(p, a.bw)) if p else unknown.append(l.strip()))

    gained = sum(e["exp"] for e in entries)
    major_gain = {}
    for e in entries:
        for m, v in e["majors"].items():
            major_gain[m] = major_gain.get(m, 0) + v

    result = {"entries": entries, "unknown": unknown, "gained": gained,
              "major_gain": {m: round(v) for m, v in major_gain.items()}}

    if a.total is not None:
        before, after = a.total, a.total + gained
        lb, la = lv_of(before, a.a, a.p), lv_of(after, a.a, a.p)
        result["total"] = {"before": round(before), "after": round(after), "lv_before": lb, "lv_after": la,
                           "to_next": 0 if la >= 99 else max(0, need_for(la, a.a, a.p) - round(after))}
    if a.parts:
        cur = {}
        for kv in a.parts.split(","):
            k, v = kv.split("=")
            cur[k.strip()] = float(v)
        result["parts"] = {}
        for m in MAJORS:
            if m in cur and m in major_gain:
                b, af = cur[m], cur[m] + major_gain[m]
                result["parts"][m] = {"before": round(b), "after": round(af), "lv_before": lv_of(b, a.a, a.p),
                                      "lv_after": lv_of(af, a.a, a.p),
                                      "to_next": max(0, need_for(lv_of(af, a.a, a.p), a.a, a.p) - round(af))}

    if a.json:
        print(json.dumps(result, ensure_ascii=False, indent=1))
        return

    out = []
    for e in entries:
        if e["cardio"]:
            out.append(f"・{e['name']}：有酸素・リカバリーなので 1回 **{e['exp']} EXP**（時間・距離は関係なし）")
            if e["fines"]:
                top = sorted(e["fines"].items(), key=lambda x: -x[1])[:3]
                out.append("　　└ " + "、".join(f"{f} +{v:.0f}" for f, v in top))
            continue
        if not e["reps"]:
            out.append(f"・{e['name']}：回数が読み取れませんでした")
            continue
        load = f"{e['load']:g}kg" + ((f"（体重×{e['coef']:g}" + (f"＋{e['weight']:g}kg" if e["weight"] else "") + "）") if e["coef"] else "")
        out.append(f"・{e['name']} {load} × {e['reps']}回 × {e['sets']}セット = {e['volume']:,.0f}kg"
                   f" × 倍率{e['multiplier']} → **{e['exp']:,} EXP**")
        top = sorted(e["fines"].items(), key=lambda x: -x[1])[:3]
        out.append("　　└ " + "、".join(f"{f} +{v:.0f}" for f, v in top))
    for u in unknown:
        out.append(f"・「{u}」はマスタにない種目でした（EXP計算なし）")
    if gained:
        parts = "と ".join(KANA[m] for m in sorted(major_gain, key=lambda m: -major_gain[m])[:3])
        out.append(f"\n{a.name}は {parts}を きたえた！ {gained:,}ポイントの けいけんちを かくとく！")
    t = result.get("total")
    if t:
        if t["lv_after"] > t["lv_before"]:
            out.append(f"{a.name}の レベルが あがった！ Lv.{t['lv_before']} → Lv.{t['lv_after']}")
        out.append(f"有効EXP {t['before']:,} → {t['after']:,}　つぎの レベルまで あと {t['to_next']:,}ポイント！")
    for m, v in result.get("parts", {}).items():
        up = f"（Lv.{v['lv_before']} → Lv.{v['lv_after']} レベルアップ！）" if v["lv_after"] > v["lv_before"] else ""
        out.append(f"　{m} Lv.{v['lv_after']}：{v['before']:,} → {v['after']:,}　あと {v['to_next']:,}{up}")
    print("\n".join(out))


if __name__ == "__main__":
    main()
