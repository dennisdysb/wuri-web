/* 戊日不上香 · Service Worker（离线缓存） */
const CACHE = 'wuri-v10-20251010-websync';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './css/meditation.css',
  './icon-192.png',
  './icon-512.png',
  './js/ai-analysis.js',
  './js/app.js',
  './js/bazi.js',
  './js/capacitor.js',
  './js/citydata.js',
  './js/i18n.js',
  './js/iztro.min.js',
  './js/jingwen.js',
  './js/liuyao.js',
  './js/ln-plugin.js',
  './js/lunar.min.js',
  './js/media-session.js',
  './js/meditation.js',
  './js/practice.js',
  './js/pro.js',
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
  './jing/s29.js'
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
