/* 戊日不上香 · 道藏全藏（Kanripo / CC BY-SA 4.0）
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
  function annotateText(t) {
    var out = new Array(t.length);
    var i = 0;
    while (i < t.length) {
      var matched = false;
      if (pyOverrides) {
        var maxL = Math.min(6, t.length - i);
        for (var L = maxL; L >= 2; L--) {
          var ov = pyOverrides[t.substr(i, L)];
          if (ov) {
            for (var k = 0; k < L; k++) out[i + k] = ov[k] || '';
            i += L; matched = true; break;
          }
        }
      }
      if (matched) continue;
      out[i] = (pyDict && pyDict[t[i]]) || '';
      i++;
    }
    return out;
  }
  function annotateSection(entry, si) {
    var sec = entry.sections[si];
    if (!sec) return;
    if (sec._dzDone && (sec._dzWithDict || !pyDict)) return;
    sec.paras.forEach(function (p) { p.py = annotateText(p.t); });
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
      + '<span class="dz-wt">' + esc(w.title) + '</span>'
      + (w.lei ? '<span class="dz-lei">' + esc(w.lei) + '</span>' : '')
      + '<span class="dz-wm">' + w.juan + ' 卷 · ' + fmtNum(w.chars) + ' 字</span></div>';
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
      return '<div class="dz-bu" data-dz-bu="' + esc(bu) + '">' + esc(bu)
        + '<span class="dz-count">' + present[bu] + ' 部</span><span class="jing-go">›</span></div>'
        + '<div class="dz-works" data-dz-works="' + esc(bu) + '"' + (openBu[bu] ? '' : ' hidden') + '>'
        + (openBu[bu] ? worksOfBu(bu).map(workRow).join('') : '') + '</div>';
    }).join('');
  }
  function renderFold(host) {
    var fold = document.createElement('div');
    fold.className = 'jing-sec';
    fold.setAttribute('data-dz-fold', '');
    fold.innerHTML =
      '<h3 class="jing-sec-h" data-dz-toggle>道藏全藏'
      + '<span class="dz-count" data-dz-total></span><span class="jing-go">›</span></h3>'
      + '<div class="dz-body" data-dz-body hidden>'
      + '<div class="dz-note">底本直出 · 未经校订（Kanripo 录《正统道藏》等底本，CC BY-SA 4.0）</div>'
      + '<div class="dz-search"><input type="search" data-dz-q placeholder="按书名检索全藏…" aria-label="按书名检索全藏"></div>'
      + '<div class="dz-results" data-dz-results></div>'
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
  document.addEventListener('input', function (e) {
    var q = e.target.closest('[data-dz-q]');
    if (!q) return;
    var fold = q.closest('[data-dz-fold]');
    var box = fold && fold.querySelector('[data-dz-results]');
    if (!box) return;
    var v = (q.value || '').trim();
    if (!v) { box.innerHTML = ''; return; }
    ensureIndex(function () {
      if (!idxData) { box.innerHTML = '<div class="dz-empty">目录未就绪</div>'; return; }
      var hits = idxData.works.filter(function (w) { return w.title.indexOf(v) >= 0; });
      if (!hits.length) { box.innerHTML = '<div class="dz-empty">无此书名</div>'; return; }
      box.innerHTML = '<div class="dz-hitn">命中 ' + hits.length + ' 部' + (hits.length > 80 ? '（仅列前 80）' : '') + '</div>'
        + hits.slice(0, 80).map(workRow).join('');
    });
  });
})();
