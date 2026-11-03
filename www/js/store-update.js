/* 戊日不上香 · 商店渠道自检更新（App Store / Google Play）
 * 只在原生商店壳里运行：普通网页/PWA 环境直接退出（网页版靠 SW 自更新，不弹此卡）。
 * 渠道分流（2026-11-02 定案，杜绝跨渠道串源）：
 *   iOS  —— 版本源只认 App Store：iTunes Lookup(id=6818389401) 的 version/releaseNotes；
 *           按钮直达 App Store 本 App 页。绝不读 CN feed、绝不出现下载站/APK 字样。
 *   Play —— 版本源为自有 feed 的 play 块（download.shengboyu.ca/apk/version.json 的
 *           play.versionName/play.notes，由发版流程随 Play 发布说明同步）；
 *           按钮直达 Google Play 本 App 页。
 * 已装版本：构建期由备料脚本注入 window.WURI_APP_VERSION（显示版号，如 '3.0.1'）；
 *           取不到本地版本时静默不查——宁可不弹，绝不误报。
 * 节流 24h；同一商店版本「暂不」后不再提示。比较口径：显示版号逐段数值比较，
 *           同版/低版绝不弹。 */
(function () {
  'use strict';
  var APPLE_ID = '6818389401';
  var STORE_URL_IOS = 'https://apps.apple.com/app/id' + APPLE_ID;
  var STORE_URL_PLAY = 'https://play.google.com/store/apps/details?id=com.dennisdysb.wuribushangxiang';
  var FEED_URL = 'https://download.shengboyu.ca/apk/version.json';
  var LS_CHECK = 'wuri_store_update_check';
  var LS_DISMISS = 'wuri_store_update_dismissed';
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  /* ---- 纯函数（可单测） ---- */
  function parseVer(v) {
    if (typeof v !== 'string') return null;
    var m = v.trim().replace(/^v/i, '').match(/^\d+(\.\d+)*$/);
    if (!m) return null;
    return m[0].split('.').map(function (x) { return parseInt(x, 10); });
  }
  /* a>b → 1，a<b → -1，相等 → 0；任一不可解析 → null（不弹） */
  function cmpVer(a, b) {
    var pa = parseVer(a), pb = parseVer(b);
    if (!pa || !pb) return null;
    var n = Math.max(pa.length, pb.length);
    for (var i = 0; i < n; i++) {
      var x = pa[i] || 0, y = pb[i] || 0;
      if (x !== y) return x > y ? 1 : -1;
    }
    return 0;
  }
  function detectChannel() {
    var w = window;
    if (w.WURI_CHANNEL === 'ios' || w.WURI_CHANNEL === 'play' || w.WURI_CHANNEL === 'cn') return w.WURI_CHANNEL;
    var ua = (navigator.userAgent || '');
    var isIOS = /iPhone|iPad|iPod/.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    var inShell = !!(w.cordova || w.Capacitor || (w.webkit && w.webkit.messageHandlers) || w.WuBridge);
    if (!inShell) return 'web';
    if (isIOS) return 'ios';
    if (w.WuBridge) return 'play'; /* Android 壳在本模块的语境只有 Play（CN 走 cn-update.js） */
    return 'web';
  }
  function localVersion() {
    if (typeof window.WURI_APP_VERSION === 'string' && parseVer(window.WURI_APP_VERSION)) return window.WURI_APP_VERSION;
    return null;
  }

  /* ---- UI：底部 sheet（吸底、压暗背景、变量配色，三态跟随主题变量链） ---- */
  var CSS = [
    '#wuri-upd-scrim{position:fixed;inset:0;z-index:400;background:rgba(20,14,4,.38);display:flex;align-items:flex-end;justify-content:center;}',
    '#wuri-upd-sheet{background:var(--card,#fffdf7);color:var(--ink,#222);border:1px solid var(--line,#d8cfc0);border-radius:16px 16px 0 0;box-shadow:0 -8px 32px rgba(60,45,20,.22);width:100%;max-width:560px;max-height:62vh;display:flex;flex-direction:column;padding:16px 16px calc(12px + env(safe-area-inset-bottom,0px));}',
    '#wuri-upd-sheet h3{margin:0 0 8px;font-size:1.05rem;}',
    '#wuri-upd-notes{overflow-y:auto;font-size:.92rem;line-height:1.55;white-space:pre-wrap;margin:0 0 12px;}',
    '#wuri-upd-row{display:flex;gap:10px;}',
    '#wuri-upd-row .btn{flex:1;}'
  ].join('');
  function showSheet(opts) {
    if (document.getElementById('wuri-upd-scrim')) return;
    var st = document.createElement('style');
    st.id = 'wuri-upd-style'; st.textContent = CSS;
    document.head.appendChild(st);
    var scrim = document.createElement('div');
    scrim.id = 'wuri-upd-scrim';
    var sheet = document.createElement('div');
    sheet.id = 'wuri-upd-sheet';
    var h = document.createElement('h3');
    h.textContent = '发现新版 v' + opts.version;
    sheet.appendChild(h);
    if (opts.notes) {
      var p = document.createElement('p');
      p.id = 'wuri-upd-notes';
      p.textContent = opts.notes;
      sheet.appendChild(p);
    }
    var row = document.createElement('div');
    row.id = 'wuri-upd-row';
    var go = document.createElement('button');
    go.className = 'btn primary';
    go.textContent = opts.cta;
    go.addEventListener('click', function () { window.open(opts.url, '_system'); });
    var no = document.createElement('button');
    no.className = 'btn';
    no.textContent = '暂不';
    no.addEventListener('click', function () {
      set(LS_DISMISS, opts.channel + ':' + opts.version);
      close();
    });
    row.appendChild(go); row.appendChild(no);
    sheet.appendChild(row);
    scrim.appendChild(sheet);
    scrim.addEventListener('click', function (e) { if (e.target === scrim) close(); });
    document.body.appendChild(scrim);
    function close() { if (scrim.parentNode) scrim.parentNode.removeChild(scrim); }
  }

  /* ---- 数据源 ---- */
  function fetchJSON(url, timeoutMs) {
    var ctl = null;
    try {
      ctl = new AbortController();
      setTimeout(function () { try { ctl.abort(); } catch (e) {} }, timeoutMs || 6000);
    } catch (e) {}
    return fetch(url, { cache: 'no-store', signal: ctl ? ctl.signal : undefined }).then(function (r) {
      if (!r.ok) throw new Error('http ' + r.status);
      return r.json();
    });
  }
  function checkIOS(local) {
    return fetchJSON('https://itunes.apple.com/lookup?id=' + APPLE_ID).then(function (d) {
      if (!d || !d.results || !d.results.length) return; /* 未上架/查无：静默 */
      var info = d.results[0];
      if (!info.version) return;
      if (cmpVer(info.version, local) !== 1) return;
      if (get(LS_DISMISS) === 'ios:' + info.version) return;
      showSheet({ channel: 'ios', version: info.version, notes: info.releaseNotes || '', cta: '前往 App Store 更新', url: info.trackViewUrl || STORE_URL_IOS });
    });
  }
  function checkPlay(local) {
    return fetchJSON(FEED_URL).then(function (d) {
      var p = (d && d.play) || null;
      if (!p || !p.versionName) return;
      if (cmpVer(p.versionName, local) !== 1) return;
      if (get(LS_DISMISS) === 'play:' + p.versionName) return;
      showSheet({ channel: 'play', version: p.versionName, notes: p.notes || '', cta: '前往 Google Play 更新', url: STORE_URL_PLAY });
    });
  }
  function check() {
    var ch = detectChannel();
    if (ch !== 'ios' && ch !== 'play') return;
    var local = localVersion();
    if (!local) return; /* 本地版本未知：不查不错报 */
    var last = parseInt(get(LS_CHECK) || '0', 10);
    if (last && Date.now() - last < 24 * 3600 * 1000) return;
    set(LS_CHECK, String(Date.now()));
    if (typeof fetch !== 'function') return;
    (ch === 'ios' ? checkIOS(local) : checkPlay(local)).catch(function () { /* 离线/失败：静默 */ });
  }
  window.WuriStoreUpdate = { cmpVer: cmpVer, parseVer: parseVer, detectChannel: detectChannel, _check: check };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(check, 2500); });
  } else {
    setTimeout(check, 2500);
  }
})();
