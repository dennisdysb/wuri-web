/* 戊日不上香 · 步罡踏斗跟练（v2.0.0 (5) 贯通批）
 * 步序定版：~/workspace/wuri-app/star-module/bugang.json 的 recommended
 * ——《太上助国救民总真秘要》卷八北斗七星纲：顺行（贪狼起→破军）
 * →倒行逆返→返行再顺，三匝共 21 落点（转折处同星重计，与定版
 * total_footholds=21 一致）。星表坐标 BSC5/J2000，与星官图鉴北斗
 * 条同源；步位图几何取步天歌北斗连线（秘要原罡图图式不存于文字，
 * 不冒称原图，页面文案已分工注明）。辅星 Alcor（80 UMa，BSC5
 * HR 5062）只标不步：天狱法八星之式有其名而步位无文。 */
(function () {
  'use strict';

  /* 步罡踏斗暂时隐藏开关（2026-10-25 用户定：暂时隐藏、不是删除——入口卡片、
   * 视图本体与步序数据全部保留；恢复时把此常量改回 true 即可，入口卡片由
   * bind() 自动摘除 hidden。各端写法一致：本文件经 prepare_cn_www.py /
   * prepare_play_www.py / prepare_ios_www.py 定点移植到国内版、Play 版与
   * iOS 预览，开关随本文件走、全端同口径。） */
  var BUGANG_ENABLED = false;

  var STARS = [
    { seq: 1, name: '天枢', lord: '贪狼', desig: 'α UMa', ra: 165.93208, dec: 61.75083, mag: 1.79 },
    { seq: 2, name: '天璇', lord: '巨门', desig: 'β UMa', ra: 165.46042, dec: 56.38250, mag: 2.37 },
    { seq: 3, name: '天玑', lord: '禄存', desig: 'γ UMa', ra: 178.45750, dec: 53.69472, mag: 2.44 },
    { seq: 4, name: '天权', lord: '文曲', desig: 'δ UMa', ra: 183.85667, dec: 57.03250, mag: 3.31 },
    { seq: 5, name: '玉衡', lord: '廉贞', desig: 'ε UMa', ra: 193.50708, dec: 55.95972, mag: 1.77 },
    { seq: 6, name: '开阳', lord: '武曲', desig: 'ζ UMa', ra: 200.98125, dec: 54.92528, mag: 2.27 },
    { seq: 7, name: '摇光', lord: '破军', desig: 'η UMa', ra: 206.88500, dec: 49.31333, mag: 1.86 }
  ];
  var FU = { name: '辅', desig: '80 UMa', ra: 201.306, dec: 54.988, mag: 3.99 };
  var ROUNDS = [
    { name: '顺行', seq: [1, 2, 3, 4, 5, 6, 7] },
    { name: '倒行', seq: [7, 6, 5, 4, 3, 2, 1] },
    { name: '返行', seq: [1, 2, 3, 4, 5, 6, 7] }
  ];
  var FLAT = [];
  ROUNDS.forEach(function (r, ri) {
    r.seq.forEach(function (s) { FLAT.push({ round: ri, starSeq: s }); });
  });
  var TOTAL = FLAT.length; /* 21 */

  var $ = function (id) { return document.getElementById(id); };
  function T(s) { return window.tx ? window.tx(s) : s; }

  var idx = 0;               /* 当前落点序号 0..20；done 时 idx===TOTAL */
  var startFoot = 'L';       /* 起步足：L 左足先（缺省，男·春秋）/ R 右足先（女·冬夏） */
  var autoTimer = 0;

  function footOf(i) {
    var first = (i % 2 === 0);
    if (startFoot === 'L') return first ? '左足' : '右足';
    return first ? '右足' : '左足';
  }
  function starOf(g) { return STARS[FLAT[g].starSeq - 1]; }

  /* ---- 步位图：北斗连线形（赤经向左递增，观天习惯） ---- */
  function stageSVG() {
    var W = 320, H = 252, pL = 30, pR = 30, pT = 26, pB = 26;
    var all = STARS.concat([FU]);
    var minRA = 1e18, maxRA = -1e18, minDec = 1e18, maxDec = -1e18;
    all.forEach(function (s) {
      minRA = Math.min(minRA, s.ra); maxRA = Math.max(maxRA, s.ra);
      minDec = Math.min(minDec, s.dec); maxDec = Math.max(maxDec, s.dec);
    });
    var cd = Math.cos((minDec + maxDec) / 2 * Math.PI / 180);
    var spanRA = Math.max((maxRA - minRA) * cd, 1), spanDec = Math.max(maxDec - minDec, 1);
    function X(ra) { return pL + (maxRA - ra) / (maxRA - minRA) * (W - pL - pR); }
    function Y(dec) { return pT + (maxDec - dec) / (maxDec - minDec) * (H - pT - pB); }
    function pt(s) { return X(s.ra).toFixed(1) + ',' + Y(s.dec).toFixed(1); }
    var h = '<svg class="bg-plot" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="北斗七星步位图">';
    /* 北斗本体连线（步天歌图式） */
    h += '<polyline class="bg-line" points="' + STARS.map(pt).join(' ') + '" fill="none"/>';
    /* 本匝已走路径（金线，止于当前落点） */
    if (idx < TOTAL) {
      var r = FLAT[idx].round, posIn = idx - r * 7;
      var pathPts = [];
      for (var i = 0; i <= posIn; i++) pathPts.push(pt(STARS[ROUNDS[r].seq[i] - 1]));
      if (pathPts.length > 1) h += '<polyline class="bg-path" points="' + pathPts.join(' ') + '" fill="none"/>';
      /* 本匝落点序号 */
      for (var j = 0; j < 7; j++) {
        var s2 = STARS[ROUNDS[r].seq[j] - 1];
        var cls = j < posIn ? 'bg-step done' : (j === posIn ? 'bg-step now' : 'bg-step');
        h += '<circle class="' + cls + '" cx="' + X(s2.ra).toFixed(1) + '" cy="' + Y(s2.dec).toFixed(1) + '" r="' + (j === posIn ? 10 : 7.5) + '"/>' +
          '<text class="bg-step-n' + (j === posIn ? ' now' : '') + '" x="' + X(s2.ra).toFixed(1) + '" y="' + (Y(s2.dec) + 3.4).toFixed(1) + '" text-anchor="middle">' + (j + 1) + '</text>';
      }
    } else {
      STARS.forEach(function (s2) {
        h += '<circle class="bg-step done" cx="' + X(s2.ra).toFixed(1) + '" cy="' + Y(s2.dec).toFixed(1) + '" r="7.5"/>';
      });
      h += '<polyline class="bg-path" points="' + STARS.map(pt).join(' ') + '" fill="none"/>';
    }
    /* 辅星：只标不步 */
    h += '<circle class="bg-fu" cx="' + X(FU.ra).toFixed(1) + '" cy="' + Y(FU.dec).toFixed(1) + '" r="2.6"/>' +
      '<text class="bg-fu-t" x="' + (X(FU.ra) + 6).toFixed(1) + '" y="' + (Y(FU.dec) - 5).toFixed(1) + '">' + T('辅') + '</text>';
    /* 星名标签 */
    STARS.forEach(function (s) {
      var cur = idx < TOTAL && starOf(idx) === s;
      h += '<text class="bg-star-t' + (cur ? ' now' : '') + '" x="' + X(s.ra).toFixed(1) + '" y="' + (Y(s.dec) - 13).toFixed(1) + '" text-anchor="middle">' +
        T(s.name) + '</text>';
    });
    return h + '</svg>';
  }

  function render() {
    var stage = $('bg-stage'); if (!stage) return;
    stage.innerHTML = stageSVG();
    var now = $('bg-now'), prog = $('bg-progress');
    if (idx >= TOTAL) {
      if (now) now.innerHTML = '<span class="bg-now-main">' + T('三匝已毕') + '</span>' +
        '<span class="bg-now-sub">' + T('顺 · 倒 · 返 二十一步俱全') + '</span>';
      if (prog) prog.textContent = T('全程 21 步 · 三匝完成');
    } else {
      var f = FLAT[idx], s = starOf(idx), posIn = idx - f.round * 7;
      if (now) now.innerHTML =
        '<span class="bg-now-main">' + T(s.name) + ' · ' + T(s.lord) + '</span>' +
        '<span class="bg-now-sub">' + T('第' + (posIn + 1) + '步 · ') + T(footOf(idx)) + T('落点') + '</span>';
      if (prog) prog.textContent = T('第 ' + (f.round + 1) + ' 匝（' + ROUNDS[f.round].name + '） · 全程第 ' + (idx + 1) + ' / ' + TOTAL + ' 步');
    }
    var prev = $('bg-prev'), next = $('bg-next'), auto = $('bg-auto');
    if (prev) prev.disabled = idx <= 0;
    if (next) { next.disabled = idx >= TOTAL; next.textContent = idx >= TOTAL ? T('已毕') : (idx === TOTAL - 1 ? T('收功') : T('下一步')); }
    if (auto) auto.textContent = autoTimer ? T('暂停') : T('自动');
    var fl = $('bg-foot-left'), fr = $('bg-foot-right');
    if (fl) fl.classList.toggle('on', startFoot === 'L');
    if (fr) fr.classList.toggle('on', startFoot === 'R');
  }

  function stopAuto() {
    if (autoTimer) { clearInterval(autoTimer); autoTimer = 0; }
  }
  function step(d) {
    idx = Math.max(0, Math.min(TOTAL, idx + d));
    if (idx >= TOTAL) stopAuto();
    render();
  }
  function toggleAuto() {
    if (autoTimer) { stopAuto(); render(); return; }
    if (idx >= TOTAL) idx = 0;
    autoTimer = setInterval(function () {
      if (idx >= TOTAL) { stopAuto(); render(); return; }
      step(1);
    }, 2600);
    render();
  }
  function open() {
    if (!BUGANG_ENABLED) return; /* 暂时隐藏期：任何直达调用（入口点击 / window.Bugang.open）一律挡回 */
    var v = $('bugang-view'); if (!v) return;
    idx = 0; stopAuto();
    v.hidden = false;
    document.body.classList.add('bugang-open');
    render();
    v.scrollTop = 0;
  }
  function close() {
    var v = $('bugang-view'); if (!v) return;
    stopAuto();
    v.hidden = true;
    document.body.classList.remove('bugang-open');
  }

  function bind() {
    /* 入口卡片显隐只由开关决定：HTML 里常带 hidden（隐藏态不渲染、无闪烁），
     * 开关打开时在此摘除。 */
    var card = $('bugang-entry-card');
    if (card) card.hidden = !BUGANG_ENABLED;
    var entry = $('bugang-open');
    if (entry) {
      entry.addEventListener('click', open);
      entry.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    }
    var back = $('bugang-back');
    if (back) back.addEventListener('click', close);
    var prev = $('bg-prev'), next = $('bg-next'), auto = $('bg-auto'), reset = $('bg-reset');
    if (prev) prev.addEventListener('click', function () { stopAuto(); step(-1); });
    if (next) next.addEventListener('click', function () { step(1); });
    if (auto) auto.addEventListener('click', toggleAuto);
    if (reset) reset.addEventListener('click', function () { stopAuto(); idx = 0; render(); });
    var fl = $('bg-foot-left'), fr = $('bg-foot-right');
    function setFoot(f) { return function () { startFoot = f; idx = 0; stopAuto(); render(); }; }
    if (fl) fl.addEventListener('click', setFoot('L'));
    if (fr) fr.addEventListener('click', setFoot('R'));
    var stage = $('bg-stage');
    if (stage) stage.addEventListener('click', function () { step(1); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();

  window.Bugang = { open: open, close: close, enabled: BUGANG_ENABLED };
})();
