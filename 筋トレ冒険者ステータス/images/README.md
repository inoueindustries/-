# 種目画像

スプシ『筋トレマスタ』のH列（画像URL）から、IMAGE関数で表示する画像です。

| ファイル | 種目 | 出どころ |
|---|---|---|
| ab-roller.png | アブローラー | Canva の画像生成で作成（既存の線画に合わせたスタイル） |
| road-cycling.png | ロードサイクリング | 同上 |
| walking.png | ウォーキング | 同上 |
| sauna.png | サウナ・温冷交代浴 | 同上 |
| bent-over-row.png | ダンベルロウ | 同上 |
| russian-twist.png | ロシアンツイスト | 同上 |
| lying-leg-raise.png | ライイングレッグレイズ | 同上 |
| flutter-kick.png | フラッターキック | 同上 |
| chanz-source.png | アプリの「つよさ」画面のキャラ（元絵） | 本人から受け取ったドット絵 |
| chanz.gif | アプリの「つよさ」画面のキャラ（動くアイコン） | chanz-source.png から `tools/make_avatar_gif.py` で作成（まばたき・胸のライト・呼吸・キラキラ） |

ほかの種目の画像は Wikimedia Commons の運動イラスト（Everkinetic、CC BY-SA 3.0）を直接参照しています。
スプシ側のURLは main ブランチの raw URL（https://raw.githubusercontent.com/inoueindustries/-/main/...）なので、main にマージされてから表示されます。

## 筋トレのアニメ（images/workout/）

アプリの「つよさ」画面の「きょうの しゅぎょう」で使うドット絵です。Codex の画像生成で作られたものを受け取りました。

| ファイル | 中身 |
|---|---|
| pullup-0〜3.png | けんすい（4コマ） |
| pushup-0〜3.png | うでたてふせ（4コマ） |
| squat-0〜3.png | スクワット（4コマ） |
| original/ | 受け取ったままの元データ（420×460のコマ、プレビューGIF、スプライトシート、背景の案3枚） |

アプリ用のコマは、元データを半分の大きさ（210×230）にして色数を減らしたものです。コマの長さは 220／220／320／220 ミリ秒。
元データの README のとおり試作品で、けんすいはコマによってバーの高さが少しずれます。

## 修行の背景（images/scenes/）

ホーム画面の「しゅぎょう期間」の場面に使う背景です。Codex の画像生成で作りました（キャラなし）。Lv が上がるたびに 山 → 滝 → 夕焼け → 月夜 の順に切りかわります。

| ファイル | 中身 |
|---|---|
| mountain.webp | 山の草原 |
| waterfall.webp | 滝と石の舞台 |
| sunset.webp | 夕焼けの台地 |
| night.webp | 月夜の修行場 |

`*.webp` がアプリ用（640×360）、`*-1280.webp` が大きい版です。
