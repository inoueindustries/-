# Google AI Studio でゲームボイスを作る（夜勤サバイバー）

レベルアップ時のボイス（男性・女性・少年）を、Google AI Studio の音声生成（Gemini TTS）で作るための手順とプロンプト集です。
できた音声ファイルを Claude とのチャットに添付すれば、1セリフずつ切り分けてゲームに組み込みます。

---

## 1. 準備（最初の1回だけ）

1. パソコンかスマホのブラウザで **Google AI Studio**（aistudio.google.com）を開き、Google アカウントでログインする
2. 左のメニューから **Speech / TTS（音声生成）** のページを開く（Gemini の TTS モデルを選ぶ）
3. 声の新規作成で **API キー**の連携を求められたら、画面の案内に従って API キーを作ってリンクする
   - 有料枠を使う場合は、Google 側で支払い設定（少額のチャージ）が必要です
   - 料金の目安：短いセリフなら1回あたり数円程度（動画の話では「1分で約1円」）。最新の料金は画面で確認してください
   - API キーは他人に見せない・チャットに貼らないでください

## 2. 声を作る（Create new voice → Voice design）

「Create new voice（新しい声を作る）」→「**Voice design（声のデザイン）**」を選び、下の「声のレシピ」を1つ貼って作成します。
候補がいくつか出るので、聞き比べて一番イメージに近いものを選び、名前を付けて保存します（保存した声は次回から名前で呼び出せます）。

> 日本語のレシピでも作れますが、うまくいかないときは英語版を使ってください。

### 2-1. 男性の声（名前の例：夜勤_男性）

```
日本のゲームのキャラクターボイス。30代前半の男性で、工場の夜勤で働く頼れる先輩。
明るく張りのある中音域の声。元気で前向き、少しだけ体育会系。
語尾をはっきり言い切る。短いかけ声がかっこよく決まる声。落ち着きもあるが、気合いの入ったセリフでは力強く声を張る。
標準語。ささやき声ではなく、はっきりした発声。
```

```
Japanese video game character voice. A man in his early 30s, a reliable senior coworker on a factory night shift.
Bright, energetic mid-range voice with good projection. Upbeat and positive, slightly sporty.
Clear, confident endings on short shout-like lines. Calm by default, but powerful and fired-up on battle cries.
Standard Japanese (Tokyo accent). Clear voice, not whispery.
```

### 2-2. 女性の声（名前の例：夜勤_女性）

```
日本のゲームのキャラクターボイス。20代の女性で、工場の品質管理を担当するしっかり者。
明るく澄んだ少し高めの声。はきはきして聞き取りやすい。
普段は丁寧でやさしいが、うれしい時は弾むように喜ぶ。決めゼリフでは凛として頼もしい。
標準語。アニメ声すぎず、自然で好感の持てる声。
```

```
Japanese video game character voice. A woman in her 20s, a dependable quality-control staff member at a factory.
Bright, clear, slightly high-pitched voice. Crisp and easy to understand.
Polite and gentle by default, bouncy and joyful when happy, dignified and confident on her signature line.
Standard Japanese (Tokyo accent). Natural and likable, not overly anime-like.
```

### 2-3. 少年の声（名前の例：夜勤_少年）

```
日本のゲームのキャラクターボイス。10歳くらいの元気な男の子。工場見学に来て、夜勤を手伝っている設定。
高めでよく通る、わんぱくな声。いつもワクワクしていて、語尾が少し伸びる。
うれしい時は飛び跳ねるように叫ぶ。必殺技のセリフでは全力で声を張る。
標準語。子どもらしい自然な発声。
```

```
Japanese video game character voice. An energetic boy around 10 years old, visiting a factory and helping out on the night shift.
High, bright, clear and mischievous voice. Always excited, slightly stretches the ends of words.
Shouts joyfully when happy, and yells with full power on his special-move line.
Standard Japanese (Tokyo accent). Natural childlike delivery.
```

## 3. セリフを読ませる（台本）

作った声を選び、下の台本を貼って生成します。
**1つの声につき1ファイル**にまとめて作ってください（セリフの間に約1.5秒の間を入れてもらい、あとで Claude が切り分けます）。

最初の行は「読み方の指示」です。うまくいかない時は、この指示部分を外して台本だけにしてください。

### 3-1. 男性（夜勤_男性）

```
読み方の指示：ゲームのレベルアップ時のボイスとして、1行ずつ、行と行の間に1.5秒ほど間を空けて読んでください。どれも短く、元気よく、語尾をはっきりと。最後の行だけは気合いを込めて力強く叫んでください。

よし、レベルアップだ！
まだまだいけるぞ！
改善完了！
おっ、ラッキー！
ツイてるぞ！
覚醒！ 全力でいくぞ！
```

### 3-2. 女性（夜勤_女性）

```
読み方の指示：ゲームのレベルアップ時のボイスとして、1行ずつ、行と行の間に1.5秒ほど間を空けて読んでください。明るくはきはきと。4行目と5行目はうれしそうに弾むように。最後の行は凛として頼もしく。

レベルアップ！
いい調子です！
改善、完了です！
ラッキー！
やったね！
覚醒！ 見せてあげる！
```

### 3-3. 少年（夜勤_少年）

```
読み方の指示：ゲームのレベルアップ時のボイスとして、1行ずつ、行と行の間に1.5秒ほど間を空けて読んでください。わんぱくに、ワクワクした感じで。4行目と5行目は飛び跳ねるように大喜びで。最後の行は必殺技のように全力で叫んでください。

やったー！ レベルアップ！
強くなったぞ！
まだまだー！
ラッキー！ やったぁ！
ツイてるー！
かくせい！ いっけぇー！
```

### 調整のコツ

- **テンションを上げたい**：「読み方の指示」に「もっとテンション高めに」「叫ぶように」を足す
- **自然さを出したい**：「少し息を吸ってから言う」「笑いながら」などを足す（入れすぎると不自然になりやすいです）
- **1行だけ気に入らない**：その行だけで作り直してもOK（ファイル名に「男性_3行目」のように書いてください）
- **作り直しは安い**ので、気に入るまで何回か試してみてください

## 4. ゲームに入れる

1. できた音声をダウンロードする（WAV でも MP3 でも OK）
2. ファイル名を「男性.wav」「女性.wav」「少年.wav」のようにする
3. Claude とのチャットに添付して「ボイス入れて」と伝える

Claude が、無音部分で1セリフずつに切り分け、音量をそろえて `vansaba/voice/` に置き、ゲームのボイス設定（男性・女性・少年）に登録します。
公開ページ（Claude のページと GitHub Pages）にも反映します。

## 注意

- AI で作った声には Google の電子透かしが入ります（合成音声であることが分かる仕組み）
- **自分の声のコピー（Voice replication）** は、本人の声で、本人が同意文を読んで登録する機能です。他人の声を無断で登録しないでください
- 作った声の保存期間には上限があります（動画では「1年」）。気に入った音声はファイルで手元に残しておくと安心です
- 料金や画面の名前は変わることがあります。見つからない時は画面を Claude に見せてください
