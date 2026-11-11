// sw.js — rete per prima, cache solo se offline.
// Mettilo nella stessa cartella di index.html sul repository GitHub Pages.
const CACHE = "deriva-cache";

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      Promise.all(
        ["./", "./index.html", "./manifest.json", "./calcolo.js"].map((u) =>
          c.add(u).catch(() => {})
        )
      )
    )
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  // solo file della web app: meteo e tiles della mappa passano direttamente
  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  e.respondWith(
    fetch(req, { cache: "no-cache" }) // ignora la cache HTTP di GitHub Pages
      .then((res) => {
        if (res.ok) {
          const copia = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copia));
        }
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match("./index.html")))
  );
});
