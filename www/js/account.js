/* 戊日不上香 · 账号＋云同步 v1（2026-10-26）
 * 设计蓝本：~/workspace/wuri-app/account-design/DESIGN.md；后端：pay.shengboyu.ca（src/account.js）。
 * 用户定版五条：①赠送码/免费期不自动跟账号（服务端归集只认购买码邮箱匹配，客户端无自助绑码入口）；
 * ②无设备概念——不列设备、不设上限，仅「退出全部设备」安全出口；③v1 不做端到端加密，文案如实；
 * ④配额免费 200MB／高级版 2GB，超限只停新照片；⑤身份层只实现邮箱。
 *
 * 架构口径：
 * - 本地永远是全量主本，云端只是副本；没登录/没网/同步失败，App 与数据都不受影响。
 * - 键组走整键快照（数据集 ls，与文件备份 BACKUP_KEYS 同构扩编）；家宅走逐条增量
 *   （数据集 house.<表>），跨设备身份用 Dexie v4 的 uuid 字段，本地数字 id 永不出设备。
 * - 变更侦测用「影子哈希」：本地存一份上次同步确认过的哈希账（shadow），与现状 diff 即待传队列，
 *   不侵入 house.js / 各模块的既有写点；失败不更新影子，下次自动续传（离线队列语义）。
 * - 冲突：逐条时间戳、后存为准（服务端同口径）；删除走墓碑。
 */
(function () {
  'use strict';
  var API = 'https://pay.shengboyu.ca';
  function $(id) { return document.getElementById(id); }
  function T(k) { return window.t ? window.t(k) : k; }
  function TF(fmt) {
    var a = [fmt], i;
    for (i = 1; i < arguments.length; i++) a.push(arguments[i]);
    return window.tf ? window.tf.apply(null, a) : fmt;
  }
  function toastMsg(m) {
    var t = document.getElementById('wuri-ai-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'wuri-ai-toast';
      t.style.cssText = 'position:fixed;bottom:120px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.8);color:#fff;padding:12px 22px;border-radius:8px;font-size:14px;z-index:10000;max-width:80%;text-align:center;';
      document.body.appendChild(t);
    }
    t.textContent = m; t.style.display = 'block';
    clearTimeout(t._tm); t._tm = setTimeout(function () { t.style.display = 'none'; }, 3000);
  }

  /* ---------------- 本地状态键（不进同步清单） ---------------- */
  var K = {
    token: 'wuri_acct_token_v1', email: 'wuri_acct_email_v1', sync: 'wuri_acct_sync_v1',
    pro: 'wuri_acct_pro_v1', shadow: 'wuri_acct_shadow_v1', stamps: 'wuri_acct_stamps_v1',
    last: 'wuri_acct_last_v1', migrated: 'wuri_acct_migrated_v1',
    consent: 'wuri_acct_consent_house_v1', cfg: 'wuri_acct_cfg_v1',
    photometa: 'wuri_acct_photometa_v1', usage: 'wuri_acct_usage_v1', owner: 'wuri_acct_owner_v1'
  };
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
  function lsJSON(k, dft) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : dft; } catch (e) { return dft; } }
  function lsSetJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  var state = {
    enabled: lsGet(K.cfg) === '1',
    token: lsGet(K.token) || '',
    email: lsGet(K.email) || '',
    syncOn: lsGet(K.sync) === '1',
    running: false,
    lastEnt: 0
  };
  function isLoggedIn() { return !!state.token; }

  /* ---------------- 同步清单：localStorage 键组 ---------------- */
  var LS_KEYS = [
    'wuri_jing_bookmarks', 'wuri_jing_highlights', 'wuri_jing_notes', 'wuri_jing_last',
    'wuri_jing_font', 'wuri_jing_py', 'wuri_jing_voice', 'wuri_jing_recite',
    'wuri_bazi_history_v3', 'wuri_zw_history', 'ly_history',
    'wuri_ly_zhanwen', 'wuri_ly_cat', 'wuri_ly_topic',
    'wuri_daka_habits', 'wuri_daka_records', 'wuri_daka_bgm', 'wuri_daka_bgmvol',
    'wuri_mydays', 'wuri_practice_journal', 'wuri_practice_schedule',
    'wuri_med_vol', 'wuri_med_sound', 'wuri_med_dur', 'wuri_med_custom', 'wuri_med_breath', 'wuri_med_bell',
    'wuri_affinity_progress', 'wuri_affinity_result',
    'wuri_cfg_v1', 'wuri_lang_v1', 'wuri_bazi_sect',
    'wuri_sky_obs_v1', 'wuri_sky_lines_v1', 'wuri_sky_maglim_v1', 'wuri_sky_ar_cal_v1', 'wuri_sky_redlight_v1',
    'wuri_fs_bazhai_v1', 'wuri_fs_xk_v1'
  ];
  var LS_PREFIXES = ['wuri_jing_pos_'];
  function enumLsKeys() {
    var out = {}, i, k;
    for (i = 0; i < LS_KEYS.length; i++) out[LS_KEYS[i]] = 1;
    try {
      for (i = 0; i < localStorage.length; i++) {
        k = localStorage.key(i);
        if (!k) continue;
        for (var j = 0; j < LS_PREFIXES.length; j++) {
          if (k.indexOf(LS_PREFIXES[j]) === 0) { out[k] = 1; break; }
        }
      }
    } catch (e) {}
    return Object.keys(out);
  }

  /* ---------------- 哈希 ---------------- */
  function hashStr(s) {
    var h1 = 0xdeadbeef, h2 = 0x41c6ce57, i, ch;
    s = String(s == null ? '' : s);
    for (i = 0; i < s.length; i++) {
      ch = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h2 >>> 0).toString(16) + '.' + (h1 >>> 0).toString(16) + '.' + s.length;
  }
  function hexOf(buf) {
    var b = new Uint8Array(buf), s = '';
    for (var i = 0; i < b.length; i++) s += ('0' + b[i].toString(16)).slice(-2);
    return s;
  }
  function sha256Blob(blob) {
    if (window.crypto && crypto.subtle && blob.arrayBuffer) {
      return blob.arrayBuffer().then(function (ab) { return crypto.subtle.digest('SHA-256', ab); })
        .then(hexOf)
        .catch(function () { return 'sz' + blob.size; });
    }
    return Promise.resolve('sz' + (blob ? blob.size : 0));
  }
  function newUuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = new Uint8Array(16);
    crypto.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    var h = hexOf(b.buffer);
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }
  function nowISO() { return new Date().toISOString(); }

  /* ---------------- API ---------------- */
  function api(path, opts) {
    opts = opts || {};
    var h = { 'Content-Type': 'application/json' };
    if (opts.auth !== false && state.token) h['Authorization'] = 'Bearer ' + state.token;
    return fetch(API + path, {
      method: opts.method || 'GET',
      headers: h,
      body: opts.body != null ? JSON.stringify(opts.body) : undefined
    }).then(function (r) {
      if (opts.raw) return r;
      return r.json().then(function (j) { return { status: r.status, body: j }; },
        function () { return { status: r.status, body: null }; });
    });
  }
  function errText(r, fallbackKey) {
    var e = r && r.body && r.body.error;
    if (e === 'rate_limited') return T('acct_rate');
    if (e === 'bad_email') return T('acct_bad_email');
    if (e === 'code_invalid') return T('acct_code_bad');
    if (e === 'unauthorized') return T('acct_session_out');
    if (r && r.body && r.body.message) return r.body.message;
    return T(fallbackKey || 'acct_net_err');
  }

  /* ---------------- 会话 ---------------- */
  function saveSession(token, email) {
    state.token = token; state.email = email;
    lsSet(K.token, token); lsSet(K.email, email);
  }
  function wipeSyncState() {
    lsSet(K.shadow, null); lsSet(K.stamps, null); lsSet(K.last, null);
    lsSet(K.photometa, null); lsSet(K.usage, null); lsSet(K.migrated, null);
  }
  function clearSession(silent) {
    state.token = ''; state.email = ''; state.syncOn = false;
    lsSet(K.token, null); lsSet(K.email, null); lsSet(K.pro, null);
    if (!silent) render();
  }
  function on401() {
    if (!state.token) return;
    clearSession(true);
    toastMsg(T('acct_session_out'));
    render();
  }
  function applyEntitlement(ent) {
    if (!ent) return;
    lsSet(K.pro, ent.pro ? '1' : null);
    if (window.WuriPro && WuriPro.refreshProUI) { try { WuriPro.refreshProUI(); } catch (e) {} }
  }
  function refreshEntitlement() {
    if (!state.token) return Promise.resolve(null);
    state.lastEnt = Date.now();
    return api('/api/account/entitlement').then(function (r) {
      if (r.status === 401) { on401(); return null; }
      if (r.body && r.body.ok) { applyEntitlement(r.body); render(); return r.body; }
      return null;
    }).catch(function () { return null; });
  }
  function refreshUsage() {
    if (!state.token) return Promise.resolve(null);
    return api('/api/account/usage').then(function (r) {
      if (r.body && r.body.ok) {
        lsSetJSON(K.usage, { used: r.body.usedBytes, quota: r.body.quotaBytes, pro: !!r.body.pro, ts: Date.now() });
        render();
        return r.body;
      }
      return null;
    }).catch(function () { return null; });
  }

  /* ---------------- 家宅同步：序列化 ---------------- */
  var HOUSE_TABLES = ['houses', 'floors', 'residents', 'measurements', 'guides', 'plans', 'photos'];
  function houseDb() {
    return (window.__wuriHouse && window.__wuriHouse.db) || null;
  }
  function pick(o, fields) {
    var r = {};
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      if (o[f] !== undefined) r[f] = o[f];
    }
    return r;
  }
  /* 行 → 同步值（纯 JSON，不含本地 id / blob）；maps: {table: {id: uuid}} */
  function serializeRow(table, row, maps) {
    var v;
    switch (table) {
      case 'houses':
        return JSON.stringify(pick(row, ['name', 'address', 'client', 'phone', 'surveyDate', 'note', 'created']));
      case 'floors':
        v = pick(row, ['name', 'sort']); v.house = maps.houses[row.houseId] || null; return JSON.stringify(v);
      case 'residents':
        v = pick(row, ['name', 'rel', 'birthYear', 'birthMonth', 'birthDay', 'gender', 'note']);
        v.house = maps.houses[row.houseId] || null; return JSON.stringify(v);
      case 'measurements':
        v = pick(row, ['ts', 'facingDeg', 'facing', 'sitting', 'point', 'decl', 'gps', 'gpsAcc', 'accDeg']);
        v.fixed = !!row.fixed; v.house = maps.houses[row.houseId] || null; return JSON.stringify(v);
      case 'guides':
        return JSON.stringify({ checks: row.checks || {} });
      case 'plans':
        v = JSON.parse(JSON.stringify(row));
        delete v.floorId; delete v.houseId; delete v.uuid;
        v.house = maps.houses[row.houseId] || null;
        v.floor = maps.floors[row.floorId] || null;
        if (v.trace && v.trace.photoId != null) {
          v.trace.photoUuid = maps.photos[v.trace.photoId] || null;
          delete v.trace.photoId;
        }
        return JSON.stringify(v);
      case 'photos':
        v = pick(row, ['cat', 'guideKey', 'ts']);
        v.house = maps.houses[row.houseId] || null;
        v.floor = row.floorId != null ? (maps.floors[row.floorId] || null) : null;
        return JSON.stringify(v); /* size/sha256 在推送时补进（需 blob 哈希） */
    }
    return null;
  }

  /* uuid 回写：缺 uuid 的行补上（guides 的 uuid 取其宅的 uuid，与宅一对一） */
  function fillUuids(db) {
    var chain = Promise.resolve();
    var maps = { houses: {}, floors: {}, residents: {}, measurements: {}, guides: {}, plans: {}, photos: {} };
    var fresh = {}; /* 本轮新分配的 uuid（迁移去重判定用） */
    function fillTable(table) {
      return db.table(table).toArray().then(function (rows) {
        var puts = [];
        rows.forEach(function (row) {
          var pk = table === 'plans' ? row.floorId : (table === 'guides' ? row.houseId : row.id);
          if (!row.uuid) {
            row.uuid = (table === 'guides' && maps.houses[row.houseId]) || newUuid();
            fresh[row.uuid] = 1;
            puts.push(db.table(table).put(row));
          }
          maps[table][pk] = row.uuid;
        });
        return Promise.all(puts);
      });
    }
    chain = chain.then(function () { return fillTable('houses'); });
    ['floors', 'residents', 'measurements', 'guides', 'plans', 'photos'].forEach(function (tb) {
      chain = chain.then(function () { return fillTable(tb); });
    });
    return chain.then(function () { return { maps: maps, fresh: fresh }; });
  }

  /* 本地现状快照：{ls:{key:{value,hash}}, house:{ds:{uuid:{json,hash}}}, photoBin:{uuid:{sha,size,blob,rowUuid}}} */
  function snapshot() {
    var snap = { ls: {}, house: {}, photoBin: {} };
    enumLsKeys().forEach(function (k) {
      var v = lsGet(k);
      if (v != null) snap.ls[k] = { value: v, hash: hashStr(v) };
    });
    var db = houseDb();
    if (!db) return Promise.resolve(snap);
    return fillUuids(db).then(function (fr) {
      snap._maps = fr.maps; snap._fresh = fr.fresh;
      var chain = Promise.resolve();
      HOUSE_TABLES.forEach(function (table) {
        chain = chain.then(function () {
          return db.table(table).toArray().then(function (rows) {
            var ds = 'house.' + table;
            snap.house[ds] = {};
            var pchain = Promise.resolve();
            rows.forEach(function (row) {
              var json = serializeRow(table, row, fr.maps);
              if (json == null) return;
              if (table === 'photos') {
                pchain = pchain.then(function () {
                  return photoSha(row).then(function (meta) {
                    var v = JSON.parse(json);
                    v.size = meta.size; v.sha256 = meta.sha;
                    var j2 = JSON.stringify(v);
                    snap.house[ds][row.uuid] = { json: j2, hash: hashStr(j2) };
                    snap.photoBin[row.uuid] = { sha: meta.sha, size: meta.size, blob: row.blob || null };
                  });
                });
              } else {
                snap.house[ds][row.uuid] = { json: json, hash: hashStr(json) };
              }
            });
            return pchain;
          });
        });
      });
      return chain.then(function () { return snap; });
    }).catch(function () { return snap; });
  }
  var _photoMetaCache = null;
  function photoMeta() {
    if (!_photoMetaCache) _photoMetaCache = lsJSON(K.photometa, {});
    return _photoMetaCache;
  }
  function savePhotoMeta() { lsSetJSON(K.photometa, _photoMetaCache || {}); }
  function photoSha(row) {
    var m = photoMeta();
    var blob = row.blob;
    if (!blob) return Promise.resolve({ sha: 'empty', size: 0 });
    var cached = m[row.uuid];
    /* blob 无版本号：用 size＋行 ts 粗判缓存有效性（house.js 换图必经删行重建，uuid 随行新生） */
    if (cached && cached.size === blob.size) return Promise.resolve(cached);
    return sha256Blob(blob).then(function (sha) {
      var meta = { sha: sha, size: blob.size };
      if (row.uuid) { m[row.uuid] = meta; savePhotoMeta(); }
      return meta;
    });
  }

  /* ---------------- 拉取落地 ---------------- */
  function loadShadow() {
    var s = lsJSON(K.shadow, null) || {};
    s.ls = s.ls || {}; s.house = s.house || {}; s.photo = s.photo || {};
    return s;
  }
  function saveShadow(s) { lsSetJSON(K.shadow, s); }
  function loadStamps() { return lsJSON(K.stamps, {}); }
  function saveStamps(s) { lsSetJSON(K.stamps, s); }
  function stampKey(ds, key) { return ds + '|' + key; }

  /* 把云端条目落回本地。返回 {houseChanged, pulledUuids:Set式对象}；照片二进制失败的条目跳过（不推进 stamp，下轮重试） */
  function applyItems(items) {
    var stamps = loadStamps();
    var shadow = loadShadow();
    var pulledUuids = {};
    var houseChanged = false;
    var db = houseDb();
    var measApplied = []; /* {houseId, uuid, updated_at} 定稿冲突收口用 */

    function markStamp(ds, key, ts) { stamps[stampKey(ds, key)] = ts; }
    /* 先处理 ls */
    items.forEach(function (it) {
      if (it.dataset !== 'ls') return;
      if (it.deleted || it.value == null) {
        lsSet(it.key, null);
        delete shadow.ls[it.key];
      } else {
        lsSet(it.key, it.value);
        shadow.ls[it.key] = hashStr(it.value);
      }
      markStamp('ls', it.key, it.updated_at);
    });

    if (!db) { saveStamps(stamps); saveShadow(shadow); return Promise.resolve({ houseChanged: false, pulledUuids: pulledUuids }); }

    var order = ['house.houses', 'house.floors', 'house.residents', 'house.measurements', 'house.guides', 'house.plans', 'house.photos'];
    var byDs = {};
    items.forEach(function (it) {
      if (it.dataset === 'ls') return;
      (byDs[it.dataset] = byDs[it.dataset] || []).push(it);
    });

    /* uuid → 本地 id 映射（落地过程中随建随补） */
    function buildUuidMaps() {
      var maps = {}; /* table -> {uuid: localPk} */
      var chain = Promise.resolve();
      HOUSE_TABLES.forEach(function (table) {
        maps[table] = {};
        chain = chain.then(function () {
          return db.table(table).toArray().then(function (rows) {
            rows.forEach(function (row) {
              if (!row.uuid) return;
              var pk = table === 'plans' ? row.floorId : (table === 'guides' ? row.houseId : row.id);
              maps[table][row.uuid] = pk;
            });
          });
        });
      });
      return chain.then(function () { return maps; });
    }

    return buildUuidMaps().then(function (maps) {
      var chain = Promise.resolve();
      order.forEach(function (ds) {
        var list = byDs[ds] || [];
        var table = ds.slice('house.'.length);
        list.forEach(function (it) {
          chain = chain.then(function () {
            return applyHouseItem(db, table, it, maps, shadow, stamps, pulledUuids, measApplied)
              .then(function (changed) { if (changed) houseChanged = true; });
          });
        });
      });
      return chain.then(function () {
        /* 定稿冲突收口：一宅多条 fixed 时留 updated_at 最新的一条 */
        var byHouse = {};
        measApplied.forEach(function (m) { (byHouse[m.houseId] = byHouse[m.houseId] || []).push(m); });
        var fchain = Promise.resolve();
        Object.keys(byHouse).forEach(function (hid) {
          fchain = fchain.then(function () {
            return db.measurements.where('houseId').equals(Number(hid)).toArray().then(function (rows) {
              var fixed = rows.filter(function (r) { return !!r.fixed; });
              if (fixed.length <= 1) return;
              var stampOf = {};
              byHouse[hid].forEach(function (m) { stampOf[m.uuid] = m.updated_at; });
              fixed.sort(function (a, b) {
                var sa = stampOf[a.uuid] || '', sb = stampOf[b.uuid] || '';
                if (sa !== sb) return sa < sb ? 1 : -1;
                return (b.ts || 0) - (a.ts || 0);
              });
              var ups = fixed.slice(1).map(function (r) { r.fixed = false; return db.measurements.put(r); });
              return Promise.all(ups);
            });
          });
        });
        return fchain;
      }).then(function () {
        /* 户型描图底图补位：trace.photoUuid 已到、photoId 未定者补上 */
        return db.plans.toArray().then(function (plans) {
          var ups = [];
          plans.forEach(function (p) {
            if (p.trace && p.trace.photoUuid && p.trace.photoId == null && maps.photos[p.trace.photoUuid] != null) {
              p.trace.photoId = maps.photos[p.trace.photoUuid];
              ups.push(db.plans.put(p));
            }
          });
          return Promise.all(ups);
        });
      }).then(function () {
        if (houseChanged && window.__wuriHouse && __wuriHouse.syncMirror) {
          return __wuriHouse.syncMirror().catch(function () {});
        }
      }).then(function () {
        saveStamps(stamps); saveShadow(shadow);
        return { houseChanged: houseChanged, pulledUuids: pulledUuids };
      });
    });
  }

  function applyHouseItem(db, table, it, maps, shadow, stamps, pulledUuids, measApplied) {
    var ds = 'house.' + table;
    var uuid = it.key;
    var localPk = maps[table][uuid];
    if (it.deleted) {
      if (localPk == null) { stamps[stampKey(ds, uuid)] = it.updated_at; delete shadow.house[stampKey(ds, uuid)]; return Promise.resolve(false); }
      var delP = table === 'plans' ? db.plans.delete(localPk)
        : table === 'guides' ? db.guides.delete(localPk)
        : db.table(table).delete(localPk);
      return delP.then(function () {
        stamps[stampKey(ds, uuid)] = it.updated_at;
        delete shadow.house[stampKey(ds, uuid)];
        if (table === 'photos') delete shadow.photo[uuid];
        return true;
      }).catch(function () { return false; });
    }
    var v;
    try { v = JSON.parse(it.value || '{}'); } catch (e) { return Promise.resolve(false); }
    pulledUuids[uuid] = 1;

    function houseLocalId() { return v.house ? maps.houses[v.house] : null; }
    function finish(row, pk) {
      row.uuid = uuid;
      var p = pk == null ? db.table(table).add(row) : db.table(table).put(row);
      return p.then(function (newPk) {
        var realPk = pk == null ? newPk : pk;
        maps[table][uuid] = realPk;
        stamps[stampKey(ds, uuid)] = it.updated_at;
        if (table !== 'photos') {
          var json = serializeRow(table, row, uuidMapsOf(maps));
          if (json != null) shadow.house[stampKey(ds, uuid)] = hashStr(json);
        }
        return true;
      }).catch(function () { return false; });
    }
    /* maps 是 uuid→pk 且落地中持续增补；serializeRow 要 id→uuid，每次反转（数据量小，成本可忽略） */
    function uuidMapsOf(m) {
      var rev = {};
      HOUSE_TABLES.forEach(function (tb) {
        rev[tb] = {};
        Object.keys(m[tb] || {}).forEach(function (u) { rev[tb][m[tb][u]] = u; });
      });
      return rev;
    }

    switch (table) {
      case 'houses': {
        var hrow = pick(v, ['name', 'address', 'client', 'phone', 'surveyDate', 'note', 'created']);
        if (localPk != null) hrow.id = localPk;
        return finish(hrow, localPk);
      }
      case 'floors': {
        var hid = houseLocalId(); if (hid == null) return Promise.resolve(false);
        var frow = pick(v, ['name', 'sort']); frow.houseId = hid;
        if (localPk != null) frow.id = localPk;
        return finish(frow, localPk);
      }
      case 'residents': {
        var rid = houseLocalId(); if (rid == null) return Promise.resolve(false);
        var rrow = pick(v, ['name', 'rel', 'birthYear', 'birthMonth', 'birthDay', 'gender', 'note']);
        rrow.houseId = rid;
        if (localPk != null) rrow.id = localPk;
        return finish(rrow, localPk);
      }
      case 'measurements': {
        var mid = houseLocalId(); if (mid == null) return Promise.resolve(false);
        var mrow = pick(v, ['ts', 'facingDeg', 'facing', 'sitting', 'point', 'decl', 'gps', 'gpsAcc', 'accDeg']);
        mrow.fixed = !!v.fixed; mrow.houseId = mid;
        if (localPk != null) mrow.id = localPk;
        measApplied.push({ houseId: mid, uuid: uuid, updated_at: it.updated_at });
        return finish(mrow, localPk);
      }
      case 'guides': {
        var gid = houseLocalId(); if (gid == null) return Promise.resolve(false);
        var grow = { houseId: gid, checks: v.checks || {}, uuid: uuid };
        return finish(grow, gid);
      }
      case 'plans': {
        var phid = houseLocalId(); if (phid == null) return Promise.resolve(false);
        var fid = v.floor ? maps.floors[v.floor] : null;
        if (fid == null) return Promise.resolve(false);
        var prow = JSON.parse(JSON.stringify(v));
        delete prow.house; delete prow.floor;
        prow.houseId = phid; prow.floorId = fid;
        if (prow.trace) {
          if (prow.trace.photoUuid && maps.photos[prow.trace.photoUuid] != null) {
            prow.trace.photoId = maps.photos[prow.trace.photoUuid];
          } else if (prow.trace.photoUuid) {
            prow.trace.photoId = null; /* 底图未到，留 photoUuid 待补位 */
          }
        }
        return db.plans.put(prow).then(function () {
          maps.plans[uuid] = fid;
          stamps[stampKey(ds, uuid)] = it.updated_at;
          var json = serializeRow('plans', prow, uuidMapsOf(maps));
          if (json != null) shadow.house[stampKey(ds, uuid)] = hashStr(json);
          return true;
        }).catch(function () { return false; });
      }
      case 'photos': {
        var phhid = houseLocalId(); if (phhid == null) return Promise.resolve(false);
        var wantSha = v.sha256 || '';
        var existing = localPk != null ? db.photos.get(localPk) : Promise.resolve(null);
        return Promise.resolve(existing).then(function (erow) {
          var haveSha = erow ? (photoMeta()[uuid] || {}).sha : null;
          if (erow && wantSha && haveSha === wantSha) {
            var urow = pick(v, ['cat', 'guideKey', 'ts']);
            urow.houseId = phhid;
            urow.floorId = v.floor ? maps.floors[v.floor] : null;
            urow.blob = erow.blob; urow.id = localPk; urow.uuid = uuid;
            return db.photos.put(urow).then(function () {
              stamps[stampKey(ds, uuid)] = it.updated_at;
              var vv = JSON.parse(serializeRow('photos', urow, uuidMapsOf(maps)));
              vv.size = v.size; vv.sha256 = wantSha;
              shadow.house[stampKey(ds, uuid)] = hashStr(JSON.stringify(vv));
              shadow.photo[uuid] = wantSha;
              return true;
            }).catch(function () { return false; });
          }
          /* 需要二进制：经后端代理取（归属校验在服务端） */
          return fetch(API + '/api/sync/photo-get?uuid=' + encodeURIComponent(uuid), {
            headers: state.token ? { 'Authorization': 'Bearer ' + state.token } : {}
          }).then(function (r) {
            if (!r.ok) throw new Error('photo_get_' + r.status);
            return r.blob();
          }).then(function (blob) {
            var prow2 = pick(v, ['cat', 'guideKey', 'ts']);
            prow2.houseId = phhid;
            prow2.floorId = v.floor ? maps.floors[v.floor] : null;
            prow2.blob = blob; prow2.uuid = uuid;
            if (localPk != null) prow2.id = localPk;
            var pp = localPk != null ? db.photos.put(prow2) : db.photos.add(prow2);
            return pp.then(function (newPk) {
              maps.photos[uuid] = localPk != null ? localPk : newPk;
              return sha256Blob(blob).then(function (sha) {
                var m = photoMeta(); m[uuid] = { sha: sha, size: blob.size }; savePhotoMeta();
                stamps[stampKey(ds, uuid)] = it.updated_at;
                var vv = JSON.parse(serializeRow('photos', prow2, uuidMapsOf(maps)));
                vv.size = v.size || blob.size; vv.sha256 = wantSha || sha;
                shadow.house[stampKey(ds, uuid)] = hashStr(JSON.stringify(vv));
                shadow.photo[uuid] = wantSha || sha;
                return true;
              });
            });
          }).catch(function () { return false; /* 二进制没取到：不推进 stamp，下轮续传 */ });
        });
      }
    }
    return Promise.resolve(false);
  }

  /* ---------------- 首次迁移去重（内容哈希 adoption） ----------------
   * 场景：同一宅在两台设备各建过、内容一模一样，账号打通后会各有一份。
   * 本轮 pull 落地的新行（pulledUuids）与本轮刚回写 uuid 的旧行（fresh）内容哈希相同 →
   * 保留云端行，删本地旧行，并把旧行的子行引用（houseId/floorId/trace.photoId）改指云端行。
   * guides 不参与分组（其哈希不含所属宅，防误并）；随宅 remap 迁移。内容不同者不并、两份共存。 */
  function adoptDuplicates(snap, pulledUuids) {
    var db = houseDb();
    if (!db || !snap._fresh || !snap._maps) return Promise.resolve(null);
    var fresh = snap._fresh, maps = snap._maps;
    var inv = {}; /* table -> {uuid: localPk} */
    HOUSE_TABLES.forEach(function (table) {
      inv[table] = {};
      Object.keys(maps[table] || {}).forEach(function (pk) { inv[table][maps[table][pk]] = pk; });
    });
    var remap = {}; /* table -> {freshUuid: cloudUuid} */
    ['houses', 'floors', 'residents', 'measurements', 'plans', 'photos'].forEach(function (table) {
      var entries = snap.house['house.' + table] || {};
      var byHash = {};
      Object.keys(entries).forEach(function (u) { (byHash[entries[u].hash] = byHash[entries[u].hash] || []).push(u); });
      Object.keys(byHash).forEach(function (h) {
        var us = byHash[h];
        if (us.length < 2) return;
        var cloud = us.filter(function (u) { return pulledUuids[u]; });
        var freshUs = us.filter(function (u) { return fresh[u]; });
        if (cloud.length === 1 && freshUs.length >= 1) {
          remap[table] = remap[table] || {};
          freshUs.forEach(function (fu) { remap[table][fu] = cloud[0]; });
        }
      });
    });
    if (!Object.keys(remap).length) return Promise.resolve(null);

    var chain = Promise.resolve();
    function delRow(table, pk) {
      if (table === 'plans') return db.plans.delete(pk);
      if (table === 'guides') return db.guides.delete(pk);
      return db.table(table).delete(pk);
    }
    /* 宅 remap：子行改指＋guides 迁移 */
    Object.keys(remap.houses || {}).forEach(function (fu) {
      var freshPk = Number(inv.houses[fu]), cloudPk = Number(inv.houses[remap.houses[fu]]);
      if (isNaN(freshPk) || isNaN(cloudPk)) return;
      ['floors', 'residents', 'measurements', 'photos', 'plans'].forEach(function (tb) {
        chain = chain.then(function () {
          return db.table(tb).where('houseId').equals(freshPk).toArray().then(function (rows) {
            return Promise.all(rows.map(function (r) { r.houseId = cloudPk; return db.table(tb).put(r); }));
          });
        });
      });
      chain = chain.then(function () {
        return db.guides.get(freshPk).then(function (g) {
          if (!g) return;
          return db.guides.delete(freshPk).then(function () {
            return db.guides.get(cloudPk).then(function (cg) {
              if (!cg) { g.houseId = cloudPk; g.uuid = remap.houses[fu]; return db.guides.put(g); }
            });
          });
        });
      });
      chain = chain.then(function () { return delRow('houses', freshPk); });
    });
    /* 层 remap：photos/plans 的 floorId 改指 */
    Object.keys(remap.floors || {}).forEach(function (fu) {
      var freshPk = Number(inv.floors[fu]), cloudPk = Number(inv.floors[remap.floors[fu]]);
      if (isNaN(freshPk) || isNaN(cloudPk)) return;
      ['photos', 'plans'].forEach(function (tb) {
        chain = chain.then(function () {
          return db.table(tb).toArray().then(function (rows) {
            var ups = [];
            rows.forEach(function (r) {
              if (tb === 'plans' ? r.floorId === freshPk : r.floorId === freshPk) { r.floorId = cloudPk; ups.push(db.table(tb).put(r)); }
            });
            return Promise.all(ups);
          });
        });
      });
      chain = chain.then(function () { return delRow('floors', freshPk); });
    });
    /* 照片 remap：plans 描图底图改指云端照片行 */
    Object.keys(remap.photos || {}).forEach(function (fu) {
      var freshPk = Number(inv.photos[fu]), cloudPk = Number(inv.photos[remap.photos[fu]]);
      if (isNaN(freshPk) || isNaN(cloudPk)) return;
      chain = chain.then(function () {
        return db.plans.toArray().then(function (rows) {
          var ups = [];
          rows.forEach(function (r) {
            if (r.trace && r.trace.photoId === freshPk) { r.trace.photoId = cloudPk; ups.push(db.plans.put(r)); }
          });
          return Promise.all(ups);
        });
      });
      chain = chain.then(function () { return delRow('photos', freshPk); });
    });
    /* 其余表（residents/measurements/plans）重复行直接删本地旧行 */
    ['residents', 'measurements', 'plans'].forEach(function (table) {
      Object.keys(remap[table] || {}).forEach(function (fu) {
        if (table === 'plans' && remap.plans[fu] && (remap.floors || {})[fu]) return;
        var pk = table === 'plans' ? Number(inv.plans[fu]) : Number(inv[table][fu]);
        if (isNaN(pk)) return;
        chain = chain.then(function () { return delRow(table, pk); });
      });
    });
    /* 处理完重取快照（引用已改写，哈希随之更新） */
    return chain.then(function () { return snapshot(); }).catch(function () { return null; });
  }

  /* ---------------- 同步引擎 ---------------- */
  function setLast(patch) {
    var last = lsJSON(K.last, {});
    Object.keys(patch).forEach(function (k) { last[k] = patch[k]; });
    lsSetJSON(K.last, last);
  }
  function computePush(snap) {
    var shadow = loadShadow();
    var items = [], photos = [], i, k, ds, uuid;
    var lsKeys = {};
    Object.keys(snap.ls).forEach(function (key) { lsKeys[key] = 1; });
    Object.keys(shadow.ls).forEach(function (key) { lsKeys[key] = 1; });
    Object.keys(lsKeys).forEach(function (key) {
      var cur = snap.ls[key];
      if (cur && shadow.ls[key] !== cur.hash) {
        items.push({ dataset: 'ls', key: key, value: cur.value, updated_at: nowISO(), _hash: cur.hash });
      } else if (!cur && shadow.ls[key] != null) {
        items.push({ dataset: 'ls', key: key, value: null, deleted: true, updated_at: nowISO(), _hash: null });
      }
    });
    var fullKeys = {};
    Object.keys(snap.house).forEach(function (d) {
      Object.keys(snap.house[d]).forEach(function (u) { fullKeys[stampKey(d, u)] = 1; });
    });
    Object.keys(shadow.house).forEach(function (fk) { fullKeys[fk] = 1; });
    Object.keys(fullKeys).forEach(function (fk) {
      var cut = fk.indexOf('|');
      ds = fk.slice(0, cut); uuid = fk.slice(cut + 1);
      var cur2 = snap.house[ds] && snap.house[ds][uuid];
      if (cur2 && shadow.house[fk] !== cur2.hash) {
        var it = { dataset: ds, key: uuid, value: cur2.json, updated_at: nowISO(), _hash: cur2.hash };
        if (ds === 'house.photos') {
          var bin = snap.photoBin[uuid] || {};
          photos.push({ item: it, needBinary: shadow.photo[uuid] !== bin.sha, blob: bin.blob, sha: bin.sha });
        } else items.push(it);
      } else if (!cur2 && shadow.house[fk] != null) {
        items.push({ dataset: ds, key: uuid, value: null, deleted: true, updated_at: nowISO(), _hash: null });
      }
    });
    return { items: items, photos: photos };
  }
  function pushItems(items) {
    var applied = {};
    var idx = 0;
    function nextChunk() {
      if (idx >= items.length) return Promise.resolve(applied);
      var chunk = items.slice(idx, idx + 200);
      idx += chunk.length;
      return api('/api/sync/push', { method: 'POST', body: { items: chunk.map(stripInternal) } }).then(function (r) {
        if (r.status === 401) { on401(); throw new Error('unauthorized'); }
        if (!r.body || !r.body.ok) throw new Error('push_failed');
        (r.body.applied || []).forEach(function (a) { applied[a.dataset + '|' + a.key] = 1; });
        return nextChunk();
      });
    }
    return nextChunk();
  }
  function stripInternal(it) {
    var o = { dataset: it.dataset, key: it.key, value: it.value, updated_at: it.updated_at };
    if (it.deleted) o.deleted = true;
    return o;
  }
  function photoPut(uuid, blob) {
    return fetch(API + '/api/sync/photo-put', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + state.token,
        'x-photo-uuid': uuid,
        'Content-Type': (blob && blob.type) || 'application/octet-stream'
      },
      body: blob
    }).then(function (r) {
      return r.json().then(function (j) { return { status: r.status, body: j }; },
        function () { return { status: r.status, body: null }; });
    });
  }
  function confirmApplied(appliedMap, planItems) {
    var shadow = loadShadow(), stamps = loadStamps();
    planItems.forEach(function (it) {
      var fk = stampKey(it.dataset, it.key);
      if (!appliedMap[fk]) return;
      stamps[fk] = it.updated_at;
      if (it.dataset === 'ls') {
        if (it.deleted) delete shadow.ls[it.key]; else shadow.ls[it.key] = it._hash;
      } else {
        if (it.deleted) { delete shadow.house[fk]; if (it.dataset === 'house.photos') delete shadow.photo[it.key]; }
        else shadow.house[fk] = it._hash;
      }
    });
    saveShadow(shadow); saveStamps(stamps);
  }

  var pulledUuidsRef = {};
  function runSync() {
    if (state.running || !state.token || !state.syncOn) return Promise.resolve(false);
    state.running = true;
    setLast({ status: 'syncing' });
    renderStatus();
    var houseChanged = false, pushedHouse = false, plan = null, blocked = 0, failed = false;
    var stamps = loadStamps();
    return api('/api/sync/pull', { method: 'POST', body: { stamps: stamps } })
      .then(function (r) {
        if (r.status === 401) { on401(); throw new Error('unauthorized'); }
        if (!r.body || !r.body.ok) throw new Error('pull_failed');
        return applyItems(r.body.items || []);
      })
      .then(function (applied) {
        houseChanged = applied.houseChanged;
        pulledUuidsRef = applied.pulledUuids || {};
        return snapshot();
      })
      .then(function (snap) {
        return adoptDuplicates(snap, pulledUuidsRef).then(function (ns) { return ns || snap; });
      })
      .then(function (snap) {
        plan = computePush(snap);
        plan.items.forEach(function (it) { if (it.dataset.indexOf('house.') === 0) pushedHouse = true; });
        return pushItems(plan.items).then(function (appliedMap) {
          confirmApplied(appliedMap, plan.items);
        });
      })
      .then(function () {
        /* 照片：二进制先行（配额满只停新照片），成功后再推元数据条目 */
        var chain = Promise.resolve();
        plan.photos.forEach(function (ph) {
          chain = chain.then(function () {
            var pre = ph.needBinary
              ? photoPut(ph.item.key, ph.blob).then(function (r) {
                  if (r.status === 401) { on401(); throw new Error('unauthorized'); }
                  if (r.status === 413) { blocked++; return 'blocked'; }
                  if (!r.body || !r.body.ok) throw new Error('photo_put_failed');
                  var shadow = loadShadow(); shadow.photo[ph.item.key] = ph.sha; saveShadow(shadow);
                  return 'ok';
                })
              : Promise.resolve('ok');
            return pre.then(function (st) {
              if (st === 'blocked') return;
              return pushItems([ph.item]).then(function (appliedMap) {
                confirmApplied(appliedMap, [ph.item]);
                pushedHouse = true;
              });
            });
          });
        });
        return chain;
      })
      .then(function () {
        lsSet(K.migrated, '1');
        /* 剩余待传数：重新 diff（不含被配额挡下的照片元数据之外的口径近似） */
        return snapshot().then(function (snap2) {
          var rest = computePush(snap2);
          var pending = rest.items.length + rest.photos.length;
          setLast({
            ts: Date.now(),
            status: blocked > 0 ? 'quota' : (pending > 0 ? 'partial' : 'ok'),
            pending: pending, blocked: blocked
          });
        });
      })
      .catch(function () {
        failed = true;
        setLast({ status: 'fail', ts: lsJSON(K.last, {}).ts || 0 });
      })
      .then(function () {
        state.running = false;
        render();
        if (houseChanged || pushedHouse) {
          if (window.__wuri_rerender) { try { __wuri_rerender(); } catch (e) {} }
          render();
        }
        refreshUsage();
        return !failed;
      });
  }
  function pendingCountAsync() {
    if (!state.token || !state.syncOn) return Promise.resolve(0);
    return snapshot().then(function (snap) {
      var p = computePush(snap);
      return p.items.length + p.photos.length;
    }).catch(function () { return 0; });
  }

  /* ---------------- UI ---------------- */
  function fmtBytes(n) {
    if (n == null || isNaN(n)) return '—';
    if (n >= 1073741824) return (n / 1073741824).toFixed(2) + ' GB';
    if (n >= 1048576) return (n / 1048576).toFixed(1) + ' MB';
    if (n >= 1024) return Math.round(n / 1024) + ' KB';
    return n + ' B';
  }
  function maskEmail(email) {
    var at = (email || '').indexOf('@');
    if (at <= 0) return email || '';
    var local = email.slice(0, at), dom = email.slice(at + 1);
    return local.slice(0, Math.min(6, local.length)) + '***@' + dom;
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function fmtTime(ts) {
    if (!ts) return T('acct_last_none');
    var d = new Date(ts);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' +
      pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }
  var _pendingCache = { n: null, ts: 0 };
  function renderStatus() {
    var el = $('acct-status');
    if (!el) return;
    var last = lsJSON(K.last, {});
    var msg = '';
    if (state.running || last.status === 'syncing') msg = T('acct_syncing');
    else if (!state.syncOn) msg = '';
    else if (last.status === 'fail') msg = T('acct_sync_fail');
    else if (last.status === 'quota') msg = T('acct_quota_full') + (last.pending ? ' ' + TF('acct_pending', last.pending) : '');
    else if (_pendingCache.n != null && _pendingCache.n > 0) msg = TF('acct_pending', _pendingCache.n);
    else if (last.status === 'partial' && last.pending) msg = TF('acct_pending', last.pending);
    else if (last.ts) msg = T('acct_sync_done');
    el.textContent = msg;
    var lastEl = $('acct-last');
    if (lastEl) lastEl.textContent = fmtTime(last.ts);
    if (state.token && state.syncOn && !state.running && Date.now() - _pendingCache.ts > 20000) {
      _pendingCache.ts = Date.now();
      pendingCountAsync().then(function (n) {
        _pendingCache.n = n;
        var last2 = lsJSON(K.last, {});
        if (last2.status === 'ok' || !last2.status) setLast({ pending: n });
        renderStatus();
      });
    }
  }
  function render() {
    var card = $('acct-card');
    if (!card) return;
    var show = state.enabled || isLoggedIn();
    card.hidden = !show;
    var line = $('backup-acct-line');
    if (line) line.hidden = !show;
    if (!show) return;
    var inEl = $('acct-in'), outEl = $('acct-out'), stEl = $('acct-state');
    if (isLoggedIn()) {
      inEl.hidden = false; outEl.hidden = true;
      stEl.textContent = T('acct_state_in'); stEl.classList.add('on');
      $('acct-email-mask').textContent = maskEmail(state.email);
      $('acct-prow').textContent = lsGet(K.pro) === '1' ? T('acct_prow_bound') : T('acct_prow_none');
      var tg = $('acct-sync-toggle'); if (tg) tg.checked = state.syncOn;
      var usage = lsJSON(K.usage, null);
      var qrow = $('acct-quota-row');
      if (usage) {
        qrow.hidden = false;
        $('acct-quota').textContent = TF('acct_quota_line', fmtBytes(usage.used), fmtBytes(usage.quota));
      } else qrow.hidden = true;
      var sn = $('acct-sync-now'); if (sn) sn.disabled = state.running;
    } else {
      inEl.hidden = true; outEl.hidden = false;
      stEl.textContent = T('acct_state_out'); stEl.classList.remove('on');
    }
    var bs = $('backup-acct-state');
    if (bs) {
      bs.textContent = isLoggedIn()
        ? maskEmail(state.email) + ' · ' + (state.syncOn ? T('acct_on') : T('acct_off'))
        : T('acct_state_out');
    }
    renderStatus();
  }

  function showOnly(viewEl) {
    var mains = document.querySelectorAll('main.tab, main.view');
    for (var i = 0; i < mains.length; i++) mains[i].hidden = true;
    if (viewEl) viewEl.hidden = false;
    if (window.setTabBarVisible) setTabBarVisible(!viewEl);
    window.scrollTo(0, 0);
    if (window.updateFloatingButtons) updateFloatingButtons();
  }
  function closeToMe() {
    showOnly(null);
    var btn = document.querySelector('[data-tab="tab-me"]');
    if (btn) btn.click();
    else {
      var me = $('tab-me'); if (me) me.hidden = false;
      if (window.setTabBarVisible) setTabBarVisible(true);
    }
    render();
  }
  function openLogin() { showOnly($('view-account-login')); var m = $('acct-login-msg'); if (m) m.textContent = ''; }
  function openDelete() { showOnly($('view-account-delete')); var m = $('acct-del-msg'); if (m) m.textContent = ''; }
  function openSyncExplainer() {
    showOnly($('view-account-sync'));
    var row = $('acct-consent-row'), btn = $('acct-sync-enable');
    var needConsent = false;
    var finish = function () {
      row.hidden = !needConsent;
      if (btn) btn.disabled = needConsent;
      var cb = $('acct-consent'); if (cb) cb.checked = false;
    };
    if (lsGet(K.consent) === '1') { finish(); return; }
    var db = houseDb();
    if (!db) { finish(); return; }
    db.houses.count().then(function (n) { needConsent = n > 0; finish(); }).catch(function () { finish(); });
  }

  function validEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s || '').trim()); }
  function startCountdown(btn, defKey) {
    var left = 60;
    btn.disabled = true;
    btn.textContent = TF('acct_resend_in', left);
    var iv = setInterval(function () {
      left--;
      if (left <= 0) {
        clearInterval(iv);
        btn.disabled = false;
        btn.textContent = T(defKey);
      } else btn.textContent = TF('acct_resend_in', left);
    }, 1000);
  }
  function requestCode(email, btn, msgEl, defKey) {
    if (!validEmail(email)) { msgEl.textContent = T('acct_bad_email'); return; }
    btn.disabled = true;
    api('/api/auth/request-code', { method: 'POST', auth: false, body: { email: email } }).then(function (r) {
      if (r.body && r.body.ok && r.body.sent) {
        msgEl.textContent = T('acct_code_sent');
        startCountdown(btn, defKey);
      } else if (r.body && r.body.ok) {
        msgEl.textContent = T('acct_net_err');
        btn.disabled = false;
      } else {
        msgEl.textContent = errText(r);
        btn.disabled = false;
      }
    }).catch(function () { msgEl.textContent = T('acct_net_err'); btn.disabled = false; });
  }

  function doLogin() {
    var email = ($('acct-email').value || '').trim().toLowerCase();
    var code = ($('acct-code').value || '').trim();
    var msg = $('acct-login-msg');
    if (!validEmail(email)) { msg.textContent = T('acct_bad_email'); return; }
    if (!/^\d{6}$/.test(code)) { msg.textContent = T('acct_code_bad'); return; }
    var btn = $('acct-do-login'); btn.disabled = true;
    api('/api/auth/verify', { method: 'POST', auth: false, body: { email: email, code: code, label: 'web' } }).then(function (r) {
      btn.disabled = false;
      if (r.body && r.body.ok && r.body.token) {
        var prevOwner = lsGet(K.owner);
        if (prevOwner && prevOwner !== email) {
          /* 换账号登录：上一账号的影子/戳记/配额账全部作废，防止串号 */
          wipeSyncState();
          state.syncOn = false; lsSet(K.sync, '0');
        }
        lsSet(K.owner, email);
        saveSession(r.body.token, email);
        state.syncOn = lsGet(K.sync) === '1';
        applyEntitlement({ pro: !!r.body.pro });
        toastMsg(T('acct_login_ok'));
        refreshUsage();
        if (!lsGet(K.migrated) && !state.syncOn) openSyncExplainer();
        else { closeToMe(); if (state.syncOn) runSync(); }
        render();
      } else {
        msg.textContent = errText(r, 'acct_code_bad');
      }
    }).catch(function () { btn.disabled = false; msg.textContent = T('acct_net_err'); });
  }

  function doDelete() {
    var code = ($('acct-del-code').value || '').trim();
    var msg = $('acct-del-msg');
    if (!/^\d{6}$/.test(code)) { msg.textContent = T('acct_code_bad'); return; }
    var btn = $('acct-del-btn'); btn.disabled = true;
    api('/api/account/delete', { method: 'POST', body: { email: state.email, code: code } }).then(function (r) {
      btn.disabled = false;
      if (r.body && r.body.ok) {
        clearSession(true);
        wipeSyncState();
        lsSet(K.owner, null); lsSet(K.consent, null); lsSet(K.sync, '0');
        toastMsg(T('acct_del_done'));
        closeToMe();
        render();
      } else if (r.status === 401) { on401(); closeToMe(); }
      else msg.textContent = errText(r, 'acct_code_bad');
    }).catch(function () { btn.disabled = false; msg.textContent = T('acct_net_err'); });
  }

  function doExport() {
    if (!state.token) return;
    toastMsg(T('acct_syncing'));
    api('/api/account/export', { method: 'POST', raw: true }).then(function (r) {
      if (r.status === 401) { on401(); return; }
      if (!r.ok) { toastMsg(T('acct_net_err')); return; }
      return r.blob().then(function (blob) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = 'wuri-cloud-export.zip';
        document.body.appendChild(a); a.click();
        setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 2000);
        toastMsg(T('acct_export_done'));
      });
    }).catch(function () { toastMsg(T('acct_net_err')); });
  }

  /* ---------------- 事件绑定与初始化 ---------------- */
  function bind() {
    var on = function (id, ev, fn) { var el = $(id); if (el) el.addEventListener(ev, fn); };
    on('acct-login-open', 'click', openLogin);
    on('acct-login-back', 'click', closeToMe);
    on('acct-sync-back', 'click', closeToMe);
    on('acct-del-back', 'click', closeToMe);
    on('acct-delete-open', 'click', openDelete);
    on('acct-get-code', 'click', function () {
      requestCode(($('acct-email').value || '').trim().toLowerCase(), $('acct-get-code'), $('acct-login-msg'), 'acct_get_code');
    });
    on('acct-do-login', 'click', doLogin);
    on('acct-del-get', 'click', function () {
      requestCode(state.email, $('acct-del-get'), $('acct-del-msg'), 'acct_del_get');
    });
    on('acct-del-btn', 'click', doDelete);
    on('acct-sync-toggle', 'change', function () {
      var tg = $('acct-sync-toggle');
      if (tg.checked) {
        tg.checked = false; /* 先不置开，说明页确认后才生效 */
        openSyncExplainer();
      } else {
        state.syncOn = false; lsSet(K.sync, '0');
        setLast({ status: 'off' });
        toastMsg(T('acct_sync_off_note'));
        render();
      }
    });
    on('acct-consent', 'change', function () {
      $('acct-sync-enable').disabled = !$('acct-consent').checked;
    });
    on('acct-sync-enable', 'click', function () {
      if (!$('acct-consent-row').hidden) lsSet(K.consent, '1');
      state.syncOn = true; lsSet(K.sync, '1');
      setLast({ status: 'idle' });
      closeToMe();
      render();
      runSync();
    });
    on('acct-sync-cancel', 'click', closeToMe);
    on('acct-sync-now', 'click', function () { runSync(); });
    on('acct-export', 'click', doExport);
    on('acct-logout', 'click', function () {
      api('/api/auth/logout', { method: 'POST' }).catch(function () {});
      clearSession();
      render();
    });
    on('acct-logout-all', 'click', function () {
      api('/api/auth/logout-all', { method: 'POST' }).then(function () {
        clearSession();
        toastMsg(T('acct_logout_all_done'));
        render();
      }).catch(function () {
        clearSession();
        toastMsg(T('acct_logout_all_done'));
        render();
      });
    });
    var line = $('backup-acct-line');
    if (line) line.addEventListener('click', function () {
      closeToMe();
      setTimeout(function () {
        var c = $('acct-card');
        if (c) c.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
    });
    document.addEventListener('click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('[data-tab="tab-me"]') : null;
      if (!b) return;
      render();
      if (state.token && Date.now() - state.lastEnt > 60000) refreshEntitlement();
    });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && state.token && state.syncOn) runSync();
    });
    setInterval(function () {
      if (document.visibilityState === 'visible' && state.token && state.syncOn) runSync();
    }, 90000);
  }

  function init() {
    bind();
    render();
    /* 后端总开关：关 → 隐藏入口、停同步（令牌保留，恢复后可续） */
    api('/api/account/config', { auth: false }).then(function (r) {
      if (r.body && r.body.ok) {
        state.enabled = !!r.body.enabled;
        lsSet(K.cfg, state.enabled ? '1' : '0');
        render();
      }
    }).catch(function () {});
    if (state.token) {
      refreshEntitlement();
      refreshUsage();
      if (state.syncOn) setTimeout(function () { runSync(); }, 1500);
    }
  }
  window.WuriAccount = {
    runSync: runSync,
    refreshEntitlement: refreshEntitlement,
    isLoggedIn: isLoggedIn,
    _snapshot: snapshot,
    _computePush: computePush
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
