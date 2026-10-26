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
  var FIX = {
    door:     { cat: 'doorwin', w: 0.9, h: 0.9, box: [30, 30], wall: 1, art: '<path d="M3 27 V3 A24 24 0 0 1 27 27" fill="none" stroke-dasharray="2.5 2.5"/><path d="M3 27 V4" stroke-width="2.6" fill="none"/>' },
    sdoor:    { cat: 'doorwin', w: 1.5, h: 0.3, box: [30, 6], wall: 1, art: '<path d="M1 1.5 H29 M1 4.5 H29 M8 0 V6 M22 0 V6" fill="none"/>' },
    window:   { cat: 'doorwin', w: 1.5, h: 0.3, box: [30, 7], wall: 1, art: '<path d="M1 1 H29 M1 3.5 H29 M1 6 H29 M15 1 V6" fill="none"/>' },
    stairs:   { cat: 'stairs', w: 1.0, h: 2.8, box: [30, 84], art: '<path d="M3 6 H27 M3 18 H27 M3 30 H27 M3 42 H27 M3 54 H27 M3 66 H27 M3 78 H27" fill="none"/><path d="M15 80 V10 M11.5 16 L15 8 L18.5 16" fill="none"/>' },
    bed:      { cat: 'furn', w: 1.5, h: 2.0, box: [30, 40], art: '<rect x="2" y="2" width="26" height="36" fill="none"/><path d="M2 11 H28 M15 2 V11" fill="none"/>' },
    sofa:     { cat: 'furn', w: 1.8, h: 0.9, box: [36, 18], art: '<rect x="3" y="3" width="30" height="12" rx="4" fill="none"/><path d="M3 9 H0 M33 9 H36 M9 15 v3 M27 15 v3" fill="none"/>' },
    desk:     { cat: 'furn', w: 1.2, h: 0.6, box: [30, 15], art: '<rect x="2" y="2" width="26" height="11" fill="none"/><path d="M2 9 H28" fill="none"/>' },
    wardrobe: { cat: 'furn', w: 1.2, h: 0.6, box: [30, 15], art: '<rect x="2" y="2" width="26" height="11" fill="none"/><path d="M15 2 V13" fill="none"/>' },
    stove:    { cat: 'kitchen', w: 0.62, h: 0.62, box: [30, 30], art: '<rect x="2" y="2" width="26" height="26" fill="none"/><circle cx="10" cy="10" r="3.6" fill="none"/><circle cx="21" cy="10" r="2.5" fill="none"/><circle cx="10" cy="21" r="2.5" fill="none"/><circle cx="21" cy="21" r="3.6" fill="none"/>' },
    toilet:   { cat: 'kitchen', w: 0.46, h: 0.72, box: [20, 30], art: '<rect x="3" y="1" width="14" height="6" fill="none"/><ellipse cx="10" cy="19" rx="7" ry="9" fill="none"/>' },
    tub:      { cat: 'kitchen', w: 1.7, h: 0.78, box: [34, 16], art: '<rect x="2" y="2" width="30" height="12" rx="6" fill="none"/><circle cx="8" cy="8" r="2.4" fill="none"/>' },
    fridge:   { cat: 'kitchen', w: 0.7, h: 0.7, box: [30, 30], art: '<rect x="4" y="2" width="22" height="26" fill="none"/><path d="M4 11 H26" fill="none"/>' },
    shrine:   { cat: 'feng', w: 0.6, h: 0.34, box: [30, 17], art: '<path d="M3 15 V7 L15 2 L27 7 V15 Z" fill="none"/><circle cx="15" cy="10.5" r="2.4" fill="none"/>' },
    tank:     { cat: 'feng', w: 1.2, h: 0.5, box: [30, 12], art: '<rect x="2" y="2" width="26" height="9" fill="none"/><path d="M6 8 q3 -3 6 0 q3 3 6 0 q3 -3 6 0" fill="none"/>' }
  };
  var FIX_CATS = ['doorwin', 'stairs', 'furn', 'kitchen', 'feng'];
  var ROOM_TYPES = ['living', 'master', 'bedroom', 'kitchen', 'dining', 'bath', 'study', 'balcony', 'entry', 'hall', 'storage', 'other'];
  var DIR8_ANG = { '北': 0, '东北': 45, '东': 90, '东南': 135, '南': 180, '西南': 225, '西': 270, '西北': 315 };

  /* ---------------- 状态 ---------------- */
  var E = {
    houseId: 0, floorId: 0, house: null, floors: [], fixed: null,
    plan: null, mode: 'draw', sel: null, placeType: null, fixCat: 'doorwin',
    snap: true, grid: true, undoStack: [], redoStack: [],
    stage: null, traceURL: '', photoURL: '',
    calibArm: false, calibPts: [], focusSnap: null,
    drag: null, saveTm: null, chartCache: null
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
      layers: { rooms: true, fixtures: true, dims: true, overlay: 'fx', palNames: true, roomNames: true, traceBg: true, ovOpacity: 0.92 }
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
    E.sel = null; E.chartCache = null;
    afterChange(true);
  }
  function redo() {
    if (!E.redoStack.length) return;
    E.undoStack.push(clone(E.plan));
    E.plan = E.redoStack.pop();
    E.sel = null; E.chartCache = null;
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
    /* 拖动中冻结 viewBox：extent 随拖动变化会改 CTM、坐标反馈放大（实测移房多走数倍） */
    var vb;
    if (E.drag && E.vb) vb = E.vb;
    else {
      var b = extent();
      var pad = Math.max(b.x1 - b.x0, b.y1 - b.y0) * 0.07 + 0.3;
      vb = { x: b.x0 - pad, y: b.y0 - pad, w: (b.x1 - b.x0) + pad * 2, h: (b.y1 - b.y0) + pad * 2 };
      E.vb = vb;
    }
    var vx = vb.x, vy = vb.y, vw = vb.w, vh = vb.h;
    svg.setAttribute('viewBox', vx + ' ' + vy + ' ' + vw + ' ' + vh);
    var u = vw / 100; /* 约 1% 宽，供字号/线宽参照 */
    var s = '';
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
    /* 房间块 */
    if (L.rooms) {
      p.rooms.forEach(function (r) {
        var sel = E.sel && E.sel.kind === 'room' && E.sel.id === r.id;
        var fsN = Math.max(u * 2.6, Math.min(r.w, r.h) * 0.16);
        s += '<g data-act="room" data-id="' + r.id + '">' +
          '<rect class="hpe-roomrect' + (sel ? ' sel' : '') + (E.mode === 'trace' ? ' trace' : '') + '" x="' + r.x + '" y="' + r.y +
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
          '<g stroke="currentColor" stroke-width="' + (30 / Math.max(d.box[0], d.box[1]) * 1.1) + '" fill="none" stroke-linecap="round">' + d.art + '</g></g></g>';
      });
    }
    /* 选中房间：手柄＋尺寸胶囊 */
    if (E.sel && E.sel.kind === 'room') {
      var r = roomById(E.sel.id);
      if (r) s += renderRoomSel(r, u);
    }
    /* 立极 */
    s += renderLiji(u);
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
    }
    return s + '</g>';
  }
  function renderLiji(u) {
    var l = lijiPoint();
    var drag = E.mode === 'layers';
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

  /* ---------------- 页头 / 方向行 ---------------- */
  function renderFloorsBar() {
    var box = $('hpe-floors'); if (!box) return;
    box.innerHTML = E.floors.map(function (f) {
      return '<span class="hd-ftab' + (f.id === E.floorId ? ' on' : '') + '" data-hpefl="' + f.id + '">' + esc(f.name) + '</span>';
    }).join('');
    Array.prototype.forEach.call(box.querySelectorAll('[data-hpefl]'), function (el) {
      el.addEventListener('click', function () {
        var fid = +el.getAttribute('data-hpefl');
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
    var seg = $('hpe-seg');
    if (seg) Array.prototype.forEach.call(seg.children, function (el) {
      el.classList.toggle('on', el.getAttribute('data-mode') === E.mode);
    });
    var hint = $('hpe-hint');
    if (E.mode === 'draw') {
      box.innerHTML = '<div class="hpe-sub">' +
        chip('hpe-snap', T('hpe_snap'), E.snap) +
        chip('hpe-gridsw', T('hpe_grid'), E.grid) +
        chip('hpe-undo', T('hpe_undo'), false, !E.undoStack.length) +
        chip('hpe-redo', T('hpe_redo'), false, !E.redoStack.length) +
        chip('hpe-addroom', T('hpe_add_room'), false) +
        '<span class="hpe-saved" id="hpe-saved"></span></div><div id="hpe-attr"></div>';
      if (hint) hint.innerHTML = T('hpe_hint_draw');
      bindDrawPanel();
    } else if (E.mode === 'parts') {
      var tiles = Object.keys(FIX).filter(function (k) { return FIX[k].cat === E.fixCat; }).map(function (k) {
        return '<div class="hpe-tile' + (E.placeType === k ? ' hot' : '') + '" data-fix="' + k + '">' +
          '<svg width="27" height="27" viewBox="0 0 ' + FIX[k].box[0] + ' ' + FIX[k].box[1] + '" preserveAspectRatio="xMidYMid meet">' +
          '<g stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round">' + FIX[k].art + '</g></svg>' +
          '<div class="n">' + esc(T('hpe_fix_' + k)) + '</div></div>';
      }).join('');
      box.innerHTML = '<div class="hpe-drawer"><div class="dt"><b>' + esc(T('hpe_lib')) + '</b><span>' + esc(T('hpe_lib_hint')) + '</span></div>' +
        '<div class="hpe-cats">' + FIX_CATS.map(function (c) {
          return '<span class="hpe-chip' + (E.fixCat === c ? ' on' : '') + '" data-fixcat="' + c + '">' + esc(T('hpe_cat_' + c)) + '</span>';
        }).join('') + '</div>' +
        '<div class="hpe-tiles">' + tiles + '</div></div><div id="hpe-attr"></div>';
      if (hint) hint.innerHTML = T('hpe_hint_parts');
      Array.prototype.forEach.call(box.querySelectorAll('[data-fixcat]'), function (el) {
        el.addEventListener('click', function () { E.fixCat = el.getAttribute('data-fixcat'); renderPanel(); });
      });
      Array.prototype.forEach.call(box.querySelectorAll('[data-fix]'), function (el) {
        el.addEventListener('click', function () {
          E.placeType = E.placeType === el.getAttribute('data-fix') ? null : el.getAttribute('data-fix');
          renderPanel();
        });
      });
    } else if (E.mode === 'trace') {
      box.innerHTML = '<div id="hpe-tracebox"></div><div id="hpe-attr"></div>';
      if (hint) hint.innerHTML = T('hpe_hint_trace');
      renderTracePanel();
    } else {
      box.innerHTML = '<div id="hpe-layerbox"></div>';
      if (hint) hint.innerHTML = T('hpe_hint_layers');
      renderLayersPanel();
    }
    renderAttr();
  }
  function bindDrawPanel() {
    var sn = $('hpe-snap'); if (sn) sn.addEventListener('click', function () { E.snap = !E.snap; renderPanel(); render(); });
    var gr = $('hpe-gridsw'); if (gr) gr.addEventListener('click', function () { E.grid = !E.grid; renderPanel(); render(); });
    var un = $('hpe-undo'); if (un) un.addEventListener('click', undo);
    var re = $('hpe-redo'); if (re) re.addEventListener('click', redo);
    var ad = $('hpe-addroom'); if (ad) ad.addEventListener('click', addRoom);
  }
  function addRoom() {
    pushUndo();
    var b = extent();
    var w = toU(3.6), h = toU(3.0);
    var n = E.plan.rooms.length + 1;
    var r = {
      id: uid(), x: (b.x0 + b.x1) / 2 - w / 2 + n * 0.3, y: (b.y0 + b.y1) / 2 - h / 2 + n * 0.3,
      w: w, h: h, name: TF(T('hpe_room_n'), n), type: 'other'
    };
    E.plan.rooms.push(r);
    E.sel = { kind: 'room', id: r.id };
    afterChange();
  }

  /* 属性条（房间/构件共用 #hpe-attr） */
  function renderAttr() {
    var box = $('hpe-attr'); if (!box) return;
    if (E.mode === 'layers') { box.innerHTML = ''; return; }
    if (E.sel && E.sel.kind === 'room') {
      var r = roomById(E.sel.id); if (!r) { box.innerHTML = ''; return; }
      var Lm = toM(r.w), Wm = toM(r.h);
      box.innerHTML = '<div class="hpe-attr"><div class="t"><b>' + esc(r.name || '') + '</b>' +
        '<span>' + esc(T('hpe_len')) + ' <b>' + trimNum(Lm, 2) + ' m</b></span>' +
        '<span>' + esc(T('hpe_wid')) + ' <b>' + trimNum(Wm, 2) + ' m</b></span>' +
        '<span>' + esc(T('hpe_area')) + ' <b>' + trimNum(Lm * Wm) + '㎡</b></span>' +
        '<span>' + esc(T('hpe_peri')) + ' ' + trimNum(2 * (Lm + Wm)) + ' m</span></div>' +
        '<div class="hpe-attr-form">' +
        '<label>' + esc(T('hpe_name')) + '<input class="hpe-inp" id="hpe-a-name" value="' + esc(r.name || '') + '"></label>' +
        '<label>' + esc(T('hpe_type')) + '<select class="hpe-inp" id="hpe-a-type">' +
        ROOM_TYPES.map(function (tp) { return '<option value="' + tp + '"' + (r.type === tp ? ' selected' : '') + '>' + esc(T('hpe_rt_' + tp)) + '</option>'; }).join('') +
        '</select></label>' +
        '<label>' + esc(T('hpe_len')) + '<input class="hpe-inp sm" id="hpe-a-len" type="number" step="0.1" min="0.3" value="' + trimNum(Lm, 2) + '"></label>' +
        '<label>' + esc(T('hpe_wid')) + '<input class="hpe-inp sm" id="hpe-a-wid" type="number" step="0.1" min="0.3" value="' + trimNum(Wm, 2) + '"></label>' +
        '</div>' +
        '<div class="ops"><span class="hpe-op" id="hpe-a-copy">' + esc(T('hpe_copy')) + '</span>' +
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
    } else if (E.sel && E.sel.kind === 'fixture') {
      var f = fixById(E.sel.id); if (!f) { box.innerHTML = ''; return; }
      var d = FIX[f.type];
      box.innerHTML = '<div class="hpe-attr"><div class="t"><b>' + esc(T('hpe_fix_' + f.type)) + '</b>' +
        '<span>' + trimNum(d.w, 2) + ' × ' + trimNum(d.h, 2) + ' m</span>' +
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
    box.innerHTML = '<div class="hpe-panel"><h4>' + esc(T('hpe_layers')) + '</h4>' +
      swRow('rooms', T('hpe_lay_rooms')) +
      swRow('fixtures', T('hpe_lay_fixtures')) +
      swRow('dims', T('hpe_lay_dims')) +
      swRow('traceBg', T('hpe_lay_photo'), T('hpe_lay_photo_note')) +
      '<div class="hpe-lrow"><span>' + esc(T('hpe_lay_overlay')) + '</span>' +
      '<span class="hpe-ovseg">' +
      ['fx', 'bz', 'none'].map(function (k) {
        return '<span class="hpe-ovchip' + (L.overlay === k ? ' on' : '') + '" data-ov="' + k + '">' + esc(T('hpe_ov_' + k)) + '</span>';
      }).join('') + '</span></div>' +
      (L.overlay !== 'none' ? swRow('palNames', T('hpe_lay_palnames')) : '') +
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
        save(); render(); renderLayersPanel();
      });
    });
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
      return '<div class="hpe-mrow"><span>' + esc(r.name || '') + '</span><b>' + trimNum(toM(r.w) * toM(r.h)) + '㎡</b></div>';
    }).join('');
    var tot = E.plan.rooms.reduce(function (s, r) { return s + toM(r.w) * toM(r.h); }, 0);
    rows += '<div class="hpe-mrow total"><span>' + esc(T('hpe_floor_total')) + '</span><b>' + trimNum(tot) + '㎡</b></div>';
    box.innerHTML = rows + '<div class="hpe-mrow total"><span>' + esc(T('hpe_house_total')) + '</span><b id="hpe-house-total">…</b></div>';
    db.plans.where('houseId').equals(E.houseId).toArray().then(function (ps) {
      var sum = 0;
      ps.forEach(function (p) {
        if (p.floorId === E.floorId) return;
        var mp = p.mPerUnit || 1;
        (p.rooms || []).forEach(function (r) { sum += r.w * mp * r.h * mp; });
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
    if (E.calibArm && E.mode === 'trace') {
      if (E.calibPts.length < 2) {
        E.calibPts.push({ x: pt.x, y: pt.y });
        render(); renderTracePanel();
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
    if (act === 'liji' && E.mode === 'layers') {
      pushUndo();
      E.drag = { kind: 'liji', start: pt, orig: clone(lijiPoint()) };
      svg.setPointerCapture(evt.pointerId);
      return;
    }
    /* 构件态放置优先于房间选择（点房间上也要能落件），点中已有构件仍为选中 */
    if (E.mode === 'parts' && E.placeType && act !== 'fixture') {
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
        if (E.mode === 'draw' || E.mode === 'parts' || E.mode === 'trace') {
          pushUndo();
          E.drag = { kind: 'fixture', id: f0.id, start: pt, orig: clone(f0), moved: false };
          svg.setPointerCapture(evt.pointerId);
        }
        render(); renderAttr();
      }
      return;
    }
    if (act === 'room') {
      var rr = roomById(actEl.getAttribute('data-id'));
      if (rr) {
        E.sel = { kind: 'room', id: rr.id };
        if (E.mode !== 'layers') {
          pushUndo();
          E.drag = { kind: 'room', id: rr.id, start: pt, orig: clone(rr), moved: false };
          svg.setPointerCapture(evt.pointerId);
        }
        render(); renderAttr();
      }
      return;
    }
    /* 空白处 */
    if (E.mode === 'parts' && E.placeType) {
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
    if (E.mode === 'draw') { E.sel = null; render(); renderAttr(); }
  }
  function onMove(evt) {
    var d = E.drag; if (!d) return;
    var pt = svgPoint(evt);
    if (d.kind === 'corner') {
      var st = E.stage, Hh = 1000 * st.natH / st.natW;
      st.corners[d.i] = {
        x: Math.max(0, Math.min(1, pt.x / 1000)),
        y: Math.max(0, Math.min(1, pt.y / Hh))
      };
      render();
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
    E.stage = null; E.vb = null;
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
    E.stage = null; E.vb = null;
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
    E.sel = null; E.placeType = null; E.undoStack = []; E.redoStack = [];
    E.calibArm = false; E.calibPts = []; E.chartCache = null; E.stage = null; E.vb = null;
    loadPlan(fid, E.houseId).then(function (p) {
      E.plan = p;
      return regenTraceURL();
    }).then(function () {
      renderFloorsBar(); renderOrient(); renderPanel(); render();
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
    var v = $('view-plan'); if (v) v.hidden = true;
    if (window.__wuriHouse && __wuriHouse.openDetail) __wuriHouse.openDetail(E.houseId);
  }

  /* ---------------- 接线 ---------------- */
  function init() {
    var svg = $('hpe-svg');
    if (svg) {
      svg.addEventListener('pointerdown', onDown);
      svg.addEventListener('pointermove', onMove);
      svg.addEventListener('pointerup', onUp);
      svg.addEventListener('pointercancel', onUp);
    }
    var seg = $('hpe-seg');
    if (seg) seg.addEventListener('click', function (e) {
      var el = e.target.closest ? e.target.closest('[data-mode]') : null;
      if (!el) return;
      if (E.stage) cancelStage();
      E.mode = el.getAttribute('data-mode');
      E.placeType = null;
      if (E.mode !== 'trace') { E.calibArm = false; E.calibPts = []; }
      renderPanel(); render();
    });
    var bk = $('hpe-back'); if (bk) bk.addEventListener('click', close);
    var dn = $('hpe-done'); if (dn) dn.addEventListener('click', close);
    var fl = $('hpe-file'); if (fl) fl.addEventListener('change', function () { onFilePick(fl); });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) saveNow();
    });
    if (window.__wuri_rerender) {
      var prev = window.__wuri_rerender;
      window.__wuri_rerender = function () {
        prev();
        var v = $('view-plan');
        if (v && !v.hidden && E.plan) { renderOrient(); renderPanel(); render(); }
      };
    }
  }
  init();

  window.__wuriPlan = { open: open, close: close };
})();
