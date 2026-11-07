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
  MAX_LV: 99,
  MAJOR_CURVE_SCALE: 1,       // 大部位Lv：総合と同じ曲線（同じEXPなら同じLv）
  FINE_CURVE_SCALE: 1,        // 17部位Lv：総合と同じ曲線

  TREND_DAYS: 30,             // 推移グラフに出す日数
  BACKFILL_DAYS: 90,

  // 称号（現在総有効EXPで決まる。スプシの「現在の称号」の式と同じ区切り）
  TITLES: [
    [0, 'みならい冒険者'],
    [500, 'かけだし武闘家'],
    [1000, '歴戦の戦士'],
    [2000, '剛腕バトルマスター'],
    [3500, '無敵のパラディン'],
    [5000, '神域のゴッドハンド'],
  ],
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
  if (e && e.parameter && e.parameter.format === 'json') {
    return ContentService.createTextOutput(getStatusJson())
      .setMimeType(ContentService.MimeType.JSON);
  }
  const t = HtmlService.createTemplateFromFile('index');
  t.boot = getStatusJson().replace(/</g, '\\u003c');
  return t.evaluate()
    .setTitle('冒険者ステータス')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .addMetaTag('apple-mobile-web-app-capable', 'yes')
    .addMetaTag('mobile-web-app-capable', 'yes');
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
    if (!sh) return { master, multipliers, labels, partCols: 0 };
    const v = sh.getDataRange().getValues();
    const hr = findHeaderRow(v, h => h.some(x => /種目/.test(x)) &&
      h.filter(x => FINE_MATCHERS.some(m => m[1](x))).length >= 5, 15);
    if (hr < 0) return { master, multipliers, labels, partCols: 0 };
    const header = v[hr].map(norm);
    const exCol = findCol(header, /種目/, 0);
    const mulCol = findCol(header, /倍率/, -1);
    const cols = [];   // [colIndex, fineName]
    const used = {};
    header.forEach((h, i) => {
      if (i === exCol || i === mulCol || !h) return;
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
      const ratios = {};
      let sum = 0;
      cols.forEach(([i, f]) => {
        let x = Number(row[i]) || 0;
        if (x > 1.5) x = x / 100;     // 85 と書かれていたら 0.85 とみなす
        if (x > 0) { ratios[f] = x; sum += x; }
      });
      if (sum > 0) master[ex] = ratios;
      if (mulCol >= 0 && Number(row[mulCol]) > 0) multipliers[ex] = Number(row[mulCol]);
    });
    return { master, multipliers, labels, partCols: cols.length };
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
    };
    const entries = [];
    v.slice(hr + 1).forEach(row => {
      const day = toDayNum(row[col.date]);
      if (day == null) return;
      const ex = norm(row[col.ex]);
      let exp = Number(row[col.exp]);
      if (!(exp > 0) && multipliers[ex] && Number(row[col.vol]) > 0) {
        exp = Number(row[col.vol]) * multipliers[ex];
      }
      if (!(exp > 0)) return;
      entries.push({ day, ex, part: norm(row[col.part]), exp });
    });
    entries.sort((a, b) => a.day - b.day);
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
      const rows = v.slice(hr + 1)
        .map(r => ({ day: toDayNum(r[dc]), w: Number(r[wc]) || null, f: fc >= 0 ? (Number(r[fc]) || null) : null }))
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
        series: rows.slice(-60).map(r => ({ d: fmt(r.day), w: r.w, f: pct(r.f) })),
      };
    } catch (e) {
      return null;
    }
  }

  /** 『ドラクエ風ステータス・EXP』の設定セル（見出しの右隣の数字）を読んで QS_CONFIG を上書きする */
  function loadSettings(book) {
    const sh = book.getSheetByName(C.SHEET_STATUS);
    if (!sh) return;
    const v = sh.getDataRange().getValues().slice(0, 20);
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
  }

  function loadData() {
    const book = openBook();
    loadSettings(book);
    const m = loadMaster(book);
    return { master: m.master, labels: m.labels, entries: loadLog(book, m.multipliers), body: loadBody(book), partCols: m.partCols };
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
      const eff = en.exp * retention(day - en.day);
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

  const expForLv = (n, a) => Math.round(a * Math.pow(n - 1, C.CURVE_P));
  // スプシの式 =MIN(99, INT((EXP/係数)^(1/乗数))+1) と同じ判定
  function lvFromExp(e, a) {
    const need = n => a * Math.pow(n - 1, C.CURVE_P);
    let n = Math.floor(Math.pow(Math.max(0, e) / a, 1 / C.CURVE_P) + 1e-9) + 1;
    while (n < C.MAX_LV && need(n + 1) <= e + 1e-9) n++;
    while (n > 1 && need(n) > e + 1e-9) n--;
    return Math.min(C.MAX_LV, Math.max(1, n));
  }
  function titleOf(exp) {
    let t = C.TITLES[0][1];
    C.TITLES.forEach(([min, name]) => { if (exp >= min) t = name; });
    return t;
  }

  function condition(elapsed) {
    if (elapsed == null) return { cond: 'sleep', label: '💤 未修行' };
    if (elapsed <= C.KEEP_DAYS) return { cond: 'good', label: '🔥 絶好調' };
    if (elapsed < C.KEEP_DAYS + 10) return { cond: 'warn', label: '⚠️ EXP減少中' };
    if (retention(elapsed) > 0) return { cond: 'danger', label: '🩸 ピンチ' };
    return { cond: 'sleep', label: '💤 休眠中' };
  }

  function partView(st, t, a) {
    const elapsed = st.last ? t - st.last : null;
    const c = condition(elapsed);
    return {
      lv: lvFromExp(st.eff, a), eff: Math.round(st.eff), cum: Math.round(st.cum),
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

    return {
      player: C.PLAYER_NAME,
      asOf: fmt(t, true),
      settings: { keepDays: C.KEEP_DAYS, decayPct: Math.round(C.DECAY_PER_DAY * 100), zeroDay: C.KEEP_DAYS + Math.ceil(1 / C.DECAY_PER_DAY) },
      total: {
        lv, title: titleOf(Math.round(s.eff)), job, upperJob: upper,
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
