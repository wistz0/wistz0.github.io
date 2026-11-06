const CACHE = 'asset-tracker-v2';
const JSQR = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
const CORE = ['./', 'index.html', 'app.css', 'app.js', 'config.js', 'data.js', 'manifest.webmanifest', 'icon-icon-192.png', 'icon-icon-512.png'];
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(CORE);
    try { await c.add(new Request(JSQR, { mode: 'cors' })); } catch (_) {} // scanner fallback for iPhone, cached for offline
    self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x)))).then(() => self.clients.claim()));
});
// Same-origin: network first (so a re-deploy reaches everyone on next open), cache when offline.
// jsQR: cache first.
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (r.url === JSQR) { e.respondWith(caches.match(r).then(h => h || fetch(r))); return; }
  if (u.origin !== location.origin) return;
  e.respondWith(fetch(r).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(r, copy)); }
    return res;
  }).catch(() => caches.match(r).then(h => h || (r.mode === 'navigate' ? caches.match('index.html') : undefined))));
});
