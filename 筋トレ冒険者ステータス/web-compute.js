/* 筋トレ冒険者ステータス：ブラウザ側の計算（claude.ai のページ用）
 * Code.gs の QS と同じ計算を、Google Sheets コネクタの get_values（表示どおりの文字列）から行う。
 * index.html の <script id="qs-compute"> にこのファイルの中身がそのまま入る。 */
var QSWeb = (function () {
  var C = {
    PLAYER_NAME: 'ちゃんズ', TIMEZONE: 'Asia/Tokyo',
    KEEP_DAYS: 7, DECAY_PER_DAY: 0.05, CURVE_A: 15.9, CURVE_P: 1.5, MAX_LV: 999,
    TREND_DAYS: 30,
    // 称号（総合Lvで決まる）。スプシ『ドラクエ風ステータス・EXP』の称号テーブル（必要Lv／称号）が読めればそちらを使う
    TITLES: [[1, 'みならい冒険者'], [10, 'かけだし武闘家'], [20, '歴戦の戦士'], [30, '剛腕バトルマスター'], [40, '無敵のパラディン'], [50, '神域のゴッドハンド'],
      [70, '鋼の覇王'], [100, '伝説の筋肉勇者'], [150, '天を突く巨人'], [200, '大地を揺らす豪傑'], [300, '星をも砕く拳聖'], [500, '神話に刻まれし者'], [700, '天地創造の筋神'], [999, '筋肉の神（カンスト）']],
    JOBS: { '肩': '鉄壁の盾兵', '胸': '重装の騎士', '背中': '鬼背の拳士', '腕': '剛腕の剣士', '脚': '大地の守護者', '腹筋': '鋼の体幹師' },
    UPPER_JOB: '万能の勇者', UPPER_JOB_MIN_LV: 10, UPPER_JOB_BALANCE: 0.5
  };
  var MAJORS = [
    { key: '肩', kana: 'かた', icon: '🛡️', words: /肩/, fines: ['僧帽筋(上部)', '三角筋(前部)', '三角筋(中部)', '三角筋(後部)'] },
    { key: '胸', kana: 'むね', icon: '💠', words: /胸/, fines: ['大胸筋(上部)', '大胸筋(中部)', '大胸筋(下部)'] },
    { key: '背中', kana: 'せなか', icon: '🦅', words: /背/, fines: ['広背筋', '僧帽筋(中下部)/起立筋'] },
    { key: '腕', kana: 'うで', icon: '⚔️', words: /腕/, fines: ['上腕二頭筋', '上腕三頭筋', '前腕/腕橈骨筋'] },
    { key: '脚', kana: 'あし', icon: '🦵', words: /脚|足|尻|臀|下半身/, fines: ['大腿四頭筋', 'ハム/大臀筋', 'ふくらはぎ'] },
    { key: '腹筋', kana: 'ふっきん', icon: '🔥', words: /腹|体幹/, fines: ['腹直筋', '腹斜筋/腹横筋'] }
  ];
  var FINE_TO_MAJOR = {}, FINES = [];
  MAJORS.forEach(function (m) { m.fines.forEach(function (f) { FINE_TO_MAJOR[f] = m.key; FINES.push(f); }); });
  var FINE_MATCHERS = [
    ['僧帽筋(中下部)/起立筋', function (s) { return (/僧帽/.test(s) && /中|下/.test(s)) || /起立/.test(s); }],
    ['僧帽筋(上部)', function (s) { return /僧帽/.test(s); }],
    ['三角筋(前部)', function (s) { return /三角/.test(s) && /前/.test(s); }],
    ['三角筋(中部)', function (s) { return /三角/.test(s) && /中|横/.test(s); }],
    ['三角筋(後部)', function (s) { return /三角/.test(s) && /後/.test(s); }],
    ['大胸筋(上部)', function (s) { return /胸/.test(s) && /上/.test(s); }],
    ['大胸筋(中部)', function (s) { return /胸/.test(s) && /中/.test(s); }],
    ['大胸筋(下部)', function (s) { return /胸/.test(s) && /下/.test(s); }],
    ['広背筋', function (s) { return /広背/.test(s); }],
    ['上腕二頭筋', function (s) { return /二頭/.test(s); }],
    ['上腕三頭筋', function (s) { return /三頭/.test(s) && !/下腿/.test(s); }],
    ['前腕/腕橈骨筋', function (s) { return /前腕|腕橈/.test(s); }],
    ['大腿四頭筋', function (s) { return /四頭/.test(s); }],
    ['ハム/大臀筋', function (s) { return /ハム|臀/.test(s); }],
    ['ふくらはぎ', function (s) { return /ふくらはぎ|下腿|腓腹|カーフ/.test(s); }],
    ['腹直筋', function (s) { return /腹直/.test(s); }],
    ['腹斜筋/腹横筋', function (s) { return /腹斜|腹横/.test(s); }]
  ];

  function norm(v) { return String(v == null ? '' : v).replace(/（/g, '(').replace(/）/g, ')').replace(/[\s　]/g, ''); }
  /** 表示文字列 → 数値（"1,438" "10%" "5% /日" "7 日間" に対応）。数字でなければ NaN */
  function num(v) {
    if (typeof v === 'number') return v;
    var s = String(v == null ? '' : v).replace(/,/g, '').replace(/^Lv\.?\s*/i, '').trim();
    var m = s.match(/^(-?\d+(?:\.\d+)?)\s*(%?)/);
    if (!m || s === '') return NaN;
    return m[2] ? Number(m[1]) / 100 : Number(m[1]);
  }
  function dayNumFromYMD(y, m, d) { return Math.floor(Date.UTC(y, m - 1, d) / 86400000); }
  function toDayNum(v) {
    var m = String(v || '').match(/(\d{4})[\/\-.年](\d{1,2})[\/\-.月](\d{1,2})/);
    return m ? dayNumFromYMD(+m[1], +m[2], +m[3]) : null;
  }
  function today() {
    var p = new Intl.DateTimeFormat('en-CA', { timeZone: C.TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    return toDayNum(p);
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function fmt(dayNum, withYear) {
    var d = new Date(dayNum * 86400000), mm = d.getUTCMonth() + 1, dd = d.getUTCDate();
    return withYear ? d.getUTCFullYear() + '/' + pad(mm) + '/' + pad(dd) : mm + '/' + dd;
  }
  function findHeaderRow(values, test, maxRows) {
    for (var r = 0; r < Math.min(maxRows || 10, values.length); r++) if (test((values[r] || []).map(norm))) return r;
    return -1;
  }
  function findCol(header, re, fallback) {
    for (var i = 0; i < header.length; i++) if (re.test(header[i])) return i;
    return fallback;
  }
  function cell(row, i) { return row && i >= 0 && i < row.length ? row[i] : ''; }

  function applySettings(v) {
    var pick = function (re) {
      for (var r = 0; r < Math.min(40, v.length); r++) {
        var row = v[r] || [];
        for (var i = 0; i < row.length - 1; i++) if (re.test(norm(row[i]))) { var n = num(row[i + 1]); if (!isNaN(n)) return n; }
      }
      return null;
    };
    var a = pick(/^Lv曲線係数/), p = pick(/^Lv曲線乗数/), keep = pick(/^100%維持期間/), decay = pick(/^8日目.*減衰率/);
    if (a > 0) C.CURVE_A = a;
    if (p > 0) C.CURVE_P = p;
    if (keep != null && keep >= 0) C.KEEP_DAYS = keep;
    if (decay > 0 && decay < 1) C.DECAY_PER_DAY = decay;
    // 称号テーブル：「必要Lv」「称号」の見出しの下を読む
    for (var r = 0; r < v.length; r++) {
      var row = (v[r] || []).map(norm), c = row.indexOf('必要Lv');
      if (c < 0 || row[c + 1] !== '称号') continue;
      var t = [];
      for (var k = r + 1; k < v.length; k++) {
        var lv = num(cell(v[k], c)), name = String(cell(v[k], c + 1)).trim();
        if (isNaN(lv) || !name) break;
        t.push([lv, name]);
      }
      if (t.length) C.TITLES = t;
      break;
    }
  }

  function loadMaster(v) {
    var master = {}, multipliers = {}, labels = {}, guides = {}, hows = {}, names = {}, parts = {};
    var hr = findHeaderRow(v, function (h) {
      return h.some(function (x) { return /種目/.test(x); }) &&
        h.filter(function (x) { return FINE_MATCHERS.some(function (m) { return m[1](x); }); }).length >= 5;
    }, 15);
    if (hr < 0) return { master: master, multipliers: multipliers, labels: labels, guides: guides, hows: hows, names: names, parts: parts, partCols: 0 };
    var header = v[hr].map(norm), exCol = findCol(header, /種目/, 0), mulCol = findCol(header, /倍率/, -1), guideCol = findCol(header, /目安/, -1), howCol = findCol(header, /コツ/, -1), partCol = findCol(header, /^大部位$/, -1);
    var cols = [], used = {};
    header.forEach(function (h, i) {
      if (i === exCol || i === mulCol || i === guideCol || i === howCol || !h) return;
      var hit = null;
      for (var k = 0; k < FINE_MATCHERS.length; k++) if (!used[FINE_MATCHERS[k][0]] && FINE_MATCHERS[k][1](h)) { hit = FINE_MATCHERS[k]; break; }
      if (!hit) return;
      var filled = v.slice(hr + 1).filter(function (row) { return String(cell(row, i)).trim() !== ''; });
      if (filled.length && filled.filter(function (row) { return !isNaN(num(cell(row, i))); }).length / filled.length < 0.8) return;
      used[hit[0]] = true; labels[hit[0]] = String(v[hr][i]).trim(); cols.push([i, hit[0]]);
    });
    v.slice(hr + 1).forEach(function (row) {
      var ex = norm(cell(row, exCol));
      if (!ex) return;
      names[ex] = String(cell(row, exCol)).trim();
      if (partCol >= 0) parts[ex] = String(cell(row, partCol)).trim();
      var ratios = {}, sum = 0;
      cols.forEach(function (c) { var x = num(cell(row, c[0])) || 0; if (x > 1.5) x /= 100; if (x > 0) { ratios[c[1]] = x; sum += x; } });
      if (sum > 0) master[ex] = ratios;
      var mul = num(cell(row, mulCol));
      if (mulCol >= 0 && mul > 0) multipliers[ex] = mul;
      if (guideCol >= 0 && String(cell(row, guideCol)).trim()) guides[ex] = String(cell(row, guideCol)).trim();
      if (howCol >= 0 && String(cell(row, howCol)).trim()) hows[ex] = String(cell(row, howCol)).trim();
    });
    return { master: master, multipliers: multipliers, labels: labels, guides: guides, hows: hows, names: names, parts: parts, partCols: cols.length };
  }

  function loadLog(v, multipliers) {
    var hr = findHeaderRow(v, function (h) { return h.some(function (x) { return /日付/.test(x); }) && h.some(function (x) { return /種目/.test(x); }); }, 10);
    var header = hr >= 0 ? v[hr].map(norm) : [];
    var col = {
      date: findCol(header, /日付/, 1), part: findCol(header, /^(大)?部位$|^部位/, 2), ex: findCol(header, /種目/, 3),
      vol: findCol(header, /総ボリューム/, 10), exp: findCol(header, /基礎.*EXP|獲得EXP/, 13),
      w: findCol(header, /^重量/, 5), r: findCol(header, /^回数/, 6), s: findCol(header, /^セット/, 7),
      memo: findCol(header, /時間|距離/, 11)
    };
    var recent = [];   // シートの行番号つきの きろく（アプリで なおす・けす ために使う）
    var entries = [];
    entries.last = {};   // 種目ごとの さいごの記録（記録フォームの初期値に使う）
    v.slice(hr + 1).forEach(function (row, i) {
      var day = toDayNum(cell(row, col.date));
      if (day == null) return;
      var exn = norm(cell(row, col.ex)), prev = entries.last[exn];
      if (exn) recent.push({ row: hr + i + 2, date: fmt(day, true), part: norm(cell(row, col.part)), ex: exn, w: num(cell(row, col.w)) || 0, r: num(cell(row, col.r)) || null, s: num(cell(row, col.s)) || 1, memo: norm(cell(row, col.memo)) });
      if (exn && (!prev || day >= prev.day)) entries.last[exn] = { day: day, date: fmt(day), w: num(cell(row, col.w)) || 0, r: num(cell(row, col.r)) || null, s: num(cell(row, col.s)) || 1 };
      var ex = norm(cell(row, col.ex)), exp = num(cell(row, col.exp)), vol = num(cell(row, col.vol));
      if (!(exp > 0) && multipliers[ex] && vol > 0) exp = vol * multipliers[ex];
      if (!(exp > 0)) return;
      entries.push({ day: day, ex: ex, part: norm(cell(row, col.part)), exp: exp });
    });
    var last = entries.last;
    entries.sort(function (a, b) { return a.day - b.day; });
    entries.last = last;
    entries.recent = recent.slice(-15).reverse();
    return entries;
  }

  function loadBody(v) {
    var hr = findHeaderRow(v, function (h) { return h.some(function (x) { return /日付/.test(x); }) && h.some(function (x) { return /体重/.test(x); }); }, 10);
    if (hr < 0) return null;
    var header = v[hr].map(norm), dc = findCol(header, /日付/, 0), wc = findCol(header, /体重/, -1);
    var fc = findCol(header, /体脂肪率/, findCol(header, /体脂肪/, -1));
    var mc = findCol(header, /筋肉率/, -1);
    var rows = v.slice(hr + 1).map(function (r) {
      return { day: toDayNum(cell(r, dc)), w: num(cell(r, wc)) || null, m: mc >= 0 ? (num(cell(r, mc)) || null) : null, f: fc >= 0 ? (num(cell(r, fc)) || null) : null };
    }).filter(function (r) { return r.day != null && r.w; });
    if (!rows.length) return null;
    rows.sort(function (a, b) { return a.day - b.day; });
    var pct = function (x) { return x != null && x < 1 ? x * 100 : x; };   // "14.1" はそのまま、0.141 なら %
    var last = rows[rows.length - 1], first = rows[0];
    return {
      date: fmt(last.day, true), weight: last.w, fat: pct(last.f),
      weightFromStart: last.w - first.w,
      fatFromStart: last.f != null && first.f != null ? pct(last.f) - pct(first.f) : null,
      startDate: fmt(first.day, true),
      series: rows.slice(-60).map(function (r) { return { d: fmt(r.day), w: r.w, f: pct(r.f), m: pct(r.m) }; })
    };
  }

  /** 食事・PFCログ。左がわ（日付〜食塩）が1食ごとの きろく、右がわ（2つめの「日付」から）が1日ごとの合計表 */
  function loadMeals(v, dash, t) {
    var hr = findHeaderRow(v, function (h) { return h.some(function (x) { return /日付/.test(x); }) && h.some(function (x) { return /カロリー/.test(x); }); }, 10);
    if (hr < 0) return null;
    var header = v[hr].map(norm);
    var c = {
      date: findCol(header, /日付/, 1), kind: findCol(header, /区分/, 2), menu: findCol(header, /メニュー|摂取内容/, 3),
      kcal: findCol(header, /カロリー/, 4), p: findCol(header, /タンパク質/, 5), f: findCol(header, /脂質/, 6),
      c: findCol(header, /炭水化物/, 7), fiber: findCol(header, /繊維/, 8), salt: findCol(header, /食塩|塩分/, 9)
    };
    var dcol = 13;   // 1日ごとの合計表の「日付」の列（2つめの 日付）
    for (var i = c.date + 1; i < header.length; i++) if (/日付/.test(header[i])) { dcol = i; break; }
    var n0 = function (x) { var k = num(x); return isNaN(k) ? 0 : k; };
    var items = [], lastRow = hr + 1, lastDaily = hr + 1, dailyHas = {};
    v.slice(hr + 1).forEach(function (row, i) {
      var r = hr + i + 2;
      var dd = toDayNum(cell(row, dcol));
      if (dd != null) { dailyHas[fmt(dd, true)] = true; lastDaily = r; }
      var day = toDayNum(cell(row, c.date));
      if (day == null) return;
      lastRow = r;
      items.push({ row: r, day: day, date: fmt(day, true), kind: String(cell(row, c.kind) || '').trim(), menu: String(cell(row, c.menu) || '').trim(),
        kcal: n0(cell(row, c.kcal)), p: n0(cell(row, c.p)), f: n0(cell(row, c.f)), c: n0(cell(row, c.c)), fiber: n0(cell(row, c.fiber)), salt: n0(cell(row, c.salt)) });
    });
    var target = { kcal: 1800, p: 130 };
    (dash || []).forEach(function (row) {
      var name = norm((row || []).slice(0, 3).join(' '));
      for (var j = 0; j < (row || []).length; j++) {
        var k = num(row[j]);
        if (isNaN(k) || !(k > 0)) continue;
        if (/日次カロリー|カロリー/.test(norm(row[j - 1]))) target.kcal = k;
        if (/タンパク質/.test(norm(row[j - 1]))) target.p = k;
        break;
      }
    });
    // ダッシュボードの「きょうの栄養バランス＆食事アドバイス」（スプシの式が作った文を そのまま使う）
    var advice = null, txt = function (row, i) { return String(cell(row, i) == null ? '' : cell(row, i)).trim(); };
    (dash || []).forEach(function (row, r) {
      var lab = norm(cell(row, 1));
      if (lab === '栄養素') {
        advice = advice || { rows: [] };
        for (var k = r + 1; k < dash.length && norm(cell(dash[k], 1)); k++) advice.rows.push({ name: txt(dash[k], 1), target: txt(dash[k], 2), intake: txt(dash[k], 3), diff: txt(dash[k], 4), judge: txt(dash[k], 5) });
      } else if (/^不足している栄養素/.test(lab)) (advice = advice || { rows: [] }).lack = txt(row, 2);
      else if (/^とりすぎ注意/.test(lab)) (advice = advice || { rows: [] }).over = txt(row, 2);
      else if (/^アドバイス/.test(lab)) (advice = advice || { rows: [] }).text = txt(row, 2);
      else if (/^記録からのおすすめ/.test(lab)) (advice = advice || { rows: [] }).suggest = txt(row, 2);
    });
    var r1 = function (x) { return Math.round(x * 10) / 10; };
    var days = [];
    for (var d = t - 6; d <= t; d++) {
      var o = { day: d, d: fmt(d), date: fmt(d, true), kcal: 0, p: 0, f: 0, c: 0, fiber: 0, salt: 0, count: 0 };
      items.forEach(function (it) { if (it.day === d) { o.kcal += it.kcal; o.p += it.p; o.f += it.f; o.c += it.c; o.fiber += it.fiber; o.salt += it.salt; o.count++; } });
      ['kcal', 'p', 'f', 'c', 'fiber', 'salt'].forEach(function (k) { o[k] = r1(o[k]); });
      days.push(o);
    }
    var kinds = ['朝食', '昼食', '夕食', '間食', '晩酌'];
    items.forEach(function (it) { if (it.kind && kinds.indexOf(it.kind) < 0) kinds.push(it.kind); });
    var strip = function (it) { return { row: it.row, date: it.date, kind: it.kind, menu: it.menu, kcal: it.kcal, p: it.p, f: it.f, c: it.c, fiber: it.fiber, salt: it.salt }; };
    return {
      targetKcal: target.kcal, targetP: target.p, today: fmt(t, true), days: days, advice: advice,
      items: items.filter(function (it) { return it.day === t; }).map(strip),
      recent: items.slice(-15).reverse().map(strip), kinds: kinds,
      nextRow: lastRow + 1, nextDailyRow: lastDaily + 1, dailyDates: Object.keys(dailyHas),
      cols: { first: c.date, daily: dcol }
    };
  }

  function retention(el) { return el < 0 ? 0 : el <= C.KEEP_DAYS ? 1 : Math.max(0, 1 - (el - C.KEEP_DAYS) * C.DECAY_PER_DAY); }
  function majorOfPart(part) { for (var i = 0; i < MAJORS.length; i++) if (MAJORS[i].words.test(part)) return MAJORS[i].key; return null; }

  function snapshot(data, day) {
    var s = { eff: 0, cum: 0, fine: {}, major: {} };
    FINES.forEach(function (f) { s.fine[f] = { eff: 0, cum: 0, last: null }; });
    MAJORS.forEach(function (m) { s.major[m.key] = { eff: 0, cum: 0, last: null }; });
    data.entries.forEach(function (en) {
      if (en.day > day) return;
      var eff = Math.round(en.exp * retention(day - en.day));   // スプシのQ列と同じく1行ごとに四捨五入
      s.eff += eff; s.cum += en.exp;
      var ratios = data.master[en.ex];
      if (ratios) {
        Object.keys(ratios).forEach(function (f) {
          var r = ratios[f], fs = s.fine[f], ms = s.major[FINE_TO_MAJOR[f]];
          fs.eff += eff * r; fs.cum += en.exp * r; fs.last = Math.max(fs.last || 0, en.day);
          ms.eff += eff * r; ms.cum += en.exp * r; ms.last = Math.max(ms.last || 0, en.day);
        });
      } else {
        var mk = majorOfPart(en.part);
        if (mk) { var ms = s.major[mk]; ms.eff += eff; ms.cum += en.exp; ms.last = Math.max(ms.last || 0, en.day); }
      }
    });
    return s;
  }

  function expForLv(n) { return Math.ceil(C.CURVE_A * Math.pow(n - 1, C.CURVE_P) - 1e-9); }   // この値以上で Lv n
  function lvFromExp(e) {
    var need = function (n) { return C.CURVE_A * Math.pow(n - 1, C.CURVE_P); };
    var n = Math.floor(Math.pow(Math.max(0, e) / C.CURVE_A, 1 / C.CURVE_P) + 1e-9) + 1;
    while (n < C.MAX_LV && need(n + 1) <= e + 1e-9) n++;
    while (n > 1 && need(n) > e + 1e-9) n--;
    return Math.min(C.MAX_LV, Math.max(1, n));
  }
  function lvNext(e) { var lv = lvFromExp(e); return lv >= C.MAX_LV ? 0 : Math.max(0, expForLv(lv + 1) - Math.round(e)); }
  function lvProgress(e) {
    var lv = lvFromExp(e), a = expForLv(lv), b = expForLv(Math.min(lv + 1, C.MAX_LV));
    return lv >= C.MAX_LV ? 1 : Math.max(0, Math.min(1, (e - a) / (b - a)));
  }
  // 17部位ごとに、配分の大きい種目を上から3つ（スプシの「主に経験値が入る種目と推奨負荷目安」と同じ考え方）
  function tipsOf(m) {
    var out = {};
    FINES.forEach(function (f) {
      out[f] = Object.keys(m.master).filter(function (ex) { return (m.master[ex][f] || 0) >= 0.3; })
        .sort(function (a, b) { return m.master[b][f] - m.master[a][f]; }).slice(0, 3)
        .map(function (ex) { return { ex: ex, ratio: m.master[ex][f], plan: m.guides[ex] || '', how: (m.hows || {})[ex] || '', guide: (m.guides[ex] || '').replace(/\s*[×x]\s*[\d〜~\-]+\s*セット.*$/, '').replace(/\s+/g, '') }; });
    });
    return out;
  }
  function titleOf(lv) { var t = C.TITLES[0][1]; C.TITLES.forEach(function (x) { if (lv >= x[0]) t = x[1]; }); return t; }
  function condition(el) {
    if (el == null) return { cond: 'sleep', label: '💤 未修行' };
    if (el <= C.KEEP_DAYS) return { cond: 'good', label: '🔥 絶好調' };
    if (el < C.KEEP_DAYS + 10) return { cond: 'warn', label: '⚠️ EXP減少中' };
    if (retention(el) > 0) return { cond: 'danger', label: '🩸 ピンチ' };
    return { cond: 'sleep', label: '💤 休眠中' };
  }
  function partView(st, t) {
    var el = st.last ? t - st.last : null, c = condition(el);
    return {
      lv: lvFromExp(st.eff), eff: Math.round(st.eff), cum: Math.round(st.cum), effRaw: st.eff, cumRaw: st.cum,
      lost: Math.round(st.cum - st.eff), next: lvNext(st.eff), progress: lvProgress(st.eff),
      last: st.last ? fmt(st.last) : null, elapsed: el,
      retention: el == null ? 0 : Math.round(retention(el) * 100),
      daysToDecay: el != null && el <= C.KEEP_DAYS ? C.KEEP_DAYS - el + 1 : null,
      cond: c.cond, condLabel: c.label
    };
  }
  function fmtNum(n) { return Math.round(n).toLocaleString('ja-JP'); }

  function battleLog(data, t, s, majors, fines, trend, lv, nxt) {
    var P = C.PLAYER_NAME, out = [];
    var lastDay = data.entries.length ? data.entries[data.entries.length - 1].day : null;
    if (lastDay != null && lastDay <= t) {
      var todays = data.entries.filter(function (e) { return e.day === lastDay; });
      var got = todays.reduce(function (a, e) { return a + e.exp; }, 0), parts = {};
      todays.forEach(function (e) {
        var r = data.master[e.ex];
        if (r) Object.keys(r).forEach(function (f) { parts[FINE_TO_MAJOR[f]] = (parts[FINE_TO_MAJOR[f]] || 0) + r[f]; });
        else { var mk = majorOfPart(e.part); if (mk) parts[mk] = (parts[mk] || 0) + 1; }
      });
      var kana = Object.keys(parts).sort(function (a, b) { return parts[b] - parts[a]; })
        .map(function (k) { return MAJORS.filter(function (m) { return m.key === k; })[0].kana; }).slice(0, 3).join('と ');
      out.push({ type: 'gain', text: P + 'は ' + (lastDay === t ? 'きょう' : fmt(lastDay) + 'に') + ' ' + (kana || 'からだ') + 'を きたえた！ ' + fmtNum(got) + 'ポイントの けいけんちを かくとく！' });
    } else {
      out.push({ type: 'info', text: P + 'の ぼうけんは まだ はじまっていない……' });
    }
    var before = trend.length > 7 ? trend[trend.length - 8].lv : null;
    if (before != null && lv > before) out.push({ type: 'levelup', text: P + 'の レベルが あがった！ Lv.' + before + ' → Lv.' + lv });
    if (before != null && lv < before) out.push({ type: 'leveldown', text: P + 'の レベルが さがってしまった…… Lv.' + before + ' → Lv.' + lv });
    majors.forEach(function (m) {
      if (m.elapsed == null) return;
      if (m.cond === 'warn' || m.cond === 'danger') {
        var peak = snapshot(data, t - m.elapsed + C.KEEP_DAYS), worst = null, worstLoss = 0;
        fines.filter(function (f) { return f.major === m.key; }).forEach(function (f) {
          var loss = peak.fine[f.key].eff - s.fine[f.key].eff;
          if (loss > worstLoss) { worstLoss = loss; worst = f.name; }
        });
        var loss = worst ? worstLoss : peak.major[m.key].eff - s.major[m.key].eff;
        out.push({ type: m.cond === 'danger' ? 'danger' : 'warn', text: P + 'は ' + m.elapsed + '日の あいだ ' + m.kana + 'の きたえを おこたった！ ' + (worst || m.key) + 'の けいけんちが ' + fmtNum(loss) + 'ポイント へってしまった！' });
      } else if (m.cond === 'sleep' && m.cum > 0) {
        out.push({ type: 'sleep', text: m.kana + 'の きんにくは ふかい ねむりに ついている…… Zzz' });
      } else if (m.cond === 'good' && m.daysToDecay != null && m.daysToDecay <= 2) {
        out.push({ type: 'warn', text: m.kana + 'の けいけんちが あと' + m.daysToDecay + '日で へりはじめる！ はやく きたえよう！' });
      }
    });
    if (majors.every(function (m) { return m.cond === 'good'; })) out.push({ type: 'gain', text: P + 'の ぜんしんに ちからが みなぎっている！' });
    if (lv < C.MAX_LV) out.push({ type: 'info', text: 'つぎの レベルまで あと ' + fmtNum(Math.max(0, nxt - Math.round(s.eff))) + 'ポイント！' });
    return out;
  }

  /** ranges: {log, master, body, status} それぞれ get_values の values（2次元配列） */
  function compute(ranges, t) {
    t = t == null ? today() : t;
    applySettings(ranges.status || []);
    var m = loadMaster(ranges.master || []);
    var data = { master: m.master, labels: m.labels, entries: loadLog(ranges.log || [], m.multipliers) };
    var s = snapshot(data, t), lv = lvFromExp(s.eff), cur = expForLv(lv), nxt = expForLv(Math.min(lv + 1, C.MAX_LV));
    var majors = MAJORS.map(function (mj) { var v = partView(s.major[mj.key], t); v.key = mj.key; v.kana = mj.kana; v.icon = mj.icon; return v; });
    var fines = FINES.map(function (f) { var v = partView(s.fine[f], t); v.name = data.labels[f] || f; v.key = f; v.major = FINE_TO_MAJOR[f]; return v; });
    var sorted = majors.slice().sort(function (x, y) { return y.eff - x.eff; }), top = sorted[0], low = sorted[sorted.length - 1];
    var job = top.eff > 0 ? C.JOBS[top.key] : '旅人';
    var upper = majors.every(function (x) { return x.lv >= C.UPPER_JOB_MIN_LV; }) && top.eff > 0 && low.eff / top.eff >= C.UPPER_JOB_BALANCE;
    if (upper) job = C.UPPER_JOB;
    var trend = [];
    for (var d = t - C.TREND_DAYS + 1; d <= t; d++) { var sn = d === t ? s : snapshot(data, d); trend.push({ d: fmt(d), eff: Math.round(sn.eff), lv: lvFromExp(sn.eff) }); }
    var forecast = [3, 7, 14, 20].map(function (k) { var e = snapshot(data, t + k).eff; return { days: k, eff: Math.round(e), lv: lvFromExp(e) }; });
    var lastDay = data.entries.filter(function (e) { return e.day <= t; }).reduce(function (a, e) { return Math.max(a, e.day); }, -1);
    var latest = lastDay < 0 ? null : { last: fmt(lastDay, true), elapsed: t - lastDay, toZero: Math.max(0, C.KEEP_DAYS + Math.ceil(1 / C.DECAY_PER_DAY) - (t - lastDay)) };
    var warnings = [];
    if (!m.partCols) warnings.push('『経験値・部位負荷マスタ』の部位配分列が読み取れなかったので、「部位」列で大部位に振り分けています');
    return {
      player: C.PLAYER_NAME, asOf: fmt(t, true),
      settings: { keepDays: C.KEEP_DAYS, decayPct: Math.round(C.DECAY_PER_DAY * 100), zeroDay: C.KEEP_DAYS + Math.ceil(1 / C.DECAY_PER_DAY),
        curveA: C.CURVE_A, curveP: C.CURVE_P, maxLv: C.MAX_LV },
      latest: latest,
      recent: data.entries.recent || [],
      meals: ranges.meal ? loadMeals(ranges.meal, ranges.dash || [], t) : null,
      titles: C.TITLES.map(function (x) { return { lv: x[0], name: x[1], exp: Math.max(0, expForLv(x[0])) || 0 }; }),
      tips: tipsOf(m),
      exercises: Object.keys(m.names).map(function (k) {
        var l = data.entries.last[k];
        return { name: m.names[k], part: m.parts[k] || '', plan: m.guides[k] || '', how: m.hows[k] || '', last: l ? { date: l.date, w: l.w, r: l.r, s: l.s } : null };
      }),
      total: {
        lv: lv, title: titleOf(lv), job: job, upperJob: upper,
        eff: Math.round(s.eff), cum: Math.round(s.cum), lost: Math.round(s.cum - s.eff),
        curLvExp: cur, nextLvExp: nxt, need: Math.max(0, nxt - Math.round(s.eff)),
        progress: lv >= C.MAX_LV ? 1 : Math.max(0, Math.min(1, (s.eff - cur) / (nxt - cur)))
      },
      majors: majors, fines: fines, trend: trend, forecast: forecast,
      log: battleLog(data, t, s, majors, fines, trend, lv, nxt),
      body: loadBody(ranges.body || []), warnings: warnings
    };
  }

  return { compute: compute, toDayNum: toDayNum, num: num };
})();
if (typeof module !== 'undefined') module.exports = QSWeb;
