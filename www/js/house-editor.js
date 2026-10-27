/* 户型图编辑器 · 家宅档案第二批 A（2026-10-26）
 *
 * 独立全屏画图页（#view-plan）：从档案详情某层进入，整页只画图；
 * 每步自动保存（每次编辑动作即写 Dexie plans 表，floorId 主键，一层一图）、
 * 撤销/重做栈、右上「完成」收口回详情（详情楼层预览读同一 plan 出缩略）。
 * 数据模型借 blueprint3d 的角/墙/房间半边思想按「房间块」降维实现：
 *   plan{floorId,houseId,updated,mPerUnit,rooms[{id,x,y,w,h,name,type}],
 *        fixtures[{id,type,x,y,rot,flip}],walls[{id,x1,y1,x2,y2}],
 *        trace{photoId,corners,rect,opacity},
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
  /* 确认弹层走 house.js 自家 hdDlg（原生 confirm 样式裸陋且带域名标题，全站已禁用） */
  function dlgConfirm(text, okLabel) {
    if (window.__wuriDlg && __wuriDlg.confirm) return __wuriDlg.confirm(text, okLabel);
    return Promise.resolve(false);
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
    tank:     { cat: 'feng', sw: 'shui', w: 1.2, h: 0.5, box: [30, 12], art: '<rect x="2" y="2" width="26" height="9" fill="none"/><path d="M6 8 q3 -3 6 0 q3 3 6 0 q3 -3 6 0" fill="none"/>' },
    /* 扩充件目（2026-10-27）：家具 6＋厨卫 3＋风水件 2；砂/水按金锁口径——
     * 柜/桌/电器（高、实）为砂，涉水件（洗手台/淋浴/洗衣机）为水；茶几低矮、口径两可，标 null */
    dtable:     { cat: 'furn', sw: 'sha', w: 1.4, h: 0.9, box: [36, 24], art: '<rect x="3" y="3" width="30" height="18" rx="3" fill="none"/><rect x="9" y="7.5" width="18" height="9" fill="none"/>' },
    ctable:     { cat: 'furn', sw: null, w: 0.9, h: 0.5, box: [30, 16], art: '<rect x="3" y="3" width="24" height="10" rx="3" fill="none"/><path d="M7 13 v2 M23 13 v2" fill="none"/>' },
    tvstand:    { cat: 'furn', sw: 'sha', w: 1.6, h: 0.45, box: [36, 12], art: '<rect x="2" y="2" width="32" height="8" fill="none"/><path d="M12 2 V10 M24 2 V10" fill="none"/>' },
    bookcase:   { cat: 'furn', sw: 'sha', w: 1.0, h: 0.35, box: [30, 12], art: '<rect x="2" y="2" width="26" height="8" fill="none"/><path d="M2 6 H28 M10 2 V10 M20 2 V10" fill="none"/>' },
    shoecab:    { cat: 'furn', sw: 'sha', w: 0.8, h: 0.35, box: [26, 12], art: '<rect x="2" y="2" width="22" height="8" fill="none"/><path d="M2 6 H24" fill="none"/>' },
    nightstand: { cat: 'furn', sw: 'sha', w: 0.5, h: 0.45, box: [16, 14], art: '<rect x="2" y="2" width="12" height="10" fill="none"/><path d="M2 7 H14 M7 4.6 h2" fill="none"/>' },
    basin:      { cat: 'kitchen', sw: 'shui', w: 0.9, h: 0.55, box: [30, 18], art: '<rect x="2" y="2" width="26" height="14" fill="none"/><ellipse cx="15" cy="9.5" rx="7" ry="4.4" fill="none"/><circle cx="15" cy="4" r="1.2" fill="none"/>' },
    shower:     { cat: 'kitchen', sw: 'shui', w: 0.9, h: 0.9, box: [26, 26], art: '<path d="M4 22 V6 A2 2 0 0 1 6 4 H22" fill="none"/><circle cx="9" cy="9" r="3" fill="none"/><path d="M14 14 l2 2 M17 14 l2 2 M14 17.5 l2 2" fill="none"/>' },
    washer:     { cat: 'kitchen', sw: 'shui', w: 0.62, h: 0.62, box: [24, 24], art: '<rect x="3" y="2" width="18" height="20" fill="none"/><circle cx="12" cy="13.5" r="5.4" fill="none"/><path d="M6 5.6 H18" fill="none"/>' },
    ac:         { cat: 'feng', sw: 'sha', w: 0.9, h: 0.3, box: [32, 10], wall: 1, art: '<rect x="2" y="2" width="28" height="6" rx="2.5" fill="none"/><path d="M5 5.4 H27" fill="none"/>' },
    tv:         { cat: 'feng', sw: 'sha', w: 1.25, h: 0.16, box: [34, 10], wall: 1, art: '<rect x="3" y="1" width="28" height="6" fill="none"/><path d="M17 7 v1.8 M12 9.2 H22" fill="none"/>' },
    /* 再扩充（2026-10-27 第二轮，用户「构件库再丰富一些」）：家具 7＋门窗 3＋厨卫 4＋风水 4＝18 件，总数 25→43。
     * 砂/水口径：高/实/柜体/电驱动为砂；门窗与涉水件为水；绿植（活物近砂、蒸腾属水汽）、
     * 大镜子（反射属金）两可标 null。洗碗机从任务口径标水（机内有水路）。 */
    dresser:    { cat: 'furn', sw: 'sha', w: 0.9, h: 0.45, box: [30, 15], art: '<rect x="2" y="2" width="26" height="11" fill="none"/><path d="M8 2 V6 A2.5 2.5 0 0 0 13 6 V2" fill="none"/><path d="M2 9.5 H28" fill="none"/>' },
    sideboard:  { cat: 'furn', sw: 'sha', w: 1.4, h: 0.45, box: [36, 12], art: '<rect x="2" y="2" width="32" height="8" fill="none"/><path d="M12 2 V10 M24 2 V10 M2 6 H34" fill="none"/>' },
    piano:      { cat: 'furn', sw: 'sha', w: 1.5, h: 1.45, box: [34, 33], art: '<path d="M4 2 H30 V18 Q30 26 21 27 L10 29 Q4 29.6 4 22 Z" fill="none"/><path d="M4 8 H30" fill="none"/>' },
    treadmill:  { cat: 'furn', sw: 'sha', w: 0.8, h: 1.9, box: [20, 44], art: '<rect x="5" y="12" width="10" height="28" rx="2" fill="none"/><path d="M5 12 L3 4 H17 L15 12 M3 4 V8 M17 4 V8" fill="none"/>' },
    ofdesk:     { cat: 'furn', sw: 'sha', w: 1.4, h: 0.7, box: [34, 17], art: '<rect x="2" y="2" width="30" height="13" fill="none"/><path d="M24 2 V15 M24 8 H32 M5 5.5 H11 V11 H5 Z" fill="none"/>' },
    kidbed:     { cat: 'furn', sw: 'sha', w: 1.0, h: 1.7, box: [24, 40], art: '<rect x="2" y="2" width="20" height="36" fill="none"/><path d="M2 10 H22" fill="none"/><circle cx="12" cy="6" r="2.4" fill="none"/>' },
    bunk:       { cat: 'furn', sw: 'sha', w: 1.0, h: 2.0, box: [24, 46], art: '<rect x="2" y="2" width="20" height="42" fill="none"/><path d="M2 10 H22 M14 2 V44 M17.5 14 v3 M17.5 21 v3 M17.5 28 v3" fill="none"/>' },
    ddoor:      { cat: 'doorwin', sw: 'shui', w: 1.6, h: 0.9, box: [32, 18], art: '<path d="M3 15 V3 A12 12 0 0 1 15 15 M29 15 V3 A12 12 0 0 0 17 15" fill="none" stroke-dasharray="2.5 2.5"/><path d="M3 15 V4 M29 15 V4" stroke-width="2.4" fill="none"/>' },
    baldoor:    { cat: 'doorwin', sw: 'shui', w: 1.8, h: 0.3, box: [36, 6], wall: 1, art: '<path d="M1 1.5 H35 M1 4.5 H35 M12 0 V6 M24 0 V6" fill="none"/>' },
    baywin:     { cat: 'doorwin', sw: 'shui', w: 1.8, h: 0.6, box: [36, 13], wall: 1, art: '<path d="M6 12 L2 3 H34 L30 12 Z M12 3 L14.5 12 M24 3 L21.5 12" fill="none"/>' },
    sink:       { cat: 'kitchen', sw: 'shui', w: 0.9, h: 0.55, box: [30, 18], art: '<rect x="2" y="2" width="26" height="14" fill="none"/><rect x="7" y="5.5" width="16" height="8" fill="none"/><circle cx="15" cy="9.5" r="1.6" fill="none"/>' },
    dishwash:   { cat: 'kitchen', sw: 'shui', w: 0.6, h: 0.6, box: [24, 24], art: '<rect x="3" y="2" width="18" height="20" fill="none"/><path d="M3 7 H21 M6.5 4.8 h3" fill="none"/><path d="M7 18 q2.5 -3 5 0 q2.5 3 5 0" fill="none"/>' },
    fridge2:    { cat: 'kitchen', sw: 'sha', w: 0.9, h: 0.7, box: [32, 24], art: '<rect x="4" y="2" width="24" height="20" fill="none"/><path d="M16 2 V22 M4 8 H28 M13.5 12 v4 M18.5 12 v4" fill="none"/>' },
    bathcab:    { cat: 'kitchen', sw: 'sha', w: 0.8, h: 0.45, box: [28, 15], art: '<rect x="2" y="2" width="24" height="11" fill="none"/><ellipse cx="14" cy="6" rx="6" ry="2.8" fill="none"/><path d="M2 10.5 H26" fill="none"/>' },
    safe:       { cat: 'feng', sw: 'sha', w: 0.5, h: 0.45, box: [18, 16], art: '<rect x="2" y="2" width="14" height="12" fill="none"/><circle cx="9" cy="8" r="3.4" fill="none"/><path d="M9 8 L9 5.6 M9 8 L11 9" fill="none"/>' },
    cooler:     { cat: 'feng', sw: 'shui', w: 0.35, h: 0.35, box: [14, 14], art: '<path d="M4 2 H10 V6 H4 Z M3 6 H11 L10.4 12 H3.6 Z" fill="none"/><path d="M5.4 8.8 q1.6 -1.8 3.2 0" fill="none"/>' },
    plant:      { cat: 'feng', sw: null, w: 0.45, h: 0.45, box: [18, 18], art: '<path d="M5 11 H13 L12 17 H6 Z" fill="none"/><path d="M9 11 V6 M9 8 Q5 7 4.6 3.6 Q8 3.8 9 6.4 M9 7.4 Q10.4 4.6 13.6 4.4 Q13.2 8 9.8 8.2" fill="none"/>' },
    mirror:     { cat: 'feng', sw: null, w: 1.0, h: 0.1, box: [32, 6], wall: 1, art: '<rect x="2" y="1.5" width="28" height="3" fill="none"/><path d="M9 3 L13 3 M18 3 L23 3" fill="none"/>' },
    /* 墙件（2026-10-27「画墙」批）：构件库第一分类。wallSeg 件不落 fixtures——
     * 放置即转 plan.walls 墙段，与手划墙同账（闭合检测/报告/缩略共用一套渲染）；
     * 墙本体不判砂水，sw 恒 null、不挂砂/水签。 */
    wall1:      { cat: 'wall', sw: null, w: 2.0, h: 0.12, box: [40, 6], wallSeg: 1, art: '<path d="M2 3 H38" stroke-width="2.8" fill="none"/>' },
    wallL:      { cat: 'wall', sw: null, w: 1.6, h: 1.6, box: [32, 32], wallSeg: 1, art: '<path d="M4 28 V4 H28" fill="none"/>' },
    wallT:      { cat: 'wall', sw: null, w: 2.0, h: 1.2, box: [40, 24], wallSeg: 1, art: '<path d="M2 4 H38 M20 4 V20" fill="none"/>' }
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
  var FIX_CATS = ['wall', 'doorwin', 'stairs', 'furn', 'kitchen', 'feng'];
  var ROOM_TYPES = ['living', 'master', 'bedroom', 'kitchen', 'dining', 'bath', 'study', 'balcony', 'entry', 'hall', 'storage', 'other'];
  var DIR8_ANG = { '北': 0, '东北': 45, '东': 90, '东南': 135, '南': 180, '西南': 225, '西': 270, '西北': 315 };

  /* ---------------- 状态 ---------------- */
  var E = {
    houseId: 0, floorId: 0, house: null, floors: [], fixed: null,
    plan: null, mode: 'draw', sheet: null, sel: null, placeType: null, fixCat: 'doorwin', uiMode: 'free',
    snap: true, grid: true, undoStack: [], redoStack: [],
    stage: null, traceURL: '', photoURL: '', ai: null, stageFallback: false,
    calibArm: false, calibPts: [], focusSnap: null,
    drag: null, saveTm: null, chartCache: null,
    view: null, ptrs: null, pinch: null, spinch: null, justWarped: false,
    attrFull: false, lastTap: null, _attrKey: '',
    cut: null, startPhase: 'pick', wallPrev: null,
    /* planDirty：E.plan 自载入后是否被改过——未改动的内存稿禁止 saveNow 回写，
     * 防详情页已删的行被编辑器旧稿「复活」（见 close/invalidate/switchFloor） */
    planDirty: false,
    /* 「选择」键多选：multi＝{room:{},fix:{},wall:{}} 以 id 记选中；boxMode 框选开关；
     * boxRect＝正在拉的框（坐标单位），null＝未在拉框 */
    multi: null, boxMode: false, boxRect: null
  };
  function F() { return window.WuriSoulFs; }
  function planOf() { return E.plan; }
  function mpu() { return (E.plan && E.plan.mPerUnit) || 1; }
  function toM(units) { return units * mpu(); }
  function toU(meters) { return meters / mpu(); }

  function blankPlan(floorId, houseId) {
    return {
      floorId: floorId, houseId: houseId, updated: 0, mPerUnit: 1,
      rooms: [], fixtures: [], walls: [], trace: null, liji: null, lijiLock: false, calibNote: '',
      layers: { rooms: true, fixtures: true, dims: true, overlay: 'none', palNames: true, roomNames: true, traceBg: true, ovOpacity: 0.55, compRadius: 0 }
    };
  }
  function normalizePlan(p) {
    var b = blankPlan(p.floorId, p.houseId);
    for (var k in b) if (p[k] === undefined || p[k] === null) p[k] = b[k];
    for (var k2 in b.layers) if (p.layers[k2] === undefined) p.layers[k2] = b.layers[k2];
    /* 旧默认 0.92＝整盘近实盖、线字同淡（用户 2026-10-27 反馈看不见底下）；
     * 存量恰为旧默认值者与手调 92 分不开，一律迁到新默认 0.55（新口径下它只管
     * 填充层、线字另行保清晰），其余手调值（≠0.92）原样保留 */
    if (p.layers.ovOpacity === 0.92) p.layers.ovOpacity = 0.55;
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
    E.planDirty = true;
    E.plan.updated = Date.now();
    ensureLiji();
    clearTimeout(saveTm);
    var snap = clone(E.plan);
    saveTm = setTimeout(function () {
      db.plans.put(snap).then(function () { if (E.plan === snap || (E.plan && E.plan.floorId === snap.floorId && E.plan.updated === snap.updated)) E.planDirty = false; }).catch(function () {});
    }, 200);
    var sv = $('hpe-saved');
    if (sv) sv.textContent = T('hpe_saved');
  }
  function saveNow() {
    if (!E.plan) return Promise.resolve();
    /* 身份守卫：内存稿与当前层对不上（已被 invalidate 作废或切层途中）绝不回写，
     * 否则详情页删掉的户型行会被旧稿 put 回库复活并当普通更新推云 */
    if (E.floorId && E.plan.floorId !== E.floorId) return Promise.resolve();
    clearTimeout(saveTm);
    E.plan.updated = Date.now();
    ensureLiji();
    return db.plans.put(clone(E.plan)).then(function () { E.planDirty = false; }).catch(function () {});
  }
  /* 外部删层/清空后作废内存稿（house.js 详情页删 plans 行时调用）：
   * 命中本层才动手——弃稿、停防抖待写、清撤销栈，编辑器再无从把旧稿写回 */
  function invalidate(fid) {
    if (!fid || !E.plan || E.plan.floorId !== fid) return;
    clearTimeout(saveTm);
    E.plan = null; E.planDirty = false;
    E.sel = null; E.multi = null; E.boxRect = null;
    E.undoStack = []; E.redoStack = []; E.drag = null;
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
    E.sel = null; E.chartCache = null; E.cut = null; E.multi = null; E.planDirty = true;
    /* 清空后撤销把房间找回时，空层起始面须让位回画布 */
    if (E.sheet === 'start' && hasContent()) closeSheet();
    afterChange(true);
  }
  function redo() {
    if (!E.redoStack.length) return;
    E.undoStack.push(clone(E.plan));
    E.plan = E.redoStack.pop();
    E.sel = null; E.chartCache = null; E.cut = null; E.multi = null; E.planDirty = true;
    if (E.sheet === 'start' && hasContent()) closeSheet();
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
    (p.walls || []).forEach(function (w) { ext(w.x1, w.y1); ext(w.x2, w.y2); });
    if (p.trace && p.trace.rect) { var t = p.trace.rect; ext(t.x, t.y); ext(t.x + t.w, t.y + t.h); }
    if (p.liji) ext(p.liji.x, p.liji.y);
    if (!has) return { x0: -6, y0: -5, x1: 6, y1: 5 };
    return { x0: x0, y0: y0, x1: x1, y1: y1 };
  }
  /* 轮廓范围：只算房间＋描图外框（立极自身不入账，防自动求心自引用漂移） */
  function contentExtent() {
    var p = E.plan, x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, has = false;
    function ext(x, y) { has = true; if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
    p.rooms.forEach(function (r) { ext(r.x, r.y); ext(r.x + r.w, r.y + r.h); });
    (p.walls || []).forEach(function (w) { ext(w.x1, w.y1); ext(w.x2, w.y2); });
    if (p.trace && p.trace.rect) { var t = p.trace.rect; ext(t.x, t.y); ext(t.x + t.w, t.y + t.h); }
    return has ? { x0: x0, y0: y0, x1: x1, y1: y1 } : null;
  }
  function hasContent() {
    var p = E.plan;
    return !!(p && (p.rooms.length || (p.walls && p.walls.length) || (p.trace && p.trace.rect)));
  }
  function lijiPoint() {
    var p = E.plan;
    if (p.liji) return p.liji;
    var b = contentExtent();
    if (!b) return { x: 0, y: 0 };
    return { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 };
  }
  /* 立极口径（2026-10-27 定）：无户型（无房间无描图外框）不立极；
   * 自动模式（lijiLock≠true）随轮廓变化按对角线交点重算；手动拖过即锁定
   * （lijiLock=true）不随轮廓动，双击立极点恢复自动。存量档案旧版无锁定
   * 标记，一律按自动接管（旧版「首次生成即固化」本就不是锁定承诺）。 */
  function ensureLiji() {
    var p = E.plan;
    if (!p) return;
    var b = contentExtent();
    if (!b) { p.liji = null; return; }
    if (p.lijiLock && p.liji) return;
    p.liji = { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 };
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
    /* 房间块（ex＝户外排除块：斜纹底、不显面积、名固定「户外」）；
     * 房名/面积不在此绘——收集到 labs，待叠盘与构件之后统一重绘（恒在最上层，
     * 盘开多大、透明度多少都压不住字；标签组 pointer-events:none 不挡点房） */
    var labs = '';
    if (L.rooms) {
      p.rooms.forEach(function (r) {
        var sel = (E.sel && E.sel.kind === 'room' && E.sel.id === r.id) || !!(E.multi && E.multi.room[r.id]);
        var fsN = Math.max(u * 2.6, Math.min(r.w, r.h) * 0.16);
        if (r.ex) {
          s += '<g data-act="room" data-id="' + r.id + '">' +
            '<rect class="hpe-roomrect ex' + (sel ? ' sel' : '') + '" x="' + r.x + '" y="' + r.y +
            '" width="' + r.w + '" height="' + r.h + '" stroke-width="' + (u * (sel ? 0.3 : 0.16)) + '"/>' +
            '<rect class="hpe-hatchrect" x="' + r.x + '" y="' + r.y + '" width="' + r.w + '" height="' + r.h + '"/>' +
            '</g>';
          if (L.roomNames) labs += '<text class="hpe-roomname ex" x="' + (r.x + r.w / 2) + '" y="' + (r.y + r.h / 2 + fsN * 0.37) +
            '" text-anchor="middle" font-size="' + fsN + '">' + esc(T('hpe_out_name')) + '</text>';
          return;
        }
        s += '<g data-act="room" data-id="' + r.id + '">' +
          '<rect class="hpe-roomrect hpe-rt-' + (r.type || 'other') + (sel ? ' sel' : '') + (E.mode === 'trace' ? ' trace' : '') + '" x="' + r.x + '" y="' + r.y +
          '" width="' + r.w + '" height="' + r.h + '" stroke-width="' + (u * (sel ? 0.3 : 0.16)) + '"' +
          /* AI 低置信房间：虚线描边（不确定签，与 CSS aiq 类同走变量链色） */
          (r.aiq ? ' stroke-dasharray="' + (u * 0.85) + ' ' + (u * 0.55) + '"' : '') + '/>' +
          '</g>';
        if (L.roomNames && r.name) labs += '<text class="hpe-roomname" x="' + (r.x + r.w / 2) + '" y="' + (r.y + r.h / 2 + fsN * 0.37) +
          '" text-anchor="middle" font-size="' + fsN + '">' + esc(r.name) + (r.aiq ? ' ？' : '') + '</text>';
        if (L.dims) labs += '<text class="hpe-roomarea" x="' + (r.x + r.w - u * 0.7) + '" y="' + (r.y + r.h - u * 0.8) +
          '" text-anchor="end" font-size="' + (u * 1.9) + '">' + trimNum(toM(r.w) * toM(r.h)) + '㎡</text>';
      });
    }
    /* 墙段层（画墙产物）：房间之上、叠盘之下，随「房间」图层开关同进退。
     * 视觉线宽＝0.12 m 细墙（墙厚统一常量口径，缩放后不细于 u*0.24 免看不见）；
     * 命中另设加宽透明线（pointer-events:stroke），细线本身不接命中。 */
    if (L.rooms) {
      (p.walls || []).forEach(function (w) {
        var selW = (E.sel && E.sel.kind === 'wall' && E.sel.id === w.id) || !!(E.multi && E.multi.wall[w.id]);
        s += '<line class="hpe-wall' + (selW ? ' sel' : '') + '" x1="' + w.x1 + '" y1="' + w.y1 + '" x2="' + w.x2 + '" y2="' + w.y2 + '" stroke-width="' + Math.max(toU(0.12), u * 0.24) + '"/>' +
          '<line class="hpe-wallhit" data-act="wall" data-id="' + w.id + '" x1="' + w.x1 + '" y1="' + w.y1 + '" x2="' + w.x2 + '" y2="' + w.y2 + '" stroke-width="' + (u * 3.2) + '"/>';
      });
    }
    /* 叠盘：空层（无房间无描图）不画任何盘/九宫格，哪怕存档叠盘是开——
     * 有户型后才按存档状态画（2026-10-27 用户定调「一开始干干净净」） */
    if (L.overlay !== 'none' && E.fixed && hasContent()) s += renderOverlay(u);
    /* 构件 */
    if (L.fixtures) {
      p.fixtures.forEach(function (f) {
        var d = FIX[f.type]; if (!d) return;
        var sel = (E.sel && E.sel.kind === 'fixture' && E.sel.id === f.id) || !!(E.multi && E.multi.fix[f.id]);
        var wU = toU(d.w), hU = toU(d.h);
        s += '<g data-act="fixture" data-id="' + f.id + '" class="hpe-fix' + (sel ? ' sel' : '') + '">' +
          '<rect class="hpe-fixhit" x="' + (f.x - wU / 2) + '" y="' + (f.y - hU / 2) + '" width="' + wU + '" height="' + hU + '"/>' +
          (sel ? '<rect class="hpe-fixsel" x="' + (f.x - wU / 2) + '" y="' + (f.y - hU / 2) + '" width="' + wU + '" height="' + hU + '" stroke-width="' + (u * 0.2) + '"/>' : '') +
          /* AI 低置信构件：虚线框＋左上问号签（不随构件旋转，恒正向可读） */
          (f.aiq ? '<rect class="hpe-fixaiq" x="' + (f.x - wU / 2) + '" y="' + (f.y - hU / 2) + '" width="' + wU + '" height="' + hU + '" stroke-width="' + (u * 0.18) + '" stroke-dasharray="' + (u * 0.7) + ' ' + (u * 0.45) + '"/>' +
            '<text class="hpe-aiqmark" x="' + (f.x - wU / 2 - u * 0.2) + '" y="' + (f.y - hU / 2 - u * 0.6) + '" font-size="' + (u * 2.3) + '">？</text>' : '') +
          '<g transform="translate(' + f.x + ' ' + f.y + ') rotate(' + (f.rot || 0) + ') scale(' + (wU / d.box[0] * (f.flip ? -1 : 1)) + ' ' + (hU / d.box[1]) + ') translate(' + (-d.box[0] / 2) + ' ' + (-d.box[1] / 2) + ')">' +
          '<g stroke="currentColor" stroke-width="' + (30 / Math.max(d.box[0], d.box[1]) * 1.1) + '" fill="none" stroke-linecap="round">' + d.art + '</g></g>' +
          (d.sw ? '<text class="hpe-fixsw ' + d.sw + '" x="' + (f.x + wU / 2 + u * 0.4) + '" y="' + (f.y - hU / 2 - u * 0.5) + '" text-anchor="end" font-size="' + (u * 1.8) + '">' + esc(T('hpe_sw_' + d.sw)) + '</text>' : '') +
          '</g>';
      });
    }
    /* 房名/面积标签层：恒绘于叠盘与构件之上 */
    if (labs) s += '<g class="hpe-roomlabels" pointer-events="none">' + labs + '</g>';
    /* 选中房间：手柄＋尺寸胶囊 */
    if (E.sel && E.sel.kind === 'room') {
      var r = roomById(E.sel.id);
      if (r) s += renderRoomSel(r, u);
    }
    /* 选中墙段：两端圆点手柄＋长度胶囊（拖端点改长，口径同房间手柄） */
    if (E.sel && E.sel.kind === 'wall') {
      var wsel2 = wallById(E.sel.id);
      if (wsel2) s += renderWallSel(wsel2, u);
    }
    /* 画墙进行中预览：朱砂虚线＋两端点，随指尖实时拉直 */
    if (E.wallPrev) {
      var pv = E.wallPrev;
      s += '<line class="hpe-wallprev" x1="' + pv.x1 + '" y1="' + pv.y1 + '" x2="' + pv.x2 + '" y2="' + pv.y2 + '" stroke-width="' + (u * 0.28) + '"/>' +
        '<circle class="hpe-wallep" cx="' + pv.x1 + '" cy="' + pv.y1 + '" r="' + (u * 1.1) + '"/>' +
        '<circle class="hpe-wallep" cx="' + pv.x2 + '" cy="' + pv.y2 + '" r="' + (u * 1.1) + '"/>';
    }
    /* 分切预览：虚线切线＋两侧尺寸胶囊 */
    if (E.cut) s += renderCut(u);
    /* 立极：空层不渲染（无户型无从立极），切出第一间/定下外框后才出现；
     * 绘制态一并隐藏（与盘面叠层同口径收起，防十字＋字签挡作图区） */
    var drawing = drawingActive();
    if (hasContent() && !drawing) s += renderLiji(u);
    /* 补角法提示：房间轮廓明显缺角时在立极旁给签（课件补齐方正法一系） */
    var bj = missingCornerInfo();
    if (bj && L.rooms && !drawing) {
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
    /* 框选拉框预览 */
    if (E.boxRect) {
      var br2 = E.boxRect;
      s += '<rect class="hpe-boxrect" x="' + br2.x + '" y="' + br2.y + '" width="' + br2.w + '" height="' + br2.h + '" stroke-width="' + (u * 0.25) + '"/>';
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
  function wallById(id) { return (E.plan.walls || []).filter(function (w) { return w.id === id; })[0] || null; }
  function wallLenM(w) { return toM(Math.hypot(w.x2 - w.x1, w.y2 - w.y1)); }
  function renderWallSel(w, u) {
    var s = '';
    [[w.x1, w.y1, 0], [w.x2, w.y2, 1]].forEach(function (e) {
      s += '<circle class="hpe-hdl" data-act="wallh" data-e="' + e[2] + '" cx="' + e[0] + '" cy="' + e[1] + '" r="' + (u * 1.6) + '"/>';
    });
    if (E.plan.layers.dims) {
      var fsD = u * 2.1, txt = trimNum(wallLenM(w), 2) + ' m';
      var capW = txt.length * fsD * 0.62 + u * 1.6;
      var mx = (w.x1 + w.x2) / 2, my = (w.y1 + w.y2) / 2;
      s += '<g class="hpe-dim"><rect x="' + (mx - capW / 2) + '" y="' + (my - fsD * 1.9) + '" width="' + capW + '" height="' + (fsD * 1.55) + '" rx="' + (u * 0.6) + '"/>' +
        '<text x="' + mx + '" y="' + (my - fsD * 0.72) + '" text-anchor="middle" font-size="' + fsD + '">' + esc(txt) + '</text></g>';
    }
    return s;
  }
  /* 叠盘呈现（2026-10-27 改）：线框为主＋极轻染色——填充层（罗盘扇面/飞星
   * 星数胶囊底）走 ovOpacity（图层面板滑杆，默认 0.55），环线/山字/卦名/宫名
   * 等线字层另保清晰（ovOpacity+0.45 封顶 1）；整组 pointer-events:none，
   * 盘纯展示不拦截点房（旧版扇面/文字命中会把点房吞成空白点选）。 */
  function renderOverlay(u) {
    var p = E.plan, L = p.layers, g = gridRect();
    var op = L.ovOpacity == null ? 0.55 : L.ovOpacity;
    var fillOp = op, lineOp = Math.min(1, op + 0.45);
    var fills = '', lines = '';
    var cw = g.w / 3, ch = g.h / 3;
    if (L.overlay === 'fx') {
      var chart = fxChart();
      lines += '<g class="hpe-gridln" stroke-width="' + (u * 0.16) + '">' +
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
          if (L.palNames) lines += '<text class="hpe-palname" x="' + (px + u * 0.8) + '" y="' + (py + u * 3) + '" font-size="' + (u * 2.1) + '">' + esc(txs(pl.name)) + esc(T('hpe_palace_suffix')) + '</text>';
          var fsS = u * 2.2, capW = txt.length * fsS * 0.6 + u * 1.8;
          fills += '<g class="hpe-starcap' + (hot ? ' hot' : '') + '"><rect x="' + (px + cw - capW - u * 0.7) + '" y="' + (py + ch - fsS * 1.9) + '" width="' + capW + '" height="' + (fsS * 1.5) + '" rx="' + (u * 0.8) + '"/></g>';
          lines += '<g class="hpe-starcap' + (hot ? ' hot' : '') + '"><text x="' + (px + cw - u * 0.7 - capW / 2) + '" y="' + (py + ch - fsS * 0.75) + '" text-anchor="middle" font-size="' + fsS + '">' + esc(txt) + '</text></g>';
        });
      }
    } else if (L.overlay === 'bz') {
      var fan = bzFan();
      var R = Math.sqrt(g.w * g.w + g.h * g.h) / 2 * 0.98;
      var dirs = Object.keys(DIR8_ANG);
      lines += '<g class="hpe-fanln" stroke-width="' + (u * 0.14) + '">';
      dirs.forEach(function (dn) {
        var th = (DIR8_ANG[dn] - E.fixed.facingDeg + 22.5) * Math.PI / 180;
        lines += '<line x1="' + g.cx + '" y1="' + g.cy + '" x2="' + (g.cx + Math.sin(th) * R) + '" y2="' + (g.cy - Math.cos(th) * R) + '"/>';
      });
      lines += '</g>';
      if (fan) {
        fan.forEach(function (pl) {
          var v = screenVec(pl.direction, R * 0.66);
          if (!v) return;
          var good = pl.star && pl.star.kind === 'auspicious';
          lines += '<text class="hpe-fanstar' + (good ? ' good' : '') + '" x="' + (g.cx + v.x) + '" y="' + (g.cy + v.y + u * 0.8) + '" text-anchor="middle" font-size="' + (u * 2.3) + '">' + esc(txs(pl.star.name)) + '</text>' +
            '<text class="hpe-fandir" x="' + (g.cx + v.x) + '" y="' + (g.cy + v.y + u * 3.4) + '" text-anchor="middle" font-size="' + (u * 1.7) + '">' + esc(txs(pl.name)) + '</text>';
        });
      }
    } else if (L.overlay === 'compass') {
      var rose = compassRose(u, g);
      fills += rose.fill; lines += rose.line;
    }
    return '<g class="hpe-ov" pointer-events="none">' +
      (fills ? '<g opacity="' + fillOp + '">' + fills + '</g>' : '') +
      '<g opacity="' + lineOp + '">' + lines + '</g></g>';
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
    var fill = '', line = '';
    /* 整盘连续（2026-10-27 用户定调）：先铺一整块圆盘底，八卦扇区边挨边共用
     * 同一圆，只以深浅交替区分、卦界用线字层的径向细线分——旧版每扇独立描边
     * 加交替留空，看着像被切开拉散的八块切片，已废。填充层随 ovOpacity 变透。 */
    fill += '<circle class="hpe-rose-base" cx="' + cx + '" cy="' + cy + '" r="' + R + '"/>';
    if (window.FS_TRI) FS_TRI.forEach(function (tr, i) {
      var a0 = tr[1] - 22.5, a1 = tr[1] + 22.5;
      var p0 = pt(a0, R), p1 = pt(a1, R);
      fill += '<path class="hpe-rose-sec' + (i % 2 ? ' alt' : '') + '" d="M' + cx + ' ' + cy + ' L' + p0[0].toFixed(2) + ' ' + p0[1].toFixed(2) +
        ' A' + R + ' ' + R + ' 0 0 1 ' + p1[0].toFixed(2) + ' ' + p1[1].toFixed(2) + ' Z"/>';
      var dp = pt(a0, R);
      line += '<line class="hpe-rose-div" x1="' + cx + '" y1="' + cy + '" x2="' + dp[0].toFixed(2) + '" y2="' + dp[1].toFixed(2) + '" stroke-width="' + (u * 0.12) + '"/>';
    });
    /* 圈环 */
    line += '<circle class="hpe-rose-ring" cx="' + cx + '" cy="' + cy + '" r="' + R + '" stroke-width="' + (u * 0.22) + '"/>' +
      '<circle class="hpe-rose-ring thin" cx="' + cx + '" cy="' + cy + '" r="' + (R * 0.84) + '" stroke-width="' + (u * 0.12) + '"/>' +
      '<circle class="hpe-rose-ring thin" cx="' + cx + '" cy="' + cy + '" r="' + (R * 0.62) + '" stroke-width="' + (u * 0.12) + '"/>' +
      '<circle class="hpe-rose-ring thin" cx="' + cx + '" cy="' + cy + '" r="' + (R * 0.2) + '" stroke-width="' + (u * 0.12) + '"/>';
    /* 刻度：每山一格，卦界加长 */
    if (window.FS24) FS24.forEach(function (m) {
      var lon = (m.angle % 45 === 0);
      var q0 = pt(m.angle, R * (lon ? 0.94 : 0.965)), q1 = pt(m.angle, R);
      line += '<line class="hpe-rose-tick" x1="' + q0[0].toFixed(2) + '" y1="' + q0[1].toFixed(2) + '" x2="' + q1[0].toFixed(2) + '" y2="' + q1[1].toFixed(2) + '" stroke-width="' + (u * 0.14) + '"/>';
      var mp = pt(m.angle, R * 0.9);
      var cls = 'hpe-rose-mtn' + ((window.FS_CARDINAL && FS_CARDINAL[m.name]) ? ' card' : '') + ((window.FS_GUA_MTN && FS_GUA_MTN[m.name]) ? ' gua' : '');
      line += '<text class="' + cls + '" x="' + mp[0].toFixed(2) + '" y="' + mp[1].toFixed(2) + '" text-anchor="middle" dominant-baseline="central" font-size="' + (R * 0.062) + '">' + esc(m.name) + '</text>';
    });
    /* 八卦名（卦位中半径） */
    if (window.FS_TRI) FS_TRI.forEach(function (tr) {
      var gp = pt(tr[1], R * 0.42);
      line += '<text class="hpe-rose-gua" x="' + gp[0].toFixed(2) + '" y="' + gp[1].toFixed(2) + '" text-anchor="middle" dominant-baseline="central" font-size="' + (R * 0.11) + '">' + esc(tr[0]) + '</text>';
    });
    /* 向首标记（屏幕正上＝向，朱砂三角＋「向」字） */
    line += '<path class="hpe-rose-mark" d="M' + cx + ' ' + (cy - R - u * 1.1) + ' l' + (u * 1.1) + ' ' + (u * 1.9) + ' h' + (-u * 2.2) + ' Z"/>' +
      '<text class="hpe-rose-marktxt" x="' + cx + '" y="' + (cy - R - u * 2.6) + '" text-anchor="middle" font-size="' + (u * 2.2) + '">' + esc(T('hpe_facing_mark')) + '</text>';
    return { fill: fill, line: line };
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
  /* ---------------- 照片建房舞台视口（viewBox 平移/缩放，与画布同构） ----------------
   * 舞台坐标：照片占 (0,0)-(1000,Hh)。旧版 viewBox 钉死整图且抽屉压住下沿，
   * 长图下两角永远够不着；改走 st.view：初始 fit 把整图收进「抽屉之上」的可视带，
   * 双指捏合/单指拖空白/滚轮/全图钮都可动，四角任何时候够得着。 */
  function stageDims() { var st = E.stage; return { W: 1000, H: 1000 * st.natH / st.natW }; }
  function stageBand() {
    /* 抽屉盖住画布下沿的比例：fit 时只用抽屉以上的带子安放整图 */
    var cv = $('hpe-canvas'), sh = $('hpe-sheet');
    if (!cv || !cv.clientHeight) return 1;
    if (sh && !sh.hidden && E.sheet) {
      var cr = cv.getBoundingClientRect(), sr = sh.getBoundingClientRect();
      var covered = Math.max(0, Math.min(cr.height, cr.bottom - sr.top));
      return Math.max(0.3, (cr.height - covered) / cr.height);
    }
    return 1;
  }
  function stageFit() {
    var d = stageDims(), asp = stageAspect(), band = stageBand(), m = 1.05;
    var w = Math.max(d.W * m, d.H * m / band * asp);
    var bandH = w / asp * band;
    return { x: (d.W - w) / 2, y: -(bandH - d.H) / 2, w: w };
  }
  function clampSview() {
    var st = E.stage; if (!st || !st.view) return;
    var d = stageDims(), asp = stageAspect(), v = st.view;
    var cx = v.x + v.w / 2, cy = v.y + v.w / asp / 2;
    var maxW = Math.max(d.W, d.H * asp) * 2.4;
    v.w = Math.max(120, Math.min(maxW, v.w));
    v.x = cx - v.w / 2; v.y = cy - v.w / asp / 2;
    var h = v.w / asp;
    v.x = Math.max(0 - v.w * 0.85, Math.min(v.x, d.W - v.w * 0.15));
    v.y = Math.max(0 - h * 0.85, Math.min(v.y, d.H - h * 0.15));
  }
  function clientToStage(cx, cy) {
    var st = E.stage, v = st.view, svg = $('hpe-svg');
    if (!svg || !v) return { x: 0, y: 0 };
    var rc = svg.getBoundingClientRect();
    if (!rc.width) return { x: v.x, y: v.y };
    return { x: v.x + (cx - rc.left) / rc.width * v.w, y: v.y + (cy - rc.top) / rc.height * (v.w / stageAspect()) };
  }
  function zoomStageAt(nw, cx, cy) {
    var st = E.stage; if (!st || st.preview) return;
    if (!st.view) st.view = stageFit();
    var a = clientToStage(cx, cy);
    var svg = $('hpe-svg'); if (!svg) return;
    var rc = svg.getBoundingClientRect(); if (!rc.width) return;
    st.view.w = nw;
    st.view.x = a.x - (cx - rc.left) / rc.width * nw;
    st.view.y = a.y - (cy - rc.top) / rc.height * (nw / stageAspect());
    clampSview(); render();
  }
  function renderStage(svg) {
    var st = E.stage;
    var Hh = 1000 * st.natH / st.natW;
    if (st.preview) {
      svg.setAttribute('viewBox', '0 0 ' + st.preview.w + ' ' + st.preview.h);
      svg.innerHTML = '<image class="hpe-stage-preview-img" href="' + st.preview.url + '" x="0" y="0" width="' + st.preview.w + '" height="' + st.preview.h + '" preserveAspectRatio="none"/>';
      return;
    }
    if (!st.view) st.view = stageFit();
    clampSview();
    var v = st.view;
    svg.setAttribute('viewBox', v.x + ' ' + v.y + ' ' + v.w + ' ' + (v.w / stageAspect()));
    var s = '<image href="' + st.url + '" x="0" y="0" width="1000" height="' + Hh + '" preserveAspectRatio="none" draggable="false"/>';
    var pts = st.corners.map(function (c) { return (c.x * 1000) + ',' + (c.y * Hh); }).join(' ');
    s += '<polygon class="hpe-quad" points="' + pts + '"/>';
    /* 命中圈随缩放长大：半径约视口宽 6%，手指好捏；坏角描红 */
    var rHit = Math.max(30, Math.min(110, v.w * 0.062));
    var rDot = Math.max(5, Math.min(12, v.w * 0.010));
    st.corners.forEach(function (c, i) {
      s += '<circle class="hpe-corner' + (st.bad === i ? ' bad' : '') + '" data-act="corner" data-i="' + i + '" cx="' + (c.x * 1000) + '" cy="' + (c.y * Hh) + '" r="' + rHit + '"/>' +
        '<circle class="hpe-cornerdot" cx="' + (c.x * 1000) + '" cy="' + (c.y * Hh) + '" r="' + rDot + '"/>';
    });
    /* 拖动中在手指上方约一指高处画影点：真角不被手指盖住，落点看得见 */
    if (st.dragI != null && st.dragI >= 0 && st.corners[st.dragI]) {
      var dc = st.corners[st.dragI], gx = dc.x * 1000, gy = dc.y * Hh - v.w * 0.115;
      s += '<line class="hpe-corner-ghostln" x1="' + (dc.x * 1000) + '" y1="' + (dc.y * Hh) + '" x2="' + gx + '" y2="' + gy + '"/>' +
        '<circle class="hpe-corner-ghost" cx="' + gx + '" cy="' + gy + '" r="' + (rHit * 0.62) + '"/>' +
        '<circle class="hpe-corner-ghostdot" cx="' + gx + '" cy="' + gy + '" r="' + rDot + '"/>';
    }
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
      : E.sheet === 'lib' ? T('hpe_lib')
      : E.sheet === 'select' ? T('hpe_select')
      : '';
    layoutAttr();
  }
  function showSheet(kind) {
    E.sheet = kind;
    /* 描图层开合驱动 E.mode（onDown 拉框/校准与房间 trace 描边样式仍按 mode 走） */
    if (kind === 'trace') E.mode = 'trace';
    else if (E.mode === 'trace') { E.mode = 'draw'; E.calibArm = false; E.calibPts = []; }
    if (kind === 'trace') suppressOverlay(); /* 描图亦是绘制态：叠层先收起 */
    if (kind === 'floors') renderFloorsBar();
    else if (kind === 'info') {
      var p = $('hpe-panel'); if (p) p.innerHTML = '';
      var h = $('hpe-hint'); if (h) h.textContent = '';
    } else if (kind === 'layers' || kind === 'trace' || kind === 'tpl' || kind === 'start' || kind === 'lib' || kind === 'select') renderPanel();
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
    var cur = E.floors.filter(function (f) { return f.id === E.floorId; })[0];
    box.innerHTML = '<div class="hpe-flist">' + E.floors.map(function (f) {
      return '<div class="hpe-floorrow' + (f.id === E.floorId ? ' on' : '') + '" data-hpefl="' + f.id + '">' +
        '<span>' + esc(f.name) + '</span>' + (f.id === E.floorId ? '<span class="ck">✓</span>' : '') + '</div>';
    }).join('') + '</div>' +
      (E.floors.length > 1
        ? '<div class="hpe-fl-delrow"><span class="hpe-op danger" id="hpe-fl-del">' +
          esc(T('hd_del_floor')) + (cur ? '「' + esc(cur.name) + '」' : '') + '</span></div>'
        : '<p class="hpe-note">' + esc(T('hpe_del_floor_only')) + '</p>');
    var hint = $('hpe-hint'); if (hint) hint.textContent = '';
    Array.prototype.forEach.call(box.querySelectorAll('[data-hpefl]'), function (el) {
      el.addEventListener('click', function () {
        var fid = +el.getAttribute('data-hpefl');
        closeSheet();
        if (fid !== E.floorId) switchFloor(fid);
      });
    });
    var dl = $('hpe-fl-del');
    if (dl) dl.addEventListener('click', function () {
      dlgConfirm(T('hd_confirm_del_floor'), T('hd_del_floor')).then(function (ok) {
        if (ok) deleteCurrentFloor();
      });
    });
  }
  /* 删除当前层（与详情卡删层同口径）：该层照片改不分层（不删照片）、
   * plan 行删除、楼层行删除；删后切到剩余第一层 */
  function deleteCurrentFloor() {
    var fid = E.floorId, hid = E.houseId;
    db.photos.where('houseId').equals(hid).and(function (p) { return p.floorId === fid; })
      .modify(function (p) { p.floorId = null; })
      .then(function () { return db.plans.delete(fid); })
      .then(function () { invalidate(fid); return db.floors.delete(fid); })
      .then(function () {
        E.floors = E.floors.filter(function (f) { return f.id !== fid; });
        closeSheet();
        if (E.floors.length) switchFloor(E.floors[0].id);
      }).catch(function () {});
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
    } else if (E.sheet === 'lib') {
      box.innerHTML = '';
      renderLibPanel();
    } else if (E.sheet === 'select') {
      box.innerHTML = '<div id="hpe-selbox"></div>';
      if (hint) hint.innerHTML = '';
      renderSelectPanel();
    } else {
      box.innerHTML = '';
      if (hint) hint.innerHTML = '';
    }
    renderAttr();
  }
  /* 模板面板：空层自动弹；已有房间时亦可从托盘「模板」再开（只替换房间块） */
  function renderTplPanel() {
    var box = $('hpe-tplbox'); if (!box) return;
    var empty = !hasContent();
    box.innerHTML = '<p class="hpe-note" style="margin-top:2px">' + esc(empty ? T('hpe_tpl_empty') : T('hpe_tpl_note')) + '</p>' +
      '<div class="hpe-tpls">' +
      Object.keys(TEMPLATES).map(function (k) {
        var tp = TEMPLATES[k];
        return '<div class="hpe-tpl" data-tpl="' + k + '"><b>' + esc(T(tp.lab)) + '</b><span>' + esc(TF(T('hpe_tpl_rooms_n'), tp.rooms.length)) + '</span></div>';
      }).join('') +
      '<div class="hpe-tpl" data-tpl="blank"><b>' + esc(T('hpe_tpl_blank')) + '</b><span>0</span></div>' +
      '</div>';
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
    suppressOverlay();
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
      '<div class="hpe-start rec" data-start="wall"><b>' + esc(T('hpe_start_wall')) + '</b><span>' + esc(T('hpe_start_wall_d')) + '</span></div>' +
      '<div class="hpe-start" data-start="split"><b>' + esc(T('hpe_start_split')) + '</b><span>' + esc(T('hpe_start_split_d')) + '</span></div>' +
      '<div class="hpe-start" data-start="tpl"><b>' + esc(T('hpe_start_tpl')) + '</b><span>' + esc(T('hpe_start_tpl_d')) + '</span></div>' +
      '<div class="hpe-start" data-start="trace"><b>' + esc(T('hpe_start_trace')) + '</b><span>' + esc(T('hpe_start_trace_d')) + '</span></div>' +
      '<div class="hpe-start" data-start="free"><b>' + esc(T('hpe_start_free')) + '</b><span>' + esc(T('hpe_start_free_d')) + '</span></div>' +
      '</div>';
    Array.prototype.forEach.call(box.querySelectorAll('[data-start]'), function (el) {
      el.addEventListener('click', function () {
        var k = el.getAttribute('data-start');
        if (k === 'wall') enterWallMode();
        else if (k === 'split') { E.startPhase = 'frame'; renderPanel(); }
        else if (k === 'tpl') showSheet('tpl');
        else if (k === 'trace') showSheet('trace');
        else if (k === 'free') closeSheet();
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
    E.plan.lijiLock = false; /* 定框生成的立极是自动求心：后续改框随轮廓重算 */
    E.sel = { kind: 'room', id: r.id };
    E.attrFull = true; E._attrKey = 'room:' + r.id; /* 外框生成后直接展开完整条，横/竖切就在手边 */
    E.view = null;
    E.uiMode = 'split'; syncModeBtn(); /* 定外框即进入分切态，模式钮翻「去摆家具」 */
    suppressOverlay();
    closeSheet();
    afterChange();
    toastMsg(T('hpe_split_hint'));
  }

  /* ---------------- 托盘（模拟人生式目录条） ----------------
   * 拖放为主：tile 上 pointer 拖影跟随、松手落位；点选→点放为兜底
   * （房间与构件均为一次性放置：落位即卸待放、保持选中，2026-10-27 改）。 */
  function placeRoomAt(type, pt) {
    var pr = null;
    ROOM_PRESETS.forEach(function (x) { if (x.type === type) pr = x; });
    if (!pr) return;
    suppressOverlay();
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
    suppressOverlay();
    if (FIX[type].wallSeg) { placeWallItem(type, pt); return; }
    pushUndo();
    var nf = { id: uid(), type: type, x: pt.x, y: pt.y, rot: 0, flip: false };
    wallSnap(nf, pt);
    E.plan.fixtures.push(nf);
    E.sel = { kind: 'fixture', id: nf.id };
    /* 一次性放置：放下即卸待放态并保持选中——再点是选中、拖是移动，
     * 不再「想拖却又生一个」（用户 2026-10-27 实测痛点） */
    E.placeType = null; syncTray();
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
  /* 绘制态判定：画墙/分切/待放/切刀/描图/框选任一在进行，盘面就不该抢视线 */
  function drawingActive() {
    return !!(E.uiMode === 'wall' || E.uiMode === 'split' || E.arm || E.placeType || E.cut || E.mode === 'trace' || E.boxMode);
  }
  /* 进绘制态时把盘面叠层（飞星/罗盘/八宅判定层）收起：直接落盘为 none，
   * 退出绘制态不自动恢复——用户经「图层」面板或托盘叠盘钮手动再开（口径 2026-10-27） */
  function suppressOverlay() {
    if (!E.plan) return;
    if (E.plan.layers.overlay === 'none') return;
    E.plan.layers.overlay = 'none';
    E.chartCache = null;
    save(); renderTray();
    if (E.sheet === 'layers') renderLayersPanel();
  }
  /* 托盘只剩工具组（模板/描图/叠盘）：房间与构件全收进「构件库」面板（▦ 钮），
   * 分切⇄摆家具走托盘右端固定模式钮——两者都不再随横滑移走、不会半截露屏外 */
  function renderTray() {
    var sc = $('hpe-tray-scroll'); if (!sc) return;
    var ovLab = E.plan ? T('hpe_ov_' + E.plan.layers.overlay) : '';
    sc.innerHTML = '<div class="hpe-tgroup"><div class="hpe-tgname">' + esc(T('hpe_tray_actions')) + '</div><div class="hpe-tgrow">' +
      '<div class="hpe-tile2 act" data-tile="tpl"><span class="gic">▦</span><div class="n">' + esc(T('hpe_tpl')) + '</div></div>' +
      '<div class="hpe-tile2 act" data-tile="trace"><span class="gic">✎</span><div class="n">' + esc(T('hpe_mode_trace')) + '</div></div>' +
      '<div class="hpe-tile2 act" data-tile="wall"><span class="gic">✐</span><div class="n">' + esc(T('hpe_wall_tile')) + '</div></div>' +
      '<div class="hpe-tile2 act" data-tile="select"><span class="gic">⌖</span><div class="n">' + esc(T('hpe_select')) + '</div></div>' +
      '<div class="hpe-tile2 act" data-tile="ovcycle"><span class="gic">◎</span><div class="n">' + esc(T('hpe_lay_overlay')) + '</div>' +
      (ovLab ? '<span class="hpe-ovpill' + (E.plan.layers.overlay === 'none' ? ' off' : '') + '">' + esc(ovLab) + '</span>' : '') + '</div>' +
      '</div></div>';
    syncTray();
    syncModeBtn();
  }
  /* 模式固定钮：自由态显「分切起步」、分切态显「去摆家具」（高亮） */
  function syncModeBtn() {
    var b = $('hpe-modebtn'); if (!b) return;
    var split = E.uiMode === 'split';
    b.classList.toggle('on', split);
    b.innerHTML = split
      ? '<span class="gic">▸</span><span>' + esc(T('hpe_mode_free')) + '</span>'
      : '<span class="gic">✂</span><span>' + esc(T('hpe_split_tile')) + '</span>';
  }
  /* 进分切态：空层回起始面选路；有房则进入可持续状态——
   * 选中房间时其属性条直接展开露出横/竖切，没选中时属性条位置常驻「点房」指引条。
   * （旧版此处只飘一句 2.6 秒 toast，用户 2026-10-27 实测等于没反应，已废。） */
  function enterSplitMode() {
    if (!E.plan) return;
    var empty = !hasContent();
    if (empty) { E.startPhase = 'pick'; showSheet('start'); return; }
    E.uiMode = 'split';
    E.boxMode = false;
    suppressOverlay();
    if (E.sheet) closeSheet();
    syncModeBtn(); renderTray(); render(); renderAttr();
    if (E.sel && E.sel.kind === 'room') { var sr = roomById(E.sel.id); if (sr) revealRect(sr); }
  }
  function exitSplitMode() {
    E.uiMode = 'free';
    if (E.cut) { cancelCut(); }
    syncModeBtn(); renderAttr();
    toastMsg(T('hpe_go_free_toast'));
  }
  /* 构件库面板：房间预设＋五类构件分组网格；tile 与旧托盘同结构（data-tile/
   * data-key），但手感只走点选待放（libDown/libMove/libUp：干净点按才 arm，
   * 面板竖滚不触发），点选待放后自动收面板、回画布点放 */
  function renderLibPanel() {
    var box = $('hpe-panel'); if (!box) return;
    function catSection(c) {
      var ks = Object.keys(FIX).filter(function (k) { return FIX[k].cat === c; });
      return '<div class="hpe-libcat">' + esc(T('hpe_cat_' + c)) + '</div><div class="hpe-libgrid">' +
        ks.map(function (k) {
          var d = FIX[k];
          return '<div class="hpe-tile2" data-tile="fix" data-key="' + k + '">' +
            (d.sw ? '<span class="hpe-swbdg ' + d.sw + '">' + esc(T('hpe_sw_' + d.sw)) + '</span>' : '') +
            '<svg width="30" height="27" viewBox="0 0 ' + d.box[0] + ' ' + d.box[1] + '" preserveAspectRatio="xMidYMid meet">' +
            '<g stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round">' + d.art + '</g></svg>' +
            '<div class="n">' + esc(T('hpe_fix_' + k)) + '</div><div class="d">' + trimNum(d.w, 2) + '×' + trimNum(d.h, 2) + ' m</div></div>';
        }).join('') + '</div>';
    }
    /* 「墙」为第一分类（置顶于房间预设之前）：画墙是建房第一步，库里也排第一 */
    var h = catSection('wall') +
      '<div class="hpe-libcat">' + esc(T('hpe_tray_rooms')) + '</div><div class="hpe-libgrid">' +
      ROOM_PRESETS.map(function (pr) {
        return '<div class="hpe-tile2" data-tile="room" data-key="' + pr.type + '">' +
          '<svg class="sw" width="34" height="24" viewBox="0 0 34 24"><rect class="hpe-rt-' + pr.type + '" style="stroke:var(--line)" x="0.5" y="0.5" width="33" height="23" rx="5"/></svg>' +
          '<div class="n">' + esc(T('hpe_rt_' + pr.type)) + '</div><div class="d">' + trimNum(pr.w, 1) + '×' + trimNum(pr.h, 1) + ' m</div></div>';
      }).join('') + '</div>';
    FIX_CATS.forEach(function (c) { if (c !== 'wall') h += catSection(c); });
    box.innerHTML = h;
    var hint = $('hpe-hint'); if (hint) hint.innerHTML = esc(T('hpe_lib_hint'));
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
        (k === 'fix' && E.placeType === key) ||
        (k === 'wall' && E.uiMode === 'wall') ||
        (k === 'select' && E.boxMode);
      el.classList.toggle('hot', !!hot);
    });
  }
  function trayDown(e) {
    var el = e.target.closest ? e.target.closest('[data-tile]') : null;
    if (!el) return;
    var kind = el.getAttribute('data-tile');
    if (kind === 'tpl') { if (E.sheet === 'tpl') closeSheet(); else showSheet('tpl'); return; }
    if (kind === 'trace') {
      if (E.stage) cancelStage();
      if (E.sheet === 'trace') closeSheet(); else showSheet('trace');
      return;
    }
    if (kind === 'ovcycle') { cycleOverlay(); return; }
    if (kind === 'select') { if (E.sheet === 'select') closeSheet(); else showSheet('select'); return; }
    if (kind === 'wall') { if (E.uiMode === 'wall') exitWallMode(); else enterWallMode(); return; }
    E.trayDrag = { kind: kind, key: el.getAttribute('data-key'), sx: e.clientX, sy: e.clientY, ghost: null, el: el,
      fromLib: !!(e.target.closest && e.target.closest('#hpe-panel')) };
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
          if (td.fromLib && E.sheet === 'lib') closeSheet();
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
    if (E.arm || E.placeType) suppressOverlay(); /* 待放＝绘制态：盘面叠层先收起 */
    syncTray();
    /* 构件库里点选待放：收起面板回画布，待放条（#hpe-armed）会指明放法 */
    if (td.fromLib && E.sheet === 'lib') closeSheet();
  }

  /* 属性条（房间/构件共用 #hpe-attr）：选中默认只出薄条（不遮画布），
   * 点「编辑」/点薄条/点房名/双击才展开完整面板；换选中自动回薄条。 */
  function renderAttr() {
    var box = $('hpe-attr'); if (!box) return;
    var selKey = E.sel ? E.sel.kind + ':' + E.sel.id : '';
    if (selKey !== E._attrKey) { E._attrKey = selKey; E.attrFull = false; }
    /* 分切态优先：属性条变切条（两侧尺寸＋输数字＋确定/取消），不走薄条 */
    if (E.cut && renderCutBar(box)) { layoutAttr(); return; }
    /* 墙段选中：墙自己的薄/完整条，优先于各模式指引条 */
    if (E.sel && E.sel.kind === 'wall') {
      var wsel0 = wallById(E.sel.id);
      if (!wsel0) { box.innerHTML = ''; layoutAttr(); return; }
      renderWallAttr(box, wsel0);
      layoutAttr();
      return;
    }
    /* 画墙态指引条：划法与成房规则常驻（不学旧版只飘 2.6 秒 toast 的亏） */
    if (E.uiMode === 'wall' && !(E.sel && E.sel.kind === 'room')) {
      box.innerHTML = '<div class="hpe-attr thin"><b>' + esc(T('hpe_wall_tile')) + '</b>' +
        '<span>' + esc(T('hpe_wall_hint')) + '</span>' +
        '<span class="ops"><span class="hpe-op" id="hpe-wall-x">' + esc(T('hpe_wall_done')) + '</span></span></div>';
      var wxb = $('hpe-wall-x');
      if (wxb) wxb.addEventListener('click', exitWallMode);
      layoutAttr();
      return;
    }
    /* 框选模式指引条：计数＋删除所选＋退出常驻（「选择」面板收起时也能收尾） */
    if (E.boxMode) {
      var bn = multiCount();
      box.innerHTML = '<div class="hpe-attr thin"><b>' + esc(T('hpe_boxmode')) + '</b>' +
        '<span>' + esc(TF(T('hpe_sel_count'), bn)) + '</span>' +
        '<span class="ops">' + (bn ? '<span class="hpe-op danger" id="hpe-b-del">' + esc(T('hpe_sel_del')) + '</span>' : '') +
        '<span class="hpe-op" id="hpe-b-x">' + esc(T('hpe_wall_done')) + '</span></span></div>';
      var bd = $('hpe-b-del');
      if (bd) bd.addEventListener('click', function () { deleteMulti(); });
      var bx2 = $('hpe-b-x');
      if (bx2) bx2.addEventListener('click', function () { setBoxMode(false); });
      layoutAttr();
      return;
    }
    /* 分切态未选房：常驻指引条（点房即切），替代旧版只飘 2.6 秒的 toast */
    if (E.uiMode === 'split' && !(E.sel && E.sel.kind === 'room')) {
      box.innerHTML = '<div class="hpe-attr thin"><b>' + esc(T('hpe_split_tile')) + '</b>' +
        '<span>' + esc(T('hpe_cutpick')) + '</span>' +
        '<span class="ops"><span class="hpe-op" id="hpe-split-x">' + esc(T('hd_cancel')) + '</span></span></div>';
      var spx = $('hpe-split-x');
      if (spx) spx.addEventListener('click', exitSplitMode);
      layoutAttr();
      return;
    }
    if (E.sel && E.sel.kind === 'room') {
      var r = roomById(E.sel.id); if (!r) { box.innerHTML = ''; layoutAttr(); return; }
      /* 分切态选房直接展开完整条：横/竖切就在手边，不再多点一层「编辑」 */
      if (E.uiMode === 'split') E.attrFull = true;
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
          deleteRoomCascade(r.id); /* 挂附构件（门窗/家具）随房级联删，不留孤儿 */
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
        deleteRoomCascade(r.id); /* 挂附构件随房级联删（同薄条口径） */
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

  /* ---------------- 画墙（2026-10-27 用户定调「第一步应该是墙」） ----------------
   * 交互：一划成段，松手自动拉直——方向角向 45° 网格吸附（横/竖/斜 45°，
   * 13° 容差内吸正，超出容差的任意斜线原样保留为斜墙）；两端优先吸附到
   * 已有墙端（0.3 m 内，闭合靠它精确同点）；墙与墙首尾相连围成一圈时，
   * 闭合区自动成房（见 tryCloseRoom），未闭合的段就是墙，存 plan.walls。 */
  function wallSnapPt(pt, exclId) {
    var thr = toU(0.3), best = null, bd = thr;
    (E.plan.walls || []).forEach(function (w) {
      if (w.id === exclId) return;
      [[w.x1, w.y1], [w.x2, w.y2]].forEach(function (e) {
        var d = Math.hypot(pt.x - e[0], pt.y - e[1]);
        if (d < bd) { bd = d; best = { x: e[0], y: e[1] }; }
      });
    });
    return best;
  }
  function wallStartPt(raw) {
    var sp = wallSnapPt(raw, null);
    if (sp) return sp;
    if (E.grid) { var s = toU(0.1); return { x: snapVal(raw.x, s), y: snapVal(raw.y, s) }; }
    return { x: raw.x, y: raw.y };
  }
  /* 划线终点：先试端点吸附（闭合优先于方向），再方向角吸附，最后网格取整 */
  function wallStrokeEnd(a, raw, exclId) {
    var sp = wallSnapPt(raw, exclId);
    if (sp) return sp;
    var p = { x: raw.x, y: raw.y };
    var dx = p.x - a.x, dy = p.y - a.y, len = Math.hypot(dx, dy);
    if (len > 1e-9) {
      var ang = Math.atan2(dy, dx), stA = Math.PI / 4, na = Math.round(ang / stA) * stA;
      if (Math.abs(ang - na) < 0.24) {
        p = { x: a.x + Math.cos(na) * len, y: a.y + Math.sin(na) * len };
        if (E.grid) {
          var s2 = toU(0.1);
          if (Math.abs(Math.sin(na)) < 0.01) p.x = snapVal(p.x, s2);
          else if (Math.abs(Math.cos(na)) < 0.01) p.y = snapVal(p.y, s2);
        }
      } else if (E.grid) {
        var s3 = toU(0.1);
        p = { x: snapVal(p.x, s3), y: snapVal(p.y, s3) };
      }
    }
    return p;
  }
  /* 闭合检测：新墙两端若经既有墙图连通（BFS 最短环）、且环为正交简单多边形、
   * 面积 ≥0.5㎡，按水平条带分解成矩形房间；构成环的墙段随之退场——房间
   * 边框即墙面，分切同口径、不留双账。含斜边的环/碎块不成房，墙原样留。 */
  function tryCloseRoom(w0) {
    var walls = E.plan.walls || [];
    function key(x, y) { return Math.round(x * 10000) + ':' + Math.round(y * 10000); }
    var nodePt = {}, adj = {};
    function reg(x, y) { var k = key(x, y); if (!nodePt[k]) nodePt[k] = { x: x, y: y }; return k; }
    walls.forEach(function (w) {
      var ka = reg(w.x1, w.y1), kb = reg(w.x2, w.y2);
      if (w.id === w0.id || ka === kb) return;
      (adj[ka] = adj[ka] || []).push({ to: kb, wid: w.id });
      (adj[kb] = adj[kb] || []).push({ to: ka, wid: w.id });
    });
    var kA = reg(w0.x1, w0.y1), kB = reg(w0.x2, w0.y2), i;
    if (kA === kB || !adj[kB]) return null;
    var prev = {}, seen = {}, queue = [kB];
    seen[kB] = 1; prev[kB] = null;
    while (queue.length) {
      var cur = queue.shift();
      if (cur === kA) break;
      (adj[cur] || []).forEach(function (e) {
        if (!seen[e.to]) { seen[e.to] = 1; prev[e.to] = { from: cur, wid: e.wid }; queue.push(e.to); }
      });
    }
    if (!seen[kA]) return null;
    var pathKeys = [], cycleIds = [w0.id], ck = kA;
    while (ck !== kB) {
      var pvx = prev[ck]; if (!pvx) return null;
      pathKeys.push(ck); cycleIds.push(pvx.wid); ck = pvx.from;
    }
    /* 顶点序：A→B（新墙）→ 沿路径 B→…→A */
    var V = [nodePt[kA], nodePt[kB]];
    for (i = pathKeys.length - 1; i >= 0; i--) {
      if (pathKeys[i] !== kA) V.push(nodePt[pathKeys[i]]);
    }
    if (V.length < 3) return null;
    var vkeys = {};
    for (i = 0; i < V.length; i++) {
      var vk = key(V[i].x, V[i].y);
      if (vkeys[vk]) return null;
      vkeys[vk] = 1;
    }
    var eps = 0.01;
    for (i = 0; i < V.length; i++) {
      var p1 = V[i], p2 = V[(i + 1) % V.length];
      if (Math.abs(p1.x - p2.x) > eps && Math.abs(p1.y - p2.y) > eps) return null;
    }
    var a2 = 0;
    for (i = 0; i < V.length; i++) {
      var q1 = V[i], q2 = V[(i + 1) % V.length];
      a2 += q1.x * q2.y - q2.x * q1.y;
    }
    if (Math.abs(a2) / 2 * mpu() * mpu() < 0.5) return null;
    var ys = [];
    V.forEach(function (p) {
      var y = Math.round(p.y * 10000) / 10000;
      if (ys.indexOf(y) < 0) ys.push(y);
    });
    ys.sort(function (a, b) { return a - b; });
    var rects = [];
    for (var si = 0; si + 1 < ys.length; si++) {
      var ya = ys[si], yb = ys[si + 1], midY = (ya + yb) / 2, xs = [];
      for (i = 0; i < V.length; i++) {
        var e1 = V[i], e2 = V[(i + 1) % V.length];
        if ((e1.y < midY) !== (e2.y < midY)) xs.push(e1.x + (e2.x - e1.x) * (midY - e1.y) / (e2.y - e1.y));
      }
      xs.sort(function (a, b) { return a - b; });
      for (var xi = 0; xi + 1 < xs.length; xi += 2) {
        var rw = xs[xi + 1] - xs[xi];
        if (rw > 0.02) rects.push({ x: xs[xi], y: ya, w: rw, h: yb - ya });
      }
    }
    if (!rects.length) return null;
    for (i = 0; i < rects.length; i++) {
      if (toM(rects[i].w) * toM(rects[i].h) < 0.3) return null;
    }
    E.plan.walls = walls.filter(function (w) { return cycleIds.indexOf(w.id) < 0; });
    var made = rects.map(function (rc) {
      var r = { id: uid(), x: rc.x, y: rc.y, w: rc.w, h: rc.h, name: T('hpe_room_def'), type: 'other' };
      E.plan.rooms.push(r);
      return r;
    });
    made.sort(function (a, b) { return b.w * b.h - a.w * a.h; });
    return made[0];
  }
  function finalizeWallStroke() {
    var pv = E.wallPrev; E.wallPrev = null;
    if (!pv || Math.hypot(pv.x2 - pv.x1, pv.y2 - pv.y1) < toU(0.3)) { render(); return; }
    pushUndo();
    var w = { id: uid(), x1: pv.x1, y1: pv.y1, x2: pv.x2, y2: pv.y2 };
    E.plan.walls.push(w);
    var room = null;
    try { room = tryCloseRoom(w); } catch (e) { room = null; }
    if (room) {
      /* 口径同分切落刀：选中新房＋展开属性条，命名胶囊就在手边 */
      E.sel = { kind: 'room', id: room.id };
      E.attrFull = true; E._attrKey = 'room:' + room.id;
      E.view = null;
    } else {
      E.sel = { kind: 'wall', id: w.id };
    }
    afterChange();
    if (room) toastMsg(T('hpe_wall_room_toast'));
    /* 画完一段自动卸下画墙态：新墙/新房保持选中可立即拖改；要续画点托盘「画墙」
     * 再入（入态后点已有墙端点仍可接续围合）。防「想拖却又生一段」 */
    exitWallMode();
  }
  /* 构件库墙件落位：不进 fixtures，直接生成 plan.walls 段（与手划同账） */
  function placeWallItem(type, pt) {
    pushUndo();
    if (!E.plan.walls) E.plan.walls = [];
    var p = { x: pt.x, y: pt.y };
    if (E.grid) { var st = toU(0.1); p.x = snapVal(p.x, st); p.y = snapVal(p.y, st); }
    var segs = [];
    if (type === 'wallL') {
      var a = toU(1.6);
      segs = [[p.x, p.y, p.x + a, p.y], [p.x, p.y, p.x, p.y + a]];
    } else if (type === 'wallT') {
      var b = toU(1.0), c = toU(1.2);
      segs = [[p.x - b, p.y, p.x + b, p.y], [p.x, p.y, p.x, p.y + c]];
    } else {
      var hl = toU(1.0);
      segs = [[p.x - hl, p.y, p.x + hl, p.y]];
    }
    var first = null;
    segs.forEach(function (sg) {
      var w = { id: uid(), x1: sg[0], y1: sg[1], x2: sg[2], y2: sg[3] };
      E.plan.walls.push(w);
      if (!first) first = w;
    });
    if (first) E.sel = { kind: 'wall', id: first.id };
    /* 墙件同为一次性放置：落位即卸待放、保持选中可直接拖 */
    E.placeType = null; syncTray();
    afterChange();
  }
  function enterWallMode() {
    if (!E.plan) return;
    E.cut = null;
    E.uiMode = 'wall';
    E.sel = null; E.arm = null; E.placeType = null;
    E.boxMode = false;
    suppressOverlay();
    if (E.sheet) closeSheet();
    syncModeBtn(); renderTray(); render(); renderAttr();
  }
  function exitWallMode() {
    E.uiMode = 'free';
    E.wallPrev = null;
    syncModeBtn(); renderTray(); render(); renderAttr();
  }
  /* 墙命中（选中/拖移/拖端点）：画墙态与自由态共用，返回是否已接管本次落点 */
  function beginWallHit(act, actEl, pt, evt) {
    var svg = $('hpe-svg');
    if (act === 'wallh' && E.sel && E.sel.kind === 'wall') {
      var w = wallById(E.sel.id);
      if (!w) return false;
      pushUndo();
      E.drag = { kind: 'wallend', id: w.id, e: +actEl.getAttribute('data-e'), orig: clone(w), moved: false };
      svg.setPointerCapture(evt.pointerId);
      return true;
    }
    if (act === 'wall') {
      var wm = wallById(actEl.getAttribute('data-id'));
      if (!wm) return false;
      E.sel = { kind: 'wall', id: wm.id };
      pushUndo();
      E.drag = { kind: 'wallmove', id: wm.id, start: pt, orig: clone(wm), moved: false };
      svg.setPointerCapture(evt.pointerId);
      render(); renderAttr();
      return true;
    }
    return false;
  }
  /* 墙段属性条：薄条（名＋长＋编辑/删）→ 完整条（输数字定长＋转 90°＋删），口径同构件 */
  function renderWallAttr(box, w) {
    var Lm = wallLenM(w);
    if (!E.attrFull) {
      box.innerHTML = '<div class="hpe-attr thin" id="hpe-a-thin"><b>' + esc(T('hpe_wall_name')) + '</b>' +
        '<span>' + esc(T('hpe_len')) + ' ' + trimNum(Lm, 2) + ' m</span>' +
        '<span class="ops"><span class="hpe-op" id="hpe-a-edit">' + esc(T('hpe_edit')) + '</span>' +
        '<span class="hpe-op danger" id="hpe-w-del">' + esc(T('hpe_del')) + '</span></span></div>';
      $('hpe-a-edit').addEventListener('click', function () { E.attrFull = true; renderAttr(); });
      $('hpe-a-thin').addEventListener('click', function (e) {
        if (e.target.closest && e.target.closest('.hpe-op')) return;
        E.attrFull = true; renderAttr();
      });
      $('hpe-w-del').addEventListener('click', function () {
        pushUndo();
        E.plan.walls = E.plan.walls.filter(function (x) { return x.id !== w.id; });
        E.sel = null; afterChange();
      });
      return;
    }
    box.innerHTML = '<div class="hpe-attr"><div class="t"><b>' + esc(T('hpe_wall_name')) + '</b>' +
      '<span>' + esc(T('hpe_len')) + ' <b>' + trimNum(Lm, 2) + ' m</b></span></div>' +
      '<div class="hpe-attr-form"><label>' + esc(T('hpe_len')) +
      '<input class="hpe-inp sm" id="hpe-w-len" type="number" step="0.1" min="0.3" value="' + trimNum(Lm, 2) + '"></label>' +
      '<span class="hpe-cuthint">' + esc(T('hpe_wall_end_hint')) + '</span></div>' +
      '<div class="ops"><span class="hpe-op" id="hpe-w-rot">' + esc(T('hpe_rotate')) + '</span>' +
      '<span class="hpe-op danger" id="hpe-w-del">' + esc(T('hpe_del')) + '</span></div></div>';
    var ln = $('hpe-w-len');
    if (ln) {
      ln.addEventListener('focus', function () { E.focusSnap = clone(E.plan); });
      ln.addEventListener('change', function () {
        var v = parseFloat(ln.value);
        if (!isFinite(v) || v < 0.3) return;
        if (E.focusSnap) { E.undoStack.push(E.focusSnap); E.focusSnap = null; E.redoStack.length = 0; }
        var ww = wallById(w.id); if (!ww) return;
        var cur = Math.hypot(ww.x2 - ww.x1, ww.y2 - ww.y1);
        if (cur < 1e-9) return;
        var nl = toU(v), ux = (ww.x2 - ww.x1) / cur, uy = (ww.y2 - ww.y1) / cur;
        ww.x2 = ww.x1 + ux * nl; ww.y2 = ww.y1 + uy * nl;
        afterChange();
      });
    }
    $('hpe-w-rot').addEventListener('click', function () {
      pushUndo();
      var ww = wallById(w.id); if (!ww) return;
      var cx = (ww.x1 + ww.x2) / 2, cy = (ww.y1 + ww.y2) / 2;
      var dx = (ww.x2 - ww.x1) / 2, dy = (ww.y2 - ww.y1) / 2;
      ww.x1 = cx + dy; ww.y1 = cy - dx; ww.x2 = cx - dy; ww.y2 = cy + dx;
      afterChange();
    });
    $('hpe-w-del').addEventListener('click', function () {
      pushUndo();
      E.plan.walls = E.plan.walls.filter(function (x) { return x.id !== w.id; });
      E.sel = null; afterChange();
    });
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
    if (E.ai) {
      box.innerHTML = '<div class="hpe-cal"><div class="r"><b>' + esc(T('hpe_ai_running')) + '</b>' +
        '<span>' + esc(T(E.ai.stage === 2 ? 'hpe_ai_stage2' : 'hpe_ai_stage1')) + '</span></div>' +
        '<div class="r" style="margin-top:9px"><span class="hpe-aispin"></span>' +
        '<button class="btn" id="hpe-ai-cancel">' + esc(T('hpe_ai_cancel')) + '</button></div></div>';
      var acb = $('hpe-ai-cancel');
      if (acb) acb.addEventListener('click', cancelAi);
      return;
    }
    if (E.stage) {
      var st = E.stage;
      var fbHtml = E.stageFallback ? '<div class="r" style="margin-bottom:6px"><b>' + esc(T('hpe_ai_fallback')) + '</b></div>' : '';
      if (st.preview) {
        box.innerHTML = '<div class="hpe-cal">' + fbHtml + '<div class="r"><b>' + esc(T('hpe_detect_found_t')) + '</b></div>' +
          '<div class="r" style="margin-top:4px"><span>' + esc(T('hpe_detect_found')) + '</span></div>' +
          '<div class="r" style="margin-top:9px"><button class="btn primary" id="hpe-detect-use">' + esc(T('hpe_detect_use')) + '</button>' +
          '<button class="btn" id="hpe-detect-adjust">' + esc(T('hpe_detect_adjust')) + '</button>' +
          '<button class="btn" id="hpe-stage-cancel">' + esc(T('hpe_cancel')) + '</button></div></div>';
        $('hpe-detect-use').addEventListener('click', function () {
          var pv = E.stage && E.stage.preview; if (!pv) return;
          E.stage.preview = null;
          commitWarp(pv.url, pv.w, pv.h);
        });
        $('hpe-detect-adjust').addEventListener('click', function () {
          if (!E.stage) return;
          E.stage.preview = null; E.stage.view = null; E.stage.detect = 'idle';
          render(); renderTracePanel();
        });
        $('hpe-stage-cancel').addEventListener('click', function () { cancelStage(); });
        return;
      }
      var note = '';
      if (st.detect === 'busy') note = '<div class="r" style="margin-top:6px"><span>' + esc(T('hpe_detecting')) + '</span></div>';
      else if (st.detect === 'miss') note = '<div class="r" style="margin-top:6px"><span>' + esc(T('hpe_detect_miss')) + '</span></div>';
      var errHtml = st.err ? '<div class="r" id="hpe-stage-err" style="margin-top:6px">' + esc(st.err) + '</div>' : '';
      box.innerHTML = '<div class="hpe-cal">' + fbHtml + '<div class="r"><b>' + esc(T('hpe_stage_title')) + '</b><span>' + esc(T('hpe_stage_hint')) + '</span></div>' +
        note + errHtml +
        '<div class="r" style="margin-top:9px"><button class="btn primary" id="hpe-warp"' + (st.busy ? ' disabled' : '') + '>' + esc(st.busy ? T('hpe_warping') : T('hpe_warp')) + '</button>' +
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
        (E.justWarped ? '<div class="r"><b>' + esc(T('hpe_warp_done_t')) + '</b></div>' +
          '<div class="r" style="margin-top:4px"><span>' + esc(T('hpe_warp_ok_hint')) + '</span></div>' : '') +
        '<div class="r"' + (E.justWarped ? ' style="margin-top:9px"' : '') + '><span>' + esc(T('hpe_photo_lab')) + '</span>' +
        '<select class="hpe-inp" id="hpe-photo-sel">' + opts + '</select>' +
        '<button class="btn" id="hpe-photo-up">' + esc(T('hpe_upload')) + '</button>' +
        (cur ? '<button class="btn" id="hpe-photo-recorner">' + esc(T('hpe_recorner')) + '</button>' : '') + '</div>' +
        '<div class="r" style="margin-top:9px"><span>' + esc(T('hpe_calib_lab')) + '</span>' +
        (E.calibArm
          ? '<b>' + esc(TF(T('hpe_calib_armed'), E.calibPts.length)) + '</b><button class="btn" id="hpe-calib-cancel">' + esc(T('hpe_cancel')) + '</button>'
          : '<button class="btn' + (E.justWarped ? ' primary' : '') + '" id="hpe-calib-start">' + esc(T('hpe_calib_start')) + '</button>' +
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
        if (pid) startAiFlow(pid);
      });
      var up = $('hpe-photo-up');
      if (up) up.addEventListener('click', function () { var f = $('hpe-file'); if (f) f.click(); });
      var rc = $('hpe-photo-recorner');
      if (rc) rc.addEventListener('click', function () { if (E.plan.trace) { E.stageFallback = false; startStage(E.plan.trace.photoId, true); } });
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
    E.justWarped = false;
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
        '<input type="range" class="hpe-range grow" id="hpe-ovopacity" min="15" max="100" value="' + Math.round((L.ovOpacity == null ? 0.55 : L.ovOpacity) * 100) + '"></div>' : '') +
      '<p class="hpe-note">' + esc(T('hpe_liji_hint')) + '</p>' +
      '<div class="hpe-lrow"><span>' + esc(T('hpe_clear_floor')) + '</span>' +
      '<span class="note">' + esc(T('hpe_clear_floor_note')) + '</span>' +
      '<span class="hpe-op danger" id="hpe-clearfloor">' + esc(T('hpe_clear_btn')) + '</span></div></div>' +
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
    var cfb = $('hpe-clearfloor');
    if (cfb) cfb.addEventListener('click', function () {
      var fl = E.floors.filter(function (f) { return f.id === E.floorId; })[0];
      dlgConfirm(TF(T('hpe_confirm_clear_floor'), fl ? fl.name : ''), T('hpe_clear_btn')).then(function (ok) {
        if (ok) clearFloorPlan();
      });
    });
    renderMetrics();
  }
  /* 清空本层户型：房间/构件/描图/校准全删（pushUndo 可整层找回），楼层与
   * 档案其他数据（测量/照片/住户）不动；描图照片本体是档案照片、不删，
   * 只解除本层引用。清空后回空层起始面（分切/模板/描图/空白四选）。 */
  function clearFloorPlan() {
    if (!E.plan) return;
    pushUndo();
    E.plan.rooms = []; E.plan.fixtures = []; E.plan.walls = []; E.plan.trace = null;
    E.plan.calibNote = ''; E.plan.mPerUnit = 1; E.plan.liji = null;
    E.sel = null; E.cut = null; E.wallPrev = null; E.view = null; E.traceURL = ''; E.chartCache = null;
    E.multi = null; E.boxMode = false; E.boxRect = null;
    E.calibArm = false; E.calibPts = [];
    E.planDirty = true; /* 直接改字段未走 save：显式标脏，saveNow 才落盘 */
    saveNow();
    E.startPhase = 'pick';
    render(); renderTray();
    showSheet('start');
  }

  /* ---------------- 「选择」键：框选多选＋批量删＋清空收纳 ----------------
   * 用户口径（2026-10-27）：一个键收纳，别散放。框选开时拖动＝拉框，
   * 关时拖动＝平移画布，两者互斥不打架。 */
  function multiCount() {
    var m = E.multi; if (!m) return 0;
    return Object.keys(m.room || {}).length + Object.keys(m.fix || {}).length + Object.keys(m.wall || {}).length;
  }
  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }
  function ptInRect(x, y, rc) { return x >= rc.x && x <= rc.x + rc.w && y >= rc.y && y <= rc.y + rc.h; }
  function segsCross(ax, ay, bx, by, cx, cy, dx, dy) {
    function o(px, py, qx, qy, rx, ry) { var v = (qx - px) * (ry - py) - (qy - py) * (rx - px); return v > 0 ? 1 : v < 0 ? -1 : 0; }
    var o1 = o(ax, ay, bx, by, cx, cy), o2 = o(ax, ay, bx, by, dx, dy);
    var o3 = o(cx, cy, dx, dy, ax, ay), o4 = o(cx, cy, dx, dy, bx, by);
    return o1 !== o2 && o3 !== o4;
  }
  function segHitsRect(w, rc) {
    if (ptInRect(w.x1, w.y1, rc) || ptInRect(w.x2, w.y2, rc)) return true;
    var x0 = rc.x, y0 = rc.y, x1 = rc.x + rc.w, y1 = rc.y + rc.h;
    return segsCross(w.x1, w.y1, w.x2, w.y2, x0, y0, x1, y0) ||
      segsCross(w.x1, w.y1, w.x2, w.y2, x1, y0, x1, y1) ||
      segsCross(w.x1, w.y1, w.x2, w.y2, x1, y1, x0, y1) ||
      segsCross(w.x1, w.y1, w.x2, w.y2, x0, y1, x0, y0);
  }
  function applyBoxSelect(rc) {
    var m = { room: {}, fix: {}, wall: {} };
    if (rc && E.plan) {
      E.plan.rooms.forEach(function (r) { if (rectsOverlap(rc, r)) m.room[r.id] = 1; });
      E.plan.fixtures.forEach(function (f) {
        var d = FIX[f.type]; if (!d) return;
        var fb = { x: f.x - toU(d.w) / 2, y: f.y - toU(d.h) / 2, w: toU(d.w), h: toU(d.h) };
        if (rectsOverlap(rc, fb)) m.fix[f.id] = 1;
      });
      (E.plan.walls || []).forEach(function (w) { if (segHitsRect(w, rc)) m.wall[w.id] = 1; });
    }
    E.multi = m;
  }
  function setBoxMode(on) {
    E.boxMode = !!on;
    E.boxRect = null;
    if (E.boxMode) {
      /* 框选只在自由态：画墙/分切先退场，待放卸下，旧单选清掉，叠层收起 */
      if (E.uiMode === 'wall') { E.uiMode = 'free'; E.wallPrev = null; syncModeBtn(); }
      if (E.uiMode === 'split') { E.uiMode = 'free'; if (E.cut) E.cut = null; syncModeBtn(); }
      E.arm = null; E.placeType = null; E.sel = null;
      suppressOverlay();
    }
    syncTray(); render(); renderAttr();
    if (E.sheet === 'select') renderSelectPanel();
  }
  function renderSelectPanel() {
    var box = $('hpe-selbox'); if (!box) return;
    var n = multiCount();
    box.innerHTML = '<div class="hpe-panel"><div class="hpe-sub" style="margin-bottom:8px">' +
      chip('hpe-boxmode', T('hpe_boxmode'), E.boxMode) +
      '<span class="hpe-saved" id="hpe-saved"></span></div>' +
      '<p class="hpe-note">' + esc(T('hpe_box_hint')) + '</p>' +
      '<div class="hpe-lrow"><span>' + esc(T('hpe_sel_count_lab')) + '</span><b>' + esc(TF(T('hpe_sel_count'), n)) + '</b></div>' +
      '<div class="hpe-lrow"><span>' + esc(T('hpe_sel_del')) + '</span>' +
      '<span class="hpe-op danger' + (n ? '' : ' dim') + '" id="hpe-seldel">' + esc(T('hpe_del')) + '</span></div>' +
      '<div class="hpe-lrow"><span>' + esc(T('hpe_clear_floor')) + '</span>' +
      '<span class="note">' + esc(T('hpe_clear_floor_note')) + '</span>' +
      '<span class="hpe-op danger" id="hpe-selclear">' + esc(T('hpe_clear_btn')) + '</span></div></div>';
    var bm = $('hpe-boxmode');
    if (bm) bm.addEventListener('click', function () { setBoxMode(!E.boxMode); });
    var sd = $('hpe-seldel');
    if (sd) sd.addEventListener('click', function () { if (multiCount()) deleteMulti(); });
    var cf = $('hpe-selclear');
    if (cf) cf.addEventListener('click', function () {
      var fl = E.floors.filter(function (f) { return f.id === E.floorId; })[0];
      dlgConfirm(TF(T('hpe_confirm_clear_floor'), fl ? fl.name : ''), T('hpe_clear_btn')).then(function (ok) {
        if (ok) { clearFloorPlan(); }
      });
    });
  }
  /* 删房级联：构件是自由坐标、无 roomId 归属——中心落在房间矩形外扩 0.45 m
   * （与 wallSnap 贴墙吸附阈同口径）内的构件视为挂附该房（门窗贴墙、家具在房内），
   * 随房一并删除，不留用户清不掉的孤儿残件（水签/门弧） */
  function cascadeFixtures(rects) {
    if (!rects.length || !E.plan) return;
    var mg = toU(0.45);
    E.plan.fixtures = E.plan.fixtures.filter(function (f) {
      for (var i = 0; i < rects.length; i++) {
        var r = rects[i];
        if (f.x >= r.x - mg && f.x <= r.x + r.w + mg && f.y >= r.y - mg && f.y <= r.y + r.h + mg) return false;
      }
      return true;
    });
  }
  function deleteRoomCascade(rid) {
    var r = roomById(rid); if (!r) return;
    var rect = { x: r.x, y: r.y, w: r.w, h: r.h };
    E.plan.rooms = E.plan.rooms.filter(function (x) { return x.id !== rid; });
    cascadeFixtures([rect]);
  }
  function deleteMulti() {
    var m = E.multi; if (!m || !multiCount()) return;
    pushUndo();
    var rects = [];
    E.plan.rooms = E.plan.rooms.filter(function (r) {
      if (m.room[r.id]) { rects.push({ x: r.x, y: r.y, w: r.w, h: r.h }); return false; }
      return true;
    });
    cascadeFixtures(rects);
    E.plan.fixtures = E.plan.fixtures.filter(function (f) { return !m.fix[f.id]; });
    if (E.plan.walls) E.plan.walls = E.plan.walls.filter(function (w) { return !m.wall[w.id]; });
    if (E.sel) {
      var mk = E.sel.kind === 'room' ? 'room' : E.sel.kind === 'fixture' ? 'fix' : 'wall';
      if (m[mk] && m[mk][E.sel.id]) E.sel = null;
    }
    E.multi = null;
    afterChange();
    if (E.sheet === 'select') renderSelectPanel();
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
      if (E.stage.preview || E.stage.busy) return;
      if (act === 'corner') {
        var ci = +actEl.getAttribute('data-i');
        var cpt = E.stage.corners[ci];
        var HhD = 1000 * E.stage.natH / E.stage.natW;
        /* 记抓取偏移：按下点与角心的差，拖动时角不跳到手指正下方被盖住 */
        E.drag = { kind: 'corner', i: ci, dx: cpt.x * 1000 - pt.x, dy: cpt.y * HhD - pt.y, pushed: false };
        E.stage.dragI = ci;
        svg.setPointerCapture(evt.pointerId);
        render();
      } else {
        /* 空白处单指拖动＝平移舞台画面（够不着的角拖进可视带） */
        if (!E.stage.view) E.stage.view = stageFit();
        E.drag = { kind: 'span', sx: evt.clientX, sy: evt.clientY, vx: E.stage.view.x, vy: E.stage.view.y };
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
    /* 框选模式：画布按下即拉框——平移与点选一律让位（模式外拖动才是平移） */
    if (E.boxMode && E.mode !== 'trace') {
      E.drag = { kind: 'box', start: pt };
      E.boxRect = { x: pt.x, y: pt.y, w: 0, h: 0 };
      svg.setPointerCapture(evt.pointerId);
      return;
    }
    /* 画墙态：点墙身走选中/拖移，其余落笔即划墙；
     * 端点手柄在此态是「接续画墙」的起点——刚画完的墙保持选中，从它端点
     * 串下一面墙围成房是主路径，若先被拖端点截走，闭合永远画不出来；
     * 端点改长走自由态拖端点或属性条输数字（两处都在）。
     * 待放构件/房间时不抢（落位分支在下面原样走） */
    if (E.uiMode === 'wall' && E.mode !== 'trace') {
      if (act === 'wallh' && E.sel && E.sel.kind === 'wall') {
        var whc = wallById(E.sel.id);
        if (whc) {
          var hp = +actEl.getAttribute('data-e') === 0
            ? { x: whc.x1, y: whc.y1 } : { x: whc.x2, y: whc.y2 };
          E.drag = { kind: 'walldraw', start: hp };
          E.wallPrev = { x1: hp.x, y1: hp.y, x2: hp.x, y2: hp.y };
          svg.setPointerCapture(evt.pointerId);
          return;
        }
      }
      if (beginWallHit(act, actEl, pt, evt)) return;
      if (!E.placeType && !E.arm) {
        var sp = wallStartPt(pt);
        E.drag = { kind: 'walldraw', start: sp };
        E.wallPrev = { x1: sp.x, y1: sp.y, x2: sp.x, y2: sp.y };
        svg.setPointerCapture(evt.pointerId);
        return;
      }
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
    /* 墙命中（自由态同样可点选/拖移/拖端点，删除走属性条） */
    if (beginWallHit(act, actEl, pt, evt)) return;
    /* 托盘待放·房间（点放兜底）：以点为中心落间，单发（拖放/再点托盘续放） */
    if (E.arm && E.arm.kind === 'room' && act !== 'fixture') {
      placeRoomAt(E.arm.key, pt);
      return;
    }
    /* 托盘待放·构件优先于房间选择（点房间上也要能落件），点中已有构件仍为选中 */
    if (E.placeType && act !== 'fixture') {
      if (FIX[E.placeType] && FIX[E.placeType].wallSeg) { placeWallItem(E.placeType, pt); return; }
      pushUndo();
      var nf2 = { id: uid(), type: E.placeType, x: pt.x, y: pt.y, rot: 0, flip: false };
      wallSnap(nf2, pt);
      E.plan.fixtures.push(nf2);
      E.sel = { kind: 'fixture', id: nf2.id };
      E.placeType = null; syncTray(); /* 一次性放置（同 placeFixAt） */
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
        } else if (E.uiMode === 'split') {
          /* 分切态属性条已自动展开（renderAttr 口径），画布避让让被切房完整入镜 */
          revealRect(rr);
        }
      }
      return;
    }
    /* 空白处 */
    if (E.placeType) {
      if (FIX[E.placeType] && FIX[E.placeType].wallSeg) { placeWallItem(E.placeType, pt); return; }
      pushUndo();
      var nf = { id: uid(), type: E.placeType, x: pt.x, y: pt.y, rot: 0, flip: false };
      wallSnap(nf, pt);
      E.plan.fixtures.push(nf);
      E.sel = { kind: 'fixture', id: nf.id };
      E.placeType = null; syncTray(); /* 一次性放置（同 placeFixAt） */
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
    if (d.kind === 'box') {
      E.boxRect = {
        x: Math.min(d.start.x, pt.x), y: Math.min(d.start.y, pt.y),
        w: Math.abs(pt.x - d.start.x), h: Math.abs(pt.y - d.start.y)
      };
      render();
      return;
    }
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
        x: Math.max(0, Math.min(1, (pt.x + (d.dx || 0)) / 1000)),
        y: Math.max(0, Math.min(1, (pt.y + (d.dy || 0)) / Hh))
      };
      if (st.err) { /* 一动手改角就撤下旧错误，免得误会没改对 */
        st.err = null; st.bad = -1;
        var eb = $('hpe-stage-err'); if (eb) eb.parentNode.removeChild(eb);
      }
      if (st.detect === 'miss') st.detect = 'idle';
      render();
      return;
    }
    if (d.kind === 'span') {
      var svgS = $('hpe-svg'), rcS = svgS ? svgS.getBoundingClientRect() : null;
      if (rcS && rcS.width > 0 && E.stage && E.stage.view) {
        var svv = E.stage.view;
        svv.x = d.vx - (evt.clientX - d.sx) / rcS.width * svv.w;
        svv.y = d.vy - (evt.clientY - d.sy) / rcS.height * (svv.w / stageAspect());
        clampSview(); render();
      }
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
    if (d.kind === 'walldraw') {
      var ep = wallStrokeEnd(d.start, pt, null);
      E.wallPrev = { x1: d.start.x, y1: d.start.y, x2: ep.x, y2: ep.y };
      render();
      return;
    }
    if (d.kind === 'wallend') {
      var wen = wallById(d.id); if (!wen) return;
      var anchor = d.e === 0 ? { x: wen.x2, y: wen.y2 } : { x: wen.x1, y: wen.y1 };
      var npe = wallStrokeEnd(anchor, pt, d.id);
      if (d.e === 0) { wen.x1 = npe.x; wen.y1 = npe.y; } else { wen.x2 = npe.x; wen.y2 = npe.y; }
      d.moved = true;
      render();
      return;
    }
    if (d.kind === 'wallmove') {
      var wmv = wallById(d.id); if (!wmv) return;
      var mdx = pt.x - d.start.x, mdy = pt.y - d.start.y;
      if (E.grid) {
        var stp2 = toU(0.1);
        mdx = snapVal(d.orig.x1 + mdx, stp2) - d.orig.x1;
        mdy = snapVal(d.orig.y1 + mdy, stp2) - d.orig.y1;
      }
      wmv.x1 = d.orig.x1 + mdx; wmv.y1 = d.orig.y1 + mdy;
      wmv.x2 = d.orig.x2 + mdx; wmv.y2 = d.orig.y2 + mdy;
      if (Math.abs(mdx) + Math.abs(mdy) > toU(0.02)) d.moved = true;
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
    /* 墙类拖动先按松手点结算一次：浏览器会合并 pointermove，尾点若被吞，
     * 墙头会停在半路、端点吸附落空（闭合查无此环）——以 up 点为准 */
    if (d.kind === 'walldraw' || d.kind === 'wallend' || d.kind === 'wallmove') onMove(evt);
    E.drag = null;
    if (d.kind === 'box') {
      var brc = E.boxRect; E.boxRect = null;
      /* 几乎没拉动＝点按：清掉多选；拉出实框才按框选 */
      if (brc && toM(brc.w) > 0.15 && toM(brc.h) > 0.15) applyBoxSelect(brc);
      else E.multi = null;
      render(); renderAttr();
      if (E.sheet === 'select') renderSelectPanel();
      return;
    }
    if (d.kind === 'pan') return;
    if (d.kind === 'span') return;
    if (d.kind === 'cutline') { render(); syncCutBar(); return; }
    if (d.kind === 'corner') { if (E.stage) E.stage.dragI = -1; render(); return; }
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
    if (d.kind === 'walldraw') { finalizeWallStroke(); return; }
    if (d.kind === 'wallend' || d.kind === 'wallmove') {
      if (!d.moved) E.undoStack.pop(); /* 纯点选：回滚落点时的预推快照 */
      save(); render(); renderAttr();
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
    /* 手拖立极＝锁定：此后轮廓变化不再自动重算（双击立极点恢复自动） */
    if (d.kind === 'liji' && d.moved) E.plan.lijiLock = true;
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
    } else if (d.kind === 'wallmove' || d.kind === 'wallend') {
      var cw2 = wallById(d.id);
      if (cw2 && d.orig) { cw2.x1 = d.orig.x1; cw2.y1 = d.orig.y1; cw2.x2 = d.orig.x2; cw2.y2 = d.orig.y2; }
      E.undoStack.pop();
    } else if (d.kind === 'walldraw') {
      E.wallPrev = null;
    } else if (d.kind === 'create') {
      E.tempRect = null;
    } else if (d.kind === 'box') {
      E.boxRect = null;
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
  function beginStagePinch() {
    E.drag = null;
    if (E.stage) E.stage.dragI = -1;
    var ps = Object.keys(E.ptrs).map(function (k) { return E.ptrs[k]; });
    var mid = { x: (ps[0].x + ps[1].x) / 2, y: (ps[0].y + ps[1].y) / 2 };
    var d0 = Math.sqrt(Math.pow(ps[0].x - ps[1].x, 2) + Math.pow(ps[0].y - ps[1].y, 2)) || 1;
    if (!E.stage.view) E.stage.view = stageFit();
    E.spinch = { d0: d0, w0: E.stage.view.w, anchor: clientToStage(mid.x, mid.y) };
  }
  function ptDown(evt) {
    if (!E.ptrs) E.ptrs = {};
    E.ptrs[evt.pointerId] = { x: evt.clientX, y: evt.clientY };
    var n = Object.keys(E.ptrs).length;
    if (n === 2) {
      if (E.stage && !E.stage.preview && !E.stage.busy) { beginStagePinch(); return; }
      if (!E.stage) { beginPinch(); return; }
    }
    if (n > 1) return; /* 其余指忽略 */
    E.dragPtr = evt.pointerId;
    onDown(evt);
  }
  function ptMove(evt) {
    if (E.ptrs && E.ptrs[evt.pointerId]) { E.ptrs[evt.pointerId].x = evt.clientX; E.ptrs[evt.pointerId].y = evt.clientY; }
    if (E.spinch) {
      var sps = Object.keys(E.ptrs).map(function (k) { return E.ptrs[k]; });
      if (sps.length >= 2 && E.stage && E.stage.view) {
        var ssvg = $('hpe-svg'), src = ssvg.getBoundingClientRect();
        if (src.width > 0) {
          var sd = Math.sqrt(Math.pow(sps[0].x - sps[1].x, 2) + Math.pow(sps[0].y - sps[1].y, 2)) || 1;
          var smid = { x: (sps[0].x + sps[1].x) / 2, y: (sps[0].y + sps[1].y) / 2 };
          var sv = E.stage.view;
          sv.w = E.spinch.w0 * E.spinch.d0 / sd;
          sv.x = E.spinch.anchor.x - (smid.x - src.left) / src.width * sv.w;
          sv.y = E.spinch.anchor.y - (smid.y - src.top) / src.height * (sv.w / stageAspect());
          clampSview(); render();
        }
      }
      return;
    }
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
    if (E.spinch) {
      if (!E.ptrs || Object.keys(E.ptrs).length < 2) E.spinch = null;
      return;
    }
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
          corners: corners || [{ x: 0.06, y: 0.06 }, { x: 0.94, y: 0.06 }, { x: 0.94, y: 0.94 }, { x: 0.06, y: 0.94 }],
          view: null, dragI: -1, err: null, bad: -1, busy: false,
          preview: null, detect: 'idle'
        };
        E.spinch = null;
        E.justWarped = false;
        render(); renderTracePanel();
        /* 新照片（非重调旧角）先自动找外框：命中直接出拉正预览，漏检回落手动四角 */
        if (!keepCorners) runDetect();
      });
    }).catch(function () { toastMsg(T('hpe_photo_fail')); });
  }
  function cancelStage() {
    if (E.stage && E.stage.url) URL.revokeObjectURL(E.stage.url);
    E.stage = null;
    E.stageFallback = false;
    E.spinch = null;
    render(); renderTracePanel();
  }

  /* ---------------- 自动找外框（上传后先扫一遍，宁漏检不误检） ----------------
   * 缩小副本（长边 480）→ 灰度 → Otsu 取亮区（纸面/屏幕通常是画面里的大亮块）
   * → 最大连通域 → 凸包 → 逐点削角逼到四边形 → 面积/内角/四边梯度支持三重校验，
   * 任一不过即判漏检、回落手动四角。命中后自动拉正出预览，用户确认或再调角。 */
  function convexHull(pts) {
    pts = pts.slice().sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    if (pts.length < 3) return pts;
    function cross(o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }
    var lo = [], hi = [], i, t;
    for (i = 0; i < pts.length; i++) {
      while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], pts[i]) <= 0) lo.pop();
      lo.push(pts[i]);
    }
    for (i = pts.length - 1; i >= 0; i--) {
      while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], pts[i]) <= 0) hi.pop();
      hi.push(pts[i]);
    }
    lo.pop(); hi.pop();
    return lo.concat(hi);
  }
  function approxQuad(hull) {
    /* 迭代削掉「三角面积最小」的顶点，削到剩 4 个——近矩形凸包上稳且快 */
    var ring = hull.slice();
    function triArea(a, b, c) { return Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2; }
    var guard = 0;
    while (ring.length > 4 && guard++ < 400) {
      var bi = -1, ba = Infinity;
      for (var i = 0; i < ring.length; i++) {
        var ar = triArea(ring[(i + ring.length - 1) % ring.length], ring[i], ring[(i + 1) % ring.length]);
        if (ar < ba) { ba = ar; bi = i; }
      }
      ring.splice(bi, 1);
    }
    return ring.length === 4 ? ring : null;
  }
  function orderQuad(q) {
    var cx = (q[0].x + q[1].x + q[2].x + q[3].x) / 4, cy = (q[0].y + q[1].y + q[2].y + q[3].y) / 4;
    var tl = null, tr = null, br = null, bl = null;
    q.forEach(function (p) {
      if (p.x <= cx && p.y <= cy) tl = p; else if (p.x > cx && p.y <= cy) tr = p;
      else if (p.x > cx && p.y > cy) br = p; else bl = p;
    });
    if (!tl || !tr || !br || !bl) return null;
    return [tl, tr, br, bl];
  }
  function detectFrame(img) {
    return new Promise(function (res) {
      try {
        var iw = img.naturalWidth, ih = img.naturalHeight;
        var sc = Math.min(1, 480 / Math.max(iw, ih));
        var w = Math.max(2, Math.round(iw * sc)), h = Math.max(2, Math.round(ih * sc));
        var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        var ctx = cv.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, w, h);
        var data = ctx.getImageData(0, 0, w, h).data;
        var total = w * h, gray = new Float32Array(total), i;
        for (i = 0; i < total; i++) gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
        var hist = new Array(256).fill(0);
        for (i = 0; i < total; i++) hist[Math.max(0, Math.min(255, gray[i] | 0))]++;
        var sum = 0; for (i = 0; i < 256; i++) sum += i * hist[i];
        var sumB = 0, wB = 0, maxVar = 0, thr = 127;
        for (i = 0; i < 256; i++) {
          wB += hist[i]; if (!wB) continue;
          var wF = total - wB; if (!wF) break;
          sumB += i * hist[i];
          var dM = sumB / wB - (sum - sumB) / wF;
          var between = wB * wF * dM * dM;
          if (between > maxVar) { maxVar = between; thr = i; }
        }
        /* 单个阈值走完全程：掩膜→最大连通域→凸包→四边形→三重校验，全过才返回四角。
         * 背景是渐变墙面时 Otsu 阈值会把墙面亮部与纸面连成一片（凸包顶边跑到画面边、
         * 被边支持校验毙掉）；故再逐级抬高阈值重试——纸面通常比环境更亮、抬高后能
         * 干净分离。每级关卡一字不松，宁漏检不误检。 */
        function tryThr(th) {
          var bright = new Uint8Array(total), nb = 0, i2;
          for (i2 = 0; i2 < total; i2++) { bright[i2] = gray[i2] > th ? 1 : 0; nb += bright[i2]; }
          var frac = nb / total;
          if (frac < 0.08 || frac > 0.92) return null;
          var label = new Int32Array(total).fill(-1);
          var bestLab = -1, bestSize = 0, cur = 0, stack = [];
          for (var s0 = 0; s0 < total; s0++) {
            if (!bright[s0] || label[s0] >= 0) continue;
            var size = 0; stack.length = 0; stack.push(s0); label[s0] = cur;
            while (stack.length) {
              var p = stack.pop(); size++;
              var px = p % w, py = (p / w) | 0;
              if (px > 0 && bright[p - 1] && label[p - 1] < 0) { label[p - 1] = cur; stack.push(p - 1); }
              if (px < w - 1 && bright[p + 1] && label[p + 1] < 0) { label[p + 1] = cur; stack.push(p + 1); }
              if (py > 0 && bright[p - w] && label[p - w] < 0) { label[p - w] = cur; stack.push(p - w); }
              if (py < h - 1 && bright[p + w] && label[p + w] < 0) { label[p + w] = cur; stack.push(p + w); }
            }
            if (size > bestSize) { bestSize = size; bestLab = cur; }
            cur++;
          }
          if (bestLab < 0 || bestSize / total < 0.15) return null;
          var bpts = [];
          for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
            var idx = y * w + x;
            if (label[idx] !== bestLab) continue;
            if (x === 0 || y === 0 || x === w - 1 || y === h - 1 || label[idx - 1] !== bestLab || label[idx + 1] !== bestLab || label[idx - w] !== bestLab || label[idx + w] !== bestLab) bpts.push([x, y]);
          }
          var quad = approxQuad(convexHull(bpts));
          if (!quad) return null;
          var q = orderQuad(quad.map(function (p) { return { x: p[0] / w, y: p[1] / h }; }));
          if (!q) return null;
          /* 校验一：面积 ≥ 画面 18% */
          var a2 = 0, k;
          for (k = 0; k < 4; k++) { var pa = q[k], pb = q[(k + 1) % 4]; a2 += pa.x * pb.y - pb.x * pa.y; }
          if (Math.abs(a2) / 2 < 0.18) return null;
          /* 校验二：内角 50°–130°（像素空间计角，免归一化拉伸误判） */
          for (k = 0; k < 4; k++) {
            var p0 = q[(k + 3) % 4], p1 = q[k], p2 = q[(k + 1) % 4];
            var v1x = (p0.x - p1.x) * w, v1y = (p0.y - p1.y) * h, v2x = (p2.x - p1.x) * w, v2y = (p2.y - p1.y) * h;
            var cos = (v1x * v2x + v1y * v2y) / (Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y) || 1);
            var ang = Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
            if (ang < 50 || ang > 130) return null;
          }
          /* 校验三：四边梯度支持——沿每边取样，两侧亮度差够大才算这条边是真的 */
          function gAt(gx, gy) {
            gx = Math.max(0, Math.min(w - 1, Math.round(gx))); gy = Math.max(0, Math.min(h - 1, Math.round(gy)));
            return gray[gy * w + gx];
          }
          var edgesOk = 0, supSum = 0;
          for (k = 0; k < 4; k++) {
            var e0 = q[k], e1 = q[(k + 1) % 4];
            var ex = (e1.x - e0.x) * w, ey = (e1.y - e0.y) * h, el = Math.hypot(ex, ey) || 1;
            var nx = -ey / el, ny = ex / el, sup = 0, smp = 20;
            for (var sI = 0; sI < smp; sI++) {
              var t = 0.08 + 0.84 * sI / (smp - 1);
              var sx = (e0.x + (e1.x - e0.x) * t) * w, sy = (e0.y + (e1.y - e0.y) * t) * h;
              if (Math.abs(gAt(sx + nx * 2.5, sy + ny * 2.5) - gAt(sx - nx * 2.5, sy - ny * 2.5)) >= 20) sup++;
            }
            supSum += sup / smp;
            if (sup / smp >= 0.5) edgesOk++;
          }
          if (edgesOk < 3 || supSum / 4 < 0.55) return null;
          return q;
        }
        var ths = [thr, thr + 24, thr + 48].filter(function (t, ix, arr) { return t <= 250 && arr.indexOf(t) === ix; });
        for (var ti = 0; ti < ths.length; ti++) {
          var got = tryThr(ths[ti]);
          if (got) { res(got); return; }
        }
        res(null);
      } catch (e) { res(null); }
    });
  }
  function runDetect() {
    var st = E.stage; if (!st) return;
    st.detect = 'busy';
    renderTracePanel();
    /* 让「正在自动找外框」先画出来，检测在下一帧跑（480px 副本，约百毫秒级） */
    requestAnimationFrame(function () {
      setTimeout(function () {
        if (E.stage !== st) return;
        detectFrame(st.img).then(function (q) {
          if (E.stage !== st) return;
          if (!q) { st.detect = 'miss'; renderTracePanel(); return; }
          st.corners = q;
          st.detect = 'hit';
          var prob = quadProblem(st);
          if (prob) { st.detect = 'miss'; render(); renderTracePanel(); return; }
          st.busy = true;
          renderTracePanel();
          requestAnimationFrame(function () {
            setTimeout(function () {
              if (E.stage !== st) return;
              try {
                var sz = warpOutSize(st);
                var url = warpImage(st.img, st.corners, sz.w, sz.h);
                st.busy = false;
                st.preview = { url: url, w: sz.w, h: sz.h };
              } catch (e) {
                st.busy = false;
                st.preview = null;
              }
              render(); renderTracePanel();
            }, 30);
          });
        });
      }, 30);
    });
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
      /* 只画源三角的外接矩形（9 参同位绘制，与整图绘制在覆盖区逐像素等价）：
       * 旧版每三角整图重绘 800 次，真机上同步阻塞数秒、点「拉正」像没反应 */
      var bx = Math.max(0, Math.floor(Math.min(x0, x1, x2)) - 1), by = Math.max(0, Math.floor(Math.min(y0, y1, y2)) - 1);
      var bw = Math.min(img.naturalWidth - bx, Math.ceil(Math.max(x0, x1, x2)) + 1 - bx);
      var bh = Math.min(img.naturalHeight - by, Math.ceil(Math.max(y0, y1, y2)) + 1 - by);
      if (bw > 0 && bh > 0) ctx.drawImage(img, bx, by, bw, bh, bx, by, bw, bh);
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
  /* 四角合理性校验：旧版零校验——自交/重合的框也「拉正成功」落盘成废图，
   * 用户只看到点了没动静。返回 null＝合格；否则 {msg, i}（i＝出问题的角，-1＝整体）。 */
  function quadProblem(st) {
    var cs = st.corners, Hh = 1000 * st.natH / st.natW;
    var P = cs.map(function (c) { return { x: c.x * 1000, y: c.y * Hh }; });
    var names = [T('hpe_corner_tl'), T('hpe_corner_tr'), T('hpe_corner_br'), T('hpe_corner_bl')];
    function d2(a, b) { return Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2); }
    var minD = 0.035 * Math.min(1000, Hh); /* 相邻/相对角至少拉开短边 3.5% */
    for (var i = 0; i < 4; i++) for (var j = i + 1; j < 4; j++) {
      if (d2(P[i], P[j]) < minD * minD) return { msg: TF(T('hpe_warp_err_close'), names[i]), i: i };
    }
    var area2 = 0;
    for (i = 0; i < 4; i++) { var a = P[i], b = P[(i + 1) % 4]; area2 += a.x * b.y - b.x * a.y; }
    if (Math.abs(area2) / 2 < 0.02 * 1000 * Hh) return { msg: T('hpe_warp_err_small'), i: -1 };
    function cross(o, p, q) { return (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x); }
    function segInt(p1, p2, p3, p4) {
      var d1 = cross(p3, p4, p1), d2 = cross(p3, p4, p2), d3 = cross(p1, p2, p3), d4 = cross(p1, p2, p4);
      return d1 !== 0 && d2 !== 0 && d3 !== 0 && d4 !== 0 && ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
    }
    /* 对边相交（打叉）或绕序反转（对角互换，面积变号）都算框打叉 */
    if (area2 <= 0 || segInt(P[0], P[1], P[2], P[3]) || segInt(P[1], P[2], P[3], P[0])) {
      return { msg: T('hpe_warp_err_cross'), i: -1 };
    }
    var sgn = [];
    for (i = 0; i < 4; i++) {
      var e1 = { x: P[(i + 1) % 4].x - P[i].x, y: P[(i + 1) % 4].y - P[i].y };
      var e2 = { x: P[(i + 2) % 4].x - P[(i + 1) % 4].x, y: P[(i + 2) % 4].y - P[(i + 1) % 4].y };
      sgn.push(Math.sign(e1.x * e2.y - e1.y * e2.x));
    }
    var pos = sgn.filter(function (s) { return s > 0; }).length;
    if (pos !== 0 && pos !== 4) {
      var badV = sgn.indexOf(pos >= 2 ? -1 : 1);
      return { msg: TF(T('hpe_warp_err_concave'), names[(badV + 1) % 4]), i: (badV + 1) % 4 };
    }
    return null;
  }
  function warpOutSize(st) {
    var cs = st.corners;
    function elen(a, b) { return Math.sqrt(Math.pow((a.x - b.x) * st.natW, 2) + Math.pow((a.y - b.y) * st.natH, 2)); }
    var topLen = (elen(cs[0], cs[1]) + elen(cs[3], cs[2])) / 2;
    var sideLen = (elen(cs[0], cs[3]) + elen(cs[1], cs[2])) / 2;
    var outW = 1100, outH = Math.max(300, Math.min(1600, Math.round(outW * sideLen / Math.max(1, topLen))));
    return { w: outW, h: outH };
  }
  /* 拉正结果落盘（手动拉正与自动预览确认共用）：清舞台、回画布自动 fit、校准步推到台前 */
  function commitWarp(url, outW, outH) {
    var st = E.stage; if (!st) return;
    var cs = st.corners;
    pushUndo();
    var rect = (E.plan.trace && E.plan.trace.rect) ? E.plan.trace.rect
      : { x: 0, y: 0, w: 10, h: Math.round(10 * outH / outW * 10) / 10 };
    E.plan.trace = {
      photoId: st.photoId, corners: clone(cs), rect: rect,
      opacity: E.plan.trace && E.plan.trace.opacity != null ? E.plan.trace.opacity : 0.62
    };
    E.traceURL = url;
    if (st.url) URL.revokeObjectURL(st.url);
    E.stage = null; E.stageFallback = false; E.spinch = null; E.view = null;
    E.plan.layers.traceBg = true;
    E.justWarped = true;
    afterChange();
    renderTracePanel();
    toastMsg(T('hpe_warped'));
  }
  function doWarp() {
    var st = E.stage; if (!st || st.busy || st.preview) return;
    var prob = quadProblem(st);
    if (prob) {
      st.err = prob.msg; st.bad = prob.i;
      render(); renderTracePanel();
      return;
    }
    st.err = null; st.bad = -1; st.busy = true;
    renderTracePanel();
    /* 先让「正在拉正…」画出来再跑重活，避免同步阻塞下点了像没反应 */
    requestAnimationFrame(function () {
      setTimeout(function () {
        if (E.stage !== st) return;
        try {
          var sz = warpOutSize(st);
          var url = warpImage(st.img, st.corners, sz.w, sz.h);
          st.busy = false;
          commitWarp(url, sz.w, sz.h);
        } catch (e) {
          st.busy = false;
          st.err = T('hpe_warp_err_fail');
          render(); renderTracePanel();
        }
      }, 30);
    });
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

  /* ---------------- 照片建房 · AI 自动流（2026-10-27 用户定调：上传后由 AI 自动出草稿，
   * 手动四角只作识别完全失败的兜底，不再是默认步骤） ----------------
   * 链路：隐私一次说明 → POST /api/plan/locate 在整图里定位户型图 → 前端裁图放大 →
   * POST /api/plan/recognize 识别 → applyAiDraft 落草稿（底图按 AI 四角自动拉正、
   * 房间/门窗/洁具转编辑器对象、低置信项 aiq 虚线＋问号签、比例按读数或用户实测宽标定）。
   * 任一步失败 → aiFallback：toast 交代 + 进手动舞台并挂「自动识别没成功，手动对齐」签。
   * 后端：pay.shengboyu.ca src/planai.js（Qwen3-VL-30B，服务端做归一化与假尺寸守卫）。 */
  var AI_API = 'https://pay.shengboyu.ca';
  function aiConsent() {
    var ok = false;
    try { ok = localStorage.getItem('wuri_ai_plan_ok') === '1'; } catch (e) {}
    if (ok) return Promise.resolve(true);
    return dlgConfirm(T('hpe_ai_consent'), T('hpe_ai_consent_ok')).then(function (yes) {
      if (yes) { try { localStorage.setItem('wuri_ai_plan_ok', '1'); } catch (e) {} }
      return yes;
    });
  }
  function dlgPromptText(title) {
    if (window.__wuriDlg && __wuriDlg.prompt) return __wuriDlg.prompt(title, '', T('hpe_calib_ok'));
    return Promise.resolve(null);
  }
  function blobToB64(blob) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { res(String(fr.result).replace(/^data:[^,]*,/, '')); };
      fr.onerror = function () { rej(new Error('read')); };
      fr.readAsDataURL(blob);
    });
  }
  function cropToB64(img, box) {
    var iw = img.naturalWidth, ih = img.naturalHeight;
    var cw = Math.max(2, Math.round((box.x1 - box.x0) * iw)), ch = Math.max(2, Math.round((box.y1 - box.y0) * ih));
    var sc = Math.min(1, 1600 / Math.max(cw, ch));
    var cv = document.createElement('canvas');
    cv.width = Math.round(cw * sc); cv.height = Math.round(ch * sc);
    cv.getContext('2d').drawImage(img, box.x0 * iw, box.y0 * ih, cw, ch, 0, 0, cv.width, cv.height);
    return cv.toDataURL('image/jpeg', 0.85).replace(/^data:[^,]*,/, '');
  }
  function aiPost(path, b64, ac) {
    return fetch(AI_API + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: b64 }),
      signal: ac ? ac.signal : undefined
    }).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (j) {
        if (j) return j;
        throw { code: r.status === 429 ? 'rate' : 'ai_fail' };
      });
    }).catch(function (e) {
      if (e && e.code) throw e;
      if (e && e.name === 'AbortError') throw { code: 'abort' };
      throw { code: 'ai_fail' };
    });
  }
  function startAiFlow(photoId) {
    if (E.ai || E.stage) return;
    aiConsent().then(function (ok) {
      if (!ok) { startStage(photoId); return; }
      runAiFlow(photoId);
    });
  }
  function cancelAi() {
    if (E.ai && E.ai.ac) { try { E.ai.ac.abort(); } catch (e) {} }
    E.ai = null;
    renderTracePanel();
  }
  function aiFallback(photoId, code) {
    var key = code === 'not_found' ? 'hpe_ai_fail_find'
      : code === 'rate' ? 'hpe_ai_fail_rate'
      : code === 'bad_image' ? 'hpe_photo_fail' : 'hpe_ai_fail_net';
    toastMsg(T(key));
    E.stageFallback = true;
    startStage(photoId);
  }
  function runAiFlow(photoId) {
    var ac = ('AbortController' in window) ? new AbortController() : null;
    E.ai = { photoId: photoId, stage: 1, ac: ac };
    renderTracePanel();
    var photo = null, loaded = null;
    db.photos.get(photoId).then(function (p) {
      photo = p;
      if (!p) throw { code: 'bad_image' };
      return loadPhotoImg(p);
    }).then(function (r) {
      loaded = r;
      if (!E.ai) throw { code: 'abort' };
      return blobToB64(photo.blob).then(function (b64) { return aiPost('/api/plan/locate', b64, ac); });
    }).then(function (loc) {
      if (!E.ai) throw { code: 'abort' };
      if (!loc) throw { code: 'ai_fail' };
      if (!loc.ok) throw { code: loc.code || 'ai_fail' };
      if (!loc.bbox) throw { code: 'not_found' };
      var bb = loc.bbox;
      var x0 = bb[0] / 1000, y0 = bb[1] / 1000, x1 = bb[2] / 1000, y1 = bb[3] / 1000;
      var mx = (x1 - x0) * 0.07, my = (y1 - y0) * 0.07;
      var box = {
        x0: Math.max(0, x0 - mx), y0: Math.max(0, y0 - my),
        x1: Math.min(1, x1 + mx), y1: Math.min(1, y1 + my)
      };
      E.ai.stage = 2;
      renderTracePanel();
      return aiPost('/api/plan/recognize', cropToB64(loaded.img, box), ac).then(function (rec) {
        return { rec: rec, box: box };
      });
    }).then(function (out) {
      if (!E.ai) throw { code: 'abort' };
      var rec = out.rec;
      if (!rec) throw { code: 'ai_fail' };
      if (!rec.ok || !rec.result) throw { code: rec.code || 'ai_fail' };
      var fr = rec.result.frame, box = out.box;
      function conv(p) {
        return { x: box.x0 + p[0] / 1000 * (box.x1 - box.x0), y: box.y0 + p[1] / 1000 * (box.y1 - box.y0) };
      }
      var corners = [conv(fr.tl), conv(fr.tr), conv(fr.br), conv(fr.bl)];
      var keep = { img: loaded.img, url: loaded.url };
      E.ai = null;
      return applyAiDraft(photoId, keep, corners, rec.result).then(function () {
        URL.revokeObjectURL(keep.url);
      });
    }).catch(function (e) {
      if (loaded && loaded.url) URL.revokeObjectURL(loaded.url);
      var code = e && e.code;
      if (code === 'abort' || !E.ai) { E.ai = null; renderTracePanel(); return; }
      E.ai = null;
      aiFallback(photoId, code || 'ai_fail');
    });
  }
  /* 正交多边形 → 矩形分解（AI 非矩形房间轮廓）：按顶点坐标栅格化逐行并段。
   * 含斜边/过碎时返回 []，调用方回落外接矩形。 */
  function orthoSplit(poly) {
    var xs = {}, ys = {}, i;
    for (i = 0; i < poly.length; i++) {
      xs[Math.round(poly[i][0] * 20) / 20] = 1;
      ys[Math.round(poly[i][1] * 20) / 20] = 1;
    }
    var X = Object.keys(xs).map(Number).sort(function (a, b) { return a - b; });
    var Y = Object.keys(ys).map(Number).sort(function (a, b) { return a - b; });
    if (X.length < 2 || Y.length < 2 || X.length > 14 || Y.length > 14) return [];
    function inside(cx, cy) {
      var c = false;
      for (var a = 0, b = poly.length - 1; a < poly.length; b = a++) {
        var xa = poly[a][0], ya = poly[a][1], xb = poly[b][0], yb = poly[b][1];
        if ((ya > cy) !== (yb > cy) && cx < (xb - xa) * (cy - ya) / (yb - ya) + xa) c = !c;
      }
      return c;
    }
    var out = [];
    for (var r = 0; r < Y.length - 1; r++) {
      var run = null;
      for (var ci = 0; ci < X.length - 1; ci++) {
        if (inside((X[ci] + X[ci + 1]) / 2, (Y[r] + Y[r + 1]) / 2)) {
          if (!run) run = { x: X[ci], y: Y[r], w: 0, h: Y[r + 1] - Y[r] };
          run.w = X[ci + 1] - run.x;
        } else if (run) { out.push(run); run = null; }
      }
      if (run) out.push(run);
    }
    return out.filter(function (q) { return q.w >= 0.3 && q.h >= 0.3; });
  }
  /* AI 结果（平面坐标 0-1000）→ 编辑器房间/构件（计划单位，0.05 吸附） */
  function buildAiRooms(res, RW, RH) {
    var rooms = [], fixtures = [], nQ = 0;
    function snapU(x) { return Math.round(x * 20) / 20; }
    function px(v) { return snapU(v / 1000 * RW); }
    function py(v) { return snapU(v / 1000 * RH); }
    (res.rooms || []).forEach(function (rm) {
      var parts = [];
      if (rm.poly && rm.poly.length >= 4) {
        parts = orthoSplit(rm.poly.map(function (p) { return [p[0] / 1000 * RW, p[1] / 1000 * RH]; }));
      }
      if (!parts.length) {
        var r = rm.rect;
        parts = [{ x: px(r[0]), y: py(r[1]), w: Math.max(0, px(r[2]) - px(r[0])), h: Math.max(0, py(r[3]) - py(r[1])) }];
      }
      var low = rm.confidence === 'low';
      parts.forEach(function (pt, ix) {
        if (pt.w < 0.3 || pt.h < 0.3) return;
        rooms.push({
          id: uid(), x: pt.x, y: pt.y, w: pt.w, h: pt.h,
          name: rm.name || T('hpe_room_def'),
          type: ROOM_TYPES.indexOf(rm.type) >= 0 ? rm.type : 'other',
          aiq: low ? 1 : 0
        });
        if (low && ix === 0) nQ++;
      });
    });
    /* 门窗：线段中点落位、主方向定朝向（构件尺寸用库内默认，线段长仅作参考） */
    var OKIND = { door: 'door', sliding_door: 'sdoor', double_door: 'ddoor', window: 'window' };
    (res.openings || []).forEach(function (o) {
      var t = OKIND[o.kind]; if (!t) return;
      var s = o.segment;
      var x0 = s[0] / 1000 * RW, y0 = s[1] / 1000 * RH, x1 = s[2] / 1000 * RW, y1 = s[3] / 1000 * RH;
      var low = o.confidence === 'low';
      fixtures.push({
        id: uid(), type: t, x: snapU((x0 + x1) / 2), y: snapU((y0 + y1) / 2),
        rot: Math.abs(x1 - x0) >= Math.abs(y1 - y0) ? 0 : 90, flip: false, aiq: low ? 1 : 0
      });
      if (low) nQ++;
    });
    /* 洁具/厨电：rect 中心落件（尺寸走构件库默认） */
    (res.fixtures || []).forEach(function (f) {
      if (!FIX[f.kind]) return;
      var r = f.rect, low = f.confidence === 'low';
      fixtures.push({
        id: uid(), type: f.kind, x: snapU((r[0] + r[2]) / 2000 * RW), y: snapU((r[1] + r[3]) / 2000 * RH),
        rot: 0, flip: false, aiq: low ? 1 : 0
      });
      if (low) nQ++;
    });
    return { rooms: rooms, fixtures: fixtures, nQ: nQ };
  }
  /* AI 草稿落地：底图 warp（四角复用手动链的校验/尺寸口径）＋房间构件＋比例标定 */
  function applyAiDraft(photoId, keep, corners, res) {
    var img = keep.img;
    var fakeSt = { photoId: photoId, img: img, natW: img.naturalWidth, natH: img.naturalHeight, corners: corners };
    var warped = null;
    if (!quadProblem(fakeSt)) {
      try {
        var sz = warpOutSize(fakeSt);
        warped = { url: warpImage(img, corners, sz.w, sz.h), w: sz.w, h: sz.h };
      } catch (e) { warped = null; }
    }
    function proceed(replace) {
      pushUndo();
      var oldTrace = E.plan.trace;
      if (warped) {
        var rect = (oldTrace && oldTrace.photoId === photoId && oldTrace.rect) ? oldTrace.rect
          : { x: 0, y: 0, w: 10, h: Math.round(10 * warped.h / warped.w * 10) / 10 };
        E.plan.trace = {
          photoId: photoId, corners: clone(corners), rect: rect,
          opacity: oldTrace && oldTrace.opacity != null ? oldTrace.opacity : 0.62
        };
        E.traceURL = warped.url;
        E.plan.layers.traceBg = true;
      }
      var tr = E.plan.trace;
      var RW = tr && tr.rect ? tr.rect.w : 10, RH = tr && tr.rect ? tr.rect.h : 10;
      /* 比例标定：总宽读数优先；只有总面积时按底图长宽比反推宽。
       * 服务端已滤无原文的假读数；此处标定说明写进 calibNote 请用户核对。 */
      var hasScale = false;
      if (res.scale && (res.scale.overall_width_m || res.scale.total_area_m2)) {
        var wM = res.scale.overall_width_m || Math.sqrt(res.scale.total_area_m2 * RW / RH);
        if (wM > 0) {
          E.plan.mPerUnit = wM / RW;
          E.plan.calibNote = trimNum(wM, 2) + ' m';
          hasScale = true;
          setTimeout(function () {
            toastMsg(TF(T('hpe_ai_scale_note'), res.scale.quote || res.scale.basis || ''));
          }, 2900);
        }
      }
      var built = null;
      if (replace) {
        built = buildAiRooms(res, RW, RH);
        E.plan.rooms = built.rooms;
        E.plan.fixtures = built.fixtures;
        E.plan.liji = null; E.plan.lijiLock = false;
      }
      E.view = null; E.sel = null; E.justWarped = false; E.stageFallback = false;
      afterChange();
      renderTracePanel();
      if (!built) { toastMsg(T('hpe_warped')); return Promise.resolve(); }
      toastMsg(built.nQ ? TF(T('hpe_ai_done'), built.rooms.length, built.nQ) : TF(T('hpe_ai_done0'), built.rooms.length));
      /* 读数缺失 → 请用户给一个实测总宽度定比例；跳过则先相对比例、后补标定 */
      if (!hasScale) {
        return dlgPromptText(T('hpe_ai_scale_q')).then(function (v) {
          var wv = parseFloat(v);
          if (v && isFinite(wv) && wv >= 2 && wv <= 60) {
            pushUndo();
            E.plan.mPerUnit = wv / RW;
            E.plan.calibNote = trimNum(wv, 2) + ' m';
            afterChange();
            renderTracePanel();
            toastMsg(TF(T('hpe_ai_scale_user'), trimNum(wv, 2)));
          }
        });
      }
      return Promise.resolve();
    }
    if (E.plan.rooms.length || E.plan.fixtures.length) {
      return dlgConfirm(T('hpe_ai_replace_warn'), T('hpe_ai_consent_ok')).then(function (yes) {
        return proceed(yes);
      });
    }
    return proceed(true);
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
    }).then(function (pid) { startAiFlow(pid); }).catch(function () { toastMsg(T('hpe_photo_fail')); });
  }

  /* ---------------- 开关页 ---------------- */
  function switchFloor(fid) {
    /* 只回写「本层且真改过」的稿：未改动的内存稿回写会把详情页刚删的行复活 */
    if (E.plan && E.planDirty && E.plan.floorId === E.floorId) saveNow();
    E.floorId = fid;
    E.planDirty = false;
    E.sel = null; E.placeType = null; E.arm = null; E.undoStack = []; E.redoStack = [];
    E.calibArm = false; E.calibPts = []; E.chartCache = null; E.stage = null; E.view = null; E.ptrs = null; E.pinch = null;
    E.cut = null; E.wallPrev = null; E.startPhase = 'pick'; E.uiMode = 'free'; syncModeBtn();
    E.multi = null; E.boxMode = false; E.boxRect = null;
    loadPlan(fid, E.houseId).then(function (p) {
      E.plan = p; E.planDirty = false;
      return regenTraceURL();
    }).then(function () {
      renderFloorsBar(); renderOrient(); render(); renderTray();
      /* 空层先出起始选择面（新建楼层路径）：分切式（推荐）／模板／描图 */
      var empty = !hasContent();
      if (empty) showSheet('start');
      else { if (E.sheet === 'tpl' || E.sheet === 'start') closeSheet(); renderPanel(); }
    });
  }
  function open(houseId, floorId) {
    /* 入口先作废上一会话的内存稿：编辑器是模块单例，E.plan 跨开关页存活；
     * 正常退出走 close() 已落盘并置空，此处兜底防残稿在 switchFloor 里被写回 */
    clearTimeout(saveTm);
    E.plan = null; E.planDirty = false; E.drag = null;
    E.multi = null; E.boxMode = false; E.boxRect = null;
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
    var hid = E.houseId;
    /* 只落真改过的稿：只看一眼就退出不写库——否则空层会被写出一条空 plan 行，
     * 详情页刚清掉的层也会以空行形态留在库里/同步里（云端 346B 空行事件同源） */
    if (E.planDirty) saveNow();
    if (E.stage) cancelStage();
    E.sheet = null; syncSheet();
    /* 退出即置空内存稿：此后详情页删层/清空才不会被残稿复活（复活 bug 根因） */
    clearTimeout(saveTm);
    E.plan = null; E.planDirty = false; E.floorId = 0;
    E.sel = null; E.drag = null; E.multi = null; E.boxMode = false; E.boxRect = null;
    E.undoStack = []; E.redoStack = [];
    var v = $('view-plan'); if (v) v.hidden = true;
    if (window.__wuriHouse && __wuriHouse.openDetail) __wuriHouse.openDetail(hid);
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
        if (E.stage) {
          if (E.stage.preview || E.stage.busy) return;
          e.preventDefault();
          if (!E.stage.view) E.stage.view = stageFit();
          zoomStageAt(E.stage.view.w * (e.deltaY > 0 ? 1.13 : 1 / 1.13), e.clientX, e.clientY);
          return;
        }
        if (!E.plan) return;
        e.preventDefault();
        if (!E.view) E.view = fitView();
        zoomViewAt(E.view.w * (e.deltaY > 0 ? 1.13 : 1 / 1.13), e.clientX, e.clientY);
      }, { passive: false });
      svg.addEventListener('dblclick', function (evt) {
        if (!E.plan) return;
        /* 双击立极点：恢复自动求心（解除手拖锁定，随轮廓重算） */
        var lj = evt.target && evt.target.closest ? evt.target.closest('[data-act="liji"]') : null;
        if (lj) {
          pushUndo();
          E.plan.lijiLock = false; E.plan.liji = null;
          ensureLiji(); save(); render();
          toastMsg(T('hpe_liji_auto'));
          return;
        }
        var el = evt.target && evt.target.closest ? evt.target.closest('[data-act="room"]') : null;
        if (!el) return;
        var r = roomById(el.getAttribute('data-id')); if (!r) return;
        E.sel = { kind: 'room', id: r.id }; E.attrFull = true;
        render(); renderAttr(); revealRect(r);
      });
    }
    var fb = $('hpe-fitbtn');
    if (fb) fb.addEventListener('click', function () {
      if (E.stage) { if (!E.stage.preview) { E.stage.view = stageFit(); render(); } return; }
      if (!E.plan) return;
      E.view = fitView(); render();
    });
    /* 编辑器全程禁掉系统菜单：长按拖角点绝不弹「复制/下载/分享图片」 */
    var vp = $('view-plan');
    if (vp) vp.addEventListener('contextmenu', function (e) { e.preventDefault(); });
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
    /* 构件库面板内 tile 只认「干净点按」待放（点选→点图放置，与面板提示同口径）：
     * 不走托盘拖放委托——旧版 capture＋拖影路径把面板竖滚全程接管，手指划过
     * tile 即被当成要放件（用户 2026-10-27 实测「一滑就添加，很烦」）。按下先记
     * 待定点选，位移超阈值即判滚动作废；面板 CSS 亦已放开 touch-action 让
     * 浏览器原生接管纵向滚动。 */
    var libTap = null;
    function libDown(e) {
      var el = e.target.closest ? e.target.closest('[data-tile]') : null;
      if (!el) { libTap = null; return; }
      libTap = { kind: el.getAttribute('data-tile'), key: el.getAttribute('data-key'), x: e.clientX, y: e.clientY };
    }
    function libMove(e) {
      if (!libTap) return;
      if (Math.abs(e.clientX - libTap.x) + Math.abs(e.clientY - libTap.y) > 10) libTap = null;
    }
    function libUp(e) {
      var lt = libTap; libTap = null;
      if (!lt || e.type === 'pointercancel') return;
      if (Math.abs(e.clientX - lt.x) + Math.abs(e.clientY - lt.y) > 10) return;
      if (lt.kind === 'room') {
        E.arm = (E.arm && E.arm.kind === 'room' && E.arm.key === lt.key) ? null : { kind: 'room', key: lt.key };
        E.placeType = null;
      } else if (lt.kind === 'fix') {
        E.placeType = E.placeType === lt.key ? null : lt.key;
        E.arm = null;
      } else return;
      if (E.arm || E.placeType) suppressOverlay(); /* 待放＝绘制态：盘面叠层先收起 */
      syncTray();
      /* 点选待放后收起面板回画布，待放条（#hpe-armed）会指明放法 */
      if (E.sheet === 'lib') closeSheet();
    }
    var pnl = $('hpe-panel');
    if (pnl) {
      pnl.addEventListener('pointerdown', libDown);
      pnl.addEventListener('pointermove', libMove);
      pnl.addEventListener('pointerup', libUp);
      pnl.addEventListener('pointercancel', libUp);
    }
    /* 拖放进行中指针被捕获到 tile 上、事件冒泡路径外的兜底转发（防库内拖放丢 move/up） */
    document.addEventListener('pointermove', function (e) { if (E.trayDrag) trayMove(e); });
    document.addEventListener('pointerup', function (e) { if (E.trayDrag) trayUp(e); });
    document.addEventListener('pointercancel', function (e) { if (E.trayDrag) trayUp(e); });
    var lib = $('hpe-libbtn');
    if (lib) lib.addEventListener('click', function () {
      if (E.sheet === 'lib') closeSheet(); else showSheet('lib');
    });
    var mb = $('hpe-modebtn');
    if (mb) mb.addEventListener('click', function () {
      if (E.uiMode === 'split') exitSplitMode(); else enterSplitMode();
    });
    var ab = $('hpe-armed'); if (ab) ab.addEventListener('click', function () { E.arm = null; E.placeType = null; syncTray(); });
    renderTray();
    var sx = $('hpe-sheet-x'); if (sx) sx.addEventListener('click', closeSheet);
    var sc = $('hpe-scrim'); if (sc) sc.addEventListener('click', closeSheet);
    var fl = $('hpe-file'); if (fl) fl.addEventListener('change', function () { onFilePick(fl); });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && E.planDirty) saveNow();
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

  window.__wuriPlan = { open: open, close: close, invalidate: invalidate };
})();
