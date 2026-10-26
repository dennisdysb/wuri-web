/* 远程内容数据源（content feed）：神祇图鉴 / 经文库 / 神诞节日表 / 七十二候
 * 机制：打开时拉取 content/manifest.json 与各分段文件，校验通过后覆盖包内同名数据；
 *      上次成功的整套数据存 localStorage，断网或拉取失败时先用缓存，最终兜底是包内数据。
 * 原则：任何一步失败都静默回落，绝不让图鉴 / 经文库 / 日历空白。
 * 内容只走数据通道更新（改 content/ 下文件即可），不下载代码、不改功能，合规边界与既有口径一致。 */
(function () {
  var FEED_BASE = 'content/';
  var LS_KEY = 'wuri_feed_cache_v1';
  var TIMEOUT_MS = 5000;

  window.WURI_FEED = { source: 'bundled', applied: {} };

  function fetchJson(url) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var ctl = null;
      try { ctl = new AbortController(); } catch (e) {}
      var timer = setTimeout(function () {
        if (ctl) { try { ctl.abort(); } catch (e) {} }
        if (!done) { done = true; reject(new Error('timeout')); }
      }, TIMEOUT_MS);
      fetch(url, { cache: 'no-store', signal: ctl ? ctl.signal : undefined }).then(function (res) {
        if (!res.ok) throw new Error('http ' + res.status);
        return res.json();
      }).then(function (json) {
        if (!done) { done = true; clearTimeout(timer); resolve(json); }
      }).catch(function (err) {
        if (!done) { done = true; clearTimeout(timer); reject(err); }
      });
    });
  }

  function validDeities(d) {
    return !!(d && Array.isArray(d.groups) && d.groups.length &&
      Array.isArray(d.deities) && d.deities.length >= 1 &&
      d.deities[0].id && d.deities[0].name);
  }
  function validScriptures(d) {
    return !!(d && Array.isArray(d.index) && d.index.length && d.index[0].id && d.index[0].title);
  }
  function validFestivals(d) {
    return !!(d && d.table && typeof d.table === 'object' && Object.keys(d.table).length >= 10);
  }
  function validPentads(d) {
    return !!(d && Array.isArray(d.pentads) && d.pentads.length === 72 &&
      d.pentads[0].term && d.pentads[0].name && d.pentads[0].desc);
  }
  function validPoems(d) {
    return !!(d && Array.isArray(d.poems) && d.poems.length >= 50 &&
      d.poems[0].title && d.poems[0].author && Array.isArray(d.poems[0].text));
  }

  function applyDeities(d) {
    if (!validDeities(d)) return false;
    if (typeof window.__wuri_applyDeities === 'function') {
      window.__wuri_applyDeities({ groups: d.groups, deities: d.deities });
    } else {
      window.DEITIES_DATA = { groups: d.groups, deities: d.deities };
    }
    window.WURI_FEED.applied.deities = d.version || null;
    return true;
  }
  function applyScriptures(d) {
    if (!validScriptures(d)) return false;
    window.JINGWEN_INDEX = d.index;
    if (typeof d.filesBase === 'string' && d.filesBase) window.WURI_JING_BASE = d.filesBase;
    window.WURI_FEED.applied.scriptures = d.version || null;
    return true;
  }
  function applyFestivals(d) {
    if (!validFestivals(d)) return false;
    /* SHENDAN 是 app.js IIFE 内的作用域变量，必须走它暴露的钩子换表（钩子内部重渲） */
    if (typeof window.__wuri_applyFestivals === 'function') {
      window.__wuri_applyFestivals(d.table);
    } else {
      window.SHENDAN = d.table;
      if (typeof window.__wuri_rerender === 'function') {
        try { window.__wuri_rerender(); } catch (e) {}
      }
    }
    window.WURI_FEED.applied.festivals = d.version || null;
    return true;
  }

  function validDaozang(d) {
    return !!d && d.section === 'daozang' && Object.prototype.toString.call(d.works) === '[object Array]' && d.works.length > 0;
  }
  function applyDaozang(d) {
    if (!validDaozang(d)) return false;
    window.DAOZANG_INDEX = d;
    window.WURI_FEED.applied.daozang = d.version || null;
    return true;
  }

  function applyPentads(d) {
    if (!validPentads(d)) return false;
    window.WURI_PENTADS_DATA = d;
    window.WURI_FEED.applied.pentads = d.version || null;
    if (typeof window.__wuri_rerender === 'function') {
      try { window.__wuri_rerender(); } catch (e) {}
    }
    return true;
  }

  function applyPoems(d) {
    if (!validPoems(d)) return false;
    window.WURI_POEMS_DATA = d;
    window.WURI_FEED.applied.poems = d.version || null;
    if (typeof window.__wuri_rerender === 'function') {
      try { window.__wuri_rerender(); } catch (e) {}
    }
    return true;
  }

  function applyAll(feed, source) {
    var any = false;
    try { if (feed.deities && applyDeities(feed.deities)) any = true; } catch (e) {}
    try { if (feed.scriptures && applyScriptures(feed.scriptures)) any = true; } catch (e) {}
    try { if (feed.festivals && applyFestivals(feed.festivals)) any = true; } catch (e) {}
    try { if (feed.pentads && applyPentads(feed.pentads)) any = true; } catch (e) {}
    try { if (feed.daozang && applyDaozang(feed.daozang)) any = true; } catch (e) {}
    try { if (feed.poems && applyPoems(feed.poems)) any = true; } catch (e) {}
    if (any) window.WURI_FEED.source = source;
    return any;
  }

  /* 1) 先用上次成功的缓存（断网打开也能用最新内容；无缓存则保持包内数据） */
  try {
    var cached = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    if (cached) applyAll(cached, 'cache');
  } catch (e) {}

  /* 2) 再拉网络最新版；成功后刷新缓存。全部失败则维持缓存/包内，页面照常可用 */
  if (typeof fetch !== 'function') return;
  fetchJson(FEED_BASE + 'manifest.json').then(function (manifest) {
    if (!manifest || !manifest.sections) return null;
    var names = ['deities', 'scriptures', 'festivals', 'pentads', 'daozang', 'poems'];
    var jobs = names.map(function (name) {
      var sec = manifest.sections[name];
      if (!sec || !sec.file) return Promise.resolve(null);
      return fetchJson(FEED_BASE + sec.file).then(function (data) {
        var pair = {}; pair[name] = data; return pair;
      }).catch(function () { return null; });
    });
    return Promise.all(jobs);
  }).then(function (results) {
    if (!results) return;
    var fresh = {};
    results.forEach(function (pair) {
      if (!pair) return;
      for (var k in pair) fresh[k] = pair[k];
    });
    if (!Object.keys(fresh).length) return;
    if (applyAll(fresh, 'network')) {
      try { localStorage.setItem(LS_KEY, JSON.stringify(fresh)); } catch (e) {}
    }
  }).catch(function () { /* 静默回落 */ });
})();
