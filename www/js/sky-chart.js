/* 戊日不上香 · 中国星象二期一步：「今夜可见」＋「平面交互星图」（v2.1.0）
 *
 * 地基是 js/sky-engine.js（Astronomy Engine 坐标变换）；渲染层用 D3 的
 * d3-geo（BSD-3，js/vendor/）geoStereographic 自组装——不用 d3-celestial：
 * 它是 D3 v3 时代的整页组件（自带数据管线与全局 d3 v3），在本 App 的
 * 无构建原生 JS 代码库里隔离成本失控；d3-geo 的投影/大圆路径/半球裁剪
 * 正好是本页所需，且已以锚点数值验证配方（见下）。
 *
 * 星图配方（2026-10-23 数值验证，锚点：St-Hubert 2026-10-24T02:00Z
 * 北斗天樞/搖光落位与引擎 alt/az 逐项合）：
 *   输入坐标 [−RA°, Dec°]（当日期分点，引擎 projectAll 给出），
 *   geoStereographic().rotate([本地视恒星时°, 纬度−90, 0])
 *   .clipAngle(90)（只画地平线上半球）。
 *   得「天顶为心、北上、左东右西」的仰视星图；自旋＝图面绕心旋转，
 *   以 SVG 组 transform 实现（与投影 gamma 等价），拖动零重算。
 * 数据只用自家 data/xingguan.json 与 data/xingguan-lines.json（图式连线，
 * 存疑官虚线）；点选星官进既有星官详情（Stars.openDetail），详情返回
 * 即回本页（详情视图在本页之后、层级同高，收起详情即露回）。
 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  function T(s) { return window.tx ? window.tx(s == null ? '' : s) : (s == null ? '' : String(s)); }
  function t(k) { return window.t ? window.t(k) : k; }
  function tf() { return window.tf ? window.tf.apply(null, arguments) : String(arguments[0]); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function txEsc(s) { return esc(T(s)); }
  var SKY = window.WuriSky;
  var D2R = Math.PI / 180;

  /* ---------------- 数据 ---------------- */
  var XG = null, dataPromise = null, ASTS = [], ALLSTARS = [];
  function loadData() {
    if (XG) return Promise.resolve(XG);
    if (dataPromise) return dataPromise;
    dataPromise = Promise.all([
      fetch('data/xingguan.json').then(function (r) { if (!r.ok) throw new Error('xg'); return r.json(); }),
      fetch('data/xingguan-lines.json').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
    ]).then(function (res) {
      XG = res[0];
      var LINEMAP = {};
      ((res[1] && res[1].asterisms) || []).forEach(function (e) { LINEMAP[e.section + '|' + e.name] = e; });
      buildIndex(LINEMAP);
      return XG;
    }).catch(function (e) { dataPromise = null; throw e; });
    return dataPromise;
  }
  function buildIndex(LINEMAP) {
    ASTS = []; ALLSTARS = [];
    (XG.asterisms || []).forEach(function (a) {
      var ast = { key: a.section + '|' + a.name, name: a.name, section: a.section, region: a.region,
        starsIdx: [], edges: [], doubtful: false, brightest: -1 };
      var byName = {}, ai = ASTS.length;
      (a.stars || []).forEach(function (s) {
        if (s.ra_deg == null || s.dec_deg == null) return;
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
      ASTS.push(ast);
    });
  }

  /* ---------------- 观测地 ---------------- */
  var OBS_KEY = 'wuri_sky_obs_v1';
  var obsState = (function () {
    try {
      var j = JSON.parse(localStorage.getItem(OBS_KEY) || 'null');
      if (j && isFinite(j.lat) && isFinite(j.lon)) return { lat: +j.lat, lon: +j.lon, custom: true };
    } catch (e) {}
    return { lat: SKY.DEFAULT_OBS.lat, lon: SKY.DEFAULT_OBS.lon, custom: false };
  })();
  function saveObs() {
    try { localStorage.setItem(OBS_KEY, JSON.stringify({ lat: obsState.lat, lon: obsState.lon })); } catch (e) {}
  }
  function obsText() {
    if (!obsState.custom) return t('sx2_obs_default');
    return fmtCoord(obsState.lat, 'lat') + ' · ' + fmtCoord(obsState.lon, 'lon');
  }
  function fmtCoord(v, kind) {
    var hemi = kind === 'lat' ? (v >= 0 ? 'N' : 'S') : (v >= 0 ? 'E' : 'W');
    return Math.abs(v).toFixed(4) + '°' + hemi;
  }
  function locBarHTML() {
    return '<div class="sk-loc"><span class="sk-loc-lab">' + esc(t('sx2_obs')) + '</span>' +
      '<b class="sk-loc-val">' + esc(obsText()) + '</b>' +
      '<button class="mini-btn tiny" data-loc="geo">' + esc(t('sx2_geo')) + '</button>' +
      '<button class="mini-btn tiny" data-loc="edit">' + esc(t('sx2_edit')) + '</button></div>' +
      '<div class="sk-loc-edit" hidden>' +
      '<label>' + esc(t('sx2_lat')) + '<input type="number" class="sk-in sk-lat" step="0.0001" min="-90" max="90" value="' + obsState.lat + '"></label>' +
      '<label>' + esc(t('sx2_lon')) + '<input type="number" class="sk-in sk-lon" step="0.0001" min="-180" max="180" value="' + obsState.lon + '"></label>' +
      '<button class="mini-btn tiny" data-loc="apply">' + esc(t('sx2_apply')) + '</button>' +
      '<button class="mini-btn tiny" data-loc="default">' + esc(t('sx2_default')) + '</button>' +
      '<div class="sk-loc-note"></div></div>';
  }
  function bindLocBar(root, onChange) {
    if (root._skLocBound) { root._skLocRefresh = onChange; return; }
    root._skLocBound = true; root._skLocRefresh = onChange;
    root.addEventListener('click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('[data-loc]') : null;
      if (!b || !root.contains(b)) return;
      var act = b.getAttribute('data-loc');
      var edit = root.querySelector('.sk-loc-edit');
      var note = root.querySelector('.sk-loc-note');
      if (act === 'edit') { if (edit) edit.hidden = !edit.hidden; return; }
      if (act === 'default') {
        obsState = { lat: SKY.DEFAULT_OBS.lat, lon: SKY.DEFAULT_OBS.lon, custom: false };
        try { localStorage.removeItem(OBS_KEY); } catch (e2) {}
        onChange(); return;
      }
      if (act === 'apply') {
        var la = parseFloat(root.querySelector('.sk-lat').value), lo = parseFloat(root.querySelector('.sk-lon').value);
        if (!isFinite(la) || !isFinite(lo) || la < -90 || la > 90 || lo < -180 || lo > 180) {
          if (note) note.textContent = t('sx2_coord_bad'); return;
        }
        obsState = { lat: la, lon: lo, custom: true }; saveObs(); onChange(); return;
      }
      if (act === 'geo') {
        if (!navigator.geolocation) { if (note) { if (edit) edit.hidden = false; note.textContent = t('sx2_geo_fail'); } return; }
        if (note) { if (edit) edit.hidden = false; note.textContent = t('sx2_geo_wait'); }
        navigator.geolocation.getCurrentPosition(function (p) {
          obsState = { lat: Math.round(p.coords.latitude * 10000) / 10000, lon: Math.round(p.coords.longitude * 10000) / 10000, custom: true };
          saveObs(); onChange();
        }, function () {
          var n2 = root.querySelector('.sk-loc-note'); if (n2) n2.textContent = t('sx2_geo_fail');
          var e2 = root.querySelector('.sk-loc-edit'); if (e2) e2.hidden = false;
        }, { timeout: 10000, maximumAge: 600000 });
      }
    });
  }

  function fmtTime(d) {
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function show(id) { var v = $(id); if (v) v.hidden = false; }
  function hide(id) { var v = $(id); if (v) v.hidden = true; }
  function failHTML() { return '<div class="sx-loading">' + esc(t('sx_load_fail')) + '</div>'; }

  /* ---------------- 入口注入（星象页底部双入口，MutationObserver 同步分架注入先例） ---------------- */
  function injectEntries() {
    var host = $('sx-home'); if (!host || $('sx2-entries')) return;
    var div = document.createElement('div');
    div.id = 'sx2-entries'; div.className = 'sx-duo';
    div.innerHTML =
      '<div class="sx-card sx-entry" data-sx2="tonight"><div><div class="e1">' + esc(t('sx2_tonight')) + '</div>' +
      '<div class="e2">' + esc(t('sx2_tonight_sub')) + '</div></div></div>' +
      '<div class="sx-card sx-entry" data-sx2="chart"><div><div class="e1">' + esc(t('sx2_chart')) + '</div>' +
      '<div class="e2">' + esc(t('sx2_chart_sub')) + '</div></div></div>';
    host.appendChild(div);
  }
  function watchEntries() {
    var host = $('sx-home');
    if (!host || !window.MutationObserver) { injectEntries(); return; }
    injectEntries();
    new MutationObserver(function () { injectEntries(); }).observe(host, { childList: true });
  }

  /* ---------------- 今夜可见 ---------------- */
  function openTonight() { show('view-sky-tonight'); renderTonight(); }

  function tonightWindow() {
    var now = new Date();
    /* 凌晨 6 点前算前一晚（暮光在昨晚、午夜在今晨已过，窗口即那一夜） */
    var base = now.getHours() < 6 ? new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12) : now;
    var dusk = SKY.astroDusk(base, obsState);
    var start = dusk || new Date(base.getFullYear(), base.getMonth(), base.getDate(), 19, 0);
    var end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1, 0, 0, 0);
    return { start: start, end: end, duskExact: !!dusk };
  }

  function renderTonight() {
    var host = $('sx-tonight'); if (!host) return;
    if (!SKY || !SKY.available) { host.innerHTML = failHTML(); return; }
    host.innerHTML = locBarHTML() + '<div id="sk-tonight-body"><div class="sx-loading">' + esc(t('sx_loading')) + '</div></div>';
    bindLocBar(host, renderTonight);
    loadData().then(function () {
      var body = $('sk-tonight-body'); if (!body) return;
      var win = tonightWindow();
      /* 每 20 分钟采样一次：逐官追踪其最亮定星的最高高度与时刻 */
      var step = 20 * 60000, best = {};
      for (var tm = win.start.getTime(); tm <= win.end.getTime(); tm += step) {
        var d = new Date(tm);
        for (var i = 0; i < ASTS.length; i++) {
          var ast = ASTS[i]; if (ast.brightest < 0) continue;
          var st = ALLSTARS[ast.brightest];
          var r = SKY.altAz(d, obsState, st.ra, st.dec);
          if (r && (!best[ast.key] || r.alt > best[ast.key].alt)) best[ast.key] = { alt: r.alt, date: d };
        }
      }
      var list = ASTS.filter(function (ast) {
        return ast.brightest >= 0 && ALLSTARS[ast.brightest].mag <= 6.0 && best[ast.key] && best[ast.key].alt >= 10;
      }).map(function (ast) { return { ast: ast, b: best[ast.key] }; });
      list.sort(function (x, y) {
        return (y.b.alt - x.b.alt) || (ALLSTARS[x.ast.brightest].mag - ALLSTARS[y.ast.brightest].mag);
      });
      /* 第二遍：最佳时刻该官有几颗定星在地平线上 */
      list.forEach(function (it) {
        var arr = it.ast.starsIdx.map(function (gi) { return ALLSTARS[gi]; });
        var pr = SKY.projectAll(it.b.date, obsState, arr);
        it.up = pr ? pr.filter(function (p) { return p.alt > 0; }).length : 0;
      });
      var h = '<div class="sk-night-head">' + txEsc(tf(t('sx2_night_line'), list.length)) +
        '<br>' + esc(t('sx2_dusk')) + ' ' + fmtTime(win.start) + (win.duskExact ? '' : ' ' + esc(t('sx2_dusk_approx'))) + '</div>';
      if (!list.length) h += '<div class="sx-loading">' + esc(t('sx2_empty')) + '</div>';
      list.forEach(function (it) {
        var ast = it.ast, bs = ALLSTARS[ast.brightest];
        h += '<div class="sx-row" data-sx-detail="' + esc(ast.key) + '">' +
          '<div class="sx-row-main"><span class="sx-row-name">' + txEsc(ast.name) + '</span>' +
          '<span class="sx-row-verse">' + txEsc(ast.section) + ' · ' + txEsc(bs.cn) + ' ' +
          txEsc(tf(t('sx2_mag'), bs.mag.toFixed(1))) + ' · ' + txEsc(tf(t('sx2_stars_up'), it.up, ast.starsIdx.length)) + '</span></div>' +
          '<div class="sx-row-side"><span class="sk-best">' + esc(t('sx2_best')) + ' ' + fmtTime(it.b.date) + '</span>' +
          '<span class="sx-row-n">' + txEsc(tf(t('sx2_alt'), it.b.alt.toFixed(0))) + '</span></div></div>';
      });
      h += '<div class="sx-caliber">' + esc(t('sx2_caliber_tonight')) + '</div>';
      body.innerHTML = h;
    }).catch(function () { var b = $('sk-tonight-body'); if (b) b.innerHTML = failHTML(); });
  }

  /* ---------------- 平面星图 ---------------- */
  var BASE_K = 186, CX = 200, CY = 200;
  var chart = { spin: 0, zoom: 1, offsetMin: 0, labels: [], drawn: false };
  var chartEls = null;

  function openChart() { show('view-sky-chart'); renderChartView(); }

  function chartSkeleton() {
    return locBarHTML() +
      '<div class="sk-chart-wrap"><svg id="sk-chart-svg" viewBox="0 0 400 400" role="img" aria-label="' + esc(t('sx2_chart')) + '">' +
      '<g id="sk-chart-g"></g></svg></div>' +
      '<div class="sk-controls"><button class="mini-btn tiny" id="sk-now">' + esc(t('sx2_now')) + '</button>' +
      '<input type="range" id="sk-time" min="-720" max="720" step="15" value="0">' +
      '<span id="sk-time-lab"></span></div>' +
      '<div class="sk-hint">' + esc(t('sx2_chart_hint')) + '</div>' +
      '<div class="sx-caliber">' + esc(t('sx2_caliber_chart')) + '</div>';
  }

  function renderChartView() {
    var host = $('sx-chart'); if (!host) return;
    if (!SKY || !SKY.available || !window.d3) { host.innerHTML = failHTML(); return; }
    host.innerHTML = chartSkeleton();
    bindLocBar(host, renderChartView);
    chartEls = { svg: $('sk-chart-svg'), g: $('sk-chart-g'), time: $('sk-time'), lab: $('sk-time-lab') };
    bindChartEvents();
    loadData().then(drawChart).catch(function () { host.innerHTML = failHTML(); });
  }

  function chartDate() { return new Date(Date.now() + chart.offsetMin * 60000); }

  function applyTransform() {
    if (!chartEls) return;
    chartEls.g.setAttribute('transform',
      'translate(' + CX + ' ' + CY + ') rotate(' + chart.spin.toFixed(1) + ') scale(' + chart.zoom + ') translate(' + (-CX) + ' ' + (-CY) + ')');
  }

  function starR(m) { return m <= 1 ? 3.2 : m <= 2 ? 2.6 : m <= 3 ? 2.0 : m <= 4 ? 1.55 : m <= 5 ? 1.2 : m <= 6 ? 0.95 : 0.8; }

  function drawChart() {
    if (!chartEls || !XG) return;
    var date = chartDate();
    var pr = SKY.projectAll(date, obsState, ALLSTARS);
    if (!pr) return;
    var d3 = window.d3;
    var proj = d3.geoStereographic().rotate([SKY.lstDeg(date, obsState), obsState.lat - 90, 0])
      .scale(BASE_K).translate([CX, CY]).clipAngle(90);
    var path = d3.geoPath(proj);
    var P = [];
    P.push('<circle class="sk-disc" cx="' + CX + '" cy="' + CY + '" r="' + BASE_K + '"/>');
    [60, 30].forEach(function (alt) {
      P.push('<circle class="sk-ring" cx="' + CX + '" cy="' + CY + '" r="' + (BASE_K * Math.tan((90 - alt) / 2 * D2R)).toFixed(1) + '"/>');
    });
    /* 连线层（图式连线；存疑官虚线） */
    ASTS.forEach(function (ast) {
      if (!ast.edges.length) return;
      var any = false;
      for (var i = 0; i < ast.starsIdx.length; i++) if (pr[ast.starsIdx[i]].alt > -2) { any = true; break; }
      if (!any) return;
      var coords = ast.edges.map(function (e) {
        return [[-pr[e[0]].raEqd, pr[e[0]].decEqd], [-pr[e[1]].raEqd, pr[e[1]].decEqd]];
      });
      var d = path({ type: 'MultiLineString', coordinates: coords });
      if (d) P.push('<path class="sk-line' + (ast.doubtful ? ' doubtful' : '') + '" d="' + d + '"/>');
    });
    /* 星点层 */
    for (var i = 0; i < ALLSTARS.length; i++) {
      var st = ALLSTARS[i], p = pr[i];
      if (p.alt < -0.3 || st.mag > 6.5) continue;
      var xy = proj([-p.raEqd, p.decEqd]); if (!xy) continue;
      P.push('<circle class="sk-star" cx="' + xy[0].toFixed(1) + '" cy="' + xy[1].toFixed(1) + '" r="' + starR(st.mag) +
        '" fill-opacity="' + (st.mag <= 3 ? 0.95 : st.mag <= 5 ? 0.8 : 0.6) + '"/>');
    }
    /* 方位标（随图面同组旋转） */
    var cards = [[0, '北'], [45, '东北'], [90, '东'], [135, '东南'], [180, '南'], [225, '西南'], [270, '西'], [315, '西北']];
    cards.forEach(function (c) {
      var eq = SKY.eqdFromAltAz(date, obsState, 0, c[0]);
      var xy = proj([-eq.ra, eq.dec]); if (!xy) return;
      var dx = xy[0] - CX, dy = xy[1] - CY, len = Math.hypot(dx, dy) || 1;
      P.push('<text class="sk-cardinal' + (c[0] % 90 ? ' minor' : '') + '" x="' + (CX + dx / len * (BASE_K - 15)).toFixed(1) +
        '" y="' + (CY + dy / len * (BASE_K - 15)).toFixed(1) + '">' + esc(T(c[1])) + '</text>');
    });
    /* 星官名标签＋点选点位 */
    chart.labels = [];
    ASTS.forEach(function (ast) {
      if (ast.brightest < 0) return;
      var bp = pr[ast.brightest], bm = ALLSTARS[ast.brightest].mag;
      var bxy = proj([-bp.raEqd, bp.decEqd]); if (!bxy) return;
      var sx = 0, sy = 0, n = 0;
      ast.starsIdx.forEach(function (gi) {
        var p = pr[gi]; if (p.alt <= 0) return;
        var xy = proj([-p.raEqd, p.decEqd]); if (xy) { sx += xy[0]; sy += xy[1]; n++; }
      });
      var cxp = n ? sx / n : bxy[0], cyp = n ? sy / n : bxy[1];
      chart.labels.push({ key: ast.key, x: bxy[0], y: bxy[1], cx: cxp, cy: cyp });
      var showLabel = bp.alt > 2 && n > 0 && (bm <= 4.6 || (chart.zoom >= 1.8 && bm <= 5.6));
      if (showLabel) P.push('<text class="sk-label" x="' + cxp.toFixed(1) + '" y="' + cyp.toFixed(1) + '">' + esc(T(ast.name)) + '</text>');
    });
    chartEls.g.innerHTML = P.join('');
    applyTransform();
    chart.drawn = true;
    if (chartEls.lab) chartEls.lab.textContent = fmtTime(date) + (chart.offsetMin ? ' (' + (chart.offsetMin > 0 ? '+' : '') + chart.offsetMin / 60 + 'h)' : '');
  }

  function bindChartEvents() {
    var svg = chartEls.svg; if (!svg) return;
    var redrawTimer = null;
    function scheduleRedraw() {
      if (redrawTimer) clearTimeout(redrawTimer);
      redrawTimer = setTimeout(drawChart, 150);
    }
    chartEls.time.addEventListener('input', function () {
      chart.offsetMin = +chartEls.time.value; scheduleRedraw();
      if (chartEls.lab) chartEls.lab.textContent = fmtTime(chartDate());
    });
    $('sk-now').addEventListener('click', function () {
      chart.offsetMin = 0; chartEls.time.value = '0'; drawChart();
    });
    /* 拖动自旋 / 双指缩放 / 点选 */
    var pointers = new Map(), moved = 0, pinchD = 0, pinchZoom = 1, lastX = 0;
    function pDist() {
      var a = Array.from(pointers.values());
      return a.length === 2 ? Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) : 0;
    }
    svg.addEventListener('pointerdown', function (e) {
      svg.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      lastX = e.clientX; moved = 0;
      if (pointers.size === 2) { pinchD = pDist(); pinchZoom = chart.zoom; }
    });
    svg.addEventListener('pointermove', function (e) {
      if (!pointers.has(e.pointerId)) return;
      var prev = pointers.get(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        var dx = e.clientX - lastX; lastX = e.clientX;
        moved += Math.abs(dx) + Math.abs(e.clientY - prev.y);
        if (dx) { chart.spin += dx * 0.3; applyTransform(); }
      } else if (pointers.size === 2 && pinchD > 0) {
        var d = pDist();
        if (d > 0) { chart.zoom = Math.max(1, Math.min(3, pinchZoom * d / pinchD)); applyTransform(); moved = 99; }
      }
    });
    function endPointer(e) {
      var wasClick = pointers.size === 1 && moved < 6;
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinchD = 0;
      if (wasClick) pick(e);
      if (chart.zoom !== 1) scheduleRedraw(); /* 缩放后标签阈值重算 */
    }
    svg.addEventListener('pointerup', endPointer);
    svg.addEventListener('pointercancel', function (e) { pointers.delete(e.pointerId); });
    svg.addEventListener('wheel', function (e) {
      e.preventDefault();
      chart.zoom = Math.max(1, Math.min(3, chart.zoom * Math.exp(-e.deltaY * 0.0012)));
      applyTransform(); scheduleRedraw();
    }, { passive: false });
  }

  function pick(e) {
    if (!chart.drawn || !window.Stars) return;
    var svg = chartEls.svg, rect = svg.getBoundingClientRect();
    var x = (e.clientX - rect.left) / rect.width * 400, y = (e.clientY - rect.top) / rect.height * 400;
    /* 逆变换：去自旋、去缩放（绕图心） */
    var dx = x - CX, dy = y - CY, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx) - chart.spin * D2R;
    var ux = CX + r * Math.cos(a) / chart.zoom, uy = CY + r * Math.sin(a) / chart.zoom;
    var bestK = null, bestD = 26;
    chart.labels.forEach(function (L) {
      var d = Math.min(Math.hypot(L.cx - ux, L.cy - uy), Math.hypot(L.x - ux, L.y - uy));
      if (d < bestD) { bestD = d; bestK = L.key; }
    });
    if (bestK) window.Stars.openDetail(bestK);
  }

  /* ---------------- 全局绑定 ---------------- */
  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest ? e.target.closest('[data-sx2]') : null;
    if (el) {
      if (el.getAttribute('data-sx2') === 'tonight') openTonight(); else openChart();
      return;
    }
    /* 切标签时收起本页两个子视图（与 Stars.activate 收子视图的语义一致） */
    var tab = e.target && e.target.closest ? e.target.closest('#tabbar button') : null;
    if (tab) { hide('view-sky-tonight'); hide('view-sky-chart'); }
  });
  var b;
  if ((b = $('sky-tonight-back'))) b.addEventListener('click', function () { hide('view-sky-tonight'); });
  if ((b = $('sky-chart-back'))) b.addEventListener('click', function () { hide('view-sky-chart'); });

  watchEntries();
  var prev = window.__wuri_rerender;
  window.__wuri_rerender = function () {
    if (prev) prev();
    var d = $('sx2-entries'); if (d) d.remove();
    injectEntries();
    var tv = $('view-sky-tonight'), cv = $('view-sky-chart');
    if (tv && !tv.hidden) renderTonight();
    if (cv && !cv.hidden) renderChartView();
  };

  window.WuriSkyChart = { openTonight: openTonight, openChart: openChart,
    /* 冒烟/调试：某星官标签点在当前图面（含自旋/缩放）的屏幕坐标（viewBox 单位） */
    pickPointOf: function (key) {
      for (var i = 0; i < chart.labels.length; i++) {
        var L = chart.labels[i]; if (L.key !== key) continue;
        var dx = L.cx - CX, dy = L.cy - CY, r = Math.hypot(dx, dy) * chart.zoom, a = Math.atan2(dy, dx) + chart.spin * D2R;
        return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) };
      }
      return null;
    } };
})();
