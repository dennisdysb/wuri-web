/* 戊日不上香 · Service Worker（离线缓存） */
const CACHE = 'wuri-v106-20261024-v211-1';
/* 离线下载专用缓存（一键下载的音频/正文/图鉴）：版本更新时绝不清除，
 * 否则用户下好的几百 MB 音频会在每次发版后被 activate 误删（2026-10-21） */
const OFFLINE_CACHE = 'wuri-offline-v1';
const ASSETS = [
  './',
  './index.html',
  './redeem.html',
  './success.html',
  './manual-pay.html',
  './manifest.json',
  './img/logo.png',
  './img/logo-artwork.png',
  './img/logo-96.png',
  './img/qr-wechat.png',
  './img/qr-alipay.jpg',
  './css/style.css?v=98',
  './css/qimen.css?v=78',
  './css/meditation.css?v=65',
  './icon-192.png',
  './icon-512.png',
  './js/ai-analysis.js',
  './js/app.js',
  './js/bazi.js',
  './js/capacitor.js',
  './js/citydata.js',
  './js/deities-data.js',
  './js/deities.js',
  './js/today-sky.js',
  './js/stars.js',
  './js/vendor/astronomy.js',
  './js/vendor/d3-array.min.js',
  './js/vendor/d3-geo.min.js',
  './js/sky-engine.js',
  './js/sky-chart.js',
  './js/sky-ar.js',
  './js/i18n.js',
  './js/iztro.min.js',
  './js/jingwen.js',
  './js/offline-download.js',
  './js/liuyao.js',
  './js/ln-plugin.js',
  './js/lunar.min.js',
  './js/media-session.js',
  './js/meditation.js',
  './js/practice.js',
  './js/pro.js',
  './js/qimen-engine.js',
  './js/qimen-geju.js',
  './js/qimen-data.js',
  './js/qimen-cases.js',
  './js/qimen-cal.js',
  './js/qimen-render3d.js',
  './js/qimen-app.js',
  './js/t2s.js',
  './js/t2s_map.json',
  './js/yearview.js',
  './js/zhishen-data.js',
  './js/ziwei.js',
  './jing/index.js',
  './jing/s01.js',
  './jing/s02.js',
  './jing/s03.js',
  './jing/s04.js',
  './jing/s05.js',
  './jing/s07.js',
  './jing/s09.js',
  './jing/s10.js',
  './jing/s11.js',
  './jing/s12.js',
  './jing/s13.js',
  './jing/s14.js',
  './jing/s15.js',
  './jing/s16.js',
  './jing/s17.js',
  './jing/s18.js',
  './jing/s19.js',
  './jing/s20.js',
  './jing/s21.js',
  './jing/s23.js',
  './jing/s26.js',
  './jing/s27.js',
  './jing/s28.js',
  './jing/s29.js',
  './jing/s30.js',
  './jing/s31.js',
  './jing/s32.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE && k !== OFFLINE_CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  var url = new URL(e.request.url);
  var isHtml = url.pathname.endsWith('.html') || url.pathname.endsWith('/');
  var isCss = url.pathname.endsWith('.css');
  var isJs = url.pathname.endsWith('.js');
  // 经文正文数据文件（content/jing/*.js 与包内 jing/*.js）：仅当离线缓存命中时由 SW 出，
  // 未命中不拦截、照旧直连网络（保持「JS 不缓存」的既有口径，2026-10-21 离线下载）
  var isJingText = /\/(content\/jing|jing)\/s\d+\.js$/.test(url.pathname);
  if (isJingText && e.request.method === 'GET') {
    e.respondWith(
      caches.open(OFFLINE_CACHE).then(function (c) { return c.match(e.request); })
        .then(function (hit) { return hit || fetch(e.request); })
        .catch(function () { return new Response('', { status: 504, statusText: 'offline' }); })
    );
    return;
  }
  // JS 文件：完全不拦截，让浏览器直接请求（SW 缓存 JS 出问题，2026-10-11）
  if (isJs) return;
  // 远程内容数据源（content/*.json）与星官数据（data/*.json）：网络优先＋no-store，保证内容更新即时生效；
  // 网络失败才回落缓存里的上一版 JSON，绝不回落 index.html（2026-10-19 内容通道上线）
  // data/*.json 原走文末通用 cache-first，用户端会滞留旧数据，2026-10-23 并入本分支（同 feed 规范）
  var isFeedJson = (url.pathname.indexOf('/content/') !== -1 || url.pathname.indexOf('/data/') !== -1) && url.pathname.endsWith('.json');
  if (isFeedJson && e.request.method === 'GET') {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' }).then(function (res) {
        if (res.ok && url.origin === location.origin) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        }
        return res;
      }).catch(function () {
        return caches.match(e.request).then(function (hit) {
          return hit || new Response('{"error":"feed unavailable"}', { status: 504, headers: { 'Content-Type': 'application/json' } });
        });
      })
    );
    return;
  }
  // HTML 与 CSS 用网络优先＋强制校验（no-cache）：CSS 若走 cache-first，更新后首次打开
  // 会被旧 SW 从旧缓存发出旧样式，与新 HTML/JS 混杂（2026-10-18 图鉴布局事故）；
  // 网络优先保证 HTML 与 CSS 同批更新，失败才回落缓存（离线可用）。
  if ((isHtml || isCss) && e.request.method === 'GET') {
    e.respondWith(
      fetch(e.request, { cache: 'no-cache' }).then(function (res) {
        if (res.ok && url.origin === location.origin) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        }
        return res;
      }).catch(function () { return caches.match(e.request); })
    );
    return;
  }
  // 经文诵读音频：离线缓存命中则本地出（Range 请求按缓存切片回 206，拖动/跟读定位可用）；
  // 未命中照常直连网络流播且不落缓存（与现行口径一致，2026-10-21 离线下载）
  var isJingAudio = /\/audio\/jing\/s\d+_(female|male)\.mp3$/.test(url.pathname);
  if (isJingAudio && (e.request.method === 'GET' || e.request.method === 'HEAD')) {
    e.respondWith(
      caches.open(OFFLINE_CACHE).then(function (c) { return c.match(e.request.url); })
        .then(function (hit) {
          if (!hit) return fetch(e.request);
          if (e.request.method === 'HEAD') {
            return new Response(null, { status: 200, headers: {
              'Content-Type': 'audio/mpeg', 'Accept-Ranges': 'bytes',
              'Content-Length': hit.headers.get('content-length') || '0' } });
          }
          var range = e.request.headers.get('range');
          if (!range) return hit;
          return hit.blob().then(function (blob) {
            var m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
            if (!m) return new Response(blob, { headers: { 'Content-Type': 'audio/mpeg' } });
            var total = blob.size, start, end;
            if (m[1] === '') {
              var n = parseInt(m[2], 10) || 0;
              start = Math.max(0, total - n); end = total - 1;
            } else {
              start = parseInt(m[1], 10);
              end = m[2] === '' ? total - 1 : Math.min(parseInt(m[2], 10), total - 1);
            }
            if (start > end || start >= total) {
              return new Response('', { status: 416, headers: { 'Content-Range': 'bytes */' + total } });
            }
            var part = blob.slice(start, end + 1);
            return new Response(part, { status: 206, headers: {
              'Content-Type': 'audio/mpeg', 'Content-Length': String(part.size),
              'Content-Range': 'bytes ' + start + '-' + end + '/' + total,
              'Accept-Ranges': 'bytes' } });
          });
        })
        .catch(function () { return new Response('', { status: 504, statusText: 'offline' }); })
    );
    return;
  }
  // 分段请求（音频 Range 拖动/续播）不拦截，交给浏览器直连：
  // 以前把 206 半截音频当完整响应缓存下来，会让环境音永远播不出（2026-10-19 冥想无声修）
  if (e.request.headers.get('range')) return;
  // 神祇图鉴全图（v2.0.0 (2) 外置）：不入预缓存；已下载集（离线豁免缓存）优先，
  // 其次运行时缓存，看过即留；都未命中才联网取并存运行时缓存。缩略图走下方通用分支。
  var isDeityFull = /\/img\/deities\/[^/]+\.webp$/.test(url.pathname);
  if (isDeityFull && e.request.method === 'GET') {
    e.respondWith(
      caches.open(OFFLINE_CACHE).then(function (c) { return c.match(e.request); })
        .then(function (hit) {
          if (hit) return hit;
          return caches.open(CACHE).then(function (c2) { return c2.match(e.request); });
        })
        .then(function (hit) {
          if (hit) return hit;
          return fetch(e.request).then(function (res) {
            if (res.ok && url.origin === location.origin) {
              var copy = res.clone();
              caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
            }
            return res;
          });
        })
        .catch(function () { return new Response('', { status: 504, statusText: 'offline' }); })
    );
    return;
  }
  var isAudio = /\.(mp3|m4a|aac|wav|ogg)$/i.test(url.pathname);
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      // 只缓存同源 GET 的完整 200 响应；音频不进运行时缓存（体积大且怕截断污染）
      if (e.request.method === 'GET' && res.status === 200 && !isAudio && new URL(e.request.url).origin === location.origin) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return res;
    }).catch(() => {
      // 失败兜底只给页面导航回首页；图片/音频等资源失败就如实失败，
      // 避免把 HTML 当图片发出去、显示成破图（2026-10-19 冥想背景破图修）
      if (e.request.mode === 'navigate') return caches.match('./index.html');
      return new Response('', { status: 504, statusText: 'offline' });
    }))
  );
});
