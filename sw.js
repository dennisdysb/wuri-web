/* 戊日不上香 · Service Worker（离线缓存） */
const CACHE = 'wuri-v3-20251006-responsive';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/app.js',
  './js/jingwen.js',
  './js/lunar.min.js',
  './js/i18n.js',
  './js/practice.js',
  './js/bazi.js',
  './js/liuyao.js',
  './js/yearview.js',
  './js/pro.js',
  './jing/index.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      // 只缓存同源 GET 成功响应
      if (e.request.method === 'GET' && res.ok && new URL(e.request.url).origin === location.origin) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
