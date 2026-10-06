/* 戊日不上香 · 主逻辑（历法全部来自 lunar-javascript，离线） */
(function () {
'use strict';
var $ = function (s) { return document.querySelector(s); };
var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
var WEEK = ['日', '一', '二', '三', '四', '五', '六'];
var BAJIE = ['立春', '春分', '立夏', '夏至', '立秋', '秋分', '立冬', '冬至'];
/* 进阶提醒标签走 i18n（adv_ 前缀键） */
function advLabel(k) { return k === 'chuyishiwu' ? t('adv_cysw') : t('adv_' + k); }

/* ---------------- 设置 ---------------- */
var DEFAULTS = {
  tz: 'auto',
  theme: 'auto', // auto=跟随系统 day=白天宣纸 night=黑夜玄黑
  // kinds: 多选 ['day1'=提前1天 'today'=当天 'custom'=自选偏移]；offsetMin 仅 custom 有效（分钟）
  wu: { on: true, kinds: ['day1'], offsetMin: 0, time: '17:00' },
  baidou: { on: false },
  anwu: { on: false }, // 暗戊提醒：独立开关，默认关闭；开启时与戊日提醒同一时间、同一提醒时机发出
  advTiming: { kinds: ['today'], offsetMin: 0 }, // 进阶提醒时机
  adv: { gengshen: false, jiazi: false, chuyishiwu: false, bajie: false, sanyuan: false, wula: false, shendan: false }
};
/* 旧版配置迁移：kinds 数组（多选）/ 单选 kind / days 数组 / 最旧版数字，统一为 kinds+offsetMin */
function normalizeKind(x, fbKinds, fbOff) {
  function cleanKinds(ks) {
    var out = [];
    (ks || []).forEach(function (k) {
      if ((k === 'today' || k === 'day1' || k === 'custom') && out.indexOf(k) < 0) out.push(k);
    });
    return out.length ? out : fbKinds.slice();
  }
  if (x && typeof x === 'object') {
    if (Array.isArray(x.kinds)) { // 已是多选版
      x.kinds = cleanKinds(x.kinds);
      x.offsetMin = Math.max(0, parseInt(x.offsetMin, 10) || 0);
      delete x.kind; delete x.days; delete x.adv; delete x.mode;
      if (!x.time) x.time = '17:00';
      return x;
    }
    var kinds = null, off = 0;
    if (x.kind === 'today' || x.kind === 'day1' || x.kind === 'custom') { // v1.1.3 单选版
      kinds = [x.kind]; off = Math.max(0, parseInt(x.offsetMin, 10) || 0);
    } else if (Array.isArray(x.days)) { // v1.1.2 多选版 days：0=当天 1=提前1天 2/3=自定义天数
      kinds = [];
      x.days.forEach(function (v) {
        v = parseInt(v, 10);
        if (v === 0 && kinds.indexOf('today') < 0) kinds.push('today');
        else if (v === 1 && kinds.indexOf('day1') < 0) kinds.push('day1');
        else if (v >= 2) { if (kinds.indexOf('custom') < 0) kinds.push('custom'); off = Math.max(off, v * 1440); }
      });
      kinds = cleanKinds(kinds);
    } else if (typeof x.adv !== 'undefined') { // 最旧版：adv 数字=提前天数
      kinds = ['custom']; off = (parseInt(x.adv, 10) || 0) * 1440;
    } else if (typeof x.mode !== 'undefined') { // 中间版：mode 0=当天 1=提前1天
      kinds = [x.mode === 0 ? 'today' : 'day1'];
    } else { kinds = fbKinds.slice(); off = fbOff; }
    delete x.kind; delete x.days; delete x.adv; delete x.mode;
    if (!x.time) x.time = '17:00';
    x.kinds = kinds; x.offsetMin = off;
    return x;
  }
  return { kinds: fbKinds.slice(), offsetMin: fbOff, time: '17:00' };
}
function loadCfg() {
  var c;
  try { c = JSON.parse(localStorage.getItem(CFG_KEY) || '{}'); } catch (e) { c = {}; }
  var wu = normalizeKind(c.wu, ['day1'], 0);
  var advTiming = normalizeKind(c.advTiming ? c.advTiming : (c.advDays ? { days: c.advDays } : null), ['today'], 0);
  var d = {
    lang: c.lang || DEFAULTS.lang,
    tz: c.tz || DEFAULTS.tz,
    theme: c.theme || DEFAULTS.theme,
    wu: { on: !(c.wu && c.wu.on === false), kinds: wu.kinds, offsetMin: wu.offsetMin, time: (c.wu && c.wu.time) || '17:00' },
    baidou: { on: !!(c.baidou && c.baidou.on) },
    anwu: { on: !!(c.anwu && c.anwu.on) },
    advTiming: { kinds: advTiming.kinds, offsetMin: advTiming.offsetMin },
    adv: Object.assign({}, DEFAULTS.adv, (c.adv || {}))
  };
  return d;
}
var CFG_KEY = 'wuri_cfg_v1';
var CFG = loadCfg();
function saveCfg() { try { localStorage.setItem('wuri_cfg_v1', JSON.stringify(CFG)); } catch (e) {} }

/* ---------------- 时间（支持北京时间模式） ---------------- */
function now() {
  var n = new Date();
  if (CFG.tz === 'beijing') return new Date(n.getTime() + (n.getTimezoneOffset() + 480) * 60000);
  return n;
}
function ymd(d) { return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() }; }
function sameDay(a, b) { return a.y === b.y && a.m === b.m && a.d === b.d; }
function fmtMD(o) { return o.m + '月' + o.d + '日'; }
function lunarOf(y, m, d) { return Solar.fromYmd(y, m, d).getLunar(); }
function isWuDay(y, m, d) { return lunarOf(y, m, d).getDayGan() === '戊'; }
/* 暗戊日：日干非戊 且 日支 ∈ {寅,辰,巳,申,戌}（地支藏干见戊）；明戊优先判定 */
var ANWU_ZHI = ['寅', '辰', '巳', '申', '戌'];
function isAnWuDay(y, m, d) {
  var l = lunarOf(y, m, d);
  return l.getDayGan() !== '戊' && ANWU_ZHI.indexOf(l.getDayZhi()) >= 0;
}
function gzDay(y, m, d) { var l = lunarOf(y, m, d); return l.getDayGan() + l.getDayZhi(); }

/* ---------------- 原生桥（Capacitor LocalNotifications，iOS/Android 共用） ---------------- */
function cap() { return window.Capacitor || null; }
function isNative() {
  var c = cap();
  return !!(c && c.isNativePlatform && c.isNativePlatform());
}
function isIOS() {
  var c = cap();
  return isNative() && c.getPlatform && c.getPlatform() === 'ios';
}
function LN() {
  var c = cap();
  return (c && c.Plugins && c.Plugins.LocalNotifications) || null;
}
function nativePerms() {
  // 统一为 Promise：{ notif:'granted'|'prompt'|'denied', exactAlarm:boolean }
  var ln = LN();
  if (!ln) return Promise.resolve({ notif: 'unknown', exactAlarm: true });
  return ln.checkPermissions().then(function (st) {
    return { notif: st.display || 'unknown', exactAlarm: isIOS() ? true : true };
  }).catch(function () { return { notif: 'unknown', exactAlarm: false }; });
}

/* ---------------- Tab 切换 ---------------- */
$$('#tabbar button').forEach(function (btn) {
  btn.addEventListener('click', function () {
    $$('#tabbar button').forEach(function (b) { b.classList.remove('active'); });
    btn.classList.add('active');
    $$('.tab').forEach(function (t) { t.classList.remove('active'); });
    $('#' + btn.getAttribute('data-tab')).classList.add('active');
    // 切换标签时隐藏六爻等独立视图，防止内容泄漏
    ['view-liuyao'].forEach(function (vid) {
      var v = document.getElementById(vid);
      if (v) v.hidden = true;
    });
    updateFloatingButtons();
    if (btn.getAttribute('data-tab') === 'tab-remind') refreshPermUI();
    window.scrollTo(0, 0);
  });
});

/* ---------------- 首页 ---------------- */
function nextWu(from) {
  for (var i = 1; i <= 11; i++) {
    var d = new Date(from.y, from.m - 1, from.d + i);
    var o = ymd(d);
    if (isWuDay(o.y, o.m, o.d)) return { date: o, days: i, gz: gzDay(o.y, o.m, o.d) };
  }
  return null;
}
function monthWuList(y, m) {
  var days = new Date(y, m, 0).getDate(), out = [];
  for (var d = 1; d <= days; d++) if (isWuDay(y, m, d)) out.push(d);
  return out;
}
function nextAnWu(from) {
  for (var i = 1; i <= 61; i++) {
    var d = new Date(from.y, from.m - 1, from.d + i);
    var o = ymd(d);
    if (isAnWuDay(o.y, o.m, o.d)) return { date: o, days: i, gz: gzDay(o.y, o.m, o.d) };
  }
  return null;
}
function monthAnWuList(y, m) {
  var days = new Date(y, m, 0).getDate(), out = [];
  for (var d = 1; d <= days; d++) if (isAnWuDay(y, m, d)) out.push(d);
  return out;
}
function fmtYmdShort(s) { // "2026-09-23" -> "9月23日"
  var p = s.split('-'); return parseInt(p[1], 10) + '月' + parseInt(p[2], 10) + '日';
}
function renderHome() {
  var td = ymd(now());
  var lunar = lunarOf(td.y, td.m, td.d);
  var wu = isWuDay(td.y, td.m, td.d);
  var an = !wu && isAnWuDay(td.y, td.m, td.d);
  var gz = gzDay(td.y, td.m, td.d);

  $('#home-date-line').innerHTML =
    td.y + '年' + td.m + '月' + td.d + '日 星期' + WEEK[new Date(td.y, td.m - 1, td.d).getDay()] +
    '<span class="dl-lunar">' + t('d_lunar') + tx(lunar.getMonthInChinese()) + '月' + tx(lunar.getDayInChinese()) + '</span>';

  var card = $('#status-card');
  if (wu) {
    card.className = 'card status wu';
    $('#status-title').textContent = t('status_ming_title');
    $('#status-sub').textContent = t('status_ming_sub');
  } else if (an) {
    card.className = 'card status anwu';
    $('#status-title').textContent = t('status_an_title');
    $('#status-sub').textContent = t('status_an_sub') + '（' + tf(t('anwu_why'), tx(lunar.getDayZhi())) + '）';
  } else {
    card.className = 'card status ok';
    $('#status-title').textContent = t('status_ok_title');
    $('#status-sub').textContent = tf(t('status_ok_sub'), tx(gz));
  }
  $('#anwu-note').hidden = !an; // 暗戊日才展开说明入口

  var nx = nextWu(td);
  if (nx) {
    $('#count-days').textContent = nx.days;
    $('#count-date').textContent = fmtMD(nx.date) + ' · ' + tx(nx.gz) + '日';
  }
  var nxa = nextAnWu(td), ca = $('#count-anwu');
  if (nxa) {
    var rel = nxa.days === 1 ? t('rel_tomorrow') : nxa.days === 2 ? t('rel_dayafter') : nxa.days + t('count_unit');
    ca.textContent = t('next_an_prefix') + '：' + rel + '（' + fmtMD(nxa.date) + ' · ' + tx(nxa.gz) + '日）';
    ca.hidden = false;
  } else { ca.hidden = true; }

  var yi = lunar.getDayYi(), ji = lunar.getDayJi();
  void yi; void ji; // 首页不再展示宜忌（v1.2.0 移除）

  /* 值年太岁 */
  var ln0ts = Solar.fromDate(now()).getLunar();
  var yg = ln0ts.getYearGan() + ln0ts.getYearZhi();
  var tn = TAISUI[yg];
  var tsl = $('#taisui-line');
  if (tsl) tsl.textContent = tn ? tf(t('taisui_line'), tx(yg), tx(tn)) : '';

  // 四柱（直接取库输出，不做任何换算与改名）
  var ln2 = Solar.fromDate(now()).getLunar();
  $('#pz-year').textContent = ln2.getYearGan() + ln2.getYearZhi();
  $('#pz-month').textContent = ln2.getMonthGan() + ln2.getMonthZhi();
  $('#pz-day').textContent = ln2.getDayGan() + ln2.getDayZhi();
  $('#pz-time').textContent = ln2.getTimeGan() + ln2.getTimeZhi();

  // 节气（动态）
  var jqToday = lunar.getJieQi();
  var prev = lunar.getPrevJieQi(), next = lunar.getNextJieQi();
  var s = t('jieqi_now') + '<b>' + tx(prev.getName()) + '</b>（' + fmtYmdShort(prev.getSolar().toYmd()) +
    ' — ' + tx(next.getName()) + ' ' + fmtYmdShort(next.getSolar().toYmd()) + '）';
  if (jqToday) s += '<br>' + t('jieqi_today') + '<b>' + tx(jqToday) + '</b>';
  $('#jieqi-line').innerHTML = s;

  /* 四值功曹（名号固定，随语言切换重渲染） */
  var zsl = $('#zhishen-line');
  if (zsl) zsl.textContent = t('sizhi_title') + '：' + sizhiText();
}
function tickClock() {
  var n = now(), p = function (x) { return (x < 10 ? '0' : '') + x; };
  $('#clock').textContent = p(n.getHours()) + ':' + p(n.getMinutes()) + ':' + p(n.getSeconds());
}
var lastDayKey = '';
function heartbeat() {
  tickClock();
  var t = ymd(now()), key = t.y + '-' + t.m + '-' + t.d;
  if (key !== lastDayKey) { lastDayKey = key; renderHome(); renderCalendar(); }
}

/* ---------------- 黄历 ---------------- */
var viewY, viewM, sel;
(function initCal() {
  var t = ymd(now()); viewY = t.y; viewM = t.m; sel = { y: t.y, m: t.m, d: t.d };
})();
function renderCalendar() {
  var lunar0 = lunarOf(viewY, viewM, 1);
  $('#cal-title').innerHTML = '<span class="cal-tl">' + tx(lunar0.getYearInChinese()) + '年' + tx(lunar0.getMonthInChinese()) + '月</span>' +
    '<span class="cal-ts">' + viewY + '年' + viewM + '月</span>';
  var grid = $('#cal-grid'); grid.innerHTML = '';
  var first = new Date(viewY, viewM - 1, 1).getDay(); // 0=周日
  var lead = (first + 6) % 7; // 周一起始
  var days = new Date(viewY, viewM, 0).getDate();
  var today = ymd(now());
  for (var i = 0; i < lead; i++) { var e = document.createElement('div'); e.className = 'day other'; grid.appendChild(e); }
  for (var d = 1; d <= days; d++) {
    (function (d) {
      var l = lunarOf(viewY, viewM, d);
      var cell = document.createElement('div');
      cell.className = 'day';
      var isT = today.y === viewY && today.m === viewM && today.d === d;
      if (isT) cell.classList.add('today');
      if (sel.y === viewY && sel.m === viewM && sel.d === d) cell.classList.add('selected');
      var wu = l.getDayGan() === '戊';
      var an = !wu && ANWU_ZHI.indexOf(l.getDayZhi()) >= 0;
      var bd = isBaidouDay(l); // 拜斗日标记（初一十五另有含义时仍保留叠加）
      var sd = shendanName(l); // 神诞日标记（寿桃）
      var ltxt = l.getDay() === 1 ? tx(l.getMonthInChinese()) + '月' : tx(l.getDayInChinese());
      var dots = '<span class="dots">' + (wu ? '<span class="wdot"></span>' : '') + (an ? '<span class="adot"></span>' : '') + (bd ? '<span class="bdot">★</span>' : '') + (sd ? '<span class="sdot">🍑</span>' : '') + '</span>';
      cell.innerHTML = '<span class="s' + (wu ? ' wu' : an ? ' anwu' : '') + '">' + d + '</span>' +
        '<span class="l">' + ltxt + '</span>' + dots;
      cell.addEventListener('click', function () {
        sel = { y: viewY, m: viewM, d: d }; renderCalendar();
        // 选中日期后自动滚动到详情区
        var detail = document.getElementById('day-detail');
        if (detail) {
          setTimeout(function () {
            detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 50);
        }
      });
      grid.appendChild(cell);
    })(d);
  }
  renderDetail();
}
function renderDetail() {
  var l = lunarOf(sel.y, sel.m, sel.d);
  var wu = l.getDayGan() === '戊';
  var an = !wu && ANWU_ZHI.indexOf(l.getDayZhi()) >= 0;
  $('#detail-title').textContent = sel.y + '年' + sel.m + '月' + sel.d + '日 星期' + WEEK[new Date(sel.y, sel.m - 1, sel.d).getDay()];
  var dw = $('#detail-wu');
  if (wu) { dw.className = 'detail-wu'; dw.textContent = t('detail_ming'); }
  else if (an) { dw.className = 'detail-wu anw'; dw.textContent = t('detail_an'); }
  else { dw.className = 'detail-wu ok'; dw.textContent = t('detail_ok'); }
  var anote = $('#detail-anwu-note');
  if (an) { anote.hidden = false; anote.textContent = t('anwu_rule_short'); }
  else { anote.hidden = true; }
  var bnote = $('#detail-baidou-note');
  if (isBaidouDay(l)) {
    bnote.hidden = false;
    var bm = l.getMonth(), bdd = l.getDay();
    bnote.textContent = (!isLeapM(l) && bm === 9 && bdd <= 9) ? t('baidou_note_jiuhuang') : t('baidou_note_shuowang');
  } else { bnote.hidden = true; }
  // 日期类型标签：明戊 / 暗戊 / 拜斗 / 初一 / 十五（戊日已有朱砂大字，标签再补一枚）
  var tags = [];
  if (wu) tags.push([t('tag_ming'), 'tag-wu']);
  if (an) tags.push([t('tag_an'), 'tag-an']);
  if (isBaidouDay(l)) tags.push([t('tag_baidou'), 'tag-bd']);
  var sdn = shendanName(l);
  if (sdn) tags.push([tx(sdn), 'tag-sd']);
  if (!isLeapM(l) && l.getDay() === 1) tags.push([t('tag_chuyi'), 'tag-lunar']);
  if (!isLeapM(l) && l.getDay() === 15) tags.push([t('tag_shiwu'), 'tag-lunar']);
  $('#detail-tags').innerHTML = tags.map(function (tg) {
    return '<span class="dtag ' + tg[1] + '">' + tg[0] + '</span>';
  }).join('');
  $('#detail-lunar').textContent = tx(l.getYearInChinese()) + '年' + tx(l.getMonthInChinese()) + '月' + tx(l.getDayInChinese());
  $('#detail-gz').textContent = l.getYearGan() + l.getYearZhi() + '年 ' + l.getMonthGan() + l.getMonthZhi() + '月 ' + l.getDayGan() + l.getDayZhi() + '日';
  var jq = l.getJieQi();
  $('#detail-jq').textContent = tx(jq) || '—';
  /* 四值功曹 */
  var zsd = $('#detail-zhishen');
  if (zsd) zsd.textContent = sizhiText();
  $('#detail-chong').textContent = tx('冲' + l.getDayChongShengXiao() + '（' + l.getDayChong() + '）煞' + l.getDaySha());
  $('#detail-yi').textContent = l.getDayYi().map(tx).join(' ') || '—';
  $('#detail-ji').textContent = l.getDayJi().map(tx).join(' ') || '—';
}
$('#cal-prev').addEventListener('click', function () { viewM--; if (viewM < 1) { viewM = 12; viewY--; } renderCalendar(); });
$('#cal-next').addEventListener('click', function () { viewM++; if (viewM > 12) { viewM = 1; viewY++; } renderCalendar(); });

/* ---------------- 任意日期跳转 ·苹果式滚轮选择器 ---------------- */
(function initDateJump() {
  var panel = $('#date-jump');
  var yW = $('#wh-y'), mW = $('#wh-m'), dW = $('#wh-d');
  if (!panel || !yW) return;
  var ITEM_H = 40, Y0 = 1900, Y1 = 2100;
  function build(wheel, n, fmt) {
    var list = wheel.querySelector('.wheel-list');
    list.innerHTML = '';
    for (var i = 0; i < n; i++) {
      var el = document.createElement('div');
      el.className = 'wheel-item'; el.textContent = fmt(i);
      list.appendChild(el);
    }
  }
  function count(wheel) { return wheel.querySelector('.wheel-list').children.length; }
  function idx(wheel) {
    var c = count(wheel);
    return c ? Math.max(0, Math.min(c - 1, Math.round(wheel.scrollTop / ITEM_H))) : 0;
  }
  function mark(wheel) {
    var i = idx(wheel), kids = wheel.querySelector('.wheel-list').children;
    for (var k = 0; k < kids.length; k++) kids[k].classList.toggle('on', k === i);
  }
  function setIdx(wheel, i, smooth) {
    var c = count(wheel);
    i = c ? Math.max(0, Math.min(c - 1, i)) : 0;
    if (wheel._t) clearTimeout(wheel._t);
    wheel.dataset.lock = '1';
    wheel.scrollTo({ top: i * ITEM_H, behavior: smooth ? 'smooth' : 'auto' });
    wheel._t = setTimeout(function () { delete wheel.dataset.lock; mark(wheel); }, smooth ? 350 : 80);
    mark(wheel);
  }
  function daysIn(y, m) { return new Date(y, m, 0).getDate(); }
  function rebuildDays() {
    var y = Y0 + idx(yW), m = idx(mW) + 1, cur = idx(dW) + 1, n = daysIn(y, m);
    build(dW, n, function (i) { return i + 1; });
    setIdx(dW, Math.min(cur, n) - 1, false);
  }
  function bindSnap(wheel, after) {
    wheel.addEventListener('scroll', function () {
      if (wheel.dataset.lock) return;
      if (wheel._s) clearTimeout(wheel._s);
      wheel._s = setTimeout(function () {
        var i = idx(wheel);
        wheel.dataset.lock = '1';
        wheel.scrollTo({ top: i * ITEM_H, behavior: 'smooth' });
        setTimeout(function () { delete wheel.dataset.lock; mark(wheel); if (after) after(); }, 200);
        mark(wheel);
      }, 110);
    });
  }
  build(yW, Y1 - Y0 + 1, function (i) { return Y0 + i; });
  build(mW, 12, function (i) { return i + 1; });
  bindSnap(yW, rebuildDays); bindSnap(mW, rebuildDays); bindSnap(dW, null);
  function open() {
    panel.hidden = false; /* 必须先显示：display:none 时 scrollTo 无效 */
    setIdx(yW, viewY - Y0, false);
    setIdx(mW, viewM - 1, false);
    rebuildDays();
    setIdx(dW, Math.min(sel.d, daysIn(viewY, viewM)) - 1, false);
  }
  var title = $('#cal-title');
  title.style.cursor = 'pointer';
  title.setAttribute('title', t('dj_hint'));
  title.addEventListener('click', function () { if (panel.hidden) { open(); } else { panel.hidden = true; } });
  $('#dj-go').addEventListener('click', function () {
    viewY = Y0 + idx(yW); viewM = idx(mW) + 1;
    var dd = Math.min(idx(dW) + 1, daysIn(viewY, viewM));
    sel = { y: viewY, m: viewM, d: dd };
    panel.hidden = true; renderCalendar();
  });
  $('#dj-today').addEventListener('click', function () {
    var tc = ymd(now()); viewY = tc.y; viewM = tc.m; sel = { y: tc.y, m: tc.m, d: tc.d };
    panel.hidden = true; renderCalendar();
  });
  var cancel = $('#dj-cancel');
  if (cancel) cancel.addEventListener('click', function () { panel.hidden = true; });
})();

/* ---------------- 提醒 ---------------- */
function isLeapM(l) { try { return String(l.getMonthInChinese()).charAt(0) === '闰'; } catch (e) { return false; } }
/* 拜斗日：农历每月初一、十五（朔望礼斗），农历九月初一至初九（九皇斋期，初九为斗姥元君圣诞） */
function isBaidouDay(l) {
  if (isLeapM(l)) return false;
  var m = l.getMonth(), d = l.getDay();
  return d === 1 || d === 15 || (m === 9 && d <= 9);
}
function advTypesOf(l) {
  var out = [];
  var g = l.getDayGan() + l.getDayZhi();
  if (g === '庚申') out.push('gengshen');
  if (g === '甲子') out.push('jiazi');
  var lm = l.getMonth(), ld = l.getDay(), leap = isLeapM(l);
  if (!leap && (ld === 1 || ld === 15)) out.push('chuyishiwu');
  if (BAJIE.indexOf(l.getJieQi()) >= 0) out.push('bajie');
  if (!leap && ((lm === 1 && ld === 15) || (lm === 7 && ld === 15) || (lm === 10 && ld === 15))) out.push('sanyuan');
  if (!leap && ((lm === 1 && ld === 1) || (lm === 5 && ld === 5) || (lm === 7 && ld === 7) || (lm === 10 && ld === 1) || (lm === 12 && ld === 8))) out.push('wula');
  if (shendanName(l)) out.push('shendan');
  return out;
}
function nidWu(y, m, d, k) { return (y * 10000 + m * 100 + d) * 10 + (k || 0); }
function nidBaidou(m, d, k) { return (80000000 + m * 100 + d) * 10 + (k || 0); }
function nidAnwu(y, m, d, k) { return (70000000 + y * 10000 + m * 100 + d) * 10 + (k || 0); }
var ADV_BASE = { gengshen: 1, jiazi: 2, chuyishiwu: 3, bajie: 4, sanyuan: 5, wula: 6, shendan: 7 };
function nidAdv(k, m, d, j) { return (90000000 + ADV_BASE[k] * 2000 + m * 100 + d) * 10 + (j || 0); }

/* ============ 神诞日表（农历，闰月不计） ============ */
var SHENDAN = {
  '1-1':'弥勒尊佛圣诞', '1-9':'玉皇大帝圣诞', '1-15':'上元天官圣诞', '1-19':'丘处机圣诞',
  '2-2':'土地正神圣诞', '2-3':'文昌帝君圣诞', '2-6':'东华帝君圣诞', '2-15':'太上老君圣诞',
  '3-3':'玄天上帝圣诞', '3-15':'赵公元帅圣诞', '3-23':'天后妈祖圣诞', '3-28':'东岳大帝圣诞',
  '4-14':'吕洞宾圣诞', '4-18':'碧霞元君圣诞',
  '5-13':'关圣帝君圣诞', '5-18':'张天师圣诞',
  '7-7':'魁星圣诞', '7-15':'中元地官圣诞', '7-18':'王母娘娘圣诞', '7-19':'值年太岁圣诞',
  '8-3':'灶君圣诞', '8-15':'太阴星君圣诞',
  '9-9':'斗姥元君圣诞',
  '10-15':'下元水官圣诞',
  '11-11':'太乙救苦天尊圣诞',
  '12-8':'王侯腊之辰'
};
function shendanName(l) {
  if (isLeapM(l)) return null;
  return SHENDAN[l.getMonth() + '-' + l.getDay()] || null;
}
/* ============ 六十甲子·值年太岁名 ============ */
var TAISUI = {
  '甲子':'金辨','乙丑':'陈材','丙寅':'耿章','丁卯':'沈兴','戊辰':'赵达','己巳':'郭灿',
  '庚午':'王清','辛未':'李訽','壬申':'刘旺','癸酉':'康志','甲戌':'施广','乙亥':'任保',
  '丙子':'郭嘉','丁丑':'汪文','戊寅':'鲁先','己卯':'龙仲','庚辰':'董德','辛巳':'郑但',
  '壬午':'陆明','癸未':'魏仁','甲申':'方杰','乙酉':'蒋崇','丙戌':'白敏','丁亥':'封济',
  '戊子':'邹铛','己丑':'傅佑','庚寅':'邬桓','辛卯':'范宁','壬辰':'彭泰','癸巳':'徐单',
  '甲午':'章词','乙未':'杨仙','丙申':'管仲','丁酉':'唐杰','戊戌':'姜武','己亥':'谢太',
  '庚子':'卢秘','辛丑':'杨信','壬寅':'贺谔','癸卯':'皮时','甲辰':'李诚','乙巳':'吴遂',
  '丙午':'文哲','丁未':'缪丙','戊申':'俞忠','己酉':'程宝','庚戌':'倪秘','辛亥':'叶坚',
  '壬子':'丘德','癸丑':'朱得','甲寅':'张朝','乙卯':'万清','丙辰':'辛亚','丁巳':'杨彦',
  '戊午':'黎卿','己未':'傅党','庚申':'毛梓','辛酉':'石政','壬戌':'洪充','癸亥':'虞程'
};

/* ============ 四值功曹 ·v1.2.0 ============ */
/* 道教科仪四值功曹，分掌年、月、日、时之值守，名号固定：
 * 值年功曹李丙、值月功曹黄承乙、值日功曹周登、值时功曹刘洪。
 * 注：App 内仅列名号，不注经名出处（出处未及核验道藏原文）。 */
var GONGCAO_NAMES = ['李丙', '黄承乙', '周登', '刘洪'];
var GONGCAO_KEYS = ['gc_year', 'gc_month', 'gc_day', 'gc_hour'];
function sizhiText() {
  var parts = [];
  for (var i = 0; i < 4; i++) parts.push(tx(t(GONGCAO_KEYS[i]) + GONGCAO_NAMES[i]));
  return parts.join(' · ');
}


/* 提醒偏移（分钟）多选：当天=0，提前1天=1440，自选=offsetMin；去重后按从小到大排 */
function offsetsOf(c) {
  var out = [];
  ((c && c.kinds) || []).forEach(function (k) {
    var m = k === 'today' ? 0 : k === 'day1' ? 1440 : Math.max(0, parseInt(c.offsetMin, 10) || 0);
    if (out.indexOf(m) < 0) out.push(m);
  });
  out.sort(function (a, b) { return a - b; });
  return out;
}
/* 把分钟数拆回「数字+单位」供输入框显示：取最大整除单位 */
function decomposeOffset(min) {
  min = Math.max(0, parseInt(min, 10) || 0);
  if (min > 0 && min % 10080 === 0) return [min / 10080, '10080'];
  if (min > 0 && min % 1440 === 0) return [min / 1440, '1440'];
  if (min > 0 && min % 60 === 0) return [min / 60, '60'];
  return [min, '1'];
}
function fmtDur(m) {
  if (m % 10080 === 0) return tf(t('dur_week'), m / 10080);
  if (m % 1440 === 0) return tf(t('dur_day'), m / 1440);
  if (m % 60 === 0) return tf(t('dur_hour'), m / 60);
  return tf(t('dur_min'), m);
}
/* 文案时间前缀：今日 / 明日 / N分钟·小时·天·周后（M月d日） */
function whenText(offMin, o) {
  if (offMin <= 0) return t('when_today');
  if (offMin === 1440) return t('when_tomorrow');
  return tf(t('when_dur'), fmtDur(offMin), fmtMD(o));
}

/* 按日类型生成提醒文案（正式排期与测试按钮共用）。
   优先级：戊日 ＞ 拜斗日 ＞ 初一十五；暗戊由 buildNotifications 独立分支处理；when 为时间前缀（今日/明日） */
function dayReminderText(l, o, when) {
  var d = l.getDay(), m = l.getMonth();
  if (l.getDayGan() === '戊') {
    return { title: t('notif_wu_title'), body: tf(t('notif_wu_body'), when, tx(l.getDayZhi())) };
  }
  if (isBaidouDay(l)) {
    var extra = (m === 9 && d === 9) ? t('bd_extra_99')
      : (m === 9) ? t('bd_extra_9')
      : (d === 1) ? t('bd_extra_1') : t('bd_extra_15');
    return { title: t('notif_bd_title'), body: tf(t('notif_bd_body'), when, extra) };
  }
  if (!isLeapM(l) && (d === 1 || d === 15)) {
    return { title: t(d === 1 ? 'tag_chuyi' : 'tag_shiwu') + t('tab_remind'), body: tf(t('notif_cysw_body'), when, tx(l.getDayInChinese())) };
  }
  return null;
}

function parseTime(str, fbH, fbM) {
  var p = String(str || '').split(':');
  var h = parseInt(p[0], 10), m = parseInt(p[1], 10);
  return [isNaN(h) ? fbH : h, isNaN(m) ? fbM : m];
}

function capLimit() { return isIOS() ? 60 : 80; } // iOS 单应用最多 64 条本地通知，取 60 留余量
function pushNotif(list, id, title, body, fire) {
  if (fire.getTime() <= Date.now()) return;
  list.push({ id: id, title: title, body: body, schedule: { at: fire } });
}
/* 事件日当天 timeStr 时刻，再提前 offMin 分钟 */
function fireAt(dd, timeStr, offMin) {
  var tt = parseTime(timeStr, 17, 0);
  var f = new Date(dd.getTime());
  f.setHours(tt[0], tt[1], 0, 0);
  f.setTime(f.getTime() - offMin * 60000);
  return f;
}

function buildNotifications() {
  var list = [];
  var td = ymd(now());
  var todayD = new Date(td.y, td.m - 1, td.d);
  var anwuOn = !!(CFG.anwu && CFG.anwu.on);
  var advOn = Object.keys(CFG.adv).some(function (k) { return CFG.adv[k]; });
  if (!CFG.wu.on && !CFG.baidou.on && !anwuOn && !advOn) return list;
  var limit = capLimit();
  var offsWu = offsetsOf(CFG.wu); // 明戊/暗戊/拜斗共用提醒时机（多选）
  var offsAdv = offsetsOf(CFG.advTiming); // 进阶提醒时机（多选）
  for (var i = 0; i < 90 && list.length < limit; i++) {
    var dd = new Date(todayD.getTime()); dd.setDate(dd.getDate() + i);
    var o = ymd(dd);
    var l = lunarOf(o.y, o.m, o.d);
    var wu = l.getDayGan() === '戊';
    var an = !wu && ANWU_ZHI.indexOf(l.getDayZhi()) >= 0;
    var bd = isBaidouDay(l);
    var sd = shendanName(l);
    if (CFG.wu.on && wu) {
      offsWu.forEach(function (off, oi) {
        if (list.length >= limit) return;
        var txt = dayReminderText(l, o, whenText(off, o));
        pushNotif(list, nidWu(o.y, o.m, o.d, oi), txt.title, txt.body, fireAt(dd, CFG.wu.time, off));
      });
      continue; // 明戊日当天不再叠加其他提醒
    }
    if (CFG.baidou.on && bd) {
      offsWu.forEach(function (off, oi) {
        if (list.length >= limit) return;
        var txtB = dayReminderText(l, o, whenText(off, o));
        pushNotif(list, nidBaidou(o.m, o.d, oi), txtB.title, txtB.body, fireAt(dd, CFG.wu.time, off));
      });
      /* 拜斗日若兼神诞日（如九月初九斗姥圣诞），仍发出神诞提醒 */
      if (CFG.adv.shendan && sd) {
        offsAdv.forEach(function (offA, ai) {
          if (list.length >= limit) return;
          pushNotif(list, nidAdv('shendan', o.m, o.d, ai), tx(sd),
            tf(t('notif_shendan_body'), whenText(offA, o), tx(sd)), fireAt(dd, CFG.wu.time, offA));
        });
      }
      continue; // 拜斗日当天不再叠加其他进阶提醒
    }
    /* 暗戊提醒：独立开关；开启时与戊日提醒同一时间、同一提醒时机发出 */
    if (anwuOn && an) {
      offsWu.forEach(function (off, oi) {
        if (list.length >= limit) return;
        pushNotif(list, nidAnwu(o.y, o.m, o.d, oi),
          t('notif_an_title'),
          tf(t('notif_an_body'), whenText(off, o), tx(l.getDayGan() + l.getDayZhi())),
          fireAt(dd, CFG.wu.time, off));
      });
      continue; // 暗戊日当天不再叠加进阶提醒
    }
    if (advOn) {
      var types = advTypesOf(l);
      for (var j = 0; j < types.length && list.length < limit; j++) {
        var k = types[j];
        if (!CFG.adv[k]) continue;
        var label, extra = '', title, body;
        if (k === 'shendan') {
          label = tx(sd);
          title = label;
          offsAdv.forEach(function (offA, ai) {
            if (list.length >= limit) return;
            body = tf(t('notif_shendan_body'), whenText(offA, o), label);
            pushNotif(list, nidAdv(k, o.m, o.d, ai), title, body, fireAt(dd, CFG.wu.time, offA));
          });
        } else {
          label = advLabel(k);
          if (k === 'chuyishiwu') extra = tx(l.getDayInChinese());
          if (k === 'bajie') extra = tx(l.getDayInChinese());
          if (k === 'sanyuan') extra = t('sanyuan_' + (l.getMonth() === 1 ? 'shang' : l.getMonth() === 7 ? 'zhong' : 'xia'));
          title = label + t('tab_remind');
          offsAdv.forEach(function (offA, ai) {
            if (list.length >= limit) return;
            body = tf(t('notif_adv_body'), whenText(offA, o), label, extra);
            pushNotif(list, nidAdv(k, o.m, o.d, ai), title, body, fireAt(dd, CFG.wu.time, offA));
          });
        }
      }
    }
  }
  return list;
}

var scheduling = false;
function reschedule() {
  var ln = LN();
  if (!isNative() || !ln || scheduling) return;
  scheduling = true;
  nativePerms().then(function (p) {
    if (p.notif !== 'granted') { scheduling = false; return; }
    return ln.cancelAll().then(function () {
      var list = buildNotifications();
      $('#schedule-info').textContent = list.length ? tf(t('sched_done'), list.length) : t('sched_none');
      try { localStorage.setItem('wuri_last_sched', JSON.stringify({ at: Date.now(), count: list.length })); } catch (e) {}
      scheduling = false;
      return list.length ? ln.schedule({ notifications: list }) : null;
    }).catch(function () { scheduling = false; });
  }).catch(function () { scheduling = false; });
}

function refreshPermUI() {
  if (!isNative()) {
    $('#perm-notif').textContent = t('perm_device_only');
    $('#perm-alarm').textContent = t('perm_device_only');
    return;
  }
  nativePerms().then(function (p) {
    $('#perm-notif').textContent = p.notif === 'granted' ? t('perm_allowed') : (p.notif === 'prompt' ? t('perm_prompt') : t('perm_denied'));
    var hint = document.getElementById('perm-hint');
    if (isIOS()) {
      $('#perm-alarm').textContent = t('perm_na');
      $('#btn-alarm').style.display = 'none';
      if (hint) hint.textContent = t('perm_hint_ios');
    } else {
      $('#perm-alarm').textContent = p.exactAlarm ? t('perm_allowed') : t('perm_denied');
      $('#btn-alarm').style.display = '';
    }
  });
}

/* ---------------- 提醒：多选提醒时机（提前1天 / 当天 / 自选可同时勾选） ---------------- */
/* 绑定一组提醒时机：多选 提前1天 / 当天 / 自选（数字+单位）；至少保留一项 */
function bindKindTiming(ns, cfg) {
  function syncKind() {
    var ks = cfg.kinds || [];
    $$('input[name=' + ns + '-kind]').forEach(function (c) { c.checked = ks.indexOf(c.value) >= 0; });
    $('#' + ns + '-offset-row').hidden = ks.indexOf('custom') < 0;
  }
  $$('input[name=' + ns + '-kind]').forEach(function (c) {
    c.addEventListener('change', function () {
      var ks = $$('input[name=' + ns + '-kind]').filter(function (x) { return x.checked; }).map(function (x) { return x.value; });
      if (!ks.length) { c.checked = true; return; } // 至少保留一项时机
      cfg.kinds = ks; saveCfg(); syncKind(); reschedule();
    });
  });
  var num = $('#' + ns + '-offset-num'), unit = $('#' + ns + '-offset-unit');
  var d = decomposeOffset(cfg.offsetMin);
  num.value = d[0]; unit.value = d[1];
  function readOffset() {
    cfg.offsetMin = Math.max(0, (parseInt(num.value, 10) || 0) * (parseInt(unit.value, 10) || 1));
  }
  num.addEventListener('change', function () { readOffset(); saveCfg(); reschedule(); });
  unit.addEventListener('change', function () { readOffset(); saveCfg(); reschedule(); });
  syncKind();
}

/* 提醒页控件绑定 */
/* 提醒页控件绑定 */
function bindRemind() {
  var sw = $('#sw-wu'); sw.checked = !!CFG.wu.on;
  sw.addEventListener('change', function () { CFG.wu.on = sw.checked; saveCfg(); reschedule(); });
  var saw = $('#sw-anwu'); saw.checked = !!(CFG.anwu && CFG.anwu.on);
  saw.addEventListener('change', function () { CFG.anwu.on = saw.checked; saveCfg(); reschedule(); });
  var sbd = $('#sw-baidou'); sbd.checked = !!(CFG.baidou && CFG.baidou.on);
  sbd.addEventListener('change', function () { CFG.baidou.on = sbd.checked; saveCfg(); reschedule(); });
  bindKindTiming('wu', CFG.wu); // 明戊/暗戊/拜斗共用提醒时机
  bindKindTiming('adv', CFG.advTiming); // 进阶提醒时机
  var ti = $('#inp-time'); ti.value = CFG.wu.time || '17:00';
  ti.addEventListener('change', function () { CFG.wu.time = ti.value || '17:00'; saveCfg(); reschedule(); });
  $$('input[data-adv]').forEach(function (el) {
    el.checked = !!CFG.adv[el.getAttribute('data-adv')];
    el.addEventListener('change', function () { CFG.adv[el.getAttribute('data-adv')] = el.checked; saveCfg(); reschedule(); });
  });
  $('#btn-perm').addEventListener('click', function () {
    var ln = LN();
    if (!isNative() || !ln) return;
    ln.requestPermissions().then(function () { refreshPermUI(); reschedule(); });
    setTimeout(refreshPermUI, 1500);
  });
  $('#btn-alarm').addEventListener('click', function () { alert(t('alert_alarm')); });
  /*TEST-ONLY*/
  $('#btn-test').addEventListener('click', function () {
    var info = $('#test-info');
    var ln = LN();
    if (!isNative() || !ln) { info.textContent = t('test_not_native'); return; }
    try {
      // 按当天日子类型生成文案（复用正式提醒文案函数）
      var tt = ymd(now());
      var ltt = lunarOf(tt.y, tt.m, tt.d);
      var txt = dayReminderText(ltt, tt, t('when_today'));
      var title, body;
      if (txt) { title = t('test_prefix') + txt.title; body = txt.body + t('test_suffix'); }
      else if (isAnWuDay(tt.y, tt.m, tt.d)) { title = t('test_prefix') + t('notif_an_title'); body = tf(t('notif_an_body'), t('when_today'), tx(ltt.getDayGan() + ltt.getDayZhi())) + t('test_suffix'); }
      else { title = t('test_prefix') + t('test_ok_title'); body = t('test_ok_body'); }
      var at = new Date(Date.now() + 15000);
      ln.schedule({ notifications: [{ id: 99999999, title: title, body: body, schedule: { at: at } }] })
        .then(function () { info.textContent = tf(t('test_sent'), 1); })
        .catch(function () { info.textContent = t('test_fail'); });
    } catch (e) { info.textContent = t('test_fail'); }
  });
  /*/TEST-ONLY*/
  try {
    var last = JSON.parse(localStorage.getItem('wuri_last_sched'));
    if (last) $('#schedule-info').textContent = tf(t('sched_done'), last.count);
  } catch (e) {}
}

/* ---------------- 主题（白天宣纸 / 黑夜玄黑） ---------------- */
function applyTheme() {
  var t = CFG.theme || 'auto';
  var night = t === 'night' ||
    (t === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', night ? 'night' : 'day');
  try {
    var mc = document.querySelector('meta[name=theme-color]');
    if (mc) mc.setAttribute('content', night ? '#060608' : '#F5F1E6');
  } catch (e) {}
  refreshThemeUI();
}
var THEME_ICON = { auto: '◐', day: '☀', night: '☾' };
function refreshThemeUI() {
  var t = CFG.theme || 'auto';
  $$('[data-theme-toggle]').forEach(function (b) { b.textContent = THEME_ICON[t] || '◐'; });
  $$('input[name=theme]').forEach(function (r) { r.checked = (r.value === t); });
}
function cycleTheme() {
  var order = ['auto', 'day', 'night'];
  var t = CFG.theme || 'auto';
  CFG.theme = order[(order.indexOf(t) + 1) % order.length];
  saveCfg(); applyTheme();
}
if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').addEventListener) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
    if ((CFG.theme || 'auto') === 'auto') applyTheme();
  });
}

/* ---------------- 我的 ---------------- */
function bindMe() {
  $$('input[name=tz]').forEach(function (r) {
    r.checked = (r.value === CFG.tz);
    r.addEventListener('change', function () { CFG.tz = r.value; saveCfg(); renderHome(); renderCalendar(); });
  });
  $$('input[name=theme]').forEach(function (r) {
    r.checked = (r.value === (CFG.theme || 'auto'));
    r.addEventListener('change', function () { CFG.theme = r.value; saveCfg(); applyTheme(); });
  });
  /* 语言选择：跟随系统 / 简体中文 / 繁體中文 */
  $$('input[name=lang]').forEach(function (r) {
    r.addEventListener('change', function () { setLangPref(r.value); });
  });
}

/* ---------------- 启动 ---------------- */
applyTheme();
$$('[data-theme-toggle]').forEach(function (b) { b.addEventListener('click', cycleTheme); });
bindRemind();
bindMe();
/* 语言切换后由 applyI18n 回调此函数，重绘动态文案 */
window.__wuri_rerender = function () { renderHome(); renderCalendar(); refreshPermUI(); };
applyI18n(); // 填充 data-i18n 静态文案，并经回调重绘首页与黄历
heartbeat();
setInterval(heartbeat, 1000);
document.addEventListener('visibilitychange', function () {
  if (!document.hidden) { renderHome(); renderCalendar(); reschedule(); }
});
// 首次启动：若通知权限尚未决定，主动申请一次（提醒是核心功能）
refreshPermUI();
var ln0 = LN();
if (isNative() && ln0) {
  ln0.checkPermissions().then(function (st) {
    if (st.display === 'prompt') return ln0.requestPermissions();
    return st;
  }).then(function () { refreshPermUI(); reschedule(); }).catch(function () { refreshPermUI(); });
} else {
  reschedule();
}

/* Pro 模块桥：把年览/排盘等需要的历法函数暴露给外部脚本（口径唯一，不复制逻辑） */
window.__wuriCal = {
  lunarOf: lunarOf,
  isWuDay: isWuDay,
  isAnWuDay: isAnWuDay,
  gzDay: gzDay,
  ANWU_ZHI: ANWU_ZHI,
  isBaidouDay: isBaidouDay,
  shendanName: shendanName,
  renderCalendar: renderCalendar,
  getView: function () { return { y: viewY, m: viewM, sel: sel }; },
  setView: function (y, m, d) { viewY = y; viewM = m; sel = { y: y, m: m, d: d }; }
};

/* 左侧边缘右滑返回：触发当前可见的返回按钮 */
(function () {
  var startX = 0, startY = 0, tracking = false;
  var EDGE = 60; /* 左边缘判定宽度(px)，放宽 */
  document.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1) { tracking = false; return; }
    var t = e.touches[0];
    if (t.clientX < EDGE) {
      tracking = true;
      startX = t.clientX;
      startY = t.clientY;
    }
  }, { passive: true });
  document.addEventListener('touchmove', function (e) {
    if (!tracking) return;
    var t = e.touches[0];
    /* 垂直滑动过大则取消 */
    if (Math.abs(t.clientY - startY) > 80) tracking = false;
  }, { passive: true });
  document.addEventListener('touchend', function (e) {
    if (!tracking) return;
    tracking = false;
    var t = e.changedTouches[0];
    var dx = t.clientX - startX;
    var dy = Math.abs(t.clientY - startY);
    /* 右滑超过50px且垂直偏移小，视为返回手势 */
    if (dx > 50 && dy < 80) {
      var ids = ['#bazi-back', '#practice-back', '#jing-back'];
      for (var i = 0; i < ids.length; i++) {
        var btn = document.querySelector(ids[i]);
        /* 用 getClientRects 判断可见性，比 offsetParent 更可靠 */
        if (btn && btn.getClientRects().length > 0) {
          btn.click();
          break;
        }
      }
    }
  }, { passive: true });
})();

})();

/* ---------------- 浮动按钮管理 ---------------- */
function updateFloatingButtons() {
  var backLy = document.getElementById('fab-back-ly');
  var topCal = document.getElementById('fab-top-cal');
  var topRemind = document.getElementById('fab-top-remind');
  var topMe = document.getElementById('fab-top-me');
  
  // 六爻视图：显示返回键
  var lyView = document.getElementById('view-liuyao');
  var showLyBack = lyView && !lyView.hidden;
  if (backLy) backLy.classList.toggle('show', !!showLyBack);
  
  // 各标签页：显示置顶键（常驻）
  var calEl = document.getElementById('tab-cal');
  var remindEl = document.getElementById('tab-remind');
  var meEl = document.getElementById('tab-me');
  var calActive = calEl && calEl.classList.contains('active');
  var remindActive = remindEl && remindEl.classList.contains('active');
  var meActive = meEl && meEl.classList.contains('active');
  if (topCal) topCal.classList.toggle('show', !!calActive);
  if (topRemind) topRemind.classList.toggle('show', !!remindActive);
  if (topMe) topMe.classList.toggle('show', !!meActive);
}

// 初始化浮动按钮点击事件
(function initFabButtons() {
  function init() {
    var backLy = document.getElementById('fab-back-ly');
    if (backLy) {
      backLy.addEventListener('click', function() {
        var btn = document.getElementById('liuyao-back');
        if (btn) btn.click();
      });
    }
    ['fab-top-cal', 'fab-top-remind', 'fab-top-me'].forEach(function(id) {
      var btn = document.getElementById(id);
      if (btn) {
        btn.addEventListener('click', function() {
          window.scrollTo({top: 0, behavior: 'smooth'});
        });
      }
    });
    setInterval(updateFloatingButtons, 500);
    updateFloatingButtons();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
