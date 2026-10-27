/* 家宅档案 · 第一批（2026-10-26）：数据层＋档案库＋详情＋罗盘存档升级＋照片
 *
 * 数据层：Dexie（Apache-2.0，js/vendor/dexie.js）本地库（DB 名 wuri-house）：
 *   houses{id,name,address,client,phone,surveyDate,note,created}
 *   floors{id,houseId,name,sort}
 *   measurements{id,houseId,ts,facingDeg,facing,sitting,point,decl,gps,gpsAcc,accDeg,fixed}
 *   photos{id,houseId,floorId,cat,guideKey,blob,ts}
 *   guides{houseId,checks{}}
 * 兼容口径：旧单档 localStorage wuri_fs_house_v1 保留为「镜像」——第 1 宅（最早建）
 * 的定稿测量实时同步写入该键，fengshui.js / fengshui2.js 的既有读取零改动；
 * 首次运行把旧单档迁为第 1 宅「自宅」＋一条定稿测量；旧路径（专页卡进罗盘）
 * 存档若改了镜像，档案层在打开列表/专页时按 ts 检出并回收入记录。
 * 门控：免费档第 1 宅全功能；第 2 宅起新建/进入走 WuriPro.requirePro('fengshui')。
 * 户型编辑器与报告页不在本批（楼层先落数据，照片按层归档）。
 */
(function () {
  'use strict';
  if (!window.Dexie) return;
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
  function norm360(d) { return ((d % 360) + 360) % 360; }
  function fmtDeg(d) { return (Math.round(norm360(d) * 10) / 10).toFixed(1); }
  function fmtDecl(d) { return (d > 0 ? '+' : d < 0 ? '−' : '') + (Math.round(Math.abs(d) * 10) / 10).toFixed(1); }
  function pad2(n) { return String(n).padStart(2, '0'); }
  function fmtDT(ts) {
    var d = new Date(ts);
    return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }
  function fmtYMD(ts) {
    var d = new Date(ts);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function angDiff(a, b) {
    var d = Math.abs(norm360(a) - norm360(b)) % 360;
    return d > 180 ? 360 - d : d;
  }
  function pointName(p) {
    if (!p) return '';
    var v = T('hd_point_' + p);
    return v && v !== 'hd_point_' + p ? v : p; /* 旧记录若存中文原名则原样 */
  }
  function dir8Name(deg) {
    var names = String(T('fs_dir8')).split('|');
    return names[Math.round(norm360(deg) / 45) % 8] || '';
  }
  var MT = window.FS24 || [];
  function mtnAt(deg) { return MT.length ? MT[Math.round(norm360(deg) / 15) % 24] : null; }
  function sittingOf(facingName) {
    var names = MT.map(function (m) { return m.name; });
    var i = names.indexOf(facingName);
    return i < 0 ? '' : names[(i + 12) % 24];
  }
  function isPro() { return !window.WuriPro || WuriPro.isPro(); }
  function requirePro() { return !window.WuriPro || WuriPro.requirePro('fengshui'); }

  /* ---------------- 数据层 ---------------- */
  var db = new Dexie('wuri-house');
  db.version(1).stores({
    houses: '++id, created',
    floors: '++id, houseId',
    measurements: '++id, houseId, ts',
    photos: '++id, houseId, ts',
    guides: 'houseId'
  });
  /* v2（规格补丁二）：住户表 residents{id,houseId,name,rel,birthYear,birthMonth,
   * birthDay,gender,note}——rel: head/spouse/child/parent/other；gender: male/female。
   * 八宅页下批经本表按 houseId 取住户算命卦游年，本批先落表与详情卡。 */
  db.version(2).stores({ residents: '++id, houseId' });
  /* v3（第二批 A）：户型图 plans{floorId,houseId,updated,mPerUnit,rooms[],
   * fixtures[],trace{photoId,corners,rect,opacity},liji{x,y},layers{}}，
   * 一层一图、floorId 为主键；编辑器在 js/house-editor.js，共用本 db 实例。 */
  db.version(3).stores({ plans: 'floorId, houseId' });
  /* v4（账号云同步）：各表加 uuid 索引。同步层（js/account.js）首次运行时给每行
   * 回写 uuid 作跨设备身份，本地数字 id 永不出设备；本地读写口径不变，uuid 仅附加字段。 */
  db.version(4).stores({
    houses: '++id, created, uuid',
    floors: '++id, houseId, uuid',
    measurements: '++id, houseId, ts, uuid',
    photos: '++id, houseId, ts, uuid',
    residents: '++id, houseId, uuid',
    guides: 'houseId, uuid',
    plans: 'floorId, houseId, uuid'
  });

  var ARCH_KEY = 'wuri_fs_house_v1';
  var MIG_KEY = 'wuri_hd_migrated_v1';
  var TARGET_KEY = 'wuri_hd_target_v1';
  var RECENT_KEY = 'wuri_hd_recent_v1';
  function recentId() { try { return parseInt(localStorage.getItem(RECENT_KEY) || '0', 10) || 0; } catch (e) { return 0; } }
  function setRecent(id) { try { if (id) localStorage.setItem(RECENT_KEY, String(id)); } catch (e) {} }
  function readMirror() {
    try {
      var j = JSON.parse(localStorage.getItem(ARCH_KEY) || 'null');
      if (j && isFinite(j.facingDeg) && j.facing && j.sitting) return j;
    } catch (e) {}
    return null;
  }
  function writeMirror(m) {
    try {
      if (m) localStorage.setItem(ARCH_KEY, JSON.stringify({
        facingDeg: m.facingDeg, facing: m.facing, sitting: m.sitting, ts: m.ts
      }));
      else localStorage.removeItem(ARCH_KEY);
    } catch (e) {}
  }

  function primaryHouse() { return db.houses.orderBy('created').first(); }
  function fixedOf(houseId) { return db.measurements.where('houseId').equals(houseId).and(function (m) { return !!m.fixed; }).first(); }

  /* 第 1 宅定稿 → 镜像（八宅/飞星旧读取口径） */
  function syncMirror() {
    return primaryHouse().then(function (h) {
      if (!h) { writeMirror(null); return null; }
      return fixedOf(h.id).then(function (m) { writeMirror(m || null); return m; });
    });
  }

  function createHouse(fields) {
    var now = Date.now();
    var h = {
      name: fields && fields.name || '',
      address: fields && fields.address || '',
      client: fields && fields.client || '',
      phone: fields && fields.phone || '',
      surveyDate: fields && fields.surveyDate || fmtYMD(now),
      note: fields && fields.note || '',
      created: now
    };
    return db.houses.add(h).then(function (id) {
      h.id = id;
      return db.floors.add({ houseId: id, name: T('hd_floor_1'), sort: 0 }).then(function () { return h; });
    });
  }

  /* 迁移＋镜像回收（旧路径存档回收入记录）。迁移全程串行化：
   * init/renderHub/openList 多路并发调用只跑一遍，避免竞态重复建测量。 */
  var migP = null;
  function migrate() {
    if (!migP) migP = doMigrate();
    else if (localStorage.getItem(MIG_KEY)) migP = migP.then(function () { return reconcileMirror(); });
    return migP;
  }
  function doMigrate() {
    if (localStorage.getItem(MIG_KEY)) return reconcileMirror();
    var arch = readMirror();
    var done = function () { try { localStorage.setItem(MIG_KEY, '1'); } catch (e) {} };
    if (!arch) { done(); return Promise.resolve(); }
    return db.houses.count().then(function (n) {
      if (n > 0) { done(); return reconcileMirror(); }
      var h = {
        name: T('hd_default_home'), address: '', client: '', phone: '',
        surveyDate: fmtYMD(arch.ts || Date.now()), note: '', created: arch.ts || Date.now()
      };
      return db.houses.add(h).then(function (id) {
        return db.floors.add({ houseId: id, name: T('hd_floor_1'), sort: 0 }).then(function () {
          return db.measurements.add({
            houseId: id, ts: arch.ts || Date.now(),
            facingDeg: arch.facingDeg, facing: arch.facing, sitting: arch.sitting,
            point: '', decl: null, gps: null, gpsAcc: null, accDeg: null, fixed: true
          });
        });
      }).then(function () { done(); return syncMirror(); });
    });
  }
  function reconcileMirror() {
    var arch = readMirror();
    if (!arch) return syncMirror();
    return primaryHouse().then(function (h) {
      if (!h) return syncMirror();
      return fixedOf(h.id).then(function (fx) {
        if (fx && Math.abs((fx.ts || 0) - (arch.ts || 0)) < 1500 &&
            Math.abs(fx.facingDeg - arch.facingDeg) < 0.051) return null; /* 镜像即定稿本身 */
        return db.measurements.where('houseId').equals(h.id).toArray().then(function (all) {
          var dup = all.some(function (m) {
            return Math.abs((m.ts || 0) - (arch.ts || 0)) < 1500 &&
              Math.abs(m.facingDeg - arch.facingDeg) < 0.051;
          });
          if (dup) return null; /* 同一条已在记录里（防并发重复收编） */
          return addFromMirror(h, arch);
        });
      });
    });
  }
  /* 旧路径（罗盘存档钮）在档案层之外改了镜像 → 作为新记录收编并定稿 */
  function addFromMirror(h, arch) {
    return db.measurements.where('houseId').equals(h.id)
      .modify(function (m) { m.fixed = false; })
      .then(function () {
        return db.measurements.add({
          houseId: h.id, ts: arch.ts || Date.now(),
          facingDeg: arch.facingDeg, facing: arch.facing, sitting: arch.sitting,
          point: '', decl: null, gps: null, gpsAcc: null, accDeg: null, fixed: true
        });
      }).then(function () { return syncMirror(); });
  }

  /* 测量入指定档案：无定稿时自动定稿（承旧单档口径）；
   * forceFix（自定稿卡「罗盘实测」入口）＝保存即夺稿：先清旧定稿、新条直接定稿。
   * 解析为 {id, autoFix}，autoFix 供罗盘页选 toast 文案。 */
  function recordInto(id, r, forceFix) {
    var clearP = forceFix
      ? db.measurements.where('houseId').equals(id).modify(function (m) { m.fixed = false; })
      : Promise.resolve();
    return clearP.then(function () { return fixedOf(id); }).then(function (fx) {
      var gpsP = new Promise(function (res) {
        if (!navigator.geolocation) { res(null); return; }
        var to = setTimeout(function () { res(null); }, 2500);
        navigator.geolocation.getCurrentPosition(function (p) {
          clearTimeout(to);
          res({ lat: Math.round(p.coords.latitude * 1e6) / 1e6, lon: Math.round(p.coords.longitude * 1e6) / 1e6, acc: p.coords.accuracy || null });
        }, function () { clearTimeout(to); res(null); }, { timeout: 2200, maximumAge: 60000 });
      });
      return gpsP.then(function (g) {
        return db.measurements.add({
          houseId: id, ts: Date.now(),
          facingDeg: r.facingDeg, facing: r.facing, sitting: r.sitting,
          point: r.point || '', decl: isFinite(r.decl) ? r.decl : null,
          gps: g ? { lat: g.lat, lon: g.lon } : null, gpsAcc: g ? g.acc : null,
          accDeg: isFinite(r.accDeg) ? r.accDeg : null,
          fixed: forceFix ? true : !fx
        }).then(function () { return syncMirror(); }).then(function () {
          setRecent(id); return { id: id, autoFix: !!forceFix };
        });
      });
    });
  }

  /* 选宅弹层：列全部档案（默认最近编辑一宅），可改选/新建；取消解析 null */
  function pickHouse(hs) {
    return new Promise(function (resolve) {
      var old = document.querySelector('.hd-pick-mask');
      if (old) old.remove();
      var mask = document.createElement('div');
      mask.className = 'hd-pick-mask';
      var sel = recentId();
      if (!hs.some(function (h) { return h.id === sel; })) sel = hs[0].id;
      var rows = hs.map(function (h) {
        return '<div class="hd-pick-row' + (h.id === sel ? ' on' : '') + '" data-pick="' + h.id + '">' +
          '<span class="hd-pick-name">' + esc(h.name || T('hd_unnamed')) + '</span>' +
          '<span class="hd-pick-sub" data-picksub="' + h.id + '"></span></div>';
      }).join('');
      mask.innerHTML = '<div class="hd-pick-sheet">' +
        '<div class="hd-pick-title">' + esc(T('hd_pick_house_title')) + '</div>' +
        '<div class="hd-pick-list">' + rows +
        '<div class="hd-pick-row hd-pick-new" id="hd-pick-new">' + esc(T('hd_pick_new')) + '</div></div>' +
        '<div class="hd-pick-foot">' +
        '<button class="btn" id="hd-pick-cancel">' + esc(T('hd_cancel')) + '</button>' +
        '<button class="btn primary" id="hd-pick-ok">' + esc(T('hd_pick_save')) + '</button></div></div>';
      document.body.appendChild(mask);
      hs.forEach(function (h) {
        fixedOf(h.id).then(function (fx) {
          var el = mask.querySelector('[data-picksub="' + h.id + '"]');
          if (el) el.textContent = fx ? TF(T('hd_sit_face'), fx.sitting, fx.facing) : T('hd_pending');
        }).catch(function () {});
      });
      function done(v) { mask.remove(); resolve(v); }
      Array.prototype.forEach.call(mask.querySelectorAll('[data-pick]'), function (el) {
        el.addEventListener('click', function () {
          sel = +el.getAttribute('data-pick');
          Array.prototype.forEach.call(mask.querySelectorAll('[data-pick]'), function (x) {
            x.classList.toggle('on', +x.getAttribute('data-pick') === sel);
          });
        });
      });
      mask.querySelector('#hd-pick-new').addEventListener('click', function () {
        hdDlgPrompt(T('hd_house_name_prompt'), '', T('hd_save')).then(function (name) {
          if (name === null) return; /* 取消命名：留在选宅层 */
          createHouse({ name: name.trim() }).then(function (h) { done(h.id); });
        });
      });
      mask.querySelector('#hd-pick-cancel').addEventListener('click', function () { done(null); });
      mask.addEventListener('click', function (e) { if (e.target === mask) done(null); });
      mask.querySelector('#hd-pick-ok').addEventListener('click', function () { done(sel); });
    });
  }

  /* 自家样式弹层（用户 2026-10-26 定：原生输入/确认弹窗带域名标题、样式裸陋，
   * 与 App 风格脱节，一律换自家底部层；样式复用选宅层 .hd-pick-* 体系）：
   * hdDlgPrompt(标题, 默认值, 确认钮文案) → Promise<string|null>（取消=null）；
   * hdDlgConfirm(文案, 确认钮文案) → Promise<boolean>（红色确认钮）。 */
  function hdDlgBase(sheetHtml) {
    var old = document.querySelector('.hd-dlg-mask');
    if (old) old.remove();
    var mask = document.createElement('div');
    mask.className = 'hd-pick-mask hd-dlg-mask';
    mask.innerHTML = '<div class="hd-pick-sheet">' + sheetHtml + '</div>';
    document.body.appendChild(mask);
    return mask;
  }
  function hdDlgPrompt(title, defVal, okLabel) {
    return new Promise(function (resolve) {
      var mask = hdDlgBase(
        '<div class="hd-pick-title">' + esc(title) + '</div>' +
        '<input class="fs2-inp hd-dlg-inp" id="hd-dlg-inp" type="text" value="' + esc(defVal || '') + '">' +
        '<div class="hd-pick-foot">' +
        '<button class="btn" id="hd-dlg-cancel">' + esc(T('hd_cancel')) + '</button>' +
        '<button class="btn primary" id="hd-dlg-ok">' + esc(okLabel || T('hd_save')) + '</button></div>');
      var inp = mask.querySelector('#hd-dlg-inp');
      function done(v) {
        document.removeEventListener('keydown', onKey, true);
        mask.remove(); resolve(v);
      }
      function onKey(e) {
        if (e.key === 'Enter') { e.preventDefault(); done(inp.value); }
        else if (e.key === 'Escape') { e.preventDefault(); done(null); }
      }
      document.addEventListener('keydown', onKey, true);
      mask.querySelector('#hd-dlg-ok').addEventListener('click', function () { done(inp.value); });
      mask.querySelector('#hd-dlg-cancel').addEventListener('click', function () { done(null); });
      mask.addEventListener('click', function (e) { if (e.target === mask) done(null); });
      setTimeout(function () { try { inp.focus(); inp.select(); } catch (e) {} }, 60);
    });
  }
  function hdDlgConfirm(text, okLabel) {
    return new Promise(function (resolve) {
      var mask = hdDlgBase(
        '<div class="hd-pick-title hd-dlg-msg">' + esc(text) + '</div>' +
        '<div class="hd-pick-foot">' +
        '<button class="btn" id="hd-dlg-cancel">' + esc(T('hd_cancel')) + '</button>' +
        '<button class="btn hd-dlg-danger" id="hd-dlg-ok">' + esc(okLabel || T('hd_del')) + '</button></div>');
      function done(v) {
        document.removeEventListener('keydown', onKey, true);
        mask.remove(); resolve(v);
      }
      function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); done(false); } }
      document.addEventListener('keydown', onKey, true);
      mask.querySelector('#hd-dlg-ok').addEventListener('click', function () { done(true); });
      mask.querySelector('#hd-dlg-cancel').addEventListener('click', function () { done(false); });
      mask.addEventListener('click', function (e) { if (e.target === mask) done(false); });
    });
  }

  /* 补标测点层：给无测点的历史记录选测点，保存即更新该条
   *（列表的「未标注」签与定稿来源行的「未标注」共用此层） */
  function pickPoint() {
    return new Promise(function (resolve) {
      var old = document.querySelector('.hd-pt-mask');
      if (old) old.remove();
      var mask = document.createElement('div');
      mask.className = 'hd-pick-mask hd-pt-mask';
      var keys = ['center', 'door', 'balcony', 'yard', 'other'];
      mask.innerHTML = '<div class="hd-pick-sheet">' +
        '<div class="hd-pick-title">' + esc(T('hd_point_pick_title')) + '</div>' +
        '<div class="hd-pick-list">' + keys.map(function (k) {
          return '<div class="hd-pick-row" data-pt="' + k + '"><span class="hd-pick-name">' +
            esc(T('hd_point_' + k)) + '</span></div>';
        }).join('') + '</div>' +
        '<div class="hd-pick-foot"><button class="btn" id="hd-pt-cancel">' +
        esc(T('hd_cancel')) + '</button></div></div>';
      document.body.appendChild(mask);
      function done(v) { mask.remove(); resolve(v); }
      Array.prototype.forEach.call(mask.querySelectorAll('[data-pt]'), function (el) {
        el.addEventListener('click', function () { done(el.getAttribute('data-pt')); });
      });
      mask.querySelector('#hd-pt-cancel').addEventListener('click', function () { done(null); });
      mask.addEventListener('click', function (e) { if (e.target === mask) done(null); });
    });
  }
  function labelPoint(mealId) {
    pickPoint().then(function (pt) {
      if (!pt) return;
      db.measurements.update(mealId, { point: pt }).then(renderDetail);
    });
  }

  /* 罗盘存档总流程（fengshui.js 存档钮调用）：
   * 有指定目标（定稿卡「罗盘实测」入口，目标键在位）→ 直存该宅且保存即定稿；
   * 无指定（专页罗盘卡通用路径）→ 无档案时自动建第 1 宅，有档案时弹选宅层，
   * 只入记录、不夺稿（多点互校口径）。解析 {id, autoFix} 或 null（选宅取消）。 */
  function saveCompass(r) {
    var tid = 0;
    try { tid = parseInt(sessionStorage.getItem(TARGET_KEY) || '0', 10) || 0; } catch (e) {}
    function chooseTarget() {
      return db.houses.orderBy('created').toArray().then(function (hs) {
        if (!hs.length) {
          return createHouse({ name: T('hd_default_home') }).then(function (h) { return recordInto(h.id, r, false); });
        }
        return pickHouse(hs).then(function (id) { return id ? recordInto(id, r, false) : null; });
      });
    }
    return migrate().then(function () {
      if (!tid) return chooseTarget();
      return db.houses.get(tid).then(function (h) { return h ? recordInto(tid, r, true) : chooseTarget(); });
    });
  }
  /* 兼容旧名（外部若仍调 recordCompass，走同一流程） */
  function recordCompass(r) { return saveCompass(r); }

  /* ---------------- 视图开关 ---------------- */
  var S = {
    curHouse: 0, curFloor: 0, cat: 'all', editing: false, editRes: 0,
    returnToDetail: false, viewerPhoto: 0, pickSit: null, measOpen: false,
    shownPhotos: [], viewerList: [], viewerIdx: 0, viewerURL: '', reportURLs: []
  };
  function openList() {
    var v = $('view-houses'); if (!v) return;
    migrate().then(renderList);
    v.hidden = false; window.scrollTo(0, 0);
  }
  function closeList() {
    var v = $('view-houses'); if (v) v.hidden = true;
    /* 回到专页时入口卡须显当前总数：借 fengshui.js 的 renderArch 入口重绘 */
    if (window.__wuriFs && __wuriFs.renderArchNow) __wuriFs.renderArchNow();
  }
  function openDetail(id, editing) {
    S.curHouse = id; S.editing = !!editing; S.cat = 'all'; S.editRes = 0; S.pickSit = null; S.measOpen = false;
    setRecent(id);
    var v = $('view-house'); if (!v) return;
    v.hidden = false; window.scrollTo(0, 0);
    renderDetail();
  }
  function closeDetail() { var v = $('view-house'); if (v) v.hidden = true; }
  function gotoCompassFor(houseId, backToDetail) {
    try { sessionStorage.setItem(TARGET_KEY, String(houseId || 0)); } catch (e) {}
    S.returnToDetail = !!backToDetail;
    closeDetail(); closeList();
    var hub = $('view-fengshui'); if (hub) hub.hidden = false;
    if (window.__wuriFs && __wuriFs.openCompass) __wuriFs.openCompass();
    var pr = $('fs-point-row'); if (pr) pr.hidden = false;
  }

  /* ---------------- 专页入口卡（接管 #fs-arch） ---------------- */
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

  /* 专页入口卡＝纯入口（2026-10-26 用户定）：多宅之下不挂任何单宅坐向，
   * 只显档案总数（0 时空状态引导）＋进入钮；量坐向走下方罗盘卡、定稿在各宅详情里 */
  function renderHub(box) {
    migrate().then(function () {
      return db.houses.count().then(function (n) {
        var body = n
          ? '<div class="fs-arch-line">' + esc(TF(T('hd_hub_count'), n)) + '</div>'
          : '<div class="fs-arch-state">' + esc(T('hd_none_yet')) + '</div>' +
            '<p class="fs-arch-hint">' + esc(T('hd_hub_hint')) + '</p>';
        box.innerHTML = '<div class="fs-arch-empty">' + ARCH_ICON + body +
          '<div class="fs-arch-btns">' +
          '<span class="fs-chipbtn" id="hd-hub-list">' + esc(T('hd_enter_lib')) + '</span>' +
          '</div></div>';
        var ls = box.querySelector('#hd-hub-list');
        if (ls) ls.addEventListener('click', openList);
      });
    }).catch(function () {});
  }

  /* ---------------- 列表页 ---------------- */
  function houseStats(h) {
    return Promise.all([
      fixedOf(h.id),
      db.measurements.where('houseId').equals(h.id).count(),
      db.photos.where('houseId').equals(h.id).count(),
      db.floors.where('houseId').equals(h.id).count()
    ]).then(function (r) { return { fixed: r[0], nMeas: r[1], nPhotos: r[2], nFloors: r[3] }; });
  }
  function renderList() {
    var wrap = $('hd-list'); if (!wrap) return;
    db.houses.orderBy('created').toArray().then(function (hs) {
      if (!hs.length) {
        wrap.innerHTML = '<p class="hd-lead">' + esc(T('hd_empty_list')) + '</p>';
        renderStorage();
        return;
      }
      return Promise.all(hs.map(houseStats)).then(function (sts) {
        wrap.innerHTML = hs.map(function (h, i) {
          var st = sts[i];
          var locked = i > 0 && !isPro();
          var cli = [h.client, h.phone].filter(Boolean).join(' · ');
          var rows =
            '<div class="hd-house-top"><span class="hd-house-name">' + esc(h.name || T('hd_unnamed')) + '</span>' +
            (st.fixed ? '<span class="hd-chip done">' + esc(T('hd_fixed_chip')) + '</span>'
                      : '<span class="hd-chip">' + esc(T('hd_pending')) + '</span>') +
            (locked ? '<span class="hd-pro">' + esc(T('fs_pro')) + '</span>' : '') + '</div>' +
            (h.address ? '<div class="hd-kv"><span class="k">' + esc(T('hd_f_address')) + '</span><span>' + esc(h.address) + '</span></div>' : '') +
            '<div class="hd-kv"><span class="k">' + esc(T('hd_f_client')) + '</span><span>' +
              esc(cli || '—') + (h.surveyDate ? ' · ' + esc(T('hd_survey_on')) + ' ' + esc(h.surveyDate) : '') + '</span></div>' +
            '<div class="hd-stats"><span>' + esc(T('hd_stat_facing')) + ' <b>' +
              (st.fixed ? esc(TF(T('hd_sit_face'), st.fixed.sitting, st.fixed.facing)) : esc(T('hd_pending'))) + '</b></span>' +
              '<span>' + esc(T('hd_stat_floors')) + ' <b>' + st.nFloors + '</b></span>' +
              '<span>' + esc(T('hd_stat_photos')) + ' <b>' + st.nPhotos + '</b></span>' +
              '<span>' + esc(T('hd_stat_meas')) + ' <b>' + st.nMeas + '</b></span></div>' +
            '<span class="hd-chev">›</span>';
          return '<section class="card hd-house' + (locked ? ' hd-locked' : '') + '" data-hid="' + h.id + '">' + rows + '</section>';
        }).join('');
        Array.prototype.forEach.call(wrap.querySelectorAll('.hd-house'), function (el, i) {
          el.addEventListener('click', function () {
            if (i > 0 && !isPro()) { requirePro(); return; }
            openDetail(hs[i].id);
          });
        });
        renderStorage();
      });
    }).catch(function () {});
  }
  function renderStorage() {
    var el = $('hd-usage'); if (!el) return;
    if (navigator.storage && navigator.storage.estimate) {
      navigator.storage.estimate().then(function (e) {
        var mb = (e.usage || 0) / 1048576;
        el.textContent = TF(T('hd_usage'), mb >= 100 ? Math.round(mb) : Math.round(mb * 10) / 10);
      }).catch(function () { el.textContent = ''; });
    }
  }

  /* ---------------- 导出备份（自备 STORE zip） ---------------- */
  var CRC_T = null;
  function crc32(buf) {
    if (!CRC_T) {
      CRC_T = [];
      for (var n = 0; n < 256; n++) {
        var c = n;
        for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
        CRC_T[n] = c >>> 0;
      }
    }
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < buf.length; i++) crc = CRC_T[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  function zipStore(files) {
    /* files: [{name, data:Uint8Array}] → Blob(zip, STORE 无压缩) */
    var enc = new TextEncoder();
    var chunks = [], central = [], off = 0;
    function u16(v) { return [v & 0xFF, (v >>> 8) & 0xFF]; }
    function u32(v) { return [v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF]; }
    files.forEach(function (f) {
      var name = enc.encode(f.name);
      var crc = crc32(f.data), size = f.data.length;
      var lh = new Uint8Array([].concat(
        u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0x21),
        u32(crc), u32(size), u32(size), u16(name.length), u16(0)));
      chunks.push(lh, name, f.data);
      var ch = new Uint8Array([].concat(
        u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0x21),
        u32(crc), u32(size), u32(size), u16(name.length), u16(0), u16(0),
        u16(0), u16(0), u32(0), u32(off), u32(0)));
      central.push(ch, name);
      off += lh.length + name.length + size;
    });
    var cSize = central.reduce(function (s, c) { return s + c.length; }, 0);
    var end = new Uint8Array([].concat(
      u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
      u32(cSize), u32(off), u16(0)));
    return new Blob(chunks.concat(central, [end]), { type: 'application/zip' });
  }
  function exportBackup() {
    toastMsg(T('hd_exporting'));
    return Promise.all([
      db.houses.toArray(), db.floors.toArray(), db.measurements.toArray(),
      db.photos.toArray(), db.guides.toArray(), db.residents.toArray(), db.plans.toArray()
    ]).then(function (r) {
      var enc = new TextEncoder();
      var meta = {
        app: 'wuri-house-backup', version: 1, exported: new Date().toISOString(),
        houses: r[0], floors: r[1], measurements: r[2], guides: r[4], residents: r[5], plans: r[6],
        photos: r[3].map(function (p) {
          return { id: p.id, houseId: p.houseId, floorId: p.floorId, cat: p.cat, guideKey: p.guideKey, ts: p.ts, file: 'photos/' + p.id + '.jpg' };
        })
      };
      var files = [{ name: 'backup.json', data: enc.encode(JSON.stringify(meta, null, 1)) }];
      return Promise.all(r[3].map(function (p) {
        return p.blob.arrayBuffer().then(function (ab) {
          files.push({ name: 'photos/' + p.id + '.jpg', data: new Uint8Array(ab) });
        });
      })).then(function () {
        var blob = zipStore(files);
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'wuri-house-backup-' + fmtYMD(Date.now()).replace(/-/g, '') + '.zip';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
        toastMsg(T('hd_exported'));
      });
    }).catch(function () { toastMsg(T('hd_export_fail')); });
  }

  /* ---------------- 详情页 ---------------- */
  var GUIDE_DEFS = null;
  function guideDefs() {
    if (!GUIDE_DEFS) {
      GUIDE_DEFS = ['hou', 'mingtang', 'qinglong', 'baihu', 'shuikou', 'quanjing'].map(function (k) {
        return { k: k, label: T('hd_guide_' + k) };
      });
    }
    return GUIDE_DEFS;
  }
  var CATS = ['waijing', 'shinei', 'zhoubian', 'qita'];
  function catName(c) { return T('hd_cat_' + c); }

  function renderDetail() {
    var hid = S.curHouse; if (!hid) return;
    db.houses.get(hid).then(function (h) {
      if (!h) { closeDetail(); openList(); return; }
      renderHead(h);
      return Promise.all([
        db.measurements.where('houseId').equals(hid).toArray(),
        db.floors.where('houseId').equals(hid).toArray(),
        db.photos.where('houseId').equals(hid).toArray(),
        db.guides.get(hid),
        db.residents.where('houseId').equals(hid).toArray()
      ]).then(function (r) {
        var ms = r[0].slice().sort(function (a, b) { return b.ts - a.ts; });
        var fls = r[1].slice().sort(function (a, b) { return (a.sort || 0) - (b.sort || 0) || a.id - b.id; });
        if (!fls.length || !fls.some(function (f) { return f.id === S.curFloor; })) S.curFloor = fls.length ? fls[0].id : 0;
        renderResidents(h, r[4]);
        renderFixed(h, ms.filter(function (m) { return m.fixed; })[0] || null);
        renderMeas(h, ms);
        renderFloors(h, fls);
        renderPhotos(h, r[2]);
        renderGuide(h, r[2], r[3]);
      });
    }).catch(function () {});
  }

  function renderHead(h) {
    var box = $('hd-head'); if (!box) return;
    if (!S.editing) {
      var cli = [h.client, h.phone].filter(Boolean).join(' · ');
      box.innerHTML =
        '<div class="hd-name">' + esc(h.name || T('hd_unnamed')) + '</div>' +
        (h.address ? '<div class="hd-kv" style="margin-top:8px"><span class="k">' + esc(T('hd_f_address')) + '</span><span>' + esc(h.address) + '</span></div>' : '') +
        (cli ? '<div class="hd-kv"><span class="k">' + esc(T('hd_f_client')) + '</span><span>' + esc(cli) + '</span></div>' : '') +
        (h.surveyDate ? '<div class="hd-kv"><span class="k">' + esc(T('hd_f_date')) + '</span><span>' + esc(h.surveyDate) + '</span></div>' : '') +
        (h.note ? '<div class="hd-kv"><span class="k">' + esc(T('hd_f_note')) + '</span><span class="hd-note">' + esc(h.note) + '</span></div>' : '') +
        '<button class="hd-more" id="hd-edit-btn">' + esc(T('hd_edit')) + '</button>';
      $('hd-edit-btn').addEventListener('click', function () { S.editing = true; renderHead(h); });
    } else {
      var fld = function (id, lab, val, type, ph) {
        return '<div class="hd-form-row"><label>' + esc(lab) + '</label>' +
          '<input class="fs2-inp hd-inp" id="' + id + '" type="' + (type || 'text') + '" value="' + esc(val || '') + '"' +
          (ph ? ' placeholder="' + esc(ph) + '"' : '') + '></div>';
      };
      box.innerHTML =
        fld('hd-in-name', T('hd_f_name'), h.name) +
        fld('hd-in-address', T('hd_f_address'), h.address) +
        fld('hd-in-client', T('hd_f_client'), h.client) +
        fld('hd-in-phone', T('hd_f_phone'), h.phone, 'tel') +
        fld('hd-in-date', T('hd_f_date'), h.surveyDate, 'date') +
        '<div class="hd-form-row"><label>' + esc(T('hd_f_note')) + '</label>' +
        '<textarea class="fs2-inp hd-inp" id="hd-in-note" rows="3">' + esc(h.note || '') + '</textarea></div>' +
        '<div class="hd-actions"><button class="btn primary" id="hd-save-btn">' + esc(T('hd_save')) + '</button>' +
        '<button class="btn" id="hd-cancel-btn">' + esc(T('hd_cancel')) + '</button></div>';
      $('hd-cancel-btn').addEventListener('click', function () { S.editing = false; renderDetail(); });
      $('hd-save-btn').addEventListener('click', function () {
        var upd = {
          name: $('hd-in-name').value.trim(),
          address: $('hd-in-address').value.trim(),
          client: $('hd-in-client').value.trim(),
          phone: $('hd-in-phone').value.trim(),
          surveyDate: $('hd-in-date').value || h.surveyDate,
          note: $('hd-in-note').value.trim()
        };
        db.houses.update(h.id, upd).then(function () {
          S.editing = false; toastMsg(T('hd_saved')); renderDetail();
        });
      });
    }
  }

  /* ---------------- 住户（规格补丁二） ---------------- */
  var RELS = ['head', 'spouse', 'child', 'parent', 'other'];
  function relName(r) { return T('hd_rel_' + (r || 'other')); }
  function txs(s) { return window.txPoem ? window.txPoem(s) : s; }
  function birthText(r) {
    if (!r.birthYear) return '';
    if (r.birthMonth && r.birthDay) return TF(T('hd_res_born_full'), r.birthYear, pad2(r.birthMonth), pad2(r.birthDay));
    if (r.birthMonth) return TF(T('hd_res_born_ym'), r.birthYear, r.birthMonth);
    return TF(T('hd_res_born_y'), r.birthYear);
  }
  function guaHtml(r) {
    var F = window.WuriSoulFs;
    if (!F || !r.birthYear || !r.gender) return '';
    try {
      var g = F.lifeGua(r.birthYear, r.gender);
      if (!g || !g.name) return '';
      return '<span class="hd-res-gua">' + esc(txs(g.name)) + esc(T('fs2_life_suffix')) + '</span>' +
        '<span class="hd-chip">' + esc(g.group === 'east' ? T('hd_res_east') : T('hd_res_west')) + '</span>';
    } catch (e) { return ''; }
  }
  function renderResidents(h, rs) {
    var box = $('hd-residents'); if (!box) return;
    rs = rs.slice().sort(function (a, b) { return a.id - b.id; });
    var html = '<div class="card-title">' + esc(T('hd_res_title')) + '</div>';
    if (!rs.length && S.editRes !== -1) html += '<p class="hd-note">' + esc(T('hd_res_empty')) + '</p>';
    html += rs.map(function (r) {
      if (S.editRes === r.id) return resFormHtml(r);
      var meta = [relName(r.rel), r.gender ? T(r.gender === 'male' ? 'fs2_male' : 'fs2_female') : '', birthText(r)]
        .filter(Boolean).join(' · ');
      return '<div class="hd-res-row"><div class="hd-log-top">' +
        '<span class="hd-res-name">' + esc(r.name) + '</span>' + guaHtml(r) +
        '<span class="hd-res-edit" data-resedit="' + r.id + '">' + esc(T('hd_res_edit')) + '</span></div>' +
        '<p class="hd-log-meta">' + esc(meta) + (r.note ? ' · ' + esc(r.note) : '') + '</p></div>';
    }).join('');
    if (S.editRes === -1) html += resFormHtml(null);
    else html += '<button class="hd-more" id="hd-res-add">' + esc(T('hd_res_add')) + '</button>';
    html += '<p class="hd-note" style="margin-top:8px">' + esc(T('hd_res_note')) + '</p>';
    box.innerHTML = html;
    var add = $('hd-res-add');
    if (add) add.addEventListener('click', function () { S.editRes = -1; renderDetail(); });
    Array.prototype.forEach.call(box.querySelectorAll('[data-resedit]'), function (el) {
      el.addEventListener('click', function () { S.editRes = +el.getAttribute('data-resedit'); renderDetail(); });
    });
    bindResForm(h);
  }
  function resFormHtml(r) {
    var isNew = !r;
    r = r || { name: '', rel: 'head', birthYear: '', birthMonth: '', birthDay: '', gender: 'male', note: '' };
    function opts(list, val, lab) {
      return list.map(function (o) {
        return '<option value="' + o + '"' + (o === val ? ' selected' : '') + '>' + esc(lab(o)) + '</option>';
      }).join('');
    }
    var row = function (lab, inner) {
      return '<div class="hd-form-row"><label>' + esc(lab) + '</label>' + inner + '</div>';
    };
    var inp = function (id, val, type, ph) {
      return '<input class="fs2-inp hd-inp" id="' + id + '" type="' + (type || 'text') + '" value="' + esc(val == null ? '' : val) + '"' +
        (ph ? ' placeholder="' + esc(ph) + '"' : '') + '>';
    };
    return '<div class="hd-res-form">' +
      row(T('hd_f_name'), inp('hd-r-name', r.name)) +
      row(T('hd_res_rel'), '<select class="fs2-inp hd-inp" id="hd-r-rel">' +
        opts(RELS, r.rel, relName) + '</select>') +
      row(T('hd_res_birth'), '<span class="hd-res-birth">' +
        inp('hd-r-by', r.birthYear, 'number', T('hd_res_year')) +
        inp('hd-r-bm', r.birthMonth, 'number', T('hd_res_month')) +
        inp('hd-r-bd', r.birthDay, 'number', T('hd_res_day')) + '</span>') +
      row(T('fs2_gender'), '<select class="fs2-inp hd-inp" id="hd-r-gender">' +
        opts(['male', 'female'], r.gender, function (g) { return T(g === 'male' ? 'fs2_male' : 'fs2_female'); }) + '</select>') +
      row(T('hd_f_note'), inp('hd-r-note', r.note)) +
      '<div class="hd-actions">' +
      '<button class="btn primary" id="hd-r-save">' + esc(T('hd_save')) + '</button>' +
      '<button class="btn" id="hd-r-cancel">' + esc(T('hd_cancel')) + '</button>' +
      (isNew ? '' : '<button class="btn danger" id="hd-r-del">' + esc(T('hd_del')) + '</button>') +
      '</div></div>';
  }
  function bindResForm(h) {
    var sv = $('hd-r-save'); if (!sv) return;
    var editingId = S.editRes;
    $('hd-r-cancel').addEventListener('click', function () { S.editRes = 0; renderDetail(); });
    var del = $('hd-r-del');
    if (del) del.addEventListener('click', function () {
      hdDlgConfirm(T('hd_confirm_del_res')).then(function (ok) {
        if (!ok) return;
        db.residents.delete(editingId).then(function () { S.editRes = 0; renderDetail(); });
      });
    });
    sv.addEventListener('click', function () {
      var name = $('hd-r-name').value.trim();
      var by = parseInt($('hd-r-by').value, 10);
      if (!name || !isFinite(by) || by < 1900 || by > 2100) { toastMsg(T('hd_res_need')); return; }
      var bm = parseInt($('hd-r-bm').value, 10);
      var bd = parseInt($('hd-r-bd').value, 10);
      var data = {
        houseId: h.id, name: name,
        rel: $('hd-r-rel').value,
        birthYear: by,
        birthMonth: isFinite(bm) && bm >= 1 && bm <= 12 ? bm : null,
        birthDay: isFinite(bd) && bd >= 1 && bd <= 31 ? bd : null,
        gender: $('hd-r-gender').value,
        note: $('hd-r-note').value.trim()
      };
      var p = editingId === -1 ? db.residents.add(data) : db.residents.update(editingId, data);
      Promise.resolve(p).then(function () { S.editRes = 0; toastMsg(T('hd_saved')); renderDetail(); });
    });
  }

  function renderFixed(h, fx) {
    var box = $('hd-fixed'); if (!box) return;
    if (!fx) {
      box.innerHTML = '<div class="card-title centered">' + esc(T('hd_fixed_title')) + '</div>' +
        '<p class="hd-note" style="text-align:center">' + esc(T('hd_no_fixed')) + '</p>' +
        '<div class="hd-actions">' +
        '<button class="btn" id="hd-pick-open">' + esc(T('hd_pick_sitting')) + '</button>' +
        '<button class="btn" id="hd-fix-measure">' + esc(T('fs_arch_measure')) + '</button></div>' +
        pickPanelHtml();
      bindFixed(h, null);
      return;
    }
    /* 修正链全显：磁偏角/GPS 无值显「—」（手动定稿即此情形），不静默缺项 */
    var meta = [];
    /* 定稿来源行：显测点（定稿自 宅心 测量 · 时间）；手动定稿显「手动选定」；
     * 历史定稿无测点显「未标注」，点之可补标（补后本行与记录签同步刷新） */
    if (fx.point === 'manual') {
      meta.push(esc(TF(T('hd_fix_from_manual'), fmtDT(fx.ts))));
    } else if (fx.point) {
      meta.push(esc(TF(T('hd_fix_from'), pointName(fx.point), fmtDT(fx.ts))));
    } else {
      meta.push(esc(TF(T('hd_fix_from'), '@@PT@@', fmtDT(fx.ts))).replace('@@PT@@',
        '<span class="hd-fix-ptnone" data-fixpt="' + fx.id + '">' + esc(T('hd_point_none')) + '</span>'));
    }
    meta.push(fx.decl != null && isFinite(fx.decl)
      ? esc(TF(T('hd_fix_decl'), fmtDecl(fx.decl))) : esc(T('hd_fix_decl_na')));
    meta.push(fx.gps ? 'GPS ' + fx.gps.lat.toFixed(4) + ', ' + fx.gps.lon.toFixed(4) : 'GPS —');
    if (fx.accDeg != null && isFinite(fx.accDeg)) meta.push(esc(TF(T('hd_fix_acc'), Math.round(fx.accDeg * 10) / 10)));
    box.innerHTML = '<div class="card-title centered">' + esc(T('hd_fixed_title')) + '</div>' +
      '<div class="hd-fix-main">' +
      '<div class="hd-fix-big">' + esc(TF(T('hd_sit_face_big'), fx.sitting, fx.facing)) + '</div>' +
      '<div class="hd-fix-deg">' + esc(TF(T('hd_fix_deg'), fmtDeg(fx.facingDeg), dir8Name(fx.facingDeg))) + '</div>' +
      '<p class="hd-fix-meta">' + meta.join('<br>') + '</p></div>' +
      '<div class="hd-actions">' +
      '<button class="btn" id="hd-go-xk">' + esc(T('hd_go_xk')) + '</button>' +
      '<button class="btn" id="hd-go-bz">' + esc(T('hd_go_bz')) + '</button></div>' +
      '<div class="hd-actions">' +
      '<button class="btn" id="hd-pick-open">' + esc(T('hd_pick_sitting')) + '</button>' +
      '<button class="btn" id="hd-fix-measure">' + esc(T('hd_measure_fix')) + '</button></div>' +
      pickPanelHtml();
    $('hd-go-xk').addEventListener('click', function () { gotoChart('xk', fx.sitting); });
    $('hd-go-bz').addEventListener('click', function () { gotoChart('bz', fx.sitting); });
    var fp = box.querySelector('[data-fixpt]');
    if (fp) fp.addEventListener('click', function () { labelPoint(fx.id); });
    bindFixed(h, fx);
  }

  /* 手选坐向面板（展开态存 S.pickSit：null=收起，''=已展开未选，其余=已选坐山名） */
  function pickPanelHtml() {
    if (S.pickSit === null || S.pickSit === undefined) return '';
    var chips = MT.map(function (m) {
      return '<span class="hd-sit-chip' + (S.pickSit === m.name ? ' on' : '') + '" data-sit="' + esc(m.name) + '">' + esc(m.name) + '</span>';
    }).join('');
    var will = '';
    if (S.pickSit) {
      var i = MT.map(function (m) { return m.name; }).indexOf(S.pickSit);
      var f = MT[(i + 12) % 24];
      will = '<p class="hd-pick-will">' + esc(TF(T('hd_pick_will'), S.pickSit, f.name, fmtDeg(((i + 12) % 24) * 15))) + '</p>';
    }
    return '<div class="hd-pick-panel">' +
      '<p class="hd-note">' + esc(T('hd_pick_sit_lab')) + '</p>' +
      '<div class="hd-sit-grid">' + chips + '</div>' + will +
      '<div class="hd-actions"><button class="btn primary" id="hd-pick-confirm"' +
      (S.pickSit ? '' : ' disabled') + '>' + esc(T('hd_pick_confirm')) + '</button>' +
      '<button class="btn" id="hd-pick-close">' + esc(T('hd_cancel')) + '</button></div></div>';
  }
  function bindFixed(h, fx) {
    var mo = $('hd-fix-measure');
    if (mo) mo.addEventListener('click', function () { gotoCompassFor(h.id, true); });
    var op = $('hd-pick-open');
    if (op) op.addEventListener('click', function () {
      S.pickSit = (S.pickSit === null || S.pickSit === undefined)
        ? (fx ? fx.sitting : '') : null;
      renderDetail();
    });
    if (S.pickSit === null || S.pickSit === undefined) return;
    Array.prototype.forEach.call(document.querySelectorAll('#hd-fixed [data-sit]'), function (el) {
      el.addEventListener('click', function () { S.pickSit = el.getAttribute('data-sit'); renderDetail(); });
    });
    var cl = $('hd-pick-close');
    if (cl) cl.addEventListener('click', function () { S.pickSit = null; renderDetail(); });
    var cf = $('hd-pick-confirm');
    if (cf) cf.addEventListener('click', function () { if (S.pickSit) applyManualFixed(h, S.pickSit); });
  }
  /* 手选定稿：写一条来源「手动」的测量并设为定稿，记录审计链不断
   *（时间=当下、GPS/磁偏角留空，定稿卡以「—」显） */
  function applyManualFixed(h, sitName) {
    var names = MT.map(function (m) { return m.name; });
    var i = names.indexOf(sitName);
    if (i < 0) return;
    var fi = (i + 12) % 24;
    db.measurements.where('houseId').equals(h.id)
      .modify(function (m) { m.fixed = false; })
      .then(function () {
        return db.measurements.add({
          houseId: h.id, ts: Date.now(),
          facingDeg: fi * 15, facing: MT[fi].name, sitting: sitName,
          point: 'manual', decl: null, gps: null, gpsAcc: null, accDeg: null, fixed: true
        });
      })
      .then(function () { return syncMirror(); })
      .then(function () {
        S.pickSit = null; setRecent(h.id);
        toastMsg(T('hd_pick_done')); renderDetail();
      });
  }
  function gotoChart(kind, sitting) {
    if (!requirePro()) return;
    var st = window.__wuriFs2 && __wuriFs2.state();
    if (st) {
      var obj = kind === 'bz' ? st.bz : st.xk;
      obj.sitting = sitting; obj.sittingDirty = true;
      try {
        var key = kind === 'bz' ? 'wuri_fs_bazhai_v1' : 'wuri_fs_xk_v1';
        var cur = JSON.parse(localStorage.getItem(key) || '{}') || {};
        cur.sitting = sitting;
        localStorage.setItem(key, JSON.stringify(cur));
      } catch (e) {}
    }
    closeDetail(); closeList();
    var hub = $('view-fengshui'); if (hub) hub.hidden = false;
    if (window.__wuriFs2) {
      if (kind === 'bz') __wuriFs2.openBazhai(); else __wuriFs2.openXuankong();
    }
  }

  function renderMeas(h, ms) {
    var box = $('hd-meas'); if (!box) return;
    var fx = ms.filter(function (m) { return m.fixed; })[0] || null;
    var html = '<div class="card-title">' + esc(T('hd_meas_title')) + '</div>';
    if (!ms.length) html += '<p class="hd-note">' + esc(T('hd_no_meas')) + '</p>';
    /* 折叠口径（2026-10-26 用户定）：默认只显最近 5 条；现行定稿若不在其内，
     * 置顶常显（全宅基准不能藏）；卡底「展开全部（共 N 条）/收起」切换，N≤5 不显。
     * 再测入口已收敛到定稿卡「罗盘实测」，本卡不再设测钮。 */
    var vis = ms;
    if (!S.measOpen && ms.length > 5) {
      vis = ms.slice(0, 5);
      if (fx && vis.indexOf(fx) === -1) vis = [fx].concat(vis);
    }
    html += vis.map(function (m) {
      var meta = [fmtDT(m.ts)];
      if (m.decl != null && isFinite(m.decl)) meta.push(esc(TF(T('hd_m_decl'), fmtDecl(m.decl))));
      if (m.gps) meta.push('GPS ' + m.gps.lat.toFixed(4) + ', ' + m.gps.lon.toFixed(4));
      if (m.accDeg != null && isFinite(m.accDeg)) meta.push('±' + (Math.round(m.accDeg * 10) / 10) + '°');
      if (fx && !m.fixed) meta.push(esc(TF(T('hd_m_diff'), Math.round(angDiff(m.facingDeg, fx.facingDeg) * 10) / 10)));
      return '<div class="hd-log"><div class="hd-log-top">' +
        '<span class="hd-log-deg">' + fmtDeg(m.facingDeg) + '°</span>' +
        '<span class="hd-log-mtn">' + esc(m.facing) + esc(T('hd_mtn_suffix')) + '</span>' +
        (m.point ? '<span class="hd-log-pt">' + esc(pointName(m.point)) + '</span>'
                 : '<span class="hd-log-pt none" data-ptfor="' + m.id + '">' + esc(T('hd_point_none')) + '</span>') +
        (m.fixed ? '<span class="hd-chip done">' + esc(T('hd_fixed_chip')) + '</span>'
                 : '<span class="hd-setfix" data-setfix="' + m.id + '">' + esc(T('hd_set_fixed')) + '</span>') +
        '</div><p class="hd-log-meta">' + meta.join(' · ') +
        ' <span class="hd-del" data-delmeas="' + m.id + '">' + esc(T('hd_del')) + '</span></p></div>';
    }).join('');
    if (ms.length > 5) {
      html += '<button class="hd-more" id="hd-meas-toggle">' +
        esc(S.measOpen ? T('hd_meas_collapse') : TF(T('hd_meas_expand'), ms.length)) + '</button>';
    }
    box.innerHTML = html;
    var tg = $('hd-meas-toggle');
    if (tg) tg.addEventListener('click', function () { S.measOpen = !S.measOpen; renderDetail(); });
    Array.prototype.forEach.call(box.querySelectorAll('[data-setfix]'), function (el) {
      el.addEventListener('click', function () {
        var id = +el.getAttribute('data-setfix');
        db.measurements.where('houseId').equals(h.id).modify(function (m) { m.fixed = m.id === id; })
          .then(function () { return syncMirror(); })
          .then(renderDetail);
      });
    });
    Array.prototype.forEach.call(box.querySelectorAll('[data-ptfor]'), function (el) {
      el.addEventListener('click', function () { labelPoint(+el.getAttribute('data-ptfor')); });
    });
    Array.prototype.forEach.call(box.querySelectorAll('[data-delmeas]'), function (el) {
      el.addEventListener('click', function () {
        var id = +el.getAttribute('data-delmeas');
        hdDlgConfirm(T('hd_confirm_del_meas')).then(function (ok) {
          if (!ok) return;
          db.measurements.delete(id).then(function () { return syncMirror(); }).then(renderDetail);
        });
      });
    });
  }

  /* 详情页户型缩略：真实 plan（房间轮廓＋九宫虚线＋立极＋大门标），与编辑器同数据 */
  function planThumb(plan, fx) {
    if (!plan) return '';
    var rooms = plan.rooms || [], tr = plan.trace && plan.trace.rect;
    if (!rooms.length && !tr) return '';
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    function ext(x, y) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
    rooms.forEach(function (r) { ext(r.x, r.y); ext(r.x + r.w, r.y + r.h); });
    if (tr) { ext(tr.x, tr.y); ext(tr.x + tr.w, tr.y + tr.h); }
    if (x1 <= x0 || y1 <= y0) return '';
    var m = Math.max(x1 - x0, y1 - y0) * 0.06 + 0.2;
    x0 -= m; y0 -= m; x1 += m; y1 += m;
    var W = x1 - x0, fs = W / 15;
    var s = '<svg viewBox="' + x0 + ' ' + y0 + ' ' + W + ' ' + (y1 - y0) + '" width="100%" style="display:block" aria-hidden="true">';
    if (tr) s += '<rect x="' + tr.x + '" y="' + tr.y + '" width="' + tr.w + '" height="' + tr.h + '" fill="var(--paper-2)" stroke="var(--line-soft)"/>';
    if (fx && plan.liji) {
      var lx = plan.liji.x, ly = plan.liji.y;
      var hw = Math.max(lx - x0, x1 - lx), hh = Math.max(ly - y0, y1 - ly);
      s += '<g stroke="var(--gold)" stroke-width="' + (W / 300) + '" stroke-dasharray="' + (W / 60) + ' ' + (W / 90) + '" opacity=".55">' +
        '<line x1="' + (lx - hw / 3) + '" y1="' + (ly - hh) + '" x2="' + (lx - hw / 3) + '" y2="' + (ly + hh) + '"/>' +
        '<line x1="' + (lx + hw / 3) + '" y1="' + (ly - hh) + '" x2="' + (lx + hw / 3) + '" y2="' + (ly + hh) + '"/>' +
        '<line x1="' + (lx - hw) + '" y1="' + (ly - hh / 3) + '" x2="' + (lx + hw) + '" y2="' + (ly - hh / 3) + '"/>' +
        '<line x1="' + (lx - hw) + '" y1="' + (ly + hh / 3) + '" x2="' + (lx + hw) + '" y2="' + (ly + hh / 3) + '"/></g>';
    }
    rooms.forEach(function (r) {
      if (r.ex) { /* 户外排除块：虚线淡填、不显名 */
        s += '<rect x="' + r.x + '" y="' + r.y + '" width="' + r.w + '" height="' + r.h + '" fill="var(--paper-2)" fill-opacity="0.4" stroke="var(--faint)" stroke-dasharray="' + (W / 90) + '" stroke-width="' + (W / 260) + '"/>';
        return;
      }
      s += '<rect x="' + r.x + '" y="' + r.y + '" width="' + r.w + '" height="' + r.h + '" fill="var(--paper-2)" stroke="var(--line)" stroke-width="' + (W / 260) + '"/>' +
        '<text x="' + (r.x + r.w / 2) + '" y="' + (r.y + r.h / 2 + fs * 0.36) + '" text-anchor="middle" font-size="' + fs + '" fill="var(--ink-2)" font-family="var(--serif)">' + esc(r.name || '') + '</text>';
    });
    (plan.fixtures || []).forEach(function (f) {
      if (f.type !== 'door') return;
      s += '<circle cx="' + f.x + '" cy="' + f.y + '" r="' + (W / 90) + '" fill="var(--gold)"/>';
    });
    if (fx && plan.liji) s += '<circle cx="' + plan.liji.x + '" cy="' + plan.liji.y + '" r="' + (W / 70) + '" fill="none" stroke="var(--gold)" stroke-width="' + (W / 200) + '"/>';
    if (fx) s += '<text x="' + ((x0 + x1) / 2) + '" y="' + (y0 + fs * 1.15) + '" text-anchor="middle" font-size="' + fs + '" fill="var(--gold-deep)">' + esc(TF(T('hd_plan_facing'), fx.facing)) + '</text>';
    return s + '</svg>';
  }

  function renderFloors(h, fls) {
    var box = $('hd-floors'); if (!box) return;
    var chips = fls.map(function (f) {
      return '<span class="hd-ftab' + (f.id === S.curFloor ? ' on' : '') + '" data-fl="' + f.id + '">' + esc(f.name) + '</span>';
    }).join('');
    var cur = fls.filter(function (f) { return f.id === S.curFloor; })[0];
    box.innerHTML = '<div class="card-title">' + esc(T('hd_floors_title')) + '</div>' +
      '<div class="hd-floors-row">' + chips +
      '<span class="hd-ftab add" id="hd-fl-add">' + esc(T('hd_floor_add')) + '</span></div>' +
      (cur ? '<div class="hd-floor-mgmt"><span>' + esc(cur.name) + '</span>' +
        '<span class="hd-link" id="hd-fl-rename">' + esc(T('hd_rename')) + '</span>' +
        (fls.length > 1 ? '<span class="hd-link danger" id="hd-fl-del">' + esc(T('hd_del_floor')) + '</span>' : '') +
        '</div>' : '') +
      '<div class="hd-planprev"><div id="hd-plan-box"><div class="hd-plan-empty">' + esc(T('hd_plan_empty')) + '</div></div>' +
      '<div class="hd-plan-cap"><span>' + esc(cur ? cur.name : '') + '</span><span>' + esc(T('hd_plan_cap')) + '</span></div></div>' +
      (cur ? '<button class="hd-more" id="hd-plan-edit">' + esc(T('hd_edit_plan')) + '</button>' : '');
    var pe = $('hd-plan-edit');
    if (pe && cur) pe.addEventListener('click', function () {
      if (window.__wuriPlan) __wuriPlan.open(h.id, cur.id);
    });
    if (cur) {
      Promise.all([db.plans.get(cur.id), fixedOf(h.id)]).then(function (r) {
        var pb = $('hd-plan-box'); if (!pb) return;
        var svg = planThumb(r[0], r[1]);
        if (svg) pb.innerHTML = svg;
      }).catch(function () {});
    }
    Array.prototype.forEach.call(box.querySelectorAll('[data-fl]'), function (el) {
      el.addEventListener('click', function () { S.curFloor = +el.getAttribute('data-fl'); renderDetail(); });
    });
    $('hd-fl-add').addEventListener('click', function () {
      hdDlgPrompt(T('hd_floor_name_prompt'), '', T('hd_save')).then(function (name) {
        if (!name || !name.trim()) return;
        db.floors.add({ houseId: h.id, name: name.trim(), sort: fls.length }).then(function (id) {
          S.curFloor = id; renderDetail();
        });
      });
    });
    var rn = $('hd-fl-rename');
    if (rn) rn.addEventListener('click', function () {
      hdDlgPrompt(T('hd_floor_name_prompt'), cur.name, T('hd_save')).then(function (name) {
        if (!name || !name.trim()) return;
        db.floors.update(cur.id, { name: name.trim() }).then(renderDetail);
      });
    });
    var dl = $('hd-fl-del');
    if (dl) dl.addEventListener('click', function () {
      hdDlgConfirm(T('hd_confirm_del_floor')).then(function (ok) {
        if (!ok) return;
        db.photos.where('houseId').equals(h.id).and(function (p) { return p.floorId === cur.id; })
          .modify(function (p) { p.floorId = null; })
          .then(function () { return db.plans.delete(cur.id); })
          .then(function () { return db.floors.delete(cur.id); })
          .then(function () { S.curFloor = 0; renderDetail(); });
      });
    });
  }

  /* ---------------- 照片 ---------------- */
  var pendingGuide = null;
  function compressPhoto(file) {
    var url = URL.createObjectURL(file);
    return new Promise(function (res, rej) {
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth, hh = img.naturalHeight;
        var scale = Math.min(1, 1600 / Math.max(w, hh));
        var cv = document.createElement('canvas');
        cv.width = Math.round(w * scale); cv.height = Math.round(hh * scale);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url);
        cv.toBlob(function (b) { b ? res(b) : rej(new Error('toBlob')); }, 'image/jpeg', 0.82);
      };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('img')); };
      img.src = url;
    });
  }
  function addPhotos(files, cat, guideKey) {
    var hid = S.curHouse;
    var jobs = Array.prototype.map.call(files, function (f) {
      return compressPhoto(f).then(function (blob) {
        return db.photos.add({
          houseId: hid, floorId: S.curFloor || null,
          cat: cat, guideKey: guideKey || null, blob: blob, ts: Date.now()
        });
      }).catch(function () {});
    });
    return Promise.all(jobs).then(function () {
      if (guideKey) {
        return db.guides.get(hid).then(function (g) {
          var checks = (g && g.checks) || {};
          checks[guideKey] = true;
          return db.guides.put({ houseId: hid, checks: checks });
        });
      }
    }).then(function () { pendingGuide = null; renderDetail(); renderStorage(); });
  }
  function bindFileInputs() {
    var cam = $('hd-file-cam'), alb = $('hd-file-alb');
    function onPick(input) {
      return function () {
        var files = input.files;
        if (files && files.length) {
          var cat = pendingGuide ? 'zhoubian' : (S.cat !== 'all' ? S.cat : 'qita');
          addPhotos(files, cat, pendingGuide);
        }
        input.value = '';
      };
    }
    if (cam) cam.addEventListener('change', onPick(cam));
    if (alb) alb.addEventListener('change', onPick(alb));
  }
  function renderPhotos(h, photos) {
    var box = $('hd-photos'); if (!box) return;
    var counts = { all: photos.length };
    CATS.forEach(function (c) { counts[c] = photos.filter(function (p) { return p.cat === c; }).length; });
    var chips = ['all'].concat(CATS).map(function (c) {
      var lab = c === 'all' ? T('hd_cat_all') : catName(c);
      return '<span class="hd-cat' + (S.cat === c ? ' on' : '') + '" data-cat="' + c + '">' + esc(lab) + ' ' + counts[c] + '</span>';
    }).join('');
    var shown = S.cat === 'all' ? photos : photos.filter(function (p) { return p.cat === S.cat; });
    shown = shown.slice().sort(function (a, b) { return b.ts - a.ts; });
    S.shownPhotos = shown;
    box.innerHTML = '<div class="card-title">' + esc(T('hd_photos_title')) + '</div>' +
      '<div class="hd-cats">' + chips + '</div>' +
      '<div class="hd-wall" id="hd-wall"></div>' +
      '<div class="hd-photo-btns">' +
      '<button class="hd-more" id="hd-add-cam">' + esc(T('hd_take_photo')) + '</button>' +
      '<button class="hd-more" id="hd-add-alb">' + esc(T('hd_from_album')) + '</button></div>';
    var wall = $('hd-wall');
    shown.forEach(function (p) {
      var d = document.createElement('div');
      d.className = 'hd-photo';
      var img = document.createElement('img');
      img.src = URL.createObjectURL(p.blob);
      img.alt = '';
      img.addEventListener('load', function () { setTimeout(function () { URL.revokeObjectURL(img.src); }, 60000); });
      var cap = document.createElement('span');
      cap.textContent = catName(p.cat) + ' · ' + fmtDT(p.ts);
      d.appendChild(img); d.appendChild(cap);
      d.addEventListener('click', function () { openViewer(p); });
      wall.appendChild(d);
    });
    var add = document.createElement('div');
    add.className = 'hd-add'; add.textContent = '＋';
    add.addEventListener('click', function () { var a = $('hd-file-alb'); if (a) a.click(); });
    wall.appendChild(add);
    Array.prototype.forEach.call(box.querySelectorAll('[data-cat]'), function (el) {
      el.addEventListener('click', function () { S.cat = el.getAttribute('data-cat'); renderDetail(); });
    });
    $('hd-add-cam').addEventListener('click', function () { pendingGuide = null; var c = $('hd-file-cam'); if (c) c.click(); });
    $('hd-add-alb').addEventListener('click', function () { pendingGuide = null; var a = $('hd-file-alb'); if (a) a.click(); });
  }
  /* 查看器（第二批 B 补左右切换）：列表＝当前墙面显示顺序（详情分类或报告照片墙），
   * 左右钮/滑动/方向键翻页，钳制不循环；删除后就近落到相邻张，删空自动关。 */
  function openViewer(p) {
    var list = (S.shownPhotos && S.shownPhotos.length) ? S.shownPhotos : [p];
    var idx = -1;
    list.forEach(function (x, i) { if (x.id === p.id) idx = i; });
    if (idx < 0) { list = [p]; idx = 0; }
    S.viewerList = list.slice();
    S.viewerIdx = idx;
    var v = $('hd-viewer'); if (!v) return;
    v.hidden = false;
    viewerShow();
  }
  function viewerShow() {
    var p = S.viewerList[S.viewerIdx];
    if (!p) { closeViewer(); return; }
    S.viewerPhoto = p.id;
    var img = $('hd-viewer-img'); if (!img) return;
    if (S.viewerURL) URL.revokeObjectURL(S.viewerURL);
    S.viewerURL = URL.createObjectURL(p.blob);
    img.src = S.viewerURL;
    var n = S.viewerList.length;
    $('hd-viewer-cap').textContent = catName(p.cat) + ' · ' + fmtDT(p.ts) +
      (n > 1 ? '（' + (S.viewerIdx + 1) + ' / ' + n + '）' : '');
    var pv = $('hd-viewer-prev'), nx = $('hd-viewer-next');
    if (pv) pv.classList.toggle('off', S.viewerIdx <= 0);
    if (nx) nx.classList.toggle('off', S.viewerIdx >= n - 1);
  }
  function viewerNav(d) {
    var ni = S.viewerIdx + d;
    if (ni < 0 || ni >= S.viewerList.length) return;
    S.viewerIdx = ni;
    viewerShow();
  }
  function closeViewer() {
    var v = $('hd-viewer'); if (v) v.hidden = true;
    var img = $('hd-viewer-img');
    if (img) img.removeAttribute('src');
    if (S.viewerURL) { URL.revokeObjectURL(S.viewerURL); S.viewerURL = ''; }
    S.viewerPhoto = 0;
    S.viewerList = [];
    S.viewerIdx = 0;
  }

  function renderGuide(h, photos, guideRec) {
    var box = $('hd-guide'); if (!box) return;
    var checks = (guideRec && guideRec.checks) || {};
    var defs = guideDefs();
    var doneN = 0;
    var rows = defs.map(function (d) {
      var n = photos.filter(function (p) { return p.guideKey === d.k; }).length;
      var done = !!checks[d.k] || n > 0;
      if (done) doneN++;
      return '<div class="hd-guide-row' + (done ? ' done' : '') + '" data-guide="' + d.k + '">' +
        '<span class="box">' + (done ? '✓' : '') + '</span>' + esc(d.label) +
        '<span class="tag">' + (done ? esc(TF(T('hd_guide_done'), n || 1)) : esc(T('hd_guide_todo'))) + '</span></div>';
    }).join('');
    box.innerHTML = '<div class="card-title">' + esc(T('hd_guide_title')) + '</div>' + rows +
      '<div class="hd-prog"><i style="width:' + Math.round(doneN / defs.length * 100) + '%"></i></div>' +
      '<p class="hd-note">' + esc(TF(T('hd_guide_prog'), doneN, defs.length)) + '</p>';
    Array.prototype.forEach.call(box.querySelectorAll('[data-guide]'), function (el) {
      el.addEventListener('click', function () {
        pendingGuide = el.getAttribute('data-guide');
        var c = $('hd-file-cam'); if (c) c.click();
      });
    });
  }

  /* ---------------- 勘宅报告（第二批 B） ----------------
   * 结构：档案头＋定稿坐向与来源＋飞星盘图＋住户命卦表＋测量记录要目＋
   * 各层叠图＋照片墙＋备注＋落款。叠图口径与编辑器同源（定稿投影、九宫以
   * 立极为心、图层开关从各层 plan.layers 取舍）；导出走系统打印、入 Pro。 */
  var DIR8 = { '北': 0, '东北': 45, '东': 90, '东南': 135, '南': 180, '西南': 225, '西': 270, '西北': 315 };
  var DIR8_NAMES = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
  function reportPeriod() {
    var F = window.WuriSoulFs;
    try { if (window.__wuriFs2) return __wuriFs2.state().period; } catch (e) {}
    return F ? F.periodFromYear(new Date().getFullYear()) : 9;
  }
  function screenCellOf(dirName, facingDeg) {
    var th = DIR8[dirName];
    if (th === undefined || facingDeg == null) return null;
    var d = (th - facingDeg) * Math.PI / 180;
    return { col: 1 + Math.round(Math.sin(d)), row: 1 - Math.round(Math.cos(d)) };
  }
  function fxChartFor(fx) {
    var F = window.WuriSoulFs;
    if (!F || !fx) return null;
    try {
      var p = reportPeriod();
      return { chart: F.buildChart(1864 + (p - 1) * 20 + 10, fx.sitting), period: p };
    } catch (e) { return null; }
  }
  function bzFanFor(fx) {
    var F = window.WuriSoulFs;
    if (!F || !fx) return null;
    try { return F.palacesFor(F.houseGua(fx.sitting)); } catch (e) { return null; }
  }
  function fixMetaHtml(fx) {
    var meta = [];
    if (fx.point === 'manual') meta.push(esc(TF(T('hd_fix_from_manual'), fmtDT(fx.ts))));
    else if (fx.point) meta.push(esc(TF(T('hd_fix_from'), pointName(fx.point), fmtDT(fx.ts))));
    else meta.push(esc(TF(T('hd_fix_from'), T('hd_point_none'), fmtDT(fx.ts))));
    meta.push(fx.decl != null && isFinite(fx.decl)
      ? esc(TF(T('hd_fix_decl'), fmtDecl(fx.decl))) : esc(T('hd_fix_decl_na')));
    meta.push(fx.gps ? 'GPS ' + fx.gps.lat.toFixed(4) + ', ' + fx.gps.lon.toFixed(4) : 'GPS —');
    if (fx.accDeg != null && isFinite(fx.accDeg)) meta.push(esc(TF(T('hd_fix_acc'), Math.round(fx.accDeg * 10) / 10)));
    return meta.join('<br>');
  }
  function reportChartHtml(fxc, fx) {
    if (!fxc || !fxc.chart) return '';
    var chart = fxc.chart, per = fxc.period;
    var pNames = String(T('fs2_period_name')).split('|');
    var faceDir = DIR8_NAMES[Math.round(norm360(fx.facingDeg) / 45) % 8];
    var cells = chart.palaces.map(function (pl) {
      var isC = pl.key === 'center';
      var cell = isC ? { col: 1, row: 1 } : screenCellOf(pl.direction, fx.facingDeg);
      if (!cell) return '';
      var st = isC
        ? '<small>' + esc(T('hpe_period')) + '</small>' + pl.period
        : '<small>' + esc(T('fs2_mtn')) + '</small>' + (pl.mountain === per ? '<span class="w">' + pl.mountain + '</span>' : pl.mountain) +
          ' <small>' + esc(T('fs2_water')) + '</small>' + (pl.water === per ? '<span class="w">' + pl.water + '</span>' : pl.water);
      return '<div class="hdr-g9' + (!isC && pl.direction === faceDir ? ' face' : '') +
        '" style="grid-row:' + (cell.row + 1) + ';grid-column:' + (cell.col + 1) + '">' +
        '<span class="pg">' + esc(txs(pl.name)) + esc(T('hpe_palace_suffix')) + '</span>' +
        '<span class="st">' + st + '</span></div>';
    }).join('');
    return '<section class="card"><div class="card-title">' + esc(T('hdr_chart_title')) + '</div>' +
      '<div class="hdr-chart"><div class="hdr-chart-hd">' +
      '<div class="hdr-chart-t">' + esc(TF(T('hdr_chart_head'), pNames[per - 1] || (per + ''), fx.sitting, fx.facing)) + '</div>' +
      '<div class="hdr-chart-s">' + esc(T('hdr_chart_sub')) + '</div></div>' +
      '<div class="hdr-grid9">' + cells + '</div>' +
      '<div class="hdr-chart-ft">' + esc(txs(chart.label)) + ' · ' + esc(txs(chart.formation)) + '</div>' +
      '</div></section>';
  }
  function reportResHtml(rs) {
    var F = window.WuriSoulFs;
    var rows = rs.map(function (r) {
      var meta = [relName(r.rel), r.gender ? T(r.gender === 'male' ? 'fs2_male' : 'fs2_female') : '', birthText(r)]
        .filter(Boolean).join(' · ');
      var lucky = '';
      if (F && r.birthYear && r.gender) {
        try {
          var life = F.lifeGua(r.birthYear, r.gender);
          var pals = F.palacesFor(life).filter(function (p) { return p.star && p.star.kind === 'auspicious'; });
          var order = ['生气', '天医', '延年', '伏位'];
          pals.sort(function (a, b) {
            var ia = order.indexOf(txs(a.star.name)), ib = order.indexOf(txs(b.star.name));
            return (ia < 0 ? 9 : ia) - (ib < 0 ? 9 : ib);
          });
          if (pals.length) lucky = '<p class="hdr-res-lucky"><b>' + esc(T('hdr_c_lucky')) + '</b>：' +
            pals.map(function (p) { return esc(txs(p.star.name)) + ' · ' + esc(txs(p.direction)); }).join('　') + '</p>';
        } catch (e) {}
      }
      return '<div class="hdr-res-row"><div class="hdr-res-top">' +
        '<span class="hdr-res-name">' + esc(r.name) + '</span>' + guaHtml(r) + '</div>' +
        (meta ? '<p class="hdr-res-meta">' + esc(meta) + (r.note ? ' · ' + esc(r.note) : '') + '</p>' : '') +
        lucky + '</div>';
    }).join('');
    return '<section class="card"><div class="card-title">' + esc(T('hdr_res_title')) + '</div>' +
      (rs.length ? rows : '<p class="hd-note">' + esc(T('hdr_res_none')) + '</p>') + '</section>';
  }
  function reportMeasHtml(ms, fx) {
    var rows = ms.map(function (m) {
      var meta = [fmtDT(m.ts)];
      if (m.decl != null && isFinite(m.decl)) meta.push(esc(TF(T('hd_m_decl'), fmtDecl(m.decl))));
      if (m.gps) meta.push('GPS ' + m.gps.lat.toFixed(4) + ', ' + m.gps.lon.toFixed(4));
      if (m.accDeg != null && isFinite(m.accDeg)) meta.push('±' + (Math.round(m.accDeg * 10) / 10) + '°');
      if (fx && !m.fixed) meta.push(esc(TF(T('hd_m_diff'), Math.round(angDiff(m.facingDeg, fx.facingDeg) * 10) / 10)));
      return '<div class="hd-log"><div class="hd-log-top">' +
        '<span class="hd-log-deg">' + fmtDeg(m.facingDeg) + '°</span>' +
        '<span class="hd-log-mtn">' + esc(m.facing) + esc(T('hd_mtn_suffix')) + '</span>' +
        (m.point ? '<span class="hd-log-pt">' + esc(pointName(m.point)) + '</span>'
                  : '<span class="hd-log-pt">' + esc(T('hd_point_none')) + '</span>') +
        (m.fixed ? '<span class="hd-chip done">' + esc(T('hd_fixed_chip')) + '</span>' : '') +
        '</div><p class="hd-log-meta">' + meta.join(' · ') + '</p></div>';
    }).join('');
    return '<section class="card"><div class="card-title">' + esc(T('hdr_meas_title')) + '</div>' +
      (ms.length ? rows : '<p class="hd-note">' + esc(T('hd_no_meas')) + '</p>') + '</section>';
  }
  /* 报告叠图：与编辑器同几何（extent→立极→九宫格），图层从 plan.layers 取舍 */
  function planReportSVG(plan, fx, fxc, fan, photos) {
    if (!plan) return '';
    var L = Object.assign({
      rooms: true, fixtures: true, dims: true, overlay: 'fx', palNames: true,
      roomNames: true, traceBg: true, ovOpacity: 0.92
    }, plan.layers || {});
    var rooms = plan.rooms || [], tr = plan.trace && plan.trace.rect;
    if (!rooms.length && !tr) return '';
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    function ext(x, y) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
    rooms.forEach(function (r) { ext(r.x, r.y); ext(r.x + r.w, r.y + r.h); });
    if (tr) { ext(tr.x, tr.y); ext(tr.x + tr.w, tr.y + tr.h); }
    var liji = plan.liji || { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
    ext(liji.x, liji.y);
    var m = Math.max(x1 - x0, y1 - y0) * 0.06 + 0.2;
    x0 -= m; y0 -= m; x1 += m; y1 += m;
    var W = x1 - x0, H = y1 - y0, fs = W / 15, mpu = plan.mPerUnit || 1;
    var s = '<svg viewBox="' + x0 + ' ' + y0 + ' ' + W + ' ' + H + '" width="100%" style="display:block" aria-hidden="true">';
    if (tr) {
      var bg = '';
      if (L.traceBg && plan.trace.photoId && photos) {
        var tp = photos.filter(function (p) { return p.id === plan.trace.photoId; })[0];
        if (tp) { bg = URL.createObjectURL(tp.blob); S.reportURLs.push(bg); }
      }
      if (bg) s += '<image href="' + bg + '" x="' + tr.x + '" y="' + tr.y + '" width="' + tr.w + '" height="' + tr.h + '" opacity="' + (plan.trace.opacity == null ? 0.62 : plan.trace.opacity) + '" preserveAspectRatio="none"/>';
      else s += '<rect x="' + tr.x + '" y="' + tr.y + '" width="' + tr.w + '" height="' + tr.h + '" style="fill:var(--paper-2)" stroke="var(--line-soft)"/>';
    }
    if (L.rooms) rooms.forEach(function (r) {
      if (r.ex) { /* 户外排除块：报告里只留虚线轮廓，无名无面积 */
        s += '<rect x="' + r.x + '" y="' + r.y + '" width="' + r.w + '" height="' + r.h + '" style="fill:none;stroke:var(--faint)" stroke-dasharray="' + (W / 90) + '" stroke-width="' + (W / 260) + '"/>';
        return;
      }
      s += '<rect x="' + r.x + '" y="' + r.y + '" width="' + r.w + '" height="' + r.h + '" style="fill:var(--paper-2);stroke:var(--line)" stroke-width="' + (W / 260) + '"/>' +
        (L.roomNames && r.name ? '<text x="' + (r.x + r.w / 2) + '" y="' + (r.y + r.h / 2 + fs * 0.36) + '" text-anchor="middle" font-size="' + fs + '" style="fill:var(--ink-2)" font-family="var(--serif)">' + esc(r.name) + '</text>' : '') +
        (L.dims ? '<text x="' + (r.x + r.w - fs * 0.3) + '" y="' + (r.y + r.h - fs * 0.3) + '" text-anchor="end" font-size="' + (fs * 0.62) + '" style="fill:var(--muted)">' + (Math.round(r.w * r.h * mpu * mpu * 10) / 10) + '㎡</text>' : '');
    });
    if (fx && (L.overlay === 'fx' || L.overlay === 'bz')) {
      var hw = Math.max(liji.x - x0, x1 - liji.x, W * 0.2), hh = Math.max(liji.y - y0, y1 - liji.y, H * 0.2);
      var gx = liji.x - hw, gy = liji.y - hh, gw = hw * 2, gh = hh * 2, cw = gw / 3, ch = gh / 3;
      var op = L.ovOpacity == null ? 0.92 : L.ovOpacity;
      s += '<g opacity="' + op + '"><g style="stroke:var(--gold)" stroke-width="' + (W / 300) + '" stroke-dasharray="' + (W / 60) + ' ' + (W / 90) + '" opacity=".6">' +
        '<line x1="' + (gx + cw) + '" y1="' + gy + '" x2="' + (gx + cw) + '" y2="' + (gy + gh) + '"/>' +
        '<line x1="' + (gx + cw * 2) + '" y1="' + gy + '" x2="' + (gx + cw * 2) + '" y2="' + (gy + gh) + '"/>' +
        '<line x1="' + gx + '" y1="' + (gy + ch) + '" x2="' + (gx + gw) + '" y2="' + (gy + ch) + '"/>' +
        '<line x1="' + gx + '" y1="' + (gy + ch * 2) + '" x2="' + (gx + gw) + '" y2="' + (gy + ch * 2) + '"/></g>';
      function capText(px, py, txt, hot) {
        var fsS = fs * 0.66, capW = txt.length * fsS * 0.62 + fs * 0.55;
        return '<g><rect x="' + (px + cw - capW - fs * 0.2) + '" y="' + (py + ch - fsS * 1.75) + '" width="' + capW + '" height="' + (fsS * 1.42) + '" rx="' + (fs * 0.24) + '"' +
          ' style="fill:' + (hot ? 'var(--gold)' : 'var(--card)') + ';stroke:var(--line)" stroke-width="' + (W / 420) + '"/>' +
          '<text x="' + (px + cw - fs * 0.2 - capW / 2) + '" y="' + (py + ch - fsS * 0.68) + '" text-anchor="middle" font-size="' + fsS + '"' +
          ' style="fill:' + (hot ? 'var(--card)' : 'var(--ink)') + '">' + esc(txt) + '</text></g>';
      }
      if (L.overlay === 'fx' && fxc && fxc.chart) {
        fxc.chart.palaces.forEach(function (pl) {
          var isC = pl.key === 'center';
          var cell = isC ? { col: 1, row: 1 } : screenCellOf(pl.direction, fx.facingDeg);
          if (!cell) return;
          var px = gx + cw * cell.col, py = gy + ch * cell.row;
          if (L.palNames) s += '<text x="' + (px + fs * 0.24) + '" y="' + (py + fs * 0.88) + '" font-size="' + (fs * 0.6) + '" style="fill:var(--gold-deep)">' + esc(txs(pl.name)) + esc(T('hpe_palace_suffix')) + '</text>';
          var txt = isC ? T('hpe_period') + ' ' + pl.period
            : T('hpe_mtn_s') + pl.mountain + ' ' + T('hpe_wtr_s') + pl.water;
          s += capText(px, py, txt, !isC && (pl.mountain === fxc.period || pl.water === fxc.period));
        });
      } else if (L.overlay === 'bz' && fan) {
        fan.forEach(function (pl) {
          var cell = screenCellOf(pl.direction, fx.facingDeg);
          if (!cell) return;
          var px = gx + cw * cell.col, py = gy + ch * cell.row;
          if (L.palNames) s += '<text x="' + (px + fs * 0.24) + '" y="' + (py + fs * 0.88) + '" font-size="' + (fs * 0.6) + '" style="fill:var(--gold-deep)">' + esc(txs(pl.name)) + esc(T('hpe_palace_suffix')) + '</text>';
          s += capText(px, py, txs(pl.star.name), pl.star.kind === 'auspicious');
        });
      }
      s += '</g>';
    }
    if (L.fixtures) (plan.fixtures || []).forEach(function (f) {
      var lab = T('hpe_fix_' + f.type);
      if (lab === 'hpe_fix_' + f.type) lab = f.type;
      s += '<circle cx="' + f.x + '" cy="' + f.y + '" r="' + (W / 110) + '" style="fill:var(--gold)"/>' +
        '<text x="' + f.x + '" y="' + (f.y - W / 60) + '" text-anchor="middle" font-size="' + (fs * 0.55) + '" style="fill:var(--ink-2)">' + esc(txs(lab)) + '</text>';
    });
    if (fx) {
      s += '<circle cx="' + liji.x + '" cy="' + liji.y + '" r="' + (W / 70) + '" fill="none" style="stroke:var(--gold)" stroke-width="' + (W / 200) + '"/>' +
        '<text x="' + liji.x + '" y="' + (liji.y + W / 38) + '" text-anchor="middle" font-size="' + (fs * 0.55) + '" style="fill:var(--gold-deep)">' + esc(T('hpe_liji')) + '</text>' +
        '<text x="' + ((x0 + x1) / 2) + '" y="' + (y0 + fs * 1.15) + '" text-anchor="middle" font-size="' + fs + '" style="fill:var(--gold-deep)">' + esc(TF(T('hd_plan_facing'), fx.facing)) + '</text>';
    }
    return s + '</svg>';
  }
  function renderReport(hid) {
    var body = $('hdr-body'); if (!body) return;
    S.reportURLs.forEach(function (u) { URL.revokeObjectURL(u); });
    S.reportURLs = [];
    Promise.all([
      db.houses.get(hid),
      db.measurements.where('houseId').equals(hid).toArray(),
      db.residents.where('houseId').equals(hid).toArray(),
      db.floors.where('houseId').equals(hid).toArray(),
      db.photos.where('houseId').equals(hid).toArray()
    ]).then(function (r) {
      var h = r[0]; if (!h) return;
      var ms = r[1].slice().sort(function (a, b) { return b.ts - a.ts; });
      var fx = ms.filter(function (m) { return m.fixed; })[0] || null;
      var rs = r[2].slice().sort(function (a, b) { return a.id - b.id; });
      var fls = r[3].slice().sort(function (a, b) { return (a.sort || 0) - (b.sort || 0) || a.id - b.id; });
      var photos = r[4].slice().sort(function (a, b) { return b.ts - a.ts; });
      var fxc = fxChartFor(fx), fan = bzFanFor(fx);
      return Promise.all(fls.map(function (f) { return db.plans.get(f.id); })).then(function (plans) {
        var cli = [h.client, h.phone].filter(Boolean).join(' · ');
        var html = '<section class="card">' +
          '<div class="hd-name">' + esc(h.name || T('hd_unnamed')) + '</div>' +
          (h.address ? '<div class="hd-kv" style="margin-top:8px"><span class="k">' + esc(T('hd_f_address')) + '</span><span>' + esc(h.address) + '</span></div>' : '') +
          (cli ? '<div class="hd-kv"><span class="k">' + esc(T('hd_f_client')) + '</span><span>' + esc(cli) + '</span></div>' : '') +
          (h.surveyDate ? '<div class="hd-kv"><span class="k">' + esc(T('hd_f_date')) + '</span><span>' + esc(h.surveyDate) + '</span></div>' : '') +
          (fx
            ? '<div class="hd-fix-main"><div class="hd-fix-big">' + esc(TF(T('hd_sit_face_big'), fx.sitting, fx.facing)) + '</div>' +
              '<div class="hd-fix-deg">' + esc(TF(T('hd_fix_deg'), fmtDeg(fx.facingDeg), dir8Name(fx.facingDeg))) + '</div>' +
              '<p class="hd-fix-meta">' + fixMetaHtml(fx) + '</p></div>'
            : '<p class="hd-note" style="margin-top:10px">' + esc(T('hdr_no_fixed')) + '</p>') +
          '</section>';
        html += reportChartHtml(fxc, fx);
        html += reportResHtml(rs);
        html += reportMeasHtml(ms, fx);
        html += '<section class="card"><div class="card-title">' + esc(T('hdr_floors_title')) + '</div>' +
          fls.map(function (f, i) {
            var svg = planReportSVG(plans[i], fx, fxc, fan, photos);
            return '<div class="hdr-floor-t">' + esc(f.name) + '</div>' +
              (svg ? '<div class="hdr-planbox">' + svg + '</div>'
                   : '<p class="hd-note">' + esc(T('hdr_no_plan')) + '</p>');
          }).join('') +
          '<p class="hd-note" style="margin-top:10px">' + esc(T('hdr_floors_note')) + '</p></section>';
        html += '<section class="card"><div class="card-title">' + esc(T('hdr_photos_title')) + '</div>' +
          (photos.length ? '<div class="hd-wall" id="hdr-wall"></div>'
                         : '<p class="hd-note">' + esc(T('hdr_photos_none')) + '</p>') + '</section>';
        var noteLines = String(h.note || '').split(/\n+/).map(function (x) { return x.trim(); }).filter(Boolean);
        var spread = '';
        if (fx && ms.length >= 2) {
          var mx = 0;
          ms.forEach(function (a) { ms.forEach(function (b) { mx = Math.max(mx, angDiff(a.facingDeg, b.facingDeg)); }); });
          spread = TF(T('hdr_spread'), ms.length, Math.round(mx * 10) / 10, fmtDeg(fx.facingDeg));
        }
        html += '<section class="card"><div class="card-title">' + esc(T('hdr_note_title')) + '</div>' +
          (noteLines.length
            ? '<ul class="hdr-obs">' + noteLines.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>'
            : '<p class="hd-note">' + esc(T('hdr_note_none')) + '</p>') +
          (spread ? '<p class="hd-note" style="margin-top:8px">' + esc(spread) + '</p>' : '') +
          '</section>';
        html += '<div class="hdr-sign"><div class="brand">' + esc(T('hdr_sign_brand')) + '</div>' +
          '<div class="date">' + esc(TF(T('hdr_sign_line'), fmtYMD(Date.now()))) + '</div></div>' +
          '<p class="hdr-foot">' + esc(T('fs_foot')) + '</p>';
        body.innerHTML = html;
        var wall = $('hdr-wall');
        if (wall) {
          photos.forEach(function (p) {
            var d = document.createElement('div');
            d.className = 'hd-photo';
            var img = document.createElement('img');
            var u = URL.createObjectURL(p.blob);
            img.src = u; img.alt = '';
            img.addEventListener('load', function () { setTimeout(function () { URL.revokeObjectURL(u); }, 60000); });
            var cap = document.createElement('span');
            cap.textContent = catName(p.cat) + ' · ' + fmtDT(p.ts);
            d.appendChild(img); d.appendChild(cap);
            d.addEventListener('click', function () { S.shownPhotos = photos; openViewer(p); });
            wall.appendChild(d);
          });
        }
      });
    }).catch(function () {});
  }
  function openReport() {
    if (!S.curHouse) return;
    closeDetail();
    var v = $('view-house-report'); if (!v) return;
    v.hidden = false;
    window.scrollTo(0, 0);
    renderReport(S.curHouse);
  }
  function closeReport() {
    var v = $('view-house-report'); if (v) v.hidden = true;
    S.reportURLs.forEach(function (u) { URL.revokeObjectURL(u); });
    S.reportURLs = [];
    if (S.curHouse) openDetail(S.curHouse);
  }

  /* ---------------- 接线 ---------------- */
  /* 罗盘页顶语境条：目标键在位（自定稿卡定向进入）显「为『X宅』定向」，否则藏。
   * 由 fengshui.js openCompass 每次进页调用，覆盖专页卡进入（键已清）与详情进入两路。 */
  function syncCompassCtx() {
    var bar = $('fs-ctx'); if (!bar) return;
    var tid = 0;
    try { tid = parseInt(sessionStorage.getItem(TARGET_KEY) || '0', 10) || 0; } catch (e) {}
    if (!tid) { bar.hidden = true; bar.textContent = ''; return; }
    db.houses.get(tid).then(function (h) {
      /* 异步回来时键可能已被清/换，以最新键为准 */
      var now = 0;
      try { now = parseInt(sessionStorage.getItem(TARGET_KEY) || '0', 10) || 0; } catch (e) {}
      if (!h || now !== tid) { if (!now) { bar.hidden = true; bar.textContent = ''; } return; }
      bar.textContent = TF(T('hd_ctx_for'), h.name || T('hd_unnamed'));
      bar.hidden = false;
    });
  }
  /* 罗盘页「返回」：自详情定向进入时不落档、回该宅详情（顺带清目标键防残留夺稿） */
  function onCompassBack() {
    try { sessionStorage.removeItem(TARGET_KEY); } catch (e) {}
    if (S.returnToDetail && S.curHouse) { S.returnToDetail = false; openDetail(S.curHouse); }
  }
  function afterCompass() {
    try { sessionStorage.removeItem(TARGET_KEY); } catch (e) {}
    if (S.returnToDetail && S.curHouse) { S.returnToDetail = false; openDetail(S.curHouse); }
  }
  function init() {
    var nb = $('hd-new');
    if (nb) nb.addEventListener('click', function () {
      db.houses.count().then(function (n) {
        if (n >= 1 && !isPro()) { requirePro(); return; }
        return createHouse({}).then(function (h) { openDetail(h.id, true); });
      });
    });
    var lb = $('hd-back'); if (lb) lb.addEventListener('click', closeList);
    var dbk = $('hd-detail-back');
    if (dbk) dbk.addEventListener('click', function () {
      closeDetail(); renderList();
      var lv = $('view-houses'); if (lv) lv.hidden = false; /* 罗盘回程 closeList 藏过列表，返回须落回列表层 */
    });
    var eb = $('hd-export'); if (eb) eb.addEventListener('click', exportBackup);
    var del = $('hd-del-house');
    if (del) del.addEventListener('click', function () {
      var hid = S.curHouse; if (!hid) return;
      hdDlgConfirm(T('hd_confirm_del_house')).then(function (ok) {
        if (!ok) return;
        Promise.all([
          db.measurements.where('houseId').equals(hid).delete(),
          db.photos.where('houseId').equals(hid).delete(),
          db.floors.where('houseId').equals(hid).delete(),
          db.residents.where('houseId').equals(hid).delete(),
          db.plans.where('houseId').equals(hid).delete(),
          db.guides.delete(hid)
        ]).then(function () { return db.houses.delete(hid); })
          .then(function () { return syncMirror(); })
          .then(function () { S.curHouse = 0; closeDetail(); openList(); });
      });
    });
    var vx = $('hd-viewer-close'); if (vx) vx.addEventListener('click', closeViewer);
    var vd = $('hd-viewer-del');
    if (vd) vd.addEventListener('click', function () {
      if (!S.viewerPhoto) return;
      var delId = S.viewerPhoto;
      hdDlgConfirm(T('hd_confirm_del_photo')).then(function (ok) {
        if (!ok) return;
        db.photos.delete(delId).then(function () {
          S.viewerList = S.viewerList.filter(function (x) { return x.id !== delId; });
          S.shownPhotos = S.shownPhotos.filter(function (x) { return x.id !== delId; });
          if (!S.viewerList.length) closeViewer();
          else { if (S.viewerIdx >= S.viewerList.length) S.viewerIdx = S.viewerList.length - 1; viewerShow(); }
          renderDetail();
        });
      });
    });
    var vpv = $('hd-viewer-prev'), vnx = $('hd-viewer-next');
    if (vpv) vpv.addEventListener('click', function () { viewerNav(-1); });
    if (vnx) vnx.addEventListener('click', function () { viewerNav(1); });
    var vel = $('hd-viewer');
    if (vel) {
      var tx0 = null;
      vel.addEventListener('touchstart', function (e) {
        tx0 = e.changedTouches && e.changedTouches.length ? e.changedTouches[0].clientX : null;
      }, { passive: true });
      vel.addEventListener('touchend', function (e) {
        if (tx0 == null || !e.changedTouches || !e.changedTouches.length) return;
        var dx = e.changedTouches[0].clientX - tx0;
        tx0 = null;
        if (Math.abs(dx) > 48) viewerNav(dx < 0 ? 1 : -1);
      }, { passive: true });
    }
    document.addEventListener('keydown', function (e) {
      var v = $('hd-viewer');
      if (!v || v.hidden) return;
      if (e.key === 'ArrowLeft') viewerNav(-1);
      else if (e.key === 'ArrowRight') viewerNav(1);
      else if (e.key === 'Escape') closeViewer();
    });
    var rop = $('hd-report-open');
    if (rop) rop.addEventListener('click', function () { openReport(); });
    var rbk = $('hdr-back');
    if (rbk) rbk.addEventListener('click', function () { closeReport(); });
    var rex = $('hdr-export');
    if (rex) rex.addEventListener('click', function () {
      if (!isPro()) { requirePro(); return; }
      window.print();
    });
    bindFileInputs();
    var pr = $('fs-point-row'); if (pr) pr.hidden = false;
    migrate().then(function () {
      /* 首屏专页卡由 fengshui.js renderArch 已按旧口径画过一次，这里接管重绘 */
      if (window.__wuriFs && __wuriFs.renderArchNow) __wuriFs.renderArchNow();
    });
    if (window.__wuri_rerender) {
      var prev = window.__wuri_rerender;
      window.__wuri_rerender = function () {
        prev();
        GUIDE_DEFS = null;
        var lv = $('view-houses'), dv = $('view-house');
        if (lv && !lv.hidden) renderList();
        if (dv && !dv.hidden) renderDetail();
      };
    }
  }
  init();

  window.__wuriHouse = {
    renderHub: renderHub,
    recordCompass: recordCompass,
    saveCompass: saveCompass,
    afterCompass: afterCompass,
    syncCompassCtx: syncCompassCtx,
    onCompassBack: onCompassBack,
    openList: openList,
    openDetail: openDetail,
    openReport: openReport,
    exportBackup: exportBackup,
    db: db,
    syncMirror: syncMirror
  };
})();
