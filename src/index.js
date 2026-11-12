// Worker Cloudflare: sajikan situs statis (web/) + proxy terbatas untuk model Whisper dan konverter ffmpeg.
// Proxy hanya untuk path yang di-whitelist (bukan open proxy).
const HF = /^\/hf\/Xenova\/whisper-(tiny|base|small)\/resolve\/main\/[\w.\-\/]+$/;
const UNPKG = /^\/unpkg\/@ffmpeg\/core@0\.12\.10\/dist\/umd\/ffmpeg-core\.(js|wasm)$/;

async function proxy(request, target) {
  const headers = new Headers();
  for (const h of ["range", "if-none-match", "if-modified-since"]) {
    const v = request.headers.get(h);
    if (v) headers.set(h, v);
  }
  const up = await fetch(target, { method: request.method, headers, redirect: "follow" });
  const out = new Headers(up.headers);
  out.set("Access-Control-Allow-Origin", "*");
  out.set("Cache-Control", "public, max-age=86400");
  out.delete("set-cookie");
  return new Response(up.body, { status: up.status, headers: out });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;
    if ((HF.test(p) || UNPKG.test(p)) && (request.method === "GET" || request.method === "HEAD")) {
      try {
        if (HF.test(p)) return await proxy(request, "https://huggingface.co" + p.slice(3) + url.search);
        return await proxy(request, "https://unpkg.com" + p.slice(6));
      } catch (e) {
        return new Response("upstream error: " + e.message, { status: 502 });
      }
    }
    return env.ASSETS.fetch(request);
  },
};
