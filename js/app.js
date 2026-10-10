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
  timebase: 'true', // 时间基准：'true'=真太阳时（默认） 'local'=当地平太阳时；八字与时值神共用
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
    timebase: c.timebase || DEFAULTS.timebase,
    lon: (c.lon != null && c.lon !== '') ? String(c.lon) : '',
    wu: { on: !(c.wu && c.wu.on === false), kinds: wu.kinds, offsetMin: wu.offsetMin, time: (c.wu && c.wu.time) || '17:00' },
    baidou: { on: !!(c.baidou && c.baidou.on) },
    anwu: { on: !!(c.anwu && c.anwu.on) },
    jingrec: { on: !!(c.jingrec && c.jingrec.on), time: (c.jingrec && c.jingrec.time) || '07:00' },
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
  if (c && c.isNativePlatform && c.isNativePlatform()) return true;
  // 原生 WebView 版：WuBridge 存在即为原生（用户 2026-10-09：isNative 不认 WuBridge 导致排期不跑）
  try { if (window.WuBridge) return true; } catch (e) {}
  return false;
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
    $$('.tab').forEach(function (t) {
      t.classList.remove('active');
      t.style.display = 'none';
    });
    var target = $('#' + btn.getAttribute('data-tab'));
    target.classList.add('active');
    target.style.display = 'block';
    // 切换标签时隐藏六爻/八字/紫微等独立视图，防止内容泄漏
    ['view-liuyao', 'bazi-view', 'view-ziwei'].forEach(function (vid) {
      var v = document.getElementById(vid);
      if (v) v.hidden = true;
    });
    if (btn.getAttribute('data-tab') === 'tab-remind') refreshPermUI();
    // 切到黄历时刷新日历（我的日子等标记及时显示）
    if (btn.getAttribute('data-tab') === 'tab-cal') { try { renderCalendar(); } catch (e) {} }
    // 进入经文 tab 时重置回目录页（问题1修复）
    if (btn.getAttribute('data-tab') === 'tab-jing') {
      if (window.JingWen && window.JingWen.resetToCatalog) {
        window.JingWen.resetToCatalog();
      } else {
        // 降级：直接操作 DOM
        var listEl = document.getElementById('jing-list');
        var marksEl = document.getElementById('jing-marks');
        var resultsEl = document.getElementById('jing-results');
        if (listEl) listEl.hidden = false;
        if (marksEl) marksEl.hidden = true;
        if (resultsEl) resultsEl.hidden = true;
      }
    }
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
/* 四柱单字五行（2026-10-08 用户定配色：木绿 火红 土黄 金金色 水深蓝，每字按自身五行着色） */
var GAN_WX = {甲:'mu',乙:'mu',丙:'huo',丁:'huo',戊:'tu',己:'tu',庚:'jin',辛:'jin',壬:'shui',癸:'shui'};
var ZHI_WX = {寅:'mu',卯:'mu',巳:'huo',午:'huo',辰:'tu',戌:'tu',丑:'tu',未:'tu',申:'jin',酉:'jin',亥:'shui',子:'shui'};
function pzHTML(g, z) {
  var wg = GAN_WX[g] || 'mu', wz = ZHI_WX[z] || 'mu';
  return '<span class="wxg wxg-' + wg + '">' + g + '</span><span class="wxg wxg-' + wz + '">' + z + '</span>';
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

  /* 值年太岁（A1：以立春时刻为年界，修复库正月初一年分界 bug） */
  var ygNow = yearGodOf(now());
  var tsl = $('#taisui-line');
  if (tsl) tsl.textContent = ygNow.name ? tf(t('taisui_line'), tx(ygNow.ganzhi), tx(ygNow.name)) : '';

  // 四柱（按全局时间基准取库输出，不做任何换算与改名；默认真太阳时；每字按自身五行着色）
  var ln2 = Solar.fromDate(solarNow()).getLunar();
  $('#pz-year').innerHTML = pzHTML(ln2.getYearGan(), ln2.getYearZhi());
  $('#pz-month').innerHTML = pzHTML(ln2.getMonthGan(), ln2.getMonthZhi());
  $('#pz-day').innerHTML = pzHTML(ln2.getDayGan(), ln2.getDayZhi());
  $('#pz-time').innerHTML = pzHTML(ln2.getTimeGan(), ln2.getTimeZhi());

  // 节气（动态）：语义单元锁为不换行整体，只在单元之间换行，避免"日）"之类被甩单
  var jqToday = lunar.getJieQi();
  var prev = lunar.getPrevJieQi(), next = lunar.getNextJieQi();
  var s = '<span class="nw">' + t('jieqi_now') + '<b>' + tx(prev.getName()) + '</b></span>' +
    ' <span class="nw">（' + fmtYmdShort(prev.getSolar().toYmd()) +
    ' — ' + tx(next.getName()) + fmtYmdShort(next.getSolar().toYmd()) + '）</span>';
  if (jqToday) s += '<br><span class="nw">' + t('jieqi_today') + '<b>' + tx(jqToday) + '</b></span>';
  $('#jieqi-line').innerHTML = s;

  /* 四值神（一行摘要，随语言切换重渲染）：每柱一个不换行单元，分隔符"·"收进单元内不落单 */
  var zsl = $('#zhishen-line');
  if (zsl) {
    var _zs = zhishenOf(td.y, td.m, td.d, true);
    zsl.innerHTML = '<span class="nw">' + t('zhishen_title') + '：' + t('zs_year') + tx(_zs.year.name) + ' ·</span> ' +
      '<span class="nw">' + t('zs_month') + tx(_zs.month.name) + ' ·</span> ' +
      '<span class="nw">' + t('zs_day') + tx(_zs.day.xiu) + '（' + tx(_zs.day.jian) + '） ·</span> ' +
      '<span class="nw">' + t('zs_hour') + tx(_zs.hour ? _zs.hour.name : '—') + '</span>';
  }
}
function tickClock() {
  var n = now(), p = function (x) { return (x < 10 ? '0' : '') + x; };
  $('#clock').textContent = p(n.getHours()) + ':' + p(n.getMinutes()) + ':' + p(n.getSeconds());
}
var lastHourKey = '';
function heartbeat() {
  tickClock();
  var t = ymd(now()), key = t.y + '-' + t.m + '-' + t.d;
  /* 时值神每时辰（2 小时）一变：日期或时辰变化都重算，否则首页/黄历的时值神会停留在旧时辰 */
  var hk = key + '|' + hourZhiIndex(solarNow());
  if (hk !== lastHourKey) { lastHourKey = hk; renderHome(); renderCalendar(); }
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
      var mds = myDaysOn(l); // 我的日子标记（彩色点）
      var ltxt = l.getDay() === 1 ? tx(l.getMonthInChinese()) + '月' : tx(l.getDayInChinese());
      var dots = '<span class="dots">' + (wu ? '<span class="wdot"></span>' : '') + (an ? '<span class="adot"></span>' : '') + (bd ? '<span class="bdot">★</span>' : '') + (sd ? '<span class="sdot">🍑</span>' : '')
        + mds.map(function (x) { return '<span class="mdot" style="background:' + escA(x.color) + '"></span>'; }).join('') + '</span>';
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
  if (sdn) {
    // 同日多神：拆成多个标签，避免单个标签过长溢出
    sdn.split('、').forEach(function (nm) {
      nm = nm.trim();
      if (nm) tags.push([tx(nm), 'tag-sd']);
    });
  }
  myDaysOn(l).forEach(function (x) {
    tags.push([escA(x.icon) + ' ' + escA(x.name), 'tag-myday']);
  });
  if (!isLeapM(l) && l.getDay() === 1) tags.push([t('tag_chuyi'), 'tag-lunar']);
  if (!isLeapM(l) && l.getDay() === 15) tags.push([t('tag_shiwu'), 'tag-lunar']);
  $('#detail-tags').innerHTML = tags.map(function (tg) {
    return '<span class="dtag ' + tg[1] + '">' + tg[0] + '</span>';
  }).join('');
  $('#detail-lunar').textContent = tx(l.getYearInChinese()) + '年' + tx(l.getMonthInChinese()) + '月' + tx(l.getDayInChinese());
  $('#detail-gz').textContent = l.getYearGan() + l.getYearZhi() + '年 ' + l.getMonthGan() + l.getMonthZhi() + '月 ' + l.getDayGan() + l.getDayZhi() + '日';
  var jq = l.getJieQi();
  $('#detail-jq').textContent = tx(jq) || '—';
  /* 四值神：所选日期的年/月/日值神（含名号＋一句话简介，悬停/长按看简介）；
   * 时值神只对"今日"展示（非今日日期不展示时值神）。 */
  var zsd = $('#detail-zhishen');
  if (zsd) {
    var _dz = zhishenOf(sel.y, sel.m, sel.d, false);
    var _ty = ymd(now());
    var _isT = (_ty.y === sel.y && _ty.m === sel.m && _ty.d === sel.d);
    var _rows = [
      [t('zs_year') + '：' + _dz.year.ganzhi + ' ' + tx(_dz.year.name) + '太岁', ''],
      [t('zs_month') + '：' + tx(_dz.month.name) + '（' + tx(_dz.month.diZhi) + '将）', _dz.month.desc],
      [t('zs_day') + '：' + tx(_dz.day.xiu) + '宿（' + tx(_dz.day.jian) + '日）',
        _dz.day.xiuDesc + '；' + _dz.day.jianDesc]
    ];
    if (_isT) {
      var _sn = solarNow(), _hi = hourZhiIndex(_sn);
      var _hg = hourGodOf(l.getDayZhi(), _hi);
      if (_hg) _rows.push([t('zs_hour') + '：' + tx(_hg.name) + '（' + tx(DIZHI[_hi] + '时') + '）', _hg.desc]);
    }
    zsd.innerHTML = _rows.map(function (r) {
      return '<span title="' + escA(r[1]) + '">' + escA(r[0]) + '</span>';
    }).join('<br>');
  }
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
function nidJingRec(y, m, d) { return (60000000 + y * 10000 + m * 100 + d) * 10; }
function nidMyDay(id, y, m, d) {
  // 用日子 id 的 hash + 日期生成唯一 id（避免与 nidWu 冲突，用 65 开头）
  var h = 0;
  var s = String(id);
  for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 100000;
  return (65000000 + h) * 100000 + (y % 100) * 10000 + m * 100 + d;
}
function nidBaidou(m, d, k) { return (80000000 + m * 100 + d) * 10 + (k || 0); }
function nidAnwu(y, m, d, k) { return (70000000 + y * 10000 + m * 100 + d) * 10 + (k || 0); }
var ADV_BASE = { gengshen: 1, jiazi: 2, chuyishiwu: 3, bajie: 4, sanyuan: 5, wula: 6, shendan: 7 };
function nidAdv(k, m, d, j) { return (90000000 + ADV_BASE[k] * 2000 + m * 100 + d) * 10 + (j || 0); }

/* ============ 神诞日表（农历，闰月不计；2026-10-08 扩充至61个） ============
 * 口径：宫观通行说法；多神同日以"、"并列；争议取最通行并标注。
 * 未收：中岳大帝/三茅真君/萨守坚/葛玄/蓝采和（查无通行日期，不编造） */
var SHENDAN = {
  '1-1':'天腊之辰', '1-4':'王重阳祖师羽化', '1-5':'五路财神圣诞', '1-6':'清水祖师圣诞',
  '1-8':'八仙节', '1-9':'玉皇大帝圣诞', '1-13':'关圣帝君成道', '1-15':'上元天官圣诞、临水夫人圣诞',
  '1-19':'丘处机圣诞',
  '2-1':'太阳星君圣诞', '2-2':'土地正神圣诞', '2-3':'文昌帝君圣诞', '2-6':'东华帝君圣诞',
  '2-15':'太上老君圣诞、九天玄女圣诞',
  '3-3':'玄天上帝圣诞', '3-7':'何仙姑圣诞', '3-15':'赵公元帅圣诞', '3-23':'天后妈祖圣诞',
  '3-28':'东岳大帝圣诞',
  '4-4':'文财神比干圣诞', '4-9':'张三丰圣诞', '4-14':'吕洞宾圣诞', '4-15':'汉钟离圣诞',
  '4-18':'碧霞元君圣诞、紫微大帝圣诞', '4-21':'托塔李天王圣诞',
  '5-5':'地腊之辰、赵公元帅飞升', '5-13':'关圣帝君圣诞、城隍圣诞（台北霞海城隍庙·各地不一）',
  '5-18':'张天师圣诞', '5-20':'吕洞宾成道日',
  '6-24':'雷祖圣诞、二郎神诞日',
  '7-7':'魁星圣诞、道德腊之辰', '7-10':'铁拐李圣诞', '7-15':'中元地官圣诞',
  '7-18':'王母娘娘圣诞', '7-19':'值年太岁圣诞', '7-22':'财神节',
  '8-1':'许真君飞升日', '8-3':'灶君圣诞、北斗星君圣诞', '8-10':'曹国舅圣诞、北岳大帝生辰',
  '8-15':'太阴星君圣诞',
  '9-1':'九皇大帝圣诞', '9-2':'九皇大帝圣诞', '9-3':'九皇大帝圣诞', '9-4':'九皇大帝圣诞',
  '9-5':'九皇大帝圣诞', '9-6':'九皇大帝圣诞', '9-7':'九皇大帝圣诞', '9-8':'九皇大帝圣诞',
  '9-9':'斗姥元君圣诞、妈祖飞升、玄天上帝飞升、哪吒圣诞、九皇大帝圣诞',
  '10-1':'民岁腊之辰', '10-10':'张果老圣诞', '10-15':'下元水官圣诞',
  '11-6':'西岳大帝圣诞', '11-9':'韩湘子圣诞', '11-11':'太乙救苦天尊圣诞',
  '12-8':'王侯腊之辰', '12-16':'南岳大帝生辰', '12-22':'王重阳圣诞', '12-24':'灶君登天日'
};
/* ============ 每日经文推荐 ============
 * 根据当日神诞/节日推荐相关经文，无对应时轮推通用经。
 * 映射键为神诞名称中的关键词，值为经文 id（见 jing/index.js）。
 * 2026-10-08 用户定：推荐卡片可点击，直跳经文阅读页。 */
/* 按农历日期直配（2026-10-08 用户审定清单；多神同日取首个直配项） */
var JING_RECOMMEND_BY_DATE = {
  '1-1':'s10', '1-4':'s13', '1-5':'s15', '1-6':'s10', '1-8':'s10',
  '1-9':'s27', '1-13':'s10', '1-15':'s03', '1-19':'s12',
  '2-1':'s26', '2-2':'s10', '2-3':'s07', '2-6':'s26', '2-15':'s07',
  '3-3':'s05', '3-7':'s26', '3-15':'s15', '3-23':'s28', '3-28':'s09',
  '4-4':'s15', '4-9':'s18', '4-14':'s20', '4-15':'s19', '4-18':'s04', '4-21':'s10',
  '5-5':'s10', '5-13':'s10', '5-18':'s01', '5-20':'s20',
  '6-24':'s29',
  '7-7':'s07', '7-10':'s26', '7-15':'s03', '7-18':'s26', '7-19':'s04', '7-22':'s15',
  '8-1':'s10', '8-3':'s04', '8-10':'s26', '8-15':'s26',
  '9-1':'s04', '9-2':'s04', '9-3':'s04', '9-4':'s04',
  '9-5':'s04', '9-6':'s04', '9-7':'s04', '9-8':'s04', '9-9':'s04',
  '10-1':'s10', '10-10':'s26', '10-15':'s03',
  '11-6':'s09', '11-9':'s26', '11-11':'s09',
  '12-8':'s10', '12-16':'s09', '12-22':'s13', '12-24':'s10',
  'dongzhi':'s09', 'xiazhi':'s09' // 冬至元始天尊圣诞、夏至灵宝天尊圣诞
};
/* 无神诞对应时的通用经轮推：按（经文,章节）轮推，一天一章 */
var JING_RECOMMEND_FALLBACK = ['s07', 's26', 's10', 's01', 's02', 's11', 's14'];
/* 各经章节数（2026-10-09 实测）：多章节的按天轮章 */
var JING_CHAPTER_COUNT = { s07: 81, s26: 1, s10: 1, s01: 67, s02: 19, s11: 33, s14: 1 };
function recommendJing(l) {
  var sdn = shendanName(l);
  var reason = '日常熏修', sid = null;
  if (sdn) {
    // 先按日期直配
    if (!isLeapM(l)) {
      var key = l.getMonth() + '-' + l.getDay();
      if (JING_RECOMMEND_BY_DATE[key]) {
        sid = JING_RECOMMEND_BY_DATE[key];
        reason = sdn.split('、')[0];
      }
    }
    // 节气神诞（冬至/夏至）
    if (!sid) {
      try {
        var jq = l.getJieQi();
        if (jq === '冬至' && JING_RECOMMEND_BY_DATE['dongzhi']) {
          sid = JING_RECOMMEND_BY_DATE['dongzhi']; reason = '元始天尊圣诞';
        } else if (jq === '夏至' && JING_RECOMMEND_BY_DATE['xiazhi']) {
          sid = JING_RECOMMEND_BY_DATE['xiazhi']; reason = '灵宝天尊圣诞';
        }
      } catch (e) {}
    }
    // 有神诞但无直配：用通用经（取神诞名作 reason）
    if (!sid) reason = sdn.split('、')[0];
  }
  if (!sid) {
    // 兜底：按日期轮推（一部经内按章节轮，一天一章）
    var doy = 0;
    try {
      var s = l.getSolar();
      var start = new Date(s.getYear(), 0, 1);
      var cur = new Date(s.getYear(), s.getMonth() - 1, s.getDay());
      doy = Math.floor((cur - start) / 86400000);
    } catch (e) {}
    // 先选经（7部轮），再在该经内按天轮章节
    var fSid = JING_RECOMMEND_FALLBACK[doy % JING_RECOMMEND_FALLBACK.length];
    var chCount = JING_CHAPTER_COUNT[fSid] || 1;
    // 用 doy 除以 7 的商来轮章节，保证同一部经连续多天推不同章节
    var secIdx = chCount > 1 ? Math.floor(doy / JING_RECOMMEND_FALLBACK.length) % chCount : 0;
    return { sid: fSid, reason: reason, secIdx: chCount > 1 ? secIdx : null };
  }
  // 神诞日：推整部经文（不指定章节）
  return { sid: sid, reason: reason, secIdx: null };
}
function jingTitleById(sid) {
  try {
    var idx = window.JINGWEN_INDEX || [];
    for (var i = 0; i < idx.length; i++) {
      if (idx[i].id === sid) return idx[i].title;
    }
  } catch (e) {}
  return sid;
}
function shendanName(l) {
  if (isLeapM(l)) return null;
  var r = SHENDAN[l.getMonth() + '-' + l.getDay()] || null;
  if (r) return r;
  /* 节气口径：冬至元始天尊圣诞、夏至灵宝天尊圣诞 */
  try {
    var jq = l.getJieQi();
    if (jq === '冬至') return '元始天尊圣诞';
    if (jq === '夏至') return '灵宝天尊圣诞';
  } catch (e) {}
  return null;
}

/* ============ 我的日子（用户自定义纪念日，存在本地） ============ */
var LS_MYDAYS = 'wuri_mydays';
var MYDAY_COLORS = ['#dc143c', '#e8912d', '#2e8b57', '#4169e1', '#8b5cf6', '#d4a017'];
var MYDAY_ICONS = ['🎂', '🎉', '🙏', '⭐', '❤️', '🏠', '💑', '🎓', '✈️', '🍑'];
function getMyDays() {
  try { return JSON.parse(localStorage.getItem(LS_MYDAYS) || '[]'); } catch (e) { return []; }
}
function saveMyDays(a) {
  try { localStorage.setItem(LS_MYDAYS, JSON.stringify(a)); } catch (e) {}
}
/* 导出"我的日子"为 ICS（网页版：手动下载导入日历） */
function exportMyDaysICS() {
  try {
    var days = getMyDays();
    if (!days.length) { alert('还没有添加自定义日子'); return; }
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//wuri//我的日子//CN',
      'NAME:我的日子', 'X-WR-CALNAME:我的日子', 'X-WR-TIMEZONE:America/Toronto',
      'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    var y0 = new Date().getFullYear();
    days.forEach(function (x, xi) {
      for (var y = y0; y < y0 + 4; y++) {
        var sm, sd;
        try {
          if (x.cal === 'lunar') {
            var s = Lunar.fromYmd(y, x.m, x.d).getSolar();
            sm = s.getMonth(); sd = s.getDay();
          } else { sm = x.m; sd = x.d; }
        } catch (e) { continue; }
        var dt = y * 10000 + sm * 100 + sd;
        lines.push('BEGIN:VEVENT');
        lines.push('UID:myday-' + xi + '-' + y + '@wuribushangxiang');
        lines.push('DTSTAMP:' + y0 + '0101T000000Z');
        lines.push('DTSTART;VALUE=DATE:' + dt);
        // 次日
        var nd = new Date(y, sm - 1, sd + 1);
        var ndt = nd.getFullYear() * 10000 + (nd.getMonth() + 1) * 100 + nd.getDate();
        lines.push('DTEND;VALUE=DATE:' + ndt);
        lines.push('SUMMARY:' + (x.icon || '') + ' ' + (x.name || '我的日子'));
        lines.push('DESCRIPTION:' + (x.cal === 'lunar' ? '农历' : '公历') + x.m + '月' + x.d + '日');
        lines.push('BEGIN:VALARM', 'TRIGGER:-P1D', 'ACTION:DISPLAY',
          'DESCRIPTION:明日：' + (x.name || ''), 'END:VALARM');
        lines.push('BEGIN:VALARM', 'TRIGGER:PT0S', 'ACTION:DISPLAY',
          'DESCRIPTION:今日：' + (x.name || ''), 'END:VALARM');
        lines.push('END:VEVENT');
      }
    });
    lines.push('END:VCALENDAR');
    var blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'wuri-我的日子.ics';
    document.body.appendChild(a); a.click();
    setTimeout(function () { try { URL.revokeObjectURL(a.href); a.remove(); } catch (e) {} }, 1000);
  } catch (e) { alert('导出失败'); }
}
/* 返回某农历日命中的自定义日子 */
function myDaysOn(l) {
  if (isLeapM(l)) return [];
  var lm = l.getMonth(), ld = l.getDay();
  var s = l.getSolar();
  // 注意：s 是农历库的 Solar 对象（非 JS Date）：getMonth() 返回 1-12，getDay() 返回日期
  var sm = s.getMonth(), sd = s.getDay();
  return getMyDays().filter(function (x) {
    return (x.cal === 'lunar' && x.m === lm && x.d === ld) ||
           (x.cal === 'solar' && x.m === sm && x.d === sd);
  });
}
var _mydayEditId = null, _mydayCal = 'lunar', _mydayColor = MYDAY_COLORS[0], _mydayIcon = MYDAY_ICONS[0];
function renderMyDayList() {
  var host = document.querySelector('#myday-list'); if (!host) return;
  var a = getMyDays();
  if (!a.length) { host.innerHTML = '<p class="hint">还没有自定义日子，点右上「＋ 添加」。如家人生日、结婚纪念日等。</p>'; return; }
  host.innerHTML = a.map(function (x) {
    var r = x.remind || {};
    var rtxt = '';
    if (r.on) {
      var kinds = r.kinds && r.kinds.length ? r.kinds : ['today'];
      var parts = kinds.map(function (k) {
        return k === 'today' ? '当天' : k === 'day1' ? '提前1天' : '提前' + (r.customDays || 0) + '天';
      });
      rtxt = ' · ⏰' + parts.join('/') + ' ' + (r.time || '08:00');
    }
    return '<div class="myday-item" data-id="' + x.id + '">'
      + '<span class="myday-dot" style="background:' + escA(x.color) + '"></span>'
      + '<span class="myday-icon">' + escA(x.icon) + '</span>'
      + '<div class="myday-info"><div class="myday-nm">' + escA(x.name) + '</div>'
      + '<div class="myday-dt">' + (x.cal === 'lunar' ? '农历' : '公历') + x.m + '月' + x.d + '日' + escA(rtxt) + '</div></div>'
      + '<button class="mini-btn tiny" data-act="edit">改</button>'
      + '<button class="mini-btn tiny danger" data-act="del">删</button></div>';
  }).join('');
  host.querySelectorAll('.myday-item').forEach(function (el) {
    var id = el.getAttribute('data-id');
    el.querySelector('[data-act="edit"]').addEventListener('click', function () { openMyDayForm(id); });
    el.querySelector('[data-act="del"]').addEventListener('click', function () {
      if (!confirm('删除这个日子吗？')) return;
      saveMyDays(getMyDays().filter(function (x) { return String(x.id) !== String(id); }));
      renderMyDayList(); window.__wuri_rerender();
    });
  });
}
function fillMyDayDateOpts() {
  var ms = document.querySelector('#myday-month'), ds = document.querySelector('#myday-day');
  var mh = '', dh = '';
  for (var m = 1; m <= 12; m++) mh += '<option value="' + m + '">' + m + '</option>';
  for (var d = 1; d <= 31; d++) dh += '<option value="' + d + '">' + d + '</option>';
  ms.innerHTML = mh; ds.innerHTML = dh;
}
function openMyDayForm(id) {
  _mydayEditId = id || null;
  var x = id ? getMyDays().filter(function (v) { return String(v.id) === String(id); })[0] : null;
  _mydayCal = x ? x.cal : 'lunar';
  _mydayColor = x ? x.color : MYDAY_COLORS[0];
  _mydayIcon = x ? x.icon : MYDAY_ICONS[0];
  document.querySelector('#myday-name').value = x ? x.name : '';
  document.querySelectorAll('.myday-cal').forEach(function (b) {
    b.classList.toggle('on', b.getAttribute('data-cal') === _mydayCal);
  });
  document.querySelector('#myday-month').value = x ? x.m : 1;
  document.querySelector('#myday-day').value = x ? x.d : 1;
  // 回填提醒设置
  var r = (x && x.remind) || { on: true, kinds: ['today'], customDays: 3, time: '08:00' };
  document.querySelector('#myday-remind-on').checked = !!r.on;
  document.querySelector('#myday-timing').hidden = !r.on;
  document.querySelectorAll('.myday-kind').forEach(function (cb) {
    cb.checked = (r.kinds || ['today']).indexOf(cb.value) >= 0;
  });
  document.querySelector('#myday-offset-num').value = (r.customDays != null ? r.customDays : 3);
  document.querySelector('#myday-offset-row').hidden = (r.kinds || []).indexOf('custom') < 0;
  document.querySelector('#myday-time').value = r.time || '08:00';
  renderMyDayPickers();
  document.querySelector('#myday-form').hidden = false;
  document.querySelector('#myday-add-btn').hidden = true;
}
function renderMyDayPickers() {
  document.querySelector('#myday-colors').innerHTML = MYDAY_COLORS.map(function (c) {
    return '<span class="cchip' + (c === _mydayColor ? ' on' : '') + '" data-c="' + c + '" style="background:' + c + '"></span>';
  }).join('');
  document.querySelector('#myday-icons').innerHTML = MYDAY_ICONS.map(function (ic) {
    return '<span class="ichip' + (ic === _mydayIcon ? ' on' : '') + '" data-ic="' + ic + '">' + ic + '</span>';
  }).join('');
  document.querySelectorAll('#myday-colors .cchip').forEach(function (el) {
    el.addEventListener('click', function () {
      _mydayColor = el.getAttribute('data-c'); renderMyDayPickers();
    });
  });
  document.querySelectorAll('#myday-icons .ichip').forEach(function (el) {
    el.addEventListener('click', function () {
      _mydayIcon = el.getAttribute('data-ic'); renderMyDayPickers();
    });
  });
}
function initMyDays() {
  if (!document.querySelector('#mydays-card')) return;
  fillMyDayDateOpts();
  renderMyDayList();
  document.querySelector('#myday-add-btn').addEventListener('click', function () { openMyDayForm(null); });
  var expBtn = document.querySelector('#myday-export-ics');
  if (expBtn) expBtn.addEventListener('click', exportMyDaysICS);
  document.querySelector('#myday-cancel').addEventListener('click', function () {
    document.querySelector('#myday-form').hidden = true; document.querySelector('#myday-add-btn').hidden = false;
  });
  document.querySelectorAll('.myday-cal').forEach(function (b) {
    b.addEventListener('click', function () {
      _mydayCal = b.getAttribute('data-cal');
      document.querySelectorAll('.myday-cal').forEach(function (x) {
        x.classList.toggle('on', x === b);
      });
    });
  });
  document.querySelector('#myday-save').addEventListener('click', function () {
    var name = (document.querySelector('#myday-name').value || '').trim();
    if (!name) { alert('请填写名称'); return; }
    var m = parseInt(document.querySelector('#myday-month').value, 10), d = parseInt(document.querySelector('#myday-day').value, 10);
    // 提醒设置
    var remindOn = document.querySelector('#myday-remind-on').checked;
    var kinds = [];
    document.querySelectorAll('.myday-kind:checked').forEach(function (cb) { kinds.push(cb.value); });
    var customDays = Math.max(0, parseInt(document.querySelector('#myday-offset-num').value, 10) || 0);
    var rtime = document.querySelector('#myday-time').value || '08:00';
    var remind = { on: remindOn, kinds: kinds.length ? kinds : ['today'], customDays: customDays, time: rtime };
    var a = getMyDays();
    if (_mydayEditId) {
      a.forEach(function (x) {
        if (String(x.id) === String(_mydayEditId)) {
          x.name = name; x.cal = _mydayCal; x.m = m; x.d = d; x.color = _mydayColor; x.icon = _mydayIcon; x.remind = remind;
        }
      });
    } else {
      a.push({ id: Date.now(), name: name, cal: _mydayCal, m: m, d: d, color: _mydayColor, icon: _mydayIcon, remind: remind });
    }
    saveMyDays(a);
    document.querySelector('#myday-form').hidden = true; document.querySelector('#myday-add-btn').hidden = false;
    renderMyDayList(); window.__wuri_rerender();
    try { reschedule(); } catch (e) {}
  });
  // 提醒开关控制时机区显示
  document.querySelector('#myday-remind-on').addEventListener('change', function () {
    document.querySelector('#myday-timing').hidden = !this.checked;
  });
  // 自选勾选时显示天数输入
  document.querySelectorAll('.myday-kind').forEach(function (cb) {
    cb.addEventListener('change', function () {
      var hasCustom = Array.prototype.some.call(document.querySelectorAll('.myday-kind:checked'), function (x) { return x.value === 'custom'; });
      document.querySelector('#myday-offset-row').hidden = !hasCustom;
    });
  });
}
/* 暴露给 IIFE 外调用（如浮动按钮初始化） */
window.initMyDays = initMyDays;

/* 六十甲子·值年太岁名：见 js/zhishen-data.js 的 TAISUI60
 * （2026-10-08 用户定底本：北京白云观元辰殿《岁君解厄延生法忏》版本） */

/* ============ 时间基准（真太阳时 / 当地平太阳时） ============
 * 2026-10-08 用户定：默认真太阳时，"我的→设置"可切换；八字排盘与时值神共用。
 * 真太阳时换算沿用 bazi.js 口径：经度修正 (lon-子午线)*4 分钟（不计均时差）。
 * solarNow() 仅用于时辰判定（时值神、首页时柱）；日期级逻辑（戊日、节气、提醒）仍用 now()。 */
function baseMeridian() {
  if (CFG.tz === 'beijing') return 120;
  return -new Date().getTimezoneOffset() / 4; // 如 EDT(UTC-4) → -60
}
function solarNow() {
  var n = now();
  if ((CFG.timebase || 'true') !== 'true') return n;
  var lon = parseFloat(CFG.lon);
  if (isNaN(lon)) return n; // 未填经度时退回当地平时（设置页有提示）
  return new Date(n.getTime() + (lon - baseMeridian()) * 4 * 60000);
}
function hourZhiIndex(d) {
  var h = d.getHours();
  return Math.floor((((h + 1) % 24) / 2)); // 0=子 … 11=亥
}
var DIZHI = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
function escA(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

/* ============ 四值神 · 推算算法 ============
 * 2026-10-08 用户定：只做动态四值神，不放静态四值功曹。
 * （旧代码说明：四值功曹固定名号「李丙/黄承乙/周登/刘洪」于 2026-10-08 移除，
 *  因道藏核验结论——该四名号在道藏中查无出处，仅见 2025 年闾山派现代网文，
 *  道藏中该职官一律作"四直功曹"配符箓内讳；App 改按历法动态推算四值神。） */
/* A1 年值神：以立春时刻为年界（不用库的正月初一年分界）
 * 注意 lunar-javascript 的 getJieQiTable() 冬春季中英双键，
 * 此处归一化后按公历年过滤，取当年立春。 */
var _jqCache = {};
function jieqiTableNorm(y) {
  if (_jqCache[y]) return _jqCache[y];
  var out = [], seen = {};
  [y - 1, y, y + 1].forEach(function (yy) {
    var tbl = Solar.fromYmd(yy, 6, 15).getLunar().getJieQiTable();
    Object.keys(tbl).forEach(function (k) {
      var name = (typeof JIEQI_EN2CN !== 'undefined' && JIEQI_EN2CN[k]) || k;
      var s = tbl[k];
      var t = new Date(s.getYear(), s.getMonth() - 1, s.getDay(), s.getHour(), s.getMinute(), s.getSecond()).getTime();
      var key = name + '@' + t;
      if (!seen[key]) { seen[key] = 1; out.push({ name: name, time: t }); }
    });
  });
  _jqCache[y] = out;
  return out;
}
function jieqiMoment(y, name) {
  var list = jieqiTableNorm(y), best = -1;
  for (var i = 0; i < list.length; i++) {
    if (list[i].name !== name) continue;
    if (new Date(list[i].time).getFullYear() !== y) continue;
    if (list[i].time > best) best = list[i].time;
  }
  return best >= 0 ? new Date(best) : null;
}
function ganzhiYearOf(date) {
  var y = date.getFullYear();
  var yy = date.getTime() >= jieqiMoment(y, '立春').getTime() ? y : y - 1;
  var idx = (((yy - 1984) % 60) + 60) % 60; // 1984=甲子
  var GAN = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
  return GAN[idx % 10] + DIZHI[idx % 12];
}
function yearGodOf(date) {
  var gz = ganzhiYearOf(date);
  return { ganzhi: gz, name: TAISUI60[gz] || '' };
}
/* A2 月将：取 ≤date 的最晚中气 → 登明…神后（归一化节气表，无跨年断档） */
function yuejiangOf(date) {
  var list = jieqiTableNorm(date.getFullYear()), best = null, bestT = -1;
  for (var i = 0; i < list.length; i++) {
    if (ZHONGQI_ORDER.indexOf(list[i].name) < 0) continue;
    if (list[i].time <= date.getTime() && list[i].time > bestT) { bestT = list[i].time; best = list[i].name; }
  }
  return best ? YUEJIANG[best] : YUEJIANG['大寒'];
}
/* A3 日值神：二十八宿（库 getXiu）＋ 建星（月支起建顺排至日支） */
function dayGodsOf(lunar) {
  var xiu = lunar.getXiu();
  var xs = XINGSU28[xiu] || { group: '', desc: '' };
  var mz = DIZHI.indexOf(lunar.getMonthZhi()), dz = DIZHI.indexOf(lunar.getDayZhi());
  var jian = JIANXING12[(dz - mz + 12) % 12];
  return { xiu: xiu, xiuGroup: xs.group, xiuDesc: xs.desc, jian: jian.name, jianDesc: jian.desc };
}
/* A4 时值神：「日起青龙」，日支定子时之神，十二时辰顺排 */
function hourGodOf(dayZhi, hourZhiIdx) {
  var start = SHIZHI_START[dayZhi];
  if (start == null || hourZhiIdx == null) return null;
  return SHIZHI12[(start + hourZhiIdx) % 12];
}
/* 当日四值神汇总（hour: 是否含时值神，用 solarNow 的时辰） */
function zhishenOf(y, m, d, withHour) {
  var date = new Date(y, m - 1, d, 12, 0, 0);
  var lunar = Solar.fromYmd(y, m, d).getLunar();
  var out = { year: yearGodOf(date), month: yuejiangOf(date), day: dayGodsOf(lunar), hour: null };
  if (withHour) {
    var sn = solarNow();
    var hg = hourGodOf(lunar.getDayZhi(), hourZhiIndex(sn));
    if (hg) out.hour = { name: hg.name, type: hg.type, desc: hg.desc, zhi: DIZHI[hourZhiIndex(sn)] };
  }
  return out;
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
/* 推送宽限：过了预定时间 10 分钟内仍推送（立即触发），超过则跳过
 * 注意：仅用户手动改时间时启用；App 启动自动重排时禁用，避免重复推送 */
var NOTIF_GRACE_MS = 10 * 60 * 1000;
var __graceEnabled = true;
function pushNotif(list, id, title, body, fire, extra) {
  var ft = fire.getTime(), nowMs = Date.now();
  if (ft <= nowMs) {
    if (__graceEnabled && nowMs - ft <= NOTIF_GRACE_MS) {
      // 宽限期内：改为 5 秒后立即推送
      fire = new Date(nowMs + 5000);
    } else {
      return;
    }
  }
  var n = { id: id, title: title, body: body, schedule: { at: fire } };
  if (extra) n.extra = extra;
  list.push(n);
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
  var jingrecOn = !!(CFG.jingrec && CFG.jingrec.on);
  var mydayRemindOn = false;
  try {
    mydayRemindOn = getMyDays().some(function (x) { return x.remind && x.remind.on; });
  } catch (e) {}
  if (!CFG.wu.on && !CFG.baidou.on && !anwuOn && !advOn && !jingrecOn && !mydayRemindOn) return list;
  var limit = capLimit();
  var offsWu = offsetsOf(CFG.wu); // 明戊/暗戊/拜斗共用提醒时机（多选）
  var offsAdv = offsetsOf(CFG.advTiming); // 进阶提醒时机（多选）
  for (var i = 0; i < 90 && list.length < limit; i++) {
    var dd = new Date(todayD.getTime()); dd.setDate(dd.getDate() + i);
    var o = ymd(dd);
    var l = lunarOf(o.y, o.m, o.d);
    /* 每日经文推送（独立推送，不与其他提醒互斥） */
    if (jingrecOn && list.length < limit) {
      try {
        var rec = recommendJing(l);
        var recTitle = jingTitleById(rec.sid);
        // 章节信息：日常轮推精确到章，神诞日推整部
        var chapStr = '';
        if (rec.secIdx != null) {
          chapStr = ' · 第' + (rec.secIdx + 1) + '章';
        }
        pushNotif(list, nidJingRec(o.y, o.m, o.d),
          '今日经文推荐',
          (rec.reason !== '日常熏修' ? rec.reason + ' · ' : '') + recTitle + chapStr,
          fireAt(dd, CFG.jingrec.time || '07:00', 0),
          { jingSid: rec.sid, jingSec: rec.secIdx });
      } catch (e) {}
    }
    /* 我的日子提醒：多选时机（当天/提前1天/自选N天） */
    if (list.length < limit) {
      try {
        var mydays = getMyDays();
        for (var mi = 0; mi < mydays.length; mi++) {
          var md = mydays[mi];
          if (!md.remind || !md.remind.on) continue;
          var kinds = md.remind.kinds && md.remind.kinds.length ? md.remind.kinds : ['today'];
          var dbs = []; // 去重后的提前天数列表
          kinds.forEach(function (k) {
            var db = k === 'today' ? 0 : k === 'day1' ? 1 : Math.max(0, parseInt(md.remind.customDays, 10) || 0);
            if (dbs.indexOf(db) < 0) dbs.push(db);
          });
          dbs.forEach(function (db, di) {
            if (list.length >= limit) return;
            // 目标日期 = 今天 + db 天
            var targetD = new Date(dd.getTime()); targetD.setDate(targetD.getDate() + db);
            var to = ymd(targetD);
            var tl = lunarOf(to.y, to.m, to.d);
            var hits = myDaysOn(tl).filter(function (x) { return String(x.id) === String(md.id); });
            if (hits.length) {
              var whenStr = db === 0 ? '今天' : db === 1 ? '明天' : db + '天后';
              pushNotif(list, nidMyDay(md.id, to.y, to.m, to.d) + di,
                (md.icon || '📅') + ' ' + md.name,
                whenStr + '是' + md.name + '（' + (md.cal === 'lunar' ? '农历' : '公历') + md.m + '月' + md.d + '日）',
                fireAt(dd, md.remind.time || '08:00', 0));
            }
          });
        }
      } catch (e) {}
    }
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
  // 存经文通知的触发时间，供回到前台时判断（用户 2026-10-09：点通知跳转核心需求）
  try {
    var jingFires = [];
    for (var bi = 0; bi < list.length; bi++) {
      var bn = list[bi];
      if (bn && bn.title === '今日经文推荐' && bn.schedule && bn.schedule.at) {
        var atMs = new Date(bn.schedule.at).getTime();
        if (!isNaN(atMs)) {
          // 存触发时间和对应的经文/章节（跳转时直接用，不重算）
          var ex = bn.extra || {};
          jingFires.push({ at: atMs, sid: ex.jingSid || null, sec: (ex.jingSec != null ? ex.jingSec : null) });
        }
      }
    }
    localStorage.setItem('wuri_jingrec_fires', JSON.stringify(jingFires));
  } catch (e) {}
  return list;
}

var scheduling = false;
/* ---------- 网页版提醒（无原生桥接时） ---------- */
/* 用 localStorage 存排期 + setTimeout 定时 + Web Notification 显示。
   仅页面打开时有效；可靠提醒请用上方 ICS 日历订阅。 */
var webTimers = [];
function webClearTimers() {
  for (var i = 0; i < webTimers.length; i++) { try { clearTimeout(webTimers[i]); } catch (e) {} }
  webTimers = [];
}
function webShowNotification(title, body, extra) {
  try {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    var n = new Notification(title || '戊日不上香', {
      body: body || '',
      icon: './icon-192.png',
      tag: 'wuri-' + Date.now()
    });
    n.onclick = function () {
      try { window.focus(); } catch (e) {}
      // 经文推送：点通知跳到对应经文
      try {
        if (extra && extra.jingSid && window.openJingFromNotification) {
          window.openJingFromNotification(extra.jingSid, extra.jingSec || 0);
        }
      } catch (e2) {}
      try { n.close(); } catch (e3) {}
    };
  } catch (e) {}
}
function webReschedule() {
  if (scheduling) return;
  scheduling = true;
  try {
    webClearTimers();
    var list = buildNotifications();
    var now = Date.now();
    var count = 0;
    // 只排未来 48 小时内的；每 30 分钟重新排一次（补漏）
    for (var i = 0; i < list.length; i++) {
      (function (nt) {
        try {
          var at = nt.schedule && nt.schedule.at ? new Date(nt.schedule.at).getTime() : 0;
          if (!at || isNaN(at)) return;
          var delay = at - now;
          if (delay < 0 || delay > 48 * 3600 * 1000) return;
          count++;
          webTimers.push(setTimeout(function () {
            webShowNotification(nt.title, nt.body, nt.extra);
          }, delay));
        } catch (e) {}
      })(list[i]);
    }
    try {
      localStorage.setItem('wuri_web_sched', JSON.stringify({ at: now, count: count, total: list.length }));
    } catch (e2) {}
    var infoEl = $('#schedule-info');
    if (infoEl) {
      infoEl.textContent = '网页提醒 ' + count + '/' + list.length + ' 条（需保持页面打开）| 可靠提醒请用上方 ICS 日历订阅';
    }
  } catch (e3) {}
  scheduling = false;
  // 30 分钟后重新排（处理新增/时间推移）
  try {
    webTimers.push(setTimeout(webReschedule, 30 * 60 * 1000));
  } catch (e4) {}
}
function reschedule() {
  if (scheduling) return;
  if (!isNative()) { webReschedule(); return; }
  // 优先走原生 WuBridge（WebView 版），带 jingSid/jingSec 透传（用户 2026-10-09：点通知进经文）
  var wuBridge = null;
  try { wuBridge = window.WuBridge || null; } catch (e) {}
  if (wuBridge && wuBridge.schedule) {
    try {
      scheduling = true;
      var list = buildNotifications();
      // 转成 WuBridge 格式：{id,title,body,at:ISO,jingSid,jingSec}
      var bridgeList = [];
      for (var i = 0; i < list.length; i++) {
        var n = list[i];
        var ex = n.extra || {};
        var atDate = n.schedule && n.schedule.at ? new Date(n.schedule.at) : null;
        if (!atDate || isNaN(atDate.getTime())) continue;
        bridgeList.push({
          id: n.id,
          title: n.title || '',
          body: n.body || '',
          at: atDate.toISOString(),
          jingSid: ex.jingSid || null,
          jingSec: (ex.jingSec != null ? ex.jingSec : -1)
        });
      }
      var count = 0;
      var schedErr = '';
      try {
        if (wuBridge.cancelAll) wuBridge.cancelAll();
        count = wuBridge.schedule(JSON.stringify(bridgeList)) || 0;
      } catch (e3) { schedErr = String(e3 && e3.message || e3); }
      scheduling = false;
      // 诊断：显示实际排期数（用户 2026-10-09）
      try {
        var infoEl = $('#schedule-info');
        if (infoEl) {
          var msg = '原生排期 ' + count + '/' + bridgeList.length + ' 条';
          if (schedErr) msg += '（出错:' + schedErr + '）';
          // 查 BootReceiver 是否跑过
          try {
            var bootTime = wuBridge.getBootReceiverTime ? wuBridge.getBootReceiverTime() : 0;
            if (bootTime > 0) {
              var bd = new Date(bootTime);
              msg += ' | 开机恢复:' + bd.getMonth() + 1 + '/' + bd.getDate() + ' ' + bd.getHours() + ':' + String(bd.getMinutes()).padStart(2, '0');
              // Direct Boot：显示是锁屏阶段还是解锁后恢复的
              try {
                var bk = wuBridge.getBootKind ? wuBridge.getBootKind() : '';
                if (bk === 'locked') msg += '(锁屏)';
                else if (bk === 'unlocked') msg += '(已解锁)';
              } catch (e5b) {}
            } else {
              msg += ' | 开机恢复:未运行';
            }
          } catch (e5) {}
          infoEl.textContent = msg;
        }
        localStorage.setItem('wuri_last_sched', JSON.stringify({ at: Date.now(), count: count, total: bridgeList.length }));
      } catch (e6) {}
      return;
    } catch (e4) { scheduling = false; }
  }
  // 回退：Capacitor
  var ln = LN();
  if (!ln) return;
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
    // 网页版：显示浏览器通知权限状态
    try {
      var np = ('Notification' in window) ? Notification.permission : 'unsupported';
      $('#perm-notif').textContent = np === 'granted' ? t('perm_allowed')
        : np === 'denied' ? t('perm_denied')
        : np === 'unsupported' ? '浏览器不支持'
        : t('perm_prompt');
    } catch (e) { $('#perm-notif').textContent = t('perm_device_only'); }
    $('#perm-alarm').textContent = '网页版无精确闹钟（用 ICS 日历订阅）';
    var btnNotif = $('#btn-notif');
    if (btnNotif) {
      btnNotif.textContent = '申请浏览器通知权限';
      btnNotif.onclick = function () {
        try {
          if (!('Notification' in window)) return;
          Notification.requestPermission().then(function () { refreshPermUI(); });
        } catch (e) {}
      };
    }
    var btnAlarm = $('#btn-alarm');
    if (btnAlarm) btnAlarm.style.display = 'none';
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
  var sjr = $('#jingrec-on');
  if (sjr) {
    sjr.checked = !!(CFG.jingrec && CFG.jingrec.on);
    var jrtRow = $('#jingrec-time-row');
    if (jrtRow) jrtRow.hidden = !sjr.checked;
    var jrtTestRow = $('#jingrec-test-row');
    if (jrtTestRow) jrtTestRow.hidden = !sjr.checked;
    sjr.addEventListener('change', function () {
      CFG.jingrec.on = sjr.checked; saveCfg(); reschedule();
      if (jrtRow) jrtRow.hidden = !sjr.checked;
      if (jrtTestRow) jrtTestRow.hidden = !sjr.checked;
    });
    // 测试跳转按钮（用户 2026-10-09：验证跳转逻辑本身）
    var jrtTestBtn = $('#jingrec-test-btn');
    if (jrtTestBtn) {
      jrtTestBtn.addEventListener('click', function () {
        try {
          // 直接重算（计算已验证正确：41章）
          var tdNow = ymd(now());
          var lNow = lunarOf(tdNow.y, tdNow.m, tdNow.d);
          var recNow = recommendJing(lNow);
          var useSid = recNow ? recNow.sid : null;
          var useSec = recNow ? recNow.secIdx : null;
          if (useSid) {
            var tabBtn = document.querySelector('[data-tab="tab-jing"]');
            if (tabBtn) tabBtn.click();
            (function (sid, sec) {
              setTimeout(function () {
                if (window.JingWen && window.JingWen.openReader) {
                  window.JingWen.openReader(sid);
                  if (sec != null) {
                    setTimeout(function () {
                      // 先展开再滚动（用户 2026-10-09：先展开更精准）
                      var targetSec = document.querySelector('#jing-reader .jing-sec[data-sec="' + sec + '"]');
                      if (targetSec) {
                        var hd = targetSec.querySelector('.jing-sec-hd');
                        var body = targetSec.querySelector('.jing-sec-body');
                        // 先展开
                        if (body && body.hidden) {
                          if (hd) hd.click();
                          else body.hidden = false;
                        }
                        // 再滚动（等展开动画）
                        setTimeout(function () {
                          targetSec.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }, 300);
                      }
                    }, 800);
                  }
                }
              }, 500);
            })(useSid, useSec);
          }
        } catch (e) {}
      });
    }
    var jrt = $('#jingrec-time');
    if (jrt) {
      jrt.value = (CFG.jingrec && CFG.jingrec.time) || '07:00';
      jrt.addEventListener('change', function () {
        CFG.jingrec.time = jrt.value || '07:00'; saveCfg(); reschedule();
      });
    }
  }
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
  $('#btn-test').addEventListener('click', function () {
    var info = $('#test-info');
    // 网页版：用 Web Notification 发测试提醒
    if (!isNative()) {
      try {
        if (!('Notification' in window)) { info.textContent = '此浏览器不支持通知'; return; }
        var showTest = function () {
          webShowNotification('戊日不上香 · 测试提醒', '网页通知通道正常（页面打开时有效）', null);
          info.textContent = '已发送测试通知，请查看浏览器通知';
        };
        if (Notification.permission === 'granted') showTest();
        else if (Notification.permission !== 'denied') {
          Notification.requestPermission().then(function (p) {
            if (p === 'granted') showTest();
            else info.textContent = '通知权限被拒绝，请在浏览器设置中允许';
          });
        } else info.textContent = '通知权限被拒绝，请在浏览器设置中允许';
      } catch (e) { info.textContent = '发送失败'; }
      return;
    }
    var ln = LN();
    if (!ln) { info.textContent = t('test_not_native'); return; }
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
  try {
    var last = JSON.parse(localStorage.getItem('wuri_last_sched'));
    if (last) $('#schedule-info').textContent = tf(t('sched_done'), last.count);
  } catch (e) {}
  // 启动时自动重排：保证 90 天窗口永远新鲜（用户 2026-10-09 反馈：90天后提醒会停）
  // 注意：禁用宽限，避免已响过的通知重复推送（用户 2026-10-09 反馈：推送了3遍）
  try {
    setTimeout(function () {
      try { __graceEnabled = false; reschedule(); __graceEnabled = true; } catch (e) { __graceEnabled = true; }
    }, 3000);
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
  /* 时间基准：真太阳时（默认）/ 当地平太阳时；八字排盘与时值神共用 */
  $$('input[name=timebase]').forEach(function (r) {
    r.checked = (r.value === (CFG.timebase || 'true'));
    r.addEventListener('change', function () { CFG.timebase = r.value; saveCfg(); renderHome(); renderCalendar(); });
  });
  var lonI = $('#cfg-lon');
  if (lonI) {
    lonI.value = CFG.lon || '';
    lonI.addEventListener('change', function () { CFG.lon = lonI.value.trim(); saveCfg(); renderHome(); renderCalendar(); });
  }
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
  myDaysOn: myDaysOn,
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
    // 打坐冥想全屏页内不触发边缘返回（避免与场景滑动冲突，用户 2026-10-09 反馈：划场景退回首页）
    try {
      var tgt = e.target;
      if (tgt && tgt.closest && tgt.closest('#med-pager')) { tracking = false; return; }
    } catch (err) {}
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

  /* 通知点击跳转到经文（放主 IIFE 内，可访问 recommendJing 等函数）
     用户 2026-10-09 反馈：点每日经文通知不跳转
     2026-10-09 优化：队列机制，冷启动时事件先存着，等初始化完再处理 */
  var pendingNotifTap = null;
  function doNotifTap(ev) {
    try {
      var ex = (ev && ev.notification && ev.notification.extra) || {};
      var sid = ex.jingSid, sec = ex.jingSec;
      // 备用：extra 丢了就按今天重算（算法确定，重算结果一致）
      if (!sid && ev && ev.notification && /经文/.test(ev.notification.title || '')) {
        try {
          var tdNow = ymd(now());
          var lNow = lunarOf(tdNow.y, tdNow.m, tdNow.d);
          var recNow = recommendJing(lNow);
          sid = recNow.sid; sec = recNow.secIdx;
        } catch (e2) {}
      }
      if (!sid) return false;
      var tabBtn = document.querySelector('[data-tab="tab-jing"]');
      if (!tabBtn) return false; // DOM 没好，稍后重试
      tabBtn.click();
      setTimeout(function () {
        if (window.JingWen && window.JingWen.openReader) {
          window.JingWen.openReader(sid);
          if (sec != null) {
            setTimeout(function () {
              var targetSec = document.querySelector('#jing-reader .jing-sec[data-sec="' + sec + '"]');
              if (targetSec) {
                targetSec.scrollIntoView({ behavior: 'smooth', block: 'start' });
                var hd = targetSec.querySelector('.jing-sec-hd');
                if (hd && targetSec.classList.contains('collapsed')) hd.click();
              }
            }, 800);
          }
        }
      }, 500);
      return true;
    } catch (e) { return false; }
  }
  function flushPendingNotifTap() {
    if (pendingNotifTap) {
      var ev = pendingNotifTap;
      pendingNotifTap = null;
      if (!doNotifTap(ev)) {
        // 还没好，放回去下次再试
        pendingNotifTap = ev;
      }
    }
  }
  (function regNotifTap() {
    function handleNotifTap(ev) {
      // 先存队列，等初始化完统一处理
      pendingNotifTap = ev;
      flushPendingNotifTap();
    }
    function tryReg() {
      try {
        var c = window.Capacitor;
        var ln = (c && c.Plugins && c.Plugins.LocalNotifications) || null;
        if (ln && ln.addListener) {
          ln.addListener('localNotificationActionPerformed', handleNotifTap);
          return true;
        }
      } catch (e) {}
      return false;
    }
    if (!tryReg()) {
      var tries = 0;
      var iv = setInterval(function () {
        if (tryReg() || ++tries > 20) clearInterval(iv);
      }, 500);
    }
    // 初始化完成后（3秒）再冲一次队列，应对冷启动
    setTimeout(flushPendingNotifTap, 3000);
    setTimeout(flushPendingNotifTap, 6000);

    /* 备用方案：App 回到前台时，检查是否有经文通知刚响过（不依赖 Capacitor 事件）
       用户 2026-10-09：点通知不跳转是核心需求 */
    var lastJingNotifCheck = 0;
    var handledNotifAts = {}; // 已处理过的通知时间戳，避免重复跳转
    function checkJingNotifOnResume() {
      try {
        var nowMs = Date.now();
        // 读上次排期的经文通知（带 sid/sec，直接用不重算）
        var saved = null;
        try { saved = JSON.parse(localStorage.getItem('wuri_jingrec_fires') || '[]'); } catch (e) {}
        if (!saved || !saved.length) return;
        for (var i = 0; i < saved.length; i++) {
          var item = saved[i];
          var ft = (item && item.at) ? item.at : item; // 兼容旧格式（纯时间戳）
          // 跳过已处理过的
          if (handledNotifAts[ft]) continue;
          // 通知在过去 10 分钟内响过（放宽窗口，用户可能晚点才点）
          if (nowMs - ft >= 0 && nowMs - ft <= 600000) {
            // 直接用存的 sid/sec，不重算（保证和通知一致）
            var useSid = (item && item.sid) ? item.sid : null;
            var useSec = (item && item.sec != null) ? item.sec : null;
            if (!useSid) {
              // 旧格式没有存，fallback 重算
              try {
                var tdNow = ymd(now());
                var lNow = lunarOf(tdNow.y, tdNow.m, tdNow.d);
                var recNow = recommendJing(lNow);
                if (recNow) { useSid = recNow.sid; useSec = recNow.secIdx; }
              } catch (e2) {}
            }
            if (useSid) {
              var tabBtn = document.querySelector('[data-tab="tab-jing"]');
              if (tabBtn) tabBtn.click();
              (function (sid, sec) {
                setTimeout(function () {
                  if (window.JingWen && window.JingWen.openReader) {
                    window.JingWen.openReader(sid);
                    if (sec != null) {
                      setTimeout(function () {
                        var targetSec = document.querySelector('#jing-reader .jing-sec[data-sec="' + sec + '"]');
                        if (targetSec) targetSec.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }, 800);
                    }
                  }
                }, 500);
              })(useSid, useSec);
              handledNotifAts[ft] = true; // 标记已处理，避免重复跳转
              break; // 只跳一次
            }
          }
        }
      } catch (e) {}
    }
    // 定时轮询已禁用（用户 2026-10-09 反馈：会提前误跳）
    // 保留事件监听作为补充
    try {
      document.addEventListener('resume', checkJingNotifOnResume, false);
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden) checkJingNotifOnResume();
      }, false);
    } catch (e) {}
  })();

  /* 原生通知点击跳转入口（MainActivity 调这个）用户 2026-10-09 */
  var lastNotifNav = { sid: null, sec: null, time: 0 };
  window.openJingFromNotification = function (sid, sec) {
    try {
      if (!sid) return;
      // 去重：5 秒内相同的跳转只执行一次（原生层会发两次兜底）
      var nowMs = Date.now();
      if (lastNotifNav.sid === sid && lastNotifNav.sec === sec && (nowMs - lastNotifNav.time) < 5000) return;
      lastNotifNav = { sid: sid, sec: sec, time: nowMs };
      var secNum = (sec != null && sec !== -1) ? sec : null;
      var tabBtn = document.querySelector('[data-tab="tab-jing"]');
      if (tabBtn) tabBtn.click();
      setTimeout(function () {
        if (window.JingWen && window.JingWen.openReader) {
          window.JingWen.openReader(sid);
          if (secNum != null) {
            setTimeout(function () {
              var targetSec = document.querySelector('#jing-reader .jing-sec[data-sec="' + secNum + '"]');
              if (targetSec) {
                var hd = targetSec.querySelector('.jing-sec-hd');
                var body = targetSec.querySelector('.jing-sec-body');
                if (body && body.hidden) {
                  if (hd) hd.click();
                  else body.hidden = false;
                }
                setTimeout(function () {
                  targetSec.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 300);
              }
            }, 800);
          }
        }
      }, 500);
    } catch (e) {}
  };
})();

/* 供 bazi.js 等读取全局设置（时间基准/经度）：八字排盘与时值神共用此时钟基准 */
window.__wuriGetCfg = function () { return CFG; };

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
    try { window.initMyDays(); } catch (e) { try { console.error('initMyDays:', e.message); } catch (_) {} }
  }

  /* ---------- 数据备份/恢复 ---------- */
  // 需要备份的用户数据键（心得/高亮/书签/八字/六爻/打卡/日记/配置）
  var BACKUP_KEYS = [
    'wuri_jing_bookmarks', 'wuri_jing_highlights', 'wuri_jing_notes', 'wuri_jing_recite',
    'wuri_bazi_history_v3',
    'ly_history',
    'wuri_daka_habits', 'wuri_daka_records',
    'wuri_practice_journal', 'wuri_practice_schedule', 'wuri_zw_history',
    'wuri_cfg_v1', 'wuri_jing_font', 'wuri_jing_py'
  ];
  function initBackup() {
    function appToast(msg) {
      var t = document.getElementById('app-toast');
      if (!t) {
        t = document.createElement('div');
        t.id = 'app-toast';
        t.style.cssText = 'position:fixed;left:50%;bottom:100px;transform:translateX(-50%);background:rgba(0,0,0,0.8);color:#fff;padding:10px 18px;border-radius:8px;font-size:14px;z-index:99999;display:none;';
        document.body.appendChild(t);
      }
      t.textContent = msg;
      t.style.display = 'block';
      setTimeout(function() { t.style.display = 'none'; }, 2000);
    }
    var emailLink = document.getElementById('contact-email');
    if (emailLink) emailLink.addEventListener('click', function () {
      var em = this.getAttribute('data-email');
      try {
        if (navigator.clipboard) navigator.clipboard.writeText(em);
        else {
          var ta = document.createElement('textarea');
          ta.value = em; document.body.appendChild(ta); ta.select();
          document.execCommand('copy'); document.body.removeChild(ta);
        }
        appToast('邮箱已复制：' + em);
      } catch (e) { appToast(em); }
    });
    var expBtn = document.getElementById('backup-export');
    var impBtn = document.getElementById('backup-import-btn');
    var impInput = document.getElementById('backup-import');
    var msg = document.getElementById('backup-msg');
    function setMsg(t) { if (msg) msg.textContent = t; }
    if (expBtn) expBtn.addEventListener('click', function () {
      try {
        var data = { app: 'wuribushangxiang', v: 1, ts: Date.now(), store: {} };
        BACKUP_KEYS.forEach(function (k) {
          try {
            var v = localStorage.getItem(k);
            if (v !== null) data.store[k] = v;
          } catch (e) {}
        });
        var jsonStr = JSON.stringify(data);
        var d = new Date();
        var ds = d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2);
        var fname = 'wuri-backup-' + ds + '.json';
        // 优先用原生桥保存到 Download 目录
        var b = (typeof window.WuBridge !== 'undefined') ? window.WuBridge : null;
        if (b && typeof b.saveBackupFile === 'function') {
          var path = '';
          try { path = b.saveBackupFile(fname, jsonStr); } catch (e) {}
          if (path) {
            setMsg('备份已导出到：' + path);
            return;
          }
        }
        // 降级：浏览器下载
        var blob = new Blob([jsonStr], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = fname;
        document.body.appendChild(a); a.click();
        setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 500);
        setMsg('备份已导出：' + fname);
      } catch (e) {
        setMsg('导出失败：' + e.message);
      }
    });
    if (impInput) {
      impInput.addEventListener('change', function () {
        var f = impInput.files && impInput.files[0];
        if (!f) return;
        var r = new FileReader();
        r.onload = function () {
          try {
            var data = JSON.parse(r.result);
            if (!data || !data.store) throw new Error('文件格式不对');
            var n = 0;
            Object.keys(data.store).forEach(function (k) {
              try { localStorage.setItem(k, data.store[k]); n++; } catch (e) {}
            });
            setMsg('已恢复 ' + n + ' 项数据，正在刷新…');
            setTimeout(function () { location.reload(); }, 1200);
          } catch (e) {
            setMsg('导入失败：' + e.message);
          }
          impInput.value = '';
        };
        r.readAsText(f);
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  // 备份功能初始化（DOM 就绪后）
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBackup);
  } else {
    initBackup();
  }
})();

// 免费版：隐藏 Pro 功能
(function() {
  if (!window.IS_FREE_BUILD) return;
  function hideFree() {
    // 隐藏八字/六爻/紫微/修行入口
    ['bazi-entry-card','liuyao-entry-card','ziwei-entry-card','practice-entry-card'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    // 隐藏备份区（找包含"数据备份"标题的 card）
    document.querySelectorAll('#view-me .card').forEach(function(card) {
      var title = card.querySelector('.card-title');
      if (title && title.textContent.indexOf('数据备份') >= 0) {
        card.style.display = 'none';
      }
    });
    // 隐藏背诵按钮（经文页）
    var recite = document.getElementById('jing-recite');
    if (recite) recite.style.display = 'none';
    // 免费版"我的"页：只留"解锁高级版"，隐藏恢复/兑换/测试
    document.querySelectorAll('[data-pro-act="restore"]').forEach(function(el) {
      el.style.display = 'none';
    });
    var rb = document.getElementById('redeem-btn');
    if (rb) rb.style.display = 'none';
    document.querySelectorAll('[data-pro-testbtn]').forEach(function(el) {
      el.style.display = 'none';
    });
    // 免费版标题改为"免费版"
    document.querySelectorAll('#view-me .pro-card .card-title [data-i18n="pro_title"]').forEach(function(el) {
      el.removeAttribute('data-i18n');
      el.textContent = '免费版';
    });
    // 免费版：强制显示经文（覆盖 pro.js 的锁）
    function forceShowJing() {
      var jl = document.getElementById('jing-lock');
      if (jl) jl.style.display = 'none';
      var jb = document.getElementById('jing-body');
      if (jb) jb.style.display = '';
    }
    forceShowJing();
    // 多试几次，确保覆盖
    [500, 1500, 3000].forEach(function(ms) {
      setTimeout(forceShowJing, ms);
    });
    // 强制 Pro 状态为未解锁（忽略本地存储）
    try { localStorage.removeItem('wuri_pro'); } catch(e) {}
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', hideFree);
  } else {
    hideFree();
  }
  // 延迟再执行一次（等动态内容）
  setTimeout(hideFree, 1000);
})();
