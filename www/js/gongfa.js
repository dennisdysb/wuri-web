/* 功法播放器（v610）：详情页顶部播放器。
 * 点封面 → 按频道取 content/gongfa/videos.json 直链 → 建 <video> 直接播；
 * 全屏用播放器自带控制；视频不进 SW 缓存、不打包进安装包。
 * 频道：window.WURI_CHANNEL === 'cn' 走国内 ECS，其余（网页/Play/iOS）走海外 R2。
 * 弱网（effectiveType 2g/3g）且有 480p 档时优先 480p（目前仅易筋经有两档）。 */
(function () {
  'use strict';
  var DATA_URL = 'content/gongfa/videos.json';
  var dataPromise = null;
  function loadData() {
    if (!dataPromise) {
      dataPromise = fetch(DATA_URL, { cache: 'no-store' }).then(function (r) {
        if (!r.ok) throw new Error('videos.json ' + r.status);
        return r.json();
      }).catch(function () { return null; });
    }
    return dataPromise;
  }
  function pickUrl(entry) {
    if (!entry) return null;
    var domestic = (window.WURI_CHANNEL === 'cn');
    var slow = false;
    try {
      var c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      if (c && c.effectiveType && (c.effectiveType === 'slow-2g' || c.effectiveType === '2g' || c.effectiveType === '3g')) slow = true;
    } catch (e) { /* 网络信息不可用时走默认档 */ }
    if (domestic) return (slow && entry.domestic_480p) || entry.domestic || entry.overseas;
    return (slow && entry.overseas_480p) || entry.overseas;
  }
  function pauseAll(except) {
    var vids = document.querySelectorAll('.gf-player video');
    for (var i = 0; i < vids.length; i++) {
      if (vids[i] !== except && !vids[i].paused) vids[i].pause();
    }
  }
  function playOne(box) {
    if (box.querySelector('video')) return; /* 已建好，点播放器本身即播 */
    var key = box.getAttribute('data-gf');
    var hint = box.querySelector('.gf-player-hint');
    loadData().then(function (data) {
      var entry = data && data.videos && data.videos[key];
      var url = pickUrl(entry);
      if (!url) {
        if (hint) hint.textContent = '视频暂不可用，请稍后重试';
        return;
      }
      var v = document.createElement('video');
      v.setAttribute('controls', '');
      v.setAttribute('playsinline', '');
      v.setAttribute('preload', 'auto');
      v.src = url;
      /* 国内直链不通时回落海外（只试一次；例如 ECS 安全组未放行时） */
      v.addEventListener('error', function () {
        if (!v.dataset.fellBack && url !== entry.overseas && entry.overseas) {
          v.dataset.fellBack = '1';
          v.src = entry.overseas;
          var p2 = v.play();
          if (p2 && p2.catch) p2.catch(function () {});
        }
      });
      var facade = box.querySelector('.gf-player-facade');
      if (facade) facade.remove();
      box.appendChild(v);
      v.addEventListener('play', function () { pauseAll(v); });
      var p = v.play();
      if (p && p.catch) p.catch(function () { /* 用户手势受限时由播放器自带控制接手 */ });
    });
  }
  function init() {
    var boxes = document.querySelectorAll('.gf-player');
    for (var i = 0; i < boxes.length; i++) {
      (function (box) {
        box.addEventListener('click', function () { playOne(box); });
        box.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); playOne(box); }
        });
      })(boxes[i]);
    }
    /* 返回详情页时停掉正在播的视频（返回按钮与悬浮返回都走同一 click） */
    document.addEventListener('click', function (e) {
      var t = e.target && e.target.closest ? e.target.closest('[id^="gf-"][id$="-back"], #gongfa-back') : null;
      if (t) pauseAll(null);
    });
    gfInitReorder();
  }

  /* ---------- 功法卡片长按调序（v611） ----------
   * 长按卡片约 0.4s 激活拖动，上下拖动换位，松手保存顺序（localStorage
   * 键 wuri_gf_order_v1，仅本机，不进云同步）；点按打开详情不受影响：
   * 拖动过的那次点击在捕获阶段拦掉。长按出选框会断拖动（v606 同款教训），
   * 故子页卡片整行禁选（见 style.css #view-gongfa .hero2.mini）。 */
  var GF_KEYS = ['baduanjin', 'taiji', 'jingang', 'yijinjing', 'wuqinxi', 'liuzijue', 'shierduanjin', 'mawangdui', 'zhanzhuang', 'changshou'];
  var GF_ORDER_KEY = 'wuri_gf_order_v1';
  function gfCardEl(key) { return document.getElementById('gf-card-' + key); }
  function gfLoadOrder() {
    var order = GF_KEYS.slice();
    try {
      var raw = window.localStorage && localStorage.getItem(GF_ORDER_KEY);
      if (raw) {
        var saved = JSON.parse(raw);
        if (saved && saved.length) {
          var seen = {}, clean = [], i, k;
          for (i = 0; i < saved.length; i++) {
            k = saved[i];
            if (GF_KEYS.indexOf(k) >= 0 && !seen[k]) { seen[k] = 1; clean.push(k); }
          }
          for (i = 0; i < GF_KEYS.length; i++) {
            if (!seen[GF_KEYS[i]]) clean.push(GF_KEYS[i]);
          }
          order = clean;
        }
      }
    } catch (e) { /* 存坏了就回默认顺序 */ }
    return order;
  }
  function gfSaveOrder() {
    try {
      var hub = document.getElementById('view-gongfa');
      if (!hub || !window.localStorage) return;
      var order = [], cards = hub.querySelectorAll('.hero2.mini[id^="gf-card-"]'), i;
      for (i = 0; i < cards.length; i++) order.push(cards[i].id.replace('gf-card-', ''));
      localStorage.setItem(GF_ORDER_KEY, JSON.stringify(order));
    } catch (e) { /* 存不下也不影响打开 */ }
  }
  function gfApplyOrder() {
    var hub = document.getElementById('view-gongfa');
    if (!hub) return;
    var spacer = hub.querySelector('.tab-spacer');
    var order = gfLoadOrder(), i, el;
    for (i = 0; i < order.length; i++) {
      el = gfCardEl(order[i]);
      if (el) hub.insertBefore(el, spacer || null);
    }
  }
  function gfInitReorder() {
    var hub = document.getElementById('view-gongfa');
    if (!hub) return;
    gfApplyOrder();
    hub.addEventListener('contextmenu', function (e) {
      if (e.target && e.target.closest && e.target.closest('.hero2.mini[id^="gf-card-"]')) e.preventDefault();
    });
    var suppressClick = false;
    hub.addEventListener('click', function (e) {
      if (suppressClick) { e.preventDefault(); e.stopPropagation(); suppressClick = false; }
    }, true);
    var LONG_MS = 380, MOVE_PX = 12;
    var cards = hub.querySelectorAll('.hero2.mini[id^="gf-card-"]');
    for (var i = 0; i < cards.length; i++) {
      (function (card) {
        var timer = null, sx = 0, sy = 0, dragging = false;
        function cancel() { if (timer) { clearTimeout(timer); timer = null; } }
        card.addEventListener('pointerdown', function (e) {
          if (e.button !== undefined && e.button !== 0) return;
          sx = e.clientX; sy = e.clientY;
          cancel();
          timer = setTimeout(function () {
            timer = null; dragging = true;
            card.classList.add('gf-dragging');
            card.style.touchAction = 'none';
            try { if (navigator.vibrate) navigator.vibrate(15); } catch (err) {}
          }, LONG_MS);
        });
        /* 移动／松手必须挂在 window 上，不能挂卡片、不能靠 setPointerCapture：
         * 卡片一挪位就离开了手指／鼠标下方，命中测试收不到后续事件
         * （2026-11-11 真机实测：只收到 1 次 move 就断了）。 */
        window.addEventListener('pointermove', function (e) {
          if (timer && (Math.abs(e.clientX - sx) > MOVE_PX || Math.abs(e.clientY - sy) > MOVE_PX)) cancel();
          if (!dragging) return;
          var y = e.clientY;
          var sibs = hub.querySelectorAll('.hero2.mini[id^="gf-card-"]'), j, s, r;
          for (j = 0; j < sibs.length; j++) {
            s = sibs[j];
            if (s === card) continue;
            r = s.getBoundingClientRect();
            if (y < r.top + r.height / 2) { hub.insertBefore(card, s); return; }
          }
          hub.insertBefore(card, hub.querySelector('.tab-spacer') || null);
          if (e.cancelable) e.preventDefault();
        });
        function end() {
          cancel();
          if (dragging) {
            dragging = false;
            card.classList.remove('gf-dragging');
            card.style.touchAction = '';
            gfSaveOrder();
            suppressClick = true;
            setTimeout(function () { suppressClick = false; }, 350);
          }
        }
        window.addEventListener('pointerup', end);
        window.addEventListener('pointercancel', end);
        window.addEventListener('touchmove', function (e) { if (dragging && e.cancelable) e.preventDefault(); }, { passive: false });
      })(cards[i]);
    }
  }
  if (typeof window !== 'undefined') {
    window.__wuriGf = { keys: GF_KEYS, loadOrder: gfLoadOrder, saveOrder: gfSaveOrder, applyOrder: gfApplyOrder };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
