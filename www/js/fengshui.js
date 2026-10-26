/* 风水模块 · 第一批（2026-10-26）：专页骨架＋二十四山罗盘
 *
 * 定向口径与相机认星（sky-ar.js）同源，不另立一套：
 *  - 只有「可信」事件写读数：deviceorientationabsolute 类型、e.absolute===true，
 *    或 iOS 的 webkitCompassHeading 在位；相对事件一律不冒充罗盘。
 *  - 口径分两类：'ios'＝webkitCompassHeading，真北口径不修正；
 *    'mag'＝安卓绝对事件，alpha 以磁北为零点：磁读数 heading=(360-alpha)，
 *    真北向 = 磁读数 + 磁偏角 δ（东偏为正，WMM2025，WuriSky.declination，
 *    观测地取星象存档 wuri_sky_obs_v1，无则默认 St-Hubert，进页再以一次性
 *    定位静默精化本次偏角，不写存档）。
 *  - 平滑：目标角最短弧插值（rAF 逐帧 0.22），避免跨 0° 时盘面狂转。
 *  - 无传感器/拒绝授权：静态盘＋拖动盘面手动对山（拖动后本页会话内手动锁定）。
 * 盘面生成逻辑与设计稿 draft-compass.html 同构（真数据实绘，非贴图）。
 */
(function () {
  'use strict';
  function $(id) { return document.getElementById(id); }
  function T(k) { return window.t ? window.t(k) : k; }
  function TF(fmt) {
    var a = [fmt], i;
    for (i = 1; i < arguments.length; i++) a.push(arguments[i]);
    return window.tf ? window.tf.apply(null, a) : fmt;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function norm360(d) { return ((d % 360) + 360) % 360; }
  function fmtDeg(d) { return (Math.round(norm360(d) * 10) / 10).toFixed(1); }
  function fmtDecl(d) { return (d > 0 ? '+' : d < 0 ? '−' : '') + (Math.round(Math.abs(d) * 10) / 10).toFixed(1); }
  /* 全站无全局 toast（ai-analysis/pro 各用闭包私有实现），此处自带同款（同 id/视觉） */
  function toastMsg(m) {
    var t = document.getElementById('wuri-ai-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'wuri-ai-toast';
      t.style.cssText = 'position:fixed;bottom:120px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.8);color:#fff;padding:12px 22px;border-radius:8px;font-size:14px;z-index:10000;max-width:80%;text-align:center;';
      document.body.appendChild(t);
    }
    t.textContent = m;
    t.style.display = 'block';
    clearTimeout(t._tm);
    t._tm = setTimeout(function () { t.style.display = 'none'; }, 3000);
  }

  var MT = window.FS24 || [];
  function mtnAt(deg) { return MT.length ? MT[Math.round(norm360(deg) / 15) % 24] : null; }
  function dir8Name(deg) {
    var names = String(T('fs_dir8')).split('|');
    return names[Math.round(norm360(deg) / 45) % 8] || '';
  }

  /* ---------------- 房屋坐向档案 ---------------- */
  var ARCH_KEY = 'wuri_fs_house_v1';
  function loadArch() {
    try {
      var j = JSON.parse(localStorage.getItem(ARCH_KEY) || 'null');
      if (j && isFinite(j.facingDeg) && j.facing && j.sitting) return j;
    } catch (e) {}
    return null;
  }
  function saveArch(a) { try { localStorage.setItem(ARCH_KEY, JSON.stringify(a)); } catch (e) {} }
  function clearArch() { try { localStorage.removeItem(ARCH_KEY); } catch (e) {} }

  var ARCH_ICON = '<svg width="72" height="72" viewBox="0 0 72 72" aria-hidden="true">' +
    '<circle cx="36" cy="36" r="33" fill="none" stroke="var(--line)" stroke-width="1.5"/>' +
    '<circle cx="36" cy="36" r="25" fill="none" stroke="var(--line-soft)" stroke-width="1"/>' +
    '<g stroke="var(--faint)" stroke-width="1.5">' +
    '<line x1="36" y1="5" x2="36" y2="11"/><line x1="36" y1="61" x2="36" y2="67"/>' +
    '<line x1="5" y1="36" x2="11" y2="36"/><line x1="61" y1="36" x2="67" y2="36"/>' +
    '<line x1="14" y1="14" x2="18.2" y2="18.2"/><line x1="53.8" y1="53.8" x2="58" y2="58"/>' +
    '<line x1="58" y1="14" x2="53.8" y2="18.2"/><line x1="18.2" y1="53.8" x2="14" y2="58"/></g>' +
    '<line x1="36" y1="36" x2="36" y2="13" stroke="var(--gold)" stroke-width="2"/>' +
    '<circle cx="36" cy="36" r="3" fill="var(--gold)"/></svg>';

  function renderArch() {
    var box = $('fs-arch');
    if (!box) return;
    var a = loadArch();
    if (!a) {
      box.innerHTML = '<div class="fs-arch-empty">' + ARCH_ICON +
        '<div class="fs-arch-state">' + esc(T('fs_arch_empty')) + '</div>' +
        '<p class="fs-arch-hint">' + esc(T('fs_arch_hint')) + '</p>' +
        '<span class="fs-chipbtn" id="fs-arch-go">' + esc(T('fs_arch_measure')) + '</span></div>';
    } else {
      var d = new Date(a.ts || Date.now());
      var when = (d.getMonth() + 1) + '/' + d.getDate() + ' ' +
        String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
      box.innerHTML = '<div class="fs-arch-empty">' + ARCH_ICON +
        '<div class="fs-arch-line">' + esc(TF(T('fs_arch_line'), a.sitting, a.facing, a.sitting, a.facing)) + '</div>' +
        '<p class="fs-arch-hint">' + esc(TF(T('fs_arch_deg'), fmtDeg(a.facingDeg), when)) + '</p>' +
        '<div class="fs-arch-btns">' +
        '<span class="fs-chipbtn" id="fs-arch-go">' + esc(T('fs_arch_redo')) + '</span>' +
        '<span class="fs-chipbtn danger" id="fs-arch-del">' + esc(T('fs_arch_del')) + '</span>' +
        '</div></div>';
    }
    var go = $('fs-arch-go');
    if (go) go.addEventListener('click', openCompass);
    var del = $('fs-arch-del');
    if (del) del.addEventListener('click', function () { clearArch(); renderArch(); });
  }

  /* ---------------- 视图开关 ---------------- */
  var hub = $('view-fengshui'), comp = $('view-compass');
  function openHub() { if (hub) { hub.hidden = false; window.scrollTo(0, 0); renderArch(); } }
  function closeHub() { if (hub) hub.hidden = true; }
  function openCompass() { if (comp) { comp.hidden = false; window.scrollTo(0, 0); startCompass(); } }
  function closeCompass() { if (comp) comp.hidden = true; stopCompass(); }

  /* ---------------- 罗盘盘面（设计稿同构实绘） ---------------- */
  var NS = 'http://www.w3.org/2000/svg', C = 190;
  var rotG = null, cBig = null, cDeg = null, cSmall = null;
  function buildDial() {
    var svg = $('fs-dial');
    if (!svg || rotG) return;
    function el(n, attrs, parent) {
      var e = document.createElementNS(NS, n);
      for (var k in attrs) e.setAttribute(k, attrs[k]);
      (parent || svg).appendChild(e); return e;
    }
    function txt(parent, x, y, s, attrs) {
      var a = { x: x, y: y, 'text-anchor': 'middle', 'dominant-baseline': 'central' };
      for (var k in (attrs || {})) a[k] = attrs[k];
      var t = el('text', a, parent); t.textContent = s; return t;
    }
    function pol(aDeg, r) { var a = aDeg * Math.PI / 180; return [C + r * Math.sin(a), C - r * Math.cos(a)]; }

    el('circle', { cx: C, cy: C, r: 188, 'class': 'dl-rim' });
    el('circle', { cx: C, cy: C, r: 174, 'class': 'dl-face' });

    rotG = el('g', { id: 'fs-dial-rot', transform: 'rotate(180 ' + C + ' ' + C + ')' });

    for (var d = 0; d < 360; d += 3) {
      var r1 = (d % 15 === 0) ? 157 : 164;
      var p1 = pol(d, r1), p2 = pol(d, 172);
      el('line', { x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1],
        'class': (d % 90 === 0) ? 'dl-tick dl-tick-l' : 'dl-tick' }, rotG);
    }
    el('circle', { cx: C, cy: C, r: 155, 'class': 'dl-hair' }, rotG);
    el('circle', { cx: C, cy: C, r: 123, 'class': 'dl-hair' }, rotG);

    MT.forEach(function (m, i) {
      var g = el('g', { transform: 'rotate(' + (i * 15) + ' ' + C + ' ' + C + ')' }, rotG);
      var cls = 'dl-mtn' + (window.FS_CARDINAL && FS_CARDINAL[m.name] ? ' dl-card'
        : window.FS_GUA_MTN && FS_GUA_MTN[m.name] ? ' dl-gua' : '');
      txt(g, C, C - 139, m.name, { 'font-size': 16.5, 'class': cls });
    });

    el('circle', { cx: C, cy: C, r: 117, 'class': 'dl-hair' }, rotG);
    el('circle', { cx: C, cy: C, r: 93, 'class': 'dl-hair' }, rotG);
    (window.FS_TRI || []).forEach(function (it) {
      var g = el('g', { transform: 'rotate(' + it[1] + ' ' + C + ' ' + C + ')' }, rotG);
      for (var row = 0; row < 3; row++) {
        var y = C - 105 + (row === 0 ? 7.5 : (row === 2 ? -7.5 : 0));
        if (it[2][row] === 1) {
          el('rect', { x: C - 15, y: y - 1.8, width: 30, height: 3.6, rx: 1.8, 'class': 'dl-tri' }, g);
        } else {
          el('rect', { x: C - 15, y: y - 1.8, width: 13, height: 3.6, rx: 1.8, 'class': 'dl-tri' }, g);
          el('rect', { x: C + 2, y: y - 1.8, width: 13, height: 3.6, rx: 1.8, 'class': 'dl-tri' }, g);
        }
      }
      txt(g, C, C - 81, it[0], { 'font-size': 12, 'class': 'dl-name' });
    });

    el('line', { x1: C, y1: C - 171, x2: C, y2: C + 171, 'class': 'dl-redline' }, rotG);

    el('circle', { cx: C, cy: C, r: 64, 'class': 'dl-center' });
    cBig = txt(svg, C, C - 16, '午', { 'font-size': 42, 'class': 'dl-big' });
    cDeg = txt(svg, C, C + 21, '—', { 'font-size': 15.5, 'class': 'dl-deg' });
    cSmall = txt(svg, C, C + 43, '', { 'font-size': 10.5, 'class': 'dl-small', 'letter-spacing': '.18em' });
  }

  /* ---------------- 罗盘状态与读数 ---------------- */
  var CS = {
    on: false, raf: 0, bound: false,
    targetTrue: null, curTrue: null, manTrue: null,
    mode: 'none',           /* none | sensor | manual（手动后本页会话锁定） */
    hasReading: false,
    decl: 0, declReady: false,
    watchdog: 0, drag: null
  };
  function displayHeading() {
    if (CS.mode === 'manual' && CS.manTrue !== null) return CS.manTrue;
    if (CS.curTrue !== null) return CS.curTrue;
    return 180; /* 无读数时的呈现朝向（同设计稿静止稿：坐北朝南），不作存档依据 */
  }
  function setNote(s) { var n = $('fs-ori-note'); if (n) n.textContent = s || ''; }
  function renderChips() {
    var t = $('fs-chip-true'), m = $('fs-chip-mag'), dc = $('fs-chip-decl');
    if (t) t.textContent = CS.hasReading ? fmtDeg(displayHeading()) + '°' : '—';
    if (m) m.textContent = CS.hasReading ? fmtDeg(norm360(displayHeading() - CS.decl)) + '°' : '—';
    if (dc) dc.textContent = CS.declReady ? fmtDecl(CS.decl) + '°' : '—';
  }
  function renderDial() {
    if (!rotG) return;
    var h = displayHeading();
    rotG.setAttribute('transform', 'rotate(' + norm360(360 - h) + ' ' + C + ' ' + C + ')');
    var mt = mtnAt(h);
    if (cBig) cBig.textContent = mt ? mt.name : '—';
    if (cDeg) cDeg.textContent = CS.hasReading ? fmtDeg(h) + '°' : '—';
    if (cSmall) cSmall.textContent = dir8Name(h) + ' · ' + T('fs_facing');
    renderChips();
    var sv = $('fs-save');
    if (sv) sv.disabled = !CS.hasReading;
  }
  function arcStep(a, b, f) {
    var d = ((b - a + 540) % 360) - 180;
    return norm360(a + d * f);
  }
  function loop() {
    if (!CS.on) return;
    if (CS.mode === 'sensor' && CS.targetTrue !== null) {
      if (CS.curTrue === null) CS.curTrue = CS.targetTrue;
      else CS.curTrue = arcStep(CS.curTrue, CS.targetTrue, 0.22);
      renderDial();
    }
    CS.raf = requestAnimationFrame(loop);
  }

  /* 磁偏角：WMM2025（与 AR 同源）；观测地存档优先，否则默认 St-Hubert，
   * 再以一次性定位静默精化（只影响本次偏角，不写观测地存档） */
  function computeDecl() {
    var lat = 45.5122, lon = -73.4253;
    if (window.WuriSky && WuriSky.DEFAULT_OBS) { lat = WuriSky.DEFAULT_OBS.lat; lon = WuriSky.DEFAULT_OBS.lon; }
    try {
      var j = JSON.parse(localStorage.getItem('wuri_sky_obs_v1') || 'null');
      if (j && isFinite(j.lat) && isFinite(j.lon)) { lat = +j.lat; lon = +j.lon; }
    } catch (e) {}
    if (window.WuriSky && WuriSky.declination) CS.decl = WuriSky.declination(lat, lon, new Date());
    CS.declReady = true;
    renderChips();
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(function (p) {
        if (window.WuriSky && WuriSky.declination) {
          CS.decl = WuriSky.declination(p.coords.latitude, p.coords.longitude, new Date());
          renderChips();
        }
      }, function () {}, { timeout: 4000, maximumAge: 600000 });
    }
  }

  /* 定向事件（信任判定与口径同 sky-ar，见文件头） */
  function oriSource(e, fromAbs) {
    if (typeof e.webkitCompassHeading === 'number' && e.webkitCompassHeading >= 0) return 'ios';
    if (fromAbs) return 'mag';
    if (e.absolute === true) return 'mag';
    return null;
  }
  function ingest(e, fromAbs) {
    var src = oriSource(e, fromAbs);
    if (!src) return;
    var hTrue;
    if (src === 'ios') {
      hTrue = norm360(e.webkitCompassHeading);
    } else {
      if (!e || e.alpha == null) return;
      hTrue = norm360((360 - e.alpha) + CS.decl);
    }
    if (CS.mode === 'manual') return; /* 手动锁定：传感器不再夺盘 */
    CS.mode = 'sensor';
    CS.hasReading = true;
    CS.targetTrue = hTrue;
    if (CS.curTrue === null) { CS.curTrue = hTrue; renderDial(); }
    setNote(T('fs_note_live'));
  }
  function onOri(e) { ingest(e, false); }
  function onOriAbs(e) { ingest(e, true); }
  function bindOri() {
    if (CS.bound) return;
    window.addEventListener('deviceorientation', onOri);
    window.addEventListener('deviceorientationabsolute', onOriAbs);
    CS.bound = true;
    clearTimeout(CS.watchdog);
    CS.watchdog = setTimeout(function () {
      if (CS.on && CS.mode !== 'sensor' && CS.mode !== 'manual') setNote(T('fs_note_manual'));
    }, 1800);
  }
  function unbindOri() {
    if (!CS.bound) return;
    window.removeEventListener('deviceorientation', onOri);
    window.removeEventListener('deviceorientationabsolute', onOriAbs);
    CS.bound = false;
    clearTimeout(CS.watchdog);
  }
  function needsPerm() {
    return typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function';
  }

  function startCompass() {
    buildDial();
    CS.on = true;
    computeDecl();
    renderDial();
    var act = $('fs-ori-act');
    if (needsPerm()) {
      if (act) act.hidden = false;      /* iOS 必须手势授权，等用户点按钮 */
    } else {
      if (act) act.hidden = true;
      bindOri();
    }
    cancelAnimationFrame(CS.raf);
    CS.raf = requestAnimationFrame(loop);
  }
  function stopCompass() {
    CS.on = false;
    cancelAnimationFrame(CS.raf);
    unbindOri();
  }

  /* 手动对山：拖动盘面（指针角增量 → 向首角反向增量） */
  function bindDrag() {
    var stage = $('fs-stage');
    if (!stage) return;
    function ptrAngle(e) {
      var r = stage.getBoundingClientRect();
      var dx = e.clientX - (r.left + r.width / 2);
      var dy = e.clientY - (r.top + r.height / 2);
      return Math.atan2(dx, -dy) * 180 / Math.PI;
    }
    stage.addEventListener('pointerdown', function (e) {
      CS.drag = { a0: ptrAngle(e), h0: displayHeading() };
      try { stage.setPointerCapture(e.pointerId); } catch (err) {}
    });
    stage.addEventListener('pointermove', function (e) {
      if (!CS.drag) return;
      var d = ((ptrAngle(e) - CS.drag.a0 + 540) % 360) - 180;
      CS.mode = 'manual';
      CS.hasReading = true;
      CS.manTrue = norm360(CS.drag.h0 - d);
      setNote(T('fs_note_drag'));
      renderDial();
    });
    function end() { CS.drag = null; }
    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', end);
  }

  /* ---------------- 接线 ---------------- */
  function init() {
    var entry = $('fengshui-entry-card');
    if (entry) entry.addEventListener('click', openHub);
    var back = $('fs-back');
    if (back) back.addEventListener('click', closeHub);
    var cc = $('fs-card-compass');
    if (cc) cc.addEventListener('click', openCompass);
    var cb = $('fs-compass-back');
    if (cb) cb.addEventListener('click', closeCompass);
    /* 八宅/玄空飞星（第二批）：过 Pro 门后交 fengshui2.js 开页 */
    [['fs-card-bazhai', 'openBazhai'], ['fs-card-xuankong', 'openXuankong']].forEach(function (pair) {
      var c = $(pair[0]);
      if (!c) return;
      c.addEventListener('click', function () {
        if (window.WuriPro && WuriPro.requirePro('fengshui') &&
            window.__wuriFs2 && window.__wuriFs2[pair[1]]) {
          window.__wuriFs2[pair[1]]();
        }
      });
    });
    var ob = $('fs-ori-btn');
    if (ob) ob.addEventListener('click', function () {
      if (!needsPerm()) { bindOri(); return; }
      DeviceOrientationEvent.requestPermission().then(function (res) {
        if (res === 'granted') {
          var act = $('fs-ori-act'); if (act) act.hidden = true;
          bindOri();
        } else setNote(T('fs_note_denied'));
      }).catch(function () { setNote(T('fs_note_denied')); });
    });
    var sv = $('fs-save');
    if (sv) sv.addEventListener('click', function () {
      if (!CS.hasReading) return;
      var h = displayHeading();
      var f = mtnAt(h);
      if (!f) return;
      var s = MT[(MT.indexOf(f) + 12) % 24];
      saveArch({
        facingDeg: Math.round(h * 10) / 10,
        facing: f.name, sitting: s.name, ts: Date.now()
      });
      toastMsg(T('fs_saved'));
      closeCompass();
      renderArch();
    });
    bindDrag();
    renderArch();
    buildDial();
    renderDial();
    /* 语言切换时重绘动态文案（静态文案由 applyI18n 处理） */
    if (window.__wuri_rerender) {
      var prev = window.__wuri_rerender;
      window.__wuri_rerender = function () { prev(); renderArch(); renderDial(); };
    }
  }
  init();

  /* 冒烟/调试面：读当前状态（不写） */
  window.__wuriFs = {
    arch: loadArch,
    state: function () {
      return {
        mode: CS.mode, hasReading: CS.hasReading,
        heading: CS.hasReading ? displayHeading() : null,
        display: displayHeading(), decl: CS.decl,
        mountain: (mtnAt(displayHeading()) || {}).name || null
      };
    }
  };
})();
