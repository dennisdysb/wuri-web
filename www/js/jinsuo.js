/* ============================================================
 * 金锁玉关（过路阴阳）——风水专页第三个标派工具（Pro 门控，同八宅/玄空）。
 * 数据：window.JINSUO_DATA（jinsuo-data.js，源出 wuri-app/jinsuo/*.json，
 * 断语/形煞/参考表直接取用、不改写口径；存疑说明已在数据正文内联标注）。
 * 三块功能：
 *   1) 户型砂水判定：选宅定稿坐向＋该层户型立极点，扇形分宫（金锁口径，
 *      与飞星九宫格并存不混）逐宫记账——构件砂/水签（编辑器 FIX 同源）
 *      vs 应砂/应水 → 得位/失位＋断语；零覆盖宫判缺角；厨卫落宫出专条。
 *   2) 外局勘宅清单：八方砂/水手动标记（按定稿坐向投影）＋形煞勾选
 *      （判定要点/危害/化解五法），与拍照向导同页衔接（进度读宅档案）。
 *   3) 住户联动：六亲宫（按关系归宫，产品口径）＋属相本宫/对宫＋
 *      该宫判定摘要＋成员选房建议。
 * 红线：「一宅一盘各层共用」为产品口径、非本派规矩，文案不冒充；
 * 化解只给方法参考，不售物件。
 * 对外句柄：window.__wuriJinsuo = { open, state, compute }
 * ============================================================ */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function T(k) { return window.t ? window.t(k) : k; }
  function TF(k) {
    var s = T(k), i;
    for (i = 1; i < arguments.length; i++) s = s.replace('%s', String(arguments[i]));
    return s;
  }
  /* 呈现层简繁转换（同 fengshui2 的 tx 口径：数据原文为繁体课件） */
  function tx(s) {
    if (s == null) return '';
    s = String(s);
    try { if (window.txPoem) return window.txPoem(s); } catch (e) {}
    return s;
  }
  function txa(a) { return (a || []).map(tx); }
  function gated() { return !window.WuriPro || WuriPro.isPro(); }

  var DATA = window.JINSUO_DATA || null;
  var DU = DATA && DATA.duanyu, SH = DATA && DATA.shaxing, RF = DATA && DATA.reference;
  var PAL = {};        /* id -> palace */
  var PAL_LS = [];     /* palaces by luoshu */
  if (DU) {
    DU.palaces.forEach(function (p) { PAL[p.id] = p; });
    PAL_LS = DU.palaces.slice().sort(function (a, b) { return a.luoshu - b.luoshu; });
  }
  var BY_GUA = {};
  if (DU) DU.palaces.forEach(function (p) { BY_GUA[p.gua] = p; });
  /* 扇区序：自正北起每 45° 一宫（与编辑器/叠盘 bearing 口径一致） */
  var SECTOR = ['kan', 'gen', 'zhen', 'xun', 'li', 'kun', 'dui', 'qian'];
  /* 罗盘顺时针序（外局清单用） */
  var COMPASS = ['kan', 'gen', 'zhen', 'xun', 'li', 'kun', 'dui', 'qian'];
  var ZHI12 = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
  var SX2ZHI = { '鼠': '子', '牛': '丑', '虎': '寅', '兔': '卯', '龙': '辰', '龍': '辰', '蛇': '巳', '马': '午', '馬': '午', '羊': '未', '猴': '申', '鸡': '酉', '雞': '酉', '狗': '戌', '猪': '亥', '豬': '亥' };
  var WKEY = 'wuri_js_waiju_v1';

  var S = {
    tab: 'nei', houseId: null, floorId: null,
    houses: [], fixed: null, floors: [], plan: null,
    residents: [], judge: null, guide: null
  };

  /* ---------------- 判定引擎 ---------------- */
  function fixLabel(type) {
    var k = 'hpe_fix_' + type;
    var v = T(k);
    return v === k ? type : v;
  }
  function lijiOf(plan) {
    if (plan.liji && isFinite(plan.liji.x) && isFinite(plan.liji.y)) return plan.liji;
    var ext = extentOf(plan);
    if (!ext) return { x: 0, y: 0 };
    return { x: (ext.x0 + ext.x1) / 2, y: (ext.y0 + ext.y1) / 2 };
  }
  function extentOf(plan) {
    var xs = [], ys = [];
    (plan.rooms || []).forEach(function (r) { xs.push(r.x, r.x + r.w); ys.push(r.y, r.y + r.h); });
    if (plan.trace && plan.trace.pts) plan.trace.pts.forEach(function (p) { xs.push(p[0]); ys.push(p[1]); });
    if (!xs.length) return null;
    return { x0: Math.min.apply(null, xs), y0: Math.min.apply(null, ys),
             x1: Math.max.apply(null, xs), y1: Math.max.apply(null, ys) };
  }
  function mkResult() {
    return { shaItems: [], shuiItems: [], roomsHere: [], hasFixture: false,
             cesuo: false, chufang: false, hasSha: false, hasShui: false, status: 'noplan' };
  }
  /* 纯函数：compute(fixed, plan) -> {palaces:{id:result}, center:{cesuo,chufang}, liji} */
  function computeJudge(fixed, plan) {
    var out = { palaces: {}, center: { cesuo: false, chufang: false }, liji: null };
    PAL_LS.forEach(function (p) { out.palaces[p.id] = mkResult(); });
    if (!fixed || !plan || !DU) return out;
    var liji = lijiOf(plan); out.liji = liji;
    var facing = fixed.facingDeg;
    var ext = extentOf(plan);
    var cRad = ext ? Math.min(ext.x1 - ext.x0, ext.y1 - ext.y0) * 0.16 : 0;
    function palaceAt(x, y) {
      var dx = x - liji.x, dy = y - liji.y;
      if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return null;
      var b = ((facing + Math.atan2(dx, -dy) * 180 / Math.PI) % 360 + 360) % 360;
      return SECTOR[Math.floor(((b + 22.5) % 360) / 45)];
    }
    function nearCenter(x, y) {
      if (!cRad) return false;
      var dx = x - liji.x, dy = y - liji.y;
      return Math.sqrt(dx * dx + dy * dy) < cRad;
    }
    /* 覆盖采样：外框内逐点落宫，房间（非户外块）覆盖计数 */
    var covered = {}, territory = {};
    var rooms = (plan.rooms || []).filter(function (r) { return !r.ex; });
    if (ext) {
      var W = ext.x1 - ext.x0, H = ext.y1 - ext.y0;
      var step = Math.max(W, H) / 56 || 1;
      for (var gx = ext.x0 + step / 2; gx < ext.x1; gx += step) {
        for (var gy = ext.y0 + step / 2; gy < ext.y1; gy += step) {
          var pid = palaceAt(gx, gy); if (!pid) continue;
          territory[pid] = (territory[pid] || 0) + 1;
          for (var i = 0; i < rooms.length; i++) {
            var r = rooms[i];
            if (gx >= r.x && gx <= r.x + r.w && gy >= r.y && gy <= r.y + r.h) {
              covered[pid] = (covered[pid] || 0) + 1; break;
            }
          }
        }
      }
    }
    (plan.fixtures || []).forEach(function (fx) {
      var pid = palaceAt(fx.x, fx.y);
      var sw = DATA.fixSw[fx.type];
      if (fx.type === 'toilet' || fx.type === 'tub') {
        if (nearCenter(fx.x, fx.y)) out.center.cesuo = true;
      }
      if (fx.type === 'stove' && nearCenter(fx.x, fx.y)) out.center.chufang = true;
      if (!pid) return;
      var R = out.palaces[pid];
      R.hasFixture = true;
      if (sw === 'sha') R.shaItems.push(fixLabel(fx.type));
      else if (sw === 'shui') R.shuiItems.push(fixLabel(fx.type));
      if (fx.type === 'stove') R.chufang = true;
      if (fx.type === 'toilet' || fx.type === 'tub') R.cesuo = true;
    });
    rooms.forEach(function (r) {
      var cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      if (r.type === 'bath' && nearCenter(cx, cy)) out.center.cesuo = true;
      if (r.type === 'kitchen' && nearCenter(cx, cy)) out.center.chufang = true;
      var pid = palaceAt(cx, cy); if (!pid) return;
      var R = out.palaces[pid];
      var nm = r.name || T('hpe_rt_' + r.type);
      if (R.roomsHere.indexOf(nm) < 0) R.roomsHere.push(nm);
      if (r.type === 'kitchen') R.chufang = true;
      if (r.type === 'bath') R.cesuo = true;
    });
    PAL_LS.forEach(function (p) {
      var R = out.palaces[p.id];
      R.hasSha = R.shaItems.length > 0;
      R.hasShui = R.shuiItems.length > 0;
      var miss = (territory[p.id] || 0) > 0 && !(covered[p.id] || 0) && !R.hasFixture;
      if (miss) { R.status = 'missing'; return; }
      var wrong = (p.yingxu === '砂' && R.hasShui) || (p.yingxu === '水' && R.hasSha);
      var right = (p.yingxu === '砂' && R.hasSha) || (p.yingxu === '水' && R.hasShui);
      R.status = wrong ? 'xiong' : (right ? 'ji' : 'none');
    });
    return out;
  }
  /* 取某宫对「见 seen（砂/水）」的断：见应需之物为吉断、反之为凶断 */
  function entryFor(p, seen) { return seen === p.yingxu ? p.jiduan : p.xiongduan; }
  function entryKind(p, seen) { return seen === p.yingxu ? 'ji' : 'xiong'; }

  /* ---------------- 住户归宫 ---------------- */
  function ageOf(r) {
    return r && r.birthYear ? (new Date().getFullYear() - Number(r.birthYear)) : null;
  }
  /* 六亲归宫（产品口径：关系＋性别＋成年与否，非课件原文，于界面注明） */
  function liuqinGong(r) {
    var g = r.gender === 'female' ? 'f' : 'm';
    var age = ageOf(r), minor = age != null && age < 20;
    switch (r.rel) {
      case 'head':   return g === 'f' ? { id: 'kun', role: '老母' } : { id: 'qian', role: '老父' };
      case 'spouse': return g === 'f' ? { id: 'xun', role: '长女' } : { id: 'qian', role: '老父' };
      case 'parent': return g === 'f' ? { id: 'kun', role: '老母' } : { id: 'qian', role: '老父' };
      default:
        if (minor) return g === 'f' ? { id: 'dui', role: '少女' } : { id: 'gen', role: '少男' };
        return g === 'f' ? { id: 'li', role: '中女' } : { id: 'kan', role: '中男' };
    }
  }
  function zodiacZhi(r) {
    if (r.birthYear && r.birthMonth && r.birthDay && window.Solar) {
      try {
        var sx = Solar.fromYmd(Number(r.birthYear), Number(r.birthMonth), Number(r.birthDay)).getLunar().getYearShengXiao();
        if (SX2ZHI[sx]) return SX2ZHI[sx];
      } catch (e) {}
    }
    if (r.birthYear) return ZHI12[(((Number(r.birthYear) - 4) % 12) + 12) % 12];
    return null;
  }
  function memberAdvice(r) {
    if (!DU) return null;
    var list = DU.member_room_advice || [];
    function find(sub) {
      for (var i = 0; i < list.length; i++) if (list[i].member.indexOf(sub) >= 0) return list[i];
      return null;
    }
    var g = r.gender === 'female' ? 'f' : 'm';
    var age = ageOf(r), minor = age != null && age < 20;
    if (r.rel === 'head' || r.rel === 'spouse' || r.rel === 'parent') {
      return find(g === 'f' ? '女主人' : '男主人');
    }
    if (r.rel === 'child' && g === 'f' && minor) return find('少女');
    if (r.rel === 'child' && g === 'm' && !minor) return find('中男');
    return null;
  }
  function firstSentence(s) {
    s = String(s || '');
    var i = s.indexOf('。');
    return i > 0 ? s.slice(0, i + 1) : s;
  }

  /* ---------------- 数据加载 ---------------- */
  function db() { return window.__wuriHouse && __wuriHouse.db; }
  function houseKey(h) { return h ? (h.uuid || ('h' + h.id)) : ''; }
  function curHouse() {
    for (var i = 0; i < S.houses.length; i++) if (S.houses[i].id === S.houseId) return S.houses[i];
    return null;
  }
  function loadHouses() {
    var d = db(); if (!d) return Promise.resolve();
    return d.houses.toArray().then(function (rows) {
      rows.sort(function (a, b) { return (b.created || 0) - (a.created || 0); });
      S.houses = rows;
      var sel = $('js-house');
      if (sel) {
        sel.innerHTML = rows.length
          ? rows.map(function (h) { return '<option value="' + h.id + '">' + esc(h.name || ('#' + h.id)) + '</option>'; }).join('')
          : '<option value="">' + esc(T('js_no_house')) + '</option>';
      }
      if (rows.length && !rows.some(function (h) { return h.id === S.houseId; })) S.houseId = rows[0].id;
      if (sel && S.houseId) sel.value = String(S.houseId);
      return selectHouse(S.houseId);
    }).catch(function () {});
  }
  function selectHouse(id) {
    S.houseId = id ? Number(id) : null;
    S.fixed = null; S.floors = []; S.plan = null; S.floorId = null;
    S.residents = []; S.guide = null; S.judge = null;
    var d = db(); if (!d || !S.houseId) { renderAll(); return Promise.resolve(); }
    return Promise.all([
      d.measurements.where('houseId').equals(S.houseId).toArray(),
      d.floors.where('houseId').equals(S.houseId).toArray(),
      d.residents.where('houseId').equals(S.houseId).toArray(),
      d.guides.get(S.houseId),
      d.photos.where('houseId').equals(S.houseId).toArray()
    ]).then(function (r) {
      var fixed = r[0].filter(function (m) { return m.fixed; });
      S.fixed = fixed.length ? fixed[0] : null;
      S.floors = r[1].slice().sort(function (a, b) { return (a.sort || 0) - (b.sort || 0); });
      S.residents = r[2];
      S.guide = { checks: (r[3] && r[3].checks) || {}, photos: r[4] || [] };
      var planGets = S.floors.map(function (f) { return d.plans.get(f.id); });
      return Promise.all(planGets).then(function (plans) {
        S.floors.forEach(function (f, i) { f._plan = plans[i] || null; });
        var first = S.floors.filter(function (f) { return f._plan; })[0] || S.floors[0];
        S.floorId = first ? first.id : null;
        applyFloor();
        renderAll();
      });
    }).catch(function () { renderAll(); });
  }
  function applyFloor() {
    var f = S.floors.filter(function (x) { return x.id === S.floorId; })[0];
    S.plan = f ? (f._plan || null) : null;
    S.judge = computeJudge(S.fixed, S.plan);
  }
  function renderSitNote() {
    var el = $('js-sit-note'); if (!el) return;
    var h = curHouse();
    if (!h) { el.innerHTML = ''; return; }
    if (S.fixed) {
      el.innerHTML = esc(TF(T('js_sit_fixed'), h.name || '', S.fixed.sitting || '', S.fixed.facing || '',
        (Math.round(S.fixed.facingDeg * 10) / 10) + '°')) +
        ' <a class="js-link" id="js-goto-house">' + esc(T('js_goto_house')) + '</a>';
    } else {
      el.innerHTML = esc(T('js_sit_none')) +
        ' <a class="js-link" id="js-goto-house">' + esc(T('js_goto_house')) + '</a>';
    }
    var a = $('js-goto-house'); if (a) a.addEventListener('click', gotoHouse);
    var fs = $('js-floor');
    if (fs) {
      fs.innerHTML = S.floors.length
        ? S.floors.map(function (f) {
            return '<option value="' + f.id + '">' + esc(f.name || '') +
              (f._plan ? '' : '（' + esc(T('js_no_plan')) + '）') + '</option>';
          }).join('')
        : '<option value="">' + esc(T('js_no_floor')) + '</option>';
      if (S.floorId) fs.value = String(S.floorId);
    }
  }
  function gotoHouse() {
    var h = curHouse(); if (!h || !window.__wuriHouse) return;
    closeJinsuo();
    var hub = $('view-fengshui'); if (hub) hub.hidden = true;
    __wuriHouse.openDetail(h.id);
  }

  /* ---------------- 通用渲染件 ---------------- */
  var ST_TXT = { ji: 'js_st_ji', xiong: 'js_st_xiong', missing: 'js_st_missing', none: 'js_st_none', noplan: 'js_st_noplan' };
  function chip(st) {
    var cls = st === 'ji' ? 'ok' : (st === 'xiong' || st === 'missing') ? 'bad' : 'mut';
    return '<span class="js-chip ' + cls + '">' + esc(T(ST_TXT[st] || 'js_st_noplan')) + '</span>';
  }
  function factsLine(parts) {
    var t = parts.filter(function (x) { return x; });
    return t.length ? '<p class="js-facts">' + t.join('') + '</p>' : '';
  }
  function fact(lab, val) {
    return val ? '<span><i>' + esc(lab) + '</i>' + esc(tx(val)) + '</span>' : '';
  }
  function duanBlock(title, kind, entry, liuqin) {
    if (!entry) return '';
    var ys = txa(entry.yingshi || []).join('、');
    return '<div class="js-duan k-' + kind + '">' +
      '<div class="js-duan-h">' + esc(title) + '<span>' + esc(T(kind === 'ji' ? 'js_ji' : 'js_xiong')) + '</span></div>' +
      '<p class="js-duan-t">' + esc(tx(entry.text)) + '</p>' +
      factsLine([
        fact(T('js_f_ren'), entry.duixiang_ren || (liuqin && liuqin.ren)),
        fact(T('js_f_body'), liuqin && liuqin.shenti ? liuqin.shenti.join('、') : ''),
        fact(T('js_f_shi'), ys),
        fact(T('js_f_qi'), entry.yingqi)
      ]) + '</div>';
  }

  /* ---------------- 面板一：户型砂水判定 ---------------- */
  function renderNei() {
    var box = $('js-panel-nei'); if (!box) return;
    if (!DATA) { box.innerHTML = '<section class="card"><p class="fs2-note">' + esc(T('js_no_data')) + '</p></section>'; return; }
    if (!curHouse()) { box.innerHTML = hintCard('js_no_house_hint'); return; }
    if (!S.fixed) { box.innerHTML = hintCard('js_need_fixed'); return; }
    if (!S.plan) { box.innerHTML = hintCard('js_need_plan'); return; }
    var J = S.judge, cnt = { ji: 0, xiong: 0, missing: 0, none: 0 };
    PAL_LS.forEach(function (p) { var st = J.palaces[p.id].status; if (cnt[st] != null) cnt[st]++; });
    var html = '<section class="card"><div class="card-title">' + esc(T('js_nei_title')) + '</div>' +
      '<p class="js-sum">' + esc(TF(T('js_sum_line'), cnt.ji, cnt.xiong, cnt.missing, cnt.none)) + '</p>';
    if (J.center.cesuo) html += '<p class="js-center-warn">⚠ ' + esc(tx(DU.zhonggong.neiju_note[0])) + '</p>';
    if (J.center.chufang) html += '<p class="js-center-warn">⚠ ' + esc(tx(DU.zhonggong.neiju_note[2])) + '</p>';
    html += '<p class="fs2-note">' + esc(T('js_nei_note')) + '</p></section>';
    PAL_LS.forEach(function (p) { html += palaceCard(p, J.palaces[p.id]); });
    box.innerHTML = html;
  }
  function hintCard(key) {
    return '<section class="card"><p class="fs2-note">' + esc(T(key)) + '</p>' +
      '<p class="fs2-note"><a class="js-link" data-goto-house="1">' + esc(T('js_goto_house')) + '</a></p></section>';
  }
  function palaceCard(p, R) {
    var head = '<div class="js-pal-head"><b>' + esc(tx(p.gua)) + esc(T('js_gong')) + ' · ' + esc(tx(p.fangwei)) + '</b>' +
      (p.biecheng ? '<span class="js-pal-sub">' + esc(tx(p.biecheng)) + '</span>' : '') + chip(R.status) + '</div>';
    var meta = '<p class="js-meta">' +
      esc(TF(T('js_meta'), p.luoshu, p.xiantian_gua)) + ' · ' +
      esc(T('js_lq_hou')) + ' ' + esc(tx(p.liuqin.houtian.ren)) + ' · ' +
      esc(T('js_lq_xian')) + ' ' + esc(tx(p.liuqin.xiantian.ren)) + '</p>';
    var ledger = '<p class="js-ledger"><span class="js-need">' + esc(TF(T('js_need'), tx(p.yingxu))) + '</span>' +
      '<span>' + esc(T('js_seen_sha')) + (R.shaItems.length ? esc(txa(R.shaItems).join('、')) : '—') + '</span>' +
      '<span>' + esc(T('js_seen_shui')) + (R.shuiItems.length ? esc(txa(R.shuiItems).join('、')) : '—') + '</span></p>';
    if (R.roomsHere.length) ledger += '<p class="js-ledger"><span>' + esc(T('js_rooms')) + esc(txa(R.roomsHere).join('、')) + '</span></p>';
    var body = '';
    if (R.status === 'missing') {
      var qj = p.neiju.quejiao;
      body += '<div class="js-duan k-xiong"><div class="js-duan-h">' + esc(T('js_quejiao')) + '<span>' + esc(T('js_xiong')) + '</span></div>' +
        '<p class="js-duan-t">' + esc(tx(qj.text)) + '</p>' +
        factsLine([fact(T('js_f_qi'), qj.yingqi)]) + '</div>';
      body += methodRef(RF.shinei_checklists.quejiao_chuwei_tongyong.quejiao_huajie);
    } else if (R.status !== 'noplan') {
      var seens = [];
      if (R.hasSha) seens.push('砂');
      if (R.hasShui) seens.push('水');
      var Q = BY_GUA[p.xiantian_gua];
      seens.forEach(function (seen) {
        body += duanBlock(TF(T('js_duan_hou'), seen), entryKind(p, seen), entryFor(p, seen), p.liuqin.houtian);
        if (Q) body += duanBlock(TF(T('js_duan_xian'), Q.gua, seen), entryKind(Q, seen), entryFor(Q, seen), p.liuqin.xiantian);
      });
      if (!seens.length) body += '<p class="fs2-note">' + esc(T('js_none_note')) + '</p>';
    }
    if (R.cesuo && p.neiju.cesuo) {
      body += zhuanBlock(T('js_in_bath'), p.neiju.cesuo);
      body += methodRef(RF.shinei_checklists.quejiao_chuwei_tongyong.weishengjian_huajie);
    }
    if (R.chufang && p.neiju.chufang) {
      body += zhuanBlock(T('js_in_kitchen'), p.neiju.chufang);
      body += methodRef(RF.shinei_checklists.quejiao_chuwei_tongyong.chufang_huajie);
    }
    return '<section class="card js-pal st-' + R.status + '">' + head + meta + ledger + body + '</section>';
  }
  function zhuanBlock(lab, z) {
    return '<div class="js-zhuan"><div class="js-duan-h">' + esc(lab) + ' · ' + esc(tx(z.ming)) + '</div>' +
      '<p class="js-duan-t">' + esc(tx(z.text)) + '</p>' +
      factsLine([fact(T('js_f_qi'), z.yingqi)]) + '</div>';
  }
  function methodRef(list) {
    if (!list || !list.length) return '';
    return '<p class="js-method"><i>' + esc(T('js_method_ref')) + '</i>' + esc(txa(list).join('；')) + '</p>';
  }

  /* ---------------- 面板二：外局勘宅清单 ---------------- */
  function waiAll() {
    try { return JSON.parse(localStorage.getItem(WKEY) || '{}') || {}; } catch (e) { return {}; }
  }
  function waiState() {
    var h = curHouse(); if (!h) return { dirs: {}, shas: {} };
    var all = waiAll(), k = houseKey(h);
    return all[k] || { dirs: {}, shas: {} };
  }
  function waiSave(st) {
    var h = curHouse(); if (!h) return;
    var all = waiAll(); all[houseKey(h)] = st; st.ts = Date.now();
    try { localStorage.setItem(WKEY, JSON.stringify(all)); } catch (e) {}
  }
  function renderWai() {
    var box = $('js-panel-wai'); if (!box) return;
    if (!DATA) { box.innerHTML = '<section class="card"><p class="fs2-note">' + esc(T('js_no_data')) + '</p></section>'; return; }
    if (!curHouse()) { box.innerHTML = hintCard('js_no_house_hint'); return; }
    var st = waiState();
    var html = '<section class="card"><div class="card-title">' + esc(T('js_wai_dir_title')) + '</div>' +
      '<p class="fs2-note">' + esc(S.fixed ? T('js_wai_dir_note') : T('js_wai_dir_nofixed')) + '</p>';
    COMPASS.forEach(function (pid) {
      var p = PAL[pid], cur = st.dirs[pid] || '';
      var verdict = '';
      if (cur) {
        var seen = cur === 'sha' ? '砂' : '水';
        verdict = chip(seen === p.yingxu ? 'ji' : 'xiong');
      }
      html += '<div class="js-dir-row"><span class="js-dir-name">' + esc(tx(p.fangwei)) + ' · ' + esc(tx(p.gua)) + esc(T('js_gong')) +
        '<i>' + esc(TF(T('js_need'), tx(p.yingxu))) + '</i></span>' +
        '<span class="fs2-seg js-dir-seg" data-dir="' + pid + '">' +
        '<button data-v="sha" class="' + (cur === 'sha' ? 'on' : '') + '">' + esc(T('js_mark_sha')) + '</button>' +
        '<button data-v="shui" class="' + (cur === 'shui' ? 'on' : '') + '">' + esc(T('js_mark_shui')) + '</button>' +
        '<button data-v="" class="' + (!cur ? 'on' : '') + '">' + esc(T('js_mark_none')) + '</button></span>' +
        verdict + '</div>';
    });
    html += '<details class="js-det"><summary>' + esc(T('js_wai_ref')) + '</summary>' +
      '<p class="js-ref-lab">' + esc(T('js_wai_sha_list')) + '</p><p class="js-chips">' +
      RF.shashui.wai_wuxing.sha.map(function (x) { return '<span>' + esc(tx(x)) + '</span>'; }).join('') + '</p>' +
      '<p class="js-ref-lab">' + esc(T('js_wai_shui_list')) + '</p><p class="js-chips">' +
      RF.shashui.wai_wuxing.shui.map(function (x) { return '<span>' + esc(tx(x)) + '</span>'; }).join('') + '</p>' +
      '<p class="fs2-note">' + esc(tx(RF.shashui.wai_wuxing.sha_rule)) + '</p>' +
      '<p class="fs2-note">' + esc(tx(RF.shashui.wai_wuxing.shui_rule)) + '</p>' +
      '<p class="js-ref-lab">' + esc(T('js_wufa')) + '</p>' +
      '<p class="fs2-note">' + esc(tx(RF.huasha_wufa.priority)) + '</p>' +
      RF.huasha_wufa.methods.map(function (m) {
        return '<p class="fs2-note"><b>' + esc(tx(m.name)) + '</b> ' + esc(tx(m.title)) + '：' + esc(tx(m.text)) + '</p>';
      }).join('') + '</details></section>';
    /* 形煞清单 */
    html += '<section class="card"><div class="card-title">' + esc(T('js_sha_title')) + '</div>' +
      '<p class="fs2-note">' + esc(T('js_sha_note')) + '</p>' +
      shaGroup(T('js_sha_wai'), SH.shas, st) +
      shaGroup(T('js_sha_nei'), SH.neiju_sha_extra, st) + '</section>';
    /* 拍照向导衔接 */
    html += guideCard();
    box.innerHTML = html;
    bindWai(box);
  }
  function shaGroup(title, list, st) {
    var html = '<div class="js-combo-title">' + esc(title) + '</div>';
    list.forEach(function (s) {
      var on = !!st.shas[s.id];
      html += '<div class="js-sha' + (on ? ' on' : '') + '">' +
        '<label class="js-sha-head"><input type="checkbox" data-sha="' + esc(s.id) + '"' + (on ? ' checked' : '') + '>' +
        '<b>' + esc(tx(s.name)) + '</b>' +
        (s.alias ? '<span class="js-pal-sub">' + esc(txa([].concat(s.alias)).join(' / ')) + '</span>' : '') + '</label>';
      if (on) {
        html += '<div class="js-sha-body">' +
          (s.panduan && s.panduan.length ? '<p class="js-ref-lab">' + esc(T('js_sha_panduan')) + '</p>' +
            s.panduan.map(function (x) { return '<p class="js-sha-li">· ' + esc(tx(x)) + '</p>'; }).join('') : '') +
          '<p class="js-ref-lab">' + esc(T('js_sha_weihai')) + '</p><p class="js-duan-t">' + esc(tx(s.weihai)) + '</p>' +
          '<p class="js-ref-lab">' + esc(T('js_sha_huajie')) +
          (s.huajie.methods && s.huajie.methods.length
            ? ' <span class="js-mtags">' + s.huajie.methods.map(function (m) { return '<em>' + esc(tx(m)) + '</em>'; }).join('') + '</span>' : '') + '</p>' +
          '<p class="js-duan-t">' + esc(tx(s.huajie.text)) + '</p></div>';
      }
      html += '</div>';
    });
    return html;
  }
  function guideCard() {
    var defs = [['hou', 'hd_guide_hou'], ['mingtang', 'hd_guide_mingtang'], ['qinglong', 'hd_guide_qinglong'],
                ['baihu', 'hd_guide_baihu'], ['shuikou', 'hd_guide_shuikou'], ['quanjing', 'hd_guide_quanjing']];
    var g = S.guide || { checks: {}, photos: [] };
    var doneN = 0;
    var rows = defs.map(function (d) {
      var n = (g.photos || []).filter(function (p) { return p.guideKey === d[0]; }).length;
      var done = !!(g.checks && g.checks[d[0]]) || n > 0;
      if (done) doneN++;
      return '<div class="hd-guide-row' + (done ? ' done' : '') + '"><span class="box">' + (done ? '✓' : '') + '</span>' +
        '<span>' + esc(T(d[1])) + '</span><span class="tag">' +
        (done ? esc(TF(T('hd_guide_done'), n || 1)) : esc(T('hd_guide_todo'))) + '</span></div>';
    }).join('');
    return '<section class="card"><div class="card-title">' + esc(T('hd_guide_title')) + '</div>' + rows +
      '<p class="hd-note">' + esc(TF(T('hd_guide_prog'), doneN, defs.length)) + '</p>' +
      '<p class="fs2-note"><a class="js-link" data-goto-house="1">' + esc(T('js_goto_photos')) + '</a></p></section>';
  }
  function bindWai(box) {
    Array.prototype.forEach.call(box.querySelectorAll('.js-dir-seg'), function (seg) {
      seg.addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('button') : null; if (!b) return;
        var st = waiState();
        var v = b.getAttribute('data-v');
        if (v) st.dirs[seg.getAttribute('data-dir')] = v;
        else delete st.dirs[seg.getAttribute('data-dir')];
        waiSave(st); renderWai();
      });
    });
    Array.prototype.forEach.call(box.querySelectorAll('input[data-sha]'), function (cb) {
      cb.addEventListener('change', function () {
        var st = waiState(), id = cb.getAttribute('data-sha');
        if (cb.checked) st.shas[id] = 1; else delete st.shas[id];
        waiSave(st); renderWai();
      });
    });
    bindGoto(box);
  }
  function bindGoto(root) {
    Array.prototype.forEach.call(root.querySelectorAll('[data-goto-house]'), function (a) {
      a.addEventListener('click', gotoHouse);
    });
  }

  /* ---------------- 面板三：住户联动 ---------------- */
  function palaceDigest(pid) {
    var p = PAL[pid], R = S.judge && S.judge.palaces[pid];
    if (!p) return '';
    if (!R || R.status === 'noplan') return '<p class="js-digest">' + chip('noplan') + '</p>';
    var txt = '';
    if (R.status === 'missing') txt = p.neiju.quejiao.text;
    else if (R.hasSha || R.hasShui) {
      var seen = (R.status === 'xiong')
        ? (p.yingxu === '砂' ? '水' : '砂')
        : (R.hasSha ? '砂' : '水');
      txt = entryFor(p, seen).text;
    }
    return '<p class="js-digest">' + chip(R.status) +
      (txt ? '<span>' + esc(tx(firstSentence(txt))) + '</span>' : '<span>' + esc(T('js_none_note')) + '</span>') + '</p>';
  }
  function relLine(labKey, pid) {
    var p = PAL[pid]; if (!p) return '';
    return '<div class="js-ren-row"><span class="js-ren-lab">' + esc(T(labKey)) + '</span>' +
      '<span class="js-ren-pal">' + esc(tx(p.gua)) + esc(T('js_gong')) + ' · ' + esc(tx(p.fangwei)) + '</span></div>' +
      palaceDigest(pid);
  }
  function renderRen() {
    var box = $('js-panel-ren'); if (!box) return;
    if (!DATA) { box.innerHTML = '<section class="card"><p class="fs2-note">' + esc(T('js_no_data')) + '</p></section>'; return; }
    if (!curHouse()) { box.innerHTML = hintCard('js_no_house_hint'); return; }
    if (!S.residents.length) {
      box.innerHTML = '<section class="card"><p class="fs2-note">' + esc(T('js_no_res')) + '</p>' +
        '<p class="fs2-note"><a class="js-link" data-goto-house="1">' + esc(T('js_goto_house')) + '</a></p></section>';
      bindGoto(box); return;
    }
    var html = '<section class="card"><p class="fs2-note">' + esc(T('js_ren_note')) + '</p></section>';
    S.residents.forEach(function (r) {
      var lq = liuqinGong(r);
      var zhi = zodiacZhi(r);
      var ben = zhi && RF.shuxiang.zhi_luo_gong.map[zhi];
      var duiZhi = zhi && RF.shuxiang.zhi_luo_gong.duigong[zhi];
      var dui = duiZhi && RF.shuxiang.zhi_luo_gong.map[duiZhi];
      var benId = ben && BY_GUA[ben] ? BY_GUA[ben].id : null;
      var duiId = dui && BY_GUA[dui] ? BY_GUA[dui].id : null;
      html += '<section class="card js-ren"><div class="js-pal-head"><b>' + esc(r.name || '') + '</b>' +
        '<span class="js-pal-sub">' + esc(T('hd_rel_' + (r.rel || 'other'))) +
        (zhi ? ' · ' + esc(TF(T('js_zodiac'), tx(zhi))) : '') + '</span></div>' +
        relLine('js_ren_lq', lq.id) +
        (benId ? relLine('js_ren_ben', benId) : '') +
        (duiId ? relLine('js_ren_dui', duiId) : '');
      var adv = memberAdvice(r);
      if (adv) {
        html += '<div class="js-advice"><div class="js-duan-h">' + esc(T('js_advice')) + '</div>' +
          '<p class="js-duan-t">' + esc(TF(T('js_advice_line'), tx(adv.first), tx(adv.second))) +
          (adv.condition ? '（' + esc(tx(adv.condition)) + '）' : '') + '</p>' +
          '<p class="fs2-note">' + esc(tx(adv.reason)) + '</p></div>';
      } else {
        var role = tx(lq.role);
        var hits = PAL_LS.filter(function (p) { return p.xuanfang && p.xuanfang.indexOf(role) >= 0; });
        if (hits.length) {
          html += '<div class="js-advice"><div class="js-duan-h">' + esc(T('js_advice')) + '</div>' +
            hits.map(function (p) { return '<p class="fs2-note">' + esc(tx(p.xuanfang)) + '</p>'; }).join('') + '</div>';
        }
      }
      html += '</section>';
    });
    html += '<section class="card"><p class="fs2-note">' + esc(T('js_ren_foot')) + '</p></section>';
    box.innerHTML = html;
  }

  /* ---------------- 页签/开页/接线 ---------------- */
  function renderAll() {
    renderSitNote();
    renderNei(); renderWai(); renderRen();
    var nei = $('js-panel-nei'), wai = $('js-panel-wai'), ren = $('js-panel-ren');
    if (nei) nei.hidden = S.tab !== 'nei';
    if (wai) wai.hidden = S.tab !== 'wai';
    if (ren) ren.hidden = S.tab !== 'ren';
    Array.prototype.forEach.call(document.querySelectorAll('#js-tabs button'), function (b) {
      b.classList.toggle('on', b.getAttribute('data-v') === S.tab);
    });
    bindGoto($('js-panel-nei'));
  }
  function openJinsuo() {
    if (!gated()) { if (window.WuriPro) WuriPro.requirePro('fengshui'); return; }
    var hub = $('view-fengshui'), v = $('view-jinsuo');
    if (hub) hub.hidden = true;
    if (v) { v.hidden = false; window.scrollTo(0, 0); }
    loadHouses();
  }
  function closeJinsuo() {
    var v = $('view-jinsuo'); if (v) v.hidden = true;
    var hub = $('view-fengshui'); if (hub) hub.hidden = false;
  }
  function init() {
    var back = $('js-back'); if (back) back.addEventListener('click', closeJinsuo);
    var hs = $('js-house');
    if (hs) hs.addEventListener('change', function () { selectHouse(hs.value); });
    var fs = $('js-floor');
    if (fs) fs.addEventListener('change', function () {
      S.floorId = Number(fs.value); applyFloor(); renderAll();
    });
    var tabs = $('js-tabs');
    if (tabs) tabs.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button') : null; if (!b) return;
      S.tab = b.getAttribute('data-v'); renderAll();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  if (window.__wuri_rerender) {
    var prevJs = window.__wuri_rerender;
    window.__wuri_rerender = function () {
      prevJs();
      var v = $('view-jinsuo');
      if (v && !v.hidden) renderAll();
    };
  } else {
    window.__wuri_rerender = function () {
      var v = $('view-jinsuo');
      if (v && !v.hidden) renderAll();
    };
  }

  window.__wuriJinsuo = {
    open: openJinsuo,
    openJinsuo: openJinsuo,
    close: closeJinsuo,
    state: function () { return S; },
    compute: computeJudge
  };
})();
