// Cache shell + library CDN supaya halaman bisa dibuka lagi tanpa internet (model dicache oleh transformers.js).
const C = "wav2srt-v2";
const SHELL = ["./", "index.html", "app.js", "srt.js", "wav.js", "worker.js"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(C).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  const same = u.origin === location.origin;
  if (!same && u.hostname !== "cdn.jsdelivr.net") return;
  e.respondWith((async () => {
    const c = await caches.open(C);
    const hit = await c.match(e.request);
    if (!same && hit) return hit;                 // CDN: cache-first
    try {                                          // situs sendiri: network-first, offline -> cache
      const r = await fetch(e.request);
      if (r.ok) c.put(e.request, r.clone());
      return r;
    } catch (err) { if (hit) return hit; throw err; }
  })());
});
