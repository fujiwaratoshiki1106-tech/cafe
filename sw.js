<!-- --- file: sw.js --- -->
<script>
// すごくシンプルなSW（静的アセットはキャッシュ優先、その他はネット優先→失敗時キャッシュ）
const CACHE = 'cafememo-v1';
const ASSETS = [
  './', './index.html', './styles.css', './app.js', './db.js', './manifest.webmanifest', './icons/icon.svg'
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // 同一オリジンの静的ファイルはキャッシュ優先
  const isAsset = url.origin === location.origin && ASSETS.some(a => url.pathname.endsWith(a.replace('./','/')));
  if (isAsset) {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
    return;
  }
  // それ以外はネット優先 → 失敗時キャッシュ
  e.respondWith(
    fetch(e.request).then((res) => {
      const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request))
  );
});
</script>
