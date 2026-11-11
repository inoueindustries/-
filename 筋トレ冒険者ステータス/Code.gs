/**
 * 筋トレ冒険者ステータス（Google Apps Script Webアプリ）
 *
 * スプシ『食事・運動・体組成ログ_まとめ』をデータベースとして読み、
 * ドラクエ風のステータス画面をスマホ／PCのブラウザに表示します。
 *
 * 外から呼ぶ関数（それ以外は QS の中に閉じ込めて、既存GASと名前がぶつからないようにしています）
 *   doGet()               … Webアプリの入口（?format=json でJSONも返す）
 *   getStatusJson()       … 画面の「さいしんの じょうほう」ボタンから呼ばれる
 *   recordDailySnapshot() … 今日の部位別有効EXPを『EXP日次履歴ログ』に1行記録（毎晩トリガー）
 *   setupDailyTrigger()   … 上の記録を毎晩23時台に自動実行するトリガーを作る（最初に1回だけ実行）
 *   backfillHistory()     … 過去90日分の履歴をトレーニングログから再計算して埋める（最初に1回だけ実行）
 */

const QS_CONFIG = {
  // スプシに紐づいたGAS（拡張機能 → Apps Script で作った場合）なら空でもOK
  SPREADSHEET_ID: '12XB0Ye3BNMW1jcXyGaBrtQHHczCjL5PHkMS5TxBTjOE',
  PLAYER_NAME: 'ちゃんズ',
  TIMEZONE: 'Asia/Tokyo',

  SHEET_LOG: 'トレーニング・運動ログ',
  SHEET_MASTER: '経験値・部位負荷マスタ',
  SHEET_BODY: '体組成ログ',
  SHEET_HISTORY: 'EXP日次履歴ログ',
  SHEET_STATUS: 'ドラクエ風ステータス・EXP',   // ここの「Lv曲線 係数／乗数」「100%維持期間」「8日目〜減衰率」があればそちらを優先

  // 減衰ルール（スプシの設定と同じ：7日間は100%維持 → 8日目から1日5%ずつ減 → 27日で0%）
  // ※ スプシ『ドラクエ風ステータス・EXP』の設定セルが読めたときは、そちらの値で上書きされます
  KEEP_DAYS: 7,
  DECAY_PER_DAY: 0.05,

  // レベル曲線：Lv n に必要な有効EXP = CURVE_A × (n-1)^CURVE_P
  // ※ スプシの「Lv曲線 係数」「Lv曲線 乗数」セルが読めたときは、そちらの値で上書きされます
  // 1.5乗にすると、Lvが上がるほど次のLvまでの必要EXPが増える
  // （スプシの「100EXPごとに1Lv」で Lv42 だった約4,200EXP が、ほぼ Lv42 のまま残るように合わせています）
  CURVE_A: 15.9,
  CURVE_P: 1.5,
  MAX_LV: 999,
  MAJOR_CURVE_SCALE: 1,       // 大部位Lv：総合と同じ曲線（同じEXPなら同じLv）
  FINE_CURVE_SCALE: 1,        // 17部位Lv：総合と同じ曲線

  TREND_DAYS: 30,             // 推移グラフに出す日数
  BACKFILL_DAYS: 90,

  // 称号（総合Lvで決まる）。スプシの称号テーブル（必要Lv／称号）が読めればそちらを使う
  TITLES: [[1, 'みならい冒険者'], [10, 'かけだし武闘家'], [20, '歴戦の戦士'], [30, '剛腕バトルマスター'], [40, '無敵のパラディン'], [50, '神域のゴッドハンド'],
      [70, '鋼の覇王'], [100, '伝説の筋肉勇者'], [150, '天を突く巨人'], [200, '大地を揺らす豪傑'], [300, '星をも砕く拳聖'], [500, '神話に刻まれし者'], [700, '天地創造の筋神'], [999, '筋肉の神（カンスト）']],
  // 職業（いちばん鍛えている大部位で決まる）。全部位がバランスよく育つと上級職へ転職
  JOBS: {
    '肩': '鉄壁の盾兵',
    '胸': '重装の騎士',
    '背中': '鬼背の拳士',
    '腕': '剛腕の剣士',
    '脚': '大地の守護者',
    '腹筋': '鋼の体幹師',
  },
  UPPER_JOB: '万能の勇者',
  UPPER_JOB_MIN_LV: 10,       // 6大部位すべてがこのLv以上
  UPPER_JOB_BALANCE: 0.5,     // いちばん弱い部位のEXPが、いちばん強い部位の50%以上
};

function doGet(e) {
  const p = (e && e.parameter) || {};
  // 専用アプリ（スマホのホーム画面に置く版）用：setupAppKey で合言葉を作ったあとは、合言葉つきのURLでしか読めない
  const appKey = PropertiesService.getScriptProperties().getProperty('APP_KEY');
  if (appKey && p.key !== appKey) {
    return ContentService.createTextOutput(JSON.stringify({ error: '合言葉がちがいます' }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  // 専用アプリ用：スプシの生の値だけを返す。計算と画面はアプリ（GitHub Pages）側で行うので、
  // アプリの機能を足しても このスクリプトの再デプロイは いらない。r=範囲（A1形式）を いくつでも
  if (p.format === 'ranges') {
    if (!appKey) return ContentService.createTextOutput(JSON.stringify({ error: '先に setupAppKey を実行してください' })).setMimeType(ContentService.MimeType.JSON);
    const book = SpreadsheetApp.openById(QS_CONFIG.SPREADSHEET_ID);
    const out = ((e.parameters && e.parameters.r) || []).slice(0, 12).map(a1 => {
      try {
        const v = book.getRange(a1).getDisplayValues();
        let n = v.length;
        while (n > 0 && v[n - 1].every(c => c === '')) n--;   // 下の空行は送らない
        return v.slice(0, n);
      } catch (err) { return null; }
    });
    return ContentService.createTextOutput(JSON.stringify({ ranges: out })).setMimeType(ContentService.MimeType.JSON);
  }
  if (p.action === 'add') {   // 専用アプリからの記録（合言葉つきURLのときだけ）
    if (!appKey) return ContentService.createTextOutput(JSON.stringify({ error: '先に setupAppKey を実行してください' })).setMimeType(ContentService.MimeType.JSON);
    return ContentService.createTextOutput(addLogEntry(p)).setMimeType(ContentService.MimeType.JSON);
  }
  if (p.action === 'update' || p.action === 'delete') {   // 専用アプリからの なおし・とりけし（合言葉つきURLのときだけ）
    if (!appKey) return ContentService.createTextOutput(JSON.stringify({ error: '先に setupAppKey を実行してください' })).setMimeType(ContentService.MimeType.JSON);
    return ContentService.createTextOutput(p.action === 'update' ? updateLogEntry(p) : deleteLogEntry(p)).setMimeType(ContentService.MimeType.JSON);
  }
  if (p.format === 'json') {
    return ContentService.createTextOutput(getStatusJson())
      .setMimeType(ContentService.MimeType.JSON);
  }
  const t = HtmlService.createTemplateFromFile('index');
  t.boot = getStatusJson().replace(/</g, '\\u003c');
  return t.evaluate()
    .setTitle('筋トレ冒険者ステータス')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .addMetaTag('apple-mobile-web-app-capable', 'yes')
    .addMetaTag('mobile-web-app-capable', 'yes');
}

/** 専用アプリ用の「合言葉つきURL」を作る。1回実行して、実行ログに出たURLをアプリに貼る。もう一度実行すると合言葉が変わり、前のURLは使えなくなる */
function setupAppKey() {
  const key = Utilities.getUuid().replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty('APP_KEY', key);
  // エディタから実行すると getUrl() はテスト用（/dev）のURLを返すので、URLは作らず合言葉だけを出す
  Logger.log('▼ あいことば（アプリの ② に貼ってください）\nkey=' + key +
    '\n\n① に貼るURLは「デプロイ → デプロイを管理」に出る、/exec で終わる「ウェブアプリ URL」です');
}

/**
 * 専用アプリ用の 書きこみ口（POST）。本文は JSON：{ key, sheet, ops:[{ row, set, guard, unlessDate, flushAfter }] }
 *  - sheet：書きこむシート名（トレーニングログ・体組成ログ・食事ログ だけ）
 *  - row：行番号、または "append:列番号"（その列に値が入っている最後の行の 次の行）
 *  - set：{ 列番号: 値 }。値が "date:2026/11/11" なら日付、"" なら空にする、"=" で始まれば式（{r} は行番号に置きかわる）
 *  - guard：{ 列番号: 値 }。書く前に その行の中身が これと同じか たしかめる（ちがえば 何もしない）
 *  - unlessDate：{ col, date }。その列に その日付が もう あれば、この op は とばす
 * アプリの機能を足しても このスクリプトを貼りかえなくて すむように、中身を知らない はんよう的な作りに してある
 */
function doPost(e) {
  const out = o => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const appKey = PropertiesService.getScriptProperties().getProperty('APP_KEY');
    if (!appKey) return out({ error: '先に setupAppKey を実行してください' });
    if (body.key !== appKey) return out({ error: '合言葉がちがいます' });
    const allowed = [QS_CONFIG.SHEET_LOG, QS_CONFIG.SHEET_BODY, '食事・PFCログ'];
    if (allowed.indexOf(body.sheet) < 0) return out({ error: 'このシートには書きこめません' });
    const book = SpreadsheetApp.openById(QS_CONFIG.SPREADSHEET_ID);
    const sh = book.getSheetByName(body.sheet);
    if (!sh) return out({ error: 'シートが見つかりません' });
    const tz = book.getSpreadsheetTimeZone();
    const asText = v => (v instanceof Date ? 'date:' + Utilities.formatDate(v, tz, 'yyyy/MM/dd') : String(v).trim());
    const toValue = (v, r) => {
      const m = typeof v === 'string' && v.match(/^date:(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
      if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
      return typeof v === 'string' ? v.replace(/\{r\}/g, String(r)) : v;
    };
    const lock = LockService.getScriptLock(); lock.waitLock(10000);
    const rows = [];
    try {
      (body.ops || []).slice(0, 10).forEach(op => {
        if (op.unlessDate) {
          const col = sh.getRange(1, Number(op.unlessDate.col), sh.getMaxRows(), 1).getValues();
          if (col.some(x => asText(x[0]) === 'date:' + op.unlessDate.date)) { rows.push(null); return; }
        }
        let row = Number(op.row);
        const ap = String(op.row).match(/^append:(\d+)$/);
        if (ap) {
          const col = sh.getRange(1, Number(ap[1]), sh.getMaxRows(), 1).getValues();
          let last = 0;
          for (let i = 0; i < col.length; i++) if (String(col[i][0]).trim() !== '') last = i + 1;
          row = last + 1;
        }
        if (!(row >= 2 && row <= sh.getMaxRows())) throw new Error('行が正しくありません');
        Object.keys(op.guard || {}).forEach(c => {
          if (asText(sh.getRange(row, Number(c)).getValue()) !== String(op.guard[c]).trim()) throw new Error('きろくが かわっています。よみこみ直してから もういちど ためしてください');
        });
        const flushAfter = (op.flushAfter || []).map(Number);
        Object.keys(op.set || {}).map(Number).sort((a, b) => a - b).forEach(c => {
          const v = op.set[c];
          if (v === '' || v == null) sh.getRange(row, c).clearContent(); else putCell_(sh, row, c, toValue(v, row));
          if (flushAfter.indexOf(c) >= 0) SpreadsheetApp.flush();
        });
        rows.push(row);
      });
      SpreadsheetApp.flush();
    } finally { lock.releaseLock(); }
    return out({ ok: true, rows });
  } catch (err) {
    return out({ error: String(err && err.message || err) });
  }
}

/** ---- トレーニングログへの書きこみ（足す・なおす・とりけす）。式の入った列（E・I〜K・M〜Q）には さわらない ---- */
function logSheet_() {
  return SpreadsheetApp.openById(QS_CONFIG.SPREADSHEET_ID).getSheetByName(QS_CONFIG.SHEET_LOG);
}
// 入力規則（プルダウン）で はじかれたら、そのセルだけ 規則を いったん外して書き、すぐ もどす
function putCell_(sh, r, c, v) {
  const cell = sh.getRange(r, c);
  try { cell.setValue(v); } catch (e) {
    const rule = cell.getDataValidation();
    cell.clearDataValidations();
    try { cell.setValue(v); } finally { if (rule) cell.setDataValidation(rule); }
  }
}
function parseRec_(p) {
  const ex = String(p.ex || '').trim();
  const m = String(p.date || '').match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
  if (!ex || !m) throw new Error('日付か種目が正しくありません');
  const data = QS.loadData();
  const key = Object.keys(data.names).filter(k => data.names[k] === ex)[0];
  if (!key) throw new Error('マスタにない種目です：' + ex);
  const num = v => (v === '' || v == null || isNaN(Number(v)) ? '' : Number(v));
  const w = num(p.w), r = num(p.r), s = num(p.s);
  if ((w !== '' && (w < 0 || w > 500)) || (r !== '' && (r < 0 || r > 1000)) || (s !== '' && (s < 1 || s > 50))) throw new Error('数字が大きすぎます');
  return { date: new Date(+m[1], +m[2] - 1, +m[3]), part: data.parts[key] || '', ex, w: w === '' ? 0 : w, r, s: s === '' ? 1 : s, memo: String(p.memo || '').slice(0, 100) };
}
// 種目のプルダウンは「部位」を書いたあとに 中身が決まるので、部位を先に確定させてから 種目を書く
function writeLogRow_(sh, row, rec) {
  putCell_(sh, row, 2, rec.date);
  putCell_(sh, row, 3, rec.part);
  SpreadsheetApp.flush();
  putCell_(sh, row, 4, rec.ex);
  putCell_(sh, row, 6, rec.w);
  putCell_(sh, row, 7, rec.r);
  putCell_(sh, row, 8, rec.s);
  putCell_(sh, row, 12, rec.memo);
  SpreadsheetApp.flush();
}
// なおす・とりけす行が、アプリで見ていた きろくと 同じか たしかめる（行が ずれていたら 何もしない）
function checkLogRow_(sh, row, p) {
  if (!(row >= 2 && row <= sh.getMaxRows())) throw new Error('行が正しくありません');
  const v = sh.getRange(row, 2, 1, 3).getValues()[0];
  const tz = sh.getParent().getSpreadsheetTimeZone();
  const d = v[0] instanceof Date ? Utilities.formatDate(v[0], tz, 'yyyy/MM/dd') : String(v[0]);
  if (String(v[2]).trim() !== String(p.ex0 || '').trim() || d !== String(p.date0 || '')) throw new Error('きろくが かわっています。よみこみ直してから もういちど ためしてください');
}
function withLogLock_(fn, p) {
  try {
    const lock = LockService.getScriptLock(); lock.waitLock(10000);
    try { fn(logSheet_()); } finally { lock.releaseLock(); }
    if (p && p.lite) return JSON.stringify({ ok: true });   // 専用アプリは このあと 自分で読み直して計算する
    return getStatusJson();
  } catch (err) {
    return JSON.stringify({ error: String(err && err.message || err) });
  }
}
/** 1行足す。{date:'2026/11/10', ex:'種目名', w:重量, r:回数, s:セット数, memo:'時間・距離'}。足したあとの最新ステータスを返す */
function addLogEntry(p) {
  return withLogLock_(sh => {
    const rec = parseRec_(p);
    // 種目(D)が入っている最後の行の、次の行に書く
    const bd = sh.getRange(2, 2, sh.getMaxRows() - 1, 3).getValues();
    let last = -1;
    for (let i = 0; i < bd.length; i++) if (String(bd[i][2]).trim() !== '') last = i;
    const row = last + 3;
    if (row > sh.getMaxRows()) throw new Error('ログの行が いっぱいです');
    writeLogRow_(sh, row, rec);
  }, p);
}
/** 1行なおす。addLogEntry の中身に加えて {row:行番号, ex0:もとの種目名, date0:'もとの日付 yyyy/MM/dd'} */
function updateLogEntry(p) {
  return withLogLock_(sh => {
    const rec = parseRec_(p), row = Number(p.row);
    checkLogRow_(sh, row, p);
    writeLogRow_(sh, row, rec);
  }, p);
}
/** 1行とりけす（入力した列だけ 空にする）。{row, ex0, date0} */
function deleteLogEntry(p) {
  return withLogLock_(sh => {
    const row = Number(p.row);
    checkLogRow_(sh, row, p);
    sh.getRange(row, 2, 1, 3).clearContent();
    sh.getRange(row, 6, 1, 3).clearContent();
    sh.getRange(row, 12).clearContent();
    SpreadsheetApp.flush();
  }, p);
}

function getStatusJson() {
  try {
    return JSON.stringify(QS.buildStatus(QS.loadData(), QS.today()));
  } catch (err) {
    return JSON.stringify({ error: String(err && err.message || err) });
  }
}

function recordDailySnapshot() {
  const data = QS.loadData();
  QS.writeHistoryRows(data, [QS.today()]);
}

function backfillHistory() {
  const data = QS.loadData();
  const t = QS.today();
  const days = [];
  for (let d = t - QS_CONFIG.BACKFILL_DAYS + 1; d <= t; d++) days.push(d);
  QS.writeHistoryRows(data, days);
}

function setupDailyTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(tr => tr.getHandlerFunction() === 'recordDailySnapshot')
    .forEach(tr => ScriptApp.deleteTrigger(tr));
  ScriptApp.newTrigger('recordDailySnapshot')
    .timeBased().everyDays(1).atHour(23).nearMinute(30)
    .inTimezone(QS_CONFIG.TIMEZONE).create();
}

const QS = (() => {
  const C = QS_CONFIG;

  // 6大部位と17部位の対応
  const MAJORS = [
    { key: '肩', kana: 'かた', icon: '🛡️', words: /肩/, fines: ['僧帽筋(上部)', '三角筋(前部)', '三角筋(中部)', '三角筋(後部)'] },
    { key: '胸', kana: 'むね', icon: '💠', words: /胸/, fines: ['大胸筋(上部)', '大胸筋(中部)', '大胸筋(下部)'] },
    { key: '背中', kana: 'せなか', icon: '🦅', words: /背/, fines: ['広背筋', '僧帽筋(中下部)/起立筋'] },
    { key: '腕', kana: 'うで', icon: '⚔️', words: /腕/, fines: ['上腕二頭筋', '上腕三頭筋', '前腕/腕橈骨筋'] },
    { key: '脚', kana: 'あし', icon: '🦵', words: /脚|足|尻|臀|下半身/, fines: ['大腿四頭筋', 'ハム/大臀筋', 'ふくらはぎ'] },
    { key: '腹筋', kana: 'ふっきん', icon: '🔥', words: /腹|体幹/, fines: ['腹直筋', '腹斜筋/腹横筋'] },
  ];
  const FINE_TO_MAJOR = {};
  MAJORS.forEach(m => m.fines.forEach(f => { FINE_TO_MAJOR[f] = m.key; }));
  const FINES = MAJORS.reduce((a, m) => a.concat(m.fines), []);

  // マスタの見出し → 17部位名（上から順に判定。順番に意味があります）
  const FINE_MATCHERS = [
    ['僧帽筋(中下部)/起立筋', s => (/僧帽/.test(s) && /中|下/.test(s)) || /起立/.test(s)],
    ['僧帽筋(上部)', s => /僧帽/.test(s)],
    ['三角筋(前部)', s => /三角/.test(s) && /前/.test(s)],
    ['三角筋(中部)', s => /三角/.test(s) && /中|横/.test(s)],
    ['三角筋(後部)', s => /三角/.test(s) && /後/.test(s)],
    ['大胸筋(上部)', s => /胸/.test(s) && /上/.test(s)],
    ['大胸筋(中部)', s => /胸/.test(s) && /中/.test(s)],
    ['大胸筋(下部)', s => /胸/.test(s) && /下/.test(s)],
    ['広背筋', s => /広背/.test(s)],
    ['上腕二頭筋', s => /二頭/.test(s)],
    ['上腕三頭筋', s => /三頭/.test(s) && !/下腿/.test(s)],
    ['前腕/腕橈骨筋', s => /前腕|腕橈/.test(s)],
    ['大腿四頭筋', s => /四頭/.test(s)],
    ['ハム/大臀筋', s => /ハム|臀/.test(s)],
    ['ふくらはぎ', s => /ふくらはぎ|下腿|腓腹|カーフ/.test(s)],
    ['腹直筋', s => /腹直/.test(s)],
    ['腹斜筋/腹横筋', s => /腹斜|腹横/.test(s)],
  ];

  const norm = v => String(v == null ? '' : v)
    .replace(/[（]/g, '(').replace(/[）]/g, ')').replace(/[\s　]/g, '');

  // ---------- 日付 ----------
  function dayNumFromYMD(y, m, d) { return Math.floor(Date.UTC(y, m - 1, d) / 86400000); }
  function toDayNum(v) {
    if (v instanceof Date && !isNaN(v)) {
      const s = Utilities.formatDate(v, C.TIMEZONE, 'yyyy-MM-dd').split('-');
      return dayNumFromYMD(+s[0], +s[1], +s[2]);
    }
    if (typeof v === 'number' && v > 30000 && v < 80000) {  // シリアル値
      return v - 25569;
    }
    const m = String(v || '').match(/(\d{4})[\/\-.年](\d{1,2})[\/\-.月](\d{1,2})/);
    return m ? dayNumFromYMD(+m[1], +m[2], +m[3]) : null;
  }
  function today() { return toDayNum(new Date()); }
  function fmt(dayNum, withYear) {
    const d = new Date(dayNum * 86400000);
    const mm = d.getUTCMonth() + 1, dd = d.getUTCDate();
    return withYear ? `${d.getUTCFullYear()}/${pad(mm)}/${pad(dd)}` : `${mm}/${dd}`;
  }
  const pad = n => (n < 10 ? '0' : '') + n;

  // ---------- 読み込み ----------
  function openBook() {
    return C.SPREADSHEET_ID ? SpreadsheetApp.openById(C.SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  }

  function findHeaderRow(values, test, maxRows) {
    for (let r = 0; r < Math.min(maxRows || 10, values.length); r++) {
      if (test(values[r].map(norm))) return r;
    }
    return -1;
  }
  const findCol = (header, re, fallback) => {
    const i = header.findIndex(h => re.test(h));
    return i >= 0 ? i : fallback;
  };

  function loadMaster(book) {
    const sh = book.getSheetByName(C.SHEET_MASTER);
    const master = {};
    const multipliers = {};
    const labels = {};   // 17部位の表示名（マスタの見出しをそのまま使う）
    const guides = {};   // 種目ごとの推奨負荷の目安
    const hows = {};     // 種目ごとのフォームのコツ
    const names = {};    // 種目名（表示用）
    const parts = {};    // 種目の大部位
    if (!sh) return { master, multipliers, labels, guides, hows, names, parts, partCols: 0 };
    const v = sh.getDataRange().getValues();
    const hr = findHeaderRow(v, h => h.some(x => /種目/.test(x)) &&
      h.filter(x => FINE_MATCHERS.some(m => m[1](x))).length >= 5, 15);
    if (hr < 0) return { master, multipliers, labels, guides, hows, names, parts, partCols: 0 };
    const header = v[hr].map(norm);
    const exCol = findCol(header, /種目/, 0);
    const mulCol = findCol(header, /倍率/, -1);
    const guideCol = findCol(header, /目安/, -1);
    const howCol = findCol(header, /コツ/, -1);
    const partCol = findCol(header, /^大部位$/, -1);
    const cols = [];   // [colIndex, fineName]
    const used = {};
    header.forEach((h, i) => {
      if (i === exCol || i === mulCol || i === guideCol || i === howCol || !h) return;
      const hit = FINE_MATCHERS.find(m => !used[m[0]] && m[1](h));
      if (!hit) return;
      // 中身が数字の列だけを配分列として扱う
      const nums = v.slice(hr + 1).filter(row => row[i] !== '' && row[i] != null);
      if (nums.length && nums.filter(row => !isNaN(Number(row[i]))).length / nums.length < 0.8) return;
      used[hit[0]] = true;
      labels[hit[0]] = String(v[hr][i]).trim();
      cols.push([i, hit[0]]);
    });
    v.slice(hr + 1).forEach(row => {
      const ex = norm(row[exCol]);
      if (!ex) return;
      names[ex] = String(row[exCol]).trim();
      if (partCol >= 0) parts[ex] = String(row[partCol] || '').trim();
      const ratios = {};
      let sum = 0;
      cols.forEach(([i, f]) => {
        let x = Number(row[i]) || 0;
        if (x > 1.5) x = x / 100;     // 85 と書かれていたら 0.85 とみなす
        if (x > 0) { ratios[f] = x; sum += x; }
      });
      if (sum > 0) master[ex] = ratios;
      if (mulCol >= 0 && Number(row[mulCol]) > 0) multipliers[ex] = Number(row[mulCol]);
      if (guideCol >= 0 && String(row[guideCol] || '').trim()) guides[ex] = String(row[guideCol]).trim();
      if (howCol >= 0 && String(row[howCol] || '').trim()) hows[ex] = String(row[howCol]).trim();
    });
    return { master, multipliers, labels, guides, hows, names, parts, partCols: cols.length };
  }

  function loadLog(book, multipliers) {
    const sh = book.getSheetByName(C.SHEET_LOG);
    if (!sh) throw new Error(`シート『${C.SHEET_LOG}』が見つかりません`);
    const v = sh.getDataRange().getValues();
    let hr = findHeaderRow(v, h => h.some(x => /日付/.test(x)) && h.some(x => /種目/.test(x)), 10);
    const header = hr >= 0 ? v[hr].map(norm) : [];
    // 見出しが見つからないときは引き継ぎ書の列配置（B日付 C部位 D種目名 K総ボリューム N基礎獲得EXP）
    const col = {
      date: findCol(header, /日付/, 1),
      part: findCol(header, /^(大)?部位$|^部位/, 2),
      ex: findCol(header, /種目/, 3),
      vol: findCol(header, /総ボリューム/, 10),
      exp: findCol(header, /基礎.*EXP|獲得EXP/, 13),
      w: findCol(header, /^重量/, 5), r: findCol(header, /^回数/, 6), s: findCol(header, /^セット/, 7),
      memo: findCol(header, /時間|距離/, 11),
    };
    const recent = [];   // シートの行番号つきの きろく（アプリで なおす・けす ために使う）
    const entries = [];
    const last = {};   // 種目ごとの さいごの記録（記録フォームの初期値に使う）
    v.slice(hr + 1).forEach((row, i) => {
      const day = toDayNum(row[col.date]);
      if (day == null) return;
      const exn = norm(row[col.ex]);
      if (exn) recent.push({ row: hr + i + 2, date: fmt(day, true), part: norm(row[col.part]), ex: exn, w: Number(row[col.w]) || 0, r: Number(row[col.r]) || null, s: Number(row[col.s]) || 1, memo: norm(row[col.memo]) });
      if (exn && (!last[exn] || day >= last[exn].day)) last[exn] = { day, date: fmt(day), w: Number(row[col.w]) || 0, r: Number(row[col.r]) || null, s: Number(row[col.s]) || 1 };
      const ex = norm(row[col.ex]);
      let exp = Number(row[col.exp]);
      if (!(exp > 0) && multipliers[ex] && Number(row[col.vol]) > 0) {
        exp = Number(row[col.vol]) * multipliers[ex];
      }
      if (!(exp > 0)) return;
      entries.push({ day, ex, part: norm(row[col.part]), exp });
    });
    entries.sort((a, b) => a.day - b.day);
    entries.last = last;
    entries.recent = recent.slice(-15).reverse();
    return entries;
  }

  function loadBody(book) {
    try {
      const sh = book.getSheetByName(C.SHEET_BODY);
      if (!sh) return null;
      const v = sh.getDataRange().getValues();
      const hr = findHeaderRow(v, h => h.some(x => /日付/.test(x)) && h.some(x => /体重/.test(x)), 10);
      if (hr < 0) return null;
      const header = v[hr].map(norm);
      const dc = findCol(header, /日付/, 0);
      const wc = findCol(header, /体重/, -1);
      const fc = findCol(header, /体脂肪率/, findCol(header, /体脂肪/, -1));
      const mc = findCol(header, /筋肉率/, -1);
      const rows = v.slice(hr + 1)
        .map(r => ({ day: toDayNum(r[dc]), w: Number(r[wc]) || null, m: mc >= 0 ? (Number(r[mc]) || null) : null, f: fc >= 0 ? (Number(r[fc]) || null) : null }))
        .filter(r => r.day != null && r.w);
      if (!rows.length) return null;
      rows.sort((a, b) => a.day - b.day);
      const pct = x => (x != null && x < 1 ? x * 100 : x);  // 0.18 → 18%
      const last = rows[rows.length - 1], first = rows[0];
      return {
        date: fmt(last.day, true),
        weight: last.w, fat: pct(last.f),
        weightFromStart: last.w - first.w,
        fatFromStart: last.f != null && first.f != null ? pct(last.f) - pct(first.f) : null,
        startDate: fmt(first.day, true),
        series: rows.slice(-60).map(r => ({ d: fmt(r.day), w: r.w, f: pct(r.f), m: pct(r.m) })),
      };
    } catch (e) {
      return null;
    }
  }

  /** 『ドラクエ風ステータス・EXP』の設定セル（見出しの右隣の数字）を読んで QS_CONFIG を上書きする */
  function loadSettings(book) {
    const sh = book.getSheetByName(C.SHEET_STATUS);
    if (!sh) return;
    const v = sh.getDataRange().getValues().slice(0, 40);
    const pick = re => {
      for (const row of v) {
        for (let i = 0; i < row.length - 1; i++) {
          if (re.test(norm(row[i])) && typeof row[i + 1] === 'number') return row[i + 1];
        }
      }
      return null;
    };
    const a = pick(/^Lv曲線係数/), p = pick(/^Lv曲線乗数/);
    const keep = pick(/^100%維持期間/), decay = pick(/^8日目.*減衰率/);
    if (a > 0) C.CURVE_A = a;
    if (p > 0) C.CURVE_P = p;
    if (keep != null && keep >= 0) C.KEEP_DAYS = keep;
    if (decay > 0 && decay < 1) C.DECAY_PER_DAY = decay;
    // 称号テーブル：「必要Lv」「称号」の見出しの下を読む
    for (let r = 0; r < v.length; r++) {
      const row = v[r].map(norm), c = row.indexOf('必要Lv');
      if (c < 0 || row[c + 1] !== '称号') continue;
      const t = [];
      for (let k = r + 1; k < v.length; k++) {
        const lv = Number(v[k][c]), name = String(v[k][c + 1] || '').trim();
        if (!(lv > 0) || !name) break;
        t.push([lv, name]);
      }
      if (t.length) C.TITLES = t;
      break;
    }
  }

  function loadData() {
    const book = openBook();
    loadSettings(book);
    const m = loadMaster(book);
    return { master: m.master, labels: m.labels, guides: m.guides, hows: m.hows, names: m.names, parts: m.parts, entries: loadLog(book, m.multipliers), body: loadBody(book), partCols: m.partCols };
  }

  // ---------- 計算 ----------
  const retention = elapsed => (elapsed < 0 ? 0 : elapsed <= C.KEEP_DAYS ? 1 :
    Math.max(0, 1 - (elapsed - C.KEEP_DAYS) * C.DECAY_PER_DAY));

  function majorOfPart(part) {
    const m = MAJORS.find(x => x.words.test(part));
    return m ? m.key : null;
  }

  /** day 時点のスナップショット（day より後の記録は無視） */
  function snapshot(data, day) {
    const s = { eff: 0, cum: 0, fine: {}, major: {} };
    FINES.forEach(f => { s.fine[f] = { eff: 0, cum: 0, last: null }; });
    MAJORS.forEach(m => { s.major[m.key] = { eff: 0, cum: 0, last: null }; });
    data.entries.forEach(en => {
      if (en.day > day) return;
      const eff = Math.round(en.exp * retention(day - en.day));   // スプシのQ列と同じく1行ごとに四捨五入
      s.eff += eff; s.cum += en.exp;
      const ratios = data.master[en.ex];
      if (ratios) {
        Object.keys(ratios).forEach(f => {
          const r = ratios[f];
          const fs = s.fine[f], ms = s.major[FINE_TO_MAJOR[f]];
          fs.eff += eff * r; fs.cum += en.exp * r; fs.last = Math.max(fs.last || 0, en.day);
          ms.eff += eff * r; ms.cum += en.exp * r; ms.last = Math.max(ms.last || 0, en.day);
        });
      } else {
        const mk = majorOfPart(en.part);   // マスタに無い種目は「部位」列で大部位に入れる
        if (mk) {
          const ms = s.major[mk];
          ms.eff += eff; ms.cum += en.exp; ms.last = Math.max(ms.last || 0, en.day);
        }
      }
    });
    return s;
  }

  const expForLv = (n, a) => Math.ceil(a * Math.pow(n - 1, C.CURVE_P) - 1e-9);   // この値以上で Lv n
  // スプシの式 =MIN(999, INT((EXP/係数)^(1/乗数))+1) と同じ判定
  function lvFromExp(e, a) {
    const need = n => a * Math.pow(n - 1, C.CURVE_P);
    let n = Math.floor(Math.pow(Math.max(0, e) / a, 1 / C.CURVE_P) + 1e-9) + 1;
    while (n < C.MAX_LV && need(n + 1) <= e + 1e-9) n++;
    while (n > 1 && need(n) > e + 1e-9) n--;
    return Math.min(C.MAX_LV, Math.max(1, n));
  }
  function titleOf(lv) {
    let t = C.TITLES[0][1];
    C.TITLES.forEach(([min, name]) => { if (lv >= min) t = name; });
    return t;
  }

  function condition(elapsed) {
    if (elapsed == null) return { cond: 'sleep', label: '💤 未修行' };
    if (elapsed <= C.KEEP_DAYS) return { cond: 'good', label: '🔥 絶好調' };
    if (elapsed < C.KEEP_DAYS + 10) return { cond: 'warn', label: '⚠️ EXP減少中' };
    if (retention(elapsed) > 0) return { cond: 'danger', label: '🩸 ピンチ' };
    return { cond: 'sleep', label: '💤 休眠中' };
  }

  function lvNext(e, a) {
    const lv = lvFromExp(e, a);
    return lv >= C.MAX_LV ? 0 : Math.max(0, expForLv(lv + 1, a) - Math.round(e));
  }
  function lvProgress(e, a) {
    const lv = lvFromExp(e, a), lo = expForLv(lv, a), hi = expForLv(Math.min(lv + 1, C.MAX_LV), a);
    return lv >= C.MAX_LV ? 1 : Math.max(0, Math.min(1, (e - lo) / (hi - lo)));
  }
  // 17部位ごとに、配分の大きい種目を上から3つ（スプシの「主に経験値が入る種目と推奨負荷目安」と同じ考え方）
  function tipsOf(data) {
    const out = {};
    FINES.forEach(f => {
      out[f] = Object.keys(data.master).filter(ex => (data.master[ex][f] || 0) >= 0.3)
        .sort((x, y) => data.master[y][f] - data.master[x][f]).slice(0, 3)
        .map(ex => ({ ex, ratio: data.master[ex][f], plan: (data.guides || {})[ex] || '', how: (data.hows || {})[ex] || '', guide: ((data.guides || {})[ex] || '').replace(/\s*[×x]\s*[\d〜~\-]+\s*セット.*$/, '').replace(/\s+/g, '') }));
    });
    return out;
  }

  function partView(st, t, a) {
    const elapsed = st.last ? t - st.last : null;
    const c = condition(elapsed);
    return {
      lv: lvFromExp(st.eff, a), eff: Math.round(st.eff), cum: Math.round(st.cum), effRaw: st.eff, cumRaw: st.cum,
      lost: Math.round(st.cum - st.eff), next: lvNext(st.eff, a), progress: lvProgress(st.eff, a),
      last: st.last ? fmt(st.last) : null, elapsed,
      retention: elapsed == null ? 0 : Math.round(retention(elapsed) * 100),
      daysToDecay: elapsed != null && elapsed <= C.KEEP_DAYS ? C.KEEP_DAYS - elapsed + 1 : null,
      cond: c.cond, condLabel: c.label,
    };
  }

  const num = n => Math.round(n).toLocaleString('ja-JP');

  function buildStatus(data, t) {
    const s = snapshot(data, t);
    const A = C.CURVE_A, AM = A * C.MAJOR_CURVE_SCALE, AF = A * C.FINE_CURVE_SCALE;
    const lv = lvFromExp(s.eff, A);
    const cur = expForLv(lv, A), nxt = expForLv(Math.min(lv + 1, C.MAX_LV), A);

    const majors = MAJORS.map(m => Object.assign({ key: m.key, kana: m.kana, icon: m.icon },
      partView(s.major[m.key], t, AM)));
    const fines = FINES.map(f => Object.assign({ name: (data.labels && data.labels[f]) || f, key: f, major: FINE_TO_MAJOR[f] },
      partView(s.fine[f], t, AF)));

    // 職業
    const sorted = majors.slice().sort((x, y) => y.eff - x.eff);
    const top = sorted[0], low = sorted[sorted.length - 1];
    let job = top.eff > 0 ? C.JOBS[top.key] : '旅人';
    const upper = majors.every(m => m.lv >= C.UPPER_JOB_MIN_LV) && top.eff > 0 && low.eff / top.eff >= C.UPPER_JOB_BALANCE;
    if (upper) job = C.UPPER_JOB;

    // 推移（過去TREND_DAYS日）と予報（このまま休んだら）
    const trend = [];
    for (let d = t - C.TREND_DAYS + 1; d <= t; d++) {
      const sn = d === t ? s : snapshot(data, d);
      trend.push({ d: fmt(d), eff: Math.round(sn.eff), lv: lvFromExp(sn.eff, A) });
    }
    const forecast = [3, 7, 14, 20].map(k => {
      const e = snapshot(data, t + k).eff;
      return { days: k, eff: Math.round(e), lv: lvFromExp(e, A) };
    });

    const lastDay = data.entries.filter(e => e.day <= t).reduce((x, e) => Math.max(x, e.day), -1);
    const zeroDay = C.KEEP_DAYS + Math.ceil(1 / C.DECAY_PER_DAY);
    const latest = lastDay < 0 ? null : { last: fmt(lastDay, true), elapsed: t - lastDay, toZero: Math.max(0, zeroDay - (t - lastDay)) };

    return {
      player: C.PLAYER_NAME,
      asOf: fmt(t, true),
      settings: { keepDays: C.KEEP_DAYS, decayPct: Math.round(C.DECAY_PER_DAY * 100), zeroDay: C.KEEP_DAYS + Math.ceil(1 / C.DECAY_PER_DAY),
        curveA: A, curveP: C.CURVE_P, maxLv: C.MAX_LV },
      latest,
      recent: data.entries.recent || [],
      titles: C.TITLES.map(([lvl, name]) => ({ lv: lvl, name, exp: Math.max(0, expForLv(lvl, A)) || 0 })),
      tips: tipsOf(data),
      exercises: Object.keys(data.names || {}).map(k => {
        const l = (data.entries.last || {})[k];
        return { name: data.names[k], part: data.parts[k] || '', plan: (data.guides || {})[k] || '', how: (data.hows || {})[k] || '', last: l ? { date: l.date, w: l.w, r: l.r, s: l.s } : null };
      }),
      total: {
        lv, title: titleOf(lv), job, upperJob: upper,
        eff: Math.round(s.eff), cum: Math.round(s.cum), lost: Math.round(s.cum - s.eff),
        curLvExp: cur, nextLvExp: nxt, need: Math.max(0, nxt - Math.round(s.eff)),
        progress: lv >= C.MAX_LV ? 1 : Math.max(0, Math.min(1, (s.eff - cur) / (nxt - cur))),
      },
      majors, fines, trend, forecast,
      log: battleLog(data, t, s, majors, fines, trend, lv, nxt),
      body: data.body,
      warnings: data.partCols ? [] : [`『${C.SHEET_MASTER}』の部位配分列が読み取れなかったので、「部位」列で大部位に振り分けています`],
    };
  }

  // ---------- たたかいのきろく ----------
  function battleLog(data, t, s, majors, fines, trend, lv, nxt) {
    const P = C.PLAYER_NAME;
    const out = [];
    const lastDay = data.entries.length ? data.entries[data.entries.length - 1].day : null;

    if (lastDay != null && lastDay <= t) {
      const todays = data.entries.filter(e => e.day === lastDay);
      const got = todays.reduce((a, e) => a + e.exp, 0);
      const parts = {};
      todays.forEach(e => {
        const r = data.master[e.ex];
        if (r) Object.keys(r).forEach(f => { parts[FINE_TO_MAJOR[f]] = (parts[FINE_TO_MAJOR[f]] || 0) + r[f]; });
        else { const mk = majorOfPart(e.part); if (mk) parts[mk] = (parts[mk] || 0) + 1; }
      });
      const kana = Object.keys(parts).sort((a, b) => parts[b] - parts[a])
        .map(k => MAJORS.find(m => m.key === k).kana).slice(0, 3).join('と ');
      const when = lastDay === t ? 'きょう' : `${fmt(lastDay)}に`;
      out.push({ type: 'gain', text: `${P}は ${when} ${kana || 'からだ'}を きたえた！ ${num(got)}ポイントの けいけんちを かくとく！` });
    } else {
      out.push({ type: 'info', text: `${P}の ぼうけんは まだ はじまっていない……` });
    }

    // レベルの上下（7日前と比べる）
    const before = trend.length > 7 ? trend[trend.length - 8].lv : null;
    if (before != null && lv > before) out.push({ type: 'levelup', text: `${P}の レベルが あがった！ Lv.${before} → Lv.${lv}` });
    if (before != null && lv < before) out.push({ type: 'leveldown', text: `${P}の レベルが さがってしまった…… Lv.${before} → Lv.${lv}` });

    // サボっている部位
    majors.forEach(m => {
      if (m.elapsed == null) return;
      if (m.cond === 'warn' || m.cond === 'danger') {
        const peakDay = t - m.elapsed + C.KEEP_DAYS;      // 減り始める直前
        const peak = snapshot(data, peakDay);
        const myFines = fines.filter(f => f.major === m.key);
        let worst = null, worstLoss = 0;
        myFines.forEach(f => {
          const loss = peak.fine[f.key].eff - s.fine[f.key].eff;
          if (loss > worstLoss) { worstLoss = loss; worst = f.name; }
        });
        const majorLoss = peak.major[m.key].eff - s.major[m.key].eff;
        const who = worst || m.key;
        const loss = worst ? worstLoss : majorLoss;
        out.push({
          type: m.cond === 'danger' ? 'danger' : 'warn',
          text: `${P}は ${m.elapsed}日の あいだ ${m.kana}の きたえを おこたった！ ${who}の けいけんちが ${num(loss)}ポイント へってしまった！`,
        });
      } else if (m.cond === 'sleep' && m.cum > 0) {
        out.push({ type: 'sleep', text: `${m.kana}の きんにくは ふかい ねむりに ついている…… Zzz` });
      } else if (m.cond === 'good' && m.daysToDecay != null && m.daysToDecay <= 2) {
        out.push({ type: 'warn', text: `${m.kana}の けいけんちが あと${m.daysToDecay}日で へりはじめる！ はやく きたえよう！` });
      }
    });

    if (majors.every(m => m.cond === 'good')) out.push({ type: 'gain', text: `${P}の ぜんしんに ちからが みなぎっている！` });
    if (lv < C.MAX_LV) out.push({ type: 'info', text: `つぎの レベルまで あと ${num(Math.max(0, nxt - Math.round(s.eff)))}ポイント！` });
    return out;
  }

  // ---------- 履歴シート ----------
  function writeHistoryRows(data, days) {
    const book = openBook();
    let sh = book.getSheetByName(C.SHEET_HISTORY);
    const header = ['日付', '総合Lv', '総有効EXP', '累計EXP', '失われたEXP']
      .concat(MAJORS.map(m => m.key + ' 有効EXP'), FINES.map(f => f + ' 有効EXP'));
    if (!sh) {
      sh = book.insertSheet(C.SHEET_HISTORY);
      sh.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold');
      sh.setFrozenRows(1);
      sh.setFrozenColumns(1);
    }
    const existing = {};
    const n = sh.getLastRow();
    if (n >= 2) {
      sh.getRange(2, 1, n - 1, 1).getValues().forEach((r, i) => {
        const d = toDayNum(r[0]);
        if (d != null) existing[d] = i + 2;
      });
    }
    const appends = [];
    days.forEach(d => {
      const s = snapshot(data, d);
      const row = [fmt(d, true), lvFromExp(s.eff, C.CURVE_A), Math.round(s.eff), Math.round(s.cum), Math.round(s.cum - s.eff)]
        .concat(MAJORS.map(m => Math.round(s.major[m.key].eff)), FINES.map(f => Math.round(s.fine[f].eff)));
      if (existing[d]) sh.getRange(existing[d], 1, 1, row.length).setValues([row]);
      else appends.push(row);
    });
    if (appends.length) sh.getRange(sh.getLastRow() + 1, 1, appends.length, header.length).setValues(appends);
    sh.getRange(2, 1, Math.max(1, sh.getLastRow() - 1), header.length).sort(1);
  }

  return { loadData, buildStatus, today, writeHistoryRows, snapshot, lvFromExp, expForLv, retention, toDayNum, _internal: { loadMaster, loadLog, MAJORS, FINES } };
})();
