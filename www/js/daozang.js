/* 戊日不上香 · 道藏全集（Kanripo / CC BY-SA 4.0）
 * 经文库增量层：目录与正文全走 content feed（content/daozang/），不进安装包。
 *  - 一级架：三洞四辅＋續道藏＋道藏輯要＋待分類（源数据 SOURCE 字段实录，不硬编）
 *  - 阅读复用经文阅读器（JingWen.openReader）；多卷本按卷懒渲染
 *  - 注音：字典懒加载（content/daozang/pinyin.json）＋审读表词组覆盖，按卷现注
 *  - 全藏无音频：不在 JING_HAS_AUDIO 内，诵读/下载/跟读按钮自动隐藏
 *  - 书签/高亮：JingMark.marksEnabled 对 KR5* 放行，localStorage 持久化
 */
(function () {
  'use strict';
  var FEED_DIR = 'content/daozang/';
  var BU_ORDER = ['洞真部', '洞玄部', '洞神部', '太玄部', '太平部', '太清部', '正一部', '續道藏', '道藏輯要', '待分類'];
  var idxData = null;       // DAOZANG_INDEX
  var idxLoading = null;
  var pyDict = null;        // {char: pinyin}
  var pyOverrides = null;   // {word: [py,...]}
  var dictLoading = null;
  var workCache = {};       // id -> JINGWEN entry
  var openBu = {};          // bu -> true（重渲目录时恢复展开）
  var dzOpen = false;       // 道藏全集折叠体展开态（文库视图记忆 wuri_lib_view_v1）
  /* 视图记忆回灌：模块载入时先读存档展开态，renderFold 首渲即按存档展开——
     切页回来/冷启动都不必再从收起态点开。存档由 jingwen.js 统一写入，本处只读。 */
  try {
    var _lvDz = JSON.parse(localStorage.getItem('wuri_lib_view_v1') || 'null');
    if (_lvDz && _lvDz.dz) {
      dzOpen = !!_lvDz.dz.open;
      if (_lvDz.dz.bu) { for (var _bk in _lvDz.dz.bu) if (_lvDz.dz.bu[_bk]) openBu[_bk] = true; }
    }
  } catch (e) {}
  function dzNotifySave() { if (window.__wuriLibSaveView) { try { window.__wuriLibSaveView(); } catch (e) {} } }
  var punctSet = null;      // {KR id: true} 有标点版的部（index.punct）
  var punctPartial = {};    // id -> 已标卷数（部分标点，如度人经前 6 卷）

  /* 标点版（2026-10-26 用户定）：不设切换钮——有标点版者一律标点版呈现，
     无标点版者原文。旧偏好键 wuri_dz_punct 留尸不读。 */
  function hasPunct(id) { return !!(punctSet && punctSet[id]); }

  /* 标点字（与清洗口径一致）：内容字 = 非标点非空白；标点版去标点后与原文
     逐字相等（离线全量校验 119/119 卷 0 差异），故字序可双向投影 */
  var DZ_PUNCT_CHARS = '。，、；：？！·…—「」『』﹝﹞（）《》〈〉“”‘’％';
  function dzIsPunct(ch) { return DZ_PUNCT_CHARS.indexOf(ch) >= 0 || /\s/.test(ch); }
  function dzStripPunct(s) {
    var o = '';
    for (var i = 0; i < s.length; i++) if (!dzIsPunct(s[i])) o += s[i];
    return o;
  }
  /* 标点版段落排版分类（spec v1.1 §9–12）：章题/对话/韵文行在建 entry 时定类，
     渲染层只挂 class（dz-cht/dz-dlg/dz-verse），散文无类走默认缩进 */
  function punctParaCls(t, isFirst) {
    var s = dzStripPunct(t), L = s.length;
    if (!L) return '';
    if (L <= 18 && /第[一二三四五六七八九十百廿卅\d]+$/.test(s) && !/[，。；：？]/.test(t)) return 'dz-cht';
    if (/^[^，。；？！]{1,14}曰：/.test(t)) return 'dz-dlg';
    if (isFirst && L <= 20) return 'dz-verse';
    var nEnd = (t.match(/[，。；]/g) || []).length;
    if (L <= 17 && /[，。]$/.test(t) && nEnd <= 2) return 'dz-verse';
    return '';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function fmtNum(n) { return String(n || 0).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  /* 简繁显示：底本恒繁体；简体模式仅在呈现层转换（与阅读器 txScript 同一转换器，
     等长替换——书签/高亮偏移与注音下标不受影响）。繁体模式原样。 */
  function isSimp() {
    try {
      if (typeof window.curLang === 'function') return window.curLang() !== 'zh-TW';
      return document.documentElement.getAttribute('lang') !== 'zh-TW';
    } catch (e) { return true; }
  }
  function txUi(s) { try { return window.tx ? window.tx(s) : s; } catch (e) { return s; } }
  function dzTx(s) {
    if (!s || !isSimp()) return s;
    try { return window.t2s ? window.t2s(s) : s; } catch (e) { return s; }
  }

  function fillPunct(d) {
    punctSet = {};
    ((d && d.punct) || []).forEach(function (id) { punctSet[id] = true; });
    punctPartial = (d && d.punctPartial) || {};
  }
  function ensureIndex(cb) {
    if (window.DAOZANG_INDEX && window.DAOZANG_INDEX.works) { idxData = window.DAOZANG_INDEX; if (!punctSet) fillPunct(idxData); cb && cb(idxData); return; }
    if (idxData) { cb && cb(idxData); return; }
    if (idxLoading) { idxLoading.push(cb); return; }
    idxLoading = [cb];
    fetch(FEED_DIR + 'index.json').then(function (r) { return r.json(); }).then(function (d) {
      idxData = d; window.DAOZANG_INDEX = d;
      fillPunct(d);
      var cbs = idxLoading; idxLoading = null;
      cbs.forEach(function (f) { try { f && f(d); } catch (e) {} });
    }).catch(function () {
      var cbs = idxLoading; idxLoading = null;
      cbs.forEach(function (f) { try { f && f(null); } catch (e) {} });
    });
  }

  function ensureDict(cb) {
    if (pyDict) { cb && cb(true); return; }
    if (dictLoading) { dictLoading.push(cb); return; }
    dictLoading = [cb];
    fetch(FEED_DIR + 'pinyin.json').then(function (r) { return r.json(); }).then(function (d) {
      pyDict = (d && d.dict) || {};
      pyOverrides = {};
      ((d && d.overrides) || []).forEach(function (o) { pyOverrides[o.w] = o.py; });
      var cbs = dictLoading; dictLoading = null;
      cbs.forEach(function (f) { try { f && f(true); } catch (e) {} });
    }).catch(function () {
      pyDict = {}; pyOverrides = {};
      var cbs = dictLoading; dictLoading = null;
      cbs.forEach(function (f) { try { f && f(false); } catch (e) {} });
    });
  }
  window.__wuri_dzEnsureDict = ensureDict;
  /* 书名索引预加载：进入经文库/聚焦检索框时由 jingwen.js 调用，
     使统一检索的书名阶段不等临查才拉索引（264K 单文件，解析后驻内存） */
  window.__wuri_dzPreload = ensureIndex;

  /* 逐字注音：审读表词组（最长匹配）优先，其次字典单字默认；无读音留空 */
  function annotateText(t, dict, ovr) {
    var out = new Array(t.length);
    var i = 0;
    while (i < t.length) {
      var matched = false;
      if (ovr) {
        var maxL = Math.min(6, t.length - i);
        for (var L = maxL; L >= 2; L--) {
          var ov = ovr[t.substr(i, L)];
          if (ov) {
            for (var k = 0; k < L; k++) out[i + k] = ov[k] || '';
            i += L; matched = true; break;
          }
        }
      }
      if (matched) continue;
      out[i] = (dict && dict[t[i]]) || '';
      i++;
    }
    return out;
  }
  /* 注音口径（简繁同）：按底本文字注音，py 下标与显示文字 1:1 对齐（转换等长）。
     不按简体字形另建字典：繁→简多对一合并会串读——实测单字字典键转换后
     13,908→12,906（同→衕、發/髮→发 等 1,002 组合并），「同時」会被误注 tòng、
     「發泄」误注 fà。读音属于词：显示「同时」即注 tóng、「发泄」即注 fā，
     以底本注音对齐呈现，简繁两模式读音逐项一致（离线等价测试 5 部验证）。
     审读表 301 条词组键经转换后 300 键、异读冲突 0 条，两种口径等价。 */
  /* 标点段注音：先剥标点成内容字流再整体注音（审读表词组按原文字流匹配，
     不被插入的标点打断），读音再散射回内容字下标，标点位留空。
     与原文口径一致：读音属于字流，不属于标点。 */
  function annotateParaPunct(p) {
    var pos = [], stripped = '';
    for (var i = 0; i < p.t.length; i++) {
      if (!dzIsPunct(p.t[i])) { pos.push(i); stripped += p.t[i]; }
    }
    var pyC = annotateText(stripped, pyDict, pyOverrides);
    var py = new Array(p.t.length);
    for (var j = 0; j < p.t.length; j++) py[j] = '';
    for (var k = 0; k < pos.length; k++) py[pos[k]] = pyC[k] || '';
    p.py = py;
  }
  function annotateSection(entry, si) {
    var sec = entry.sections[si];
    if (!sec) return;
    if (sec._dzDone && (sec._dzWithDict || !pyDict)) return;
    sec.paras.forEach(function (p) {
      if (sec._punct) annotateParaPunct(p);
      else p.py = annotateText(p.t, pyDict, pyOverrides);
    });
    sec._dzDone = true;
    sec._dzWithDict = !!pyDict;
  }
  window.__wuri_dzAnnotate = function (entry, si) { annotateSection(entry, si); };

  /* ---------- 目录层 ---------- */
  function worksOfBu(bu) {
    return (idxData.works || []).filter(function (w) { return w.bu === bu; });
  }
  function workRow(w) {
    return '<div class="dz-work" data-dz-work="' + w.id + '">'
      + '<span class="jing-book">藏</span>'
      + '<span class="dz-wt">' + esc(dzTx(w.title)) + '</span>'
      + (w.lei ? '<span class="dz-lei">' + esc(dzTx(w.lei)) + '</span>' : '')
      + '<span class="dz-wm">' + w.juan + ' ' + txUi('卷') + ' · ' + fmtNum(w.chars) + ' ' + txUi('字') + '</span></div>';
  }
  function renderCats(body) {
    var cats = body.querySelector('.dz-cats');
    if (!cats) return;
    if (!idxData) { cats.innerHTML = '<div class="dz-empty">目录加载中…</div>'; return; }
    var present = {};
    idxData.works.forEach(function (w) { present[w.bu] = (present[w.bu] || 0) + 1; });
    var bus = BU_ORDER.filter(function (b) { return present[b]; });
    Object.keys(present).forEach(function (b) { if (bus.indexOf(b) < 0) bus.push(b); });
    cats.innerHTML = bus.map(function (bu) {
      return '<div class="dz-bu" data-dz-bu="' + esc(bu) + '"><span class="jing-book">藏</span>' + esc(dzTx(bu))
        + '<span class="dz-count">' + present[bu] + ' ' + txUi('部') + '</span><span class="jing-go">›</span></div>'
        + '<div class="dz-works" data-dz-works="' + esc(bu) + '"' + (openBu[bu] ? '' : ' hidden') + '>'
        + (openBu[bu] ? worksOfBu(bu).map(workRow).join('') : '') + '</div>';
    }).join('');
  }
  function renderFold(host) {
    var fold = document.createElement('div');
    fold.className = 'jing-sec';
    fold.setAttribute('data-dz-fold', '');
    fold.innerHTML =
      '<h3 class="jing-sec-h" data-dz-toggle>' + txUi('道藏全集')
      + '<span class="dz-count" data-dz-total></span><span class="jing-go">›</span></h3>'
      + '<div class="dz-body" data-dz-body' + (dzOpen ? '' : ' hidden') + '>'
      + '<div class="dz-cats"><div class="dz-empty">目录加载中…</div></div>'
      + '</div>';
    host.appendChild(fold);
    ensureIndex(function () {
      var total = fold.querySelector('[data-dz-total]');
      if (total && idxData) total.textContent = '（' + fmtNum(idxData.count) + ' 部）';
      var body = fold.querySelector('[data-dz-body]');
      if (body && !body.hidden) renderCats(body);
    });
  }
  window.__wuri_dzOpenWork = openWork;
  window.__wuri_dzCatalog = function (host) {
    if (!host || host.querySelector('[data-dz-fold]')) return;
    renderFold(host);
  };
  /* 文库视图记忆接口（jingwen.js 调用）：读/写道藏侧展开态（折叠体＋各部） */
  window.__wuri_dzGetState = function () {
    var bu = {};
    for (var k in openBu) if (openBu[k]) bu[k] = true;
    return { open: dzOpen, bu: bu };
  };
  window.__wuri_dzSetState = function (st) {
    if (!st) return;
    dzOpen = !!st.open;
    if (st.bu) {
      openBu = {};
      for (var k in st.bu) if (st.bu[k]) openBu[k] = true;
    }
    var body = document.querySelector('[data-dz-body]');
    if (!body) return;
    body.hidden = !dzOpen;
    if (dzOpen) {
      if (idxData) renderCats(body);
      else ensureIndex(function () {
        var b = document.querySelector('[data-dz-body]');
        if (b && !b.hidden) renderCats(b);
      });
    }
  };

  /* ---------- 开卷 ---------- */
  /* 道藏全集门控（2026-10-26 用户拍板）：目录/分类/书名对所有人可见可浏览，
   * 点开正文为高级版——在取正文之前落点拦截（不发 fetch）。统一检索命中的
   * 全藏条目点击同经 data-dz-work 委托到此，一并覆盖。 */
  function dzGate(id) {
    if (window.WuriPro && WuriPro.isPro()) return true;
    /* 书架扩容例外（2026-10-28 用户批准）：挂入常见经文架的 10 部 KR 指针
       按常见经文口径免费（名单由 jingwen.js 暴露 __wuriShelfFreeKR 共用）；
       自全藏分类点开同一部仍走此口径——同一本书不两价 */
    if (id && window.__wuriShelfFreeKR && window.__wuriShelfFreeKR[id]) return true;
    if (window.WuriPro) WuriPro.requirePro('daozang');
    return false;
  }
  function buildOrigSections(w) {
    return w.volumes.map(function (v) {
      return { h: v.h, paras: v.paras.map(function (t) { return { t: t }; }) };
    });
  }
  /* 标点版 sections：逐卷对位——有标点卷用标点段（_punct 标＋排版分类），
     未覆盖卷（如度人经第 7 卷起）回落原文段，两套 sections 卷序恒一致 */
  function buildPunctSections(w, pw) {
    return w.volumes.map(function (v, vi) {
      var pv = pw && pw.volumes && pw.volumes[vi];
      if (!pv) return { h: v.h, paras: v.paras.map(function (t) { return { t: t }; }) };
      return {
        h: pv.h || v.h, _punct: true,
        paras: pv.paras.map(function (t, pi) {
          var o = { t: t };
          var cls = punctParaCls(t, pi === 0);
          if (cls) o.cls = cls;
          return o;
        })
      };
    });
  }
  function applyDzMode(entry) {
    entry.punctMode = !!entry.hasPunct;
    entry.sections = entry.punctMode ? entry.sectionsPunct : entry.sectionsOrig;
  }
  function openWork(id, rowEl) {
    if (!dzGate(id)) return;
    /* 返回定位：记下出处（全藏分类列表/统一检索命中），jingwen.js 在
       closeReader 时统一恢复原分类原滚动位（__wuriLibCapture） */
    if (window.__wuriLibCapture) { try { window.__wuriLibCapture(id, rowEl); } catch (e) {} }
    if (workCache[id]) { doOpen(workCache[id]); return; }
    var old = rowEl ? rowEl.innerHTML : '';
    if (rowEl) rowEl.innerHTML = '<span class="dz-wt">载入中…</span>';
    ensureIndex(function () {
      var pText = fetch(FEED_DIR + 'texts/' + id + '.json').then(function (r) { return r.json(); });
      var pPunct = hasPunct(id)
        ? fetch(FEED_DIR + 'texts-punct/' + id + '.json').then(function (r) { return r.json(); }).catch(function () { return null; })
        : Promise.resolve(null);
      Promise.all([pText, pPunct]).then(function (res) {
        var w = res[0], pw = res[1];
        var entry = {
          id: w.id, title: w.title,
          /* 分类/编号不在书头显示（2026-10-27 用户定）：随 dzMeta 交阅读器，文末一行小字交代 */
          dzMeta: { bu: w.bu, lei: w.lei || '', dz: w.dz || '' },
          note: w.note, daozang: true, lazy: (w.volumes.length > 1),
          hasPunct: !!(pw && pw.volumes && pw.volumes.length),
          punctPartial: null,
          sectionsOrig: buildOrigSections(w),
          sectionsPunct: null,
          sections: null
        };
        if (entry.hasPunct) {
          entry.sectionsPunct = buildPunctSections(w, pw);
          if (pw.volumes.length < w.volumes.length) {
            entry.punctPartial = { done: pw.volumes.length, total: w.volumes.length };
          }
        }
        applyDzMode(entry);
        workCache[id] = entry;
        window.JINGWEN = window.JINGWEN || {};
        window.JINGWEN[id] = entry;
        /* 成功也要还原行内容：否则返回列表时刚读的那条永远停在「载入中…」
           （与返回定位高亮叠加后更显眼，2026-10-27 冒烟截图实证） */
        if (rowEl) rowEl.innerHTML = old;
        doOpen(entry);
      }).catch(function () {
        if (rowEl) rowEl.innerHTML = old;
        if (window.showToast) showToast('载入失败，请检查网络后重试');
      });
    });
  }

  /* ---------- 高亮字序投影（存储恒为原文坐标，显示按模式投影） ----------
   * 标点版与原文内容字逐字同序（保真校验），故以「内容字序号」为中介：
   * 原文段内偏移 → 全卷内容字区间 → 标点段串内下标，反之亦然。
   * 运行时逐卷自检 strip(标点全文)===原文全文，不符则该卷不投影（回退原样）。 */
  /* 入口查找：全藏走 workCache；精选内丹的标点 entry 挂在 JINGWEN 上
     （jingwen.js prepJingPunct 建 sectionsOrig/sectionsPunct），投影与切换共用此查找 */
  function dzFindEntry(id) {
    if (!id) return null;
    if (workCache[id]) return workCache[id];
    var j = window.JINGWEN && window.JINGWEN[id];
    return (j && j.sectionsPunct) ? j : null;
  }
  function dzSecMap(entry, si) {
    if (!entry || !entry.sectionsPunct) return null;
    entry._hlMaps = entry._hlMaps || {};
    if (entry._hlMaps[si] !== undefined) return entry._hlMaps[si];
    var oSec = entry.sectionsOrig[si], pSec = entry.sectionsPunct[si];
    var map = null;
    if (oSec && pSec && pSec._punct) {
      var oJoin = oSec.paras.map(function (p) { return p.t; }).join('');
      var pJoin = pSec.paras.map(function (p) { return p.t; }).join('');
      /* 两侧同口径剥除后比对：原文侧的清洗残留（入药镜 2 处、天仙正理 22 处
         制表符等空白）同样剥除，否则这类底本永远投影失败、高亮只能走回退
         （v143 已知尾巴，本批修复）。原文侧同步建内容字位表 oPos，
         原文坐标（原始下标）与内容字序号经 oPos 互转，残留字符不占内容位。 */
      if (dzStripPunct(pJoin) === dzStripPunct(oJoin)) {
        var oCum = [], oPos = [], oc = 0;
        oSec.paras.forEach(function (p) {
          var pos = [];
          for (var i = 0; i < p.t.length; i++) if (!dzIsPunct(p.t[i])) pos.push(i);
          oCum.push(oc); oPos.push(pos); oc += pos.length;
        });
        var pCum = [], pPos = [], pc = 0;
        pSec.paras.forEach(function (p) {
          var pos = [];
          for (var i = 0; i < p.t.length; i++) if (!dzIsPunct(p.t[i])) pos.push(i);
          pCum.push(pc); pPos.push(pos); pc += pos.length;
        });
        map = { oCum: oCum, pCum: pCum, pPos: pPos, oPos: oPos, oLens: oPos.map(function (x) { return x.length; }) };
      }
    }
    entry._hlMaps[si] = map;
    return map;
  }
  /* 原文坐标 → 显示（标点）坐标段数组；非标点模式/无映射返回 null（调用方回退原值） */
  window.__wuri_dzHlToDisp = function (sid, h) {
    var e = dzFindEntry(sid);
    if (!e || !e.punctMode || !h) return null;
    var m = dzSecMap(e, h.sec);
    if (!m) return null;
    /* 存储坐标为原文原始下标，先经 oPos 换算为内容字序号（残留空白不占位） */
    var oPosH = m.oPos[h.para];
    if (!oPosH) return null;
    var c0 = 0; while (c0 < oPosH.length && oPosH[c0] < h.start) c0++;
    var c1 = c0; while (c1 < oPosH.length && oPosH[c1] < h.end) c1++;
    var g0 = m.oCum[h.para] + c0, g1 = m.oCum[h.para] + c1;
    var out = [];
    for (var j = 0; j < m.pPos.length; j++) {
      var ps = m.pCum[j], pe = ps + m.pPos[j].length;
      var a = Math.max(g0, ps), b = Math.min(g1, pe);
      if (a < b) out.push({ sec: h.sec, para: j, start: m.pPos[j][a - ps], end: m.pPos[j][b - ps - 1] + 1 });
    }
    return out.length ? out : null;
  };
  /* 显示（标点）选区段 → 原文坐标段数组（可能跨原文段，逐段拆） */
  window.__wuri_dzHlToOrig = function (sid, seg) {
    var e = dzFindEntry(sid);
    if (!e || !e.punctMode || !seg) return null;
    var m = dzSecMap(e, seg.sec);
    if (!m) return null;
    var pos = m.pPos[seg.para];
    if (!pos) return null;
    var c0 = 0; while (c0 < pos.length && pos[c0] < seg.start) c0++;
    var c1 = c0; while (c1 < pos.length && pos[c1] < seg.end) c1++;
    var g0 = m.pCum[seg.para] + c0, g1 = m.pCum[seg.para] + c1;
    if (g1 <= g0) return null;
    var out = [];
    for (var i = 0; i < m.oCum.length; i++) {
      var os = m.oCum[i], oe = os + m.oLens[i];
      var a = Math.max(g0, os), b = Math.min(g1, oe);
      /* 内容字序号 → 原文原始下标（与存储坐标口径一致） */
      if (a < b) out.push({ sec: seg.sec, para: i, start: m.oPos[i][a - os], end: m.oPos[i][b - os - 1] + 1 });
    }
    return out.length ? out : null;
  };
  function doOpen(entry) {
    var pyOn = true; /* 与阅读器一致：未设置时默认开（LS 为 '0' 才是关） */
    try { pyOn = localStorage.getItem('wuri_jing_py') !== '0'; } catch (e) {}
    var go = function () {
      annotateSection(entry, 0);
      if (window.JingWen && JingWen.openReader) JingWen.openReader(entry.id);
    };
    if (pyOn && !pyDict) {
      var done = false;
      ensureDict(function () { if (!done) { done = true; go(); } });
      setTimeout(function () { if (!done) { done = true; go(); } }, 5000);
    } else {
      if (pyOn && !pyDict) ensureDict(function () {});
      go();
    }
  }

  /* ---------- 事件（委托） ---------- */
  document.addEventListener('click', function (e) {
    var tgl = e.target.closest('[data-dz-toggle]');
    if (tgl) {
      var body = tgl.parentNode.querySelector('[data-dz-body]');
      if (body) {
        body.hidden = !body.hidden;
        dzOpen = !body.hidden;
        if (!body.hidden) renderCats(body);
        dzNotifySave();
      }
      return;
    }
    var bu = e.target.closest('[data-dz-bu]');
    if (bu) {
      var name = bu.getAttribute('data-dz-bu');
      var wrap = bu.parentNode.querySelector('[data-dz-works="' + name + '"]');
      if (wrap) {
        var willOpen = wrap.hidden;
        if (willOpen && !wrap.innerHTML) wrap.innerHTML = worksOfBu(name).map(workRow).join('');
        wrap.hidden = !willOpen;
        openBu[name] = willOpen;
        dzNotifySave();
      }
      return;
    }
    var wk = e.target.closest('[data-dz-work]');
    if (wk) { openWork(wk.getAttribute('data-dz-work'), wk); }
  });
  /* 统一检索钩子：经文库主检索（jingwen.js search）经此搜全藏书名——
     原文书名与简体显示书名双向匹配；命中点开走 openWork（data-dz-work 委托） */
  window.__wuri_dzTitleSearch = function (q, cb) {
    ensureIndex(function () {
      if (!idxData || !q) { cb && cb([]); return; }
      var hits = [];
      idxData.works.forEach(function (w) {
        if (w.title.indexOf(q) >= 0 || dzTx(w.title).indexOf(q) >= 0) {
          hits.push({
            id: w.id, title: w.title, dz: true,
            snip: '道藏全集 · ' + w.bu + (w.lei ? ' · ' + w.lei + '类' : '') + ' · ' + w.juan + ' 卷'
          });
        }
      });
      cb && cb(hits.slice(0, 60));
    });
  };
})();
