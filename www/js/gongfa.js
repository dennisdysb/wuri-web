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
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
