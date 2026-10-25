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
 *
 * 【v2.1.1 (1) 紧急修复·事件源】旧版只监听 deviceorientation 并把 α 当
 * 罗盘绝对角用——安卓 Chrome 的该事件是「相对朝向」（游戏旋转矢量，
 * α 零点任意、无磁北参考、靠陀螺积分会漂移乱跳）。2026-10-24 真机实证：
 * 对准月亮 HUD 方位 272°→178°→265° 乱跳（真值 129°），而同机自带指南针
 * 读 131°、咱的高度（靠重力）分毫不差——错不在换算（矩阵经锚点验算无误，
 * 且冒烟的 _injectPose 绕过了事件层、缺口在此），错在事件源。改法：同时
 * 监听 deviceorientationabsolute，只有可信事件（绝对事件类型 /
 * e.absolute===true / iOS 的 webkitCompassHeading 在位）才写入 pose；
 * 只收到相对事件时不写 pose（不拿相对值冒充罗盘）、HUD 明示方位不可靠。
 * 平面星图「跟随手机」共用同一 ingest 管线，一并修复。
 * 真机手感（跟随延迟、罗盘漂移量级、横屏 φ 符号）沙箱无从验，留真机验收。
 *
 * 【v2.1.1 (2) 对齐两层】(1) 修好事件源后真机复测（21:48 对月）HUD 仍偏
 * +20°/+2°：安卓绝对事件的 α 以磁北为零点、代码按真北用，差一个磁偏角。
 * 第一层：ingest 时对磁北口径事件（绝对事件类型 / absolute===true 且无
 * webkitCompassHeading）按观测地＋日期用 WMM2025 磁偏角（引擎
 * WuriSky.declination）把 α 旋到真北系：pose.a = α − δ（δ 东正西负，
 * St-Hubert 2026-10 约 −13.7°）；iOS 的 webkitCompassHeading 是真北
 * 口径（CLHeading），在位时不修正，防二次叠加。第二层：AR 内一键天体
 * 对齐（工具栏「对齐」钮）：选地平线上的月亮/行星、移到准星正中央点
 * 「已对准」，以引擎真值与当前中心读数之差（读数已含磁偏角修正）覆写
 * 共享校准存储 cal（与拖动同一 wuri_sky_ar_cal_v1、后写覆盖）；
 * |Δaz|>60 或 |Δalt|>30 判罗盘受干扰、拒绝保存并提示先画「8」字。
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

  /* ---------------- 数据（与 stars/sky-chart 共享同一份加载结果） ----------------
   * 走 WuriSky.starData()（v2.1.1 (4) 双通道 fetch→XHR），不得另起
   * fetch 读包内 data/*.json（原生 WebView 下 fetch 读 file:// 必失败） */
  var XG = null, dataPromise = null, ASTS = [], ALLSTARS = [];
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

  /* ---------------- 校准存档 ----------------
   * src 记录最近一次写入来源：一键对齐写入 {body, at}，拖动/重置对齐清除。
   * 旧档无 src 字段 → 读为 null，向后兼容。 */
  var CAL_KEY = 'wuri_sky_ar_cal_v1';
  var cal = (function () {
    try {
      var j = JSON.parse(localStorage.getItem(CAL_KEY) || 'null');
      if (j) return { az: +j.az || 0, alt: +j.alt || 0, red: !!j.red, src: j.src || null };
    } catch (e) {}
    return { az: 0, alt: 0, red: false, src: null };
  })();
  function saveCal() {
    try { localStorage.setItem(CAL_KEY, JSON.stringify(cal)); } catch (e) {}
  }
  function clampCal() {
    /* 方位量程 45→60：一键对齐的合理性上限就是 |Δaz|≤60，拖动钳制须
     * 覆盖同一包线，否则对齐存下的大偏移会在下一次拖动首帧被削掉 */
    cal.az = Math.max(-60, Math.min(60, cal.az));
    cal.alt = Math.max(-45, Math.min(45, cal.alt));
  }

  /* ---------------- 状态 ---------------- */
  var S = {
    running: false, stream: null, raf: 0, pose: null, poseAt: 0, startAt: 0,
    noPose: false, fallback: null, posCache: null, posAt: 0, msgText: '', msgUntil: 0,
    bodyCache: null, bodyAt: 0, bodyPts: [], moonIllum: null, moonWaxing: true,
    labels: [], segments: 0, hudText: '', els: null, oriBound: false,
    absSeen: false, relSeen: false, alignTarget: null
  };

  /* 姿态事件 ingest（AR 与星图跟随共用，根因与口径见文件头注）：
   * 只有「可信」事件才写 pose——绝对事件类型 deviceorientationabsolute、
   * 或 e.absolute===true、或 iOS Safari 的 webkitCompassHeading 在位
   * （iOS 不发 absolute 事件类型、其 deviceorientation 本就是罗盘参考，
   * 以该字段在位为信任信号，α 用法与旧版一致、不回归）。相对事件只记
   * relSeen 供 HUD 明示不可靠，绝不写入 pose 冒充罗盘。
   * 可信事件再分口径（v2.1.1 (2) 磁偏角层）：
   *   'ios'＝webkitCompassHeading 在位——真北口径，不修正；
   *   'mag'＝安卓绝对事件——α 以磁北为零点，须按磁偏角旋到真北系。 */
  function oriSource(e, fromAbsType) {
    if (typeof e.webkitCompassHeading === 'number' && e.webkitCompassHeading >= 0) return 'ios';
    if (fromAbsType) return 'mag';
    if (e.absolute === true) return 'mag';
    return null;
  }
  /* 当前观测地的磁偏角（WMM2025，按月缓存；观测地变更即重算） */
  var declCache = { key: '', val: 0 };
  function currentDecl() {
    var o = getObs(), now = new Date();
    var key = o.lat.toFixed(3) + ',' + o.lon.toFixed(3) + ',' + now.getFullYear() + '-' + now.getMonth();
    if (declCache.key !== key) {
      declCache = { key: key, val: (SKY && SKY.declination) ? SKY.declination(o.lat, o.lon, now) : 0 };
    }
    return declCache.val;
  }
  function ingestOri(e, fromAbsType) {
    if (!e || e.alpha == null) return false;
    var src = oriSource(e, fromAbsType);
    if (!src) { if (!S.absSeen) S.relSeen = true; return false; }
    S.absSeen = true; S.relSeen = false;
    var a = e.alpha;
    /* 磁北→真北：绕天顶轴旋 δ（真方位 = 磁方位 + δ），等价于 pose.a = α − δ */
    if (src === 'mag') a = ((a - currentDecl()) % 360 + 360) % 360;
    S.pose = { a: a, b: e.beta || 0, g: e.gamma || 0 };
    S.poseAt = performance.now();
    S.noPose = false;
    return true;
  }
  function onOri(e) { ingestOri(e, false); }
  function onOriAbs(e) { ingestOri(e, true); }
  /* 绑定/解绑必须双事件对称（相对＋绝对），stop/退订不留残监听 */
  function bindOri(hRel, hAbs) {
    window.addEventListener('deviceorientation', hRel);
    window.addEventListener('deviceorientationabsolute', hAbs);
  }
  function unbindOri(hRel, hAbs) {
    window.removeEventListener('deviceorientation', hRel);
    window.removeEventListener('deviceorientationabsolute', hAbs);
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

  /* 场景绘制：ctx 已按工作尺寸设好变换；w/h 为工作单位（显示时 = CSS px）。
   * keepBase=true 时不 clearRect——拍照合成的底图已画在同一画布上，
   * 清屏会把实景帧整张擦掉（v2.1.0 (6) 修的黑底合成图根因） */
  function drawScene(ctx, w, h, keepBase) {
    S.labels = []; S.segments = 0;
    if (!keepBase) ctx.clearRect(0, 0, w, h);
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
    /* 月亮/行星投影点（与星点同一姿态管线；太阳投影点供月相暗盘定背阳向） */
    var bpts = [];
    if (S.bodyCache) {
      var projBody = function (alt, az) {
        var v = starVec(alt + cal.alt, az + cal.az);
        var cz = v[0] * ax.f[0] + v[1] * ax.f[1] + v[2] * ax.f[2];
        if (cz <= 0.08) return null;
        return { x: w / 2 + focal * (v[0] * ax.Rd[0] + v[1] * ax.Rd[1] + v[2] * ax.Rd[2]) / cz,
                 y: h / 2 - focal * (v[0] * ax.Ud[0] + v[1] * ax.Ud[1] + v[2] * ax.Ud[2]) / cz };
      };
      S.bodyCache.forEach(function (B) {
        var pt = projBody(B.alt, B.az);
        if (pt) { pt.B = B; bpts.push(pt); }
      });
      var sunAA = SKY.sunAltAz ? SKY.sunAltAz(new Date(), S.obs || SKY.DEFAULT_OBS) : null;
      var sunPt = sunAA ? projBody(sunAA.alt, sunAA.az) : null;
      bpts.sunPt = sunPt;
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
    /* 月亮/行星标记（v2.1.1）：月亮带月相盘面（亮盘＋背阳暗盘，偏移
     * 2r·照亮比，与星图同一影圆模型）、行星本色圆点；红光下走红谱 */
    S.bodyPts = [];
    bpts.forEach(function (pt) {
      if (pt.x < -20 || pt.x > w + 20 || pt.y < -20 || pt.y > h + 20) return;
      var B = pt.B;
      if (B.kind === 'moon') {
        var rM2 = 7, il2 = S.moonIllum == null ? 0.5 : S.moonIllum;
        var sdx2 = S.moonWaxing ? 1 : -1, sdy2 = 0;
        if (bpts.sunPt) { var vx2 = bpts.sunPt.x - pt.x, vy2 = bpts.sunPt.y - pt.y, vl2 = Math.hypot(vx2, vy2); if (vl2 > 1) { sdx2 = vx2 / vl2; sdy2 = vy2 / vl2; } }
        /* 暗盘裁剪在亮盘内（同星图）：亮实景下不裁剪会在月旁留独立暗圆 */
        ctx.save();
        ctx.beginPath(); ctx.arc(pt.x, pt.y, rM2, 0, 6.2832); ctx.clip();
        ctx.fillStyle = red ? '#ff8a6a' : '#e9d9a8';
        ctx.beginPath(); ctx.arc(pt.x, pt.y, rM2, 0, 6.2832); ctx.fill();
        ctx.fillStyle = red ? 'rgba(24,5,3,0.92)' : 'rgba(13,18,28,0.92)';
        ctx.beginPath(); ctx.arc(pt.x - sdx2 * 2 * rM2 * il2, pt.y - sdy2 * 2 * rM2 * il2, rM2, 0, 6.2832); ctx.fill();
        ctx.restore();
        ctx.strokeStyle = red ? 'rgba(255,138,106,0.8)' : 'rgba(233,217,168,0.55)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(pt.x, pt.y, rM2, 0, 6.2832); ctx.stroke();
      } else {
        ctx.fillStyle = red ? '#ff7a5c' : (B.color || '#fff6da');
        ctx.beginPath(); ctx.arc(pt.x, pt.y, 3.6, 0, 6.2832); ctx.fill();
      }
      S.bodyPts.push({ id: B.id, x: pt.x, y: pt.y, alt: B.alt, az: B.az });
    });
    /* 标签层（最亮星在视场内、高度 >0、≤ 星等设定；文字以屏幕系
     * fillText 水平绘制，天然恒正立，不随姿态旋转）。
     * 月亮/行星标签先登记（优先级最高）：不受星等分级约束、恒显，
     * pick 时与星官标签同表竞近。 */
    ctx.font = '12px "Songti SC", "Noto Serif CJK SC", serif';
    ctx.textAlign = 'center';
    bpts.forEach(function (pt) {
      if (pt.x < 16 || pt.x > w - 16 || pt.y < 20 || pt.y > h - 6) return;
      var nm3 = t('sx2_body_' + pt.B.id);
      ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(8,8,14,0.65)';
      ctx.strokeText(nm3, pt.x, pt.y - 13);
      ctx.fillStyle = colLabel;
      ctx.fillText(nm3, pt.x, pt.y - 13);
      S.labels.push({ body: pt.B.id, x: pt.x, y: pt.y - 13 });
    });
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
      /* 月亮/行星位置与恒星同节拍刷新（1 秒）：走 SKY.bodyPos 同一引擎口径 */
      S.bodyCache = (SKY.BODIES || []).map(function (bd) {
        var p = SKY.bodyPos ? SKY.bodyPos(new Date(), S.obs, bd.id) : null;
        return p ? { id: bd.id, kind: bd.kind, color: bd.color, alt: p.alt, az: p.az } : null;
      }).filter(Boolean);
      var mpA = (window.WuriTodaySky && WuriTodaySky.moonPhaseOf) ? WuriTodaySky.moonPhaseOf(new Date()) : null;
      S.moonIllum = mpA ? mpA.illumination : null;
      S.moonWaxing = mpA ? mpA.elongationDeg < 180 : true;
      S.bodyAt = now;
    }
    if (!S.pose && now - S.startAt > 2500) S.noPose = true;
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawScene(ctx, cw, ch);
    /* 标签坐标是工作单位（CSS px），与 _state/pick 同口径 */
    var hud = '';
    var flashOn = !!(S.msgText && now < S.msgUntil);
    if (flashOn) hud = S.msgText;
    else if (S.pose && S.centerAz != null) hud = tf(t('sx2_ar_hud'), S.centerAz.toFixed(0), S.centerAlt.toFixed(0));
    /* 旧守卫 hud!==S.msgText 在初始态 ''!=='' 为假，无姿态提示永远出不来
     * （v2.1.1 (1) 冒烟实证）——改为「闪烁消息在期则让位」为准 */
    if (S.noPose && !flashOn) hud = (hud ? hud + ' · ' : '') + t(S.relSeen && !S.absSeen ? 'sx2_ar_relnav' : 'sx2_ar_nopose');
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
      /* 舞台内快门钮（v2.1.0 (8)：取代原视图级悬浮返回键——它悬在舞台外
       * 左下、压工具栏「拍照」钮。快门收进舞台框内左下，与工具栏拍照钮
       * 同走 data-ar="snap" 委托 → 同一 snap() 合成流程（含死帧报错）；
       * 面板（开启/回落）显示时藏起，见 setPanel 的联动。 */
      '<button class="ar-shutter" id="ar-shutter" data-ar="snap" hidden title="' + esc(t('sx2_ar_snap')) + '" aria-label="' + esc(t('sx2_ar_snap')) + '"></button>' +
      '</div>' +
      '<div class="ar-bar">' +
      /* 一键天体对齐（v2.1.1 (2)）：整行主钮，置于 2×2 网格上方；
       * 红光时 .red 低亮红谱（applyRed/shellHTML 双路同步 class） */
      '<button class="ar-align-btn' + (cal.red ? ' red' : '') + '" data-ar="align">' + esc(t('sx2_ar_align')) + '</button>' +
      '<button class="mini-btn tiny" data-ar="snap">' + esc(t('sx2_ar_snap')) + '</button>' +
      '<button class="mini-btn tiny' + (cal.red ? ' on' : '') + '" data-ar="red">' + esc(t('sx2_ar_red')) + '</button>' +
      '<button class="mini-btn tiny" data-ar="calreset">' + esc(t('sx2_ar_cal_reset')) + '</button>' +
      '<button class="mini-btn tiny" data-ar="tochart">' + esc(t('sx2_ar_tochart')) + '</button>' +
      '</div>' +
      '<div class="sk-hint">' + esc(t('sx2_ar_drag_hint')) + '</div>' +
      '<div class="sx-caliber">' + esc(t('sx2_ar_caliber')) + '</div>';
  }
  /* 一键对齐的目标表：月亮（在地平线上时置顶）＋五大行星中在地平线
   * 上的，按高度降序；位置走引擎 bodyPos、与渲染层同一口径 */
  function alignTargets() {
    if (!SKY || !SKY.bodyPos) return [];
    var obs = getObs(), now = new Date(), out = [];
    (SKY.BODIES || []).forEach(function (bd) {
      var pp = SKY.bodyPos(now, obs, bd.id);
      if (pp && pp.alt > 0) out.push({ id: bd.id, kind: bd.kind, alt: pp.alt, az: pp.az });
    });
    out.sort(function (x, y) {
      if (x.kind === 'moon' && y.kind !== 'moon') return -1;
      if (y.kind === 'moon' && x.kind !== 'moon') return 1;
      return y.alt - x.alt;
    });
    return out;
  }
  function panelHTML(kind) {
    if (kind === 'start') {
      return '<div class="ar-msg">' + esc(t('sx2_ar_intro')) + '</div>' +
        '<div class="ar-msg dim">' + esc(t('sx2_ar_cal_hint1')) + '<br>' + esc(t('sx2_ar_cal_hint2')) + '<br>' + esc(t('sx2_ar_align_hint')) + '</div>' +
        '<button class="btn" data-ar="start">' + esc(t('sx2_ar_start')) + '</button>';
    }
    if (kind === 'align') {
      var tg = alignTargets(), h = '<div class="ar-msg">' + esc(t('sx2_ar_align_title')) + '</div>';
      if (!tg.length) h += '<div class="ar-msg dim">' + esc(t('sx2_ar_align_none')) + '</div>';
      tg.forEach(function (bd) {
        h += '<button class="btn ar-target" data-ar="alignpick" data-id="' + bd.id + '">' +
          esc(t('sx2_body_' + bd.id)) + ' · ' + esc(tf(t('sx2_info_alt'), bd.alt.toFixed(0))) + '</button>';
      });
      return h + '<button class="mini-btn" data-ar="aligncancel">' + esc(t('sx2_ar_cancel')) + '</button>';
    }
    if (kind === 'aligning') {
      /* 指引态面板用 .guide 紧凑底条（见 setPanel），舞台与准星保持可见 */
      return '<div class="ar-msg">' + esc(tf(t('sx2_ar_align_guide'), S.alignTarget ? t('sx2_body_' + S.alignTarget) : '')) + '</div>' +
        '<button class="btn" data-ar="alignok">' + esc(t('sx2_ar_align_ok')) + '</button>' +
        '<button class="mini-btn" data-ar="aligncancel">' + esc(t('sx2_ar_cancel')) + '</button>';
    }
    if (kind === 'starting') return '<div class="ar-msg">' + esc(t('sx2_ar_starting')) + '</div>';
    var msgKey = kind === 'camera' ? 'sx2_ar_cam_fail' : kind === 'orient' ? 'sx2_ar_ori_fail' : 'sx2_ar_nocam';
    return '<div class="ar-msg">' + esc(t(msgKey)) + '</div>' +
      '<button class="btn" data-ar="tochart">' + esc(t('sx2_ar_tochart')) + '</button>' +
      '<button class="mini-btn" data-ar="start">' + esc(t('sx2_ar_retry')) + '</button>';
  }
  function setPanel(kind) {
    if (!S.els || !S.els.panel) return;
    /* 快门钮只在相机运行中（无面板）时露面：开启面板/回落面板在场时藏起，
     * 免得隔着半透明面板误点、也免得在无相机时点了只换来报错 */
    var sh = $('ar-shutter'); if (sh) sh.hidden = !!kind;
    /* 对齐指引态不用整屏面板（会盖住准星与实景）：改紧凑底条 */
    S.els.panel.classList.toggle('guide', kind === 'aligning');
    if (!kind) { S.els.panel.hidden = true; S.els.panel.innerHTML = ''; return; }
    S.els.panel.hidden = false;
    S.els.panel.innerHTML = panelHTML(kind);
  }

  /* 红光与星象全模块总开关共用同一状态（v2.1.0 (9)，stars.js WuriRedlight）：
   * 开 AR 时从总开关同步 cal.red；AR 内点红光钮走总开关 set（全模块同步） */
  function applyRed(v) {
    cal.red = !!v; saveCal();
    var st = $('ar-stage'); if (st) st.classList.toggle('red', cal.red);
    var rb = document.querySelector('#sx-ar [data-ar="red"]');
    if (rb) rb.classList.toggle('on', cal.red);
    var ab = document.querySelector('#sx-ar [data-ar="align"]');
    if (ab) ab.classList.toggle('red', cal.red);
  }

  function openAR() {
    show('view-sky-ar');
    var host = $('sx-ar'); if (!host) return;
    if (window.WuriRedlight) cal.red = window.WuriRedlight.on();
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
    if (S.oriBound) { unbindOri(onOri, onOriAbs); S.oriBound = false; }
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
    S.absSeen = false; S.relSeen = false;
    if (!S.oriBound) { bindOri(onOri, onOriAbs); S.oriBound = true; }
    try { await loadData(); } catch (e) { fallback('camera'); return; }
    S.running = true; S.startAt = performance.now(); S.noPose = false; S.poseAt = 0;
    setPanel(null);
    frame();
  }

  /* ---------- 一键天体对齐（v2.1.1 (2)） ----------
   * 保存值口径：渲染层以「星位 + cal」绘制，故要让被对准的天体标记落回
   * 准星，cal 须等于「当前中心读数 − 天体真值」（读数出自 drawScene 的
   * centerAz/centerAlt，已含磁偏角修正）。与拖动共用 cal 与存档、后写
   * 覆盖；偏差过大（|Δaz|>60 或 |Δalt|>30）判罗盘受干扰、拒存。 */
  function wrap180(x) { x = ((x % 360) + 360) % 360; return x > 180 ? x - 360 : x; }
  function fmtSigned(v) { var r = Math.round(v); return r === 0 ? '0' : (r > 0 ? '+' + r : '−' + Math.abs(r)); }
  function doAlign() {
    var id = S.alignTarget;
    S.alignTarget = null;
    if (!id || !SKY || !SKY.bodyPos) { setPanel(null); return; }
    if (S.centerAz == null || S.centerAlt == null) { setPanel(null); flashMsg(t('sx2_ar_nopose')); return; }
    var pos = SKY.bodyPos(new Date(), getObs(), id);
    if (!pos) { setPanel(null); return; }
    var dAz = wrap180(S.centerAz - pos.az);
    var dAlt = S.centerAlt - pos.alt;
    setPanel(null);
    if (Math.abs(dAz) > 60 || Math.abs(dAlt) > 30) { flashMsg(t('sx2_ar_align_too_big')); return; }
    cal.az = dAz; cal.alt = dAlt; cal.src = { body: id, at: Date.now() };
    saveCal();
    flashMsg(tf(t('sx2_ar_aligned'), t('sx2_body_' + id), fmtSigned(dAz), fmtSigned(dAlt)));
  }

  /* ---------- 拍照合成（v2.1.0 (6) 重做） ----------
   * 旧版三宗罪：①先把 video 帧画进合成画布、再调 drawScene，而 drawScene
   * 开头 clearRect 把刚画的实景帧整张擦掉，JPEG 无 alpha 通道 → 成品必然
   * 黑底（用户真机实证：只有星点/连线/标签/准星、实景一帧没进来）；
   * ②合成用视频原始宽高比，与预览 object-fit:cover 的裁切几何不一致，
   * 星层会与实景错位；③安卓 Chrome 对直播 <video> 直接 drawImage 可能
   * 取到黑帧，旧版对此毫无检测、拿黑底交差。
   * 新版：ImageCapture.grabFrame() 优先抓帧（回落 drawImage 且要求
   * readyState≥2、videoWidth>0）→ 按预览同一 cover 口径裁切画满 →
   * 死帧检测（采样 ≥99% 近纯黑判死）→ 不过关等 260ms 重抓一次 →
   * 再不过关明确报错不产图；星层用与预览完全相同的变换
   * （舞台 CSS 尺寸 × dpr、drawScene keepBase）叠上，所见即所得。 */
  function flashMsg(text) { S.msgText = text; S.msgUntil = performance.now() + 3400; }

  async function grabFrame() {
    var track = S.stream && S.stream.getVideoTracks && S.stream.getVideoTracks()[0];
    if (track && window.ImageCapture) {
      try {
        var bmp = await new ImageCapture(track).grabFrame();
        if (bmp && bmp.width > 0 && bmp.height > 0) return { src: bmp, w: bmp.width, h: bmp.height, bmp: bmp };
      } catch (e) { /* 落回 drawImage */ }
    }
    var v = S.els && S.els.video;
    if (v && v.readyState >= 2 && v.videoWidth > 0 && v.videoHeight > 0) {
      return { src: v, w: v.videoWidth, h: v.videoHeight, bmp: null };
    }
    return null;
  }

  /* 按 object-fit:cover 的同一口径把源帧裁切画满目标矩形 */
  function drawBaseCover(ctx, src, sw, sh, W, H) {
    var sa = sw / sh, ta = W / H, cw, ch, cx, cy;
    if (sa > ta) { ch = sh; cw = sh * ta; cx = (sw - cw) / 2; cy = 0; }
    else { cw = sw; ch = sw / ta; cx = 0; cy = (sh - ch) / 2; }
    ctx.drawImage(src, cx, cy, cw, ch, 0, 0, W, H);
  }

  /* 死帧检测：24×24 采样网格中 ≥99% 像素近纯黑（max(r,g,b)≤3）判死帧。
   * 真夜空照片有传感器噪声与梯度、达不到这个均匀度；drawImage 取空帧
   * 则是整张纯 0 —— 只拦后者，宁可报错也不拿黑底交差。 */
  function frameAlive(c) {
    var t = document.createElement('canvas'); t.width = 24; t.height = 24;
    var x = t.getContext('2d'); if (!x) return true;
    x.drawImage(c, 0, 0, 24, 24);
    var d;
    try { d = x.getImageData(0, 0, 24, 24).data; } catch (e) { return true; }
    var dark = 0, n = 0;
    for (var i = 0; i < d.length; i += 4) { n++; if (Math.max(d[i], d[i + 1], d[i + 2]) <= 3) dark++; }
    return n > 0 && dark / n < 0.99;
  }

  async function capturePhoto() {
    var stage = S.els && S.els.stage;
    if (!stage || !S.pose || !S.running) return null;
    var W = stage.clientWidth, H = stage.clientHeight;
    if (!W || !H) return null;
    var scale = Math.min(2, window.devicePixelRatio || 1);
    for (var attempt = 0; attempt < 2; attempt++) {
      var fr = await grabFrame();
      if (fr) {
        var c = document.createElement('canvas');
        c.width = Math.round(W * scale); c.height = Math.round(H * scale);
        var ctx = c.getContext('2d');
        /* 红光模式下预览对 video 有 CSS 滤镜，合成底图按同滤镜过一遍再叠红星层 */
        if (cal.red && 'filter' in ctx) ctx.filter = 'brightness(.78) sepia(1) hue-rotate(-52deg) saturate(3.2)';
        drawBaseCover(ctx, fr.src, fr.w, fr.h, c.width, c.height);
        ctx.filter = 'none';
        if (fr.bmp && fr.bmp.close) fr.bmp.close();
        if (frameAlive(c)) {
          ctx.setTransform(scale, 0, 0, scale, 0, 0);
          drawScene(ctx, W, H, true);
          return c;
        }
      }
      if (attempt === 0) await new Promise(function (r) { setTimeout(r, 260); });
    }
    return null;
  }

  async function snap() {
    var c = await capturePhoto();
    if (!c) { flashMsg(t('sx2_ar_snap_fail')); return; }
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
      if (drag.moved > 2) cal.src = null;   /* 拖动接管：对齐来源标记作废 */
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
      else if (act === 'align') { if (S.running) setPanel('align'); }
      else if (act === 'alignpick') { S.alignTarget = b.getAttribute('data-id'); setPanel('aligning'); }
      else if (act === 'alignok') doAlign();
      else if (act === 'aligncancel') { S.alignTarget = null; setPanel(null); }
      else if (act === 'red') {
        if (window.WuriRedlight) window.WuriRedlight.set(!cal.red);
        else applyRed(!cal.red);
      } else if (act === 'calreset') { cal.az = 0; cal.alt = 0; cal.src = null; saveCal(); }
      else if (act === 'tochart') {
        stopAR(); hide('view-sky-ar');
        if (window.WuriSkyChart) window.WuriSkyChart.openChart();
      }
    });
  }

  function pick(e) {
    if (!S.labels.length || !S.els) return;
    var r = S.els.canvas.getBoundingClientRect();
    var x = e.clientX - r.left, y = e.clientY - r.top;
    var best = null, bestD = 48;
    S.labels.forEach(function (L) {
      var d = Math.hypot(L.x - x, L.y - y);
      if (d < bestD) { bestD = d; best = L; }
    });
    if (!best) return;
    if (best.body) {
      /* 月亮/行星没有详情页：点选在 HUD 出信息（名＋身份＋当前方位/高度
       * ＋今晚最佳），不跳星官详情 */
      var B = null;
      (S.bodyCache || []).forEach(function (bb) { if (bb.id === best.body) B = bb; });
      if (!B) return;
      var bk = (window.WuriSkyChart && WuriSkyChart.bestBody) ? WuriSkyChart.bestBody(B.id) : null;
      var p2 = function (n) { return (n < 10 ? '0' : '') + n; };
      var s = t('sx2_body_' + B.id) + ' · ' + t(B.kind === 'moon' ? 'sx2_kind_moon' : 'sx2_kind_planet') + ' · ' +
        tf(t('sx2_info_alt'), B.alt.toFixed(0)) + ' · ' + tf(t('sx2_info_az'), (((B.az % 360) + 360) % 360).toFixed(0)) + ' · ' +
        tf(t('sx2_info_best'), bk && bk.alt >= 0 ? p2(bk.date.getHours()) + ':' + p2(bk.date.getMinutes()) : '—');
      if (B.kind === 'moon' && S.moonIllum != null) s += ' · ' + tf(t('sx_moon_illum'), (Math.round(S.moonIllum * 1000) / 10).toFixed(1));
      flashMsg(s);
      return;
    }
    if (best.key && window.Stars) window.Stars.openDetail(best.key);
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

  /* 星象页悬浮相机钮（v2.1.0 (3) 方案2）：#sx-ar-fab 仅在星象标签激活时显示，
   * 跟随 #tabbar 的 active 态同步（MutationObserver 监听 class 变化，覆盖点击与
   * 程序化切标签）；钮带 data-sxar="open"，点击走上方既有委托 → openAR，
   * 开启面板→「开启」手势内请姿态授权的链与深层入口完全一致、不另起炉灶。
   * 钮 z-40 低于所有 .view(50)，任一子视图打开时被自然盖住，不会浮在详情上。 */
  function syncArFab() {
    var fab = $('sx-ar-fab'); if (!fab) return;
    var on = !!document.querySelector('#tabbar button[data-tab="tab-stars"].active');
    fab.hidden = !on;
  }
  if (window.MutationObserver) {
    var tbEl = $('tabbar');
    if (tbEl) new MutationObserver(syncArFab).observe(tbEl, { attributes: true, subtree: true, attributeFilter: ['class'] });
  }
  document.addEventListener('click', function (e) {
    if (e.target && e.target.closest && e.target.closest('#tabbar button')) setTimeout(syncArFab, 0);
  });
  syncArFab();

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
  function emitHeading() {
    var h = headingNow();
    headingCbs.forEach(function (cb) { try { cb(h); } catch (err) {} });
  }
  /* 与 AR 同一 ingest：相对事件不写 pose，且不触发航向发射——哪怕值出自
   * 此前的可信 pose，陈旧航向也不冒充实时跟随（冒烟 T7 实证后收紧） */
  function onOriHeading(e) { if (ingestOri(e, false)) emitHeading(); }
  function onOriHeadingAbs(e) { if (ingestOri(e, true)) emitHeading(); }
  function watchHeading(cb) {
    if (headingCbs.indexOf(cb) < 0) headingCbs.push(cb);
    if (!headBound) { bindOri(onOriHeading, onOriHeadingAbs); headBound = true; }
    if (S.pose) cb(headingNow());
  }
  function unwatchHeading(cb) {
    headingCbs = headingCbs.filter(function (f) { return f !== cb; });
    if (!headingCbs.length && headBound && !S.running) {
      unbindOri(onOriHeading, onOriHeadingAbs); headBound = false;
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
    /* 红光总开关联动（stars.js WuriRedlight.set 调用）：只做 AR 侧应用，不回调总开关 */
    setRed: function (v) { applyRed(v); },
    /* 供跨模块来源栈收起（stars.js openDeity）：停相机/姿态并收起视图；
     * 恢复时走 open() 重开回开启面板，不揭旧壳 */
    close: function () { stopAR(); hide('view-sky-ar'); },
    _watchHeading: watchHeading,
    _unwatchHeading: unwatchHeading,
    _requestOrient: requestOrient,
    _headingNow: headingNow,
    /* 冒烟/调试钩子：注入姿态（与真实事件同路）、读状态、设校准、合成图 */
    _injectPose: function (a, b, g) { S.pose = { a: a, b: b, g: g }; S.noPose = false; },
    _state: function () {
      return { running: S.running, hasPose: !!S.pose, noPose: S.noPose, fallback: S.fallback,
        absSeen: !!S.absSeen, relSeen: !!S.relSeen,
        calAz: cal.az, calAlt: cal.alt, calSrc: cal.src, decl: currentDecl(), alignTarget: S.alignTarget,
        segments: S.segments, labels: S.labels, bodies: S.bodyPts,
        centerAz: S.centerAz, centerAlt: S.centerAlt, polePoint: S.polePoint };
    },
    _setCal: function (az, alt) { cal.az = az; cal.alt = alt; clampCal(); saveCal(); },
    _captureDataURL: async function () { var c = await capturePhoto(); return c ? c.toDataURL('image/png') : null; },
    _stop: stopAR
  };
})();
