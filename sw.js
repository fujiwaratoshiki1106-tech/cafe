const CACHE = 'cafememo-v1';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './db.js',
  './manifest.webmanifest',
  './icons/icon.svg'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // SPA: navigation は index.html を返す
  if (req.mode === 'navigate') {
    e.respondWith(
      caches.match('./index.html').then(r => r || fetch(req).catch(()=>caches.match('./index.html')))
    );
    return;
  }

  // 同一オリジンの静的はキャッシュ優先
  if (url.origin === location.origin) {
    e.respondWith(
      caches.match(req).then(r => r || fetch(req).then(res => {
        // ランタイムキャッシュ
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(req, clone)).catch(()=>{});
        return res;
      }).catch(()=> r))
    );
  }
});
