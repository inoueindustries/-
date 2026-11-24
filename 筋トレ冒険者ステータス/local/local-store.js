/* 筋トレクエスト：スマホ保存版の「データのおき場」。
 * きろくを スマホの中（localStorage）に しまい、スプシと同じ形の表（ranges）を作って QSWeb.compute に わたす。
 * スプシの式（総ボリューム・基礎EXP・きょうの栄養アドバイス）と 同じ計算を ここで行う。
 * 種目・食材のマスタは build のときに QS_SEED として うめこむ（local/seed_src.txt から）。 */
var QSLocal = (function () {
  var KEY = 'qs.local.v1';
  var SEED = (typeof QS_SEED !== 'undefined') ? QS_SEED : { master: [], coef: {}, food: [] };
  var FINE_HEAD = ['僧帽筋(上部)', '三角筋・前部', '三角筋・中部', '三角筋・後部', '大胸筋・上部', '大胸筋・中部', '大胸筋・下部', '広背筋・大円筋', '僧帽筋中下部・脊柱起立筋',
    '上腕二頭筋', '上腕三頭筋', '前腕・上腕筋・腕橈骨筋', '大腿四頭筋', 'ハムストリングス・大臀筋', '下腿三頭筋', '腹直筋', '腹斜筋・腹横筋'];
  var DEFAULT_TARGET = { kcal: 1800, p: 130, f: 50, c: 205, fiber: 22, salt: 7.5 };
  var DEFAULT_BW = 60;   // 体重が まだ ないときに 自重の種目で 使う 仮の体重

  var data = null;
  function blank() { return { v: 1, log: [], body: [], meal: [], target: {}, foods: [], seq: 1, created: Date.now() }; }
  function load() {
    if (data) return data;
    try { data = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { data = null; }
    if (!data || typeof data !== 'object') data = blank();
    ['log', 'body', 'meal', 'foods'].forEach(function (k) { if (!Array.isArray(data[k])) data[k] = []; });
    if (!data.target || typeof data.target !== 'object') data.target = {};
    if (!(data.seq > 0)) data.seq = 1;
    return data;
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); data.savedAt = Date.now(); return true; }
    catch (e) { return false; }
  }
  // iPhone の Safari は しばらく ひらかないと データを けすことがある。「けさないで」と おねがいしておく
  function persist() {
    try { if (navigator.storage && navigator.storage.persist) return navigator.storage.persist(); } catch (e) {}
    return Promise.resolve(false);
  }
  function hasData() { var d = load(); return d.log.length + d.body.length + d.meal.length > 0; }
  function target() { var d = load(), t = {}; Object.keys(DEFAULT_TARGET).forEach(function (k) { t[k] = d.target[k] > 0 ? d.target[k] : DEFAULT_TARGET[k]; }); return t; }
  function setTarget(t) { var d = load(); Object.keys(DEFAULT_TARGET).forEach(function (k) { var v = Number(t[k]); if (v > 0) d.target[k] = v; }); return save(); }

  // ---- 日付 ----
  function ymd(s) {   // "2026-11-24" "2026/11/24" → "2026/11/24"
    var m = String(s || '').match(/(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
    return m ? m[1] + '/' + ('0' + m[2]).slice(-2) + '/' + ('0' + m[3]).slice(-2) : '';
  }
  function todayYmd() {
    var p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    return ymd(p);
  }
  var r1 = function (x) { return Math.round(x * 10) / 10; };
  var n0 = function (x) { var v = Number(x); return isFinite(v) ? v : 0; };

  // ---- 種目のマスタ ----
  var EXP_MUL = {}, PART = {};
  SEED.master.forEach(function (m) { EXP_MUL[m[1]] = Number(m[2]); PART[m[1]] = m[0]; });
  function bodyWeightOn(date) {   // その日 まで（その日をふくむ）で いちばん新しい 体重。なければ いちばん古い 体重、それもなければ 仮の体重
    var list = load().body.filter(function (b) { return b.w > 0; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    if (!list.length) return DEFAULT_BW;
    var hit = null;
    list.forEach(function (b) { if (b.date <= date) hit = b; });
    return (hit || list[0]).w;
  }
  // スプシの J〜N列と同じ：実質負荷 = 体重×自重係数 + 重量、総ボリューム = 実質負荷×回数×セット、基礎EXP = 総ボリューム×EXP倍率（有酸素・リカバリーは 50）
  function calcLog(e) {
    var info = SEED.coef[e.ex] || ['ウェイト', 0];
    var part = e.part || PART[e.ex] || '';
    if (info[0] === '有酸素運動' || info[0] === 'リカバリー' || !(e.r > 0)) {
      return { load: '', vol: '', exp: part === '有酸素・リカバリー' ? 50 : 0 };
    }
    var ld = r1(bodyWeightOn(e.date) * n0(info[1]) + n0(e.w));
    var vol = ld * e.r * (e.s || 1);
    var mul = EXP_MUL[e.ex] != null && !isNaN(EXP_MUL[e.ex]) ? EXP_MUL[e.ex] : 0.2;
    return { load: ld, vol: vol, exp: vol > 0 ? Math.round(vol * mul) : (part === '有酸素・リカバリー' ? 50 : 0) };
  }

  // ---- スプシと同じ形の表を作る ----
  function ranges() {
    var d = load(), t = target();
    var status = [['', '', '', '', '', '', '', 'プレイヤー名', 'ぼうけんしゃ']];
    var master = [['マスタ'], ['大部位', '種目名', '基礎EXP倍率', '推奨負荷・重量＆回数目安', 'メイン刺激部位と負荷のかけ方のコツ'].concat(FINE_HEAD)]
      .concat(SEED.master.map(function (m) { return [m[0], m[1], m[2], m[3], m[4]].concat(m[5].map(function (p) { return p + '%'; })); }));
    var log = [['', '日付', '部位', '種目名', '', '重量 / 加重 (kg)', '回数 (Reps)', 'セット数', '', '実質負荷重量 (kg)', '総ボリューム (kg)', '時間・距離', '', '基礎獲得EXP']]
      .concat(d.log.map(function (e) {
        var c = calcLog(e);
        return ['', e.date, e.part || PART[e.ex] || '', e.ex, '', e.w || 0, e.r || '', e.r ? (e.s || 1) : '', '', c.load, c.vol, e.memo || '', '', c.exp];
      }));
    var body = [['', '日付', '測定時刻', '体重 (kg)', '体脂肪率 (%)', '筋肉率 (%)']]
      .concat(d.body.map(function (b) { return ['', b.date, '', b.w || '', b.f || '', b.m || '']; }));
    var meal = [['', '日付', '区分', 'メニュー', 'カロリー (kcal)', 'タンパク質 (g)', '脂質 (g)', '炭水化物 (g)', '食物繊維 (g)', '食塩相当量 (g)']]
      .concat(d.meal.map(function (x) { return ['', x.date, x.kind, x.menu, x.kcal, x.p, x.f, x.c, x.fiber, x.salt]; }));
    var food = [['カテゴリ', '食材', '1回量', 'カロリー (kcal)', 'タンパク質 P (g)', '脂質 F (g)', '炭水化物 C (g)', '食物繊維 (g)', '食塩相当量 (g)']]
      .concat(SEED.food.concat(d.foods.map(function (f) { return [f.cat || 'マイ食材', f.name, f.unit || '', f.kcal, f.p, f.f, f.c, f.fiber, f.salt]; })));
    return { status: status, master: master, log: log, body: body, meal: meal, dash: dash(d, t), food: food };
  }
  // ダッシュボードの「きょうの栄養バランス＆食事アドバイス」と同じ文を作る（スプシの式を そのまま うつしたもの）
  function dash(d, T) {
    var td = todayYmd(), sum = { kcal: 0, p: 0, f: 0, c: 0, fiber: 0, salt: 0 };
    d.meal.forEach(function (x) { if (x.date === td) Object.keys(sum).forEach(function (k) { sum[k] += n0(x[k]); }); });
    Object.keys(sum).forEach(function (k) { sum[k] = r1(sum[k]); });
    var E = {}; Object.keys(sum).forEach(function (k) { E[k] = r1(sum[k] - T[k]); });
    var neg = function (v) { return r1(-v); };
    var judge = {
      kcal: sum.kcal === 0 ? '—' : (E.kcal > 0 ? '⚠️ ' + E.kcal + 'kcal オーバー' : 'あと ' + neg(E.kcal) + 'kcal'),
      p: E.p >= 0 ? '✅ 達成' : 'あと ' + neg(E.p) + 'g',
      f: E.f > 0 ? '⚠️ ' + E.f + 'g オーバー' : 'あと ' + neg(E.f) + 'g まで',
      c: E.c > 0 ? '⚠️ ' + E.c + 'g オーバー' : 'あと ' + neg(E.c) + 'g',
      fiber: E.fiber >= 0 ? '✅ 達成' : 'あと ' + neg(E.fiber) + 'g',
      salt: E.salt > 0 ? '⚠️ ' + E.salt + 'g オーバー' : '✅ 範囲内（あと ' + neg(E.salt) + 'g）'
    };
    var names = { kcal: 'カロリー (kcal)', p: 'タンパク質 (g)', f: '脂質 (g)', c: '炭水化物 (g)', fiber: '食物繊維 (g)', salt: '食塩相当量 (g)' };
    var lack, over, adv, sug;
    if (sum.kcal === 0) lack = '（今日の食事はまだ記録されていません）';
    else { var l = [E.p < 0 ? 'たんぱく質 ' + neg(E.p) + 'g' : '', E.fiber < 0 ? '食物繊維 ' + neg(E.fiber) + 'g' : ''].filter(Boolean).join('、'); lack = l || 'なし（目標クリア）'; }
    over = [E.kcal > 0 ? 'カロリー +' + E.kcal + 'kcal' : '', E.f > 0 ? '脂質 +' + E.f + 'g' : '', E.c > 0 ? '炭水化物 +' + E.c + 'g' : '', E.salt > 0 ? '塩分 +' + E.salt + 'g' : ''].filter(Boolean).join('、') || 'なし';
    if (sum.kcal === 0) adv = 'まず今日の食事を記録しましょう。';
    else {
      adv = [
        E.p <= -20 ? '・たんぱく質があと' + neg(E.p) + 'g。目安：鶏むね肉100gで約23g、卵1個で約6g、納豆1パックで約8g、プロテイン1杯で約20g。' : (E.p < 0 ? '・たんぱく質はあと' + neg(E.p) + 'g。卵や納豆を1品足せば届きます。' : ''),
        E.p < 0 && T.kcal - sum.kcal < 300 ? '・残りカロリーが少ないので、ささみ・ツナ水煮・プロテインなど低脂質のたんぱく源で補いましょう。' : '',
        E.fiber <= -5 ? '・食物繊維があと' + neg(E.fiber) + 'g。納豆・海藻・きのこ・豆類・もち麦を足しましょう。' : '',
        E.f > 0 ? '・脂質が目安を超えています。次の食事は揚げ物を避け、蒸す・焼く調理に。' : '',
        E.salt > 0 ? '・塩分が上限を超えています。汁物は具だけにして、水分とカリウム（野菜・バナナ）を意識しましょう。' : '',
        E.kcal > 0 ? '・カロリーが' + E.kcal + 'kcalオーバー。次の食事は主食を半分にして、たんぱく質中心に。' : ''
      ].filter(Boolean).join('\n') || 'この調子です。目標の範囲に収まっています。';
    }
    if (E.p >= 0) sug = 'たんぱく質は達成済みです。';
    else {
      var rem = Math.max(T.kcal - sum.kcal, 0);
      var cand = d.meal.filter(function (x) { return n0(x.kcal) > 0 && n0(x.kcal) <= rem && n0(x.p) >= 15 && !/ビール|ハイボール|チューハイ|酒|ワイン/.test(x.menu || ''); })
        .sort(function (a, b) { return n0(b.p) - n0(a.p); });
      sug = cand.length ? cand[0].menu + '（' + cand[0].kcal + 'kcal・たんぱく質 ' + cand[0].p + 'g）' : '残りカロリーに収まる記録が見つかりません。';
    }
    var rows = [[], ['', '目標指標', '目標値'], ['', '日次カロリー', T.kcal + ' kcal'], ['', 'タンパク質', T.p + ' g'], [],
      ['', '栄養素', '目標', 'きょうの摂取', '過不足', '判定']];
    ['kcal', 'p', 'f', 'c', 'fiber', 'salt'].forEach(function (k) { rows.push(['', names[k], String(T[k]), String(sum[k]), String(E[k]), judge[k]]); });
    rows.push([], ['', '不足している栄養素', lack], ['', 'とりすぎ注意', over], ['', 'アドバイス', adv], ['', '記録からのおすすめ', sug]);
    return rows;
  }

  // ---- 書きこみ（行の番号は 表の 行番号：見出しが1行め なので データの i 番めは i+2） ----
  function at(list, row) { var i = Number(row) - 2; return i >= 0 && i < list.length ? i : -1; }
  function digits(s) { return String(s || '').split(/\D+/).filter(Boolean).map(Number).join('/'); }
  function addLog(rec) {
    var d = load(), e = { id: d.seq++, date: ymd(rec.date), part: rec.part || PART[rec.ex] || '', ex: rec.ex, w: n0(rec.w), r: rec.r === '' || rec.r == null ? '' : n0(rec.r), s: n0(rec.s) || 1, memo: rec.memo || '' };
    if (!e.date || !e.ex) return 'ひづけと しゅもくを えらんでください。';
    d.log.push(e);
    return save() ? null : 'スマホの おき場が いっぱいで ほぞんできませんでした。';
  }
  function changeLog(action, rec) {
    var d = load(), i = at(d.log, rec.row);
    if (i < 0 || d.log[i].ex !== rec.ex0 || digits(d.log[i].date) !== digits(rec.date0)) return 'きろくが かわっています。よみこみ直してから もういちど ためしてください。';
    if (action === 'delete') d.log.splice(i, 1);
    else { var o = d.log[i]; o.date = ymd(rec.date); o.ex = rec.ex; o.part = rec.part || PART[rec.ex] || ''; o.w = n0(rec.w); o.r = rec.r === '' || rec.r == null ? '' : n0(rec.r); o.s = n0(rec.s) || 1; o.memo = rec.memo || ''; }
    return save() ? null : 'ほぞんできませんでした。';
  }
  function mealOf(rec, id) { return { id: id, date: ymd(rec.date), kind: rec.kind || '', menu: String(rec.menu || '').slice(0, 200), kcal: n0(rec.kcal), p: n0(rec.p), f: n0(rec.f), c: n0(rec.c), fiber: n0(rec.fiber), salt: n0(rec.salt) }; }
  function changeMeal(action, rec, old) {
    var d = load();
    if (action === 'add') { d.meal.push(mealOf(rec, d.seq++)); return save() ? null : 'ほぞんできませんでした。'; }
    var i = at(d.meal, old.row);
    if (i < 0 || d.meal[i].menu !== old.menu || d.meal[i].date !== ymd(old.date)) return 'きろくが かわっています。よみこみ直してから もういちど ためしてください。';
    if (action === 'delete') d.meal.splice(i, 1); else d.meal[i] = mealOf(rec, d.meal[i].id);
    return save() ? null : 'ほぞんできませんでした。';
  }
  // 体重：おなじ日の きろくが あれば うわがき
  function addBody(rec) {
    var d = load(), date = ymd(rec.date), w = n0(rec.w);
    if (!date || !(w >= 20 && w <= 300)) return '体重は 20〜300kg で いれてください。';
    var o = { id: d.seq++, date: date, w: r1(w), f: rec.f ? r1(n0(rec.f)) : '', m: rec.m ? r1(n0(rec.m)) : '' };
    var i = -1; d.body.forEach(function (b, k) { if (b.date === date) i = k; });
    if (i >= 0) { o.id = d.body[i].id; d.body[i] = o; } else d.body.push(o);
    d.body.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    return save() ? null : 'ほぞんできませんでした。';
  }
  function deleteBody(id) { var d = load(); d.body = d.body.filter(function (b) { return b.id !== id; }); return save() ? null : 'ほぞんできませんでした。'; }
  function bodyRecent() { return load().body.slice(-10).reverse(); }

  // ---- バックアップ ----
  function exportJson() { var d = load(); return JSON.stringify({ app: 'muscle-quest', v: 1, exportedAt: new Date().toISOString(), data: d }); }
  function importJson(text) {
    var j; try { j = JSON.parse(text); } catch (e) { return 'ファイルの 中身が よめませんでした。'; }
    var d = j && j.app === 'muscle-quest' ? j.data : null;
    if (!d || !Array.isArray(d.log) || !Array.isArray(d.meal) || !Array.isArray(d.body)) return 'この アプリの バックアップでは ないようです。';
    data = d; load();
    return save() ? null : 'ほぞんできませんでした。';
  }
  function csvCell(v) { var s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function toCsv(rows) { return '﻿' + rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n'); }
  function exportCsv(kind) {
    var d = load();
    if (kind === 'log') return toCsv([['日付', '部位', '種目', '重量(kg)', '回数', 'セット', '時間・距離', '総ボリューム(kg)', '基礎EXP']].concat(d.log.map(function (e) { var c = calcLog(e); return [e.date, e.part, e.ex, e.w, e.r, e.r ? e.s : '', e.memo, c.vol, c.exp]; })));
    if (kind === 'meal') return toCsv([['日付', '区分', 'メニュー', 'カロリー(kcal)', 'たんぱく質(g)', '脂質(g)', '炭水化物(g)', '食物繊維(g)', '塩分(g)']].concat(d.meal.map(function (x) { return [x.date, x.kind, x.menu, x.kcal, x.p, x.f, x.c, x.fiber, x.salt]; })));
    return toCsv([['日付', '体重(kg)', '体脂肪率(%)', '筋肉率(%)']].concat(d.body.map(function (b) { return [b.date, b.w, b.f, b.m]; })));
  }
  function wipe() { data = blank(); return save(); }
  function counts() { var d = load(); return { log: d.log.length, meal: d.meal.length, body: d.body.length }; }

  return { ranges: ranges, addLog: addLog, changeLog: changeLog, changeMeal: changeMeal, addBody: addBody, deleteBody: deleteBody, bodyRecent: bodyRecent,
    target: target, setTarget: setTarget, exportJson: exportJson, importJson: importJson, exportCsv: exportCsv, wipe: wipe, counts: counts,
    hasData: hasData, persist: persist, todayYmd: todayYmd, calcLog: calcLog, _reset: function () { data = null; } };
})();
if (typeof module !== 'undefined') module.exports = QSLocal;
