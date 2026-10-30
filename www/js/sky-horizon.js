/* 戊日不上香 · 星象「地平朝向视图」（内部 v401，2026-10-29 按设计稿 v2 集成）
 * 落位：星象页第三入口（与今夜可见/平面星图并列），门控走 sky-chart 的 skyGate。
 * 口径（设计稿 v2 / REQUIREMENTS 三硬约束）：
 *  - 全景地景带（道观主体锚正南 180°、缝在正北、8 单位/°）实占视口高 ≈16%（≤20% 硬顶）；
 *    拖动环视只改窗口（backgroundPositionX＋遮罩相位），不重绘地景。
 *  - 光线是太阳高度角的纯函数：天空三段渐变/太阳晕/地景调色（关键帧插值）/极限星等
 *    全部由当前时刻太阳位置算出；时间状态与平面星图共用（WuriSkyChart 的 offsetMin/
 *    play/speed），本视图零新增时间状态——打开时从共用状态取时刻、一切改动即时回写。
 *  - 星位一律 WuriSky 引擎实算（projectAll/altAz/bodyPos），星官数据守《漫步中国星空》定本。
 *  - 遮挡：设计稿原用 L 版遮罩（白=天空/黑=地面、无 alpha 通道）＋ canvas filter invert —
 *    ctx.filter 在 Safari/WebView 不支持，故进包遮罩已烘焙为 RGBA 版（alpha=255−亮度：
 *    天空 0 保留星光、地面 255），运行时 destination-out 直接擦除，无读回、无 filter。
 *  - 红光：场景内层（天空/晕/星层/地景/方位字）整层套全局红移滤镜（与 body.sky-red 的
 *    img/svg 同一滤镜值）；场景外 UI 走 --hz-* 局部变量，body.sky-red 下重映射为红谱。 */
(function () {
'use strict';
var SKY = window.WuriSky;
if (!SKY) return;
var $ = function (id) { return document.getElementById(id); };
function T(s) { return window.tx ? window.tx(s) : s; }
function t(k) { return window.t ? window.t(k) : k; }
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function lerp(a, b, f) { return a + (b - a) * f; }
var RAD = Math.PI / 180;
function wrapDelta(d) { while (d > 180) d -= 360; while (d < -180) d += 360; return d; }
function norm360(a) { return ((a % 360) + 360) % 360; }
function pad2(n) { return (n < 10 ? '0' : '') + n; }
function fmtHM(d) { return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
function fmtHMS(d) { return fmtHM(d) + ':' + pad2(d.getSeconds()); }
function hx(c) {
  if (c[0] === '#') { var n = parseInt(c.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  var m = c.match(/\d+(\.\d+)?/g); return [+m[0], +m[1], +m[2]];
}
function mixc(c1, c2, f) { var a = hx(c1), b = hx(c2); return 'rgb(' + a.map(function (v, i) { return Math.round(lerp(v, b[i], f)); }).join(',') + ')'; }
function shade(c, f) { var a = hx(c); return 'rgb(' + a.map(function (v) { return Math.round(clamp(v * f, 0, 255)); }).join(',') + ')'; }

/* ===== 调色关键帧（设计稿 v2 第六节表，与稿内 gradeAt/magAt 同源同值） ===== */
var KF = [
  { alt: 55, b: 1.30, g: [1.00, 1.03, 1.12], gam: 0.92, sky: ['#5f97d4', '#a5c6e8', '#dcedf8'], halo: { c: '#fff3d6', i: .50, r: 330 }, mag: 0 },
  { alt: 6, b: 1.03, g: [1.07, 1.00, 0.90], gam: 1.00, sky: ['#7d90b8', '#c2a184', '#f4cd9c'], halo: { c: '#ffb45e', i: .90, r: 470 }, mag: 0 },
  { alt: -4, b: 0.74, g: [1.09, 0.93, 0.83], gam: 1.08, sky: ['#2e3a5c', '#6e5570', '#e07f45'], halo: { c: '#ff8f4d', i: 1.0, r: 580 }, mag: 2.6 },
  { alt: -14, b: 0.44, g: [0.90, 0.97, 1.12], gam: 1.18, sky: ['#0d1526', '#16233d', '#27354f'], halo: null, mag: 4.6 },
  { alt: -32, b: 0.24, g: [0.82, 0.92, 1.14], gam: 1.28, sky: ['#04060d', '#081020', '#0e1a2c'], halo: null, mag: 6.0 }
];
function gradeAt(alt) {
  if (alt >= KF[0].alt) return JSON.parse(JSON.stringify(KF[0]));
  for (var i = 0; i < KF.length - 1; i++) {
    var A = KF[i], B = KF[i + 1];
    if (alt <= A.alt && alt >= B.alt) {
      var f = (A.alt - alt) / (A.alt - B.alt), halo = null;
      if (A.halo && B.halo) halo = { c: mixc(A.halo.c, B.halo.c, f), i: lerp(A.halo.i, B.halo.i, f), r: lerp(A.halo.r, B.halo.r, f) };
      else if (A.halo && alt > -12) halo = { c: A.halo.c, i: A.halo.i * (1 - f * .55), r: A.halo.r };
      return { b: lerp(A.b, B.b, f), g: A.g.map(function (v, j) { return lerp(v, B.g[j], f); }), gam: lerp(A.gam, B.gam, f),
        sky: A.sky.map(function (c, j) { return mixc(c, B.sky[j], f); }), halo: halo, mag: lerp(A.mag, B.mag, f) };
    }
  }
  return JSON.parse(JSON.stringify(KF[KF.length - 1]));
}
function magAt(alt) { return alt > -2 ? 0 : alt <= -18 ? 6.0 : alt <= -12 ? lerp(4.6, 6.0, (-12 - alt) / 6) : alt <= -6 ? lerp(2.6, 4.6, (-6 - alt) / 6) : lerp(0, 2.6, (-2 - alt) / 4); }
function starR(m) { return m <= 1 ? 3.2 : m <= 2 ? 2.6 : m <= 3 ? 2.0 : m <= 4 ? 1.55 : m <= 5 ? 1.2 : m <= 6 ? 0.95 : 0.8; }
function extinct(alt) { return alt >= 22 ? 1 : alt <= 0 ? 0.18 : 0.18 + 0.82 * (alt / 22); }

var DIRNAMES = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
var SKYLINE_FRAC = 311.8 / 480;
var BAND_SRC = 'img/sky-horizon-band.webp', MASK_SRC = 'img/sky-horizon-mask.png';

/* 银河：与平面星图同一银道→赤道旋转矩阵（J2000），采样点走 projectAll 与星点同路 */
var GAL_R = [[-0.0548755604, -0.8734370902, -0.4838350155],
             [0.4941094279, -0.4448296300, 0.7469822445],
             [-0.8676661490, -0.1980763734, 0.4559837762]];
var MWPTS = (function () {
  var out = [];
  for (var l = 0; l < 360; l += 4) {
    var lr = l * RAD, x = Math.cos(lr), y = Math.sin(lr), z = 0;
    var ex = GAL_R[0][0] * x + GAL_R[0][1] * y + GAL_R[0][2] * z;
    var ey = GAL_R[1][0] * x + GAL_R[1][1] * y + GAL_R[1][2] * z;
    var ez = GAL_R[2][0] * x + GAL_R[2][1] * y + GAL_R[2][2] * z;
    out.push({ ra: ((Math.atan2(ey, ex) / RAD) % 360 + 360) % 360, dec: Math.asin(clamp(ez, -1, 1)) / RAD });
  }
  return out;
})();
var BODY_ORDER = ['mercury', 'venus', 'mars', 'jupiter', 'saturn'];
var BODY_STYLE = { mercury: '#c9b8a3', venus: '#f0e6c8', mars: '#e07a4a', jupiter: '#e8c9a0', saturn: '#d9c391' };
var BODY_CN = { moon: '月亮', mercury: '水星', venus: '金星', mars: '火星', jupiter: '木星', saturn: '土星' };
var MAJOR_LABELS = {};
['角宿', '亢宿', '氐宿', '房宿', '心宿', '尾宿', '箕宿', '斗宿', '牛宿', '女宿', '虚宿', '危宿', '室宿', '壁宿',
 '奎宿', '娄宿', '胃宿', '昴宿', '毕宿', '觜宿', '参宿', '井宿', '鬼宿', '柳宿', '星宿', '张宿', '翼宿', '轸宿',
 '紫微左垣', '紫微右垣', '太微左垣', '太微右垣', '天市左垣', '天市右垣'].forEach(function (n) { MAJOR_LABELS[n] = 1; });

/* ---------------- 数据（走 WuriSky.starData 共享通道，与 sky-chart 同一索引口径） ---------------- */
var XG = null, dataPromise = null, ASTS = [], ALLSTARS = [], ASTBYKEY = {}, HZREQ = [];
function buildIndex(LINEMAP) {
  ASTS = []; ALLSTARS = []; ASTBYKEY = {};
  (XG.asterisms || []).forEach(function (a) {
    var ast = { key: a.section + '|' + a.name, name: a.name, section: a.section, region: a.region,
      starsIdx: [], edges: [], doubtful: false, brightest: -1, unlocated: [] };
    var byName = {}, ai = ASTS.length;
    (a.stars || []).forEach(function (s) {
      if (s.ra_deg == null || s.dec_deg == null) {
        if (s.cn_name) ast.unlocated.push(s.cn_name);
        return;
      }
      var gi = ALLSTARS.push({ ra: s.ra_deg, dec: s.dec_deg, mag: (s.vmag == null ? 99 : s.vmag), cn: s.cn_name || '', ast: ai }) - 1;
      ast.starsIdx.push(gi); byName[s.cn_name] = gi;
      if (ast.brightest < 0 || ALLSTARS[gi].mag < ALLSTARS[ast.brightest].mag) ast.brightest = gi;
    });
    var le = LINEMAP[ast.key];
    if (le) {
      ast.doubtful = le.status === 'doubtful';
      (le.edges || []).forEach(function (e) {
        if (byName[e[0]] != null && byName[e[1]] != null) ast.edges.push([byName[e[0]], byName[e[1]]]);
      });
    }
    ASTS.push(ast); ASTBYKEY[ast.key] = ast;
  });
  HZREQ = ALLSTARS.map(function (s) { return { ra: s.ra, dec: s.dec }; });
}
function loadData() {
  if (XG) return Promise.resolve(XG);
  if (dataPromise) return dataPromise;
  dataPromise = SKY.starData().then(function (d) {
    XG = d.xg;
    var LINEMAP = {};
    ((d.lines && d.lines.asterisms) || []).forEach(function (e) { LINEMAP[e.section + '|' + e.name] = e; });
    buildIndex(LINEMAP);
    return XG;
  }).catch(function (e) { dataPromise = null; throw e; });
  return dataPromise;
}

/* ---------------- 状态 ---------------- */
var PREF_KEY = 'wuri_sky_horizon_v1';
var hz = {
  built: false, els: null, open: false,
  obs: { lat: SKY.DEFAULT_OBS.lat, lon: SKY.DEFAULT_OBS.lon },
  dateMs: Date.now(), centerAz: 180, selKey: null,
  land: true, playing: false, raf: 0, lastT: 0, lastDraw: 0, poll: 0, lastSeenOff: null,
  series: null, seriesKey: '', proj: null, sun: null, lim: 0,
  geo: { W: 0, H: 0, bandH: 0, RW: 0, horizonY: 0, ppdX: 1, ppdY: 1, dpr: 1 },
  maskImg: null, panelTab: 'solar'
};
try {
  var pj = JSON.parse(localStorage.getItem(PREF_KEY) || 'null');
  if (pj && typeof pj.land === 'boolean') hz.land = pj.land;
} catch (e) {}
function savePref() { try { localStorage.setItem(PREF_KEY, JSON.stringify({ land: hz.land })); } catch (e) {} }
hz.maskImg = new Image();
hz.maskImg.src = MASK_SRC;

function chartAPI() { return window.WuriSkyChart || null; }
function layersState() {
  var api = chartAPI();
  var st = api && api.state ? api.state() : null;
  return st ? st.layers : { lines: true, labelsOn: true, milky: true };
}
function labelMode() {
  var api = chartAPI();
  var st = api && api.state ? api.state() : null;
  return st ? st.labelMode : 'smart';
}

/* ---------------- DOM 骨架 ---------------- */
function buildShell() {
  var host = $('sx-horizon');
  if (!host) return;
  var lb = [['lines', '连线'], ['names', '星名'], ['land', '地景'], ['mw', '银河']];
  var layerBtns = lb.map(function (p) {
    return '<button type="button" data-hz-layer="' + p[0] + '">' + esc(T(p[1])) + '</button>';
  }).join('') + '<button type="button" data-hz-layer="red" class="hz-redbtn">' + esc(T('红光')) + '</button>';
  var dirs = DIRNAMES.map(function (n, i) {
    return '<div class="hz-dirlab" data-az="' + (i * 45) + '">' + esc(T(n)) + '</div>';
  }).join('');
  var fields = [['y', '年', 4], ['mo', '月', 2], ['d', '日', 2], ['h', '时', 2], ['mi', '分', 2], ['s', '秒', 2]];
  var steppers = fields.map(function (f, i) {
    return (i ? '<span class="hz-sep">' + (i < 3 ? '-' : ':') + '</span>' : '') +
      '<div class="hz-sgrp"><span class="hz-cap">' + esc(T(f[1])) + '</span>' +
      '<div class="hz-field"><input data-f="' + f[0] + '" inputmode="numeric" style="width:' + (f[2] === 4 ? 64 : 44) + 'px">' +
      '<span class="hz-ud"><button type="button" data-step="1" data-f="' + f[0] + '">▲</button>' +
      '<button type="button" data-step="-1" data-f="' + f[0] + '">▼</button></span></div></div>';
  }).join('');
  host.innerHTML =
    '<div id="hz-loc"></div>' +
    '<div class="hz-scene" id="hz-scene">' +
      '<div class="hz-inner" id="hz-inner">' +
        '<div class="hz-sky"></div><div class="hz-halo"></div><div class="hz-moonhalo"></div>' +
        '<canvas class="hz-cv" id="hz-cv"></canvas>' +
        '<div class="hz-band" id="hz-band"></div>' +
        '<div class="hz-dirs">' + dirs + '</div>' +
      '</div>' +
      '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>' +
      '<filter id="hz-gamma" color-interpolation-filters="sRGB"><feComponentTransfer>' +
      '<feFuncR id="hz-feR" type="gamma" amplitude="1" exponent="1" offset="0"/>' +
      '<feFuncG id="hz-feG" type="gamma" amplitude="1" exponent="1" offset="0"/>' +
      '<feFuncB id="hz-feB" type="gamma" amplitude="1" exponent="1" offset="0"/>' +
      '</feComponentTransfer></filter></defs></svg>' +
      '<div class="hz-vtop"><div class="hz-vread" id="hz-vread"></div>' +
      '<div class="hz-info" id="hz-info" hidden>' +
        '<button type="button" class="hz-info-x" id="hz-info-x" aria-label="close">✕</button>' +
        '<h4 id="hz-info-name"></h4>' +
        '<div class="hz-row"><span>' + esc(T('当前高度角')) + '</span><span id="hz-info-alt"></span></div>' +
        '<div class="hz-row"><span>' + esc(T('今晚升起')) + '</span><span id="hz-info-rise"></span></div>' +
        '<div class="hz-row"><span>' + esc(T('中天')) + '</span><span id="hz-info-tr"></span></div>' +
        '<div class="hz-row"><span>' + esc(T('落下')) + '</span><span id="hz-info-set"></span></div>' +
        '<button type="button" class="hz-culm" id="hz-culm">' + esc(T('到 中 天')) + '</button>' +
      '</div></div>' +
      '<div class="hz-layerbar" id="hz-layerbar">' + layerBtns + '</div>' +
    '</div>' +
    '<div class="hz-ctl">' +
      '<div class="hz-trow">' +
        '<button type="button" class="hz-btn hz-play" id="hz-play">▶</button>' +
        '<select class="hz-sel" id="hz-speed">' +
          '<option value="1">×1</option><option value="60">×60</option>' +
          '<option value="300">×300</option><option value="900">×900</option><option value="3600">×3600</option>' +
        '</select>' +
        '<button type="button" class="hz-btn" id="hz-now">' + esc(T('回到现在')) + '</button>' +
        '<button type="button" class="hz-btn" id="hz-tpanel">' + esc(T('时间面板')) + '</button>' +
        '<span class="hz-datelab" id="hz-datelab"></span>' +
      '</div>' +
      '<div class="hz-tlrow"><label>' + esc(T('时间轴')) + '</label>' +
        '<input type="range" id="hz-tl" min="0" max="1439" step="1" value="0">' +
        '<span class="hz-tlval" id="hz-tlval"></span></div>' +
      '<div class="hz-panel" id="hz-panel" hidden>' +
        '<div class="hz-tabs"><span data-ptab="solar" class="act">' + esc(T('公历')) + '</span>' +
        '<span data-ptab="lunar">' + esc(T('农历·干支')) + '</span></div>' +
        '<div class="hz-steppers" id="hz-steppers">' + steppers + '</div>' +
        '<div class="hz-lunar" id="hz-lunar" hidden></div>' +
      '</div>' +
    '</div>' +
    '<p class="hz-hint">' + esc(T('拖动画面环视 · 点星官看高度与今晚升落 · 地景为道观全景（主体朝南），光线随太阳位置实时变化')) + '</p>';
  hz.els = {
    loc: $('hz-loc'), scene: $('hz-scene'), inner: $('hz-inner'), sky: host.querySelector('.hz-sky'),
    halo: host.querySelector('.hz-halo'), moonhalo: host.querySelector('.hz-moonhalo'),
    cv: $('hz-cv'), band: $('hz-band'), vread: $('hz-vread'),
    info: $('hz-info'), infoName: $('hz-info-name'), infoAlt: $('hz-info-alt'), infoRise: $('hz-info-rise'),
    infoTr: $('hz-info-tr'), infoSet: $('hz-info-set'), culm: $('hz-culm'),
    layerbar: $('hz-layerbar'), play: $('hz-play'), speed: $('hz-speed'), now: $('hz-now'),
    tpanel: $('hz-tpanel'), datelab: $('hz-datelab'), tl: $('hz-tl'), tlval: $('hz-tlval'),
    panel: $('hz-panel'), steppers: $('hz-steppers'), lunar: $('hz-lunar'),
    feR: $('hz-feR'), feG: $('hz-feG'), feB: $('hz-feB'),
    dirEls: {}
  };
  host.querySelectorAll('.hz-dirlab').forEach(function (d) { hz.els.dirEls[d.getAttribute('data-az')] = d; });
  hz.els.band.style.backgroundImage = 'url(' + BAND_SRC + ')';
  hz.els.band.style.filter = 'url(#hz-gamma)';
  hz.ctx = hz.els.cv.getContext('2d');
  bindShell();
  hz.built = true;
}

function bindShell() {
  var els = hz.els, api = chartAPI();
  if (api && api.bindLocBar) {
    els.loc.innerHTML = api.locBarHTML();
    api.bindLocBar(els.loc, function () {
      hz.obs = api.obsState();
      hz.series = null; hz.seriesKey = '';
      render();
    });
  }
  els.layerbar.addEventListener('click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('[data-hz-layer]') : null;
    if (!b) return;
    var k = b.getAttribute('data-hz-layer'), api2 = chartAPI();
    if (k === 'red') { if (window.WuriRedlight) WuriRedlight.set(!WuriRedlight.on()); }
    else if (k === 'land') { hz.land = !hz.land; savePref(); }
    else if (api2 && api2.setLayer) {
      var L = layersState();
      if (k === 'lines') api2.setLayer('lines', !L.lines);
      else if (k === 'names') api2.setLayer('labelsOn', !L.labelsOn);
      else if (k === 'mw') api2.setLayer('milky', !L.milky);
    }
    syncLayerBar(); render();
  });
  els.play.addEventListener('click', function () {
    if (isPlaying()) { var a = chartAPI(); if (a) a.setPlaying(false); setHzPlaying(false); }
    else setHzPlaying(true);
    syncPlayBtn();
  });
  els.speed.addEventListener('change', function () {
    var a = chartAPI(); if (a && a.setSpeed) a.setSpeed(+els.speed.value || 300);
  });
  els.now.addEventListener('click', function () {
    var a = chartAPI(); if (a) a.setPlaying(false);
    setHzPlaying(false);
    hz.dateMs = Date.now();
    if (a) a.setOffsetMin(0);
    render(); refreshSteppers();
  });
  els.tpanel.addEventListener('click', function () {
    els.panel.hidden = !els.panel.hidden;
    if (!els.panel.hidden) { refreshSteppers(); if (hz.panelTab === 'lunar') refreshLunar(); }
  });
  els.panel.querySelectorAll('[data-ptab]').forEach(function (sp) {
    sp.addEventListener('click', function () {
      hz.panelTab = sp.getAttribute('data-ptab');
      els.panel.querySelectorAll('[data-ptab]').forEach(function (x) { x.classList.toggle('act', x === sp); });
      els.steppers.style.display = hz.panelTab === 'solar' ? '' : 'none';
      els.lunar.hidden = hz.panelTab !== 'lunar';
      if (hz.panelTab === 'lunar') refreshLunar(); else refreshSteppers();
    });
  });
  els.tl.addEventListener('input', function () {
    var a = chartAPI(); if (a) a.setPlaying(false);
    setHzPlaying(false);
    var mins = +els.tl.value || 0, d = new Date(hz.dateMs);
    d.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
    hz.dateMs = +d;
    writeback(false); render(); refreshSteppers();
  });
  els.steppers.addEventListener('click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('[data-step]') : null;
    if (!b) return;
    stepField(b.getAttribute('data-f'), +b.getAttribute('data-step'));
  });
  els.steppers.addEventListener('change', function (e) {
    if (e.target && e.target.matches && e.target.matches('input[data-f]')) commitFields();
  });
  $('hz-info-x').addEventListener('click', function () {
    hz.selKey = null; hz.series = null; hz.seriesKey = '';
    render();
  });
  els.culm.addEventListener('click', goCulmination);
  /* 拖动环视 + 点选（点信息卡/开关排不触发） */
  var drag = null;
  els.scene.addEventListener('pointerdown', function (e) {
    if (e.target.closest && e.target.closest('.hz-layerbar,.hz-info')) return;
    drag = { x: e.clientX, az: hz.centerAz, moved: false };
    try { els.scene.setPointerCapture(e.pointerId); } catch (err) {}
  });
  els.scene.addEventListener('pointermove', function (e) {
    if (!drag) return;
    var dx = e.clientX - drag.x;
    if (Math.abs(dx) > 6) drag.moved = true;
    if (drag.moved) {
      hz.centerAz = norm360(drag.az - dx / hz.geo.ppdX);
      render();
    }
  });
  function dragEnd(e) {
    if (!drag) return;
    var wasDrag = drag.moved; drag = null;
    if (!wasDrag) pickAt(e.clientX, e.clientY);
  }
  els.scene.addEventListener('pointerup', dragEnd);
  els.scene.addEventListener('pointercancel', function () { drag = null; });
}

/* ---------------- 时间：与平面星图共用状态 ---------------- */
function writeback(quiet) {
  var api = chartAPI(); if (!api || !api.setOffsetMin) return;
  /* 不取整：offsetMin 在星图侧本就是浮点分钟，取整会让轮询跟随把时刻拽偏近一分钟。
   * 同时记下 state() 将读到的 0.1 分钟取整值，轮询据此区分「自己的回写」与外部改动。 */
  var v = (hz.dateMs - Date.now()) / 60000;
  api.setOffsetMin(v, quiet);
  hz._lastOff = Math.round(v * 10) / 10;
  hz._lastPoll = Date.now();
}
function isPlaying() {
  if (hz.playing) return true;
  var api = chartAPI();
  return !!(api && api.state && api.state().playing);
}
function syncPlayBtn() { if (hz.els) hz.els.play.textContent = isPlaying() ? '❚❚' : '▶'; }
function playTick(ts) {
  if (!hz.playing) return;
  if (!hz.lastT) hz.lastT = ts;
  var dt = Math.min(1000, ts - hz.lastT); hz.lastT = ts;
  var sp = hz.els ? (+hz.els.speed.value || 300) : 300;
  hz.dateMs += dt * sp;
  writeback(true);
  if (ts - hz.lastDraw > 140) { hz.lastDraw = ts; render(); refreshSteppers(); }
  hz.raf = requestAnimationFrame(playTick);
}
function setHzPlaying(on) {
  var api = chartAPI();
  if (on) {
    if (api) api.setPlaying(false);
    if (hz.playing) return;
    hz.playing = true; hz.lastT = 0; hz.lastDraw = 0;
    hz.raf = requestAnimationFrame(playTick);
  } else {
    if (!hz.playing) { syncPlayBtn(); return; }
    hz.playing = false;
    if (hz.raf) cancelAnimationFrame(hz.raf);
    writeback(false);
  }
  syncPlayBtn();
}
function pauseBoth() {
  var api = chartAPI(); if (api) api.setPlaying(false);
  setHzPlaying(false);
}

/* ---------------- 步进拨盘 ---------------- */
function refreshSteppers() {
  if (!hz.els || hz.els.panel.hidden || hz.panelTab !== 'solar') return;
  var d = new Date(hz.dateMs);
  var vals = { y: d.getFullYear(), mo: d.getMonth() + 1, d: d.getDate(), h: d.getHours(), mi: d.getMinutes(), s: d.getSeconds() };
  hz.els.steppers.querySelectorAll('input[data-f]').forEach(function (inp) {
    if (document.activeElement === inp) return;
    var v = vals[inp.getAttribute('data-f')];
    inp.value = inp.getAttribute('data-f') === 'y' ? String(v) : pad2(v);
  });
}
function stepField(f, dir) {
  var d = new Date(hz.dateMs);
  if (f === 'y') d.setFullYear(clamp(d.getFullYear() + dir, 1900, 2100));
  else if (f === 'mo') d.setMonth(((d.getMonth() + dir) % 12 + 12) % 12);
  else if (f === 'd') {
    var dim = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(((d.getDate() - 1 + dir) % dim + dim) % dim + 1);
  }
  else if (f === 'h') d.setHours(((d.getHours() + dir) % 24 + 24) % 24);
  else if (f === 'mi') d.setMinutes(((d.getMinutes() + dir) % 60 + 60) % 60);
  else if (f === 's') d.setSeconds(((d.getSeconds() + dir) % 60 + 60) % 60);
  pauseBoth();
  hz.dateMs = +d;
  writeback(false); render(); refreshSteppers();
}
function commitFields() {
  var vals = {};
  hz.els.steppers.querySelectorAll('input[data-f]').forEach(function (inp) {
    vals[inp.getAttribute('data-f')] = parseInt(inp.value, 10);
  });
  var y = vals.y, mo = vals.mo, dd = vals.d, h = vals.h, mi = vals.mi, s = vals.s;
  if ([y, mo, dd, h, mi, s].some(function (v) { return !isFinite(v); })) { refreshSteppers(); return; }
  y = clamp(y, 1900, 2100); mo = clamp(mo, 1, 12);
  var dim = new Date(y, mo, 0).getDate();
  dd = clamp(dd, 1, dim); h = clamp(h, 0, 23); mi = clamp(mi, 0, 59); s = clamp(s, 0, 59);
  pauseBoth();
  hz.dateMs = +new Date(y, mo - 1, dd, h, mi, s);
  writeback(false); render(); refreshSteppers();
}
function refreshLunar() {
  if (!hz.els) return;
  var d = new Date(hz.dateMs);
  try {
    var lun = Solar.fromDate(d).getLunar();
    var ec = lun.getEightChar();
    var html = '<div>' + esc(T('农历')) + '　' + esc(T(lun.getYearInChinese())) + esc(T('年')) +
      esc(T(lun.getMonthInChinese())) + esc(T('月')) + esc(T(lun.getDayInChinese())) + '</div>' +
      '<div>' + esc(T('干支')) + '　' + esc(T('年')) + ' ' + esc(T(ec.getYear())) + ' · ' +
      esc(T('月')) + ' ' + esc(T(ec.getMonth())) + ' · ' + esc(T('日')) + ' ' + esc(T(ec.getDay())) + ' · ' +
      esc(T('时')) + ' ' + esc(T(ec.getTime())) + '</div>';
    try {
      var pj = lun.getPrevJieQi();
      if (pj) html += '<div>' + esc(T('节气')) + '　' + esc(T(pj.getName())) + '（' + esc(pj.getSolar().toYmd()) + '）</div>';
    } catch (e2) {}
    hz.els.lunar.innerHTML = html;
  } catch (e) {
    hz.els.lunar.textContent = T('农历数据不可用');
  }
}
function syncLayerBar() {
  if (!hz.els) return;
  var L = layersState();
  var map = { lines: L.lines, names: L.labelsOn, land: hz.land, mw: L.milky, red: !!(window.WuriRedlight && WuriRedlight.on()) };
  hz.els.layerbar.querySelectorAll('[data-hz-layer]').forEach(function (b) {
    b.classList.toggle('on', !!map[b.getAttribute('data-hz-layer')]);
  });
}
function pollTick() {
  if (!hz.open) return;
  var api = chartAPI(); if (!api || !api.state) return;
  var r = !!(window.WuriRedlight && WuriRedlight.on());
  if (r !== hz._lastRed) { hz._lastRed = r; syncLayerBar(); }
  syncPlayBtn();
  if (hz.playing) return;
  var st = api.state(), now = Date.now();
  if (hz._lastOff == null) { hz._lastOff = st.offsetMin; hz._lastPoll = now; return; }
  var dOff = st.offsetMin - hz._lastOff;
  if (Math.abs(dOff) > 0.001) {
    /* 外部改动（星图滑杆/播放推进）：跟随共用 offsetMin。
     * state() 的 offsetMin 取整到 0.1 分钟，跟随瞬间可带 ≤6 秒误差，仅此一次。 */
    hz.dateMs = now + st.offsetMin * 60000;
    render(); refreshSteppers();
  } else if (!st.playing) {
    /* offset 未变：所示时刻随墙钟自然流逝（与星图 chartDate 同语义），不回读取整值以免秒级抖动 */
    var dn = now - hz._lastPoll;
    if (dn > 0) {
      hz.dateMs += dn;
      if (hz.selKey || !hz.els.panel.hidden || dn > 4000) { render(); refreshSteppers(); }
    }
  }
  hz._lastOff = st.offsetMin;
  hz._lastPoll = now;
}

/* ---------------- 几何与渲染 ---------------- */
function setSize() {
  var els = hz.els; if (!els) return;
  var w = els.scene.clientWidth, h = els.scene.clientHeight;
  if (!w || !h) return;
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var bandH = Math.round(h * 0.46);
  if (w / h > 1.5) bandH = Math.round(Math.min(bandH, w * 0.14 / 0.35));
  hz.geo = { W: w, H: h, bandH: bandH, RW: bandH * 6,
    horizonY: h - bandH * (1 - SKYLINE_FRAC),
    ppdX: bandH * 6 / 360, ppdY: (h - bandH * (1 - SKYLINE_FRAC)) / 55, dpr: dpr };
  els.cv.width = Math.round(w * dpr); els.cv.height = Math.round(h * dpr);
  els.band.style.height = bandH + 'px';
  els.band.style.backgroundSize = hz.geo.RW + 'px ' + bandH + 'px';
}
function X(az) { return hz.geo.W / 2 + wrapDelta(az - hz.centerAz) * hz.geo.ppdX; }
function Y(alt) { return hz.geo.horizonY - alt * hz.geo.ppdY; }

function drawStar(ctx, x, y, mag, alpha, scale) {
  if (alpha <= 0.01) return;
  var r = starR(mag) * scale, grd = ctx.createRadialGradient(x, y, 0, x, y, r * 2.6);
  var a = (mag <= 2 ? 0.95 : mag <= 4 ? 0.8 : 0.6) * alpha;
  grd.addColorStop(0, 'rgba(240,233,214,' + a + ')');
  grd.addColorStop(0.35, 'rgba(240,233,214,' + (a * 0.5) + ')');
  grd.addColorStop(1, 'rgba(240,233,214,0)');
  ctx.fillStyle = grd;
  ctx.beginPath(); ctx.arc(x, y, r * 2.6, 0, 7); ctx.fill();
}

function render() {
  var els = hz.els;
  if (!els || !XG) return;
  if (!hz.geo.W) setSize();
  var W = hz.geo.W, H = hz.geo.H;
  if (!W) return;
  var date = new Date(hz.dateMs), obs = hz.obs;
  var proj = SKY.projectAll(date, obs, HZREQ);
  hz.proj = proj;
  var scr = new Array(ALLSTARS.length);
  for (var i = 0; i < ALLSTARS.length; i++) {
    var p = proj[i];
    scr[i] = p ? { x: X(p.az), y: Y(p.alt), alt: p.alt, az: p.az } : null;
  }
  hz.scr = scr;
  var sun = SKY.sunAltAz(date, obs);
  hz.sun = sun;
  var g = gradeAt(sun.alt);
  var lim = Math.min(SKY.magLim(), magAt(sun.alt));
  hz.lim = lim;
  var L = layersState();
  /* 天空渐变 + 背光压暗（稿内系数） */
  var backF = 0.78 + 0.22 * Math.cos(wrapDelta(hz.centerAz - sun.az) * RAD);
  els.sky.style.background = 'linear-gradient(to bottom,' + shade(g.sky[0], backF) + ',' + shade(g.sky[1], backF) + ' 55%,' + shade(g.sky[2], backF) + ')';
  /* 地景调色：SVG gamma 滤镜（亮度×通道增益为 amplitude、γ 为 exponent） */
  function setF(el, amp, exp) { el.setAttribute('amplitude', amp.toFixed(3)); el.setAttribute('exponent', exp.toFixed(3)); el.setAttribute('offset', '0'); }
  setF(els.feR, g.b * g.g[0], g.gam); setF(els.feG, g.b * g.g[1], g.gam); setF(els.feB, g.b * g.g[2], g.gam);
  /* 地景带相位：u(az)=az×(RW/360)，道观质心 u=RW/2 ↔ 南 180° */
  var bgX = W / 2 - norm360(hz.centerAz) / 360 * hz.geo.RW;
  els.band.style.backgroundPositionX = bgX + 'px';
  els.band.style.display = hz.land ? 'block' : 'none';
  /* 太阳晕：方位直跟太阳、离轴衰减、−12° 以下熄 */
  if (g.halo && sun.alt > -12) {
    var hx2 = X(sun.az), hy2 = Y(Math.max(sun.alt, -2)), hr = g.halo.r * (W / 900 + 0.4);
    var fov = W / hz.geo.ppdX, sep = Math.abs(wrapDelta(sun.az - hz.centerAz));
    var att = clamp(1 - (sep - fov / 2) / 60, 0, 1);
    var cc = hx(g.halo.c);
    els.halo.style.display = att > 0.01 ? 'block' : 'none';
    els.halo.style.width = els.halo.style.height = (hr * 2) + 'px';
    els.halo.style.left = hx2 + 'px'; els.halo.style.top = hy2 + 'px';
    els.halo.style.background = 'radial-gradient(circle,rgba(' + cc[0] + ',' + cc[1] + ',' + cc[2] + ',' + (0.55 * g.halo.i * att).toFixed(3) + ') 0%,transparent 70%)';
  } else els.halo.style.display = 'none';
  /* 月晕：月升且日落 −6° 以下，强度随月相 */
  var moon = null;
  try { moon = SKY.bodyPos(date, obs, 'moon'); } catch (e) {}
  hz.moon = moon;
  if (moon && moon.alt > 0 && sun.alt < -6) {
    var illum = 0.7;
    try { var mp = window.WuriTodaySky && WuriTodaySky.moonPhaseOf(date); if (mp && isFinite(mp.illumination)) illum = mp.illumination; } catch (e) {}
    var ms = clamp(W * 0.34, 140, 320);
    els.moonhalo.style.display = 'block';
    els.moonhalo.style.width = els.moonhalo.style.height = ms + 'px';
    els.moonhalo.style.left = X(moon.az) + 'px'; els.moonhalo.style.top = Y(moon.alt) + 'px';
    els.moonhalo.style.background = 'radial-gradient(circle,rgba(207,220,242,' + (0.30 * (0.25 + 0.75 * illum)).toFixed(3) + ') 0%,transparent 70%)';
  } else els.moonhalo.style.display = 'none';
  /* ---- 星层（canvas） ---- */
  var ctx = hz.ctx, scale = clamp(H / 600, 0.5, 1);
  ctx.setTransform(hz.geo.dpr, 0, 0, hz.geo.dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  if (L.milky && sun.alt < 6) drawMW(ctx, date, sun.alt);
  if (lim > 0) {
    for (var j = 0; j < ALLSTARS.length; j++) {
      var s2 = scr[j];
      if (!s2 || s2.alt < -1.5 || s2.alt > 92) continue;
      var m2 = ALLSTARS[j].mag;
      if (m2 > lim) continue;
      if (s2.x < -30 || s2.x > W + 30) continue;
      drawStar(ctx, s2.x, s2.y, m2, extinct(s2.alt), scale);
    }
  }
  if (hz.land && hz.maskImg.complete && hz.maskImg.naturalWidth) {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    var RW = hz.geo.RW, off = bgX % RW; if (off > 0) off -= RW;
    for (var ox = off; ox < W; ox += RW) ctx.drawImage(hz.maskImg, ox, H - hz.geo.bandH, RW, hz.geo.bandH);
    ctx.restore();
  }
  if (lim > 0) {
    drawTrajectory(ctx);
    drawLines(ctx, L);
    drawLabels(ctx, L, lim);
    drawSelected(ctx, L, scale);
  }
  drawBodies(ctx, date, sun, moon, L);
  /* 八方位字标 */
  for (var azk in els.dirEls) {
    var dEl = els.dirEls[azk], xx = X(+azk);
    dEl.style.display = (xx > -30 && xx < W + 30) ? 'block' : 'none';
    dEl.style.left = xx + 'px';
    dEl.style.top = (hz.geo.horizonY + 6) + 'px';
  }
  var dirName = DIRNAMES[Math.round(norm360(hz.centerAz) / 45) % 8];
  els.vread.innerHTML = esc(T('方位')) + ' <b>' + esc(T(dirName)) + ' ' + Math.round(norm360(hz.centerAz)) + '°</b> · ' +
    esc(T('太阳高度')) + ' <b>' + (sun.alt >= 0 ? '+' : '') + sun.alt.toFixed(1) + '°</b> · ' +
    esc(T('极限星等')) + ' <b>' + (lim > 0 ? lim.toFixed(1) : '—') + '</b>';
  updateInfo(date);
  els.datelab.textContent = T(date.getFullYear() + '年' + (date.getMonth() + 1) + '月' + date.getDate() + '日') + ' ' + fmtHMS(date);
  if (document.activeElement !== els.tl) els.tl.value = String(date.getHours() * 60 + date.getMinutes());
  els.tlval.textContent = fmtHM(date);
  if (!els.panel.hidden && hz.panelTab === 'lunar') {
    var lm = date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
    if (lm !== hz._lunarDay) { hz._lunarDay = lm; refreshLunar(); }
  }
}

function drawMW(ctx, date, sunAlt) {
  var proj = SKY.projectAll(date, hz.obs, MWPTS);
  var fade = sunAlt < -8 ? 0.9 : 0.25, W = hz.geo.W;
  ctx.save();
  ctx.fillStyle = 'rgba(216,224,246,1)';
  for (var i = 0; i < proj.length; i += 2) {
    var p = proj[i];
    if (!p || p.alt < -8 || p.alt > 92) continue;
    var x = X(p.az); if (x < -90 || x > W + 90) continue;
    var r = 9 * hz.geo.ppdY, y = Y(p.alt);
    var grd = ctx.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(216,224,246,' + (0.055 * fade).toFixed(3) + ')');
    grd.addColorStop(1, 'rgba(216,224,246,0)');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(216,224,246,' + (0.30 * fade).toFixed(3) + ')';
  ctx.lineWidth = 1; ctx.setLineDash([4, 5]);
  ctx.beginPath();
  var started = false, px = 0;
  for (var j = 0; j <= proj.length; j++) {
    var q = proj[j % proj.length];
    if (!q || q.alt < -4 || q.alt > 92) { started = false; continue; }
    var qx = X(q.az), qy = Y(q.alt);
    if (started && Math.abs(qx - px) > W * 0.6) started = false;
    if (!started) { ctx.moveTo(qx, qy); started = true; } else ctx.lineTo(qx, qy);
    px = qx;
  }
  ctx.stroke();
  ctx.restore();
}

function centroidOf(ast) {
  var sx = 0, sy = 0, n = 0;
  ast.starsIdx.forEach(function (gi) {
    var s = hz.scr[gi];
    if (s && s.alt > 0) { sx += s.x; sy += s.y; n++; }
  });
  return n ? { x: sx / n, y: sy / n } : null;
}

function drawLines(ctx, L) {
  if (!L.lines) return;
  ctx.save();
  ctx.lineWidth = 1;
  [false, true].forEach(function (doubtPass) {
    ctx.strokeStyle = 'rgba(201,168,106,.5)';
    ctx.setLineDash(doubtPass ? [3, 4] : []);
    ctx.beginPath();
    ASTS.forEach(function (ast) {
      if (ast.doubtful !== doubtPass) return;
      if (ast.key === hz.selKey) return;
      ast.edges.forEach(function (e) {
        var a = hz.scr[e[0]], b = hz.scr[e[1]];
        if (!a || !b || a.alt < -1 || b.alt < -1) return;
        if (Math.abs(a.x - b.x) > hz.geo.W * 0.6) return;
        ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      });
    });
    ctx.stroke();
  });
  ctx.restore();
}

function drawLabels(ctx, L, lim) {
  if (!L.labelsOn) return;
  var mode = labelMode(), cand = [];
  ASTS.forEach(function (ast) {
    if (ast.key === hz.selKey || ast.brightest < 0) return;
    var bp = hz.proj[ast.brightest];
    if (!bp || bp.alt < 1) return;
    var bm = ALLSTARS[ast.brightest].mag;
    var show = mode === 'all' ? bm <= lim + 1 : mode === 'major' ? !!MAJOR_LABELS[ast.name] : (!!MAJOR_LABELS[ast.name] || bm <= 3.5);
    if (!show) return;
    var c = centroidOf(ast);
    if (c) cand.push({ name: ast.name, x: c.x, y: c.y, bm: bm });
  });
  cand.sort(function (a, b) { return a.bm - b.bm; });
  var placed = [];
  ctx.save();
  ctx.font = '12px "Songti SC","STSong",serif';
  ctx.fillStyle = 'rgba(237,228,200,.85)';
  ctx.textAlign = 'center';
  cand.forEach(function (c) {
    for (var i = 0; i < placed.length; i++) {
      if (Math.abs(placed[i].x - c.x) < 54 && Math.abs(placed[i].y - c.y) < 18) return;
    }
    placed.push(c);
    ctx.fillText(T(c.name), c.x, c.y - 8);
  });
  ctx.restore();
}

function drawSelected(ctx, L, scale) {
  var ast = ASTBYKEY[hz.selKey || ''];
  if (!ast) return;
  ctx.save();
  if (L.lines) {
    ctx.strokeStyle = 'rgba(243,217,164,.9)'; ctx.lineWidth = 1.8;
    ctx.setLineDash(ast.doubtful ? [4, 4] : []);
    ctx.beginPath();
    ast.edges.forEach(function (e) {
      var a = hz.scr[e[0]], b = hz.scr[e[1]];
      if (!a || !b || a.alt < -1 || b.alt < -1) return;
      if (Math.abs(a.x - b.x) > hz.geo.W * 0.6) return;
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ast.starsIdx.forEach(function (gi) {
    var s = hz.scr[gi];
    if (!s || s.alt < 0) return;
    var m = ALLSTARS[gi].mag;
    drawStar(ctx, s.x, s.y, Math.max(1.2, (m >= 90 ? 5 : m) - 0.7), extinct(s.alt), scale);
    ctx.strokeStyle = 'rgba(243,217,164,.95)'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(s.x, s.y, 8.5, 0, 7); ctx.stroke();
    if (L.labelsOn && ALLSTARS[gi].cn) {
      ctx.fillStyle = '#f3d9a4';
      ctx.font = '13px "Songti SC","STSong",serif';
      ctx.textAlign = 'center';
      ctx.fillText(T(ALLSTARS[gi].cn), s.x, s.y - 14);
    }
  });
  var c = centroidOf(ast);
  if (c && L.labelsOn) {
    ctx.fillStyle = '#f3d9a4';
    ctx.font = '600 17px "Songti SC","STSong",serif';
    ctx.textAlign = 'center';
    ctx.fillText(T(ast.name), c.x, c.y - 30);
  }
  var bs = hz.scr[ast.brightest];
  if (bs && bs.alt > 0) {
    var pr = 13 + 3 * Math.sin(Date.now() / 280);
    ctx.strokeStyle = 'rgba(255,120,90,.95)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(bs.x, bs.y, pr, 0, 7); ctx.stroke();
    ctx.fillStyle = '#ff785a';
    ctx.beginPath(); ctx.arc(bs.x, bs.y, 3.2, 0, 7); ctx.fill();
  }
  ctx.restore();
}

function drawTrajectory(ctx) {
  var ast = ASTBYKEY[hz.selKey || ''];
  if (!ast) return;
  var s = ensureSeries(hz.dateMs);
  if (!s) return;
  ctx.save();
  ctx.strokeStyle = 'rgba(201,168,106,.55)';
  ctx.lineWidth = 1.4;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  var started = false, px = 0, W = hz.geo.W;
  s.samples.forEach(function (sm) {
    if (sm.alt <= 0) { started = false; return; }
    var x = X(sm.az), y = Y(sm.alt);
    if (started && Math.abs(x - px) > W * 0.6) started = false;
    if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    px = x;
  });
  ctx.stroke();
  ctx.restore();
}

function drawBodies(ctx, date, sun, moon, L) {
  ctx.save();
  if (sun.alt > -1.5) {
    var sx = X(sun.az), sy = Y(sun.alt);
    var grd = ctx.createRadialGradient(sx, sy, 0, sx, sy, 30);
    grd.addColorStop(0, 'rgba(255,244,214,.85)');
    grd.addColorStop(0.25, 'rgba(255,232,180,.35)');
    grd.addColorStop(1, 'rgba(255,232,180,0)');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(sx, sy, 30, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,246,218,.95)';
    ctx.beginPath(); ctx.arc(sx, sy, 6.5, 0, 7); ctx.fill();
  }
  if (moon && moon.alt > -1) {
    var mx = X(moon.az), my = Y(moon.alt), r = 7;
    ctx.beginPath(); ctx.arc(mx, my, r, 0, 7);
    ctx.fillStyle = '#e9e6da'; ctx.fill();
    var illum = 0.7;
    try { var mp = window.WuriTodaySky && WuriTodaySky.moonPhaseOf(date); if (mp && isFinite(mp.illumination)) illum = mp.illumination; } catch (e) {}
    ctx.save();
    ctx.beginPath(); ctx.arc(mx, my, r, 0, 7); ctx.clip();
    var dx = (wrapDelta(sun.az - moon.az) > 0 ? 1 : -1) * (1 - illum) * r * 1.7;
    ctx.beginPath(); ctx.arc(mx + dx, my, r, 0, 7);
    ctx.fillStyle = 'rgba(8,10,18,.85)'; ctx.fill();
    ctx.restore();
    ctx.beginPath(); ctx.arc(mx, my, r, 0, 7);
    ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 1; ctx.stroke();
    if (L.labelsOn) {
      ctx.fillStyle = 'rgba(237,228,200,.9)';
      ctx.font = '11px "Songti SC","STSong",serif';
      ctx.textAlign = 'center';
      ctx.fillText(T(BODY_CN.moon), mx, my - 12);
    }
  }
  BODY_ORDER.forEach(function (id) {
    var bp = null;
    try { bp = SKY.bodyPos(date, hz.obs, id); } catch (e) {}
    if (!bp || bp.alt < 0) return;
    var x = X(bp.az), y = Y(bp.alt);
    ctx.fillStyle = BODY_STYLE[id];
    ctx.beginPath(); ctx.arc(x, y, 3.2, 0, 7); ctx.fill();
    if (L.labelsOn) {
      ctx.fillStyle = 'rgba(237,228,200,.85)';
      ctx.font = '11px "Songti SC","STSong",serif';
      ctx.textAlign = 'center';
      ctx.fillText(T(BODY_CN[id]), x, y - 9);
    }
  });
  ctx.restore();
}

/* ---------------- 今晚时间线（所示日期之夜：暮光终了→次日暮光始，10 分钟采样） ---------------- */
function nightWindow(dateMs) {
  var d = new Date(dateMs);
  var base = d.getHours() < 6
    ? new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1, 12)
    : new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12);
  var dusk = null;
  try { dusk = SKY.astroDusk(base, hz.obs); } catch (e) {}
  var start = dusk ? new Date(dusk) : new Date(base.getFullYear(), base.getMonth(), base.getDate(), 19);
  var end = null;
  try {
    var A = window.Astronomy;
    var r = A.SearchAltitude(A.Body.Sun, new A.Observer(hz.obs.lat, hz.obs.lon, 0), 1, new Date(+start + 3600000), 1.5, -18);
    if (r && r.date) end = new Date(r.date);
  } catch (e) {}
  if (!end) end = new Date(+start + 9 * 3600000);
  return { start: start, end: end };
}
function ensureSeries(dateMs) {
  var ast = ASTBYKEY[hz.selKey || ''];
  if (!ast || ast.brightest < 0) return null;
  var win = nightWindow(dateMs);
  var key = hz.selKey + '|' + win.start.getFullYear() + '-' + win.start.getMonth() + '-' + win.start.getDate() +
    '|' + hz.obs.lat + ',' + hz.obs.lon;
  if (hz.series && hz.seriesKey === key) return hz.series;
  var st = ALLSTARS[ast.brightest], samples = [], step = 10 * 60000;
  for (var tt = +win.start; tt <= +win.end; tt += step) {
    var p = SKY.altAz(new Date(tt), hz.obs, st.ra, st.dec);
    if (p) samples.push({ t: tt, alt: p.alt, az: p.az });
  }
  var rise = null, set = null, tr = null;
  for (var i = 0; i < samples.length; i++) {
    var s = samples[i];
    if (!tr || s.alt > tr.alt) tr = { t: s.t, alt: s.alt };
    if (i > 0) {
      var p0 = samples[i - 1];
      if (p0.alt < 0 && s.alt >= 0 && !rise) rise = { t: p0.t + (s.t - p0.t) * (0 - p0.alt) / (s.alt - p0.alt) };
      if (p0.alt >= 0 && s.alt < 0) set = { t: p0.t + (s.t - p0.t) * (0 - p0.alt) / (s.alt - p0.alt) };
    }
  }
  if (samples.length && samples[0].alt >= 0 && !rise) rise = { t: samples[0].t, early: true };
  hz.series = { samples: samples, win: win,
    rts: { rise: rise, transit: (tr && tr.alt > -3) ? tr : null, set: set } };
  hz.seriesKey = key;
  return hz.series;
}
function updateInfo(date) {
  var els = hz.els;
  var ast = ASTBYKEY[hz.selKey || ''];
  if (!ast) { els.info.hidden = true; return; }
  els.info.hidden = false;
  els.infoName.textContent = T(ast.name);
  var bp = hz.proj ? hz.proj[ast.brightest] : null;
  els.infoAlt.textContent = bp ? (bp.alt >= 0 ? bp.alt.toFixed(1) + '°' : T('已在地平下') + '（' + bp.alt.toFixed(1) + '°）') : '—';
  var s = ensureSeries(hz.dateMs), rts = s ? s.rts : null;
  els.infoRise.textContent = rts && rts.rise ? (rts.rise.early ? T('已升起') : fmtHM(new Date(rts.rise.t))) : '—';
  els.infoTr.textContent = rts && rts.transit ? fmtHM(new Date(rts.transit.t)) + '（' + T('最高') + ' ' + rts.transit.alt.toFixed(0) + '°）' : '—';
  els.infoSet.textContent = rts && rts.set ? fmtHM(new Date(rts.set.t)) : '—';
  els.culm.disabled = !(rts && rts.transit);
  els.culm.style.opacity = rts && rts.transit ? '' : '.45';
}
function pickAt(cx, cy) {
  if (!hz.scr || !hz.proj) return;
  var rect = hz.els.scene.getBoundingClientRect();
  var px = cx - rect.left, py = cy - rect.top;
  var best = null, bestD = 1e9;
  ASTS.forEach(function (ast) {
    if (ast.brightest < 0) return;
    var bp = hz.proj[ast.brightest];
    if (!bp || bp.alt < -1) return;
    ast.starsIdx.forEach(function (gi) {
      var s = hz.scr[gi];
      if (!s || s.alt < 0) return;
      var d = Math.hypot(s.x - px, s.y - py);
      if (d < bestD) { bestD = d; best = ast; }
    });
    var c = centroidOf(ast);
    if (c) {
      var dc = Math.hypot(c.x - px, c.y - py);
      if (dc <= 34 && dc < bestD) { bestD = dc; best = ast; }
    }
  });
  if (best && bestD <= 34) {
    hz.selKey = best.key; hz.series = null; hz.seriesKey = '';
    render();
  }
}
function goCulmination() {
  var s = ensureSeries(hz.dateMs);
  if (!s || !s.rts.transit) return;
  var target = +s.rts.transit.t - 45 * 60000, now = Date.now();
  /* 与星图共用 offsetMin 的 ±12h 播放包线对齐：过远则提前到包线内起播，仍会播到中天 */
  if (target - now > 700 * 60000) target = now + 700 * 60000;
  if (now - target > 700 * 60000) target = now - 700 * 60000;
  hz.dateMs = target;
  hz.centerAz = 180;
  var api = chartAPI();
  if (api && api.setSpeed) api.setSpeed(300);
  if (hz.els) hz.els.speed.value = '300';
  writeback(false);
  setHzPlaying(true);
  render(); refreshSteppers();
}

/* ---------------- 打开/关闭 ---------------- */
function openHorizon() {
  var v = $('view-sky-horizon');
  if (!v) return;
  ['view-sky-tonight', 'view-sky-chart', 'view-sky-ar'].forEach(function (id) {
    var e = $(id); if (e) e.hidden = true;
  });
  v.hidden = false;
  hz.open = true;
  if (!hz.built) buildShell();
  var api = chartAPI();
  if (api) {
    hz.obs = api.obsState();
    var st = api.state();
    hz.dateMs = Date.now() + st.offsetMin * 60000;
    hz._lastOff = st.offsetMin;
    hz._lastPoll = Date.now();
    if (hz.els) {
      hz.els.speed.value = String(st.speed || 300);
      hz.els.loc.innerHTML = api.locBarHTML();
    }
    if (st.focus && ASTBYKEY[st.focus]) hz.selKey = st.focus;
  }
  syncLayerBar(); syncPlayBtn();
  if (hz.poll) clearInterval(hz.poll);
  hz.poll = setInterval(pollTick, 250);
  if (XG) { setSize(); render(); refreshSteppers(); }
  loadData().then(function () {
    if (!hz.open) return;
    var a2 = chartAPI();
    if (a2 && a2.state().focus && ASTBYKEY[a2.state().focus] && !hz.selKey) hz.selKey = a2.state().focus;
    setSize(); render(); refreshSteppers();
  }).catch(function () {
    if (hz.els) hz.els.vread.textContent = T('星官数据加载失败');
  });
}
function closeHorizon() {
  if (!hz.open) return;
  hz.open = false;
  setHzPlaying(false);
  if (hz.poll) { clearInterval(hz.poll); hz.poll = 0; }
  var v = $('view-sky-horizon');
  if (v) v.hidden = true;
}
function rerender() {
  if (!hz.open) return;
  buildShell();
  var api = chartAPI();
  if (api && hz.els) hz.els.speed.value = String(api.state().speed || 300);
  hz.geo.W = 0;
  syncLayerBar(); syncPlayBtn();
  setSize(); render(); refreshSteppers();
}
var rszT = null;
window.addEventListener('resize', function () {
  if (!hz.open) return;
  if (rszT) clearTimeout(rszT);
  rszT = setTimeout(function () { if (hz.open) { setSize(); render(); } }, 180);
});
var bb = $('sky-horizon-back');
if (bb) bb.addEventListener('click', closeHorizon);

window.WuriSkyHorizon = {
  open: openHorizon, close: closeHorizon, rerender: rerender,
  /* 冒烟/调试面 */
  state: function () {
    return { open: hz.open, centerAz: Math.round(hz.centerAz * 10) / 10, dateMs: hz.dateMs,
      selKey: hz.selKey, lim: Math.round(hz.lim * 100) / 100,
      sunAlt: hz.sun ? Math.round(hz.sun.alt * 100) / 100 : null,
      sunAz: hz.sun ? Math.round(hz.sun.az * 100) / 100 : null,
      land: hz.land, playing: isPlaying(),
      geo: { W: hz.geo.W, H: hz.geo.H, bandH: hz.geo.bandH, horizonY: Math.round(hz.geo.horizonY), ppdX: hz.geo.ppdX, ppdY: Math.round(hz.geo.ppdY * 100) / 100 },
      maskReady: !!(hz.maskImg.complete && hz.maskImg.naturalWidth),
      nStars: ALLSTARS.length, nAsts: ASTS.length };
  },
  select: function (key) {
    if (!ASTBYKEY[key]) return false;
    hz.selKey = key; hz.series = null; hz.seriesKey = '';
    render(); return true;
  },
  setCenterAz: function (a) { hz.centerAz = norm360(a); render(); },
  setDateMs: function (ms) { hz.dateMs = +ms; writeback(false); render(); refreshSteppers(); },
  gradeAt: gradeAt, magAt: magAt,
  astPointOf: function (key) {
    var ast = ASTBYKEY[key];
    if (!ast || !hz.scr) return null;
    var s = hz.scr[ast.brightest];
    return s ? { x: Math.round(s.x), y: Math.round(s.y), alt: Math.round(s.alt * 10) / 10 } : null;
  },
  seriesOf: function () {
    var s = hz.selKey ? ensureSeries(hz.dateMs) : null;
    if (!s) return null;
    function f(r) { return r ? { t: r.t, hm: fmtHM(new Date(r.t)), alt: r.alt != null ? Math.round(r.alt * 10) / 10 : null, early: !!r.early } : null; }
    return { n: s.samples.length, rise: f(s.rts.rise), transit: f(s.rts.transit), set: f(s.rts.set) };
  },
  pickAt: function (x, y) {
    var rect = hz.els.scene.getBoundingClientRect();
    pickAt(rect.left + x, rect.top + y);
    return hz.selKey;
  }
};
})();
