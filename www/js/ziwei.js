/* 紫微斗数排盘 · Pro · 基于 iztro v2.6.3
 * 宫位索引口径（重要）：iztro 的 palaces[] / palace(i) 是「地支序」索引
 * （寅0 卯1 辰2 巳3 午4 未5 申6 酉7 戌8 亥9 子10 丑11），宫名一律以引擎 p.name 为准。
 * 2026-10-22 升级内容：
 *  ① iztro 对齐官方 v2.6.3（基线 11 组样本全字段一致）；
 *  ② 适配层补运限逐层下钻（大限/流年/流月/流日＋流耀叠加）、三方四正联动高亮、飞化/自化标注；
 *  ③ 修正旧适配层两处错误：(a) 旧版把地支序索引误当命宫相对序贴宫名标签，整盘宫名错位
 *     （实测 1986-11-7 辰时男：旧版「命宫」格显示的是疾厄宫庚寅的星），已改为地支固定宫位＋p.name；
 *     (b) byLunar 第 4 参是 isLeapMonth，旧代码误传 true（所有农历输入都被当闰月），已改 false，
 *     第 5 参 fixLeap=true 沿用既定「闰月按当月」口径。
 */
(function () {
'use strict';
var $ = function (s) { return document.querySelector(s); };
var isPro = function () { return window.WuriPro && WuriPro.isPro(); };
var privacyOn = false;
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function pad2(n) { return (n < 10 ? '0' : '') + n; }
// 传统 4x4 固定宫位布局：格位（行优先）对应的地支序索引，中央 2x2 为信息区
// 行1 巳3 午4 未5 申6 / 行2 辰2 · · 酉7 / 行3 卯1 · · 戌8 / 行4 寅0 丑11 子10 亥9
var PALACE_GRID = [3, 4, 5, 6, 2, null, null, 7, 1, null, null, 8, 0, 11, 10, 9];
var PALACE_NAMES = ['命宫', '兄弟', '夫妻', '子女', '财帛', '疾厄', '迁移', '交友', '官禄', '田宅', '福德', '父母'];
/* 四化表（通行口径，与 iztro 默认配置一致；2026-10-22 已用丙/庚两年引擎生年四化实测核对）。
 * 每干依次为 [化禄, 化权, 化科, 化忌] 的星名。飞化/自化标注据此表计算。 */
var MUTAGEN_BY_STEM = {
  '甲': ['廉贞', '破军', '武曲', '太阳'], '乙': ['天机', '天梁', '紫微', '太阴'],
  '丙': ['天同', '天机', '文昌', '廉贞'], '丁': ['太阴', '天同', '天机', '巨门'],
  '戊': ['贪狼', '太阴', '右弼', '天机'], '己': ['武曲', '贪狼', '天梁', '文曲'],
  '庚': ['太阳', '武曲', '太阴', '天同'], '辛': ['巨门', '太阳', '文曲', '文昌'],
  '壬': ['天梁', '紫微', '左辅', '武曲'], '癸': ['破军', '巨门', '太阴', '贪狼']
};
var HUA_NAMES = ['禄', '权', '科', '忌'];
var LAYER_LABEL = { decadal: '大限', yearly: '流年', monthly: '流月', daily: '流日' };
var LAYER_HUA_PREFIX = { decadal: '限', yearly: '年', monthly: '月', daily: '日' };
var cur = null; // {astro, dateStr, timeIdx, gender, extra, layer, horoDate, horo, sel, decadalList}
function openView() {
  if (!isPro()) { if (window.WuriPro) WuriPro.showPaywall('ziwei'); return; }
  ['view-ziwei'].forEach(function (id) { var v = document.getElementById(id); if (v) v.hidden = false; });
  document.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('active'); });
  window.scrollTo(0, 0);
}
function closeView() {
  var v = document.getElementById('view-ziwei'); if (v) v.hidden = true;
  var home = document.getElementById('tab-home'); if (home) home.classList.add('active');
}
function switchTab(name) {
  document.querySelectorAll('[data-zwtab]').forEach(function (b) {
    b.classList.toggle('active', b.getAttribute('data-zwtab') === name);
  });
  ['input', 'result', 'history'].forEach(function (n) {
    var el = document.getElementById('zw-tab-' + n);
    if (el) el.hidden = (n !== name);
  });
  if (name === 'history') renderHistory();
}
function saveHistory(entry) {
  try {
    var arr = JSON.parse(localStorage.getItem('wuri_zw_history') || '[]');
    arr.unshift(entry);
    if (arr.length > 300) arr = arr.slice(0, 300);
    localStorage.setItem('wuri_zw_history', JSON.stringify(arr));
  } catch (e) {}
}
function renderHistory() {
  var host = $('#zw-history-list'); if (!host) return;
  var arr = [];
  try { arr = JSON.parse(localStorage.getItem('wuri_zw_history') || '[]'); } catch (e) {}
  if (!arr.length) { host.innerHTML = '<p class="hint">暂无记录</p>'; return; }
  host.innerHTML = arr.map(function (h, i) {
    return '<div class="jing-hl-item" data-zw-hist="' + i + '"><div>' + h.label + '</div>'
      + '<div class="hl-meta">' + h.ts + '</div></div>';
  }).join('');
  host.querySelectorAll('[data-zw-hist]').forEach(function (el) {
    el.addEventListener('click', function () {
      var h = arr[+el.getAttribute('data-zw-hist')];
      if (h) { doCalc(h.date, h.time, h.gender, true, { name: h.name, cal: h.cal }); switchTab('result'); }
    });
  });
}
/* ---------- 星曜与四化标注 ---------- */
function starChip(s, cls, badges, hideNativeHua) {
  var html = '<span class="' + cls + '">' + s.name;
  if (s.brightness) html += '<span class="zw-bright">' + s.brightness + '</span>';
  if (s.mutagen && !hideNativeHua) html += '<span class="zw-hua">' + s.mutagen + '</span>';
  if (badges) for (var i = 0; i < badges.length; i++) html += '<span class="zw-hua ' + badges[i].cls + '">' + badges[i].txt + '</span>';
  return html + '</span>';
}
function palaceStarSet(p) {
  var set = {};
  p.majorStars.concat(p.minorStars).forEach(function (s) { set[s.name] = 1; });
  return set;
}
/* 某宫的自化：宫干四化星恰在本宫 → {星名: '自禄'|'自权'|'自科'|'自忌'} */
function selfHuaMap(p) {
  var table = MUTAGEN_BY_STEM[p.heavenlyStem]; if (!table) return {};
  var set = palaceStarSet(p), map = {};
  table.forEach(function (sn, i) { if (set[sn]) map[sn] = '自' + HUA_NAMES[i]; });
  return map;
}
/* 某宫飞化：宫干四化星各飞入哪一宫 → [{hua, star, to(宫对象|null), isSelf}] */
function flyInfo(p) {
  var table = MUTAGEN_BY_STEM[p.heavenlyStem]; if (!table || !cur) return [];
  return table.map(function (sn, i) {
    var target = null;
    cur.astro.palaces.forEach(function (q) {
      if (palaceStarSet(q)[sn]) target = q;
    });
    return { hua: HUA_NAMES[i], star: sn, to: target, isSelf: target === p };
  });
}
/* 运限层的四化星 → 徽章文案 {星名: '年禄' 等} */
function layerHuaMap(item, layer) {
  var map = {};
  (item.mutagen || []).forEach(function (sn, i) { map[sn] = LAYER_HUA_PREFIX[layer] + HUA_NAMES[i]; });
  return map;
}
function ensureHoro() {
  if (!cur) return null;
  if (!cur.horo || cur.horoKey !== cur.horoDate + '|' + cur.layer) {
    try { cur.horo = cur.astro.horoscope(cur.horoDate, 6); } catch (e) { cur.horo = null; }
    cur.horoKey = cur.horoDate + '|' + cur.layer;
  }
  return cur.horo;
}
/* ---------- 命盘渲染 ---------- */
function buildCenter() {
  var astro = cur.astro, extra = cur.extra, dateStr = cur.dateStr, gender = cur.gender;
  var centerHtml = '<div class="zw-center-pro">';
  try {
    var dispName2 = privacyOn ? '＊＊＊' : (extra && extra.name ? esc(extra.name) : '');
    var birthY = parseInt(dateStr.split('-')[0]);
    var age = new Date().getFullYear() - birthY + 1;
    centerHtml += '<div class="zw-c-name">' + (dispName2 || '') + ' ' + gender + ' ' + astro.fiveElementsClass + ' ' + age + '岁</div>';
    centerHtml += '<div class="zw-c-time">公历 ' + dateStr + '</div>';
    try {
      if (window.Lunar) {
        var ld = window.Lunar.fromDate(new Date(dateStr));
        centerHtml += '<div class="zw-c-lunar">农历 ' + ld.getYearShengXiao() + '年' + ld.getMonthInChinese() + '月' + ld.getDayInChinese() + '</div>';
      }
    } catch (e) {}
    try {
      if (cur.decadalList && cur.decadalList.length) {
        var dyHtml = '<div class="zw-c-dayun-full">';
        for (var di = 0; di < Math.min(8, cur.decadalList.length); di++) {
          var dd = cur.decadalList[di];
          dyHtml += '<span class="zw-dy-item">' + dd.heavenlyStem + dd.earthlyBranch + '<br>' + dd.ageRange[0] + '岁<br>' + dd.yearRange[0] + '</span>';
        }
        dyHtml += '</div>';
        centerHtml += dyHtml;
        centerHtml += '<div class="zw-c-qiyun">起限：虚岁 ' + cur.decadalList[0].ageRange[0] + ' 岁</div>';
      }
    } catch (e) {}
    try {
      if (window.Lunar) {
        var ld2 = window.Lunar.fromDate(new Date(dateStr));
        var sizhu = [
          ld2.getYearGan() + ld2.getYearZhi(),
          ld2.getMonthGan() + ld2.getMonthZhi(),
          ld2.getDayGan() + ld2.getDayZhi(),
          ld2.getTimeGan() + ld2.getTimeZhi()
        ];
        var wxColor = {'金':'#b8860b','木':'#2e8b57','水':'#4169e1','火':'#dc143c','土':'#8b6914'};
        var ganWx = {'甲':'木','乙':'木','丙':'火','丁':'火','戊':'土','己':'土','庚':'金','辛':'金','壬':'水','癸':'水'};
        var zhiWx = {'子':'水','丑':'土','寅':'木','卯':'木','辰':'土','巳':'火','午':'火','未':'土','申':'金','酉':'金','戌':'土','亥':'水'};
        var szHtml = '<div class="zw-c-sizhu">';
        sizhu.forEach(function (gz) {
          var g = gz[0], z = gz[1];
          szHtml += '<span style="color:' + (wxColor[ganWx[g]]||'#333') + '">' + g + '</span>';
          szHtml += '<span style="color:' + (wxColor[zhiWx[z]]||'#333') + '">' + z + '</span> ';
        });
        szHtml += '</div>';
        centerHtml += szHtml;
      }
    } catch (e) {}
    var soulB = '';
    try { soulB = '命主' + (astro.soul || '') + ' 身主' + (astro.body || ''); } catch (e) {}
    centerHtml += '<div class="zw-c-soul">' + soulB + '</div>';
  } catch (e) {}
  centerHtml += '</div>';
  return centerHtml;
}
function buildCell(b) {
  var astro = cur.astro;
  var p = astro.palaces[b];
  var layer = cur.layer;
  var item = null;
  if (layer !== 'origin') { var h = ensureHoro(); if (h) item = h[layer]; }
  var classes = 'zw-cell' + (p.name === '命宫' ? ' zw-ming' : '');
  if (item && item.index === b) classes += ' zw-layer-ming';
  if (cur.sel != null) {
    if (cur.sel === b) classes += ' zw-sel';
    else if (cur.sanfang && cur.sanfang.indexOf(b) >= 0) classes += ' zw-sanfang';
    else if (cur.flyTargets && cur.flyTargets.indexOf(b) >= 0) classes += ' zw-flyto';
  }
  var cell = '<div class="' + classes + '" data-zw-pal="' + b + '">';
  var self = selfHuaMap(p);
  var lh = item ? layerHuaMap(item, layer) : {};
  function badgesFor(s) {
    var bd = [];
    if (self[s.name]) bd.push({ cls: 'zw-hua-self', txt: self[s.name] });
    if (lh[s.name]) bd.push({ cls: 'zw-hua-scope', txt: lh[s.name] });
    return bd;
  }
  cell += '<div class="zw-stars-pro">'
    + p.majorStars.map(function (s) { return starChip(s, 'zw-major', badgesFor(s)); }).join('')
    + p.minorStars.map(function (s) { return starChip(s, 'zw-minor', badgesFor(s)); }).join('') + '</div>';
  // 流耀（运限动态星曜）
  if (item && item.stars && item.stars[b] && item.stars[b].length) {
    cell += '<div class="zw-liuyao-row">' + item.stars[b].map(function (s) {
      var bd = s.mutagen ? [{ cls: 'zw-hua-scope', txt: LAYER_HUA_PREFIX[layer] + s.mutagen }] : null;
      return starChip(s, 'zw-liuyao', bd, true);
    }).join('') + '</div>';
  }
  try {
    var dx = p.decadal && p.decadal.range ? p.decadal.range[0] + '~' + p.decadal.range[1] : '';
    if (p.boshi12 || dx) cell += '<div class="zw-boshi">' + (p.boshi12 || '') + ' ' + dx + '</div>';
  } catch (e) {}
  try { if (p.changsheng12) cell += '<div class="zw-cs">' + p.changsheng12 + '</div>'; } catch (e) {}
  try {
    var sq = p.suiqian12 || '', jq = p.jiangqian12 || '';
    if (sq || jq) cell += '<div class="zw-sqjq">' + sq + ' ' + jq + '</div>';
  } catch (e) {}
  try {
    if (p.ages && p.ages.length) cell += '<div class="zw-xiaoxian">小限:' + p.ages.slice(0, 6).join(',') + '</div>';
  } catch (e) {}
  try {
    var zhiOrder = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
    var birthY = parseInt(cur.dateStr.split('-')[0]);
    var birthZhiIdx = (birthY - 4) % 12;
    if (birthZhiIdx < 0) birthZhiIdx += 12;
    var palaceZhiIdx = zhiOrder.indexOf(p.earthlyBranch);
    var startAge = (palaceZhiIdx - birthZhiIdx + 1) % 12;
    if (startAge <= 0) startAge += 12;
    var liuNian = [];
    for (var la = startAge; la <= startAge + 60; la += 12) liuNian.push(la);
    cell += '<div class="zw-liunian">流年:' + liuNian.slice(0, 6).join(',') + '</div>';
  } catch (e) {}
  if (item) cell += '<div class="zw-scope-name">' + LAYER_LABEL[layer] + '·' + item.palaceNames[b] + '</div>';
  cell += '<div class="zw-gz-pro">' + p.heavenlyStem + p.earthlyBranch + '</div>';
  cell += '<div class="zw-pname-pro">' + p.name + (p.isBodyPalace ? '<span class="zw-body-tag">身</span>' : '') + '</div>';
  cell += '</div>';
  return cell;
}
function renderChart() {
  if (!cur) return;
  var astro = cur.astro;
  cur.sanfang = null; cur.flyTargets = null;
  if (cur.sel != null) {
    try {
      var sp = astro.surroundedPalaces(cur.sel);
      cur.sanfang = [sp.opposite.index, sp.wealth.index, sp.career.index];
    } catch (e) {}
    var ft = [];
    flyInfo(astro.palaces[cur.sel]).forEach(function (f) { if (f.to && !f.isSelf) ft.push(f.to.index); });
    cur.flyTargets = ft;
  }
  var html = '<div class="zw-grid-pro">';
  var centerDone = false;
  PALACE_GRID.forEach(function (b) {
    if (b === null) {
      if (centerDone) return;
      centerDone = true;
      html += buildCenter();
      return;
    }
    html += buildCell(b);
  });
  html += '</div>';
  $('#zw-chart').innerHTML = html;
  document.querySelectorAll('#zw-chart [data-zw-pal]').forEach(function (el) {
    el.addEventListener('click', function () {
      var b = +el.getAttribute('data-zw-pal');
      cur.sel = (cur.sel === b) ? null : b;
      renderChart();
    });
  });
  renderPalInfo();
  renderHoroInfo();
}
function renderPalInfo() {
  var host = $('#zw-pal-info'); if (!host || !cur) return;
  if (cur.sel == null) { host.innerHTML = '点任意宫位：高亮其三方四正，并显示该宫飞化与自化。'; return; }
  var astro = cur.astro, p = astro.palaces[cur.sel];
  try {
    var sp = astro.surroundedPalaces(cur.sel);
    var sf = [sp.target, sp.opposite, sp.wealth, sp.career].map(function (x) { return x.name; }).join(' · ');
    var self = selfHuaMap(p);
    var selfTxt = Object.keys(self).map(function (sn) { return sn + self[sn]; }).join('、');
    var flyTxt = flyInfo(p).map(function (f) {
      return f.hua + '（' + f.star + '）→' + (f.to ? (f.isSelf ? '本宫（自化）' : f.to.name) : '—');
    }).join('、');
    host.innerHTML = '<b>' + p.name + '（' + p.heavenlyStem + p.earthlyBranch + '）</b>'
      + '<br>三方四正：' + sf
      + (selfTxt ? '<br>自化：' + selfTxt : '')
      + '<br>飞化：' + flyTxt;
  } catch (e) { host.innerHTML = ''; }
}
function renderHoroInfo() {
  var host = $('#zw-horo-info'); if (!host || !cur) return;
  var h = ensureHoro();
  if (!h) { host.innerHTML = ''; return; }
  function gz(it) { return it.heavenlyStem + it.earthlyBranch; }
  var line = cur.horoDate + '：大限 ' + gz(h.decadal) + ' · 流年 ' + gz(h.yearly) + ' · 流月 ' + gz(h.monthly) + ' · 流日 ' + gz(h.daily);
  if (cur.layer !== 'origin') {
    var it = h[cur.layer];
    var natalName = cur.astro.palaces[it.index].name;
    var huaTxt = (it.mutagen || []).map(function (sn, i) { return sn + '化' + HUA_NAMES[i]; }).join('、');
    line += '<br>' + LAYER_LABEL[cur.layer] + '命宫落本命' + natalName + '；' + LAYER_LABEL[cur.layer] + '四化：' + huaTxt;
  }
  host.innerHTML = line;
}
function syncLayerBtns() {
  document.querySelectorAll('[data-zw-layer]').forEach(function (b) {
    b.classList.toggle('active', b.getAttribute('data-zw-layer') === (cur ? cur.layer : 'origin'));
  });
}
function renderInfoLine() {
  if (!cur) return;
  var timeName = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'][+cur.timeIdx];
  var dispName = privacyOn ? '＊＊＊' : (cur.extra && cur.extra.name ? esc(cur.extra.name) : '');
  var infoTxt = '公历 ' + cur.dateStr + ' ' + timeName + '时 · ' + cur.gender;
  if (dispName) infoTxt = dispName + '　' + infoTxt;
  infoTxt += ' <button class="mini-btn tiny" id="zw-privacy">' + (privacyOn ? '显示' : '隐藏') + '</button>';
  $('#zw-info').innerHTML = '<p class="hint">' + infoTxt + '</p>';
  var pvBtn = $('#zw-privacy');
  if (pvBtn) pvBtn.addEventListener('click', function () {
    privacyOn = !privacyOn;
    renderChart();
    renderInfoLine();
  });
}
function doCalc(dateStr, timeIdx, gender, fromHist, extra) {
  if (!window.iztro) { $('#zw-chart').innerHTML = '<p class="hint">排盘库加载失败</p>'; return; }
  var chartEl = $('#zw-chart');
  chartEl.innerHTML = '<div class="zw-loading"><div class="zw-loading-title">正在起盘…</div><div class="zw-loading-bar"><div class="zw-loading-fill"></div></div></div>';
  setTimeout(function () { doCalcReal(dateStr, timeIdx, gender, fromHist, extra); }, 300);
}
function doCalcReal(dateStr, timeIdx, gender, fromHist, extra) {
  try {
    var cal = (extra && extra.cal) || 'solar';
    var astro = cal === 'lunar'
      ? window.iztro.astro.byLunar(dateStr, +timeIdx, gender, false, true)
      : window.iztro.astro.bySolar(dateStr, +timeIdx, gender, true);
    var now = new Date();
    var todayStr = now.getFullYear() + '-' + pad2(now.getMonth() + 1) + '-' + pad2(now.getDate());
    cur = {
      astro: astro, dateStr: dateStr, timeIdx: timeIdx, gender: gender, extra: extra || {},
      layer: 'origin', horoDate: todayStr, horo: null, horoKey: '', sel: null, decadalList: []
    };
    try { cur.decadalList = astro.decadalList() || []; } catch (e) {}
    var hd = $('#zw-horo-date'); if (hd) hd.value = todayStr;
    syncLayerBtns();
    var horoBox = $('#zw-horo'); if (horoBox) horoBox.hidden = false;
    renderChart();
    renderInfoLine();
    // 保存文字版供 AI 分析（2026-10-22 结构化补强：宫名以引擎 p.name 为准、按命宫→父母序；
    // 补命主身主/身宫标注、星曜亮度与四化、每宫大限年龄段、命宫三方四正、当前大限与流年）
    try {
      var timeNames = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
      var starFmt = function (s) {
        return s.name + (s.brightness ? '[' + s.brightness + ']' : '') + (s.mutagen ? '(化' + s.mutagen + ')' : '');
      };
      var txt = '紫微斗数命盘\n';
      txt += '出生：' + (cal === 'lunar' ? '农历' : '公历') + ' ' + dateStr + ' ' + timeNames[+timeIdx] + '时 ' + gender + '\n';
      txt += '五行局：' + astro.fiveElementsClass + '\n';
      try { txt += '命主：' + (astro.soul || '') + '｜身主：' + (astro.body || '') + '\n'; } catch (e) {}
      var byName = {};
      astro.palaces.forEach(function (p) { byName[p.name] = p; });
      var mingP = byName['命宫'];
      var shenP = null;
      astro.palaces.forEach(function (p) { if (p.isBodyPalace) shenP = p; });
      if (mingP) txt += '命宫：' + mingP.name + '（' + mingP.heavenlyStem + mingP.earthlyBranch + '）'
        + (mingP.majorStars.length ? '，主星 ' + mingP.majorStars.map(starFmt).join('、') : '（空宫）') + '\n';
      if (shenP) txt += '身宫：落在' + shenP.name + '（' + shenP.heavenlyStem + shenP.earthlyBranch + '）\n';
      txt += '\n【十二宫】\n';
      PALACE_NAMES.forEach(function (nm) {
        // iztro v2.6.3 宫名为「仆役」，本站口径称「交友」——别名兜底，防整宫漏喂（旧版曾漏此宫）
        var p = byName[nm] || (nm === '交友' ? byName['仆役'] : null);
        if (!p) return;
        var dx = (p.decadal && p.decadal.range) ? '｜大限 ' + p.decadal.range[0] + '~' + p.decadal.range[1] + '岁' : '';
        txt += nm + '(' + p.heavenlyStem + p.earthlyBranch + (p.isBodyPalace ? '·身宫' : '') + dx + ')：'
          + (p.majorStars.length ? p.majorStars.map(starFmt).join('、') : '（无主星）')
          + (p.minorStars.length ? '；辅星 ' + p.minorStars.map(starFmt).join('、') : '');
        try {
          if (p.adjectiveStars && p.adjectiveStars.length) txt += '；杂耀 ' + p.adjectiveStars.map(function (s) { return s.name; }).join('、');
        } catch (e) {}
        txt += '\n';
      });
      // 命宫三方四正（引擎 surroundedPalaces 口径）
      try {
        if (mingP) {
          var sp = astro.surroundedPalaces(mingP.index);
          var sfLine = function (label, it) {
            if (!it) return '';
            var pp = astro.palaces[it.index]; if (!pp) return '';
            return label + ' ' + pp.name + '（' + pp.heavenlyStem + pp.earthlyBranch + '）：'
              + (pp.majorStars.length ? pp.majorStars.map(starFmt).join('、') : '（无主星）');
          };
          txt += '\n【命宫三方四正】\n'
            + sfLine('对宫', sp.opposite) + '\n'
            + sfLine('财帛位', sp.wealth) + '\n'
            + sfLine('官禄位', sp.career) + '\n';
        }
      } catch (e) {}
      // 当前大限与流年（以今天计，与盘面运限同源 horoscope）
      try {
        var birthY = parseInt(dateStr.split('-')[0], 10);
        var xuSui = new Date().getFullYear() - birthY + 1;
        var h = astro.horoscope(todayStr, 6);
        var huaTxt = function (it) {
          return (it.mutagen || []).map(function (sn, i) { return sn + '化' + HUA_NAMES[i]; }).join('、');
        };
        var hp = function (it) { var pp = astro.palaces[it.index]; return pp ? pp.name : ''; };
        txt += '\n【当前运限】（按虚岁 ' + xuSui + ' 岁、' + todayStr + ' 计）\n';
        if (h && h.decadal) txt += '当前大限：落 ' + hp(h.decadal) + '（' + h.decadal.heavenlyStem + h.decadal.earthlyBranch + '）'
          + (h.decadal.mutagen && h.decadal.mutagen.length ? '，大限四化：' + huaTxt(h.decadal) : '') + '\n';
        if (h && h.yearly) txt += '今年流年：落 ' + hp(h.yearly) + '（' + h.yearly.heavenlyStem + h.yearly.earthlyBranch + '）'
          + (h.yearly.mutagen && h.yearly.mutagen.length ? '，流年四化：' + huaTxt(h.yearly) : '') + '\n';
      } catch (e) {}
      window.__wuriChartText = window.__wuriChartText || {};
      window.__wuriChartText.ziwei = txt;
    } catch (e) {}
    if (!fromHist) {
      var saveChk = document.getElementById('zw-save');
      if (!saveChk || saveChk.checked) {
        var lbl = dateStr + ' ' + gender + (extra && extra.name ? ' ' + extra.name : '');
        var grp = (function(){ var s=document.getElementById('zw-group'), cu=document.getElementById('zw-group-custom'); if(s && s.value==='__custom' && cu) return (cu.value||'').trim(); return ((s&&s.value)||'').trim(); })();
        saveHistory({ date: dateStr, time: timeIdx, gender: gender, name: extra && extra.name, cal: extra && extra.cal, group: grp, label: lbl, ts: new Date().toLocaleString() });
      }
    }
  } catch (e) {
    $('#zw-chart').innerHTML = '<p class="hint">排盘失败：' + e.message + '</p>';
  }
}
function init() {
  var enter = $('#ziwei-enter');
  if (enter) enter.addEventListener('click', openView);
  var back = $('#ziwei-back');
  if (back) back.addEventListener('click', closeView);
  document.querySelectorAll('[data-zwtab]').forEach(function (b) {
    b.addEventListener('click', function () { switchTab(b.getAttribute('data-zwtab')); });
  });
  // 运限控件：日期与层级切换
  var hd = $('#zw-horo-date');
  if (hd) hd.addEventListener('change', function () {
    if (!cur || !hd.value) return;
    cur.horoDate = hd.value; cur.horo = null; cur.horoKey = '';
    renderChart();
  });
  document.querySelectorAll('[data-zw-layer]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (!cur) return;
      cur.layer = b.getAttribute('data-zw-layer');
      syncLayerBtns();
      renderChart();
    });
  });
  // 城市选择器（照搬八字）
  var zwCityNav = [];
  function zwEsc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function zwRenderCityNav() {
    var nav = $('#zw-city-nav');
    if (!nav) return;
    var html = '<button class="mini-btn" data-nav="-1">全国</button>';
    zwCityNav.forEach(function (n, i) {
      html += ' › <button class="mini-btn" data-nav="' + i + '">' + zwEsc(n) + '</button>';
    });
    nav.innerHTML = html;
    nav.querySelectorAll('[data-nav]').forEach(function (b) {
      b.addEventListener('click', function () {
        var idx = +b.getAttribute('data-nav');
        zwCityNav = idx < 0 ? [] : zwCityNav.slice(0, idx + 1);
        zwRenderCityList('');
      });
    });
  }
  function zwRenderCityList(kw) {
    var list = $('#zw-city-list');
    if (!list || typeof CITY_DATA === 'undefined') return;
    function cityBtn(name, lon, lat, sub) {
      return '<button class="bz-city-item" data-lon="' + lon + '" data-name="' + zwEsc(name) + '">' + zwEsc(name) + '<span class="hint"> ' + zwEsc(sub) + '</span></button>';
    }
    var html = '';
    if (kw) {
      CITY_DATA.forEach(function (prov) {
        if (prov.countries) {
          prov.countries.forEach(function (ct) {
            ct.cities.forEach(function (cc) {
              if (cc[0].indexOf(kw) >= 0) html += cityBtn(cc[0], cc[1], cc[2], ct.n);
            });
          });
        } else {
          prov.cities.forEach(function (cc) {
            if (cc[0].indexOf(kw) >= 0 || prov.p.indexOf(kw) >= 0) html += cityBtn(cc[0], cc[1], cc[2], prov.p);
          });
        }
      });
      if (!html) html = '<p class="hint">无匹配城市</p>';
    } else if (zwCityNav.length === 0) {
      CITY_DATA.forEach(function (prov) {
        html += '<button class="bz-city-item bz-prov" data-prov="' + zwEsc(prov.p) + '">' + zwEsc(prov.p) + ' ›</button>';
      });
    } else if (zwCityNav.length === 1) {
      var pv = CITY_DATA.filter(function (x) { return x.p === zwCityNav[0]; })[0];
      if (pv) {
        if (pv.countries) {
          pv.countries.forEach(function (ct) {
            html += '<button class="bz-city-item bz-prov" data-country="' + zwEsc(ct.n) + '">' + zwEsc(ct.n) + ' ›</button>';
          });
        } else {
          pv.cities.forEach(function (cc) { html += cityBtn(cc[0], cc[1], cc[2], pv.p); });
        }
      }
    } else if (zwCityNav.length === 2) {
      var pv2 = CITY_DATA.filter(function (x) { return x.p === zwCityNav[0]; })[0];
      if (pv2 && pv2.countries) {
        var ct2 = pv2.countries.filter(function (x) { return x.n === zwCityNav[1]; })[0];
        if (ct2) ct2.cities.forEach(function (cc) { html += cityBtn(cc[0], cc[1], cc[2], ct2.n); });
      }
    }
    list.innerHTML = html;
    zwRenderCityNav();
    list.querySelectorAll('[data-prov]').forEach(function (b) {
      b.addEventListener('click', function () { zwCityNav.push(b.getAttribute('data-prov')); zwRenderCityList(''); });
    });
    list.querySelectorAll('[data-country]').forEach(function (b) {
      b.addEventListener('click', function () { zwCityNav.push(b.getAttribute('data-country')); zwRenderCityList(''); });
    });
    list.querySelectorAll('[data-lon]').forEach(function (b) {
      b.addEventListener('click', function () {
        var nm = b.getAttribute('data-name'), lon = b.getAttribute('data-lon');
        $('#zw-lon').value = lon;
        $('#zw-cityname').value = nm;
        $('#zw-city-btn').textContent = nm + ' ' + lon + '°';
        $('#zw-city-modal').hidden = true;
      });
    });
  }
  (function initZwCityPicker() {
    var btn = $('#zw-city-btn'), modal = $('#zw-city-modal');
    if (!btn || !modal || typeof CITY_DATA === 'undefined') return;
    btn.addEventListener('click', function () {
      zwCityNav = []; zwRenderCityList(''); $('#zw-city-search').value = '';
      modal.hidden = false;
    });
    $('#zw-city-close').addEventListener('click', function () { modal.hidden = true; });
    $('#zw-city-search').addEventListener('input', function () { zwRenderCityList(this.value); });
    modal.addEventListener('click', function (e) { if (e.target === modal) modal.hidden = true; });
  })();
  var gSel = $('#zw-group'), gCus = $('#zw-group-custom');
  if (gSel && gCus) {
    gSel.addEventListener('change', function () {
      gCus.style.display = this.value === '__custom' ? 'block' : 'none';
    });
  }
  var calc = $('#zw-go');
  if (calc) calc.addEventListener('click', function () {
    var d = $('#zw-date').value;
    var tInput = $('#zw-time').value;
    var gEl = document.querySelector('input[name="zw-gender"]:checked');
    var gVal = gEl ? gEl.value : '1';
    var g = gVal === '1' ? '男' : '女';
    var calEl = document.querySelector('input[name="zw-cal"]:checked');
    var cal = calEl ? calEl.value : 'solar';
    var name = ($('#zw-name').value || '').trim();
    if (!d) return;
    var timeIdx = 6;
    var hh = 12, mm = 0;
    if (tInput) {
      var parts = tInput.split(':');
      hh = +parts[0]; mm = +(parts[1] || 0);
      if ($('#zw-true') && $('#zw-true').checked) {
        var lon = parseFloat($('#zw-lon').value || '116.42');
        var offsetMin = (lon - 120) * 4;
        var totalMin = hh * 60 + mm + offsetMin;
        hh = Math.floor(totalMin / 60) % 24; mm = totalMin % 60;
      }
      timeIdx = Math.floor(((hh + 1) % 24) / 2);
    }
    doCalc(d, timeIdx, g, false, { name: name, cal: cal });
    switchTab('result');
  });
  // tab切换时隐藏独立视图
  document.querySelectorAll('#tabbar button').forEach(function (btn) {
    btn.addEventListener('click', function () { closeView(); });
  });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () {
  init();
  // 双指缩放
  var chart = document.getElementById('zw-chart');
  if (chart) {
    var scale = 1, lastDist = 0;
    chart.addEventListener('touchstart', function (e) {
      if (e.touches.length === 2) {
        lastDist = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY);
      }
    }, { passive: true });
    chart.addEventListener('touchmove', function (e) {
      if (e.touches.length === 2) {
        e.preventDefault();
        var dist = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY);
        if (lastDist > 0) {
          scale = Math.min(3, Math.max(0.5, scale * dist / lastDist));
          var grid = chart.querySelector('.zw-grid-pro');
          if (grid) grid.style.transform = 'scale(' + scale + ')';
        }
        lastDist = dist;
      }
    }, { passive: false });
    chart.addEventListener('touchend', function () { lastDist = 0; });
  }
});
else init();
})();
