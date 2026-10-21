/* Verkstan: network first, cache as fallback so the workshops also open without internet */
const CACHE = 'verkstan-v2';
const CORE = ['./', 'index.html', 'skinverkstaden.html', 'foremalsverkstaden.html', 'mobverkstaden.html', 'berattare.html', 'lib/three.min.js', 'manifest.webmanifest', 'icons/icon-192.png'];
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).catch(() => {})); });
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET') return;
  const u = new URL(r.url);
  const fonts = /(^|\.)fonts\.(googleapis|gstatic)\.com$/.test(u.hostname);
  if (u.origin !== location.origin && !fonts) return;
  e.respondWith(fetch(r).then(res => {
    if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(r, copy)); }
    return res;
  }).catch(() => caches.match(r, { ignoreSearch:true }).then(m => m || (r.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
});
