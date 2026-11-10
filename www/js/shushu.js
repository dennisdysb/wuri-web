/* 术数古籍（v603）：经文/书库区「术数古籍」折叠体，与道藏全集并列分区。
 * 文本：维基文库四库全書本转录（CC BY-SA 4.0），目录见 content/shushu/index.json。
 * 入口由 jingwen.js 挂钩（__wuri_ssCatalog），开卷建 JINGWEN 条目后走 JingWen.openReader；
 * 不进道藏 index.json / texts / 搜索索引；免费开放，不走 Pro 门控、不走内丹门控。
 * 样式复用道藏行样式（.dz-work/.dz-wtext/.dz-wmeta/.dz-lei 等，走同一变量链，
 * 日间/夜间/红光三态一致）；行为属性用 data-ss-*，与道藏委托互不干扰。 */
(function () {
  'use strict';
  var SS_DIR = 'content/shushu/';
  /* 类名用 index.json 所存繁体（与 daozang.js BU_ORDER 同口径），显示经 ssTx 转简体 */
  var CAT_ORDER = ['風水', '八字', '奇門', '六爻'];
  var idxData = null, idxLoading = null;
  var workCache = {}, workLoading = {};

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function fmtNum(n) { return String(n || 0).replace(/\B(?=(?:\d{3})+(?!\d))/g, ','); }
  function isSimp() {
    try {
      if (window.I18N && typeof window.curLang === 'function') return window.curLang() !== 'zh-TW';
      return document.documentElement.getAttribute('lang') !== 'zh-TW';
    } catch (e) { return true; }
  }
  /* UI 文案简繁（i18n 的 tx 仅繁体模式动手，简体原样） */
  function txUi(s) { try { return window.tx ? window.tx(s) : s; } catch (e) { return s; } }
  /* 库内繁体书名/类名在简体模式下转简体（与 daozang.js dzTx 同口径） */
  function ssTx(s) {
    if (!s || !isSimp()) return s;
    try { return window.t2s ? window.t2s(s) : s; } catch (e) { return s; }
  }

  function ensureIndex(cb) {
    if (window.SHUSHU_INDEX && window.SHUSHU_INDEX.works) { idxData = window.SHUSHU_INDEX; cb && cb(idxData); return; }
    if (idxData) { cb && cb(idxData); return; }
    if (idxLoading) { idxLoading.push(cb); return; }
    idxLoading = [cb];
    fetch(SS_DIR + 'index.json').then(function (r) { return r.json(); }).then(function (d) {
      idxData = d; window.SHUSHU_INDEX = d;
      var cbs = idxLoading; idxLoading = null;
      cbs.forEach(function (f) { f && f(d); });
    }).catch(function () {
      var cbs = idxLoading; idxLoading = null;
      cbs.forEach(function (f) { f && f(null); });
    });
  }

  function workRow(w) {
    var pill = '<span class="dz-lei">' + esc(ssTx(w.category)) + '</span>';
    return '<div class="dz-work" data-ss-work="' + w.id + '">'
      + '<span class="jing-book">术</span>'
      + '<span class="dz-wtext"><span class="dz-wt">' + esc(ssTx(w.title)) + '</span>'
      + '<span class="dz-wmeta">'
      + pill
      + '<span class="dz-wm">' + w.juan + ' ' + txUi('卷') + ' · ' + fmtNum(w.chars) + ' ' + txUi('字') + '</span>'
      + '</span></span></div>';
  }
  function worksOfCat(cat) {
    return ((idxData && idxData.works) || []).filter(function (w) { return w.category === cat; });
  }
  function renderCats(body) {
    var cats = body.querySelector('.dz-cats');
    if (!cats) return;
    if (!idxData) { cats.innerHTML = '<div class="dz-empty">目录加载中…</div>'; return; }
    var present = {};
    idxData.works.forEach(function (w) { present[w.category] = (present[w.category] || 0) + 1; });
    var cats0 = CAT_ORDER.filter(function (c) { return present[c]; });
    Object.keys(present).forEach(function (c) { if (cats0.indexOf(c) < 0) cats0.push(c); });
    cats.innerHTML = cats0.map(function (cat) {
      return '<div class="dz-bu" data-ss-cat="' + esc(cat) + '"><span class="jing-book">术</span>' + esc(ssTx(cat))
        + '<span class="dz-count">' + present[cat] + ' ' + txUi('部') + '</span><span class="jing-go">›</span></div>'
        + '<div class="dz-works" data-ss-works="' + esc(cat) + '" hidden></div>';
    }).join('');
  }
  function renderFold(host) {
    var fold = document.createElement('div');
    fold.className = 'jing-sec';
    fold.setAttribute('data-ss-fold', '');
    fold.innerHTML =
      '<h3 class="jing-sec-h" data-ss-toggle>' + txUi('术数古籍')
      + '<span class="dz-count" data-ss-total></span><span class="jing-go">›</span></h3>'
      + '<div class="dz-body" data-ss-body hidden>'
      + '<div class="dz-cats"><div class="dz-empty">目录加载中…</div></div>'
      + '</div>';
    host.appendChild(fold);
    ensureIndex(function () {
      var total = fold.querySelector('[data-ss-total]');
      if (total && idxData) total.textContent = '（' + fmtNum(idxData.count) + ' ' + txUi('部') + '）';
      var body = fold.querySelector('[data-ss-body]');
      if (body && !body.hidden) renderCats(body);
    });
  }
  window.__wuri_ssCatalog = function (host) {
    if (!host || host.querySelector('[data-ss-fold]')) return;
    renderFold(host);
  };

  function buildOrigSections(w) {
    return w.volumes.map(function (v) {
      return { h: v.h, paras: v.paras.map(function (t) { return { t: t }; }) };
    });
  }
  function openWork(id, rowEl) {
    if (!id) return;
    if (workCache[id]) { doOpen(workCache[id]); return; }
    if (workLoading[id]) return;
    workLoading[id] = true;
    /* 返回定位：记下出处，jingwen.js 在 closeReader 时统一恢复原分类原滚动位 */
    if (window.__wuriLibCapture) { try { window.__wuriLibCapture(id, rowEl); } catch (e) {} }
    fetch(SS_DIR + 'texts/' + id + '.json').then(function (r) { return r.json(); }).then(function (w) {
      workLoading[id] = false;
      var entry = {
        id: w.id, title: w.title,
        ssMeta: { category: w.category, author: w.author, base: w.base },
        note: w.note, shushu: true, lazy: (w.volumes.length > 1),
        sectionsOrig: buildOrigSections(w),
        sections: null
      };
      entry.sections = entry.sectionsOrig;
      window.JINGWEN = window.JINGWEN || {};
      window.JINGWEN[id] = entry;
      workCache[id] = entry;
      doOpen(entry);
    }).catch(function () { workLoading[id] = false; });
  }
  function doOpen(entry) {
    if (window.JingWen && JingWen.openReader) JingWen.openReader(entry.id);
  }
  window.__wuri_ssOpenWork = openWork;

  /* ---------- 事件（委托） ---------- */
  document.addEventListener('click', function (e) {
    var tgl = e.target.closest('[data-ss-toggle]');
    if (tgl) {
      var body = tgl.parentNode.querySelector('[data-ss-body]');
      if (body) {
        body.hidden = !body.hidden;
        if (!body.hidden) renderCats(body);
      }
      return;
    }
    var cat = e.target.closest('[data-ss-cat]');
    if (cat) {
      var name = cat.getAttribute('data-ss-cat');
      var wrap = cat.parentNode.querySelector('[data-ss-works="' + name + '"]');
      if (wrap) {
        var willOpen = wrap.hidden;
        if (willOpen && !wrap.innerHTML) { wrap.innerHTML = worksOfCat(name).map(workRow).join(''); }
        wrap.hidden = !willOpen;
      }
      return;
    }
    var wk = e.target.closest('[data-ss-work]');
    if (wk) { openWork(wk.getAttribute('data-ss-work'), wk); }
  });
})();
