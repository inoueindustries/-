# セミナーPR動画 42秒（作業中・引き継ぎメモ）

正方形1:1・1080×1080・30fps・42.000秒のセミナーPR動画。
新しいセッションでは「動画の続きをやって」と言えば、このメモから再開する。

## いまの状態

- [x] 6シーンの絵コンテ（Claude Design）: https://claude.ai/artifact/HHmn5ayELqSbN47GX9oSWi
- [x] 試作動画（無音・人物は静止画のゆっくりズームのみ）を書き出し済み
- [x] ナレーション＋BGMを合成する仕組み（`audio/build_audio.py`）。仮の音で42.000秒の書き出しを確認済み
- [x] ナレーション音声: Gemini TTS（女性の声・Kore、`gemini-3.1-flash-tts-preview`）で6区間を生成。書き起こしで読み間違いがないことを確認済み
- [x] BGM: 壮大に盛り上がる映画風オーケストラ曲に作り直し（`audio/make_bgm.py`、ボーカルなし・外部音源なし）。29秒で頂点
- [x] 完成版 `out/seminar_pr_42s.mp4`（42.000秒・1080×1080・30fps・AAC 48kHz・-16 LUFS）を書き出し済み。依頼者の確認待ち
- [ ] 人物の実際の動き: 画像→動画生成（台本の PROMPT 1〜6）。この環境ではできない

## 再開手順

```bash
cd video-seminar-pr-42s
# 1. 無音の映像を書き出す（約2分）
node render.mjs video out/silent.mp4
# 2. BGMを作る（オリジナル・約1分）
python3 audio/make_bgm.py out/bgm.wav
# 3. ナレーションを作る（voice/01.wav〜06.wav）
python3 audio/build_audio.py gemini
# 4. BGMと合成して完成版を書き出す（区間からはみ出すと止まる）
python3 audio/build_audio.py mix out/bgm.wav out/silent.mp4 out/seminar_pr_42s.mp4
```

- 声を変える: `GEMINI_VOICE=Aoede`（女性: Kore / Aoede / Leda / Zephyr など）
- 気に入らない区間だけ作り直す: `python3 audio/build_audio.py gemini 2 6`（毎回少しずつ読み方が変わる）
- 回数制限（HTTP 429）が出ても、少し待って同じモデルで作り直す。声質が混ざらないようにするため
- 生成後に前後の無音を切り、文中の間を0.45秒までに詰めている（`MAX_GAP=0.6` などで変更可）
- 話す速さが合わないときは、各シーンの開始秒を `audio/build_audio.py` の `SEGMENTS` と `video/player.html` の `SCENES` の両方で直す
- 依頼者が自分で作った音声を使う場合は `audio/voice/01.wav`〜`06.wav` を置いて手順3を飛ばす
- `out/` と `audio/voice/` は生成物なのでコミットしない

## ファイル

| パス | 中身 |
|---|---|
| `assets/scene1〜6.jpg` | 添付画像から文字のない部分だけを切り出した素材 |
| `video/player.html` | 動画の画面設計。`renderAt(秒)` でその瞬間の画面を描く |
| `render.mjs` | player.html を1コマずつ撮って MP4 にする（Playwright + ffmpeg） |
| `audio/make_bgm.py` | 42秒のオリジナルBGMを合成（Dメジャー・16小節。弦・金管・合唱・太鼓で29秒の頂点へ盛り上がる） |
| `audio/build_audio.py` | Gemini TTS で6区間のナレーションを作り、BGMと合わせて動画に入れる（声の間はBGMを自動で下げる） |

## 台本の要点（制作ルール）

- ナレーション（画面外・女性・温かく落ち着いたプロの語り。冒頭は問いかけ、後半は明るく前向き。営業調は避ける）
  1. 0–8秒: 今の毎日を、少し変えてみたい。そんな思いを、次の一歩につなげませんか。
  2. 8–16秒: 一人では踏み出せなくても、同じ思いの仲間がいれば、挑戦は始められる。
  3. 16–23秒: 新しい出会いから学び、自分の可能性を、少しずつ広げていく。
  4. 23–29秒: 成長したい。仲間と夢を追いたい。その気持ちを、大切に。
  5. 29–34秒: まずは、ズームセミナーでお会いしましょう。
  6. 34–42秒: あなたのこれからを考える、一時間。新しい挑戦を、ここから一緒に。
- 読み: Zoom＝ズーム、一人＝ひとり、一時間＝いちじかん
- 最後の言葉は40.8秒前後までに終え、CTA（Zoomセミナー開催）を約1秒の余韻として残す
- 「1ヶ月で1000人」「1年で1万人」「日本トッププレイヤー」などの数字・実績コピーは、根拠を確認するまで使わない
- 会社名・日時・申込URLは未確認のため入れない（受け取ったら差し替える）
- 完成の条件: 実ファイルを全編再生して、読み・間・最後の切れ・テロップのはみ出しを確認すること

## 激しい版（人材募集PR・`hype/`）

参考動画（チラシ画像をそのまま見せ、光の演出でつなぐ42秒）をもとに、動きと音を強めた版。

- 映像: チラシ5枚をそのまま使い、叩きつけるズーム・画面の揺れ・白フラッシュ・光の筋・集中線・金の粉・花火・文字の叩きつけ（「本気の人だけ、見てほしい。」「本気の人材、求む。」「本気で挑戦する あなただ。」）
- 音: 120BPMの4つ打ちBGM、効果音（ドン／バン／シュッ／キラーン／上昇音／花火）、ナレーション7文。すべてこの環境で合成
- ナレーション: 今は Kokoro（オープンソースの音声合成・Apache-2.0）の男性の声 `jm_kumo`。`VOICE_STYLE=trailer` で低く太い予告編風に加工（音程を約1半音下げ、胸の低音と輪郭を強調、1オクターブ下を薄く重ね、短い残響）。Gemini の鍵がある環境では `narration.py gemini` で差し替えられる（男性なら `GEMINI_VOICE=Fenrir` など）
- 字幕・書き起こし: `narration_ja.srt`（動画編集ソフトやSNSにそのまま読み込める）と `narration_ja.txt`
- 秒数はすべて `hype/timeline.json` で管理。映像（`hype.html`）と音（`audio_hype.py`）の両方がこれを読む

```bash
cd video-seminar-pr-42s/hype
node render.mjs video out/hype_silent.mp4                      # 映像（約2分）
KOKORO_VOICE=jm_kumo SPEED=1.0 python narration.py kokoro out/voice   # または gemini（要: kokoro-onnx, misaki[ja], モデル2ファイル）
VOICE_STYLE=trailer python3 audio_hype.py out/voice out/hype_silent.mp4 out/hype_42s.mp4
```

- ナレーションを差し替えたら、各文の長さが `timeline.json` の次の文の開始までに収まるか確認する（`audio_hype.py` が開始・終了秒を表示する）
- 画像内の「1ヶ月で1000人」「1年で1万人」「日本トッププレイヤー」などの実績表現は依頼者のチラシそのまま。公開前に根拠を確認する
