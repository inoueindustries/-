# 筋トレクエスト（iPhone アプリ版）

スマホ保存版（`../app/`）を Capacitor で iPhone アプリにする。アプリの中身は `../app/` と同じ。

アプリだけの機能：

- 記録を OS が消さない保存場所（Preferences）にもしまう。ブラウザの保存領域が消えても、ひらいたときに自動で戻る
- バックアップと CSV を「共有」シートで渡せる（ファイル・LINE・メール・AirDrop）
- 毎日きまった時間に「きょうの しゅぎょう」の通知
- レベルアップで ブルッと ふるえる
- ネットがなくても動く

## Mac でやること（はじめの1回）

### 0. 準備するもの

- Xcode（App Store から。最新版にしておく）
- Node.js 22 以上
  - ターミナルで `node -v` を打って `v22.…` 以上が出れば OK
  - 出なければ https://nodejs.org/ja から「LTS」をダウンロードして入れる
- iPhone 本体と USB ケーブル（自分の iPhone で試すとき）

### 1. このリポジトリを Mac に持ってくる

ターミナルで（どこでもよい。ここではホームの下に作る）：

```
cd ~
git clone https://github.com/inoueindustries/-.git muscle-quest
cd muscle-quest/ios-app
```

※ git を初めて使うと「コマンドライン・デベロッパツールを入れますか」と聞かれることがある。「インストール」を押し、終わったら同じコマンドをもう一度打つ。

### 2. アプリのひな形を作る

```
npm install
npm run setup
npm run open
```

`npm run setup` がやること：

1. `../app` を `www` にコピーする
2. iOS のプロジェクト（`ios/`）を作る
3. アイコン・起動画面を `assets/` から作る
4. Info.plist に「暗号化は使っていない」を書く

`npm run open` で Xcode が開く。

### 3. 自分の iPhone で動かす

1. Xcode の左の一覧で一番上の「App」を選ぶ →「Signing & Capabilities」タブ
2. 「Team」で自分の Apple ID を選ぶ
   - 出てこなければ「Add an Account…」でサインインする
   - 無料の Apple ID でも、自分の iPhone で試すことはできる（7日ごとに入れ直しが必要）
3. 「Bundle Identifier」が `com.inoueindustries.musclequest` になっている
   - 「すでに使われている」と出たら、末尾を変える（例：`.musclequest2`）
4. iPhone をケーブルでつなぐ。Xcode の上のまん中で、つないだ iPhone を選ぶ
5. ▶（Run）を押す
6. はじめての iPhone では、iPhone 側で2つ設定する
   - 「設定 → プライバシーとセキュリティ → デベロッパモード」をオン（再起動する）
   - 「設定 → 一般 → VPNとデバイス管理」で自分の Apple ID を「信頼」

シミュレーター（Mac の画面上の iPhone）で試すなら、4 で「iPhone 16」などを選んで ▶。

## App Store に出す

### 1. Apple Developer Program に登録する

- https://developer.apple.com/programs/ （年会費がかかる）
- 個人で登録すると、ストアの「販売元」に本名が出る。屋号を出したいときは法人登録（D-U-N-S 番号が要る）

### 2. App Store Connect でアプリを作る

https://appstoreconnect.apple.com →「アプリ」→「＋」→「新規App」

| 項目 | 入れるもの |
|---|---|
| プラットフォーム | iOS |
| 名前 | 筋トレクエスト（使われていたら少し変える） |
| 主言語 | 日本語 |
| バンドルID | Xcode と同じもの（先に developer.apple.com の Identifiers で登録が要るときは登録する） |
| SKU | 自由（例：musclequest001） |

### 3. Xcode からアップロードする

1. Xcode の上のまん中で「Any iOS Device (arm64)」を選ぶ
2. メニュー「Product → Archive」
3. 終わると Organizer が開く →「Distribute App」→「App Store Connect」→ 案内どおり進める
4. 数十分すると App Store Connect の「TestFlight」に出る。自分や知り合いに配って試せる（審査前のテスト配布）

### 4. 審査に出す（App Store Connect の画面で入れるもの）

| 項目 | 入れるもの |
|---|---|
| スクリーンショット | iPhone 6.9インチ（1320×2868 など）を3枚以上。シミュレーターの「iPhone 16 Pro Max」で ⌘S で撮れる |
| 説明 | 下のたたき台を使う |
| キーワード | 筋トレ,ドット絵,RPG,レベル,記録,食事,体重,PFC,ダンベル,自重 |
| サポートURL | https://inoueindustries.github.io/-/app/privacy.html （専用ページを作ったら差しかえ） |
| プライバシーポリシーURL | https://inoueindustries.github.io/-/app/privacy.html |
| Appのプライバシー | 「データを収集しない」 |
| 年齢制限 | すべて「なし」→ 4+ |
| 価格 | 無料、または有料（「価格および配信状況」で選ぶ） |
| 審査メモ | 「ログイン不要。記録は端末内のみに保存。最初に名前を入れて『ぼうけんを はじめる』を押すと使えます」 |

説明文のたたき台：

> 筋トレ・ごはん・体重を記録すると、きたえた部位に経験値がたまってレベルが上がる、ドット絵RPG風の記録アプリです。
> ・17の部位ごとに経験値。7日やすむと経験値が減りはじめるので、続ける理由ができます
> ・ダンベル・自重など43種目。重量×回数×セットから経験値を計算
> ・ごはんは食材を選ぶだけでカロリー・たんぱく質を記録。きょう足りない栄養とアドバイスを表示
> ・体重・体脂肪率のグラフ
> ・キャラクターは6人から選べて、服の色も変えられます
> ・登録・ログイン不要。記録はこの端末の中だけに保存します
> ※経験値やアドバイスは記録を楽しく続けるための目安で、医療上の助言ではありません。

## アプリを新しくするとき

アプリの中身（`../app/`）が変わったら：

```
cd ~/muscle-quest
git pull
cd ios-app
npm run sync
```

そのあと：

1. Xcode で「App → General」の「Version」（例：1.0.1）か「Build」（例：2）を1つ上げる
2. 「Product → Archive」からアップロードし直す

## ファイル

- `capacitor.config.json`：アプリの ID・名前・背景色
- `assets/`：アイコン（1024×1024、透明なし）と起動画面の元絵
- `scripts/copy-web.mjs`：`../app` を `www` にコピー
- `scripts/patch-ios.mjs`：Info.plist に書きこむ
- `ios/`・`www/`・`node_modules/` は Mac の中で作るので、git には入れない
