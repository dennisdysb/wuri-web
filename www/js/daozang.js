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

  function ensureIndex(cb) {
    if (window.DAOZANG_INDEX && window.DAOZANG_INDEX.works) { idxData = window.DAOZANG_INDEX; cb && cb(idxData); return; }
    if (idxData) { cb && cb(idxData); return; }
    if (idxLoading) { idxLoading.push(cb); return; }
    idxLoading = [cb];
    fetch(FEED_DIR + 'index.json').then(function (r) { return r.json(); }).then(function (d) {
      idxData = d; window.DAOZANG_INDEX = d;
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
  function annotateSection(entry, si) {
    var sec = entry.sections[si];
    if (!sec) return;
    if (sec._dzDone && (sec._dzWithDict || !pyDict)) return;
    sec.paras.forEach(function (p) { p.py = annotateText(p.t, pyDict, pyOverrides); });
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
      return '<div class="dz-bu" data-dz-bu="' + esc(bu) + '">' + esc(dzTx(bu))
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
      + '<div class="dz-body" data-dz-body hidden>'
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
  window.__wuri_dzCatalog = function (host) {
    if (!host || host.querySelector('[data-dz-fold]')) return;
    renderFold(host);
  };

  /* ---------- 开卷 ---------- */
  function openWork(id, rowEl) {
    if (workCache[id]) { doOpen(workCache[id]); return; }
    var old = rowEl ? rowEl.innerHTML : '';
    if (rowEl) rowEl.innerHTML = '<span class="dz-wt">载入中…</span>';
    fetch(FEED_DIR + 'texts/' + id + '.json').then(function (r) { return r.json(); }).then(function (w) {
      var entry = {
        id: w.id, title: w.title,
        subtitle: w.bu + (w.lei ? ' · ' + w.lei + '类' : '') + (w.dz ? ' · ' + w.dz : ''),
        note: w.note, daozang: true, lazy: (w.volumes.length > 1),
        sections: w.volumes.map(function (v) {
          return { h: v.h, paras: v.paras.map(function (t) { return { t: t }; }) };
        })
      };
      workCache[id] = entry;
      window.JINGWEN = window.JINGWEN || {};
      window.JINGWEN[id] = entry;
      doOpen(entry);
    }).catch(function () {
      if (rowEl) rowEl.innerHTML = old;
      if (window.showToast) showToast('载入失败，请检查网络后重试');
    });
  }
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
        if (!body.hidden) renderCats(body);
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
