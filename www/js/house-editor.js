/* 户型图编辑器 · 家宅档案第二批 A（2026-10-26）
 *
 * 独立全屏画图页（#view-plan）：从档案详情某层进入，整页只画图；
 * 每步自动保存（每次编辑动作即写 Dexie plans 表，floorId 主键，一层一图）、
 * 撤销/重做栈、右上「完成」收口回详情（详情楼层预览读同一 plan 出缩略）。
 * 数据模型借 blueprint3d 的角/墙/房间半边思想按「房间块」降维实现：
 *   plan{floorId,houseId,updated,mPerUnit,rooms[{id,x,y,w,h,name,type}],
 *        fixtures[{id,type,x,y,rot,flip}],trace{photoId,corners,rect,opacity},
 *        liji{x,y},layers{rooms,fixtures,dims,overlay,palNames,roomNames,traceBg,ovOpacity}}
 * 坐标一律「计划单位」，米 = 单位 × mPerUnit（描图校准后定标，手绘默认 1）。
 * 方向硬规矩：图按档案定稿坐向朝上（上＝向首），整图不许自由旋转；
 * 改向只能回档案改定稿——罗盘→档案→户型→报告一条事实链。
 * 透视拉正：Canvas 三角网格仿射 warp（标准单应网格法，自研实现，无第三方件）。
 * 叠盘：飞星走 WuriSoulFs.buildChart（与飞星页同引擎同口径），
 * 八宅扇走 houseGua 的 palacesFor（宅卦）；均以定稿坐向投影到本层。
 */
(function () {
  'use strict';
  var H = window.__wuriHouse;
  if (!H || !H.db) return;
  var db = H.db;
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
  function txs(s) { return window.txPoem ? window.txPoem(s) : s; }
  function toastMsg(m) {
    var t = document.getElementById('wuri-ai-toast');
    if (t) { t.textContent = m; t.style.display = 'block'; clearTimeout(t._tm); t._tm = setTimeout(function () { t.style.display = 'none'; }, 2600); }
  }
  function norm360(d) { return ((d % 360) + 360) % 360; }
  function trimNum(v, dp) {
    var p = Math.pow(10, dp == null ? 1 : dp);
    var r = Math.round(v * p) / p;
    return String(r);
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  var uidC = 0;
  function uid() { return Date.now().toString(36) + (uidC++).toString(36); }

  /* ---------------- 构件符号库（12+2 件，风水敏感优先，单色线刻） ----------------
   * art 为 bw×bh 盒内路径（stroke currentColor 口径），渲染时按 w×h 米缩放。 */
  /* sw＝金锁玉关内五行砂/水属性（本批只落数据与标识，逐宫判定下批）：
   * 砂 sha＝床位/锅灶/神位/办公桌/电器/橱柜（高、实）；水 shui＝门/窗/楼梯/厕/浴/鱼缸（低、空、动）。 */
  var FIX = {
    door:     { cat: 'doorwin', sw: 'shui', w: 0.9, h: 0.9, box: [30, 30], wall: 1, art: '<path d="M3 27 V3 A24 24 0 0 1 27 27" fill="none" stroke-dasharray="2.5 2.5"/><path d="M3 27 V4" stroke-width="2.6" fill="none"/>' },
    sdoor:    { cat: 'doorwin', sw: 'shui', w: 1.5, h: 0.3, box: [30, 6], wall: 1, art: '<path d="M1 1.5 H29 M1 4.5 H29 M8 0 V6 M22 0 V6" fill="none"/>' },
    window:   { cat: 'doorwin', sw: 'shui', w: 1.5, h: 0.3, box: [30, 7], wall: 1, art: '<path d="M1 1 H29 M1 3.5 H29 M1 6 H29 M15 1 V6" fill="none"/>' },
    stairs:   { cat: 'stairs', sw: 'shui', w: 1.0, h: 2.8, box: [30, 84], art: '<path d="M3 6 H27 M3 18 H27 M3 30 H27 M3 42 H27 M3 54 H27 M3 66 H27 M3 78 H27" fill="none"/><path d="M15 80 V10 M11.5 16 L15 8 L18.5 16" fill="none"/>' },
    bed:      { cat: 'furn', sw: 'sha', w: 1.5, h: 2.0, box: [30, 40], art: '<rect x="2" y="2" width="26" height="36" fill="none"/><path d="M2 11 H28 M15 2 V11" fill="none"/>' },
    sofa:     { cat: 'furn', sw: null, w: 1.8, h: 0.9, box: [36, 18], art: '<rect x="3" y="3" width="30" height="12" rx="4" fill="none"/><path d="M3 9 H0 M33 9 H36 M9 15 v3 M27 15 v3" fill="none"/>' },
    desk:     { cat: 'furn', sw: 'sha', w: 1.2, h: 0.6, box: [30, 15], art: '<rect x="2" y="2" width="26" height="11" fill="none"/><path d="M2 9 H28" fill="none"/>' },
    wardrobe: { cat: 'furn', sw: 'sha', w: 1.2, h: 0.6, box: [30, 15], art: '<rect x="2" y="2" width="26" height="11" fill="none"/><path d="M15 2 V13" fill="none"/>' },
    stove:    { cat: 'kitchen', sw: 'sha', w: 0.62, h: 0.62, box: [30, 30], art: '<rect x="2" y="2" width="26" height="26" fill="none"/><circle cx="10" cy="10" r="3.6" fill="none"/><circle cx="21" cy="10" r="2.5" fill="none"/><circle cx="10" cy="21" r="2.5" fill="none"/><circle cx="21" cy="21" r="3.6" fill="none"/>' },
    toilet:   { cat: 'kitchen', sw: 'shui', w: 0.46, h: 0.72, box: [20, 30], art: '<rect x="3" y="1" width="14" height="6" fill="none"/><ellipse cx="10" cy="19" rx="7" ry="9" fill="none"/>' },
    tub:      { cat: 'kitchen', sw: 'shui', w: 1.7, h: 0.78, box: [34, 16], art: '<rect x="2" y="2" width="30" height="12" rx="6" fill="none"/><circle cx="8" cy="8" r="2.4" fill="none"/>' },
    fridge:   { cat: 'kitchen', sw: 'sha', w: 0.7, h: 0.7, box: [30, 30], art: '<rect x="4" y="2" width="22" height="26" fill="none"/><path d="M4 11 H26" fill="none"/>' },
    shrine:   { cat: 'feng', sw: 'sha', w: 0.6, h: 0.34, box: [30, 17], art: '<path d="M3 15 V7 L15 2 L27 7 V15 Z" fill="none"/><circle cx="15" cy="10.5" r="2.4" fill="none"/>' },
    tank:     { cat: 'feng', sw: 'shui', w: 1.2, h: 0.5, box: [30, 12], art: '<rect x="2" y="2" width="26" height="9" fill="none"/><path d="M6 8 q3 -3 6 0 q3 3 6 0 q3 -3 6 0" fill="none"/>' }
  };
  /* 托盘房间预设（地砖）：类型＋默认尺寸（米），名取类型名 */
  var ROOM_PRESETS = [
    { type: 'living', w: 4.4, h: 3.6 }, { type: 'master', w: 3.8, h: 3.4 },
    { type: 'bedroom', w: 3.2, h: 3.0 }, { type: 'kitchen', w: 2.6, h: 2.4 },
    { type: 'dining', w: 3.0, h: 2.6 }, { type: 'bath', w: 2.2, h: 1.7 },
    { type: 'study', w: 2.8, h: 2.6 }, { type: 'balcony', w: 3.2, h: 1.3 },
    { type: 'entry', w: 1.8, h: 1.5 }, { type: 'hall', w: 3.0, h: 1.1 },
    { type: 'storage', w: 1.6, h: 1.4 }, { type: 'other', w: 3.0, h: 3.0 }
  ];
  /* 户型模板（蒙特利尔常见公寓型；尺寸近似、单位米，[type,x,y,w,h]，原点为外框左上） */
  var TEMPLATES = {
    t1: { lab: 'hpe_tpl_1', rooms: [
      ['kitchen', 0, 0, 2.2, 2.2], ['dining', 2.2, 0, 2.6, 2.2], ['bath', 4.8, 0, 2.0, 2.2], ['balcony', 6.8, 0, 2.2, 2.2],
      ['living', 0, 2.2, 4.8, 3.2], ['master', 4.8, 2.2, 4.2, 3.2]] },
    t2: { lab: 'hpe_tpl_2', rooms: [
      ['kitchen', 0, 0, 2.4, 2.2], ['dining', 2.4, 0, 2.4, 2.2], ['bath', 4.8, 0, 2.0, 2.2], ['bath', 6.8, 0, 1.8, 2.2], ['balcony', 8.6, 0, 1.8, 2.2],
      ['living', 0, 2.2, 4.8, 4.2], ['master', 4.8, 2.2, 2.8, 4.2], ['bedroom', 7.6, 2.2, 2.8, 4.2]] },
    t3: { lab: 'hpe_tpl_3', rooms: [
      ['kitchen', 0, 0, 2.4, 2.3], ['dining', 2.4, 0, 2.6, 2.3], ['bath', 5.0, 0, 2.0, 2.3], ['bath', 7.0, 0, 1.9, 2.3], ['study', 8.9, 0, 2.7, 2.3],
      ['living', 0, 2.3, 5.0, 4.7], ['master', 5.0, 2.3, 3.3, 4.7], ['bedroom', 8.3, 2.3, 3.3, 4.7]] }
  };
  var FIX_CATS = ['doorwin', 'stairs', 'furn', 'kitchen', 'feng'];
  var ROOM_TYPES = ['living', 'master', 'bedroom', 'kitchen', 'dining', 'bath', 'study', 'balcony', 'entry', 'hall', 'storage', 'other'];
  var DIR8_ANG = { '北': 0, '东北': 45, '东': 90, '东南': 135, '南': 180, '西南': 225, '西': 270, '西北': 315 };

  /* ---------------- 状态 ---------------- */
  var E = {
    houseId: 0, floorId: 0, house: null, floors: [], fixed: null,
    plan: null, mode: 'draw', sheet: null, sel: null, placeType: null, fixCat: 'doorwin',
    snap: true, grid: true, undoStack: [], redoStack: [],
    stage: null, traceURL: '', photoURL: '',
    calibArm: false, calibPts: [], focusSnap: null,
    drag: null, saveTm: null, chartCache: null,
    view: null, ptrs: null, pinch: null,
    attrFull: false, lastTap: null, _attrKey: '',
    cut: null, startPhase: 'pick'
  };
  function F() { return window.WuriSoulFs; }
  function planOf() { return E.plan; }
  function mpu() { return (E.plan && E.plan.mPerUnit) || 1; }
  function toM(units) { return units * mpu(); }
  function toU(meters) { return meters / mpu(); }

  function blankPlan(floorId, houseId) {
    return {
      floorId: floorId, houseId: houseId, updated: 0, mPerUnit: 1,
      rooms: [], fixtures: [], trace: null, liji: null, calibNote: '',
      layers: { rooms: true, fixtures: true, dims: true, overlay: 'fx', palNames: true, roomNames: true, traceBg: true, ovOpacity: 0.92, compRadius: 0 }
    };
  }
  function normalizePlan(p) {
    var b = blankPlan(p.floorId, p.houseId);
    for (var k in b) if (p[k] === undefined || p[k] === null) p[k] = b[k];
    for (var k2 in b.layers) if (p.layers[k2] === undefined) p.layers[k2] = b.layers[k2];
    if (!isFinite(p.mPerUnit) || p.mPerUnit <= 0) p.mPerUnit = 1;
    return p;
  }
  function loadPlan(floorId, houseId) {
    return db.plans.get(floorId).then(function (p) {
      return normalizePlan(p || blankPlan(floorId, houseId));
    });
  }
  var saveTm = null;
  function save() {
    if (!E.plan) return;
    E.plan.updated = Date.now();
    ensureLiji();
    clearTimeout(saveTm);
    var snap = clone(E.plan);
    saveTm = setTimeout(function () { db.plans.put(snap).catch(function () {}); }, 200);
    var sv = $('hpe-saved');
    if (sv) sv.textContent = T('hpe_saved');
  }
  function saveNow() {
    if (!E.plan) return;
    clearTimeout(saveTm);
    E.plan.updated = Date.now();
    ensureLiji();
    return db.plans.put(clone(E.plan)).catch(function () {});
  }
  /* 撤销栈：变更前快照 */
  function pushUndo() {
    if (!E.plan) return;
    E.undoStack.push(clone(E.plan));
    if (E.undoStack.length > 80) E.undoStack.shift();
    E.redoStack.length = 0;
  }
  function undo() {
    if (!E.undoStack.length) return;
    E.redoStack.push(clone(E.plan));
    E.plan = E.undoStack.pop();
    E.sel = null; E.chartCache = null; E.cut = null;
    afterChange(true);
  }
  function redo() {
    if (!E.redoStack.length) return;
    E.undoStack.push(clone(E.plan));
    E.plan = E.redoStack.pop();
    E.sel = null; E.chartCache = null; E.cut = null;
    afterChange(true);
  }
  function afterChange(skipPanel) {
    save();
    render();
    if (!skipPanel) renderPanel();
    else renderAttr();
  }

  /* ---------------- 几何 ---------------- */
  function extent() {
    var p = E.plan, x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, has = false;
    function ext(x, y) { has = true; if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
    p.rooms.forEach(function (r) { ext(r.x, r.y); ext(r.x + r.w, r.y + r.h); });
    if (p.trace && p.trace.rect) { var t = p.trace.rect; ext(t.x, t.y); ext(t.x + t.w, t.y + t.h); }
    if (p.liji) ext(p.liji.x, p.liji.y);
    if (!has) return { x0: -6, y0: -5, x1: 6, y1: 5 };
    return { x0: x0, y0: y0, x1: x1, y1: y1 };
  }
  function lijiPoint() {
    var p = E.plan;
    if (p.liji) return p.liji;
    var b = extent();
    return { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 };
  }
  function ensureLiji() {
    var p = E.plan;
    if (!p) return;
    if (!p.rooms.length && !(p.trace && p.trace.rect)) { p.liji = null; return; }
    if (!p.liji) { var b = extent(); p.liji = { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 }; }
  }
  function gridRect() {
    var b = extent(), l = lijiPoint();
    var hw = Math.max(l.x - b.x0, b.x1 - l.x, toU(1.5));
    var hh = Math.max(l.y - b.y0, b.y1 - l.y, toU(1.5));
    return { x: l.x - hw, y: l.y - hh, w: hw * 2, h: hh * 2, cx: l.x, cy: l.y };
  }
  /* ---------------- 视图（viewBox 平移/缩放） ---------------- */
  function stageAspect() {
    var cv = $('hpe-canvas');
    if (cv && cv.clientWidth > 0 && cv.clientHeight > 0) return cv.clientWidth / cv.clientHeight;
    return 0.72;
  }
  /* 适应全图：extent＋边距，按舞台长宽比扩够短边，全部内容入镜 */
  function fitView() {
    var b = extent();
    var pad = Math.max(b.x1 - b.x0, b.y1 - b.y0) * 0.07 + 0.3;
    var x0 = b.x0 - pad, y0 = b.y0 - pad, x1 = b.x1 + pad, y1 = b.y1 + pad;
    var w = x1 - x0, h = y1 - y0, asp = stageAspect();
    if (w / h < asp) { var nw = h * asp, cx = (x0 + x1) / 2; x0 = cx - nw / 2; x1 = cx + nw / 2; w = nw; }
    else { var nh = w / asp, cy = (y0 + y1) / 2; y0 = cy - nh / 2; y1 = cy + nh / 2; h = nh; }
    return { x: x0, y: y0, w: w, h: h };
  }
  /* 缩放限幅（宽不小于 1.6 m、不大于全图 3.5 倍＋8 m）＋平移限幅（与内容至少 15% 交叠，拖不丢） */
  function clampView() {
    var v = E.view; if (!v) return;
    var asp = stageAspect();
    v.h = v.w / asp;
    var b = extent();
    var ew = Math.max(b.x1 - b.x0, toU(2)), eh = Math.max(b.y1 - b.y0, toU(2));
    var minW = toU(1.6), maxW = Math.max(ew, eh) * 3.5 + toU(8), cx;
    if (v.w < minW) { cx = v.x + v.w / 2; v.w = minW; v.x = cx - v.w / 2; v.h = v.w / asp; }
    if (v.w > maxW) { cx = v.x + v.w / 2; v.w = maxW; v.x = cx - v.w / 2; v.h = v.w / asp; }
    v.x = Math.max(b.x0 - v.w * 0.85, Math.min(v.x, b.x1 - v.w * 0.15));
    v.y = Math.max(b.y0 - v.h * 0.85, Math.min(v.y, b.y1 - v.h * 0.15));
  }
  function clientToPlan(cx, cy, v) {
    var svg = $('hpe-svg'); if (!svg) return { x: v.x, y: v.y };
    var rc = svg.getBoundingClientRect();
    if (!rc.width) return { x: v.x, y: v.y };
    return { x: v.x + (cx - rc.left) / rc.width * v.w, y: v.y + (cy - rc.top) / rc.height * v.h };
  }
  /* 以锚点（客户区坐标）为心缩放到新宽 */
  function zoomViewAt(nw, cx, cy) {
    var v = E.view; if (!v) return;
    var a = clientToPlan(cx, cy, v);
    var svg = $('hpe-svg'), rc = svg.getBoundingClientRect();
    v.w = nw; v.h = nw / stageAspect();
    v.x = a.x - (cx - rc.left) / rc.width * v.w;
    v.y = a.y - (cy - rc.top) / rc.height * v.h;
    clampView(); render();
  }
  /* 让某矩形完整入镜：能平移则最小平移，不够大才放大视图；底部属性条遮带一并让开 */
  function revealRect(rct) {
    if (!rct) return;
    if (!E.view) E.view = fitView();
    var v = E.view, asp = stageAspect();
    v.h = v.w / asp;
    var svg = $('hpe-svg'), at = $('hpe-attr');
    function bandUnits() {
      if (!at || !svg || !at.offsetHeight) return 0;
      var rc = svg.getBoundingClientRect();
      return rc.height > 0 ? (at.offsetHeight + 18) / rc.height * v.h : 0;
    }
    var mx = v.w * 0.04, my = v.h * 0.04;
    var visH = v.h - bandUnits();
    var needW = rct.w + mx * 2, needH = rct.h + my * 2;
    if (needW > v.w || needH > visH) {
      var nw = Math.max(needW, needH * asp);
      v.w = nw; v.h = nw / asp;
      v.x = rct.x + rct.w / 2 - v.w / 2;
      v.y = rct.y + rct.h / 2 - (v.h - bandUnits()) / 2;
    } else {
      if (rct.x - mx < v.x) v.x = rct.x - mx;
      if (rct.x + rct.w + mx > v.x + v.w) v.x = rct.x + rct.w + mx - v.w;
      if (rct.y - my < v.y) v.y = rct.y - my;
      if (rct.y + rct.h + my > v.y + visH) v.y = rct.y + rct.h + my - visH;
    }
    clampView(); render();
  }
  function roomById(id) { return E.plan.rooms.filter(function (r) { return r.id === id; })[0] || null; }
  function fixById(id) { return E.plan.fixtures.filter(function (f) { return f.id === id; })[0] || null; }
  function snapVal(v, step) { return Math.round(v / step) * step; }
  function snapCoord(v, edges, thr) {
    var best = v, bd = thr;
    edges.forEach(function (e) { var d = Math.abs(e - v); if (d < bd) { bd = d; best = e; } });
    return best;
  }

  /* ---------------- 叠盘（定稿坐向投影） ---------------- */
  function facingDeg() { return E.fixed ? E.fixed.facingDeg : null; }
  function screenCell(dirName) {
    /* 宫位方向 → 屏幕九宫格 (col,row)：上＝向首 */
    var th = DIR8_ANG[dirName];
    if (th === undefined || E.fixed == null) return null;
    var d = (th - E.fixed.facingDeg) * Math.PI / 180;
    return { col: 1 + Math.round(Math.sin(d)), row: 1 - Math.round(Math.cos(d)) };
  }
  function screenVec(dirName, r) {
    var th = DIR8_ANG[dirName];
    if (th === undefined || E.fixed == null) return null;
    var d = (th - E.fixed.facingDeg) * Math.PI / 180;
    return { x: Math.sin(d) * r, y: -Math.cos(d) * r };
  }
  function fxChart() {
    if (!E.fixed || !F()) return null;
    if (E.chartCache && E.chartCache.sit === E.fixed.sitting) return E.chartCache.chart;
    var period = 9;
    try {
      if (window.__wuriFs2) period = __wuriFs2.state().period;
      else period = F().periodFromYear(new Date().getFullYear());
    } catch (e) {}
    var repYear = 1864 + (period - 1) * 20 + 10;
    var chart = null;
    try { chart = F().buildChart(repYear, E.fixed.sitting); } catch (e) {}
    E.chartCache = { sit: E.fixed.sitting, chart: chart, period: period };
    return chart;
  }
  function bzFan() {
    if (!E.fixed || !F()) return null;
    try {
      var g = F().houseGua(E.fixed.sitting);
      return F().palacesFor(g);
    } catch (e) { return null; }
  }

  /* ---------------- SVG 渲染 ---------------- */
  var SVGNS = 'http://www.w3.org/2000/svg';
  function render() {
    var svg = $('hpe-svg'); if (!svg || !E.plan) return;
    var p = E.plan, L = p.layers;
    if (E.stage) { renderStage(svg); return; }
    /* 视图持久：E.view 即当前 viewBox（空白拖平移／双指捏合缩放／顶栏「全图」改之），
     * 未定（开页/换层/套模板/描图成图）时才按 extent 自适应一次；拖动中不重算，
     * 杜绝旧版 extent 实时重拟合的坐标反馈放大。 */
    if (!E.view) E.view = fitView();
    clampView();
    var vb = E.view;
    var vx = vb.x, vy = vb.y, vw = vb.w, vh = vb.h;
    svg.setAttribute('viewBox', vx + ' ' + vy + ' ' + vw + ' ' + vh);
    var u = vw / 100; /* 约 1% 宽，供字号/线宽参照 */
    var s = '';
    /* 户外块斜纹（户型外底纹，与三态变量链走 CSS class） */
    s += '<defs><pattern id="hpe-hatch" width="' + (u * 3.4) + '" height="' + (u * 3.4) + '" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
      '<rect width="' + (u * 3.4) + '" height="' + (u * 3.4) + '" class="hpe-hatchbg"/>' +
      '<line x1="0" y1="0" x2="0" y2="' + (u * 3.4) + '" class="hpe-hatchln" stroke-width="' + (u * 0.55) + '"/></pattern></defs>';
    /* 背景网格（1 m） */
    if (E.grid && E.mode === 'draw') {
      var gs = toU(1);
      s += '<defs><pattern id="hpe-gridp" width="' + gs + '" height="' + gs + '" patternUnits="userSpaceOnUse">' +
        '<path d="M' + gs + ' 0 H0 V' + gs + '" fill="none" stroke="var(--line-soft)" stroke-width="' + (u * 0.14) + '"/></pattern></defs>' +
        '<rect x="' + vx + '" y="' + vy + '" width="' + vw + '" height="' + vh + '" fill="url(#hpe-gridp)"/>';
    }
    /* 描图底图 */
    if (p.trace && p.trace.rect && L.traceBg && E.traceURL) {
      var tr = p.trace.rect;
      s += '<image href="' + E.traceURL + '" x="' + tr.x + '" y="' + tr.y + '" width="' + tr.w + '" height="' + tr.h +
        '" opacity="' + (p.trace.opacity == null ? 0.62 : p.trace.opacity) + '" preserveAspectRatio="none"/>';
    }
    /* 房间块（ex＝户外排除块：斜纹底、不显面积、名固定「户外」） */
    if (L.rooms) {
      p.rooms.forEach(function (r) {
        var sel = E.sel && E.sel.kind === 'room' && E.sel.id === r.id;
        var fsN = Math.max(u * 2.6, Math.min(r.w, r.h) * 0.16);
        if (r.ex) {
          s += '<g data-act="room" data-id="' + r.id + '">' +
            '<rect class="hpe-roomrect ex' + (sel ? ' sel' : '') + '" x="' + r.x + '" y="' + r.y +
            '" width="' + r.w + '" height="' + r.h + '" stroke-width="' + (u * (sel ? 0.3 : 0.16)) + '"/>' +
            '<rect class="hpe-hatchrect" x="' + r.x + '" y="' + r.y + '" width="' + r.w + '" height="' + r.h + '"/>' +
            (L.roomNames ? '<text class="hpe-roomname ex" x="' + (r.x + r.w / 2) + '" y="' + (r.y + r.h / 2 + fsN * 0.37) +
              '" text-anchor="middle" font-size="' + fsN + '">' + esc(T('hpe_out_name')) + '</text>' : '') +
            '</g>';
          return;
        }
        s += '<g data-act="room" data-id="' + r.id + '">' +
          '<rect class="hpe-roomrect hpe-rt-' + (r.type || 'other') + (sel ? ' sel' : '') + (E.mode === 'trace' ? ' trace' : '') + '" x="' + r.x + '" y="' + r.y +
          '" width="' + r.w + '" height="' + r.h + '" stroke-width="' + (u * (sel ? 0.3 : 0.16)) + '"/>' +
          (L.roomNames && r.name ? '<text class="hpe-roomname" x="' + (r.x + r.w / 2) + '" y="' + (r.y + r.h / 2 + fsN * 0.37) +
            '" text-anchor="middle" font-size="' + fsN + '">' + esc(r.name) + '</text>' : '') +
          (L.dims ? '<text class="hpe-roomarea" x="' + (r.x + r.w - u * 0.7) + '" y="' + (r.y + r.h - u * 0.8) +
            '" text-anchor="end" font-size="' + (u * 1.9) + '">' + trimNum(toM(r.w) * toM(r.h)) + '㎡</text>' : '') +
          '</g>';
      });
    }
    /* 叠盘 */
    if (L.overlay !== 'none' && E.fixed) s += renderOverlay(u);
    /* 构件 */
    if (L.fixtures) {
      p.fixtures.forEach(function (f) {
        var d = FIX[f.type]; if (!d) return;
        var sel = E.sel && E.sel.kind === 'fixture' && E.sel.id === f.id;
        var wU = toU(d.w), hU = toU(d.h);
        s += '<g data-act="fixture" data-id="' + f.id + '" class="hpe-fix' + (sel ? ' sel' : '') + '">' +
          '<rect class="hpe-fixhit" x="' + (f.x - wU / 2) + '" y="' + (f.y - hU / 2) + '" width="' + wU + '" height="' + hU + '"/>' +
          (sel ? '<rect class="hpe-fixsel" x="' + (f.x - wU / 2) + '" y="' + (f.y - hU / 2) + '" width="' + wU + '" height="' + hU + '" stroke-width="' + (u * 0.2) + '"/>' : '') +
          '<g transform="translate(' + f.x + ' ' + f.y + ') rotate(' + (f.rot || 0) + ') scale(' + (wU / d.box[0] * (f.flip ? -1 : 1)) + ' ' + (hU / d.box[1]) + ') translate(' + (-d.box[0] / 2) + ' ' + (-d.box[1] / 2) + ')">' +
          '<g stroke="currentColor" stroke-width="' + (30 / Math.max(d.box[0], d.box[1]) * 1.1) + '" fill="none" stroke-linecap="round">' + d.art + '</g></g>' +
          (d.sw ? '<text class="hpe-fixsw ' + d.sw + '" x="' + (f.x + wU / 2 + u * 0.4) + '" y="' + (f.y - hU / 2 - u * 0.5) + '" text-anchor="end" font-size="' + (u * 1.8) + '">' + esc(T('hpe_sw_' + d.sw)) + '</text>' : '') +
          '</g>';
      });
    }
    /* 选中房间：手柄＋尺寸胶囊 */
    if (E.sel && E.sel.kind === 'room') {
      var r = roomById(E.sel.id);
      if (r) s += renderRoomSel(r, u);
    }
    /* 分切预览：虚线切线＋两侧尺寸胶囊 */
    if (E.cut) s += renderCut(u);
    /* 立极 */
    s += renderLiji(u);
    /* 补角法提示：房间轮廓明显缺角时在立极旁给签（课件补齐方正法一系） */
    var bj = missingCornerInfo();
    if (bj && L.rooms) {
      var lp = lijiPoint();
      var bjTxt = T('hpe_bujiao_tag');
      var bjFs = u * 1.8, bjW = bjTxt.length * bjFs * 0.98 + u * 2.2, bjH = bjFs * 1.7;
      var bx = Math.min(Math.max(lp.x - bjW / 2, vx + u), vx + vw - bjW - u);
      s += '<g class="hpe-bujiao" data-act="bujiao"><rect x="' + bx + '" y="' + (lp.y + u * 6.6) + '" width="' + bjW + '" height="' + bjH + '" rx="' + (u * 0.8) + '"/>' +
        '<text x="' + (bx + bjW / 2) + '" y="' + (lp.y + u * 6.6 + bjFs * 1.24) + '" text-anchor="middle" font-size="' + bjFs + '">' + esc(bjTxt) + '</text></g>';
    }
    /* 校准标记 */
    if (E.calibPts.length) {
      s += E.calibPts.map(function (pt, i) {
        return '<g class="hpe-calibpt"><circle cx="' + pt.x + '" cy="' + pt.y + '" r="' + (u * 1.5) + '"/>' +
          '<text x="' + pt.x + '" y="' + (pt.y - u * 2) + '" text-anchor="middle" font-size="' + (u * 2.4) + '">' + (i ? 'B' : 'A') + '</text></g>';
      }).join('');
      if (E.calibPts.length === 2) {
        s += '<line x1="' + E.calibPts[0].x + '" y1="' + E.calibPts[0].y + '" x2="' + E.calibPts[1].x + '" y2="' + E.calibPts[1].y + '" class="hpe-calibline" stroke-width="' + (u * 0.22) + '"/>';
      }
    }
    /* 描图拉框预览 */
    if (E.tempRect) {
      var t = E.tempRect;
      s += '<rect class="hpe-temprect" x="' + t.x + '" y="' + t.y + '" width="' + t.w + '" height="' + t.h + '" stroke-width="' + (u * 0.25) + '"/>';
    }
    svg.innerHTML = s;
    syncTop();
  }
  function renderRoomSel(r, u) {
    var s = '';
    var cx = [r.x, r.x + r.w / 2, r.x + r.w], cy = [r.y, r.y + r.h / 2, r.y + r.h];
    var names = ['nw', 'n', 'ne', 'w', null, 'e', 'sw', 's', 'se'];
    for (var j = 0; j < 3; j++) for (var i = 0; i < 3; i++) {
      if (!names[j * 3 + i]) continue;
      var hs = u * 2.6;
      s += '<rect class="hpe-hdl" data-act="handle" data-h="' + names[j * 3 + i] + '" x="' + (cx[i] - hs / 2) + '" y="' + (cy[j] - hs / 2) + '" width="' + hs + '" height="' + hs + '" rx="' + (u * 0.5) + '"/>';
    }
    if (E.plan.layers.dims) {
      var fsD = u * 2.1;
      var wTxt = trimNum(toM(r.w), 2) + ' m', hTxt = trimNum(toM(r.h), 2) + ' m';
      var wW = wTxt.length * fsD * 0.62 + u * 1.6, hW = hTxt.length * fsD * 0.62 + u * 1.6;
      s += '<g class="hpe-dim"><rect x="' + (r.x + r.w / 2 - wW / 2) + '" y="' + (r.y - fsD * 2.1) + '" width="' + wW + '" height="' + (fsD * 1.55) + '" rx="' + (u * 0.6) + '"/>' +
        '<text x="' + (r.x + r.w / 2) + '" y="' + (r.y - fsD * 0.92) + '" text-anchor="middle" font-size="' + fsD + '">' + esc(wTxt) + '</text></g>';
      s += '<g class="hpe-dim"><g transform="translate(' + (r.x - fsD * 1.3) + ' ' + (r.y + r.h / 2) + ') rotate(-90)">' +
        '<rect x="' + (-hW / 2) + '" y="' + (-fsD * 0.78) + '" width="' + hW + '" height="' + (fsD * 1.55) + '" rx="' + (u * 0.6) + '"/>' +
        '<text x="0" y="' + (fsD * 0.36) + '" text-anchor="middle" font-size="' + fsD + '">' + esc(hTxt) + '</text></g></g>';
    }
    return s;
  }
  function renderOverlay(u) {
    var p = E.plan, L = p.layers, g = gridRect();
    var op = L.ovOpacity == null ? 0.92 : L.ovOpacity;
    var s = '<g opacity="' + op + '">';
    var cw = g.w / 3, ch = g.h / 3;
    if (L.overlay === 'fx') {
      var chart = fxChart();
      s += '<g class="hpe-gridln" stroke-width="' + (u * 0.16) + '">' +
        '<line x1="' + (g.x + cw) + '" y1="' + g.y + '" x2="' + (g.x + cw) + '" y2="' + (g.y + g.h) + '"/>' +
        '<line x1="' + (g.x + cw * 2) + '" y1="' + g.y + '" x2="' + (g.x + cw * 2) + '" y2="' + (g.y + g.h) + '"/>' +
        '<line x1="' + g.x + '" y1="' + (g.y + ch) + '" x2="' + (g.x + g.w) + '" y2="' + (g.y + ch) + '"/>' +
        '<line x1="' + g.x + '" y1="' + (g.y + ch * 2) + '" x2="' + (g.x + g.w) + '" y2="' + (g.y + ch * 2) + '"/></g>' +
        '<line class="hpe-cross" x1="' + g.cx + '" y1="' + g.y + '" x2="' + g.cx + '" y2="' + (g.y + g.h) + '" stroke-width="' + (u * 0.12) + '"/>' +
        '<line class="hpe-cross" x1="' + g.x + '" y1="' + g.cy + '" x2="' + (g.x + g.w) + '" y2="' + g.cy + '" stroke-width="' + (u * 0.12) + '"/>';
      if (chart) {
        chart.palaces.forEach(function (pl) {
          var isC = pl.key === 'center';
          var cell = isC ? { col: 1, row: 1 } : screenCell(pl.direction);
          if (!cell) return;
          var px = g.x + cw * cell.col, py = g.y + ch * cell.row;
          var per = E.chartCache ? E.chartCache.period : null;
          var txt = isC ? T('hpe_period') + ' ' + pl.period
            : T('hpe_mtn_s') + pl.mountain + ' ' + T('hpe_wtr_s') + pl.water;
          var hot = !isC && per != null && (pl.mountain === per || pl.water === per);
          if (L.palNames) s += '<text class="hpe-palname" x="' + (px + u * 0.8) + '" y="' + (py + u * 3) + '" font-size="' + (u * 2.1) + '">' + esc(txs(pl.name)) + esc(T('hpe_palace_suffix')) + '</text>';
          var fsS = u * 2.2, capW = txt.length * fsS * 0.6 + u * 1.8;
          s += '<g class="hpe-starcap' + (hot ? ' hot' : '') + '"><rect x="' + (px + cw - capW - u * 0.7) + '" y="' + (py + ch - fsS * 1.9) + '" width="' + capW + '" height="' + (fsS * 1.5) + '" rx="' + (u * 0.8) + '"/>' +
            '<text x="' + (px + cw - u * 0.7 - capW / 2) + '" y="' + (py + ch - fsS * 0.75) + '" text-anchor="middle" font-size="' + fsS + '">' + esc(txt) + '</text></g>';
        });
      }
    } else if (L.overlay === 'bz') {
      var fan = bzFan();
      var R = Math.sqrt(g.w * g.w + g.h * g.h) / 2 * 0.98;
      var dirs = Object.keys(DIR8_ANG);
      s += '<g class="hpe-fanln" stroke-width="' + (u * 0.14) + '">';
      dirs.forEach(function (dn) {
        var th = (DIR8_ANG[dn] - E.fixed.facingDeg + 22.5) * Math.PI / 180;
        s += '<line x1="' + g.cx + '" y1="' + g.cy + '" x2="' + (g.cx + Math.sin(th) * R) + '" y2="' + (g.cy - Math.cos(th) * R) + '"/>';
      });
      s += '</g>';
      if (fan) {
        fan.forEach(function (pl) {
          var v = screenVec(pl.direction, R * 0.66);
          if (!v) return;
          var good = pl.star && pl.star.kind === 'auspicious';
          s += '<text class="hpe-fanstar' + (good ? ' good' : '') + '" x="' + (g.cx + v.x) + '" y="' + (g.cy + v.y + u * 0.8) + '" text-anchor="middle" font-size="' + (u * 2.3) + '">' + esc(txs(pl.star.name)) + '</text>' +
            '<text class="hpe-fandir" x="' + (g.cx + v.x) + '" y="' + (g.cy + v.y + u * 3.4) + '" text-anchor="middle" font-size="' + (u * 1.7) + '">' + esc(txs(pl.name)) + '</text>';
        });
      }
    } else if (L.overlay === 'compass') {
      s += compassRose(u, g);
    }
    return s + '</g>';
  }
  /* 罗盘叠图：以立极（太极点）为圆心，八卦扇区＋24 山环；方向锁死定稿坐向
   * （屏幕正上＝向首，山位按 bearing−facing 投影，与 gridRect/screenVec 同一口径，
   * 图内不可旋转，改向回档案定稿）。24 山/八卦数据取 FS24/FS_TRI（fengshui-data.js）。 */
  function compassRadius(g) {
    var L = E.plan.layers;
    if (L.compRadius > 0) return L.compRadius;
    return Math.min(g.w, g.h) / 2 * 0.96;
  }
  function compassRose(u, g) {
    var R = compassRadius(g);
    var cx = g.cx, cy = g.cy, fd = E.fixed.facingDeg;
    function pt(bearing, r) {
      var d = (bearing - fd) * Math.PI / 180;
      return [cx + Math.sin(d) * r, cy - Math.cos(d) * r];
    }
    var s = '';
    /* 八卦扇区：每卦 45°，隔卦浅染 */
    if (window.FS_TRI) FS_TRI.forEach(function (tr, i) {
      var a0 = tr[1] - 22.5, a1 = tr[1] + 22.5;
      var p0 = pt(a0, R), p1 = pt(a1, R);
      s += '<path class="hpe-rose-sec' + (i % 2 ? ' alt' : '') + '" d="M' + cx + ' ' + cy + ' L' + p0[0].toFixed(2) + ' ' + p0[1].toFixed(2) +
        ' A' + R + ' ' + R + ' 0 0 1 ' + p1[0].toFixed(2) + ' ' + p1[1].toFixed(2) + ' Z"/>';
    });
    /* 圈环 */
    s += '<circle class="hpe-rose-ring" cx="' + cx + '" cy="' + cy + '" r="' + R + '" stroke-width="' + (u * 0.22) + '"/>' +
      '<circle class="hpe-rose-ring thin" cx="' + cx + '" cy="' + cy + '" r="' + (R * 0.84) + '" stroke-width="' + (u * 0.12) + '"/>' +
      '<circle class="hpe-rose-ring thin" cx="' + cx + '" cy="' + cy + '" r="' + (R * 0.62) + '" stroke-width="' + (u * 0.12) + '"/>' +
      '<circle class="hpe-rose-ring thin" cx="' + cx + '" cy="' + cy + '" r="' + (R * 0.2) + '" stroke-width="' + (u * 0.12) + '"/>';
    /* 刻度：每山一格，卦界加长 */
    if (window.FS24) FS24.forEach(function (m) {
      var lon = (m.angle % 45 === 0);
      var q0 = pt(m.angle, R * (lon ? 0.94 : 0.965)), q1 = pt(m.angle, R);
      s += '<line class="hpe-rose-tick" x1="' + q0[0].toFixed(2) + '" y1="' + q0[1].toFixed(2) + '" x2="' + q1[0].toFixed(2) + '" y2="' + q1[1].toFixed(2) + '" stroke-width="' + (u * 0.14) + '"/>';
      var mp = pt(m.angle, R * 0.9);
      var cls = 'hpe-rose-mtn' + ((window.FS_CARDINAL && FS_CARDINAL[m.name]) ? ' card' : '') + ((window.FS_GUA_MTN && FS_GUA_MTN[m.name]) ? ' gua' : '');
      s += '<text class="' + cls + '" x="' + mp[0].toFixed(2) + '" y="' + mp[1].toFixed(2) + '" text-anchor="middle" dominant-baseline="central" font-size="' + (R * 0.062) + '">' + esc(m.name) + '</text>';
    });
    /* 八卦名（卦位中半径） */
    if (window.FS_TRI) FS_TRI.forEach(function (tr) {
      var gp = pt(tr[1], R * 0.42);
      s += '<text class="hpe-rose-gua" x="' + gp[0].toFixed(2) + '" y="' + gp[1].toFixed(2) + '" text-anchor="middle" dominant-baseline="central" font-size="' + (R * 0.11) + '">' + esc(tr[0]) + '</text>';
    });
    /* 向首标记（屏幕正上＝向，朱砂三角＋「向」字） */
    s += '<path class="hpe-rose-mark" d="M' + cx + ' ' + (cy - R - u * 1.1) + ' l' + (u * 1.1) + ' ' + (u * 1.9) + ' h' + (-u * 2.2) + ' Z"/>' +
      '<text class="hpe-rose-marktxt" x="' + cx + '" y="' + (cy - R - u * 2.6) + '" text-anchor="middle" font-size="' + (u * 2.2) + '">' + esc(T('hpe_facing_mark')) + '</text>';
    return s;
  }
  /* 缺角检测：房间并集对外框四角的覆盖——任一角区（外框 32% 见方）无房面，
   * 且并集覆盖率 <92%，判为明显缺角（与课件「补角法」触发口径一致，只提示不改盘）。 */
  function missingCornerInfo() {
    var p = E.plan;
    if (!p || !p.rooms.length) return null;
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, area = 0;
    p.rooms.forEach(function (r) {
      x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y);
      x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h);
      if (!r.ex) area += r.w * r.h; /* 户外块不算覆盖（它正是被切掉的缺角） */
    });
    var W = x1 - x0, H = y1 - y0;
    if (W <= 0 || H <= 0) return null;
    var cover = area / (W * H);
    var cw = W * 0.32, chh = H * 0.32;
    var corners = [
      { x: x0, y: y0 }, { x: x1 - cw, y: y0 }, { x: x0, y: y1 - chh }, { x: x1 - cw, y: y1 - chh }
    ];
    var miss = corners.some(function (c) {
      return !p.rooms.some(function (r) {
        return !r.ex && r.x < c.x + cw && r.x + r.w > c.x && r.y < c.y + chh && r.y + r.h > c.y;
      });
    });
    return (miss && cover < 0.92) ? { cover: cover } : null;
  }
  function renderLiji(u) {
    var l = lijiPoint();
    var drag = true; /* 模拟人生式：立极随时可拖（旧版仅图层页可拖），叠层圆心随之 */
    return '<g ' + (drag ? 'data-act="liji"' : '') + ' class="hpe-liji' + (drag ? ' drag' : '') + '">' +
      '<line class="hpe-cross" x1="' + l.x + '" y1="' + (l.y - u * 4.4) + '" x2="' + l.x + '" y2="' + (l.y + u * 4.4) + '" stroke-width="' + (u * 0.12) + '"/>' +
      '<line class="hpe-cross" x1="' + (l.x - u * 4.4) + '" y1="' + l.y + '" x2="' + (l.x + u * 4.4) + '" y2="' + l.y + '" stroke-width="' + (u * 0.12) + '"/>' +
      '<circle class="hpe-lijiring" cx="' + l.x + '" cy="' + l.y + '" r="' + (u * 2.6) + '" stroke-width="' + (u * 0.3) + '"/>' +
      '<text class="hpe-lijitxt" x="' + l.x + '" y="' + (l.y + u * 0.75) + '" text-anchor="middle" font-size="' + (u * 2.2) + '">✥</text>' +
      '<text class="hpe-lijilab" x="' + l.x + '" y="' + (l.y + u * 5.6) + '" text-anchor="middle" font-size="' + (u * 1.9) + '">' + esc(T('hpe_liji')) + '</text></g>';
  }
  function renderStage(svg) {
    var st = E.stage;
    var Hh = 1000 * st.natH / st.natW;
    svg.setAttribute('viewBox', '0 0 1000 ' + Hh);
    var s = '<image href="' + st.url + '" x="0" y="0" width="1000" height="' + Hh + '" preserveAspectRatio="none"/>';
    var pts = st.corners.map(function (c) { return (c.x * 1000) + ',' + (c.y * Hh); }).join(' ');
    s += '<polygon class="hpe-quad" points="' + pts + '"/>';
    st.corners.forEach(function (c, i) {
      s += '<circle class="hpe-corner" data-act="corner" data-i="' + i + '" cx="' + (c.x * 1000) + '" cy="' + (c.y * Hh) + '" r="30"/>' +
        '<circle class="hpe-cornerdot" cx="' + (c.x * 1000) + '" cy="' + (c.y * Hh) + '" r="7"/>';
    });
    svg.innerHTML = s;
  }

  /* ---------------- 顶栏 / 上滑层 ---------------- */
  function syncTop() {
    var un = $('hpe-undo'), re = $('hpe-redo');
    if (un) un.classList.toggle('dim', !E.undoStack.length);
    if (re) re.classList.toggle('dim', !E.redoStack.length);
    var nm = $('hpe-floorname');
    if (nm) {
      var cur = E.floors.filter(function (f) { return f.id === E.floorId; })[0];
      var label = cur ? cur.name : '';
      if (nm.getAttribute('data-fl') !== label) {
        nm.setAttribute('data-fl', label);
        nm.innerHTML = esc(label) + '<i class="hpe-caret">▾</i>';
      }
    }
  }
  function syncSheet() {
    var sh = $('hpe-sheet'), sc = $('hpe-scrim'), ib = $('hpe-infobox'), tt = $('hpe-sheet-title');
    var open = !!E.sheet;
    if (sh) sh.hidden = !open;
    /* 遮罩只罩须先抉择的层（楼层/说明/模板），图层/描图抽屉非模态：画布保持可点 */
    if (sc) sc.hidden = !(open && (E.sheet === 'floors' || E.sheet === 'info' || E.sheet === 'tpl' || E.sheet === 'start'));
    if (ib) ib.hidden = E.sheet !== 'info';
    if (tt) tt.textContent = E.sheet === 'floors' ? T('hpe_floors')
      : E.sheet === 'info' ? T('hpe_info')
      : E.sheet === 'layers' ? T('hpe_mode_layers')
      : E.sheet === 'trace' ? T('hpe_mode_trace')
      : E.sheet === 'tpl' ? T('hpe_tpl_title')
      : E.sheet === 'start' ? T('hpe_start_title')
      : '';
    layoutAttr();
  }
  function showSheet(kind) {
    E.sheet = kind;
    /* 描图层开合驱动 E.mode（onDown 拉框/校准与房间 trace 描边样式仍按 mode 走） */
    if (kind === 'trace') E.mode = 'trace';
    else if (E.mode === 'trace') { E.mode = 'draw'; E.calibArm = false; E.calibPts = []; }
    if (kind === 'floors') renderFloorsBar();
    else if (kind === 'info') {
      var p = $('hpe-panel'); if (p) p.innerHTML = '';
      var h = $('hpe-hint'); if (h) h.textContent = '';
    } else if (kind === 'layers' || kind === 'trace' || kind === 'tpl' || kind === 'start') renderPanel();
    syncSheet();
  }
  function closeSheet() {
    E.sheet = null;
    if (E.mode === 'trace') { E.mode = 'draw'; E.calibArm = false; E.calibPts = []; render(); }
    syncSheet();
  }
  /* 属性条定位：无抽屉时贴舞台底；抽屉开时让到抽屉上沿之上，不被压住 */
  function layoutAttr() {
    var at = $('hpe-attr'); if (!at) return;
    var sh = $('hpe-sheet'), st = at.parentElement;
    if (sh && st && E.sheet && !sh.hidden) {
      var sr = st.getBoundingClientRect(), hr = sh.getBoundingClientRect();
      if (sr.height > 0 && hr.height > 0) {
        at.style.bottom = Math.max(10, Math.round(sr.bottom - hr.top) + 8) + 'px';
        return;
      }
    }
    at.style.bottom = '10px';
  }
  function renderFloorsBar() {
    syncTop();
    if (E.sheet !== 'floors') return;
    var box = $('hpe-panel'); if (!box) return;
    box.innerHTML = '<div class="hpe-flist">' + E.floors.map(function (f) {
      return '<div class="hpe-floorrow' + (f.id === E.floorId ? ' on' : '') + '" data-hpefl="' + f.id + '">' +
        '<span>' + esc(f.name) + '</span>' + (f.id === E.floorId ? '<span class="ck">✓</span>' : '') + '</div>';
    }).join('') + '</div>';
    var hint = $('hpe-hint'); if (hint) hint.textContent = '';
    Array.prototype.forEach.call(box.querySelectorAll('[data-hpefl]'), function (el) {
      el.addEventListener('click', function () {
        var fid = +el.getAttribute('data-hpefl');
        closeSheet();
        if (fid !== E.floorId) switchFloor(fid);
      });
    });
  }
  function renderOrient() {
    var o = $('hpe-orient'), n = $('hpe-north');
    if (E.fixed) {
      if (o) o.innerHTML = TF(T('hpe_orient'), '<b>' + esc(E.fixed.facing) + '</b>', '<b>' + esc(E.fixed.sitting) + '</b>');
      if (n) {
        var rot = (360 - norm360(E.fixed.facingDeg)) % 360;
        n.innerHTML = '<div class="dial"><span class="rose" style="transform:rotate(' + rot + 'deg)"><b>' + esc(T('hpe_north_lab')) + '</b><i></i><u></u></span></div>' +
          '<div class="cap">' + esc(T('hpe_facing_lab')) + ' <b>' + trimNum(norm360(E.fixed.facingDeg)) + '°</b><br>' + esc(T('hpe_locked')) + '</div>';
        n.style.display = '';
      }
    } else {
      if (o) o.textContent = T('hpe_orient_none');
      if (n) n.style.display = 'none';
    }
  }

  /* ---------------- 面板 ---------------- */
  function chip(id, label, on, dis) {
    return '<span class="hpe-chip' + (on ? ' on' : '') + (dis ? ' dim' : '') + '" id="' + id + '">' + esc(label) + '</span>';
  }
  function renderPanel() {
    var box = $('hpe-panel'); if (!box) return;
    /* 楼层/说明层占着面板区时不覆写（属性条在外层、自理） */
    if (E.sheet === 'floors' || E.sheet === 'info') { renderAttr(); return; }
    var hint = $('hpe-hint');
    if (E.sheet === 'start') {
      box.innerHTML = '';
      renderStartPanel();
    } else if (E.sheet === 'trace') {
      box.innerHTML = '<div id="hpe-tracebox"></div>';
      if (hint) hint.innerHTML = T('hpe_hint_trace');
      renderTracePanel();
    } else if (E.sheet === 'layers') {
      box.innerHTML = '<div id="hpe-layerbox"></div>';
      if (hint) hint.innerHTML = T('hpe_hint_layers');
      renderLayersPanel();
    } else if (E.sheet === 'tpl') {
      box.innerHTML = '<div id="hpe-tplbox"></div>';
      if (hint) hint.innerHTML = '';
      renderTplPanel();
    } else {
      box.innerHTML = '';
      if (hint) hint.innerHTML = '';
    }
    renderAttr();
  }
  /* 模板面板：空层自动弹；已有房间时亦可从托盘「模板」再开（只替换房间块） */
  function renderTplPanel() {
    var box = $('hpe-tplbox'); if (!box) return;
    var empty = !E.plan.rooms.length && !(E.plan.trace && E.plan.trace.rect);
    box.innerHTML = '<p class="hpe-note" style="margin-top:2px">' + esc(empty ? T('hpe_tpl_empty') : T('hpe_tpl_note')) + '</p>' +
      '<div class="hpe-tpls">' +
      Object.keys(TEMPLATES).map(function (k) {
        var tp = TEMPLATES[k];
        return '<div class="hpe-tpl" data-tpl="' + k + '"><b>' + esc(T(tp.lab)) + '</b><span>' + esc(TF(T('hpe_tpl_rooms_n'), tp.rooms.length)) + '</span></div>';
      }).join('') +
      '<div class="hpe-tpl" data-tpl="blank"><b>' + esc(T('hpe_tpl_blank')) + '</b><span>0</span></div>' +
      '</div>' + (empty ? '' : '<p class="hpe-note">' + esc(T('hpe_tpl_note')) + '</p>');
    Array.prototype.forEach.call(box.querySelectorAll('[data-tpl]'), function (el) {
      el.addEventListener('click', function () {
        var k = el.getAttribute('data-tpl');
        closeSheet();
        if (k !== 'blank') applyTemplate(k);
      });
    });
  }
  function applyTemplate(key) {
    var tp = TEMPLATES[key]; if (!tp) return;
    pushUndo();
    var counts = {};
    var rooms = tp.rooms.map(function (rr) {
      var type = rr[0];
      counts[type] = (counts[type] || 0) + 1;
      var nm = T('hpe_rt_' + type) + (counts[type] > 1 ? counts[type] : '');
      return { id: uid(), x: toU(rr[1]), y: toU(rr[2]), w: toU(rr[3]), h: toU(rr[4]), name: nm, type: type };
    });
    /* 居中到原点附近，与手绘默认范围对齐 */
    var mx = 0, my = 0;
    tp.rooms.forEach(function (rr) { mx = Math.max(mx, rr[1] + rr[3]); my = Math.max(my, rr[2] + rr[4]); });
    var ox = toU(mx) / 2, oy = toU(my) / 2;
    rooms.forEach(function (r) { r.x -= ox; r.y -= oy; });
    E.plan.rooms = rooms;
    E.plan.liji = null;
    E.sel = null; E.view = null;
    afterChange();
  }

  /* ---------------- 分切式建房（新建层默认入口） ----------------
   * 先定外框一整块 → 点块横/竖切一刀 → 点名定间；块仍落既有 rooms 矩形数组
   * （切＝一矩形换两矩形），几何上永不重叠、永不留缝。
   * 户外排除块：room.ex=1，不算房间、不计面积，渲染户型外斜纹（L/U 形缺角用）。 */
  var MINCUT = 0.6; /* 米：落刀后任一侧最小尺寸 */
  function cutRoom() { return E.cut ? roomById(E.cut.id) : null; }
  function cutSizes() {
    var c = E.cut, r = cutRoom(); if (!r) return null;
    if (c.dir === 'v') return { a: c.pos - r.x, b: (r.x + r.w) - c.pos };
    return { a: c.pos - r.y, b: (r.y + r.h) - c.pos };
  }
  function clampCutPos() {
    var c = E.cut, r = cutRoom(); if (!r) return;
    var m = toU(MINCUT);
    if (c.dir === 'v') c.pos = Math.max(r.x + m, Math.min(r.x + r.w - m, c.pos));
    else c.pos = Math.max(r.y + m, Math.min(r.y + r.h - m, c.pos));
  }
  function armCut(dir) {
    var r = E.sel && E.sel.kind === 'room' ? roomById(E.sel.id) : null;
    if (!r || r.ex) return;
    var dim = dir === 'v' ? toM(r.w) : toM(r.h);
    if (dim < MINCUT * 2 + 0.05) { toastMsg(T('hpe_cut_small')); return; }
    E.cut = { id: r.id, dir: dir, pos: dir === 'v' ? r.x + r.w / 2 : r.y + r.h / 2 };
    render(); renderAttr();
  }
  function cancelCut() { E.cut = null; render(); renderAttr(); }
  function confirmCut() {
    var c = E.cut, r = cutRoom();
    if (!r) { E.cut = null; renderAttr(); return; }
    clampCutPos();
    pushUndo();
    var n2;
    if (c.dir === 'v') {
      n2 = { id: uid(), x: c.pos, y: r.y, w: (r.x + r.w) - c.pos, h: r.h, name: T('hpe_room_def'), type: 'other' };
      r.w = c.pos - r.x;
    } else {
      n2 = { id: uid(), x: r.x, y: c.pos, w: r.w, h: (r.y + r.h) - c.pos, name: T('hpe_room_def'), type: 'other' };
      r.h = c.pos - r.y;
    }
    E.plan.rooms.push(n2);
    E.cut = null;
    E.sel = { kind: 'room', id: n2.id }; /* 选中新块，顺手就能点名 */
    E.attrFull = true; E._attrKey = 'room:' + n2.id; /* 落刀后直接展开完整条（点名/续切一步到位） */
    E.view = null;
    afterChange();
  }
  function renderCut(u) {
    var c = E.cut, r = cutRoom(); if (!r) return '';
    var sz = cutSizes(); if (!sz) return '';
    var fsD = u * 2.1;
    function cap(cx, cy, txt) {
      var w = txt.length * fsD * 0.62 + u * 1.6;
      return '<g class="hpe-dim"><rect x="' + (cx - w / 2) + '" y="' + (cy - fsD * 0.78) + '" width="' + w + '" height="' + (fsD * 1.55) + '" rx="' + (u * 0.6) + '"/>' +
        '<text x="' + cx + '" y="' + (cy + fsD * 0.36) + '" text-anchor="middle" font-size="' + fsD + '">' + esc(txt) + '</text></g>';
    }
    var s = '';
    if (c.dir === 'v') {
      s += '<line class="hpe-cutline" x1="' + c.pos + '" y1="' + r.y + '" x2="' + c.pos + '" y2="' + (r.y + r.h) + '" stroke-width="' + (u * 0.3) + '"/>' +
        '<rect class="hpe-cuthit" data-act="cutline" x="' + (c.pos - u * 2.4) + '" y="' + r.y + '" width="' + (u * 4.8) + '" height="' + r.h + '"/>' +
        cap(r.x + sz.a / 2, r.y + r.h / 2, trimNum(toM(sz.a), 2) + ' m') +
        cap(c.pos + sz.b / 2, r.y + r.h / 2, trimNum(toM(sz.b), 2) + ' m');
    } else {
      s += '<line class="hpe-cutline" x1="' + r.x + '" y1="' + c.pos + '" x2="' + (r.x + r.w) + '" y2="' + c.pos + '" stroke-width="' + (u * 0.3) + '"/>' +
        '<rect class="hpe-cuthit" data-act="cutline" x="' + r.x + '" y="' + (c.pos - u * 2.4) + '" width="' + r.w + '" height="' + (u * 4.8) + '"/>' +
        cap(r.x + r.w / 2, r.y + sz.a / 2, trimNum(toM(sz.a), 2) + ' m') +
        cap(r.x + r.w / 2, c.pos + sz.b / 2, trimNum(toM(sz.b), 2) + ' m');
    }
    return s;
  }
  function syncCutBar() {
    if (!E.cut) return;
    var sz = cutSizes(); if (!sz) return;
    var a = document.querySelector('.hpe-cut-a'), b = document.querySelector('.hpe-cut-b');
    if (a) a.textContent = trimNum(toM(sz.a), 2) + ' m';
    if (b) b.textContent = trimNum(toM(sz.b), 2) + ' m';
    var inp = $('hpe-cut-inp');
    if (inp && document.activeElement !== inp) inp.value = trimNum(toM(sz.a), 2);
  }
  function renderCutBar(box) {
    var c = E.cut, r = cutRoom();
    if (!r) { E.cut = null; return false; }
    var sz = cutSizes();
    var d1 = c.dir === 'v' ? T('hpe_dir_l') : T('hpe_dir_u');
    var d2 = c.dir === 'v' ? T('hpe_dir_r') : T('hpe_dir_d');
    box.innerHTML = '<div class="hpe-attr"><div class="t"><b>' + esc(T('hpe_cut_title')) + '</b>' +
      '<span>' + esc(d1) + ' <b class="hpe-cut-a">' + trimNum(toM(sz.a), 2) + ' m</b></span>' +
      '<span>' + esc(d2) + ' <b class="hpe-cut-b">' + trimNum(toM(sz.b), 2) + ' m</b></span></div>' +
      '<div class="hpe-attr-form"><label>' + esc(d1) + esc(T('hpe_len')) +
      '<input class="hpe-inp sm" id="hpe-cut-inp" type="number" step="0.1" min="' + MINCUT + '" value="' + trimNum(toM(sz.a), 2) + '"></label>' +
      '<span class="hpe-cuthint">' + esc(T('hpe_cut_hint')) + '</span></div>' +
      '<div class="ops"><span class="hpe-op primary" id="hpe-cut-ok">' + esc(T('hpe_cut_ok')) + '</span>' +
      '<span class="hpe-op" id="hpe-cut-cancel">' + esc(T('hpe_cancel')) + '</span></div></div>';
    $('hpe-cut-ok').addEventListener('click', confirmCut);
    $('hpe-cut-cancel').addEventListener('click', cancelCut);
    var inp = $('hpe-cut-inp');
    if (inp) inp.addEventListener('change', function () {
      var v = parseFloat(inp.value), rr = cutRoom(); if (!isFinite(v) || !rr) return;
      if (E.cut.dir === 'v') E.cut.pos = rr.x + toU(v); else E.cut.pos = rr.y + toU(v);
      clampCutPos(); render(); syncCutBar();
    });
    return true;
  }
  /* 共边且并集为矩形的邻块（分切 tiling 里即四向邻间） */
  function mergeDirs(r) {
    var eps = toU(0.03), out = [];
    E.plan.rooms.forEach(function (n) {
      if (n.id === r.id) return;
      if (Math.abs(n.y - r.y) < eps && Math.abs(n.h - r.h) < eps) {
        if (Math.abs(n.x + n.w - r.x) < eps) out.push({ dir: 'l', n: n });
        if (Math.abs(n.x - (r.x + r.w)) < eps) out.push({ dir: 'r', n: n });
      }
      if (Math.abs(n.x - r.x) < eps && Math.abs(n.w - r.w) < eps) {
        if (Math.abs(n.y + n.h - r.y) < eps) out.push({ dir: 'u', n: n });
        if (Math.abs(n.y - (r.y + r.h)) < eps) out.push({ dir: 'd', n: n });
      }
    });
    return out;
  }
  function mergeRoom(dir) {
    var r = E.sel && E.sel.kind === 'room' ? roomById(E.sel.id) : null;
    if (!r) return;
    var hit = mergeDirs(r).filter(function (m) { return m.dir === dir; })[0];
    if (!hit) return;
    var n = hit.n;
    pushUndo();
    if (dir === 'l') { var nx = n.x; r.w = (r.x + r.w) - nx; r.x = nx; }
    if (dir === 'r') r.w = (n.x + n.w) - r.x;
    if (dir === 'u') { var ny = n.y; r.h = (r.y + r.h) - ny; r.y = ny; }
    if (dir === 'd') r.h = (n.y + n.h) - r.y;
    if (!(r.ex && n.ex)) delete r.ex; /* 一间是房间则并后是房间；两块都户外才仍户外 */
    E.plan.rooms = E.plan.rooms.filter(function (x) { return x.id !== n.id; });
    E.cut = null; E.view = null;
    afterChange();
  }
  function toggleOut(r) {
    pushUndo();
    if (r.ex) { delete r.ex; r.name = T('hpe_room_def'); r.type = 'other'; }
    else { r.ex = 1; r.name = T('hpe_out_name'); r.type = 'other'; }
    E.cut = null;
    afterChange();
    if (r.ex) toastMsg(T('hpe_out_toast'));
  }
  function typeNameUnique(type, selfId) {
    var base = T('hpe_rt_' + type), used = {};
    E.plan.rooms.forEach(function (o) { if (o.id !== selfId && o.name) used[o.name] = 1; });
    if (!used[base]) return base;
    var i = 2; while (used[base + i]) i++;
    return base + i;
  }
  function nameRoomByType(r, type) {
    pushUndo();
    r.type = type;
    r.name = typeNameUnique(type, r.id);
    afterChange();
  }
  /* 起始选择面：分切式（推荐）／模板·自由／拍照描图 */
  function renderStartPanel() {
    var box = $('hpe-panel'); if (!box) return;
    var hint = $('hpe-hint'); if (hint) hint.innerHTML = '';
    if (E.startPhase === 'frame') {
      box.innerHTML = '<p class="hpe-note" style="margin-top:2px">' + esc(T('hpe_frame_d')) + '</p>' +
        '<div class="hpe-frame">' +
        '<label>' + esc(T('hpe_len')) + ' <input class="hpe-inp sm" id="hpe-fr-len" type="number" step="0.1" min="2" value="10"> m</label>' +
        '<label>' + esc(T('hpe_wid')) + ' <input class="hpe-inp sm" id="hpe-fr-wid" type="number" step="0.1" min="2" value="8"> m</label>' +
        '<button class="btn primary" id="hpe-fr-go">' + esc(T('hpe_frame_go')) + '</button></div>' +
        '<p class="hpe-note"><span class="hpe-chip" id="hpe-fr-back">' + esc(T('hpe_frame_back')) + '</span></p>';
      var go = $('hpe-fr-go');
      if (go) go.addEventListener('click', startFrame);
      var bk = $('hpe-fr-back');
      if (bk) bk.addEventListener('click', function () { E.startPhase = 'pick'; renderPanel(); });
      return;
    }
    box.innerHTML = '<div class="hpe-starts">' +
      '<div class="hpe-start rec" data-start="split"><b>' + esc(T('hpe_start_split')) + '</b><span>' + esc(T('hpe_start_split_d')) + '</span></div>' +
      '<div class="hpe-start" data-start="tpl"><b>' + esc(T('hpe_start_tpl')) + '</b><span>' + esc(T('hpe_start_tpl_d')) + '</span></div>' +
      '<div class="hpe-start" data-start="trace"><b>' + esc(T('hpe_start_trace')) + '</b><span>' + esc(T('hpe_start_trace_d')) + '</span></div>' +
      '</div>';
    Array.prototype.forEach.call(box.querySelectorAll('[data-start]'), function (el) {
      el.addEventListener('click', function () {
        var k = el.getAttribute('data-start');
        if (k === 'split') { E.startPhase = 'frame'; renderPanel(); }
        else if (k === 'tpl') showSheet('tpl');
        else if (k === 'trace') showSheet('trace');
      });
    });
  }
  function startFrame() {
    var lv = parseFloat(($('hpe-fr-len') || {}).value), wv = parseFloat(($('hpe-fr-wid') || {}).value);
    if (!isFinite(lv) || lv < 2) lv = 10;
    if (!isFinite(wv) || wv < 2) wv = 8;
    pushUndo();
    var W = toU(lv), H = toU(wv);
    var r = { id: uid(), x: -W / 2, y: -H / 2, w: W, h: H, name: T('hpe_room_def'), type: 'other' };
    E.plan.rooms = [r];
    E.plan.liji = { x: 0, y: 0 }; /* 太极点＝外框对角线交点 */
    E.sel = { kind: 'room', id: r.id };
    E.attrFull = true; E._attrKey = 'room:' + r.id; /* 外框生成后直接展开完整条，横/竖切就在手边 */
    E.view = null;
    closeSheet();
    afterChange();
    toastMsg(T('hpe_split_hint'));
  }

  /* ---------------- 托盘（模拟人生式目录条） ----------------
   * 拖放为主：tile 上 pointer 拖影跟随、松手落位；点选→点放为兜底
   * （房间单发、构件连发，与旧构件库手感一致）。 */
  function placeRoomAt(type, pt) {
    var pr = null;
    ROOM_PRESETS.forEach(function (x) { if (x.type === type) pr = x; });
    if (!pr) return;
    pushUndo();
    var w = toU(pr.w), h = toU(pr.h);
    var x = pt.x - w / 2, y = pt.y - h / 2;
    if (E.grid) { var stp = toU(0.1); x = snapVal(x, stp); y = snapVal(y, stp); }
    var r = { id: uid(), x: x, y: y, w: w, h: h, name: T('hpe_rt_' + type), type: type };
    E.plan.rooms.push(r);
    E.sel = { kind: 'room', id: r.id };
    E.arm = null; syncTray();
    afterChange();
  }
  function placeFixAt(type, pt) {
    if (!FIX[type]) return;
    pushUndo();
    var nf = { id: uid(), type: type, x: pt.x, y: pt.y, rot: 0, flip: false };
    wallSnap(nf, pt);
    E.plan.fixtures.push(nf);
    E.sel = { kind: 'fixture', id: nf.id };
    afterChange();
  }
  function cycleOverlay() {
    if (!E.plan) return;
    var seq = ['fx', 'compass', 'bz', 'none'];
    var i = seq.indexOf(E.plan.layers.overlay);
    E.plan.layers.overlay = seq[(i + 1) % seq.length];
    E.chartCache = null;
    save(); render(); renderTray();
    if (E.sheet === 'layers') renderLayersPanel();
  }
  function renderTray() {
    var sc = $('hpe-tray-scroll'); if (!sc) return;
    var h = '<div class="hpe-tgroup"><div class="hpe-tgname">' + esc(T('hpe_tray_rooms')) + '</div><div class="hpe-tgrow">' +
      ROOM_PRESETS.map(function (pr) {
        return '<div class="hpe-tile2" data-tile="room" data-key="' + pr.type + '">' +
          '<svg class="sw" width="34" height="24" viewBox="0 0 34 24"><rect class="hpe-rt-' + pr.type + '" style="stroke:var(--line)" x="0.5" y="0.5" width="33" height="23" rx="5"/></svg>' +
          '<div class="n">' + esc(T('hpe_rt_' + pr.type)) + '</div><div class="d">' + trimNum(pr.w, 1) + '×' + trimNum(pr.h, 1) + ' m</div></div>';
      }).join('') + '</div></div>';
    FIX_CATS.forEach(function (c) {
      var ks = Object.keys(FIX).filter(function (k) { return FIX[k].cat === c; });
      h += '<div class="hpe-tgroup"><div class="hpe-tgname">' + esc(T('hpe_cat_' + c)) + '</div><div class="hpe-tgrow">' +
        ks.map(function (k) {
          var d = FIX[k];
          return '<div class="hpe-tile2" data-tile="fix" data-key="' + k + '">' +
            (d.sw ? '<span class="hpe-swbdg ' + d.sw + '">' + esc(T('hpe_sw_' + d.sw)) + '</span>' : '') +
            '<svg width="30" height="27" viewBox="0 0 ' + d.box[0] + ' ' + d.box[1] + '" preserveAspectRatio="xMidYMid meet">' +
            '<g stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round">' + d.art + '</g></svg>' +
            '<div class="n">' + esc(T('hpe_fix_' + k)) + '</div><div class="d">' + trimNum(d.w, 2) + '×' + trimNum(d.h, 2) + ' m</div></div>';
        }).join('') + '</div></div>';
    });
    var ovLab = E.plan ? T('hpe_ov_' + E.plan.layers.overlay) : '';
    h += '<div class="hpe-tgroup"><div class="hpe-tgname">' + esc(T('hpe_tray_actions')) + '</div><div class="hpe-tgrow">' +
      '<div class="hpe-tile2 act" data-tile="split"><span class="gic">✂</span><div class="n">' + esc(T('hpe_split_tile')) + '</div></div>' +
      '<div class="hpe-tile2 act" data-tile="tpl"><span class="gic">▦</span><div class="n">' + esc(T('hpe_tpl')) + '</div></div>' +
      '<div class="hpe-tile2 act" data-tile="trace"><span class="gic">✎</span><div class="n">' + esc(T('hpe_mode_trace')) + '</div></div>' +
      '<div class="hpe-tile2 act" data-tile="ovcycle"><span class="gic">◎</span><div class="n">' + esc(T('hpe_lay_overlay')) + (ovLab ? '·' + esc(ovLab) : '') + '</div></div>' +
      '<div class="hpe-tile2 act" data-tile="gofree"><span class="gic">▸</span><div class="n">' + esc(T('hpe_go_free')) + '</div></div>' +
      '</div></div>';
    sc.innerHTML = h;
    syncTray();
  }
  function syncTray() {
    var bar = $('hpe-armed');
    var name = null;
    if (E.arm && E.arm.kind === 'room') name = T('hpe_rt_' + E.arm.key);
    else if (E.placeType) name = T('hpe_fix_' + E.placeType);
    if (bar) {
      if (name) { bar.hidden = false; bar.textContent = TF(T('hpe_armed'), name); }
      else { bar.hidden = true; bar.textContent = ''; }
    }
    var sc = $('hpe-tray-scroll');
    if (sc) Array.prototype.forEach.call(sc.querySelectorAll('[data-tile]'), function (el) {
      var k = el.getAttribute('data-tile'), key = el.getAttribute('data-key');
      var hot = (k === 'room' && E.arm && E.arm.kind === 'room' && E.arm.key === key) ||
        (k === 'fix' && E.placeType === key);
      el.classList.toggle('hot', !!hot);
    });
  }
  function trayDown(e) {
    var el = e.target.closest ? e.target.closest('[data-tile]') : null;
    if (!el) return;
    var kind = el.getAttribute('data-tile');
    if (kind === 'split') {
      if (!E.plan) return;
      var emp = !E.plan.rooms.length && !(E.plan.trace && E.plan.trace.rect);
      if (emp) { E.startPhase = 'pick'; showSheet('start'); }
      else toastMsg(T('hpe_split_hint'));
      return;
    }
    if (kind === 'gofree') { closeSheet(); toastMsg(T('hpe_go_free_toast')); return; }
    if (kind === 'tpl') { if (E.sheet === 'tpl') closeSheet(); else showSheet('tpl'); return; }
    if (kind === 'trace') {
      if (E.stage) cancelStage();
      if (E.sheet === 'trace') closeSheet(); else showSheet('trace');
      return;
    }
    if (kind === 'ovcycle') { cycleOverlay(); return; }
    E.trayDrag = { kind: kind, key: el.getAttribute('data-key'), sx: e.clientX, sy: e.clientY, ghost: null, el: el };
    try { el.setPointerCapture(e.pointerId); } catch (err) {}
  }
  function trayMove(e) {
    var td = E.trayDrag; if (!td) return;
    if (!td.ghost) {
      if (Math.abs(e.clientX - td.sx) + Math.abs(e.clientY - td.sy) < 9) return;
      var g = document.createElement('div');
      g.className = 'hpe-ghost';
      g.innerHTML = td.el.outerHTML;
      document.body.appendChild(g);
      td.ghost = g;
    }
    td.ghost.style.left = e.clientX + 'px';
    td.ghost.style.top = e.clientY + 'px';
  }
  function trayUp(e) {
    var td = E.trayDrag; if (!td) return;
    E.trayDrag = null;
    var wasDrag = !!td.ghost;
    if (td.ghost && td.ghost.parentNode) td.ghost.parentNode.removeChild(td.ghost);
    if (e.type === 'pointercancel') return; /* 横滑托盘被浏览器接管：只清理，不当点选 */
    if (wasDrag) {
      var svg = $('hpe-svg');
      if (svg && E.plan && !E.stage) {
        var r = svg.getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
          var pt = svgPoint(e);
          if (td.kind === 'room') placeRoomAt(td.key, pt);
          else placeFixAt(td.key, pt);
        }
      }
      return;
    }
    /* 点选切换待放 */
    if (td.kind === 'room') {
      E.arm = (E.arm && E.arm.kind === 'room' && E.arm.key === td.key) ? null : { kind: 'room', key: td.key };
      E.placeType = null;
    } else {
      E.placeType = E.placeType === td.key ? null : td.key;
      E.arm = null;
    }
    syncTray();
  }

  /* 属性条（房间/构件共用 #hpe-attr）：选中默认只出薄条（不遮画布），
   * 点「编辑」/点薄条/点房名/双击才展开完整面板；换选中自动回薄条。 */
  function renderAttr() {
    var box = $('hpe-attr'); if (!box) return;
    var selKey = E.sel ? E.sel.kind + ':' + E.sel.id : '';
    if (selKey !== E._attrKey) { E._attrKey = selKey; E.attrFull = false; }
    /* 分切态优先：属性条变切条（两侧尺寸＋输数字＋确定/取消），不走薄条 */
    if (E.cut && renderCutBar(box)) { layoutAttr(); return; }
    if (E.sel && E.sel.kind === 'room') {
      var r = roomById(E.sel.id); if (!r) { box.innerHTML = ''; layoutAttr(); return; }
      var Lm = toM(r.w), Wm = toM(r.h);
      if (!E.attrFull) {
        box.innerHTML = '<div class="hpe-attr thin" id="hpe-a-thin"><b>' + esc(r.name || '') + '</b>' +
          (r.ex ? '<span>' + esc(T('hpe_out_note')) + '</span>'
                : '<span>' + trimNum(Lm, 2) + ' × ' + trimNum(Wm, 2) + ' m · ' + trimNum(Lm * Wm) + '㎡</span>') +
          '<span class="ops"><span class="hpe-op" id="hpe-a-edit">' + esc(T('hpe_edit')) + '</span>' +
          '<span class="hpe-op" id="hpe-a-copy">' + esc(T('hpe_copy')) + '</span>' +
          '<span class="hpe-op danger" id="hpe-a-del">' + esc(T('hpe_del')) + '</span></span></div>';
        $('hpe-a-edit').addEventListener('click', function () { E.attrFull = true; renderAttr(); revealRect(r); });
        $('hpe-a-thin').addEventListener('click', function (e) {
          if (e.target.closest && e.target.closest('.hpe-op')) return;
          E.attrFull = true; renderAttr(); revealRect(r);
        });
        $('hpe-a-copy').addEventListener('click', function () {
          pushUndo();
          var c = clone(r); c.id = uid(); c.x += toU(0.4); c.y += toU(0.4);
          E.plan.rooms.push(c); E.sel = { kind: 'room', id: c.id }; afterChange();
        });
        $('hpe-a-del').addEventListener('click', function () {
          pushUndo();
          E.plan.rooms = E.plan.rooms.filter(function (x) { return x.id !== r.id; });
          E.sel = null; afterChange();
        });
        layoutAttr();
        return;
      }
      var mg = mergeDirs(r);
      var capsHtml = r.ex ? '' : '<div class="hpe-ncaps"><span class="lab">' + esc(T('hpe_names_lab')) + '</span>' +
        ROOM_TYPES.filter(function (tp) { return tp !== 'other'; }).map(function (tp) {
          return '<span class="hpe-ncap' + (r.type === tp ? ' on' : '') + '" data-ncap="' + tp + '">' + esc(T('hpe_rt_' + tp)) + '</span>';
        }).join('') + '</div>';
      var opsHtml = '';
      if (!r.ex) opsHtml += '<span class="hpe-op" id="hpe-a-cuth">' + esc(T('hpe_cut_h')) + '</span>' +
        '<span class="hpe-op" id="hpe-a-cutv">' + esc(T('hpe_cut_v')) + '</span>';
      if (mg.length) opsHtml += '<span class="hpe-mglab">' + esc(T('hpe_merge_to')) + '</span>' + mg.map(function (m) {
        return '<span class="hpe-op" data-mg="' + m.dir + '">' + esc(TF(T('hpe_merge_dir'), T('hpe_dir_' + m.dir))) + '</span>';
      }).join('');
      opsHtml += '<span class="hpe-op" id="hpe-a-out">' + esc(r.ex ? T('hpe_out_restore') : T('hpe_out')) + '</span>';
      box.innerHTML = '<div class="hpe-attr"><div class="t"><b>' + esc(r.ex ? T('hpe_out_name') : (r.name || '')) + '</b>' +
        '<span>' + esc(T('hpe_len')) + ' <b>' + trimNum(Lm, 2) + ' m</b></span>' +
        '<span>' + esc(T('hpe_wid')) + ' <b>' + trimNum(Wm, 2) + ' m</b></span>' +
        '<span>' + esc(T('hpe_area')) + ' <b>' + trimNum(Lm * Wm) + '㎡</b></span>' +
        '<span>' + esc(T('hpe_peri')) + ' ' + trimNum(2 * (Lm + Wm)) + ' m</span></div>' +
        capsHtml +
        '<div class="hpe-attr-form">' +
        '<label>' + esc(T('hpe_name')) + '<input class="hpe-inp" id="hpe-a-name" value="' + esc(r.name || '') + '"></label>' +
        '<label>' + esc(T('hpe_type')) + '<select class="hpe-inp" id="hpe-a-type">' +
        ROOM_TYPES.map(function (tp) { return '<option value="' + tp + '"' + (r.type === tp ? ' selected' : '') + '>' + esc(T('hpe_rt_' + tp)) + '</option>'; }).join('') +
        '</select></label>' +
        '<label>' + esc(T('hpe_len')) + '<input class="hpe-inp sm" id="hpe-a-len" type="number" step="0.1" min="0.3" value="' + trimNum(Lm, 2) + '"></label>' +
        '<label>' + esc(T('hpe_wid')) + '<input class="hpe-inp sm" id="hpe-a-wid" type="number" step="0.1" min="0.3" value="' + trimNum(Wm, 2) + '"></label>' +
        '</div>' +
        '<div class="ops">' + opsHtml + '<span class="hpe-op" id="hpe-a-copy">' + esc(T('hpe_copy')) + '</span>' +
        '<span class="hpe-op danger" id="hpe-a-del">' + esc(T('hpe_del')) + '</span></div></div>';
      var nm = $('hpe-a-name'), tp = $('hpe-a-type'), ln = $('hpe-a-len'), wd = $('hpe-a-wid');
      [nm, tp, ln, wd].forEach(function (el) {
        if (el) el.addEventListener('focus', function () { E.focusSnap = clone(E.plan); });
      });
      function applyFromInputs() {
        if (E.focusSnap) { E.undoStack.push(E.focusSnap); E.focusSnap = null; E.redoStack.length = 0; }
        var rr = roomById(E.sel.id); if (!rr) return;
        rr.name = nm.value.trim();
        rr.type = tp.value;
        var lv = parseFloat(ln.value), wv = parseFloat(wd.value);
        if (isFinite(lv) && lv >= 0.3) rr.w = toU(lv);
        if (isFinite(wv) && wv >= 0.3) rr.h = toU(wv);
        afterChange();
      }
      [nm, tp, ln, wd].forEach(function (el) { if (el) el.addEventListener('change', applyFromInputs); });
      $('hpe-a-copy').addEventListener('click', function () {
        pushUndo();
        var c = clone(r); c.id = uid(); c.x += toU(0.4); c.y += toU(0.4);
        E.plan.rooms.push(c); E.sel = { kind: 'room', id: c.id }; afterChange();
      });
      $('hpe-a-del').addEventListener('click', function () {
        pushUndo();
        E.plan.rooms = E.plan.rooms.filter(function (x) { return x.id !== r.id; });
        E.sel = null; afterChange();
      });
      var chB = $('hpe-a-cuth'), cvB = $('hpe-a-cutv');
      if (chB) chB.addEventListener('click', function () { armCut('h'); });
      if (cvB) cvB.addEventListener('click', function () { armCut('v'); });
      var outB = $('hpe-a-out');
      if (outB) outB.addEventListener('click', function () {
        var rr = roomById(E.sel.id); if (rr) toggleOut(rr);
      });
      Array.prototype.forEach.call(box.querySelectorAll('[data-mg]'), function (el) {
        el.addEventListener('click', function () { mergeRoom(el.getAttribute('data-mg')); });
      });
      Array.prototype.forEach.call(box.querySelectorAll('[data-ncap]'), function (el) {
        el.addEventListener('click', function () {
          var rr = roomById(E.sel.id); if (rr) nameRoomByType(rr, el.getAttribute('data-ncap'));
        });
      });
    } else if (E.sel && E.sel.kind === 'fixture') {
      var f = fixById(E.sel.id); if (!f) { box.innerHTML = ''; layoutAttr(); return; }
      var d = FIX[f.type];
      if (!E.attrFull) {
        box.innerHTML = '<div class="hpe-attr thin" id="hpe-a-thin"><b>' + esc(T('hpe_fix_' + f.type)) + '</b>' +
          '<span>' + trimNum(d.w, 2) + ' × ' + trimNum(d.h, 2) + ' m' + (d.sw ? ' · ' + esc(T('hpe_sw_' + d.sw)) : '') + '</span>' +
          '<span class="ops"><span class="hpe-op" id="hpe-a-edit">' + esc(T('hpe_edit')) + '</span>' +
          '<span class="hpe-op danger" id="hpe-f-del">' + esc(T('hpe_del')) + '</span></span></div>';
        $('hpe-a-edit').addEventListener('click', function () {
          E.attrFull = true; renderAttr();
          revealRect({ x: f.x - toU(d.w) / 2, y: f.y - toU(d.h) / 2, w: toU(d.w), h: toU(d.h) });
        });
        $('hpe-f-del').addEventListener('click', function () {
          pushUndo();
          E.plan.fixtures = E.plan.fixtures.filter(function (x) { return x.id !== f.id; });
          E.sel = null; afterChange();
        });
        layoutAttr();
        return;
      }
      box.innerHTML = '<div class="hpe-attr"><div class="t"><b>' + esc(T('hpe_fix_' + f.type)) + '</b>' +
        '<span>' + trimNum(d.w, 2) + ' × ' + trimNum(d.h, 2) + ' m</span>' +
        (d.sw ? '<span>' + esc(T('hpe_sw_' + d.sw)) + '</span>' : '') +
        '<span>' + esc(T('hpe_rot_lab')) + ' ' + (f.rot || 0) + '°</span></div>' +
        '<div class="ops"><span class="hpe-op" id="hpe-f-rot">' + esc(T('hpe_rotate')) + '</span>' +
        '<span class="hpe-op" id="hpe-f-flip">' + esc(T('hpe_flip')) + '</span>' +
        '<span class="hpe-op danger" id="hpe-f-del">' + esc(T('hpe_del')) + '</span></div></div>';
      $('hpe-f-rot').addEventListener('click', function () { pushUndo(); f.rot = ((f.rot || 0) + 90) % 360; afterChange(); });
      $('hpe-f-flip').addEventListener('click', function () { pushUndo(); f.flip = !f.flip; afterChange(); });
      $('hpe-f-del').addEventListener('click', function () {
        pushUndo();
        E.plan.fixtures = E.plan.fixtures.filter(function (x) { return x.id !== f.id; });
        E.sel = null; afterChange();
      });
    } else {
      box.innerHTML = '';
    }
    layoutAttr();
  }

  /* ---------------- 描图面板 ---------------- */
  function tracePhotos() {
    return db.photos.where('houseId').equals(E.houseId).toArray().then(function (ps) {
      return ps.filter(function (p) { return p.floorId === E.floorId || p.floorId == null; })
        .sort(function (a, b) { return b.ts - a.ts; });
    });
  }
  function renderTracePanel() {
    var box = $('hpe-tracebox'); if (!box) return;
    if (E.stage) {
      box.innerHTML = '<div class="hpe-cal"><div class="r"><b>' + esc(T('hpe_stage_title')) + '</b><span>' + esc(T('hpe_stage_hint')) + '</span></div>' +
        '<div class="r" style="margin-top:9px"><button class="btn primary" id="hpe-warp">' + esc(T('hpe_warp')) + '</button>' +
        '<button class="btn" id="hpe-stage-cancel">' + esc(T('hpe_cancel')) + '</button></div></div>';
      $('hpe-warp').addEventListener('click', doWarp);
      $('hpe-stage-cancel').addEventListener('click', function () { cancelStage(); });
      return;
    }
    tracePhotos().then(function (ps) {
      if (!E.plan) return;
      var cur = E.plan.trace && E.plan.trace.photoId;
      var opts = '<option value="">' + esc(T('hpe_photo_pick')) + '</option>' + ps.map(function (p) {
        return '<option value="' + p.id + '"' + (p.id === cur ? ' selected' : '') + '>' +
          esc(new Date(p.ts).toLocaleDateString()) + ' ' + esc(new Date(p.ts).toTimeString().slice(0, 5)) + '</option>';
      }).join('');
      var cal = E.plan.calibNote || '';
      box.innerHTML = '<div class="hpe-cal">' +
        '<div class="r"><span>' + esc(T('hpe_photo_lab')) + '</span>' +
        '<select class="hpe-inp" id="hpe-photo-sel">' + opts + '</select>' +
        '<button class="btn" id="hpe-photo-up">' + esc(T('hpe_upload')) + '</button>' +
        (cur ? '<button class="btn" id="hpe-photo-recorner">' + esc(T('hpe_recorner')) + '</button>' : '') + '</div>' +
        '<div class="r" style="margin-top:9px"><span>' + esc(T('hpe_calib_lab')) + '</span>' +
        (E.calibArm
          ? '<b>' + esc(TF(T('hpe_calib_armed'), E.calibPts.length)) + '</b><button class="btn" id="hpe-calib-cancel">' + esc(T('hpe_cancel')) + '</button>'
          : '<button class="btn" id="hpe-calib-start">' + esc(T('hpe_calib_start')) + '</button>' +
            '<span>' + esc(cal ? TF(T('hpe_calib_done'), cal) : T('hpe_calib_none')) + '</span>') + '</div>' +
        (E.calibPts.length === 2 ? '<div class="r" style="margin-top:9px"><span>' + esc(T('hpe_calib_len')) + '</span>' +
          '<input class="hpe-inp sm" id="hpe-calib-val" type="number" step="0.05" min="0.1" placeholder="0.9"> m' +
          '<button class="btn primary" id="hpe-calib-ok">' + esc(T('hpe_calib_ok')) + '</button></div>' : '') +
        '<div class="r" style="margin-top:9px"><span>' + esc(T('hpe_opacity')) + '</span>' +
        '<input type="range" class="hpe-range" id="hpe-opacity" min="15" max="100" value="' + Math.round(((E.plan.trace && E.plan.trace.opacity != null ? E.plan.trace.opacity : 0.62)) * 100) + '">' +
        '<span id="hpe-opacity-v">' + Math.round((E.plan.trace && E.plan.trace.opacity != null ? E.plan.trace.opacity : 0.62) * 100) + '%</span></div>' +
        '<div class="r" style="margin-top:9px"><span>' + esc(T('hpe_trace_how')) + '</span></div></div>';
      var sel = $('hpe-photo-sel');
      if (sel) sel.addEventListener('change', function () {
        var pid = parseInt(sel.value, 10);
        if (pid) startStage(pid);
      });
      var up = $('hpe-photo-up');
      if (up) up.addEventListener('click', function () { var f = $('hpe-file'); if (f) f.click(); });
      var rc = $('hpe-photo-recorner');
      if (rc) rc.addEventListener('click', function () { if (E.plan.trace) startStage(E.plan.trace.photoId, true); });
      var cs = $('hpe-calib-start');
      if (cs) cs.addEventListener('click', function () { E.calibArm = true; E.calibPts = []; renderTracePanel(); render(); });
      var cc = $('hpe-calib-cancel');
      if (cc) cc.addEventListener('click', function () { E.calibArm = false; E.calibPts = []; renderTracePanel(); render(); });
      var ok = $('hpe-calib-ok');
      if (ok) ok.addEventListener('click', applyCalib);
      var op = $('hpe-opacity');
      if (op) op.addEventListener('input', function () {
        var v = parseInt(op.value, 10) / 100;
        var vv = $('hpe-opacity-v'); if (vv) vv.textContent = op.value + '%';
        if (E.plan.trace) { E.plan.trace.opacity = v; save(); render(); }
      });
    });
  }
  function applyCalib() {
    var inp = $('hpe-calib-val');
    var v = inp ? parseFloat(inp.value) : NaN;
    if (!isFinite(v) || v <= 0 || E.calibPts.length !== 2) { toastMsg(T('hpe_calib_bad')); return; }
    var dx = E.calibPts[1].x - E.calibPts[0].x, dy = E.calibPts[1].y - E.calibPts[0].y;
    var distU = Math.sqrt(dx * dx + dy * dy);
    if (distU <= 0) return;
    pushUndo();
    E.plan.mPerUnit = v / distU;
    E.plan.calibNote = trimNum(v, 2) + ' m';
    E.calibArm = false; E.calibPts = [];
    toastMsg(T('hpe_calib_set'));
    afterChange();
    renderTracePanel();
  }

  /* ---------------- 图层面板 ---------------- */
  function swRow(key, label, note) {
    var on = !!E.plan.layers[key];
    return '<div class="hpe-lrow"><span>' + esc(label) + '</span>' +
      (note ? '<span class="note">' + esc(note) + '</span>' : '') +
      '<span class="hpe-sw' + (on ? ' on' : '') + '" data-sw="' + key + '"></span></div>';
  }
  function renderLayersPanel() {
    var box = $('hpe-layerbox'); if (!box) return;
    var L = E.plan.layers;
    var gR = gridRect();
    var defR = Math.min(gR.w, gR.h) / 2 * 0.96;
    var curPct = L.compRadius > 0 ? Math.round(L.compRadius / defR * 100) : 100;
    box.innerHTML = '<div class="hpe-panel"><div class="hpe-sub" style="margin-bottom:8px">' +
      chip('hpe-snap', T('hpe_snap'), E.snap) + chip('hpe-gridsw', T('hpe_grid'), E.grid) +
      '<span class="hpe-saved" id="hpe-saved"></span></div><h4>' + esc(T('hpe_layers')) + '</h4>' +
      swRow('rooms', T('hpe_lay_rooms')) +
      swRow('fixtures', T('hpe_lay_fixtures')) +
      swRow('dims', T('hpe_lay_dims')) +
      swRow('traceBg', T('hpe_lay_photo'), T('hpe_lay_photo_note')) +
      '<div class="hpe-lrow"><span>' + esc(T('hpe_lay_overlay')) + '</span>' +
      '<span class="hpe-ovseg">' +
      ['fx', 'compass', 'bz', 'none'].map(function (k) {
        return '<span class="hpe-ovchip' + (L.overlay === k ? ' on' : '') + '" data-ov="' + k + '">' + esc(T('hpe_ov_' + k)) + '</span>';
      }).join('') + '</span></div>' +
      (L.overlay === 'compass' ? '<div class="hpe-lrow"><span>' + esc(T('hpe_compass_radius')) + '</span>' +
        '<input type="range" class="hpe-range grow" id="hpe-compradius" min="40" max="160" value="' + curPct + '"></div>' : '') +
      (L.overlay === 'fx' ? swRow('palNames', T('hpe_lay_palnames')) : '') +
      (L.overlay !== 'none' && !E.fixed ? '<p class="hpe-note">' + esc(T('hpe_ov_nofixed')) + '</p>' : '') +
      (L.overlay !== 'none' ? '<div class="hpe-lrow"><span>' + esc(T('hpe_ov_opacity')) + '</span>' +
        '<input type="range" class="hpe-range grow" id="hpe-ovopacity" min="30" max="100" value="' + Math.round((L.ovOpacity == null ? 0.92 : L.ovOpacity) * 100) + '"></div>' : '') +
      '<p class="hpe-note">' + esc(T('hpe_liji_hint')) + '</p></div>' +
      '<div class="hpe-panel"><h4 id="hpe-metric-title"></h4><div id="hpe-metrics"></div></div>';
    Array.prototype.forEach.call(box.querySelectorAll('[data-sw]'), function (el) {
      el.addEventListener('click', function () {
        var k = el.getAttribute('data-sw');
        E.plan.layers[k] = !E.plan.layers[k];
        save(); render(); renderLayersPanel(); renderAttr();
      });
    });
    Array.prototype.forEach.call(box.querySelectorAll('[data-ov]'), function (el) {
      el.addEventListener('click', function () {
        E.plan.layers.overlay = el.getAttribute('data-ov');
        E.chartCache = null;
        save(); render(); renderLayersPanel(); renderTray();
      });
    });
    var cr = $('hpe-compradius');
    if (cr) cr.addEventListener('input', function () {
      E.plan.layers.compRadius = defR * parseInt(cr.value, 10) / 100;
      save(); render();
    });
    var snw = $('hpe-snap'); if (snw) snw.addEventListener('click', function () { E.snap = !E.snap; renderLayersPanel(); });
    var grw = $('hpe-gridsw'); if (grw) grw.addEventListener('click', function () { E.grid = !E.grid; renderLayersPanel(); render(); });
    var ov = $('hpe-ovopacity');
    if (ov) ov.addEventListener('input', function () {
      E.plan.layers.ovOpacity = parseInt(ov.value, 10) / 100;
      save(); render();
    });
    renderMetrics();
  }
  function renderMetrics() {
    var title = $('hpe-metric-title'), box = $('hpe-metrics');
    if (!box) return;
    var fl = E.floors.filter(function (f) { return f.id === E.floorId; })[0];
    if (title) title.textContent = TF(T('hpe_metrics'), fl ? fl.name : '');
    var rows = E.plan.rooms.map(function (r) {
      if (r.ex) return '<div class="hpe-mrow"><span>' + esc(T('hpe_out_name')) + '</span><b>' + esc(T('hpe_out_note')) + '</b></div>';
      return '<div class="hpe-mrow"><span>' + esc(r.name || '') + '</span><b>' + trimNum(toM(r.w) * toM(r.h)) + '㎡</b></div>';
    }).join('');
    var tot = E.plan.rooms.reduce(function (s, r) { return s + (r.ex ? 0 : toM(r.w) * toM(r.h)); }, 0);
    rows += '<div class="hpe-mrow total"><span>' + esc(T('hpe_floor_total')) + '</span><b>' + trimNum(tot) + '㎡</b></div>';
    box.innerHTML = rows + '<div class="hpe-mrow total"><span>' + esc(T('hpe_house_total')) + '</span><b id="hpe-house-total">…</b></div>';
    db.plans.where('houseId').equals(E.houseId).toArray().then(function (ps) {
      var sum = 0;
      ps.forEach(function (p) {
        if (p.floorId === E.floorId) return;
        var mp = p.mPerUnit || 1;
        (p.rooms || []).forEach(function (r) { if (!r.ex) sum += r.w * mp * r.h * mp; });
      });
      var el = $('hpe-house-total');
      if (el) el.textContent = trimNum(sum + tot) + '㎡';
    }).catch(function () {});
  }

  /* ---------------- 指针交互 ---------------- */
  function svgPoint(evt) {
    var svg = $('hpe-svg');
    var pt = svg.createSVGPoint();
    pt.x = evt.clientX; pt.y = evt.clientY;
    var m = svg.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    var p = pt.matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  }
  function edgeSnapRoom(r, skipSelf) {
    /* 房间边吸附：收集他房边线 */
    var xs = [], ys = [];
    E.plan.rooms.forEach(function (o) {
      if (skipSelf && o.id === r.id) return;
      xs.push(o.x, o.x + o.w); ys.push(o.y, o.y + o.h);
    });
    if (E.plan.trace && E.plan.trace.rect) {
      var t = E.plan.trace.rect;
      xs.push(t.x, t.x + t.w); ys.push(t.y, t.y + t.h);
    }
    return { xs: xs, ys: ys };
  }
  function wallSnap(f, pt) {
    var d = FIX[f.type];
    if (!d || !d.wall) return pt;
    var thr = toU(0.45), best = null, bd = thr;
    E.plan.rooms.forEach(function (r) {
      var segs = [
        { x1: r.x, y1: r.y, x2: r.x + r.w, y2: r.y, rot: 0 },
        { x1: r.x, y1: r.y + r.h, x2: r.x + r.w, y2: r.y + r.h, rot: 0 },
        { x1: r.x, y1: r.y, x2: r.x, y2: r.y + r.h, rot: 90 },
        { x1: r.x + r.w, y1: r.y, x2: r.x + r.w, y2: r.y + r.h, rot: 90 }
      ];
      segs.forEach(function (sg) {
        var dx = sg.x2 - sg.x1, dy = sg.y2 - sg.y1;
        var len2 = dx * dx + dy * dy || 1;
        var t = ((pt.x - sg.x1) * dx + (pt.y - sg.y1) * dy) / len2;
        t = Math.max(0, Math.min(1, t));
        var qx = sg.x1 + dx * t, qy = sg.y1 + dy * t;
        var dd = Math.sqrt((pt.x - qx) * (pt.x - qx) + (pt.y - qy) * (pt.y - qy));
        if (dd < bd) { bd = dd; best = { x: qx, y: qy, rot: sg.rot }; }
      });
    });
    if (best) { f.x = best.x; f.y = best.y; f.rot = best.rot; return { x: best.x, y: best.y }; }
    return pt;
  }
  function onDown(evt) {
    if (!E.plan && !E.stage) return;
    var svg = $('hpe-svg');
    var pt = svgPoint(evt);
    var tgt = evt.target;
    var actEl = tgt && tgt.closest ? tgt.closest('[data-act]') : null;
    var act = actEl ? actEl.getAttribute('data-act') : null;
    if (E.stage) {
      if (act === 'corner') {
        E.drag = { kind: 'corner', i: +actEl.getAttribute('data-i'), pushed: false };
        svg.setPointerCapture(evt.pointerId);
      }
      return;
    }
    /* 校准取点优先 */
    if (E.calibArm) {
      if (E.calibPts.length < 2) {
        E.calibPts.push({ x: pt.x, y: pt.y });
        render(); renderTracePanel();
      }
      return;
    }
    /* 补角法签：点开说明（toast），不落任何编辑 */
    if (act === 'bujiao') { toastMsg(T('hpe_bujiao_toast')); return; }
    /* 分切态：画布只认切线拖动，其余命中吞掉（确定/取消在下方切条） */
    if (E.cut) {
      if (act === 'cutline') {
        E.drag = { kind: 'cutline', start: pt };
        svg.setPointerCapture(evt.pointerId);
      }
      return;
    }
    /* 描图态：拖框成间优先于一切命中（压在已有房间上也要能描新间，房间编辑回绘制态） */
    if (E.mode === 'trace') {
      E.drag = { kind: 'create', start: pt, id: null };
      svg.setPointerCapture(evt.pointerId);
      return;
    }
    if (act === 'handle' && E.sel && E.sel.kind === 'room') {
      var r0 = roomById(E.sel.id);
      if (r0) {
        pushUndo();
        E.drag = { kind: 'resize', h: actEl.getAttribute('data-h'), orig: clone(r0), start: pt };
        svg.setPointerCapture(evt.pointerId);
      }
      return;
    }
    if (act === 'liji') {
      pushUndo();
      E.drag = { kind: 'liji', start: pt, orig: clone(lijiPoint()) };
      svg.setPointerCapture(evt.pointerId);
      return;
    }
    /* 托盘待放·房间（点放兜底）：以点为中心落间，单发（拖放/再点托盘续放） */
    if (E.arm && E.arm.kind === 'room' && act !== 'fixture') {
      placeRoomAt(E.arm.key, pt);
      return;
    }
    /* 托盘待放·构件优先于房间选择（点房间上也要能落件），点中已有构件仍为选中 */
    if (E.placeType && act !== 'fixture') {
      pushUndo();
      var nf2 = { id: uid(), type: E.placeType, x: pt.x, y: pt.y, rot: 0, flip: false };
      wallSnap(nf2, pt);
      E.plan.fixtures.push(nf2);
      E.sel = { kind: 'fixture', id: nf2.id };
      afterChange();
      return;
    }
    if (act === 'fixture') {
      var f0 = fixById(actEl.getAttribute('data-id'));
      if (f0) {
        E.sel = { kind: 'fixture', id: f0.id };
        if (E.arm) { E.arm = null; syncTray(); }
        pushUndo();
        E.drag = { kind: 'fixture', id: f0.id, start: pt, orig: clone(f0), moved: false };
        svg.setPointerCapture(evt.pointerId);
        render(); renderAttr();
      }
      return;
    }
    if (act === 'room') {
      var rr = roomById(actEl.getAttribute('data-id'));
      if (rr) {
        E.sel = { kind: 'room', id: rr.id };
        pushUndo();
        E.drag = { kind: 'room', id: rr.id, start: pt, orig: clone(rr), moved: false };
        svg.setPointerCapture(evt.pointerId);
        render(); renderAttr();
        /* 展开完整面板只认两条路：薄条「编辑」与双击（此处以 400ms 内同房双点代触屏双击，
         * 房名单点不展开——房名正在房间正中、最易误触，展开走薄条或双击后在面板里改名） */
        var nowT = Date.now();
        var expandIt = !!(E.lastTap && E.lastTap.id === rr.id && nowT - E.lastTap.t < 400);
        E.lastTap = { id: rr.id, t: nowT };
        if (expandIt) {
          E.attrFull = true; renderAttr(); revealRect(rr);
          var nIn = $('hpe-a-name');
          if (nIn) { nIn.focus(); nIn.select(); }
        }
      }
      return;
    }
    /* 空白处 */
    if (E.placeType) {
      pushUndo();
      var nf = { id: uid(), type: E.placeType, x: pt.x, y: pt.y, rot: 0, flip: false };
      wallSnap(nf, pt);
      E.plan.fixtures.push(nf);
      E.sel = { kind: 'fixture', id: nf.id };
      afterChange();
      return;
    }
    if (E.mode === 'trace') {
      E.drag = { kind: 'create', start: pt, pushed: false };
      svg.setPointerCapture(evt.pointerId);
      return;
    }
    if (E.mode === 'draw') {
      /* 空白处单指拖动＝平移画布（压在房间上才是移房，两者不冲突）；点而不拖仍是取消选中 */
      E.sel = null;
      if (!E.view) E.view = fitView();
      E.drag = { kind: 'pan', sx: evt.clientX, sy: evt.clientY, vx: E.view.x, vy: E.view.y };
      svg.setPointerCapture(evt.pointerId);
      render(); renderAttr();
    }
  }
  function onMove(evt) {
    var d = E.drag; if (!d) return;
    var pt = svgPoint(evt);
    if (d.kind === 'cutline') {
      if (!cutRoom()) return;
      if (E.cut.dir === 'v') E.cut.pos = pt.x; else E.cut.pos = pt.y;
      clampCutPos();
      render(); syncCutBar();
      return;
    }
    if (d.kind === 'corner') {
      var st = E.stage, Hh = 1000 * st.natH / st.natW;
      st.corners[d.i] = {
        x: Math.max(0, Math.min(1, pt.x / 1000)),
        y: Math.max(0, Math.min(1, pt.y / Hh))
      };
      render();
      return;
    }
    if (d.kind === 'pan') {
      var svgP = $('hpe-svg'), rcP = svgP ? svgP.getBoundingClientRect() : null;
      if (rcP && rcP.width > 0 && E.view) {
        E.view.x = d.vx - (evt.clientX - d.sx) / rcP.width * E.view.w;
        E.view.y = d.vy - (evt.clientY - d.sy) / rcP.height * E.view.h;
        clampView(); render();
      }
      return;
    }
    var step = E.grid ? toU(0.1) : 0;
    if (d.kind === 'room') {
      var r = roomById(d.id); if (!r) return;
      var nx = d.orig.x + (pt.x - d.start.x), ny = d.orig.y + (pt.y - d.start.y);
      if (E.snap) {
        var es = edgeSnapRoom(r, true), thr = toU(0.18);
        nx = snapCoord(nx, es.xs.concat(es.xs.map(function (e) { return e - r.w; })), thr);
        ny = snapCoord(ny, es.ys.concat(es.ys.map(function (e) { return e - r.h; })), thr);
      }
      if (step) { nx = snapVal(nx, step); ny = snapVal(ny, step); }
      r.x = nx; r.y = ny; d.moved = true;
      render();
    } else if (d.kind === 'resize') {
      var rr = roomById(E.sel.id); if (!rr) return;
      var o = d.orig, h = d.h;
      var dx = pt.x - d.start.x, dy = pt.y - d.start.y;
      var x1 = o.x, y1 = o.y, x2 = o.x + o.w, y2 = o.y + o.h;
      if (h.indexOf('e') >= 0) x2 += dx;
      if (h.indexOf('s') >= 0) y2 += dy;
      if (h.indexOf('w') >= 0) x1 += dx;
      if (h.indexOf('n') >= 0) y1 += dy;
      if (E.snap) {
        var es2 = edgeSnapRoom(rr, true), thr2 = toU(0.18);
        if (h.indexOf('e') >= 0) x2 = snapCoord(x2, es2.xs, thr2);
        if (h.indexOf('w') >= 0) x1 = snapCoord(x1, es2.xs, thr2);
        if (h.indexOf('s') >= 0) y2 = snapCoord(y2, es2.ys, thr2);
        if (h.indexOf('n') >= 0) y1 = snapCoord(y1, es2.ys, thr2);
      }
      if (step) {
        if (h.indexOf('e') >= 0) x2 = snapVal(x2, step);
        if (h.indexOf('w') >= 0) x1 = snapVal(x1, step);
        if (h.indexOf('s') >= 0) y2 = snapVal(y2, step);
        if (h.indexOf('n') >= 0) y1 = snapVal(y1, step);
      }
      var minS = toU(0.4);
      if (x2 - x1 < minS) { if (h.indexOf('w') >= 0) x1 = x2 - minS; else x2 = x1 + minS; }
      if (y2 - y1 < minS) { if (h.indexOf('n') >= 0) y1 = y2 - minS; else y2 = y1 + minS; }
      rr.x = x1; rr.y = y1; rr.w = x2 - x1; rr.h = y2 - y1;
      d.moved = true;
      render();
    } else if (d.kind === 'fixture') {
      var f = fixById(d.id); if (!f) return;
      f.x = d.orig.x + (pt.x - d.start.x);
      f.y = d.orig.y + (pt.y - d.start.y);
      d.moved = true;
      render();
    } else if (d.kind === 'liji') {
      E.plan.liji = { x: pt.x, y: pt.y };
      d.moved = true;
      render();
    } else if (d.kind === 'create') {
      var x = Math.min(d.start.x, pt.x), y = Math.min(d.start.y, pt.y);
      E.tempRect = { x: x, y: y, w: Math.abs(pt.x - d.start.x), h: Math.abs(pt.y - d.start.y) };
      render();
    }
  }
  function onUp(evt) {
    var d = E.drag; if (!d) return;
    E.drag = null;
    if (d.kind === 'pan') return;
    if (d.kind === 'cutline') { render(); syncCutBar(); return; }
    if (d.kind === 'corner') { render(); return; }
    if (d.kind === 'create') {
      var t = E.tempRect; E.tempRect = null;
      if (t && toM(t.w) > 0.3 && toM(t.h) > 0.3) {
        pushUndo();
        var n = E.plan.rooms.length + 1;
        var r = { id: uid(), x: t.x, y: t.y, w: t.w, h: t.h, name: TF(T('hpe_room_n'), n), type: 'other' };
        E.plan.rooms.push(r);
        E.sel = { kind: 'room', id: r.id };
        afterChange();
      } else render();
      return;
    }
    if (d.kind === 'fixture') {
      var f = fixById(d.id);
      if (f && d.moved) { wallSnap(f, { x: f.x, y: f.y }); }
      if (f && !d.moved) { /* 纯点击选中：撤销栈回滚这次 pushUndo */ E.undoStack.pop(); }
      save(); render(); renderAttr();
      return;
    }
    if ((d.kind === 'room' || d.kind === 'resize' || d.kind === 'liji') && !d.moved) E.undoStack.pop();
    if (d.kind === 'liji' || d.kind === 'room' || d.kind === 'resize') { save(); render(); renderAttr(); }
  }

  /* ---------------- 多指手势层（双指捏合缩放＋双指平移） ----------------
   * svg 指针事件先过此层：单指走原 onDown/onMove/onUp；第二指落下即转手势，
   * 进行中的单指拖动先还原（防误移），两指全抬前不把后续事件漏给单指逻辑。 */
  function cancelActiveDrag() {
    var d = E.drag; if (!d) return;
    E.drag = null;
    if (d.kind === 'room' || d.kind === 'resize') {
      var rid = d.id || (E.sel && E.sel.id), r = rid ? roomById(rid) : null;
      if (r && d.orig) { r.x = d.orig.x; r.y = d.orig.y; r.w = d.orig.w; r.h = d.orig.h; }
      E.undoStack.pop();
    } else if (d.kind === 'fixture') {
      var f = fixById(d.id);
      if (f && d.orig) { f.x = d.orig.x; f.y = d.orig.y; }
      E.undoStack.pop();
    } else if (d.kind === 'liji') {
      if (d.orig) E.plan.liji = { x: d.orig.x, y: d.orig.y };
      E.undoStack.pop();
    } else if (d.kind === 'create') {
      E.tempRect = null;
    }
    render();
  }
  function beginPinch() {
    cancelActiveDrag();
    var ps = Object.keys(E.ptrs).map(function (k) { return E.ptrs[k]; });
    var mid = { x: (ps[0].x + ps[1].x) / 2, y: (ps[0].y + ps[1].y) / 2 };
    var d0 = Math.sqrt(Math.pow(ps[0].x - ps[1].x, 2) + Math.pow(ps[0].y - ps[1].y, 2)) || 1;
    if (!E.view) E.view = fitView();
    E.pinch = { d0: d0, w0: E.view.w, anchor: clientToPlan(mid.x, mid.y, E.view) };
  }
  function ptDown(evt) {
    if (!E.ptrs) E.ptrs = {};
    E.ptrs[evt.pointerId] = { x: evt.clientX, y: evt.clientY };
    var n = Object.keys(E.ptrs).length;
    if (!E.stage && n === 2) { beginPinch(); return; }
    if (n > 1) return; /* 其余指（含描图舞台第二指）忽略 */
    E.dragPtr = evt.pointerId;
    onDown(evt);
  }
  function ptMove(evt) {
    if (E.ptrs && E.ptrs[evt.pointerId]) { E.ptrs[evt.pointerId].x = evt.clientX; E.ptrs[evt.pointerId].y = evt.clientY; }
    if (E.pinch) {
      var ps = Object.keys(E.ptrs).map(function (k) { return E.ptrs[k]; });
      if (ps.length >= 2 && E.view) {
        var svg = $('hpe-svg'), rc = svg.getBoundingClientRect();
        if (rc.width > 0) {
          var d = Math.sqrt(Math.pow(ps[0].x - ps[1].x, 2) + Math.pow(ps[0].y - ps[1].y, 2)) || 1;
          var mid = { x: (ps[0].x + ps[1].x) / 2, y: (ps[0].y + ps[1].y) / 2 };
          var v = E.view;
          v.w = E.pinch.w0 * E.pinch.d0 / d;
          v.h = v.w / stageAspect();
          v.x = E.pinch.anchor.x - (mid.x - rc.left) / rc.width * v.w;
          v.y = E.pinch.anchor.y - (mid.y - rc.top) / rc.height * v.h;
          clampView(); render();
        }
      }
      return;
    }
    if (E.ptrs && Object.keys(E.ptrs).length > 1) return; /* 手势收尾残指不喂单指逻辑 */
    onMove(evt);
  }
  function ptUp(evt) {
    if (E.ptrs) delete E.ptrs[evt.pointerId];
    if (E.pinch) {
      if (!E.ptrs || Object.keys(E.ptrs).length < 2) E.pinch = null;
      return;
    }
    var own = (E.dragPtr == null || evt.pointerId === E.dragPtr);
    if (E.ptrs && !Object.keys(E.ptrs).length) E.dragPtr = null;
    if (!own) return; /* 非拖动主指抬起不结束主指的拖动 */
    onUp(evt);
  }

  /* ---------------- 描图：四角舞台与 warp ---------------- */
  function loadPhotoImg(photo) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(photo.blob);
      var img = new Image();
      img.onload = function () { res({ img: img, url: url }); };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('img')); };
      img.src = url;
    });
  }
  function startStage(photoId, keepCorners) {
    db.photos.get(photoId).then(function (p) {
      if (!p) return;
      return loadPhotoImg(p).then(function (r) {
        var corners = null;
        if (keepCorners && E.plan.trace && E.plan.trace.photoId === photoId && E.plan.trace.corners) {
          corners = clone(E.plan.trace.corners);
        }
        E.stage = {
          photoId: photoId, url: r.url, img: r.img,
          natW: r.img.naturalWidth, natH: r.img.naturalHeight,
          corners: corners || [{ x: 0.06, y: 0.06 }, { x: 0.94, y: 0.06 }, { x: 0.94, y: 0.94 }, { x: 0.06, y: 0.94 }]
        };
        render(); renderTracePanel();
      });
    }).catch(function () { toastMsg(T('hpe_photo_fail')); });
  }
  function cancelStage() {
    if (E.stage && E.stage.url) URL.revokeObjectURL(E.stage.url);
    E.stage = null;
    render(); renderTracePanel();
  }
  function warpImage(img, corners, outW, outH) {
    var cv = document.createElement('canvas');
    cv.width = outW; cv.height = outH;
    var ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, outW, outH);
    var iw = img.naturalWidth, ih = img.naturalHeight;
    var src = corners.map(function (c) { return { x: c.x * iw, y: c.y * ih }; });
    function bilerp(u, v) {
      var top = { x: src[0].x + (src[1].x - src[0].x) * u, y: src[0].y + (src[1].y - src[0].y) * u };
      var bot = { x: src[3].x + (src[2].x - src[3].x) * u, y: src[3].y + (src[2].y - src[3].y) * u };
      return { x: top.x + (bot.x - top.x) * v, y: top.y + (bot.y - top.y) * v };
    }
    /* 三角仿射：对每个目标三角以三点对应解仿射矩阵，裁剪绘制（标准网格 warp 法） */
    function drawTri(sp, sq) {
      var x0 = sp[0], y0 = sp[1], x1 = sp[2], y1 = sp[3], x2 = sp[4], y2 = sp[5];
      var u0 = sq[0], v0 = sq[1], u1 = sq[2], v1 = sq[3], u2 = sq[4], v2 = sq[5];
      var A = [
        [u0, v0, 1, 0, 0, 0], [0, 0, 0, u0, v0, 1],
        [u1, v1, 1, 0, 0, 0], [0, 0, 0, u1, v1, 1],
        [u2, v2, 1, 0, 0, 0], [0, 0, 0, u2, v2, 1]
      ];
      var Bv = [x0, y0, x1, y1, x2, y2];
      for (var i = 0; i < 6; i++) {
        var piv = A[i][i];
        if (!piv) return;
        for (var j = i; j < 6; j++) A[i][j] /= piv;
        Bv[i] /= piv;
        for (var k = 0; k < 6; k++) {
          if (k === i) continue;
          var fct = A[k][i];
          if (!fct) continue;
          for (var j2 = i; j2 < 6; j2++) A[k][j2] -= fct * A[i][j2];
          Bv[k] -= fct * Bv[i];
        }
      }
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(u0, v0); ctx.lineTo(u1, v1); ctx.lineTo(u2, v2);
      ctx.closePath(); ctx.clip();
      ctx.setTransform(Bv[0], Bv[3], Bv[1], Bv[4], Bv[2], Bv[5]);
      ctx.drawImage(img, 0, 0);
      ctx.restore();
    }
    var N = 20;
    for (var gy = 0; gy < N; gy++) {
      for (var gx = 0; gx < N; gx++) {
        var u0 = gx / N, v0 = gy / N, u1 = (gx + 1) / N, v1 = (gy + 1) / N;
        var s00 = bilerp(u0, v0), s10 = bilerp(u1, v0), s11 = bilerp(u1, v1), s01 = bilerp(u0, v1);
        var d00 = [u0 * outW, v0 * outH], d10 = [u1 * outW, v0 * outH], d11 = [u1 * outW, v1 * outH], d01 = [u0 * outW, v1 * outH];
        drawTri([s00.x, s00.y, s10.x, s10.y, s11.x, s11.y], [d00[0], d00[1], d10[0], d10[1], d11[0], d11[1]]);
        drawTri([s00.x, s00.y, s11.x, s11.y, s01.x, s01.y], [d00[0], d00[1], d11[0], d11[1], d01[0], d01[1]]);
      }
    }
    return cv.toDataURL('image/jpeg', 0.85);
  }
  function doWarp() {
    var st = E.stage; if (!st) return;
    var cs = st.corners;
    function elen(a, b) { return Math.sqrt(Math.pow((a.x - b.x) * st.natW, 2) + Math.pow((a.y - b.y) * st.natH, 2)); }
    var topLen = (elen(cs[0], cs[1]) + elen(cs[3], cs[2])) / 2;
    var sideLen = (elen(cs[0], cs[3]) + elen(cs[1], cs[2])) / 2;
    var outW = 1100, outH = Math.max(300, Math.min(1600, Math.round(outW * sideLen / topLen)));
    var url = warpImage(st.img, cs, outW, outH);
    pushUndo();
    var rect = (E.plan.trace && E.plan.trace.rect) ? E.plan.trace.rect
      : { x: 0, y: 0, w: 10, h: Math.round(10 * outH / outW * 10) / 10 };
    E.plan.trace = {
      photoId: st.photoId, corners: clone(cs), rect: rect,
      opacity: E.plan.trace && E.plan.trace.opacity != null ? E.plan.trace.opacity : 0.62
    };
    E.traceURL = url;
    if (E.stage.url) URL.revokeObjectURL(E.stage.url);
    E.stage = null; E.view = null;
    E.plan.layers.traceBg = true;
    afterChange();
    renderTracePanel();
    toastMsg(T('hpe_warped'));
  }
  function regenTraceURL() {
    E.traceURL = '';
    var tr = E.plan && E.plan.trace;
    if (!tr || !tr.photoId || !tr.corners) return Promise.resolve();
    return db.photos.get(tr.photoId).then(function (p) {
      if (!p) return;
      return loadPhotoImg(p).then(function (r) {
        var outW = 1100;
        var iw = r.img.naturalWidth, ih = r.img.naturalHeight;
        function elen(a, b) { return Math.sqrt(Math.pow((a.x - b.x) * iw, 2) + Math.pow((a.y - b.y) * ih, 2)); }
        var cs = tr.corners;
        var topLen = (elen(cs[0], cs[1]) + elen(cs[3], cs[2])) / 2;
        var sideLen = (elen(cs[0], cs[3]) + elen(cs[1], cs[2])) / 2;
        var outH = Math.max(300, Math.min(1600, Math.round(outW * sideLen / topLen)));
        E.traceURL = warpImage(r.img, cs, outW, outH);
        URL.revokeObjectURL(r.url);
      });
    }).catch(function () {});
  }

  /* ---------------- 照片上传（编辑器内） ---------------- */
  function compressPhoto(file) {
    var url = URL.createObjectURL(file);
    return new Promise(function (res, rej) {
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight;
        var scale = Math.min(1, 1600 / Math.max(w, h));
        var cv = document.createElement('canvas');
        cv.width = Math.round(w * scale); cv.height = Math.round(h * scale);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url);
        cv.toBlob(function (b) { b ? res(b) : rej(new Error('toBlob')); }, 'image/jpeg', 0.82);
      };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('img')); };
      img.src = url;
    });
  }
  function onFilePick(input) {
    /* 先快照再清空：input.value='' 会连带清空活 FileList 引用（house.js 先用后清） */
    var files = Array.prototype.slice.call(input.files || []);
    input.value = '';
    if (!files.length) return;
    compressPhoto(files[0]).then(function (blob) {
      return db.photos.add({
        houseId: E.houseId, floorId: E.floorId,
        cat: 'qita', guideKey: null, blob: blob, ts: Date.now()
      });
    }).then(function (pid) { startStage(pid); }).catch(function () { toastMsg(T('hpe_photo_fail')); });
  }

  /* ---------------- 开关页 ---------------- */
  function switchFloor(fid) {
    saveNow();
    E.floorId = fid;
    E.sel = null; E.placeType = null; E.arm = null; E.undoStack = []; E.redoStack = [];
    E.calibArm = false; E.calibPts = []; E.chartCache = null; E.stage = null; E.view = null; E.ptrs = null; E.pinch = null;
    E.cut = null; E.startPhase = 'pick';
    loadPlan(fid, E.houseId).then(function (p) {
      E.plan = p;
      return regenTraceURL();
    }).then(function () {
      renderFloorsBar(); renderOrient(); render(); renderTray();
      /* 空层先出起始选择面（新建楼层路径）：分切式（推荐）／模板／描图 */
      var empty = !E.plan.rooms.length && !(E.plan.trace && E.plan.trace.rect);
      if (empty) showSheet('start');
      else { if (E.sheet === 'tpl' || E.sheet === 'start') closeSheet(); renderPanel(); }
    });
  }
  function open(houseId, floorId) {
    Promise.all([
      db.houses.get(houseId),
      db.floors.where('houseId').equals(houseId).toArray(),
      db.measurements.where('houseId').equals(houseId).toArray()
    ]).then(function (r) {
      E.house = r[0]; if (!E.house) return;
      E.houseId = houseId;
      E.floors = r[1].slice().sort(function (a, b) { return (a.sort || 0) - (b.sort || 0) || a.id - b.id; });
      E.fixed = r[2].filter(function (m) { return m.fixed; })[0] || null;
      E.mode = 'draw';
      E.sheet = null; syncSheet();
      var dv = $('view-house'); if (dv) dv.hidden = true;
      var lv = $('view-houses'); if (lv) lv.hidden = true;
      var v = $('view-plan'); if (v) v.hidden = false;
      window.scrollTo(0, 0);
      switchFloor(floorId || (E.floors[0] && E.floors[0].id));
    }).catch(function () {});
  }
  function close() {
    saveNow();
    if (E.stage) cancelStage();
    E.sheet = null; syncSheet();
    var v = $('view-plan'); if (v) v.hidden = true;
    if (window.__wuriHouse && __wuriHouse.openDetail) __wuriHouse.openDetail(E.houseId);
  }

  /* ---------------- 接线 ---------------- */
  function init() {
    var svg = $('hpe-svg');
    if (svg) {
      svg.addEventListener('pointerdown', ptDown);
      svg.addEventListener('pointermove', ptMove);
      svg.addEventListener('pointerup', ptUp);
      svg.addEventListener('pointercancel', ptUp);
      svg.addEventListener('wheel', function (e) {
        if (E.stage || !E.plan) return;
        e.preventDefault();
        if (!E.view) E.view = fitView();
        zoomViewAt(E.view.w * (e.deltaY > 0 ? 1.13 : 1 / 1.13), e.clientX, e.clientY);
      }, { passive: false });
      svg.addEventListener('dblclick', function (evt) {
        var el = evt.target && evt.target.closest ? evt.target.closest('[data-act="room"]') : null;
        if (!el || !E.plan) return;
        var r = roomById(el.getAttribute('data-id')); if (!r) return;
        E.sel = { kind: 'room', id: r.id }; E.attrFull = true;
        render(); renderAttr(); revealRect(r);
      });
    }
    var fb = $('hpe-fitbtn');
    if (fb) fb.addEventListener('click', function () {
      if (E.stage || !E.plan) return;
      E.view = fitView(); render();
    });
    var bk = $('hpe-back'); if (bk) bk.addEventListener('click', close);
    var un = $('hpe-undo'); if (un) un.addEventListener('click', undo);
    var re = $('hpe-redo'); if (re) re.addEventListener('click', redo);
    var fn = $('hpe-floorname');
    if (fn) fn.addEventListener('click', function () {
      if (E.sheet === 'floors') closeSheet(); else showSheet('floors');
    });
    var ib = $('hpe-infobtn');
    if (ib) ib.addEventListener('click', function () {
      if (E.sheet === 'info') closeSheet(); else showSheet('info');
    });
    var lb = $('hpe-layerbtn');
    if (lb) lb.addEventListener('click', function () {
      if (E.stage) cancelStage();
      if (E.sheet === 'layers') { closeSheet(); return; }
      E.placeType = null; E.arm = null; syncTray();
      showSheet('layers');
      render();
    });
    var tsc = $('hpe-tray-scroll');
    if (tsc) {
      tsc.addEventListener('pointerdown', trayDown);
      tsc.addEventListener('pointermove', trayMove);
      tsc.addEventListener('pointerup', trayUp);
      tsc.addEventListener('pointercancel', trayUp);
    }
    var ab = $('hpe-armed'); if (ab) ab.addEventListener('click', function () { E.arm = null; E.placeType = null; syncTray(); });
    renderTray();
    var sx = $('hpe-sheet-x'); if (sx) sx.addEventListener('click', closeSheet);
    var sc = $('hpe-scrim'); if (sc) sc.addEventListener('click', closeSheet);
    var fl = $('hpe-file'); if (fl) fl.addEventListener('change', function () { onFilePick(fl); });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) saveNow();
    });
    if (window.__wuri_rerender) {
      var prev = window.__wuri_rerender;
      window.__wuri_rerender = function () {
        prev();
        var v = $('view-plan');
        if (v && !v.hidden && E.plan) { renderOrient(); renderPanel(); render(); renderTray(); }
      };
    }
  }
  init();

  window.__wuriPlan = { open: open, close: close };
})();
