const CACHE = 'deriva-v1';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET') return;
  const mine = u.origin === location.origin || u.hostname === 'cdnjs.cloudflare.com';
  if (!mine) return; // meteo e tessere mappa: sempre dalla rete
  if (r.mode === 'navigate') { // pagina: prima la rete, poi la copia salvata
    e.respondWith(fetch(r).then(res => { caches.open(CACHE).then(c => c.put(r, res.clone())); return res; })
      .catch(() => caches.match('./index.html')));
    return;
  }
  e.respondWith(caches.match(r).then(hit => hit || fetch(r).then(res => { caches.open(CACHE).then(c => c.put(r, res.clone())); return res; })));
});
