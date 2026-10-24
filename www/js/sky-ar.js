/* 戊日不上香 · 中国星象二期第二步：「相机认星」（AR 层，v2.1.0 (2)）
 *
 * 地基是 js/sky-engine.js（一期投影引擎，Astronomy Engine 坐标变换）：
 * 每秒以 projectAll 算全表定星的方位/高度，本层只做姿态→视场投影，
 * 不重写引擎。星官与连线只用自家 data/xingguan.json、xingguan-lines.json。
 *
 * 姿态管线（2026-10-24 以标准姿势代数验算，正北/正东/北极星锚点全合）：
 *   deviceorientation 的 α/β/γ 是设备帧（x 右、y 顶、z 出屏）相对地球帧
 *   ENU（x 东、y 北、z 天）的内禀 Z-X-Y 旋转，合成矩阵
 *   R = Rz(α)·Rx(β)·Ry(γ)。相机（后置）视线 f = −R·ẑ，
 *   传感器右向 s_r = R·x̂、上向 s_u = R·ŷ；再按屏幕方向角 φ 把
 *   (s_r, s_u) 旋到显示帧 (R̂d, Ûd)。星位 v(ENU) 投影：
 *   x = cx + F·(v·R̂d)/(v·f)，y = cy − F·(v·Ûd)/(v·f)，F = (h/2)/tan(VFOV/2)。
 *   VFOV 取手机主摄名义值 62°——个体机型有差，靠手动拖动校准吸收
 *   （校准量以「星位 az/alt 偏移」施加，本地存档、开机即用）。
 *
 * 权限两关：iOS 的 DeviceOrientationEvent.requestPermission 必须在点击
 * 手势内调用，故「开始」流程先请姿态授权、再请相机；任一关被拒都落
 * 人话回落面板（可改开平面星图），不白屏。桌面/无陀螺仪设备：相机能开
 * 但收不到姿态数据时，HUD 常驻提示并给平面星图入口。
 * 真机手感（跟随延迟、罗盘漂移量级、横屏 φ 符号）沙箱无从验，留真机验收。
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
  var SKY = window.WuriSky;
  var D2R = Math.PI / 180;
  var VFOV = 62;            /* 主摄名义垂直视场（度），校准吸收个体差 */
  /* 星等阈值从 WuriSky.magLim 共用口径（默认：标签 ≤6.0、星点 ≤6.5） */
  function magLabel() { return SKY.magLim ? SKY.magLim() : 6; }
  function magStar() { return (SKY.magLim ? SKY.magLim() : 6) + 0.5; }

  /* ---------------- 数据（与 sky-chart 同一份自家数据，各自加载） ---------------- */
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
      var ast = { key: a.section + '|' + a.name, name: a.name, section: a.section,
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

  /* ---------------- 观测地（与平面星图同一存档键） ---------------- */
  var OBS_KEY = 'wuri_sky_obs_v1';
  function getObs() {
    try {
      var j = JSON.parse(localStorage.getItem(OBS_KEY) || 'null');
      if (j && isFinite(j.lat) && isFinite(j.lon)) return { lat: +j.lat, lon: +j.lon };
    } catch (e) {}
    return { lat: SKY.DEFAULT_OBS.lat, lon: SKY.DEFAULT_OBS.lon };
  }

  /* ---------------- 校准存档 ---------------- */
  var CAL_KEY = 'wuri_sky_ar_cal_v1';
  var cal = (function () {
    try {
      var j = JSON.parse(localStorage.getItem(CAL_KEY) || 'null');
      if (j) return { az: +j.az || 0, alt: +j.alt || 0, red: !!j.red };
    } catch (e) {}
    return { az: 0, alt: 0, red: false };
  })();
  function saveCal() {
    try { localStorage.setItem(CAL_KEY, JSON.stringify(cal)); } catch (e) {}
  }
  function clampCal() {
    cal.az = Math.max(-45, Math.min(45, cal.az));
    cal.alt = Math.max(-45, Math.min(45, cal.alt));
  }

  /* ---------------- 状态 ---------------- */
  var S = {
    running: false, stream: null, raf: 0, pose: null, poseAt: 0, startAt: 0,
    noPose: false, fallback: null, posCache: null, posAt: 0,
    labels: [], segments: 0, hudText: '', els: null, oriBound: false
  };

  function onOri(e) {
    if (!e || e.alpha == null) return;
    S.pose = { a: e.alpha, b: e.beta || 0, g: e.gamma || 0 };
    S.poseAt = performance.now();
    S.noPose = false;
  }
  function screenAngle() {
    if (window.screen && screen.orientation && typeof screen.orientation.angle === 'number') return screen.orientation.angle;
    return 0;
  }

  /* 姿态 → 相机三轴（f 前、Rd 显示右、Ud 显示上），均为 ENU 单位向量 */
  function camAxes() {
    var a = S.pose.a * D2R, b = S.pose.b * D2R, g = S.pose.g * D2R;
    var ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cg = Math.cos(g), sg = Math.sin(g);
    /* R = Rz(a)·Rx(b)·Ry(g) 的三列 = 设备 x/y/z 轴在 ENU 中的像 */
    var c0 = [ca * cg - sa * sb * sg, sa * cg + ca * sb * sg, -cb * sg];
    var c1 = [-sa * cb, ca * cb, sb];
    var c2 = [ca * sg + sa * sb * cg, sa * sg - ca * sb * cg, cb * cg];
    var phi = screenAngle() * D2R, cp = Math.cos(phi), sp = Math.sin(phi);
    var Rd = [0, 1, 2].map(function (i) { return cp * c0[i] - sp * c1[i]; });
    var Ud = [0, 1, 2].map(function (i) { return sp * c0[i] + cp * c1[i]; });
    return { f: [-c2[0], -c2[1], -c2[2]], Rd: Rd, Ud: Ud };
  }

  function starVec(altDeg, azDeg) {
    var al = altDeg * D2R, az = azDeg * D2R;
    return [Math.cos(al) * Math.sin(az), Math.cos(al) * Math.cos(az), Math.sin(al)];
  }
  function starR(m) { return m <= 1 ? 3.4 : m <= 2 ? 2.8 : m <= 3 ? 2.2 : m <= 4 ? 1.7 : m <= 5 ? 1.35 : m <= 6 ? 1.05 : 0.85; }

  /* 场景绘制：ctx 已按工作尺寸设好变换；w/h 为工作单位（显示时 = CSS px） */
  function drawScene(ctx, w, h) {
    S.labels = []; S.segments = 0;
    ctx.clearRect(0, 0, w, h);
    if (!S.pose || !S.posCache) return;
    var ax = camAxes();
    var focal = (h / 2) / Math.tan(VFOV / 2 * D2R);
    var red = cal.red;
    var colLine = red ? 'rgba(255,84,60,0.85)' : 'rgba(232,200,119,0.75)';
    var colLineD = red ? 'rgba(255,84,60,0.5)' : 'rgba(232,200,119,0.45)';
    var colStar = red ? '#ff7a5c' : '#fff6da';
    var colLabel = red ? '#ff8a6a' : '#e8c877';
    var P = new Array(ALLSTARS.length);
    for (var i = 0; i < ALLSTARS.length; i++) {
      var pc = S.posCache[i];
      if (!pc || pc.alt < -2) { P[i] = null; continue; }
      var v = starVec(pc.alt + cal.alt, pc.az + cal.az);
      var cz = v[0] * ax.f[0] + v[1] * ax.f[1] + v[2] * ax.f[2];
      if (cz <= 0.08) { P[i] = null; continue; }
      var cxv = v[0] * ax.Rd[0] + v[1] * ax.Rd[1] + v[2] * ax.Rd[2];
      var cyv = v[0] * ax.Ud[0] + v[1] * ax.Ud[1] + v[2] * ax.Ud[2];
      P[i] = { x: w / 2 + focal * cxv / cz, y: h / 2 - focal * cyv / cz, cz: cz, alt: pc.alt };
    }
    /* 连线层（只画两端都在视场内的边；出界段由画布自然裁剪） */
    ctx.lineWidth = 1.2;
    ASTS.forEach(function (ast) {
      if (!ast.edges.length) return;
      ctx.strokeStyle = ast.doubtful ? colLineD : colLine;
      ctx.setLineDash(ast.doubtful ? [4, 3] : []);
      ctx.beginPath();
      var drew = false;
      ast.edges.forEach(function (e) {
        var p = P[e[0]], q = P[e[1]];
        if (!p || !q) return;
        if (p.x < -120 || p.x > w + 120 || p.y < -120 || p.y > h + 120) return;
        if (q.x < -120 || q.x > w + 120 || q.y < -120 || q.y > h + 120) return;
        ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); drew = true; S.segments++;
      });
      if (drew) ctx.stroke();
    });
    ctx.setLineDash([]);
    /* 星点层 */
    var mStar = magStar();
    for (var j = 0; j < ALLSTARS.length; j++) {
      var st = ALLSTARS[j], pj = P[j];
      if (!pj || st.mag > mStar) continue;
      if (pj.x < -10 || pj.x > w + 10 || pj.y < -10 || pj.y > h + 10) continue;
      ctx.globalAlpha = st.mag <= 3 ? 0.95 : st.mag <= 5 ? 0.8 : 0.6;
      ctx.fillStyle = colStar;
      ctx.beginPath(); ctx.arc(pj.x, pj.y, starR(st.mag), 0, 6.2832); ctx.fill();
    }
    ctx.globalAlpha = 1;
    /* 标签层（最亮星在视场内、高度 >0、≤ 星等设定；文字以屏幕系
     * fillText 水平绘制，天然恒正立，不随姿态旋转） */
    var mLabel = magLabel();
    ctx.font = '12px "Songti SC", "Noto Serif CJK SC", serif';
    ctx.textAlign = 'center';
    ASTS.forEach(function (ast) {
      if (ast.brightest < 0) return;
      var bs = ALLSTARS[ast.brightest], pb = P[ast.brightest];
      if (!pb || bs.mag > mLabel || pb.alt <= 0) return;
      if (pb.x < 16 || pb.x > w - 16 || pb.y < 20 || pb.y > h - 6) return;
      var name = T(ast.name);
      ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(8,8,14,0.65)';
      ctx.strokeText(name, pb.x, pb.y - 11);
      ctx.fillStyle = colLabel;
      ctx.fillText(name, pb.x, pb.y - 11);
      S.labels.push({ key: ast.key, x: pb.x, y: pb.y - 11 });
    });
    /* 中心十字（校准参照） */
    ctx.strokeStyle = red ? 'rgba(255,84,60,0.8)' : 'rgba(255,246,218,0.8)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(w / 2 - 9, h / 2); ctx.lineTo(w / 2 - 3, h / 2);
    ctx.moveTo(w / 2 + 3, h / 2); ctx.lineTo(w / 2 + 9, h / 2);
    ctx.moveTo(w / 2, h / 2 - 9); ctx.lineTo(w / 2, h / 2 - 3);
    ctx.moveTo(w / 2, h / 2 + 3); ctx.lineTo(w / 2, h / 2 + 9);
    ctx.stroke();
    S.centerAz = (Math.atan2(ax.f[0], ax.f[1]) / D2R + 360) % 360;
    S.centerAlt = Math.asin(Math.max(-1, Math.min(1, ax.f[2]))) / D2R;
    /* 天北极投影点（冒烟锚点：极点 alt＝纬度、az＝0，任意时刻恒定，
     * 不随某颗绕极星的时辰位置漂移） */
    var pv = starVec((S.obs ? S.obs.lat : SKY.DEFAULT_OBS.lat) + cal.alt, cal.az);
    var pcz = pv[0] * ax.f[0] + pv[1] * ax.f[1] + pv[2] * ax.f[2];
    S.polePoint = pcz > 0.08 ? {
      x: w / 2 + focal * (pv[0] * ax.Rd[0] + pv[1] * ax.Rd[1] + pv[2] * ax.Rd[2]) / pcz,
      y: h / 2 - focal * (pv[0] * ax.Ud[0] + pv[1] * ax.Ud[1] + pv[2] * ax.Ud[2]) / pcz
    } : null;
  }

  function frame() {
    if (!S.running) return;
    S.raf = requestAnimationFrame(frame);
    if (document.hidden || !S.els) return;
    var stage = S.els.stage, canvas = S.els.canvas;
    var cw = stage.clientWidth, ch = stage.clientHeight;
    if (!cw || !ch) return;
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
      canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    }
    var now = performance.now();
    if (!S.posCache || now - S.posAt > 1000) {
      S.obs = getObs();
      S.posCache = SKY.projectAll(new Date(), S.obs, ALLSTARS);
      S.posAt = now;
    }
    if (!S.pose && now - S.startAt > 2500) S.noPose = true;
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawScene(ctx, cw, ch);
    /* 标签坐标是工作单位（CSS px），与 _state/pick 同口径 */
    var hud = '';
    if (S.pose && S.centerAz != null) hud = tf(t('sx2_ar_hud'), S.centerAz.toFixed(0), S.centerAlt.toFixed(0));
    if (S.noPose) hud = (hud ? hud + ' · ' : '') + t('sx2_ar_nopose');
    if (hud !== S.hudText) { S.hudText = hud; if (S.els.hud) S.els.hud.textContent = hud; }
    S.cssW = cw; S.cssH = ch;
  }

  /* ---------------- 视图与流程 ---------------- */
  function show(id) { var v = $(id); if (v) v.hidden = false; }
  function hide(id) { var v = $(id); if (v) v.hidden = true; }

  function shellHTML() {
    return '<div class="ar-stage' + (cal.red ? ' red' : '') + '" id="ar-stage">' +
      '<video id="ar-video" playsinline muted autoplay></video>' +
      '<canvas id="ar-canvas"></canvas>' +
      '<div class="ar-hud" id="ar-hud"></div>' +
      '<div class="ar-panel" id="ar-panel"></div>' +
      '</div>' +
      '<div class="ar-bar">' +
      '<button class="mini-btn tiny" data-ar="snap">' + esc(t('sx2_ar_snap')) + '</button>' +
      '<button class="mini-btn tiny' + (cal.red ? ' on' : '') + '" data-ar="red">' + esc(t('sx2_ar_red')) + '</button>' +
      '<button class="mini-btn tiny" data-ar="calreset">' + esc(t('sx2_ar_cal_reset')) + '</button>' +
      '<button class="mini-btn tiny" data-ar="tochart">' + esc(t('sx2_ar_tochart')) + '</button>' +
      '</div>' +
      '<div class="sk-hint">' + esc(t('sx2_ar_drag_hint')) + '</div>' +
      '<div class="sx-caliber">' + esc(t('sx2_ar_caliber')) + '</div>';
  }
  function panelHTML(kind) {
    if (kind === 'start') {
      return '<div class="ar-msg">' + esc(t('sx2_ar_intro')) + '</div>' +
        '<button class="btn" data-ar="start">' + esc(t('sx2_ar_start')) + '</button>';
    }
    if (kind === 'starting') return '<div class="ar-msg">' + esc(t('sx2_ar_starting')) + '</div>';
    var msgKey = kind === 'camera' ? 'sx2_ar_cam_fail' : kind === 'orient' ? 'sx2_ar_ori_fail' : 'sx2_ar_nocam';
    return '<div class="ar-msg">' + esc(t(msgKey)) + '</div>' +
      '<button class="btn" data-ar="tochart">' + esc(t('sx2_ar_tochart')) + '</button>' +
      '<button class="mini-btn" data-ar="start">' + esc(t('sx2_ar_retry')) + '</button>';
  }
  function setPanel(kind) {
    if (!S.els || !S.els.panel) return;
    if (!kind) { S.els.panel.hidden = true; S.els.panel.innerHTML = ''; return; }
    S.els.panel.hidden = false;
    S.els.panel.innerHTML = panelHTML(kind);
  }

  function openAR() {
    show('view-sky-ar');
    var host = $('sx-ar'); if (!host) return;
    if (!SKY || !SKY.available) { host.innerHTML = '<div class="sx-loading">' + esc(t('sx_load_fail')) + '</div>'; return; }
    host.innerHTML = shellHTML();
    S.els = { host: host, stage: $('ar-stage'), video: $('ar-video'), canvas: $('ar-canvas'), hud: $('ar-hud'), panel: $('ar-panel') };
    S.fallback = null;
    setPanel('start');
    bindStage();
    loadData().catch(function () {});
  }

  function stopAR() {
    S.running = false;
    if (S.raf) cancelAnimationFrame(S.raf);
    if (S.stream) { S.stream.getTracks().forEach(function (tr) { tr.stop(); }); S.stream = null; }
    if (S.oriBound) { window.removeEventListener('deviceorientation', onOri); S.oriBound = false; }
    if (S.els && S.els.video) S.els.video.srcObject = null;
    S.pose = null; S.posCache = null;
  }

  function fallback(kind) {
    S.fallback = kind;
    if (S.stream) { S.stream.getTracks().forEach(function (tr) { tr.stop(); }); S.stream = null; }
    S.running = false;
    setPanel(kind);
  }

  async function startAR() {
    setPanel('starting');
    /* 第一关：姿态授权（iOS 须在手势内先请） */
    if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        var perm = await DeviceOrientationEvent.requestPermission();
        if (perm !== 'granted') { fallback('orient'); return; }
      } catch (e) { fallback('orient'); return; }
    }
    /* 第二关：相机 */
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { fallback('nocam'); return; }
    var stream = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false });
    } catch (e) { fallback('camera'); return; }
    S.stream = stream;
    var video = S.els.video;
    video.srcObject = stream;
    try { await video.play(); } catch (e) {}
    if (!S.oriBound) { window.addEventListener('deviceorientation', onOri); S.oriBound = true; }
    try { await loadData(); } catch (e) { fallback('camera'); return; }
    S.running = true; S.startAt = performance.now(); S.noPose = false; S.poseAt = 0;
    setPanel(null);
    frame();
  }

  function captureCanvas() {
    var v = S.els && S.els.video;
    if (!v || !v.videoWidth || !v.videoHeight || !S.pose) return null;
    var c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    var ctx = c.getContext('2d');
    ctx.drawImage(v, 0, 0, c.width, c.height);
    drawScene(ctx, c.width, c.height);
    return c;
  }
  function snap() {
    var c = captureCanvas(); if (!c) return;
    c.toBlob(function (blob) {
      if (!blob) return;
      var file = null;
      try { file = new File([blob], 'wuri-sky-ar.jpg', { type: 'image/jpeg' }); } catch (e) {}
      if (file && navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
        navigator.share({ files: [file] }).catch(function () {});
        return;
      }
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'wuri-sky-ar.jpg';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    }, 'image/jpeg', 0.92);
  }

  function bindStage() {
    var canvas = S.els.canvas;
    var drag = null;
    canvas.addEventListener('pointerdown', function (e) {
      drag = { x: e.clientX, y: e.clientY, az: cal.az, alt: cal.alt, moved: 0, t: performance.now() };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!drag || !S.cssH) return;
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy));
      var focalCss = (S.cssH / 2) / Math.tan(VFOV / 2 * D2R);
      cal.az = drag.az + dx / focalCss / D2R;
      cal.alt = drag.alt - dy / focalCss / D2R;
      clampCal();
    });
    canvas.addEventListener('pointerup', function (e) {
      if (!drag) return;
      var wasTap = drag.moved < 8 && performance.now() - drag.t < 500;
      drag = null;
      saveCal();
      if (wasTap) pick(e);
    });
    canvas.addEventListener('pointercancel', function () { drag = null; saveCal(); });
    /* 工具栏在舞台之外，点击委托须绑在视图容器上（面板与工具栏同理）；
     * 宿主元素跨多次打开不重建，委托只绑一次，处理器内一律新鲜查找 */
    var host = S.els.host;
    if (host._arBound) return;
    host._arBound = true;
    host.addEventListener('click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('[data-ar]') : null;
      if (!b) return;
      var act = b.getAttribute('data-ar');
      if (act === 'start') startAR();
      else if (act === 'snap') snap();
      else if (act === 'red') {
        cal.red = !cal.red; saveCal();
        var st = $('ar-stage'); if (st) st.classList.toggle('red', cal.red);
        b.classList.toggle('on', cal.red);
      } else if (act === 'calreset') { cal.az = 0; cal.alt = 0; saveCal(); }
      else if (act === 'tochart') {
        stopAR(); hide('view-sky-ar');
        if (window.WuriSkyChart) window.WuriSkyChart.openChart();
      }
    });
  }

  function pick(e) {
    if (!S.labels.length || !window.Stars || !S.els) return;
    var r = S.els.canvas.getBoundingClientRect();
    var x = e.clientX - r.left, y = e.clientY - r.top;
    var best = null, bestD = 48;
    S.labels.forEach(function (L) {
      var d = Math.hypot(L.x - x, L.y - y);
      if (d < bestD) { bestD = d; best = L.key; }
    });
    if (best) window.Stars.openDetail(best);
  }

  /* ---------------- 入口注入（星象页，继双入口之后的整行卡） ---------------- */
  function injectEntry() {
    var host = $('sx-home'); if (!host || $('sx3-ar-entry')) return;
    var div = document.createElement('div');
    div.id = 'sx3-ar-entry'; div.className = 'sx-duo';
    div.innerHTML = '<div class="sx-card sx-entry" data-sxar="open"><div><div class="e1">' + esc(t('sx2_ar')) + '</div>' +
      '<div class="e2">' + esc(t('sx2_ar_sub')) + '</div></div></div>';
    var duo = $('sx2-entries');
    if (duo && duo.parentNode === host) host.insertBefore(div, duo.nextSibling);
    else host.appendChild(div);
  }
  function watchEntry() {
    var host = $('sx-home');
    if (!host || !window.MutationObserver) { injectEntry(); return; }
    injectEntry();
    new MutationObserver(function () { injectEntry(); }).observe(host, { childList: true });
  }

  /* ---------------- 全局绑定 ---------------- */
  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest ? e.target.closest('[data-sxar]') : null;
    if (el) { openAR(); return; }
    var tab = e.target && e.target.closest ? e.target.closest('#tabbar button') : null;
    if (tab && !$('view-sky-ar').hidden) { stopAR(); hide('view-sky-ar'); }
  });
  var bb;
  if ((bb = $('sky-ar-back'))) bb.addEventListener('click', function () { stopAR(); hide('view-sky-ar'); });

  watchEntry();
  var prev = window.__wuri_rerender;
  window.__wuri_rerender = function () {
    if (prev) prev();
    var d = $('sx3-ar-entry'); if (d) d.remove();
    injectEntry();
  };

  /* ---------- 航向共享（平面星图「跟随手机」模式复用本管线） ----------
   * heading = 手机指向的方位角（度，北 0 东 90）：
   *  相机大体水平时用视线方位；手机平放/朝天时用机顶方向（罗盘航向）。
   * 与 AR 共用 onOri 姿态解算，传感器模式只多挂一个监听、不另起一套。 */
  var headingCbs = [], headBound = false;
  function headingNow() {
    if (!S.pose) return null;
    var ax = camAxes();   /* {Rd 屏幕右, Ud 屏幕上（≈机顶向）, f 视线} 均为 ENU */
    function azOf(v) { return (Math.atan2(v[0], v[1]) / D2R + 360) % 360; }
    if (Math.abs(ax.f[2]) < 0.75) return azOf(ax.f);
    if (Math.abs(ax.Ud[2]) < 0.75) return azOf(ax.Ud);
    return azOf(ax.f);
  }
  function onOriHeading(e) {
    onOri(e);
    var h = headingNow();
    headingCbs.forEach(function (cb) { try { cb(h); } catch (err) {} });
  }
  function watchHeading(cb) {
    if (headingCbs.indexOf(cb) < 0) headingCbs.push(cb);
    if (!headBound) { window.addEventListener('deviceorientation', onOriHeading); headBound = true; }
    if (S.pose) cb(headingNow());
  }
  function unwatchHeading(cb) {
    headingCbs = headingCbs.filter(function (f) { return f !== cb; });
    if (!headingCbs.length && headBound && !S.running) {
      window.removeEventListener('deviceorientation', onOriHeading); headBound = false;
    }
  }
  function requestOrient() {
    if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        return DeviceOrientationEvent.requestPermission()
          .then(function (p) { return p; }, function () { return 'denied'; });
      } catch (e) { return Promise.resolve('denied'); }
    }
    return Promise.resolve('granted');
  }

  window.WuriSkyAR = {
    open: openAR,
    _watchHeading: watchHeading,
    _unwatchHeading: unwatchHeading,
    _requestOrient: requestOrient,
    _headingNow: headingNow,
    /* 冒烟/调试钩子：注入姿态（与真实事件同路）、读状态、设校准、合成图 */
    _injectPose: function (a, b, g) { S.pose = { a: a, b: b, g: g }; S.noPose = false; },
    _state: function () {
      return { running: S.running, hasPose: !!S.pose, noPose: S.noPose, fallback: S.fallback,
        calAz: cal.az, calAlt: cal.alt, segments: S.segments, labels: S.labels,
        centerAz: S.centerAz, centerAlt: S.centerAlt, polePoint: S.polePoint };
    },
    _setCal: function (az, alt) { cal.az = az; cal.alt = alt; clampCal(); saveCal(); },
    _captureDataURL: function () { var c = captureCanvas(); return c ? c.toDataURL('image/png') : null; },
    _stop: stopAR
  };
})();
