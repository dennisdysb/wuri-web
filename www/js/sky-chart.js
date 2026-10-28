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
  var XG = null, dataPromise = null, ASTS = [], ALLSTARS = [], UNLOCATED = [];
  /* 数据走 WuriSky.starData() 共享加载（v2.1.1 (4)）：与 stars.js 同一份
   * 结果、同一条双通道（fetch→XHR）路径，不得另起 fetch 读包内数据 */
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
  function buildIndex(LINEMAP) {
    ASTS = []; ALLSTARS = []; UNLOCATED = [];
    (XG.asterisms || []).forEach(function (a) {
      var ast = { key: a.section + '|' + a.name, name: a.name, section: a.section, region: a.region,
        starsIdx: [], edges: [], doubtful: false, brightest: -1, unlocated: [] };
      var byName = {}, ai = ASTS.length;
      (a.stars || []).forEach(function (s) {
        if (s.ra_deg == null || s.dec_deg == null) {
          /* 位置待考星（unlocated/not_plotted 口径）：只登记名字供搜索
           * 诚实标注，绝不编造坐标、绝不进 ALLSTARS/投影 */
          if (s.cn_name) { ast.unlocated.push(s.cn_name); UNLOCATED.push({ cn: s.cn_name, astKey: ast.key, astName: a.name, section: a.section }); }
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

  /* 星象门控（2026-10-26）：平面星图/今夜可见皆高级版，落点在此二函数收口
   * （data-sx2 委托、AR 内「看星图」回调均经此）。与 stars.js starGate 同口径。 */
  function skyGate() {
    if (window.WuriPro && WuriPro.isPro()) return true;
    if (window.WuriPro) WuriPro.requirePro('stars');
    return false;
  }

  /* ---------------- 今夜可见 ---------------- */
  function openTonight() { if (!skyGate()) return; show('view-sky-tonight'); renderTonight(); }

  function tonightWindow() {
    var now = new Date();
    /* 凌晨 6 点前算前一晚（暮光在昨晚、午夜在今晨已过，窗口即那一夜） */
    var base = now.getHours() < 6 ? new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12) : now;
    var dusk = SKY.astroDusk(base, obsState);
    var start = dusk || new Date(base.getFullYear(), base.getMonth(), base.getDate(), 19, 0);
    var end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1, 0, 0, 0);
    var dawn = astroDawnAfter(start);
    return { start: start, end: end, duskExact: !!dusk, dawn: dawn, dawnExact: !!dawn };
  }

  /* 明晨天文暮光始：与 SKY.astroDusk 同法（Astronomy Engine SearchAltitude，
   * 太阳升至 −18°、direction=+1），SKY 未暴露 dawn，本页直调同一 vendor 库 */
  function astroDawnAfter(from) {
    var A = window.Astronomy; if (!A || !A.SearchAltitude || !A.Observer) return null;
    try {
      var r = A.SearchAltitude(A.Body.Sun, new A.Observer(obsState.lat, obsState.lon, 0), 1, from, 1.5, -18);
      return r ? r.date : null;
    } catch (e) { return null; }
  }

  /* 今夜最佳采样（今夜可见页、星图侧栏摘要、点选信息条共用同一口径：
   * 天文暮光终了→午夜、每 20 分钟采样、逐官追踪最亮定星的最高高度与时刻） */
  function computeTonightBest() {
    var win = tonightWindow();
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
    return { win: win, best: best };
  }
  function tonightList(best) {
    var lim = SKY.magLim ? SKY.magLim() : 6;
    return ASTS.filter(function (ast) {
      return ast.brightest >= 0 && ALLSTARS[ast.brightest].mag <= lim && best[ast.key] && best[ast.key].alt >= 10;
    }).map(function (ast) { return { ast: ast, b: best[ast.key] }; });
  }
  /* 月亮与五大行星（v2.1.1 合并批）：位置走 SKY.bodyPos（Astronomy Engine，
   * 与恒星同一引擎同一观测地/时刻口径）；今夜最佳与星官同一采样口径
   * （暮光终了→午夜、每 20 分钟、取最高高度时刻）。月相照亮与今日星象
   * WuriTodaySky.moonPhaseOf 同源同值。 */
  function bodyName(id) { return t('sx2_body_' + id); }
  function bodyKindName(kind) { return t(kind === 'moon' ? 'sx2_kind_moon' : 'sx2_kind_planet'); }
  function bestTonightForBody(id) {
    if (!SKY || !SKY.bodyPos) return null;
    var win = tonightWindow(), bk = null;
    for (var tm = win.start.getTime(); tm <= win.end.getTime(); tm += 20 * 60000) {
      var p = SKY.bodyPos(new Date(tm), obsState, id);
      if (p && (!bk || p.alt > bk.alt)) bk = { alt: p.alt, date: new Date(tm) };
    }
    return bk;
  }
  function moonIllum(date) {
    return (window.WuriTodaySky && WuriTodaySky.moonPhaseOf) ? WuriTodaySky.moonPhaseOf(date) : null;
  }

  /* ---------------- 今晚时间线（v252 星空批 B 线⑥） ----------------
   * 采样口径：天文暮光终了→明晨天文暮光始（无 dawn 解则暮光后 9 小时），
   * 每 10 分钟一采样；星官以最亮定星为准（projectAll 批量），行星/月亮走
   * bodyPos。升/落＝高度穿越 0° 的线性内插时刻；中天＝采样内最高高度时刻
   * （10 分钟粒度）。最佳窗＝得分曲线（Σ 目标 sin(高度)+ × 权重，星官权重
   * 按最亮星等 (7−mag)/4 下限 0.3、天体 1.2）峰值点向两侧扩展至 0.6×峰值。
   * 月扰口径：目标中天时刻，月球与目标的角距 sep（球面余弦定理，赤道坐标
   * 同为当日期分点）＋月照亮比 illum 分级——illum<0.25 月光弱；sep≥90°
   * 距月远；45°≤sep<90° 中等；sep<45° 且 illum≥0.6 干扰强。 */
  var nightInfo = null;
  function moonInterference(illum, sepDeg) {
    if (illum == null || sepDeg == null) return '';
    if (illum < 0.25) return T('月光弱，影响小');
    if (sepDeg >= 90) return T('距月远，影响小');
    if (sepDeg >= 45) return illum >= 0.7 ? T('月光较强，背景略亮') : T('月光中等，影响有限');
    return illum >= 0.6 ? T('近月且月亮亮，干扰强') : T('近月，月光中等');
  }
  function computeNightSeries(win, items) {
    var t0 = win.start.getTime();
    var t1 = win.dawn ? win.dawn.getTime() : t0 + 9 * 3600000;
    if (t1 <= t0) t1 = t0 + 9 * 3600000;
    var step = 10 * 60000, n = Math.max(2, Math.round((t1 - t0) / step) + 1);
    var astItems = items.filter(function (it) { return !it.body; });
    var brightStars = astItems.map(function (it) { return ALLSTARS[it.ast.brightest]; });
    var series = astItems.map(function () { return []; });
    var bodySeries = {};
    items.forEach(function (it) { if (it.body) bodySeries[it.body.id] = []; });
    var samples = [], s, d;
    for (s = 0; s < n; s++) {
      d = new Date(t0 + s * step);
      var pr = SKY.projectAll(d, obsState, brightStars);
      var score = 0, up20 = 0;
      astItems.forEach(function (it, ai) {
        var alt = pr ? pr[ai].alt : -99;
        series[ai].push(alt);
        if (alt > 0) {
          score += Math.sin(Math.min(alt, 90) * D2R) * Math.max(0.3, (7 - ALLSTARS[it.ast.brightest].mag) / 4);
          if (alt >= 20) up20++;
        }
      });
      if (SKY.bodyPos) SKY.BODIES.forEach(function (bd) {
        if (!bodySeries[bd.id]) return;
        var bp = SKY.bodyPos(d, obsState, bd.id);
        bodySeries[bd.id].push(bp ? bp.alt : -99);
        if (bp && bp.alt > 0) { score += Math.sin(Math.min(bp.alt, 90) * D2R) * 1.2; if (bp.alt >= 20) up20++; }
      });
      samples.push({ t: d, score: score, up20: up20 });
    }
    function rtsOf(alts) {
      var rise = null, set = null, trI = -1, trAlt = -99, i;
      for (i = 0; i < alts.length; i++) if (alts[i] > trAlt) { trAlt = alts[i]; trI = i; }
      function cross(i1, i2) {
        var a1 = alts[i1], a2 = alts[i2];
        if (a2 === a1) return new Date(t0 + i2 * step);
        return new Date(t0 + (i1 + (0 - a1) / (a2 - a1)) * step);
      }
      for (i = 1; i < alts.length; i++) { if (alts[i - 1] <= 0 && alts[i] > 0) { rise = cross(i - 1, i); break; } }
      for (i = alts.length - 1; i > 0; i--) { if (alts[i - 1] > 0 && alts[i] <= 0) { set = cross(i - 1, i); break; } }
      return { rise: rise, set: set, transit: trI >= 0 ? new Date(t0 + trI * step) : null, transitAlt: trAlt };
    }
    items.forEach(function (it) {
      if (it.body) it.rts = rtsOf(bodySeries[it.body.id] || []);
      else it.rts = rtsOf(series[astItems.indexOf(it)]);
    });
    items.forEach(function (it) {
      var td = it.rts && it.rts.transit ? it.rts.transit : win.start;
      var mp2 = SKY.bodyPos ? SKY.bodyPos(td, obsState, 'moon') : null;
      var tra, tdec;
      if (it.body) {
        if (it.body.kind === 'moon') { it.moonSep = null; it.moonNote = ''; return; }
        var tp = SKY.bodyPos(td, obsState, it.body.id); if (!tp) { it.moonSep = null; it.moonNote = ''; return; }
        tra = tp.ra; tdec = tp.dec;
      } else {
        var bs = ALLSTARS[it.ast.brightest], ep = SKY.eqdOf(td, bs.ra, bs.dec);
        tra = ep[0]; tdec = ep[1];
      }
      if (!mp2) { it.moonSep = null; it.moonNote = ''; return; }
      var cosS = Math.sin(tdec * D2R) * Math.sin(mp2.dec * D2R) +
        Math.cos(tdec * D2R) * Math.cos(mp2.dec * D2R) * Math.cos((tra - mp2.ra) * D2R);
      it.moonSep = Math.acos(Math.max(-1, Math.min(1, cosS))) / D2R;
      var mi = moonIllum(td);
      it.moonNote = moonInterference(mi ? mi.illumination : null, it.moonSep);
    });
    var bestWin = null, mx = -1, mi2 = -1;
    samples.forEach(function (sm, i) { if (sm.score > mx) { mx = sm.score; mi2 = i; } });
    if (mi2 >= 0 && mx > 0) {
      var thr = mx * 0.6, a = mi2, b = mi2;
      while (a > 0 && samples[a - 1].score >= thr) a--;
      while (b < samples.length - 1 && samples[b + 1].score >= thr) b++;
      bestWin = { start: samples[a].t, end: samples[b].t, up20: samples[mi2].up20, score: mx };
    }
    return { samples: samples, bestWin: bestWin, t0: new Date(t0), t1: new Date(t1) };
  }
  function rtsText(it) {
    if (!it.rts || !it.rts.transit) return '';
    var s = T('升') + ' ' + (it.rts.rise ? fmtTime(it.rts.rise) : T('入夜已升')) + ' · ' +
      T('中天') + ' ' + fmtTime(it.rts.transit) + ' · ' +
      T('落') + ' ' + (it.rts.set ? fmtTime(it.rts.set) : T('天亮未落'));
    if (it.moonSep != null) s += ' · ' + tf(T('月距 %s°'), it.moonSep.toFixed(0));
    if (it.moonNote) s += ' · ' + it.moonNote;
    return s;
  }

  /* 点选信息条用：单官今夜最佳（与列表同一采样口径） */
  function bestTonightFor(ast) {
    var win = tonightWindow(), st = ALLSTARS[ast.brightest], bk = null;
    for (var tm = win.start.getTime(); tm <= win.end.getTime(); tm += 20 * 60000) {
      var r = SKY.altAz(new Date(tm), obsState, st.ra, st.dec);
      if (r && (!bk || r.alt > bk.alt)) bk = { alt: r.alt, date: new Date(tm) };
    }
    return bk;
  }

  function renderTonight() {
    var host = $('sx-tonight'); if (!host) return;
    if (!SKY || !SKY.available) { host.innerHTML = failHTML(); return; }
    /* 最暗星等控件（v2.1.1 并入项）：与星图滑杆共用 SKY.magLim 同一状态
     * （localStorage 同一口径）——此处改，星图/AR 跟随；星图改，此处下次
     * 打开即是新值（renderTonight 每次按 magLim 重建控件与列表）。 */
    host.innerHTML = locBarHTML() +
      '<div class="sk-controls sk-tn-mag"><span class="sk-ctl-lab">' + esc(t('sx2_maglim')) + '</span>' +
      '<input type="range" id="tn-mag" min="3" max="6" step="1" value="' + (SKY.magLim ? SKY.magLim() : 6) + '">' +
      '<span id="tn-mag-lab">' + (SKY.magLim ? SKY.magLim() : 6) + ' ' + esc(t('sx2_mag_unit')) + '</span></div>' +
      '<div id="sk-tonight-body"><div class="sx-loading">' + esc(t('sx_loading')) + '</div></div>';
    bindLocBar(host, renderTonight);
    var tm = $('tn-mag');
    if (tm) tm.addEventListener('input', function () {
      if (SKY.setMagLim) SKY.setMagLim(+tm.value);
      var lb = $('tn-mag-lab'); if (lb) lb.textContent = tm.value + ' ' + t('sx2_mag_unit');
      renderTonightList();
    });
    renderTonightList();
  }
  function renderTonightList() {
    var body = $('sk-tonight-body'); if (!body) return;
    body.innerHTML = '<div class="sx-loading">' + esc(t('sx_loading')) + '</div>';
    loadData().then(function () {
      var body = $('sk-tonight-body'); if (!body) return;
      var res = computeTonightBest(), win = res.win, best = res.best;
      var list = tonightList(best);
      list.sort(function (x, y) {
        return (y.b.alt - x.b.alt) || (ALLSTARS[x.ast.brightest].mag - ALLSTARS[y.ast.brightest].mag);
      });
      /* 月亮/行星与星官混排（同一排序口径：今夜最高高度；门槛同为 ≥10°） */
      var items = list.slice();
      if (SKY.bodyPos) SKY.BODIES.forEach(function (bd) {
        var bk = bestTonightForBody(bd.id);
        if (bk && bk.alt >= 10) items.push({ body: bd, b: bk });
      });
      items.sort(function (x, y) { return y.b.alt - x.b.alt; });
      /* 第二遍：最佳时刻该官有几颗定星在地平线上 */
      list.forEach(function (it) {
        var arr = it.ast.starsIdx.map(function (gi) { return ALLSTARS[gi]; });
        var pr = SKY.projectAll(it.b.date, obsState, arr);
        it.up = pr ? pr.filter(function (p) { return p.alt > 0; }).length : 0;
      });
      /* 时间线层（⑥）：全夜采样→升/中天/落＋月扰＋最佳窗；失败静默回落旧表 */
      var series = null;
      try { series = computeNightSeries(win, items); } catch (e) { series = null; }
      var sampleNote = '';
      for (var sni = 0; sni < items.length; sni++) if (items[sni].moonNote) { sampleNote = items[sni].moonNote; break; }
      nightInfo = { dusk: win.start, dawn: win.dawn || null, bestWin: series ? series.bestWin : null,
        moon: moonIllum(win.start), items: items.length, sampleMoonNote: sampleNote,
        firstRts: items.length && items[0].rts ? { rise: items[0].rts.rise, transit: items[0].rts.transit, set: items[0].rts.set } : null };
      var h = '';
      if (series && series.bestWin && items.length) {
        var bw = series.bestWin, moonNow = moonIllum(win.start);
        h += '<div class="sk-night-verdict" style="border:1px solid var(--line);border-radius:12px;padding:10px 12px;margin:0 0 10px">' +
          '<div style="font-weight:700;margin-bottom:4px">' + esc(T('今晚最值得看')) + '</div>';
        items.slice(0, 3).forEach(function (it) {
          var nm3 = it.body ? bodyName(it.body.id) : it.ast.name;
          var tt = it.rts && it.rts.transit ? it.rts.transit : it.b.date;
          var ta = it.rts ? it.rts.transitAlt : it.b.alt;
          h += '<div>' + txEsc(nm3) + ' · ' + esc(T('中天')) + ' ' + fmtTime(tt) + ' · ' + txEsc(tf(t('sx2_alt'), ta.toFixed(0))) + '</div>';
        });
        h += '<div style="margin-top:4px">' + esc(T('最佳观测窗')) + ' <b>' + fmtTime(bw.start) + '–' + fmtTime(bw.end) + '</b>' +
          esc(tf(T('（窗内峰值时 %s 个目标同在 20° 以上）'), bw.up20)) + '</div>';
        if (moonNow) h += '<div>' + esc(T('月亮')) + '：' + esc(T(moonNow.phaseName || '')) + ' · ' +
          esc(tf(T('月龄 %s 天'), moonNow.ageDays.toFixed(1))) + ' · ' + esc(tf(t('sx_moon_illum'), moonNow.illuminationPct.toFixed(1))) + '</div>';
        h += '</div>';
      }
      h += '<div class="sk-night-head">' + txEsc(tf(t('sx2_night_line'), items.length)) +
        '<br>' + esc(t('sx2_dusk')) + ' ' + fmtTime(win.start) + (win.duskExact ? '' : ' ' + esc(t('sx2_dusk_approx'))) +
        (win.dawn ? '<br>' + esc(T('明晨天文暮光始')) + ' ' + fmtTime(win.dawn) + (win.dawnExact ? '' : ' ' + esc(t('sx2_dusk_approx'))) : '') + '</div>';
      if (!items.length) h += '<div class="sx-loading">' + esc(t('sx2_empty')) + '</div>';
      items.forEach(function (it) {
        if (it.body) {
          /* 月亮/行星行：带身份徽标，不挂 data-sx-detail（无详情页） */
          var bd = it.body, mp2 = bd.kind === 'moon' ? moonIllum(it.b.date) : null;
          h += '<div class="sx-row sx-row-body" data-sx-body="' + esc(bd.id) + '">' +
            '<div class="sx-row-main"><span class="sx-row-name">' + esc(T(bodyName(bd.id))) + '</span>' +
            '<span class="sx-badge body">' + esc(bodyKindName(bd.kind)) + '</span>' +
            '<span class="sx-row-verse">' + (mp2 ? esc(tf(t('sx_moon_illum'), mp2.illuminationPct.toFixed(1))) : esc(bodyKindName(bd.kind))) + '</span>' +
            (rtsText(it) ? '<div class="sx-row-verse sk-rts">' + esc(rtsText(it)) + '</div>' : '') + '</div>' +
            '<div class="sx-row-side"><span class="sk-best">' + esc(t('sx2_best')) + ' ' + fmtTime(it.b.date) + '</span>' +
            '<span class="sx-row-n">' + txEsc(tf(t('sx2_alt'), it.b.alt.toFixed(0))) + '</span></div></div>';
          return;
        }
        var ast = it.ast, bs = ALLSTARS[ast.brightest];
        h += '<div class="sx-row" data-sx-detail="' + esc(ast.key) + '">' +
          '<div class="sx-row-main"><span class="sx-row-name">' + txEsc(ast.name) + '</span>' +
          '<span class="sx-row-verse">' + txEsc(ast.section) + ' · ' + txEsc(bs.cn) + ' ' +
          txEsc(tf(t('sx2_mag'), bs.mag.toFixed(1))) + ' · ' + txEsc(tf(t('sx2_stars_up'), it.up, ast.starsIdx.length)) + '</span>' +
          (rtsText(it) ? '<div class="sx-row-verse sk-rts">' + esc(rtsText(it)) + '</div>' : '') + '</div>' +
          '<div class="sx-row-side"><span class="sk-best">' + esc(t('sx2_best')) + ' ' + fmtTime(it.b.date) + '</span>' +
          '<span class="sx-row-n">' + txEsc(tf(t('sx2_alt'), it.b.alt.toFixed(0))) + '</span></div></div>';
      });
      h += '<div class="sx-caliber">' + esc(t('sx2_caliber_tonight')) + '<br>' +
        esc(T('时间线口径：升／中天／落以最亮定星（天体以本体）每 10 分钟采样、升落线性内插；月扰按中天时刻月距角与月照亮比分级。')) + '</div>';
      body.innerHTML = h;
    }).catch(function () { var b = $('sk-tonight-body'); if (b) b.innerHTML = failHTML(); });
  }

  /* 星图侧栏「今夜可见 · 摘要」（宽屏侧栏用；窄屏时位于控制区下方）：
   * 与今夜可见页同一份数据（computeTonightBest＋tonightList），取前 6。 */
  function renderSideTonight() {
    var host = $('sk-side-tonight'); if (!host || !XG || !SKY || !SKY.available) return;
    var res = computeTonightBest();
    var list = tonightList(res.best);
    list.sort(function (x, y) { return (y.b.alt - x.b.alt) || (ALLSTARS[x.ast.brightest].mag - ALLSTARS[y.ast.brightest].mag); });
    list = list.slice(0, 6);
    var h = '<div class="sk-side-h">' + esc(t('sx2_side_tonight')) + '</div>';
    if (!list.length) h += '<div class="sk-side-row none">' + esc(t('sx2_empty')) + '</div>';
    list.forEach(function (it) {
      h += '<div class="sk-side-row" data-sx-detail="' + esc(it.ast.key) + '"><span class="sk-side-name">' + txEsc(it.ast.name) + '</span>' +
        '<span class="sk-best">' + esc(t('sx2_best')) + ' ' + fmtTime(it.b.date) + '</span>' +
        '<span class="sx-row-n">' + txEsc(tf(t('sx2_alt'), it.b.alt.toFixed(0))) + '</span></div>';
    });
    host.innerHTML = h;
  }

  /* ---------------- 平面星图 ---------------- */
  var BASE_K = 186, CX = 200, CY = 200;
  function loadLinePrefs() {
    try {
      var v = JSON.parse(localStorage.getItem('wuri_sky_lines_v1') || 'null');
      if (v) return { ecl: !!v.ecl, equ: !!v.equ };
    } catch (e) {}
    return { ecl: true, equ: false };   /* 黄道默认开、天赤道默认关 */
  }
  function saveLinePrefs() {
    try { localStorage.setItem('wuri_sky_lines_v1', JSON.stringify(chart.lines)); } catch (e) {}
  }

  /* ---------------- 图层与标签档（v252 星空批 B 线④） ----------------
   * 标签密度三档与相机认星共用键 wuri_sky_label_mode_v1（sky-ar.js 同键
   * 同口径：smart 智能／all 全标／major 精简）：本页面板改档写回同键，
   * AR 侧下次打开生效；major 大星官表与 sky-ar.js MAJOR_LABELS 逐字一致。
   * 其余图层（连线/标签总开关/分野/网格/银河）存新键 wuri_sky_layers_v1；
   * 黄道/天赤道仍走既有 wuri_sky_lines_v1（chart.lines），面板只是其新入口，
   * 不另起第二套状态。 */
  var LABEL_KEY = 'wuri_sky_label_mode_v1';
  var LABEL_MODES = ['smart', 'all', 'major'];
  var MAJOR_LABELS = {};
  ['角', '亢', '氐', '房', '心', '尾', '箕', '斗', '牛', '女', '虚', '危', '室', '壁',
   '奎', '娄', '胃', '昴', '毕', '觜', '参', '井', '鬼', '柳', '星', '张', '翼', '轸',
   '紫微左垣', '紫微右垣', '太微左垣', '太微右垣', '天市左垣', '天市右垣']
    .forEach(function (n) { MAJOR_LABELS[n] = 1; });
  function loadLabelMode() {
    try { var v = localStorage.getItem(LABEL_KEY); if (LABEL_MODES.indexOf(v) >= 0) return v; } catch (e) {}
    return 'smart';
  }
  function saveLabelMode() {
    try { localStorage.setItem(LABEL_KEY, chart.labelMode); } catch (e) {}
  }
  var LAYERS_KEY = 'wuri_sky_layers_v1';
  function loadLayers() {
    try {
      var v = JSON.parse(localStorage.getItem(LAYERS_KEY) || 'null');
      if (v) return { lines: v.lines !== false, labelsOn: v.labelsOn !== false, fenye: !!v.fenye, grid: !!v.grid, milky: !!v.milky };
    } catch (e) {}
    return { lines: true, labelsOn: true, fenye: false, grid: false, milky: false };
  }
  function saveLayers() {
    try { localStorage.setItem(LAYERS_KEY, JSON.stringify(chart.layers)); } catch (e) {}
  }

  /* 分野层：fenye.json 十二次——与 today-sky.sunMansionOf 同一锚点法
   * （宿度位置↔黄经以中气定锚、分段线性），此处反解：次界宿度→黄经，
   * 界线即该黄经的子午大圆（黄经圈），次名标在次中点宿度对应黄经处。
   * 数据全出 fenye.json，不另造界线数据。 */
  var FENYE = null, fenyePromise = null, FENYE_ANCH = null;
  var MANSION_ORDER28 = ['角', '亢', '氐', '房', '心', '尾', '箕', '斗', '牛', '女', '虚', '危',
    '室', '壁', '奎', '娄', '胃', '昴', '毕', '觜', '参', '井', '鬼', '柳', '星', '张', '翼', '轸'];
  var ZHONGQI_LON12 = { '冬至': 270, '大寒': 300, '雨水': 330, '春分': 0, '谷雨': 30, '小满': 60,
    '夏至': 90, '大暑': 120, '处暑': 150, '秋分': 180, '霜降': 210, '小雪': 240 };
  function loadFenye() {
    if (FENYE) return Promise.resolve(FENYE);
    if (fenyePromise) return fenyePromise;
    fenyePromise = SKY.loadJSON('data/fenye.json').then(function (fy) {
      FENYE = fy; FENYE_ANCH = buildFenyeAnchors(fy); return fy;
    }).catch(function () { fenyePromise = null; return null; });
    return fenyePromise;
  }
  function buildFenyeAnchors(fy) {
    if (!fy || !fy.mansions || !fy.shierci) return null;
    var width = {}, cum = {}, acc = 0;
    fy.mansions.forEach(function (m) { width[m.mansion.replace(/宿$/, '')] = m.width_degrees; });
    MANSION_ORDER28.forEach(function (n) { cum[n] = acc; acc += width[n] || 0; });
    var total = acc; if (!total) return null;
    function ptPos(p) { return cum[p.mansion.replace(/宿$/, '')] + p.degree; }
    var raw = [];
    fy.shierci.forEach(function (c) {
      var mid = ZHONGQI_LON12[c.span_mid.solar_term]; if (typeof mid !== 'number') return;
      raw.push([((mid - 15) % 360 + 360) % 360, ptPos(c.span_start)]);
      raw.push([mid, ptPos(c.span_mid)]);
      raw.push([((mid + 15) % 360 + 360) % 360, ptPos(c.span_end)]);
    });
    if (raw.length < 12) return null;
    raw.sort(function (a, b) { return a[0] - b[0]; });
    var anchors = [], lastPos = -Infinity;
    raw.forEach(function (p) {
      var pos = p[1];
      while (pos < lastPos - 1e-9) pos += total;
      if (anchors.length && Math.abs(anchors[anchors.length - 1][0] - p[0]) < 1e-9) return;
      anchors.push([p[0], pos]); lastPos = pos;
    });
    return { anchors: anchors, total: total, ptPos: ptPos };
  }
  function lonOfPos(pos) {
    var A2 = FENYE_ANCH; if (!A2) return null;
    var anchors = A2.anchors, total = A2.total, base = anchors[0][1];
    var ext = anchors.concat(anchors.map(function (p) { return [p[0] + 360, p[1] + total]; }));
    var p0 = ((pos % total) + total) % total;
    while (p0 < base) p0 += total;
    while (p0 >= base + total) p0 -= total;
    for (var i = 0; i + 1 < ext.length; i++) {
      if (p0 >= ext[i][1] && p0 <= ext[i + 1][1]) {
        var span = ext[i + 1][1] - ext[i][1];
        var lon = ext[i][0] + (span > 0 ? (ext[i + 1][0] - ext[i][0]) * (p0 - ext[i][1]) / span : 0);
        return ((lon % 360) + 360) % 360;
      }
    }
    return null;
  }
  /* 黄道坐标 (λ, β) → 当日期分点投影入参 [−RA, Dec] */
  function eclToEqdPt(date, lam, beta) {
    var lr = lam * D2R, br = beta * D2R, er = OBL * D2R;
    var dec = Math.asin(Math.sin(br) * Math.cos(er) + Math.cos(br) * Math.sin(er) * Math.sin(lr)) / D2R;
    var ra = Math.atan2(Math.sin(lr) * Math.cos(er) - Math.tan(br) * Math.sin(er), Math.cos(lr)) / D2R;
    var e = SKY.eqdOf(date, ((ra % 360) + 360) % 360, dec);
    return [-e[0], e[1]];
  }
  /* 银河层（示意）：无实测亮度轮廓数据，不编造——只绘银道面本身：
   * 银河赤道由 IAU 定义的银北极（J2000 RA 192.859508°、Dec +27.128336°）
   * 决定，用通行银道→赤道旋转矩阵（J2000）逐点换算，带宽 ±12° 作示意带，
   * UI 与回执均注明「示意」。 */
  var GAL_R = [[-0.0548755604, -0.8734370902, -0.4838350155],
               [0.4941094279, -0.4448296300, 0.7469822445],
               [-0.8676661490, -0.1980763734, 0.4559837762]];
  function galToEqd(date, l, b) {
    var lr = l * D2R, br = b * D2R;
    var x = Math.cos(br) * Math.cos(lr), y = Math.cos(br) * Math.sin(lr), z = Math.sin(br);
    var ex = GAL_R[0][0] * x + GAL_R[0][1] * y + GAL_R[0][2] * z;
    var ey = GAL_R[1][0] * x + GAL_R[1][1] * y + GAL_R[1][2] * z;
    var ez = GAL_R[2][0] * x + GAL_R[2][1] * y + GAL_R[2][2] * z;
    var ra = ((Math.atan2(ey, ex) / D2R) % 360 + 360) % 360;
    var dec = Math.asin(Math.max(-1, Math.min(1, ez))) / D2R;
    var e = SKY.eqdOf(date, ra, dec);
    return [-e[0], e[1]];
  }
  function fmtDateMD(d) { return (d.getMonth() + 1) + '月' + d.getDate() + '日'; }

  var chart = { spin: 0, zoom: 1, offsetMin: 0, labels: [], uprights: [], drawn: false,
    focus: null, focusBody: null, focusStar: null, focusName: '', infoKey: null, infoBody: null, bodies: [], sensor: false, lastPr: null,
    play: { on: false, speed: 300, raf: 0, lastTs: 0, drawAt: 0 },
    lines: loadLinePrefs(), labelMode: loadLabelMode(), layers: loadLayers(),
    pan: null, curRot: null, settled: true };
  var chartEls = null;

  function openChart() { if (!skyGate()) return; show('view-sky-chart'); renderChartView(); }

  /* 布局（v2.1.0 (2) 平板适配）：.sk-main 星盘主体＋.sk-side 侧栏；
   * 窄屏单列（星盘在前、控制在后），≥768px 并排（CSS 媒体查询切换）。
   * 侧栏汇：观测地、搜索定位、播放/时间、最暗星等、黄道/赤道/跟随开关、
   * 点选信息条、今夜可见摘要、口径注。SVG 为矢量渲染，任意尺寸不糊，
   * 等效于 canvas 的 DPR 高清出图（且缩放不重绘位图）。 */
  /* 图层面板（④）：连线／星名（含与 AR 共用三档）／黄道·天赤道（既有
   * lines 状态）／分野／银河（示意）／网格，各自独立开关、即时重绘 */
  function layerPanelHTML() {
    var L = chart.layers;
    function tg(id, on, label) {
      return '<button class="mini-btn tiny' + (on ? ' on' : '') + '" data-ly="' + id + '">' + label + '</button>';
    }
    function lmBtn(m) {
      return '<button class="mini-btn tiny' + (chart.labelMode === m ? ' on' : '') + '" data-lmode="' + m + '">' + esc(t('sx2_ar_label_' + m)) + '</button>';
    }
    return '<div class="sk-layers" id="sk-layers" hidden>' +
      '<div class="sk-layer-row"><span class="sk-ctl-lab">' + esc(T('连线')) + '</span>' + tg('lines', L.lines, esc(T('连线'))) + '</div>' +
      '<div class="sk-layer-row"><span class="sk-ctl-lab">' + esc(T('星名')) + '</span>' + tg('labelsOn', L.labelsOn, esc(T('星名'))) +
      lmBtn('smart') + lmBtn('all') + lmBtn('major') + '</div>' +
      '<div class="sk-layer-row"><span class="sk-ctl-lab">' + esc(T('参考线')) + '</span>' +
      tg('ecl', chart.lines.ecl, esc(t('sx2_ecliptic'))) + tg('equ', chart.lines.equ, esc(t('sx2_equator'))) + '</div>' +
      '<div class="sk-layer-row"><span class="sk-ctl-lab">' + esc(t('sx_fenye')) + '</span>' + tg('fenye', L.fenye, esc(t('sx_fenye'))) + '</div>' +
      '<div class="sk-layer-row"><span class="sk-ctl-lab">' + esc(T('银河')) + '</span>' + tg('milky', L.milky, esc(T('银河（示意）'))) + '</div>' +
      '<div class="sk-layer-row"><span class="sk-ctl-lab">' + esc(T('网格')) + '</span>' + tg('grid', L.grid, esc(T('网格'))) + '</div>' +
      '<div class="sk-layer-note">' + esc(T('银河按银道面绘示意带，非实测轮廓；星名密度与相机认星共用一档（wuri_sky_label_mode_v1）。')) + '</div></div>';
  }

  function chartSkeleton() {
    var pl = chart.play;
    return '<div class="sk-layout"><div class="sk-main">' +
      '<div class="sk-chart-wrap"><svg id="sk-chart-svg" viewBox="0 0 400 400" role="img" aria-label="' + esc(t('sx2_chart')) + '">' +
      '<g id="sk-chart-g"></g></svg></div>' +
      '<div class="sk-hint">' + esc(t('sx2_chart_hint')) + '</div></div>' +
      '<aside class="sk-side">' + locBarHTML() +
      '<div class="sk-search" style="position:relative"><input class="sk-in" id="sk-q" type="search" placeholder="' + esc(t('sx2_search_ph')) + '">' +
      '<button class="mini-btn tiny" id="sk-go">' + esc(t('sx2_locate')) + '</button>' +
      '<span class="sk-q-note" id="sk-q-note"></span>' +
      '<div class="sk-q-results" id="sk-q-results" hidden style="position:absolute;left:0;right:0;top:100%;z-index:30;background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden"></div></div>' +
      '<div class="sk-focusbar" id="sk-focusbar"' + ((chart.focus || chart.focusBody || chart.focusStar != null) ? '' : ' hidden') + '><span class="sk-focus-lab">' + esc(t('sx2_locate')) + '：<b id="sk-focus-name">' + esc(T(chart.focusName || '')) + '</b></span>' +
      '<button class="mini-btn tiny" id="sk-unfocus">' + esc(t('sx2_back_zenith')) + '</button></div>' +
      '<div class="sk-controls"><button class="mini-btn tiny" id="sk-play">' + esc(t(pl.on ? 'sx2_pause' : 'sx2_play')) + '</button>' +
      '<select class="sk-in sk-sel" id="sk-speed">' +
      '<option value="1"' + (pl.speed === 1 ? ' selected' : '') + '>1×</option>' +
      '<option value="60"' + (pl.speed === 60 ? ' selected' : '') + '>60×</option>' +
      '<option value="300"' + (pl.speed === 300 ? ' selected' : '') + '>300×</option>' +
      '<option value="900"' + (pl.speed === 900 ? ' selected' : '') + '>900×</option>' +
      '<option value="3600"' + (pl.speed === 3600 ? ' selected' : '') + '>3600×</option></select>' +
      '<input type="range" id="sk-time" min="-720" max="720" step="5" value="' + Math.max(-720, Math.min(720, chart.offsetMin)) + '">' +
      '<span id="sk-time-lab"></span></div>' +
      '<div class="sk-controls sk-timestep" id="sk-timestep">' +
      '<button class="mini-btn tiny" data-step="-1440">' + esc(T('−1日')) + '</button>' +
      '<button class="mini-btn tiny" data-step="-60">' + esc(T('−1时')) + '</button>' +
      '<button class="mini-btn tiny" id="sk-now">' + esc(t('sx2_now')) + '</button>' +
      '<button class="mini-btn tiny" data-step="60">' + esc(T('+1时')) + '</button>' +
      '<button class="mini-btn tiny" data-step="1440">' + esc(T('+1日')) + '</button>' +
      '<span id="sk-date-lab"></span></div>' +
      '<div class="sk-controls"><span class="sk-ctl-lab">' + esc(t('sx2_maglim')) + '</span>' +
      '<input type="range" id="sk-mag" min="3" max="6" step="1" value="' + (SKY && SKY.magLim ? SKY.magLim() : 6) + '">' +
      '<span id="sk-mag-lab"></span></div>' +
      '<div class="sk-controls sk-toggles">' +
      '<button class="mini-btn tiny" id="sk-tg-layers">' + esc(T('图层')) + '</button>' +
      '<button class="mini-btn tiny' + (chart.sensor ? ' on' : '') + '" id="sk-tg-sensor">' + esc(t('sx2_sensor')) + '</button></div>' +
      layerPanelHTML() +
      '<div class="sk-infobar" id="sk-info" hidden><div class="sk-info-main">' +
      '<span class="sk-info-name" id="sk-info-name"></span><span class="sk-info-data" id="sk-info-data"></span></div>' +
      '<button class="mini-btn tiny" id="sk-info-detail">' + esc(t('sx2_detail')) + '</button>' +
      '<button class="mini-btn tiny" id="sk-info-close">✕</button></div>' +
      '<div class="sk-side-tonight" id="sk-side-tonight"></div>' +
      '<div class="sx-caliber">' + esc(t('sx2_caliber_chart')) + '</div>' +
      '</aside></div>';
  }

  function renderChartView() {
    var host = $('sx-chart'); if (!host) return;
    if (!SKY || !SKY.available || !window.d3) { host.innerHTML = failHTML(); return; }
    chart.infoKey = null;
    host.innerHTML = chartSkeleton();
    bindLocBar(host, renderChartView);
    chartEls = { svg: $('sk-chart-svg'), g: $('sk-chart-g'), time: $('sk-time'), lab: $('sk-time-lab'), dateLab: $('sk-date-lab') };
    bindChartEvents();
    var ml = $('sk-mag-lab'); if (ml) ml.textContent = (SKY.magLim ? SKY.magLim() : 6) + ' ' + t('sx2_mag_unit');
    loadData().then(function () { drawChart(); renderSideTonight(); })
      .catch(function () { host.innerHTML = failHTML(); });
    if (chart.layers.fenye) loadFenye().then(function () { drawChart(); });
  }

  function chartDate() { return new Date(Date.now() + chart.offsetMin * 60000); }

  function applyTransform() {
    if (!chartEls) return;
    chartEls.g.setAttribute('transform',
      'translate(' + CX + ' ' + CY + ') rotate(' + chart.spin.toFixed(1) + ') scale(' + chart.zoom + ') translate(' + (-CX) + ' ' + (-CY) + ')');
    /* 标签恒正立（v2.1.0 (2) 追加，真机反馈旋转后标签倒置侧躺）：
     * chart.uprights 登记全部须正立的文字（星官名＋黄道/赤道/太阳标），
     * 逐个绕自身锚点反向旋转 −spin 抵消组自旋——图转字不转；锚点位置
     * 仍由组变换带着走（跟随其星官/线位的新位置）。 */
    chart.uprights.forEach(function (u) {
      if (u.el) u.el.setAttribute('transform', 'rotate(' + (-chart.spin).toFixed(1) + ' ' + u.lx.toFixed(1) + ' ' + u.ly.toFixed(1) + ')');
    });
  }

  function starR(m) { return m <= 1 ? 3.2 : m <= 2 ? 2.6 : m <= 3 ? 2.0 : m <= 4 ? 1.55 : m <= 5 ? 1.2 : m <= 6 ? 0.95 : 0.8; }

  var OBL = 23.439281;   /* 黄赤交角（度） */
  function eclipticCoords(date) {
    var pts = [];
    for (var lam = 0; lam <= 360; lam += 6) {
      var lr = lam * D2R;
      var ra = Math.atan2(Math.cos(OBL * D2R) * Math.sin(lr), Math.cos(lr)) / D2R;
      var dec = Math.asin(Math.sin(OBL * D2R) * Math.sin(lr)) / D2R;
      var e = SKY.eqdOf(date, (ra + 360) % 360, dec);   /* eqdOf 返回 [ra, dec] 数组 */
      pts.push([-e[0], e[1]]);
    }
    return pts;
  }
  function equatorCoords(date) {
    var pts = [];
    for (var ra = 0; ra <= 360; ra += 6) { var e = SKY.eqdOf(date, ra % 360, 0); pts.push([-e[0], e[1]]); }
    return pts;
  }

  function drawChart() {
    if (!chartEls || !XG) return;
    var date = chartDate();
    var pr = SKY.projectAll(date, obsState, ALLSTARS);
    if (!pr) return;
    chart.lastPr = pr;
    var d3 = window.d3;
    /* 聚焦模式（搜索定位）：投影中心移至目标星官最亮星，盘面随之居中；
     * 高度圈/方位标是天顶系量，聚焦时不绘；可见性改按与聚焦中心角距判。 */
    var foc = null;
    if (chart.focus) {
      ASTS.forEach(function (a) { if (a.key === chart.focus && a.brightest >= 0) foc = { ast: a, ra: pr[a.brightest].raEqd, dec: pr[a.brightest].decEqd }; });
      if (!foc) chart.focus = null;
    } else if (chart.focusStar != null && pr[chart.focusStar]) {
      foc = { ra: pr[chart.focusStar].raEqd, dec: pr[chart.focusStar].decEqd, star: chart.focusStar };
    } else if (chart.focusBody) {
      var fbp = SKY.bodyPos ? SKY.bodyPos(date, obsState, chart.focusBody) : null;
      if (fbp) foc = { ra: fbp.ra, dec: fbp.dec, bodyId: chart.focusBody };
      else chart.focusBody = null;
    }
    /* 视图平移（②搜星定位）：旋转参数在「当前位↔目标位」间 ease 插值，
     * 两端点即原天顶式/聚焦式旋转参数本身，落点与旧口径逐位一致 */
    var rotT = foc ? [foc.ra, -foc.dec] : [SKY.lstDeg(date, obsState), obsState.lat - 90];
    if (chart.pan) {
      if (!chart.pan.to) chart.pan.to = rotT;
      var pk = Math.min(1, (Date.now() - chart.pan.t0) / chart.pan.dur);
      var pe = pk < 0.5 ? 2 * pk * pk : 1 - Math.pow(-2 * pk + 2, 2) / 2;
      var dlam = chart.pan.to[0] - chart.pan.from[0];
      while (dlam > 180) dlam -= 360;
      while (dlam < -180) dlam += 360;
      rotT = [chart.pan.from[0] + dlam * pe, chart.pan.from[1] + (chart.pan.to[1] - chart.pan.from[1]) * pe];
    }
    chart.curRot = rotT;
    var proj = d3.geoStereographic().rotate([rotT[0], rotT[1], 0]).scale(BASE_K).translate([CX, CY]).clipAngle(90);
    var path = d3.geoPath(proj);
    function angToFoc(p) {
      var s = Math.sin(p.decEqd * D2R) * Math.sin(foc.dec * D2R) +
        Math.cos(p.decEqd * D2R) * Math.cos(foc.dec * D2R) * Math.cos((p.raEqd - foc.ra) * D2R);
      return Math.acos(Math.max(-1, Math.min(1, s))) / D2R;
    }
    function visStar(p) { return foc ? angToFoc(p) < 88 : p.alt > -0.3; }
    function visLine(p) { return foc ? angToFoc(p) < 88 : p.alt > -2; }
    function visCent(p) { return foc ? angToFoc(p) < 88 : p.alt > 0; }
    /* 显示标定（平板适配）：以 SVG 实际显示宽与 viewBox(400) 之比为准——
     * 屏幕字号目标：手机 8.5px、大屏（比 ≥1.45）11.5px；分级星等上限
     * 大屏放宽（0 级 3.6 / 1 级 5.2 / 2 级 6.0），仍受「最暗星等」总闸约束。 */
    var rectW = chartEls.svg.getBoundingClientRect().width || 400;
    var dispScale = rectW / 400, wide = dispScale >= 1.45;
    var fontU = (wide ? 11.5 : 8.5) / (dispScale * chart.zoom);
    var tier = chart.zoom >= 2.4 ? 2 : chart.zoom >= 1.6 ? 1 : 0;
    var magCap = tier === 0 ? (wide ? 3.6 : 2.5) : tier === 1 ? (wide ? 5.2 : 4.6) : (wide ? 6.0 : 5.6);
    var lim = SKY.magLim ? SKY.magLim() : 6;
    magCap = Math.min(magCap, lim);
    var limStar = lim + 0.5;
    var deferredUp = [];   /* 线标/太阳标文字：{str, lx, ly}，标签段之后统一入图 */
    function upText(cls, x, y, str) {
      return '<text class="sk-label sk-up ' + cls + '" style="font-size:' + fontU.toFixed(2) + 'px" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '">' + esc(str) + '</text>';
    }
    function lineLabelAnchor(pts) {
      var bestA = null;
      pts.forEach(function (c) {
        var xy = proj(c); if (!xy) return;
        var dd = Math.hypot(xy[0] - CX, xy[1] - CY);
        if (dd < BASE_K - 20 && Math.abs(xy[0] - CX) < BASE_K - 36) { if (!bestA || xy[1] < bestA[1]) bestA = xy; }
      });
      return bestA;
    }
    var P = [];
    P.push('<circle class="sk-disc" cx="' + CX + '" cy="' + CY + '" r="' + BASE_K + '"/>');
    if (!foc) [60, 30].forEach(function (alt) {
      P.push('<circle class="sk-ring" cx="' + CX + '" cy="' + CY + '" r="' + (BASE_K * Math.tan((90 - alt) / 2 * D2R)).toFixed(1) + '"/>');
    });
    /* 网格层（④）：赤经圈每 30°＋赤纬圈 −60°…+60° 每 30°（当日期分点） */
    if (chart.layers.grid) {
      var gLines = [], gra, gd;
      for (gra = 0; gra < 360; gra += 30) {
        var gl1 = [];
        for (gd = -75; gd <= 75; gd += 5) { var ge1 = SKY.eqdOf(date, gra, gd); gl1.push([-ge1[0], ge1[1]]); }
        gLines.push(gl1);
      }
      [-60, -30, 0, 30, 60].forEach(function (gdec) {
        var gl2 = [];
        for (var ga = 0; ga <= 360; ga += 6) { var ge2 = SKY.eqdOf(date, ga % 360, gdec); gl2.push([-ge2[0], ge2[1]]); }
        gLines.push(gl2);
      });
      var gdd = path({ type: 'MultiLineString', coordinates: gLines });
      if (gdd) P.push('<path class="sk-grid" style="fill:none;stroke:var(--line);stroke-width:.55;opacity:.45" d="' + gdd + '"/>');
    }
    /* 银河层（④，示意）：银道面 ±12° 柔光带＋银道虚线，定义见 galToEqd 注；
     * 光斑须裁在盘内（与月亮同法 clipPath，单图面单 id 安全） */
    if (chart.layers.milky) {
      var mwR = BASE_K * Math.tan(14 * D2R / 2);   /* 盘心处约 ±14° 角半径，相邻 6° 间距圆相叠成带 */
      var mwCenters = [], mwLine = [], mwBlobs = '';
      for (var ml2 = 0; ml2 < 360; ml2 += 6) {
        var mc = galToEqd(date, ml2, 0), mxy = proj(mc);
        if (mxy && Math.hypot(mxy[0] - CX, mxy[1] - CY) < BASE_K + 30) {
          mwCenters.push(mxy);
          mwBlobs += '<circle class="sk-milky-blob" cx="' + mxy[0].toFixed(1) + '" cy="' + mxy[1].toFixed(1) + '" r="' + mwR.toFixed(1) + '" style="fill:var(--gold);opacity:.05"/>';
        }
        if (ml2 % 3 === 0) mwLine.push(mc);
      }
      if (mwBlobs) P.push('<clipPath id="sk-discclip"><circle cx="' + CX + '" cy="' + CY + '" r="' + BASE_K + '"/></clipPath><g clip-path="url(#sk-discclip)">' + mwBlobs + '</g>');
      var mwd = path({ type: 'LineString', coordinates: mwLine });
      if (mwd) P.push('<path class="sk-milky-line" style="fill:none;stroke:var(--gold);stroke-width:.8;stroke-dasharray:2 5;opacity:.5" d="' + mwd + '"/>');
      var mwLab = null;
      mwCenters.forEach(function (xy) { if (Math.hypot(xy[0] - CX, xy[1] - CY) < BASE_K - 34 && (!mwLab || xy[1] < mwLab[1])) mwLab = xy; });
      if (mwLab) deferredUp.push({ str: upText('sk-milkylabel', mwLab[0], mwLab[1], T('银河（示意）')), lx: mwLab[0], ly: mwLab[1] });
    }
    /* 连线层（图式连线；存疑官虚线） */
    if (chart.layers.lines) ASTS.forEach(function (ast) {
      if (!ast.edges.length) return;
      var any = false;
      for (var i = 0; i < ast.starsIdx.length; i++) if (visLine(pr[ast.starsIdx[i]])) { any = true; break; }
      if (!any) return;
      var coords = ast.edges.map(function (e) {
        return [[-pr[e[0]].raEqd, pr[e[0]].decEqd], [-pr[e[1]].raEqd, pr[e[1]].decEqd]];
      });
      var d = path({ type: 'MultiLineString', coordinates: coords });
      if (d) P.push('<path class="sk-line' + (ast.doubtful ? ' doubtful' : '') + '" d="' + d + '"/>');
    });
    /* 星点层（星等上限从「最暗星等」设定：lim+0.5） */
    for (var i = 0; i < ALLSTARS.length; i++) {
      var st = ALLSTARS[i], p = pr[i];
      if (!visStar(p) || st.mag > limStar) continue;
      var xy = proj([-p.raEqd, p.decEqd]); if (!xy) continue;
      P.push('<circle class="sk-star" cx="' + xy[0].toFixed(1) + '" cy="' + xy[1].toFixed(1) + '" r="' + starR(st.mag) +
        '" fill-opacity="' + (st.mag <= 3 ? 0.95 : st.mag <= 5 ? 0.8 : 0.6) + '"/>');
    }
    /* 黄道 / 天赤道 / 太阳位置（引擎同源推算；线标文字恒正立、随 deferredUp 登记） */
    if (chart.lines.ecl) {
      var epts = eclipticCoords(date);
      var ed = path({ type: 'LineString', coordinates: epts });
      if (ed) {
        P.push('<path class="sk-ecliptic" d="' + ed + '"/>');
        var ea = lineLabelAnchor(epts);
        if (ea) deferredUp.push({ str: upText('sk-linelabel', ea[0], ea[1], t('sx2_ecliptic')), lx: ea[0], ly: ea[1] });
      }
    }
    if (chart.lines.equ) {
      var qpts = equatorCoords(date);
      var qd = path({ type: 'LineString', coordinates: qpts });
      if (qd) {
        P.push('<path class="sk-eqline" d="' + qd + '"/>');
        var qa = lineLabelAnchor(qpts);
        if (qa) deferredUp.push({ str: upText('sk-linelabel', qa[0], qa[1], t('sx2_equator')), lx: qa[0], ly: qa[1] });
      }
    }
    /* 分野层（④）：十二次界＝次界黄经圈（反解锚点，见 lonOfPos），
     * 次名＋国分野标在次中点黄经、黄纬 +14° 处 */
    if (chart.layers.fenye && FENYE && FENYE_ANCH) {
      FENYE.shierci.forEach(function (c) {
        var lon = lonOfPos(FENYE_ANCH.ptPos(c.span_start));
        if (lon != null) {
          var fpts = [];
          for (var fb2 = -78; fb2 <= 78; fb2 += 6) fpts.push(eclToEqdPt(date, lon, fb2));
          var fd = path({ type: 'LineString', coordinates: fpts });
          if (fd) P.push('<path class="sk-fenye" style="fill:none;stroke:var(--line);stroke-width:.7;stroke-dasharray:1.5 4;opacity:.8" d="' + fd + '"/>');
        }
        var midLon = lonOfPos(FENYE_ANCH.ptPos(c.span_mid));
        if (midLon != null) {
          var mpt = eclToEqdPt(date, midLon, 14), mxy2 = proj(mpt);
          if (mxy2 && Math.hypot(mxy2[0] - CX, mxy2[1] - CY) < BASE_K - 26) {
            deferredUp.push({ str: upText('sk-fenyelabel', mxy2[0], mxy2[1], c.name + '·' + (c.guo || []).join('、')), lx: mxy2[0], ly: mxy2[1] });
          }
        }
      });
    }
    var se = SKY.sunEqd ? SKY.sunEqd(date) : null;
    if (se) {
      var sxy = proj([-se.ra, se.dec]);
      if (sxy && Math.hypot(sxy[0] - CX, sxy[1] - CY) < BASE_K - 6) {
        P.push('<circle class="sk-sun" cx="' + sxy[0].toFixed(1) + '" cy="' + sxy[1].toFixed(1) + '" r="4"/>');
        deferredUp.push({ str: upText('sk-sunlabel', sxy[0], sxy[1] - 10, t('sx2_sun')), lx: sxy[0], ly: sxy[1] - 10 });
      }
    }
    /* 月亮/行星（v2.1.1）：与恒星分开画——月亮是带月相的盘面（亮盘＋暗盘
     * 偏移的影圆模型，偏移量 2r·照亮比、方向背阳），行星是带本色圆点；
     * 名称标签优先级最高：不受分级星等约束、恒显，登记在正立表最后
     * （＝压在所有星官标签之上）。可见性与星点同口径（聚焦按角距）。 */
    chart.bodies = [];
    var bodyUps = [];
    if (SKY.bodyPos) SKY.BODIES.forEach(function (bd) {
      var bp2 = SKY.bodyPos(date, obsState, bd.id); if (!bp2) return;
      var visB = foc ? angToFoc({ raEqd: bp2.ra, decEqd: bp2.dec }) < 88 : bp2.alt > -0.3;
      if (!visB) return;
      var xy = proj([-bp2.ra, bp2.dec]); if (!xy) return;
      var entry = { id: bd.id, kind: bd.kind, x: xy[0], y: xy[1], alt: bp2.alt, az: bp2.az, ra: bp2.ra, dec: bp2.dec };
      if (bd.kind === 'moon') {
        var mp = moonIllum(date);
        entry.illum = mp ? mp.illumination : null;
        entry.waxing = mp ? mp.elongationDeg < 180 : true;
        var rM = 6.4, il = entry.illum == null ? 0.5 : entry.illum;
        var sdx = entry.waxing ? 1 : -1, sdy = 0;
        if (se) {
          var sp2 = proj([-se.ra, se.dec]);
          if (sp2) { var vx = sp2[0] - xy[0], vy = sp2[1] - xy[1], vl = Math.hypot(vx, vy); if (vl > 1) { sdx = vx / vl; sdy = vy / vl; } }
        }
        var shx = xy[0] - sdx * 2 * rM * il, shy = xy[1] - sdy * 2 * rM * il;
        /* 暗盘必须裁剪在亮盘内：不裁剪时近望月（偏移≈2r）会在月旁画出一
         * 个独立暗圆（实测截图教训）；clipPath 随 innerHTML 每帧重建、单月亮单 id 安全 */
        P.push('<clipPath id="sk-moonclip"><circle cx="' + xy[0].toFixed(1) + '" cy="' + xy[1].toFixed(1) + '" r="' + rM + '"/></clipPath>' +
          '<g clip-path="url(#sk-moonclip)"><circle class="sk-moon-disc" cx="' + xy[0].toFixed(1) + '" cy="' + xy[1].toFixed(1) + '" r="' + rM + '"/>' +
          '<circle class="sk-moon-shade" cx="' + shx.toFixed(1) + '" cy="' + shy.toFixed(1) + '" r="' + rM + '"/></g>' +
          '<circle class="sk-moon-rim" cx="' + xy[0].toFixed(1) + '" cy="' + xy[1].toFixed(1) + '" r="' + rM + '"/>');
      } else {
        P.push('<circle class="sk-planet" cx="' + xy[0].toFixed(1) + '" cy="' + xy[1].toFixed(1) + '" r="3.4" fill="' + bd.color + '"/>');
      }
      chart.bodies.push(entry);
      bodyUps.push({ str: upText('sk-bodylabel', xy[0], xy[1] - 13, bodyName(bd.id)), lx: xy[0], ly: xy[1] - 13 });
    });
    /* 方位标（随图面同组旋转；聚焦模式不绘） */
    if (!foc) {
      var cards = [[0, '北'], [45, '东北'], [90, '东'], [135, '东南'], [180, '南'], [225, '西南'], [270, '西'], [315, '西北']];
      cards.forEach(function (c) {
        var eq = SKY.eqdFromAltAz(date, obsState, 0, c[0]);
        var xy = proj([-eq.ra, eq.dec]); if (!xy) return;
        var dx = xy[0] - CX, dy = xy[1] - CY, len = Math.hypot(dx, dy) || 1;
        P.push('<text class="sk-cardinal' + (c[0] % 90 ? ' minor' : '') + '" x="' + (CX + dx / len * (BASE_K - 15)).toFixed(1) +
          '" y="' + (CY + dy / len * (BASE_K - 15)).toFixed(1) + '">' + esc(T(c[1])) + '</text>');
      });
    }
    /* 星官名标签＋点选点位。
     * 标签规矩（v2.1.0 (2)，两轮真机反馈后定）：
     *   ① 不挡星：字号按显示标定（见 drawChart 首段：手机屏 8.5px /
     *      大屏 11.5px，均除以 dispScale×zoom 得本地字号，屏幕字号恒定）、
     *      透明度 .85；锚点离开星点——以最亮定星为基点、沿「形心→最亮星」
     *      方向外推（半文宽＋6），不压本官最亮星（冒烟以距离断言）。
     *   ② 分级显示（普通模式仍须最亮星高度 >2°）：0 级（zoom<1.6）只显
     *      主要星官＝二十八宿本宿星官（名＋「宿」＝段名者）或最亮定星
     *      ≤2.5 等（大屏 ≤3.6 等）；1 级 ≤4.6（大屏 5.2）；2 级 ≤5.6
     *      （大屏 6.0）；各级再受「最暗星等」总闸约束。本宿星官各级都显。
     *   ③ 恒正立：文字登记入 chart.uprights，applyTransform 逐个反向旋转。
     *   聚焦模式：可见性按与聚焦中心角距 <88°（目标即使已落下也居中高亮）。 */
    var pBeforeLabels = P.length;
    chart.labels = [];
    ASTS.forEach(function (ast) {
      if (ast.brightest < 0) return;
      var bp = pr[ast.brightest], bm = ALLSTARS[ast.brightest].mag;
      var bxy = proj([-bp.raEqd, bp.decEqd]); if (!bxy) return;
      var pts = [];
      ast.starsIdx.forEach(function (gi) {
        var p = pr[gi]; if (!visCent(p)) return;
        var xy = proj([-p.raEqd, p.decEqd]); if (xy) pts.push(xy);
      });
      var n = pts.length, sx = 0, sy = 0;
      pts.forEach(function (xy) { sx += xy[0]; sy += xy[1]; });
      var cxp = n ? sx / n : bxy[0], cyp = n ? sy / n : bxy[1];
      var rmax = 0;
      pts.forEach(function (xy) { var dd = Math.hypot(xy[0] - cxp, xy[1] - cyp); if (dd > rmax) rmax = dd; });
      var isHost = (ast.name + '宿') === ast.section;
      /* 标签层（④）：总开关＋与 AR 共用三档——smart＝现行分级口径；
       * all＝可见星官全标（不受星等分级）；major＝只标 MAJOR_LABELS 大星官 */
      var visL = foc ? angToFoc(bp) < 88 : bp.alt > 2;
      var showLabel;
      if (!chart.layers.labelsOn || n === 0 || !visL) showLabel = false;
      else if (chart.labelMode === 'all') showLabel = true;
      else if (chart.labelMode === 'major') showLabel = !!MAJOR_LABELS[ast.name];
      else showLabel = isHost || bm <= magCap;
      var halfW = ast.name.length * fontU * chart.zoom * 0.54;
      var dx = bxy[0] - cxp, dy = bxy[1] - cyp, dl = Math.hypot(dx, dy);
      var ox = dl > 0.5 ? dx / dl : 0, oy = dl > 0.5 ? dy / dl : -1;
      var lx = bxy[0] + ox * (halfW + 6), ly = bxy[1] + oy * (halfW + 6);
      chart.labels.push({ key: ast.key, x: bxy[0], y: bxy[1], cx: cxp, cy: cyp, lx: lx, ly: ly, rmax: rmax, shown: showLabel, halfW: halfW, el: null });
      if (showLabel) P.push('<text class="sk-label sk-up" style="font-size:' + fontU.toFixed(2) + 'px" x="' + lx.toFixed(1) + '" y="' + ly.toFixed(1) + '">' + esc(T(ast.name)) + '</text>');
    });
    /* 聚焦高亮圈（脉冲描边，CSS .sk-hl；插在标签层之下、星线层之上） */
    if (foc && foc.ast) {
      for (var hi = 0; hi < chart.labels.length; hi++) {
        var HL = chart.labels[hi];
        if (HL.key === foc.ast.key) {
          P.splice(pBeforeLabels, 0, '<circle class="sk-hl" cx="' + HL.cx.toFixed(1) + '" cy="' + HL.cy.toFixed(1) + '" r="' + Math.max(15, (HL.rmax || 10) + 9).toFixed(1) + '"/>');
          break;
        }
      }
    }
    /* 定位标记（②）：平移途中脉冲圈随目标滑动指引；落定后换定标
     * （圈＋四短刻，恒在目标投影点，即盘心） */
    if (foc) {
      var txy = proj([-foc.ra, foc.dec]);
      if (txy) {
        if (chart.pan) {
          P.push('<circle class="sk-hl" cx="' + txy[0].toFixed(1) + '" cy="' + txy[1].toFixed(1) + '" r="13"/>');
        } else if (chart.settled) {
          var mx = txy[0], my = txy[1], mr = 11;
          var f1 = function (v) { return v.toFixed(1); };
          P.push('<g class="sk-locate-mark" style="stroke:var(--gold);fill:none;stroke-width:1.4">' +
            '<circle cx="' + f1(mx) + '" cy="' + f1(my) + '" r="' + mr + '"/>' +
            '<path d="M' + f1(mx - mr - 5) + ' ' + f1(my) + ' h6 M' + f1(mx + mr - 1) + ' ' + f1(my) + ' h6 M' + f1(mx) + ' ' + f1(my - mr - 5) + ' v6 M' + f1(mx) + ' ' + f1(my + mr - 1) + ' v6"/></g>');
        }
      }
    }
    deferredUp.forEach(function (u) { P.push(u.str); });
    bodyUps.forEach(function (u) { P.push(u.str); });
    chartEls.g.innerHTML = P.join('');
    /* 正立登记回填：DOM 中 text.sk-up 的顺序＝[shown 星官名（ASTS 序）…,
     * 黄道标, 赤道标, 太阳标, 月亮/行星名]，与登记顺序一致 */
    chart.uprights = [];
    chart.labels.forEach(function (L) { if (L.shown) chart.uprights.push(L); });
    deferredUp.forEach(function (u) { chart.uprights.push({ lx: u.lx, ly: u.ly, el: null }); });
    bodyUps.forEach(function (u) { chart.uprights.push({ lx: u.lx, ly: u.ly, el: null }); });
    var upEls = chartEls.g.querySelectorAll('text.sk-up');
    chart.uprights.forEach(function (u, i2) { u.el = upEls[i2] || null; });
    applyTransform();
    chart.drawn = true;
    if (chartEls.lab) {
      /* 偏移读数收尾：播放时 offsetMin 为分数分钟，/60 直拼会出未收尾浮点长串
       * （真机实测「+5.35964999999999905h」挤窄同行播放钮）——两位小数去尾零。 */
      var offH = '';
      if (chart.offsetMin) {
        var hv = (Math.round((chart.offsetMin / 60) * 100) / 100).toFixed(2).replace(/\.?0+$/, '');
        offH = ' (' + (chart.offsetMin > 0 ? '+' : '') + hv + 'h)';
      }
      chartEls.lab.textContent = fmtTime(date) + offH;
    }
    /* 时间旅行读数（③）：目标时刻的月日恒显（步进跨日时不迷失） */
    if (chartEls.dateLab) chartEls.dateLab.textContent = T(fmtDateMD(date)) + ' ' + fmtTime(date);
  }

  function bindChartEvents() {
    var svg = chartEls.svg; if (!svg) return;
    var redrawTimer = null;
    function scheduleRedraw() {
      if (redrawTimer) clearTimeout(redrawTimer);
      redrawTimer = setTimeout(drawChart, 150);
    }
    /* 时间轴 scrub（③）：与既有 offsetMin/play 同一套状态——拖动即随动
     * 重绘（不再走 150ms 防抖，读数与天象同步） */
    chartEls.time.addEventListener('input', function () {
      if (chart.play.on) setPlaying(false);   /* 手动拨动时间即暂停播放 */
      chart.offsetMin = +chartEls.time.value; drawChart();
    });
    $('sk-now').addEventListener('click', function () {
      if (chart.play.on) setPlaying(false);
      chart.offsetMin = 0; chartEls.time.value = '0'; drawChart();
    });
    /* 常用步进：±1 时／±1 日（offsetMin 可超滑杆 ±720，滑杆回钳位显示） */
    var tsb = $('sk-timestep');
    if (tsb) tsb.addEventListener('click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('[data-step]') : null;
      if (!b) return;
      if (chart.play.on) setPlaying(false);
      chart.offsetMin += (+b.getAttribute('data-step'));
      chartEls.time.value = String(Math.max(-720, Math.min(720, chart.offsetMin)));
      drawChart();
    });
    /* 播放/倍速 */
    var pb = $('sk-play'); if (pb) pb.addEventListener('click', function () { setPlaying(!chart.play.on); });
    var spd = $('sk-speed'); if (spd) spd.addEventListener('change', function () { chart.play.speed = +spd.value; });
    /* 最暗星等（共用口径：星图/今夜/AR 同步生效，档位本地记住） */
    var mg = $('sk-mag');
    if (mg) mg.addEventListener('input', function () {
      if (SKY.setMagLim) SKY.setMagLim(+mg.value);
      var ml = $('sk-mag-lab'); if (ml) ml.textContent = mg.value + ' ' + t('sx2_mag_unit');
      drawChart(); renderSideTonight();
    });
    /* 图层面板（④）：开合＋行内开关/档位委托（状态落盘口径见 loadLayers 注） */
    var tgl = $('sk-tg-layers');
    if (tgl) tgl.addEventListener('click', function () { var p = $('sk-layers'); if (p) p.hidden = !p.hidden; });
    var lp = $('sk-layers');
    if (lp) lp.addEventListener('click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('[data-ly],[data-lmode]') : null;
      if (!b || !lp.contains(b)) return;
      var lm2 = b.getAttribute('data-lmode');
      if (lm2) {
        chart.labelMode = lm2; saveLabelMode();
        var btns = lp.querySelectorAll('[data-lmode]');
        for (var bi = 0; bi < btns.length; bi++) btns[bi].classList.toggle('on', btns[bi].getAttribute('data-lmode') === lm2);
        drawChart(); return;
      }
      var k = b.getAttribute('data-ly'); if (!k) return;
      if (k === 'ecl') { chart.lines.ecl = !chart.lines.ecl; saveLinePrefs(); }
      else if (k === 'equ') { chart.lines.equ = !chart.lines.equ; saveLinePrefs(); }
      else {
        chart.layers[k] = !chart.layers[k]; saveLayers();
        if (k === 'fenye' && chart.layers.fenye) loadFenye().then(function () { drawChart(); });
      }
      b.classList.toggle('on', k === 'ecl' ? chart.lines.ecl : k === 'equ' ? chart.lines.equ : chart.layers[k]);
      drawChart();
    });
    /* 跟随手机（传感器模式，与 AR 共用姿态管线） */
    var ts2 = $('sk-tg-sensor');
    if (ts2) ts2.addEventListener('click', function () { setSensor(!chart.sensor); });
    /* 搜索定位 */
    var go = $('sk-go'); if (go) go.addEventListener('click', doLocate);
    var qq = $('sk-q');
    if (qq) {
      qq.addEventListener('keydown', function (e) { if (e.key === 'Enter') doLocate(); });
      qq.addEventListener('input', renderSearchResults);
    }
    var qr = $('sk-q-results');
    if (qr) qr.addEventListener('click', function (e) {
      var it = e.target && e.target.closest ? e.target.closest('[data-qidx]') : null;
      if (!it || !qr._res) return;
      pickResult(qr._res[+it.getAttribute('data-qidx')]);
    });
    var uf = $('sk-unfocus'); if (uf) uf.addEventListener('click', exitFocus);
    /* 点选信息条 */
    var idb = $('sk-info-detail');
    if (idb) idb.addEventListener('click', function () {
      var k = chart.infoKey; hideInfo();
      if (k && window.Stars) window.Stars.openDetail(k);
    });
    var icb = $('sk-info-close'); if (icb) icb.addEventListener('click', hideInfo);
    /* 拖动自旋 / 双指缩放 / 点选 */
    var pointers = new Map(), moved = 0, pinchD = 0, pinchZoom = 1, lastX = 0;
    function pDist() {
      var a = Array.from(pointers.values());
      return a.length === 2 ? Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) : 0;
    }
    svg.addEventListener('pointerdown', function (e) {
      if (chart.play.on) setPlaying(false);   /* 手动拖动即暂停播放 */
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
        if (dx) {
          if (chart.sensor) setSensor(false);   /* 手动自旋退出跟随 */
          chart.spin += dx * 0.3; applyTransform();
        }
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

  /* ---------------- 播放（时间流转） ---------------- */
  function setPlaying(on) {
    chart.play.on = on;
    var b = $('sk-play'); if (b) b.textContent = t(on ? 'sx2_pause' : 'sx2_play');
    if (on) { chart.play.lastTs = 0; chart.play.raf = requestAnimationFrame(playTick); }
    else if (chart.play.raf) cancelAnimationFrame(chart.play.raf);
  }
  function playTick(ts) {
    if (!chart.play.on) return;
    if (chart.play.lastTs) {
      var dt = Math.min(1000, ts - chart.play.lastTs);
      chart.offsetMin += dt / 1000 * chart.play.speed / 60;   /* 倍速＝时间流速倍数 */
      if (chart.offsetMin > 720) chart.offsetMin -= 1440;
      if (chartEls && chartEls.time) chartEls.time.value = String(Math.round(chart.offsetMin));
      if (ts - chart.play.drawAt > 200) { chart.play.drawAt = ts; drawChart(); }  /* 重绘节流 5fps */
    }
    chart.play.lastTs = ts;
    chart.play.raf = requestAnimationFrame(playTick);
  }

  /* ---------------- 跟随手机（传感器模式） ----------------
   * 与 AR 共用 WuriSkyAR 的姿态管线（_watchHeading）：heading＝手机指向
   * 方位角；星图自旋 spin＝heading 时，该方位转到图顶（推导见 sky-ar 注释
   * 同源的 ENU 约定＋本图「北上左东」盘面几何）。手动自旋即退出跟随。 */
  function onSensorHeading(h) {
    if (h == null || !chart.sensor) return;
    chart.spin = ((h % 360) + 360) % 360;
    applyTransform();
  }
  function setSensor(on) {
    chart.sensor = on;
    var b = $('sk-tg-sensor'); if (b) b.classList.toggle('on', on);
    if (!window.WuriSkyAR) return;
    if (on) {
      if (WuriSkyAR._requestOrient) WuriSkyAR._requestOrient();  /* iOS 授权须在手势内调用 */
      WuriSkyAR._watchHeading(onSensorHeading);
    } else {
      WuriSkyAR._unwatchHeading(onSensorHeading);
    }
  }

  /* ---------------- 搜索定位 / 聚焦（②） ----------------
   * 搜索域：星官名＋单星名（ALLSTARS 索引）＋月亮/行星＋位置待考星
   * （UNLOCATED，只报「位置待考」不定位）。排序：精确＞前缀＞包含，
   * 同级短名优先；单星与待考星同级内次于星官/天体（+0.5）。 */
  function searchSky(q) {
    q = (q || '').trim(); if (!q) return [];
    function rank(name) {
      var tn = T(name);
      if (name === q || tn === q) return 0;
      if (name.indexOf(q) === 0 || tn.indexOf(q) === 0) return 1;
      if (name.indexOf(q) >= 0 || tn.indexOf(q) >= 0) return 2;
      return -1;
    }
    var out = [];
    if (SKY && SKY.BODIES) SKY.BODIES.forEach(function (bd) {
      var r = rank(bodyName(bd.id));
      if (r >= 0) out.push({ type: 'body', rank: r, id: bd.id, name: bodyName(bd.id), sub: bodyKindName(bd.kind) });
    });
    ASTS.forEach(function (ast) {
      var r = rank(ast.name);
      if (r >= 0) out.push({ type: 'ast', rank: r, key: ast.key, name: ast.name,
        sub: ast.section + (ast.brightest < 0 ? ' · ' + T('位置待考') : ''), unlocated: ast.brightest < 0 });
    });
    ALLSTARS.forEach(function (st, gi) {
      if (!st.cn) return;
      var r = rank(st.cn);
      if (r >= 0) {
        var ast = ASTS[st.ast];
        out.push({ type: 'star', rank: r + 0.5, gi: gi, name: st.cn,
          sub: (ast ? ast.name : '') + ' · ' + tf(t('sx2_mag'), st.mag.toFixed(1)) });
      }
    });
    UNLOCATED.forEach(function (u) {
      var r = rank(u.cn);
      if (r >= 0) out.push({ type: 'unlocated', rank: r + 0.5, name: u.cn, sub: u.astName + ' · ' + T('位置待考') });
    });
    out.sort(function (a, b) { return (a.rank - b.rank) || (a.name.length - b.name.length); });
    return out.slice(0, 9);
  }
  function renderSearchResults() {
    var box = $('sk-q-results'), qEl = $('sk-q'); if (!box || !qEl) return;
    var res = searchSky(qEl.value);
    if (!res.length) { box.hidden = true; box.innerHTML = ''; box._res = []; return; }
    box.innerHTML = res.map(function (r, i) {
      return '<div class="sk-q-item" data-qidx="' + i + '" style="padding:8px 10px;cursor:pointer;border-top:1px solid var(--line)">' +
        '<b>' + esc(T(r.name)) + '</b> <span style="opacity:.65;font-size:.85em">' + esc(T(r.sub || '')) + '</span></div>';
    }).join('');
    box._res = res;
    box.hidden = false;
  }
  /* 视图平移：从当前旋转位 ease 到新目标位（drawChart 内插值），约 0.75s；
   * 途中目标点带脉冲圈、落定换定标（drawChart 内按 pan/settled 分工） */
  function startPan() {
    if (!chart.curRot) { chart.settled = true; return; }
    chart.pan = { from: chart.curRot.slice(), to: null, t0: Date.now(), dur: 750, drawAt: 0 };
    chart.settled = false;
    requestAnimationFrame(panTick);
  }
  function panTick() {
    if (!chart.pan) return;
    var now = Date.now();
    if (now - chart.pan.t0 >= chart.pan.dur) { chart.pan = null; chart.settled = true; drawChart(); return; }
    if (now - chart.pan.drawAt >= 33) { chart.pan.drawAt = now; drawChart(); }
    if (chart.pan) requestAnimationFrame(panTick);
  }
  function pickResult(r) {
    var note = $('sk-q-note');
    var box = $('sk-q-results'); if (box) box.hidden = true;
    if (!r) { if (note) note.textContent = t('sx2_notfound'); return; }
    if (r.type === 'unlocated' || (r.type === 'ast' && r.unlocated)) {
      if (note) note.textContent = T(r.name) + ' · ' + T('位置待考，暂不可定位');
      return;
    }
    if (note) note.textContent = '';
    chart.focus = null; chart.focusBody = null; chart.focusStar = null;
    if (r.type === 'body') { chart.focusBody = r.id; chart.focusName = bodyName(r.id); }
    else if (r.type === 'star') {
      var ast = ASTS[ALLSTARS[r.gi].ast];
      chart.focusStar = r.gi;
      chart.focusName = ALLSTARS[r.gi].cn + (ast ? '（' + ast.name + '）' : '');
    } else { chart.focus = r.key; chart.focusName = r.name; }
    chart.zoom = 2.2;
    startPan();
    drawChart();
    var fb = $('sk-focusbar'); if (fb) fb.hidden = false;
    var fn = $('sk-focus-name'); if (fn) fn.textContent = T(chart.focusName);
    if (r.type === 'body') {
      for (var bi = 0; bi < chart.bodies.length; bi++) if (chart.bodies[bi].id === r.id) { showBodyInfo(chart.bodies[bi]); break; }
    } else if (r.type === 'star') showInfo(ASTS[ALLSTARS[r.gi].ast].key);
    else showInfo(r.key);
  }
  function doLocate() {
    var qEl = $('sk-q');
    var q = qEl ? (qEl.value || '').trim() : '';
    if (!q) return;
    var res = searchSky(q);
    if (!res.length) { var note = $('sk-q-note'); if (note) note.textContent = t('sx2_notfound'); return; }
    pickResult(res[0]);
  }
  function exitFocus() {
    chart.focus = null; chart.focusBody = null; chart.focusStar = null; chart.zoom = 1;
    startPan();
    drawChart();
    var fb = $('sk-focusbar'); if (fb) fb.hidden = true;
  }

  /* ---------------- 点选信息条 ---------------- */
  function showInfo(key) {
    chart.infoKey = key; chart.infoBody = null;
    var bar = $('sk-info'); if (!bar) return;
    var ast = null;
    ASTS.forEach(function (a) { if (a.key === key) ast = a; });
    if (!ast || ast.brightest < 0 || !chart.lastPr) { bar.hidden = true; return; }
    var db0 = $('sk-info-detail'); if (db0) db0.hidden = false;
    var bp = chart.lastPr[ast.brightest];
    var bk = bestTonightFor(ast);
    var nm = $('sk-info-name'), dt2 = $('sk-info-data');
    if (nm) nm.textContent = T(ast.name) + ' · ' + T(ast.section);
    if (dt2) dt2.textContent =
      tf(t('sx2_info_alt'), bp.alt.toFixed(0)) + ' · ' +
      tf(t('sx2_info_az'), (((bp.az % 360) + 360) % 360).toFixed(0)) + ' · ' +
      tf(t('sx2_info_best'), bk && bk.alt >= 0 ? fmtTime(bk.date) : '—');
    bar.hidden = false;
  }
  /* 月亮/行星信息条：名称＋身份注＋当前方位/高度＋今晚最佳（同采样口径）；
   * 它们没有详情页，「看详情」钮隐藏，不跳星官详情 */
  function showBodyInfo(B) {
    chart.infoKey = null; chart.infoBody = B.id;
    var bar = $('sk-info'); if (!bar) return;
    var nm = $('sk-info-name'), dt2 = $('sk-info-data'), db = $('sk-info-detail');
    if (nm) nm.textContent = T(bodyName(B.id)) + ' · ' + bodyKindName(B.kind);
    var bk = bestTonightForBody(B.id);
    var s = tf(t('sx2_info_alt'), B.alt.toFixed(0)) + ' · ' +
      tf(t('sx2_info_az'), (((B.az % 360) + 360) % 360).toFixed(0)) + ' · ' +
      tf(t('sx2_info_best'), bk && bk.alt >= 0 ? fmtTime(bk.date) : '—');
    if (B.kind === 'moon' && B.illum != null) s += ' · ' + tf(t('sx_moon_illum'), (Math.round(B.illum * 1000) / 10).toFixed(1));
    if (dt2) dt2.textContent = s;
    if (db) db.hidden = true;
    bar.hidden = false;
  }
  function hideInfo() {
    chart.infoKey = null; chart.infoBody = null;
    var bar = $('sk-info'); if (bar) bar.hidden = true;
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
    var bestB = null, bestBD = 26;
    chart.bodies.forEach(function (B) {
      var d = Math.hypot(B.x - ux, B.y - uy);
      if (d < bestBD) { bestBD = d; bestB = B; }
    });
    /* 点星官先出底部信息条（名＋高度/方位＋今晚最佳＋看详情）；点月亮/行星
     * 出同一信息条（带身份注、无详情钮）；点空白收起 */
    if (bestB && (!bestK || bestBD <= bestD)) showBodyInfo(bestB);
    else if (bestK) showInfo(bestK); else hideInfo();
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
    if (tab) {
      hide('view-sky-tonight'); hide('view-sky-chart');
      if (chart.play.on) setPlaying(false);
      if (chart.sensor) setSensor(false);
    }
  });
  /* 尺寸变化（旋转/平板横竖屏切换）重算显示标定 */
  var rszT = null;
  window.addEventListener('resize', function () {
    if (rszT) clearTimeout(rszT);
    rszT = setTimeout(function () {
      var cv = $('view-sky-chart');
      if (cv && !cv.hidden && chart.drawn) drawChart();
    }, 200);
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
    /* 冒烟/调试（v2.1.1）：当前图面月亮/行星表、单天体今夜最佳、天体图面坐标 */
    bodies: function () { return chart.bodies; },
    bestBody: bestTonightForBody,
    bodyPointOf: function (id) {
      for (var i = 0; i < chart.bodies.length; i++) {
        var B = chart.bodies[i]; if (B.id !== id) continue;
        var dx = B.x - CX, dy = B.y - CY, r = Math.hypot(dx, dy) * chart.zoom, a = Math.atan2(dy, dx) + chart.spin * D2R;
        return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) };
      }
      return null;
    },
    /* 冒烟/调试：当前标签表（key/锚点/最亮星点/是否显示/半文宽）与测试缩放/自旋 */
    labelInfo: function () { return chart.labels; },
    setZoom: function (z) { chart.zoom = Math.max(1, Math.min(3, z)); drawChart(); },
    setSpin: function (deg) { chart.spin = deg; applyTransform(); },
    /* 冒烟/调试：星图综合状态（聚焦/信息条/播放/传感器/线开关/星等/时间偏移） */
    state: function () {
      return { focus: chart.focus, focusBody: chart.focusBody, focusStar: chart.focusStar, infoKey: chart.infoKey, infoBody: chart.infoBody, playing: chart.play.on,
        offsetMin: Math.round(chart.offsetMin * 10) / 10, sensor: chart.sensor,
        spin: chart.spin, zoom: chart.zoom, lines: { ecl: chart.lines.ecl, equ: chart.lines.equ },
        labelMode: chart.labelMode, layers: { lines: chart.layers.lines, labelsOn: chart.layers.labelsOn, fenye: chart.layers.fenye, grid: chart.layers.grid, milky: chart.layers.milky },
        settled: chart.settled, panning: !!chart.pan, curRot: chart.curRot,
        magLim: SKY && SKY.magLim ? SKY.magLim() : null };
    },
    /* 冒烟/调试（星空批 B 线）：搜索索引、今晚时间线摘要 */
    search: searchSky,
    tonightInfo: function () { return nightInfo; },
    /* 冒烟/调试：某星官形心在当前图面（含自旋/缩放）的屏幕坐标（viewBox 单位） */
    pickPointOf: function (key) {
      for (var i = 0; i < chart.labels.length; i++) {
        var L = chart.labels[i]; if (L.key !== key) continue;
        var dx = L.cx - CX, dy = L.cy - CY, r = Math.hypot(dx, dy) * chart.zoom, a = Math.atan2(dy, dx) + chart.spin * D2R;
        return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) };
      }
      return null;
    },
    /* 冒烟/调试：某星官标签锚点（lx,ly）在当前图面的屏幕坐标（viewBox 单位） */
    labelScreenPos: function (key) {
      for (var i = 0; i < chart.labels.length; i++) {
        var L = chart.labels[i]; if (L.key !== key) continue;
        var dx = L.lx - CX, dy = L.ly - CY, r = Math.hypot(dx, dy) * chart.zoom, a = Math.atan2(dy, dx) + chart.spin * D2R;
        return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) };
      }
      return null;
    } };
})();
