/* 戊日不上香 · 积分＋修仙升级体系（v602 修订版，2026-11-10）
 * 设计依据：~/workspace/wuri-app/points-leveling-design.md（修订版，唯一事实来源）。
 * 双币：修为只升级（永不消耗、永不倒扣）、灵石只消费（P1 只换数字物品）。
 * 时间制：1 修为/分钟。计时类打卡按实记分钟；计次类每次按 25 分钟标准；
 * 每日经文推荐按推荐分钟数；跟唱按段时长×档位系数（90+ 2.0／75+ 1.5／
 * 60+ 1.0／<60 0.5），段时长不足 1 分钟按 1 分钟计，修为四舍五入取整。
 * 灵石＝每次所得修为的一半（向下取整）；分享与里程碑另给固定灵石。
 * 跟唱重唱补差价：同一段同一天按当日最好成绩算，只补差价（新档位值 −
 * 已得值，高于 0 才补），低分/平分不得分；每段当日上限即最好档位值。
 * 本地先记账（localStorage wuri_points_v1），有后端时同步到
 * pay.shengboyu.ca /api/points/*（匿名 device_id，不登录、只传分数/动作、
 * 不传音频；同步失败不阻塞本地记账）。后端是同一份赚分表的第二道校验。
 * 连续天数取「修行打卡记录（wuri_daka_records）＋积分打卡事件＋续签补日」
 * 的并集：v602 之前攒的连续照算，不从零起。
 * 境界进阶 = 累计修为到门槛 ＋ 上一境顶部突破任务完成（失败不扣分、可反复试）。
 * 初一十五翻倍用 App 现有农历逻辑（Solar/lunarOf）判断农历初一/十五。
 * 颜色只走 CSS 变量链；文案走 i18n（points_*）。
 */
var WuriPoints = (function () {
  'use strict';

  /* ---------- 常量（与后端 worker.js POINTS_* 同源，改一处须同步改另一处） ---------- */
  var API = 'https://pay.shengboyu.ca/api/points';
  var LS_KEY = 'wuri_points_v1';
  var LS_DAKA_RECORDS = 'wuri_daka_records';
  var LS_DAKA_HABITS = 'wuri_daka_habits';
  var DAILY_XIU_CAP = 100;          /* 每日修为上限 */
  var COUNT_MINUTES = 25;           /* 计次类每次按 25 分钟标准计 */
  var RENEW_COST = 50;              /* 断签续签：50 灵石 */
  var RENEW_MONTH_LIMIT = 2;        /* 每月限 2 次 */
  var SHARE_LINGSHI = 5;            /* 分享成绩卡：5 灵石，每日限 1 次 */
  var REALMS = [
    { name: '炼气', min: 0,     task: null },
    { name: '筑基', min: 300,   task: { type: 'streak', n: 7 } },
    { name: '金丹', min: 1000,  task: { type: 'sing75', n: 1 } },
    { name: '元婴', min: 2500,  task: { type: 'streak', n: 30 } },
    { name: '化神', min: 5000,  task: { type: 'sing75', n: 10 } },
    { name: '返虚', min: 10000, task: { type: 'streak', n: 60 } },
    { name: '合体', min: 18000, task: { type: 'sing75', n: 25 } },
    { name: '大乘', min: 30000, task: { type: 'streak', n: 100 } },
    { name: '真仙', min: 50000, task: { type: 'sing75', n: 50 } },
    { name: '金仙', min: 80000, task: { type: 'streak', n: 180 } }
  ];
  /* 兑换目录 P1（只做数字物品；称号须达到对应境界才能换；建议价见设计文档） */
  var CATALOG = {
    wp_qingxuan:  { cost: 50, kind: 'wallpaper', realm: 0 },
    wp_jinguang:  { cost: 50, kind: 'wallpaper', realm: 0 },
    wp_fairy:     { cost: 50, kind: 'wallpaper', realm: 0 },
    emoji_fairy:  { cost: 30, kind: 'emoji',     realm: 0 },
    frame_teal:   { cost: 100, kind: 'frame',    realm: 0 },
    frame_gold:   { cost: 100, kind: 'frame',    realm: 0 },
    title_lianqi:   { cost: 200, kind: 'title',  realm: 0 },
    title_zhuji:    { cost: 200, kind: 'title',  realm: 1 },
    title_jindan:   { cost: 200, kind: 'title',  realm: 2 },
    title_yuanying: { cost: 200, kind: 'title',  realm: 3 }
  };
  var MILESTONES = {
    milestone7: { lingshi: 50, streak: 7 },
    milestone30: { lingshi: 200, streak: 30 }
  };

  /* ---------- 小工具 ---------- */
  function t(key) {
    try { if (typeof window.t === 'function') return window.t(key); } catch (e) {}
    return key;
  }
  /* t() 不支持插值；带 {n}/{realm} 的键一律走 tr(key, {n:.., realm:..}) */
  function tr(key, params) {
    var v = t(key);
    if (params) Object.keys(params).forEach(function (k) {
      v = v.split('{' + k + '}').join(String(params[k]));
    });
    return v;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function todayStr(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function parseDay(s) {
    var p = String(s || '').split('-');
    return new Date(+p[0], (+p[1] || 1) - 1, +p[2] || 1);
  }
  function addDays(dayStr, n) {
    var d = parseDay(dayStr);
    d.setDate(d.getDate() + n);
    return todayStr(d);
  }
  function uid() {
    return 'pt-' + Date.now().toString(36) + Math.floor(Math.random() * 0xffffff).toString(36);
  }
  /* 农历日（初一/十五判定）：优先 App 内置 lunar-javascript（Solar 全局），
   * 其次 app.js 的 lunarOf；都没有则返回 null（不翻倍，不报错）。 */
  function lunarDayOf(dayStr) {
    try {
      var p = String(dayStr).split('-');
      var y = +p[0], m = +p[1], d = +p[2];
      if (window.Solar && typeof Solar.fromYmd === 'function') {
        return Solar.fromYmd(y, m, d).getLunar().getDay();
      }
      if (typeof window.lunarOf === 'function') {
        return window.lunarOf(y, m, d).getDay();
      }
    } catch (e) {}
    return null;
  }
  function isDoubleDay(dayStr) {
    var d = lunarDayOf(dayStr || todayStr());
    return d === 1 || d === 15;
  }

  /* ---------- 账本 ---------- */
  function blankLedger() {
    return { v: 1, device: uid(), events: [], redeems: [], renewals: {},
             renewedDays: [], milestones: { m7: null, m30: null },
             activeTitle: null, server: null };
  }
  var ledger = blankLedger();
  function load() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      var d = JSON.parse(raw);
      if (d && d.v === 1 && Array.isArray(d.events)) {
        ledger = d;
        if (!ledger.device) ledger.device = uid();
        if (!Array.isArray(ledger.redeems)) ledger.redeems = [];
        if (!ledger.renewals) ledger.renewals = {};
        if (!Array.isArray(ledger.renewedDays)) ledger.renewedDays = [];
        if (!ledger.milestones) ledger.milestones = { m7: null, m30: null };
      }
    } catch (e) {}
  }
  function save() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(ledger)); } catch (e) {}
  }
  load();

  function totals() {
    var x = 0, l = 0;
    ledger.events.forEach(function (e) { x += e.x || 0; l += e.l || 0; });
    ledger.redeems.forEach(function (r) { l -= r.cost || 0; });
    return { xiuxing: x, lingshi: l };
  }
  function todayXiuxing(day) {
    day = day || todayStr();
    var s = 0;
    ledger.events.forEach(function (e) { if (e.day === day) s += e.x || 0; });
    return s;
  }
  function hasEvent(action, day, section, hid) {
    for (var i = 0; i < ledger.events.length; i++) {
      var e = ledger.events[i];
      if (e.action !== action || e.day !== day) continue;
      if (section != null && (!e.meta || e.meta.section !== section)) continue;
      if (hid != null && (!e.meta || e.meta.hid !== hid)) continue;
      return true;
    }
    return false;
  }
  function singEarned(sectionId, day) {
    var s = 0;
    ledger.events.forEach(function (e) {
      if (e.action === 'sing' && e.day === day && e.meta && e.meta.section === sectionId) s += e.x || 0;
    });
    return s;
  }
  /* 打卡日并集：修行打卡记录（v602 前的连续照算）＋积分打卡事件＋续签补日 */
  function checkinDays() {
    var set = {};
    try {
      var recs = JSON.parse(localStorage.getItem(LS_DAKA_RECORDS) || '[]');
      if (Array.isArray(recs)) recs.forEach(function (r) { if (r && r.date) set[r.date] = true; });
    } catch (e) {}
    ledger.events.forEach(function (e) { if (e.action === 'checkin') set[e.day] = true; });
    ledger.renewedDays.forEach(function (d) { set[d] = true; });
    return set;
  }
  function lastCheckinDay() {
    var set = checkinDays(), last = null;
    Object.keys(set).forEach(function (d) { if (last === null || d > last) last = d; });
    return last;
  }
  function streak() {
    var set = checkinDays();
    var today = todayStr();
    var cur = set[today] ? today : addDays(today, -1);
    var n = 0, start = null;
    while (set[cur]) { n++; start = cur; cur = addDays(cur, -1); }
    return { n: n, start: start };
  }
  function sing75Count() {
    var set = {};
    ledger.events.forEach(function (e) {
      if (e.action === 'sing' && e.meta && Number(e.meta.score) >= 75 && e.meta.section) {
        set[e.meta.section + '|' + e.day] = true;
      }
    });
    return Object.keys(set).length;
  }
  function taskDone(task) {
    if (!task) return true;
    if (task.type === 'streak') return streak().n >= task.n;
    if (task.type === 'sing75') return sing75Count() >= task.n;
    return false;
  }
  function taskProgress(task) {
    if (!task) return { have: 0, need: 0, done: true };
    var have = task.type === 'streak' ? streak().n : sing75Count();
    return { have: have, need: task.n, done: have >= task.n };
  }
  /* 纯函数：给定累计修为/连续/75+ 段数，算当前境界（供测试与 UI 共用） */
  function realmFor(total, streakN, sing75N) {
    var idx = 0;
    function done(task) {
      if (!task) return true;
      if (task.type === 'streak') return streakN >= task.n;
      if (task.type === 'sing75') return sing75N >= task.n;
      return false;
    }
    for (var i = 1; i < REALMS.length; i++) {
      if (total < REALMS[i].min) break;
      if (!done(REALMS[i - 1].task)) break;
      idx = i;
    }
    var cur = REALMS[idx], nxt = REALMS[idx + 1] || null;
    var p = 1, sub = '后期';
    if (nxt) {
      p = Math.max(0, Math.min(1, (total - cur.min) / (nxt.min - cur.min)));
      sub = p < 1 / 3 ? '初期' : (p < 2 / 3 ? '中期' : '后期');
    }
    return { idx: idx, name: cur.name, sub: sub, min: cur.min,
             next: nxt ? { name: nxt.name, min: nxt.min } : null,
             progress: p, task: cur.task };
  }
  function realmInfo() {
    var tot = totals();
    return realmFor(tot.xiuxing, streak().n, sing75Count());
  }

  /* ---------- 记账核心：先本地落账，再异步同步 ----------
   * award(action, baseX, meta, day)：baseX 为翻倍前修为；灵石 = 实际所得修为
   * 的一半（向下取整），除非 meta.fixedL 指定固定灵石（分享/里程碑；续签
   * 固定 −50 且不翻倍，meta.noDouble）。每日修为上限 100 截断修为部分，
   * 灵石按截断后的实际修为算。 */
  function award(action, baseX, meta, day) {
    day = day || todayStr();
    meta = meta || {};
    var dbl = isDoubleDay(day);
    var x = baseX * (dbl ? 2 : 1);
    var remain = DAILY_XIU_CAP - todayXiuxing(day);
    var xAward = Math.max(0, Math.min(x, remain));
    var capped = xAward < x;
    var l;
    if (meta.fixedL != null) l = meta.noDouble ? meta.fixedL : meta.fixedL * (dbl ? 2 : 1);
    else l = Math.floor(xAward / 2);
    if (xAward === 0 && l === 0) {
      return { awarded: false, reason: capped ? 'cap' : 'zero', x: 0, l: 0, double: dbl, capped: capped };
    }
    var ev = { id: uid(), day: day, action: action, x: xAward, l: l,
               meta: meta, ts: Date.now(), s: 0 };
    ev.meta.double = dbl;
    ledger.events.push(ev);
    save();
    syncPushSoon();
    renderCard();
    return { awarded: true, x: xAward, l: l, double: dbl, capped: capped, event: ev };
  }
  /* 跟唱档位系数：90+ 2.0／75+ 1.5／60+ 1.0／<60 0.5；修为四舍五入取整 */
  function singCoeff(score) {
    if (score >= 90) return 2;
    if (score >= 75) return 1.5;
    if (score >= 60) return 1;
    return 0.5;
  }
  function singTierValue(score, durationMin) {
    return Math.round(Math.max(1, durationMin) * singCoeff(score));
  }
  /* 跟唱补差价：同一段同一天按当日最好成绩算，只补差价（新档位值 − 已得值，
   * 高于 0 才补）；低分/平分不得分。durationMin 为段时长（分钟）。 */
  function awardSing(sectionId, score100, durationMin, opts) {
    opts = opts || {};
    var day = opts.day || todayStr();
    var sc = Math.max(0, Math.min(100, Number(score100) || 0));
    var dur = Number(durationMin) || 0;
    var expected = singTierValue(sc, dur);
    if (isDoubleDay(day)) expected = expected * 2;
    var already = singEarned(sectionId, day);
    var topUp = expected - already;
    if (topUp <= 0) {
      return { awarded: false, reason: 'no-better', x: 0, l: 0, expected: expected, already: already };
    }
    /* award() 内会再算翻倍：此处传翻倍前值（topUp 需除以翻倍系数还原） */
    var baseTopUp = isDoubleDay(day) ? topUp / 2 : topUp;
    var r = award('sing', baseTopUp,
      { section: sectionId, score: Math.round(sc * 10) / 10, duration_min: Math.round(dur * 100) / 100 }, day);
    r.expected = expected;
    r.already = already;
    return r;
  }
  function awardShare(day) {
    day = day || todayStr();
    if (hasEvent('share', day)) return { awarded: false, reason: 'dup', x: 0, l: 0 };
    return award('share', 0, { fixedL: SHARE_LINGSHI }, day);
  }
  /* 修行打卡（practice.js addRecord 每次调用）：计时类按实记分钟（secs/60
   * 四舍五入）；计次类每次 25 分钟标准，同习惯同日去重（早课/晚课每日各 1 次）。 */
  function habitType(hid) {
    try {
      var list = JSON.parse(localStorage.getItem(LS_DAKA_HABITS) || '[]');
      if (Array.isArray(list)) {
        for (var i = 0; i < list.length; i++) {
          if (list[i] && list[i].id === hid) return list[i].type || 'count';
        }
      }
    } catch (e) {}
    return 'count';
  }
  function awardPractice(hid, secs, day) {
    day = day || todayStr();
    /* 早课/晚课不走即时记账（第二次修订）：只认功课经验证流程（keEnd 结算）。
     * 纵深防御：任何旧路径直接调 awardPractice('zaoke'/'wanke') 都拒绝。 */
    if (KE_HABITS[hid]) return { awarded: false, reason: 'ke-flow', x: 0, l: 0 };
    var type = habitType(hid);
    if (type === 'timed') {
      var mins = Math.max(0, Math.round((secs || 0) / 60));
      if (mins <= 0) return { awarded: false, reason: 'zero', x: 0, l: 0 };
      var rt = award('checkin', mins, { hid: hid, kind: 'timed', minutes: mins }, day);
      if (rt.awarded) rt.milestones = checkMilestones(day);
      return rt;
    }
    if (hasEvent('checkin', day, null, hid)) {
      return { awarded: false, reason: 'dup', x: 0, l: 0 };
    }
    var r = award('checkin', COUNT_MINUTES, { hid: hid, kind: 'count', minutes: COUNT_MINUTES }, day);
    if (r.awarded) r.milestones = checkMilestones(day);
    return r;
  }
  /* 里程碑：连续 7/30 天各奖一次（按本波连续的起点去重，断签重开可再奖） */
  function checkMilestones(day) {
    day = day || todayStr();
    var st = streak(), got = [];
    if (st.n >= MILESTONES.milestone7.streak && ledger.milestones.m7 !== st.start) {
      var m7 = award('milestone7', 0, { fixedL: MILESTONES.milestone7.lingshi, streak_start: st.start }, day);
      if (m7.awarded) { ledger.milestones.m7 = st.start; got.push('milestone7'); save(); }
    }
    if (st.n >= MILESTONES.milestone30.streak && ledger.milestones.m30 !== st.start) {
      var m30 = award('milestone30', 0, { fixedL: MILESTONES.milestone30.lingshi, streak_start: st.start }, day);
      if (m30.awarded) { ledger.milestones.m30 = st.start; got.push('milestone30'); save(); }
    }
    return got;
  }
  /* ---------- 早课/晚课打卡验证（v602 第二次修订，设计文档第三节） ----------
   * 点一下不算：点早课/晚课 → 打开功课经（正一 s01／全真 s02，首次选传统，
   * 以后可改），早课定位早坛、晚课定位晚坛；从上划到当日功课部分的文末
   * （该部分覆盖率 ≥90%）并且本次阅读前台可见停留 ≥10 分钟 → 满 25 修为；
   * 只打开没划完也算打卡（不断签），按实际停留分钟 ×1（打开即最低 1），上限 25。
   * 停留只计前台可见时长（document.visibilityState + 阅读器正开着该经；
   * 切后台/锁屏/切走 tab 都不计——阅读器在 #tab-jing 内，切 tab 即 display:none）。
   * 实体书用户同样走此流程：App 只验证 App 内行为（打开、划到底、停留），
   * 书上内容靠自觉——荣誉制，与 v601 排名同一逻辑。
   * 记账口径：kind:'kegong'（服务端同名校验：minutes=可见分钟 1–25，
   * 满分须 done 且 minutes≥10；同习惯同日去重）。满分 25 修为＋12 灵石。 */
  var KE_FULL_MIN = 10;            /* 满分停留底线（分钟），防秒划到底，可调 */
  var KE_FULL_X = 25;              /* 满分修为（= 计次类 25 分钟标准） */
  var KE_DONE_FRAC = 0.90;         /* “划完”：当日功课部分覆盖率 ≥90% */
  var LS_KE_TRADITION = 'wuri_kegong_tradition';
  var LS_KE_SESSION = 'wuri_points_ke_session';
  var KE_PARTS = {                 /* 各传统早坛/晚坛的节序范围（含端点） */
    s01: { morning: [0, 37], evening: [38, 66] },   /* 正一：67 节 */
    s02: { morning: [0, 10], evening: [11, 18] }    /* 全真：19 节 */
  };
  var KE_HABITS = { zaoke: 'morning', wanke: 'evening' };

  function keTradition() {
    try {
      var v = localStorage.getItem(LS_KE_TRADITION);
      return (v === 's01' || v === 's02') ? v : null;
    } catch (e) { return null; }
  }
  function keSetTradition(sid) {
    if (sid !== 's01' && sid !== 's02') return false;
    try { localStorage.setItem(LS_KE_TRADITION, sid); } catch (e) {}
    return true;
  }
  /* 早课/晚课的目标经与节区（s06 只是早坛，不作晚课用，故不在此表） */
  function keTarget(hid) {
    var kind = KE_HABITS[hid];
    if (!kind) return null;
    var sid = keTradition();
    if (!sid) return null;
    var part = KE_PARTS[sid][kind];
    return { hid: hid, kind: kind, sid: sid, firstSec: part[0], lastSec: part[1],
             title: sid === 's01' ? '正一早晚功课经' : '全真早晚功课经' };
  }
  function keLoadSession() {
    try {
      var s = JSON.parse(localStorage.getItem(LS_KE_SESSION) || 'null');
      if (s && s.hid && s.day && s.sid && s.kind) return s;
    } catch (e) {}
    return null;
  }
  var keSession = keLoadSession();
  function keSaveSession() {
    try {
      if (keSession) { keSession.updatedAt = Date.now(); localStorage.setItem(LS_KE_SESSION, JSON.stringify(keSession)); }
      else localStorage.removeItem(LS_KE_SESSION);
    } catch (e) {}
  }
  function keStart(hid, day) {
    day = day || todayStr();
    if (!KE_HABITS[hid]) return { ok: false, reason: 'not-ke' };
    var t = keTarget(hid);
    if (!t) return { ok: false, reason: 'no-tradition' };
    if (hasEvent('checkin', day, null, hid)) return { ok: false, reason: 'dup' };
    if (keSession && keSession.day === day && keSession.hid === hid && !keSession.awarded) {
      keEnsureTicker();
      return { ok: true, resumed: true, session: keSession, target: t };
    }
    if (keSession && !keSession.awarded) keEnd('switch'); /* 旧会话（异常中断）先按已得结算 */
    keSession = { hid: hid, day: day, sid: t.sid, kind: t.kind,
                  visibleSecs: 0, done: false, lastFrac: 0, awarded: false, startedAt: Date.now() };
    keSaveSession();
    keEnsureTicker();
    return { ok: true, resumed: false, session: keSession, target: t };
  }
  var keTicker = 0, keTickCount = 0;
  function keEnsureTicker() {
    if (keTicker) return;
    try {
      keTicker = setInterval(function () { keTick(); }, 1000);
    } catch (e) {}
  }
  /* 前台可见判定：页面可见 ＋ 阅读器正渲染着本次会话的经
   * （getClientRects 为空 = 祖先 tab 被 display:none，即已切走，不计）。 */
  function keReaderActive() {
    if (!keSession || keSession.awarded) return false;
    try {
      if (document.visibilityState !== 'visible') return false;
      var r = document.getElementById('jing-reader');
      if (!r || r.hidden || !r.getClientRects || r.getClientRects().length === 0) return false;
      if (window._jingCurrentId !== keSession.sid) return false;
      return true;
    } catch (e) { return false; }
  }
  function keTick() {
    if (!keReaderActive()) return;
    keSession.visibleSecs += 1;
    keTickCount += 1;
    if (keTickCount % 15 === 0) keSaveSession(); /* 掉电不丢太多 */
    keMaybeComplete();
  }
  function keMaybeComplete() {
    if (!keSession || keSession.awarded) return false;
    if (keSession.done && keSession.visibleSecs >= KE_FULL_MIN * 60) {
      keEnd('auto');
      return true;
    }
    return false;
  }
  /* 阅读器每拍进度保存时调用（jingwen.js saveProgressNow）：更新划到底标记 */
  function keProgress(sid) {
    if (!keSession || keSession.awarded || !sid || sid !== keSession.sid) return null;
    var frac = null;
    try {
      if (typeof window.__wuriKePartCoverage === 'function') {
        var part = KE_PARTS[keSession.sid][keSession.kind];
        frac = window.__wuriKePartCoverage(sid, part[0], part[1]);
      }
    } catch (e) { frac = null; }
    if (frac == null) return null;
    keSession.lastFrac = frac;
    if (frac >= KE_DONE_FRAC) keSession.done = true;
    keSaveSession();
    keMaybeComplete();
    return { frac: frac, done: keSession.done, visibleSecs: keSession.visibleSecs };
  }
  /* 结算：满分（划完＋待够）25，否则按可见分钟 ×1（最低 1，上限 25）。
   * 失败（每日上限已满）不标记，留待重开续算。 */
  function keEnd(origin) {
    if (!keSession) return { awarded: false, reason: 'no-session', x: 0, l: 0 };
    var s = keSession;
    if (s.awarded) return { awarded: false, reason: 'dup', x: 0, l: 0 };
    var full = s.done && s.visibleSecs >= KE_FULL_MIN * 60;
    var visMin = Math.round(s.visibleSecs / 60);
    var scoreMin = Math.min(KE_FULL_X, Math.max(1, visMin));
    var x = full ? KE_FULL_X : scoreMin;
    var meta = { hid: s.hid, kind: 'kegong', minutes: full ? KE_FULL_X : scoreMin,
                 sid: s.sid, part: s.kind, done: !!s.done, visibleMin: visMin };
    var r = award('checkin', x, meta, s.day);
    if (r.awarded) {
      s.awarded = true;
      keSaveSession();
      writeDakaRecord(s.hid, s.visibleSecs, s.day);
      checkMilestones(s.day);
      try {
        window.dispatchEvent(new CustomEvent('wuri-ke-ended',
          { detail: { hid: s.hid, day: s.day, x: r.x, l: r.l, full: full,
                      done: !!s.done, visibleMin: visMin, capped: !!r.capped,
                      double: !!r.double, origin: origin || 'close' } }));
      } catch (e) {}
    }
    return r;
  }
  /* 功课经打卡也写一条 wuri_daka_records（修行页统计/热力图/小组件同源） */
  function writeDakaRecord(hid, secs, day) {
    try {
      var recs = JSON.parse(localStorage.getItem(LS_DAKA_RECORDS) || '[]');
      if (!Array.isArray(recs)) recs = [];
      recs.push({ hid: hid, date: day, secs: secs || 0, ts: Date.now() });
      localStorage.setItem(LS_DAKA_RECORDS, JSON.stringify(recs));
    } catch (e) {}
  }
  function keStatus(sid) {
    if (!keSession) return null;
    if (sid && keSession.sid !== sid) return null;
    return { hid: keSession.hid, kind: keSession.kind, sid: keSession.sid,
             visibleSecs: keSession.visibleSecs, visibleMin: Math.floor(keSession.visibleSecs / 60),
             done: !!keSession.done, lastFrac: keSession.lastFrac || 0,
             awarded: !!keSession.awarded, fullMin: KE_FULL_MIN, fullX: KE_FULL_X,
             day: keSession.day };
  }
  function keEndIfOtherSid(id) {
    if (keSession && !keSession.awarded && keSession.sid !== id) keEnd('switch');
  }
  /* 切后台/锁屏瞬间落盘（停留秒数不丢；恢复后 ticker 的可见判定继续把关） */
  try {
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') keSaveSession();
    });
  } catch (e) {}

  /* 今日经文推荐读完：sid/secIdx/分钟数须与今日推荐一致才记账（防刷：只认推荐本身）。
   * minutes 取推荐的封顶分钟数（recommendJing 已按 10 分钟封顶）。 */
  function todayRecommend() {
    try {
      if (typeof window.recommendJing !== 'function' || typeof window.lunarOf !== 'function') return null;
      var now = new Date();
      var l = window.lunarOf(now.getFullYear(), now.getMonth() + 1, now.getDate());
      return window.recommendJing(l);
    } catch (e) { return null; }
  }
  function onDailyJingRead(sid, secIdx) {
    var rec = todayRecommend();
    if (!rec || rec.sid !== sid) return { awarded: false, reason: 'not-today-rec', x: 0, l: 0 };
    if (rec.secIdx != null && secIdx !== rec.secIdx) return { awarded: false, reason: 'not-today-unit', x: 0, l: 0 };
    if (rec.secIdx == null && secIdx != null) return { awarded: false, reason: 'not-today-unit', x: 0, l: 0 };
    var day = todayStr();
    if (hasEvent('jing_read', day)) return { awarded: false, reason: 'dup', x: 0, l: 0 };
    var minutes = Math.max(1, Math.round(Number(rec.minutes) || 0));
    var r = award('jing_read', minutes, { sid: sid, sec: secIdx, minutes: minutes }, day);
    renderCard();
    return r;
  }
  /* 推荐读完判定（jingwen.js saveProgressNow 每拍调用）：用阅读器探针
   * __wuriExcerptCoverage 算推荐范围（节内起止字偏移，end 按段落切）的
   * 覆盖率，≥90% 即算读完；无度量数据时本拍不判（等节加载后再试）。 */
  function onDailyJingProgress(sid) {
    var rec = todayRecommend();
    if (!rec || rec.sid !== sid || rec.secIdx == null) return { awarded: false, reason: 'not-today-unit', x: 0, l: 0 };
    var day = todayStr();
    if (hasEvent('jing_read', day)) return { awarded: false, reason: 'dup', x: 0, l: 0 };
    var frac = null;
    try {
      if (typeof window.__wuriExcerptCoverage === 'function') {
        var chars = rec.excerptChars || rec.chars || 0;
        frac = window.__wuriExcerptCoverage(sid, rec.secIdx, rec.charOff || 0, chars);
      }
    } catch (e) { frac = null; }
    if (frac == null) return { awarded: false, reason: 'no-metrics', x: 0, l: 0 };
    if (frac < 0.9) return { awarded: false, reason: 'not-done', x: 0, l: 0 };
    return onDailyJingRead(sid, rec.secIdx);
  }

  /* ---------- 断签续签：断后 24 小时内（即断签次日当天）可续 1 次，每月限 2 次 ---------- */
  function canRenew() {
    var today = todayStr();
    if (hasEvent('checkin', today)) return { ok: false, reason: 'already' };
    var last = lastCheckinDay();
    if (last !== addDays(today, -2)) return { ok: false, reason: 'not-broken' };
    var mk = today.slice(0, 7);
    if ((ledger.renewals[mk] || 0) >= RENEW_MONTH_LIMIT) return { ok: false, reason: 'month-limit' };
    if (totals().lingshi < RENEW_COST) return { ok: false, reason: 'not-enough' };
    return { ok: true, missed: addDays(today, -1) };
  }
  function renewStreak() {
    var c = canRenew();
    if (!c.ok) return { ok: false, reason: c.reason };
    var today = todayStr(), mk = today.slice(0, 7);
    /* 扣 50 灵石：记一笔 renew 事件（服务端同名动作只接受 lingshi=-50，见 worker.js） */
    var ev = { id: uid(), day: today, action: 'renew', x: 0, l: -RENEW_COST,
               meta: { missed: c.missed, fixedL: -RENEW_COST, noDouble: true, double: false },
               ts: Date.now(), s: 0 };
    ledger.events.push(ev);
    ledger.renewedDays.push(c.missed);
    ledger.renewals[mk] = (ledger.renewals[mk] || 0) + 1;
    save();
    syncPushSoon();
    renderCard();
    return { ok: true, missed: c.missed };
  }

  /* ---------- 兑换 P1（只做数字物品；称号须达境界；一次购买永久拥有） ---------- */
  function isOwned(itemId) {
    return ledger.redeems.some(function (r) { return r.item === itemId; });
  }
  function redeem(itemId) {
    var item = CATALOG[itemId];
    if (!item) return { ok: false, reason: 'unknown-item' };
    if (isOwned(itemId)) return { ok: true, dup: true, item: itemId };
    var tot = totals();
    if (tot.xiuxing < REALMS[item.realm].min) {
      return { ok: false, reason: 'realm-locked', need: REALMS[item.realm].min };
    }
    if (tot.lingshi < item.cost) {
      return { ok: false, reason: 'not-enough', balance: tot.lingshi, cost: item.cost };
    }
    ledger.redeems.push({ item: itemId, cost: item.cost, ts: Date.now(), s: 0 });
    save();
    syncPushSoon();
    renderCard();
    return { ok: true, item: itemId, cost: item.cost, balance: tot.lingshi - item.cost };
  }
  function setActiveTitle(itemId) {
    if (!isOwned(itemId)) return { ok: false, reason: 'not-owned' };
    if (!CATALOG[itemId] || CATALOG[itemId].kind !== 'title') return { ok: false, reason: 'not-title' };
    ledger.activeTitle = itemId;
    save();
    renderCard();
    return { ok: true };
  }

  /* ---------- 后端同步（尽力而为：失败不阻塞本地；400 永久拒绝不再重试） ---------- */
  var syncTimer = 0, syncBusy = false;
  function syncPushSoon() {
    if (syncTimer) return;
    syncTimer = setTimeout(function () { syncTimer = 0; syncPush(); }, 1500);
  }
  function postJSON(url, body) {
    return fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json().catch(function () { return null; }); });
  }
  function syncPush() {
    if (syncBusy || typeof fetch !== 'function') return;
    var pendingE = ledger.events.filter(function (e) { return !e.s; });
    var pendingR = ledger.redeems.filter(function (r) { return !r.s; });
    if (!pendingE.length && !pendingR.length) { syncPull(); return; }
    syncBusy = true;
    var chain = Promise.resolve();
    pendingE.forEach(function (ev) {
      chain = chain.then(function () {
        return postJSON(API + '/award', {
          device_id: ledger.device, action: ev.action, xiuxing: ev.x,
          lingshi: ev.l, day: ev.day, meta: ev.meta
        }).then(function (r) {
          if (r && r.ok) ev.s = 1;
          else if (r && r.ok === false) ev.s = 2; /* 400 类永久拒绝：不再重试 */
        }).catch(function () { /* 网络失败：留待下次 */ });
      });
    });
    pendingR.forEach(function (rd) {
      chain = chain.then(function () {
        return postJSON(API + '/redeem', { device_id: ledger.device, item_id: rd.item })
          .then(function (r) { if (r && r.ok) rd.s = 1; else if (r && r.ok === false) rd.s = 2; })
          .catch(function () {});
      });
    });
    chain.then(function () { save(); syncBusy = false; syncPull(); })
      .catch(function () { syncBusy = false; });
  }
  function syncPull() {
    if (typeof fetch !== 'function') return;
    fetch(API + '/state?device_id=' + encodeURIComponent(ledger.device))
      .then(function (r) { return r.json(); })
      .then(function (r) {
        if (r && r.ok) { ledger.server = { xiuxing: r.xiuxing, lingshi: r.lingshi, streak: r.streak, ts: Date.now() }; save(); renderCard(); }
      })
      .catch(function () {});
  }

  /* ---------- 境界展示卡（我的页 #points-card-body；无容器时静默跳过） ---------- */
  function taskLabel(task) {
    if (!task) return '';
    if (task.type === 'streak') return tr('points_task_streak').replace('{n}', String(task.n));
    return tr('points_task_sing75').replace('{n}', String(task.n));
  }
  function renderCard() {
    var host = document.getElementById('points-card-body');
    if (!host) return;
    var tot = totals(), ri = realmInfo(), st = streak();
    var todayX = todayXiuxing();
    var unsynced = ledger.events.filter(function (e) { return !e.s; }).length +
      ledger.redeems.filter(function (r) { return !r.s; }).length;
    var tp = taskProgress(ri.task);
    var renew = canRenew();
    var activeTitle = ledger.activeTitle && CATALOG[ledger.activeTitle]
      ? tr('points_item_' + ledger.activeTitle) : '';
    var html = '<div class="points-bal-row">' +
      '<div class="points-bal"><b>' + tot.xiuxing + '</b><span>' + esc(tr('points_xiuxing')) + '</span></div>' +
      '<div class="points-bal"><b>' + tot.lingshi + '</b><span>' + esc(tr('points_lingshi')) + '</span></div>' +
      '<div class="points-bal"><b>' + st.n + '</b><span>' + esc(tr('points_streak')) + '</span></div>' +
      '<div class="points-bal"><b>' + todayX + '/' + DAILY_XIU_CAP + '</b><span>' + esc(tr('points_today')) + '</span></div>' +
      '</div>' +
      '<div class="points-realm"><span class="points-realm-name">' + esc(ri.name) + ' · ' + esc(ri.sub) + '</span>' +
      (activeTitle ? '<span class="points-title-active">' + esc(activeTitle) + '</span>' : '') + '</div>' +
      '<div class="points-progress"><div class="points-progress-bar" style="width:' +
      Math.round(ri.progress * 100) + '%"></div></div>' +
      '<p class="hint points-next">' + (ri.next
        ? esc(tr('points_next')) + ' ' + esc(ri.next.name) + ' · ' + tot.xiuxing + '/' + ri.next.min
        : esc(tr('points_realm_done'))) + '</p>';
    if (ri.task) {
      html += '<p class="hint points-task">' + esc(tr('points_breakthrough')) + '：' + esc(taskLabel(ri.task)) +
        '（' + tp.have + '/' + tp.need + '）' + (tp.done ? ' ✓' : '') + '</p>';
    }
    if (renew.ok) {
      html += '<div class="btn-row"><button class="btn small" id="points-renew-btn" type="button">' +
        esc(tr('points_renew')) + '</button></div>';
    } else if (renew.reason === 'month-limit' || renew.reason === 'not-enough') {
      html += '<p class="hint points-renew-note">' + esc(tr('points_renew_no')) + '</p>';
    }
    html += '<div class="points-redeem"><div class="row-title">' + esc(tr('points_redeem')) + '</div>';
    Object.keys(CATALOG).forEach(function (id) {
      var item = CATALOG[id];
      var owned = isOwned(id);
      var locked = tot.xiuxing < REALMS[item.realm].min;
      var poor = tot.lingshi < item.cost;
      var btn;
      if (item.kind === 'title' && owned) {
        btn = '<button class="btn small" data-points-title="' + esc(id) + '" type="button">' +
          esc(ledger.activeTitle === id ? tr('points_active') : tr('points_activate')) + '</button>';
      } else if (owned) {
        btn = '<span class="points-owned">' + esc(tr('points_owned')) + '</span>';
      } else if (locked) {
        btn = '<span class="points-locked">' + esc(tr('points_need_realm')).replace('{realm}', REALMS[item.realm].name) + '</span>';
      } else {
        btn = '<button class="btn small" data-points-redeem="' + esc(id) + '" type="button"' +
          (poor ? ' disabled' : '') + '>' + item.cost + ' ' + esc(tr('points_lingshi')) + '</button>';
      }
      html += '<div class="points-item"><span class="points-item-name">' + esc(tr('points_item_' + id)) +
        '<i>' + esc(tr('points_cat_' + item.kind)) + '</i></span>' + btn + '</div>';
    });
    html += '</div>';
    html += '<p class="hint small points-sync">' +
      (unsynced ? esc(tr('points_unsynced')).replace('{n}', String(unsynced)) : esc(tr('points_synced'))) +
      (ledger.server ? ' · ' + esc(tr('points_server')) + ' ' + ledger.server.xiuxing + '/' + ledger.server.lingshi : '') +
      '</p>';
    host.innerHTML = html;
    var rb = document.getElementById('points-renew-btn');
    if (rb) rb.addEventListener('click', function () {
      var r = renewStreak();
      if (r.ok) renderCard();
    });
    host.querySelectorAll('[data-points-redeem]').forEach(function (b) {
      b.addEventListener('click', function () { redeem(b.getAttribute('data-points-redeem')); });
    });
    host.querySelectorAll('[data-points-title]').forEach(function (b) {
      b.addEventListener('click', function () { setActiveTitle(b.getAttribute('data-points-title')); });
    });
  }

  /* 我的页切到可见时再渲染一次（卡片在 tab-me 内，首屏不一定挂载） */
  function bind() {
    renderCard();
    document.addEventListener('click', function () {
      var tab = document.getElementById('tab-me');
      if (tab && !tab.hidden && tab.offsetParent !== null) renderCard();
    });
    setTimeout(function () { syncPush(); }, 2000);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }

  return {
    awardPractice: awardPractice, onDailyJingRead: onDailyJingRead,
    onDailyJingProgress: onDailyJingProgress,
    keTradition: keTradition, keSetTradition: keSetTradition, keTarget: keTarget,
    keStart: keStart, keEnd: keEnd, keStatus: keStatus, keProgress: keProgress,
    keEndIfOtherSid: keEndIfOtherSid, keReaderActive: keReaderActive, keTick: keTick,
    awardSing: awardSing, awardShare: awardShare,
    renewStreak: renewStreak, canRenew: canRenew,
    redeem: redeem, setActiveTitle: setActiveTitle,
    isOwned: isOwned, totals: totals, todayXiuxing: todayXiuxing,
    streak: streak, sing75Count: sing75Count, realmInfo: realmInfo,
    isDoubleDay: isDoubleDay, renderCard: renderCard,
    getDevice: function () { return ledger.device; },
    getLedger: function () { return ledger; },
    /* 供冒烟测试的纯函数／探针（生产不调用） */
    _test: {
      REALMS: REALMS, CATALOG: CATALOG, MILESTONES: MILESTONES,
      DAILY_XIU_CAP: DAILY_XIU_CAP, COUNT_MINUTES: COUNT_MINUTES,
      RENEW_COST: RENEW_COST, RENEW_MONTH_LIMIT: RENEW_MONTH_LIMIT,
      singCoeff: singCoeff, singTierValue: singTierValue,
      realmFor: realmFor, isDoubleDay: isDoubleDay,
      lunarDayOf: lunarDayOf, todayStr: todayStr, addDays: addDays,
      KE_FULL_MIN: KE_FULL_MIN, KE_FULL_X: KE_FULL_X, KE_DONE_FRAC: KE_DONE_FRAC,
      KE_PARTS: KE_PARTS, KE_HABITS: KE_HABITS,
      keTradition: keTradition, keSetTradition: keSetTradition, keTarget: keTarget,
      keStart: keStart, keEnd: keEnd, keStatus: keStatus, keProgress: keProgress,
      keEndIfOtherSid: keEndIfOtherSid, keReaderActive: keReaderActive, keTick: keTick,
      getKeSession: function () { return keSession; },
      setKeSession: function (d) { keSession = d; keSaveSession(); },
      totals: totals, streak: streak, sing75Count: sing75Count,
      realmInfo: realmInfo, taskProgress: taskProgress,
      reset: function () { ledger = blankLedger(); save(); },
      setLedger: function (d) { ledger = d; save(); },
      getLedger: function () { return ledger; }
    }
  };
})();
