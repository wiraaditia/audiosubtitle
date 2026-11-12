// Cache shell + library CDN supaya halaman bisa dibuka lagi tanpa internet (model dicache oleh transformers.js).
const C = "wav2srt-v1";
const SHELL = ["./", "index.html", "app.js", "srt.js", "worker.js"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(C).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (u.origin !== location.origin && u.hostname !== "cdn.jsdelivr.net") return;
  e.respondWith((async () => {
    const c = await caches.open(C);
    const hit = await c.match(e.request);
    const net = fetch(e.request).then((r) => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  })());
});
