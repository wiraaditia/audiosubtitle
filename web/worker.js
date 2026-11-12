import { pipeline, env } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3";

env.allowLocalModels = false;
const cache = {};
const post = (m) => self.postMessage(m);

async function probe() {
  const targets = {
    "hf-config": "https://huggingface.co/Xenova/whisper-small/resolve/main/config.json",
    "hf-model-besar": "https://huggingface.co/Xenova/whisper-small/resolve/main/onnx/encoder_model_quantized.onnx",
    "jsdelivr": "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3/package.json",
  };
  const res = await Promise.all(Object.entries(targets).map(async ([k, u]) => {
    try {
      const c = new AbortController(); const t = setTimeout(() => c.abort(), 8000);
      const r = await fetch(u, { signal: c.signal, headers: k === "hf-model-besar" ? { Range: "bytes=0-1023" } : {} }); clearTimeout(t);
      return k + ": " + (r.ok || r.status === 206 ? "OK" : "HTTP " + r.status);
    } catch (e) { return k + ": GAGAL"; }
  }));
  return res.join(", ");
}

let lastFile = "-";
async function getPipe(model) {
  // 1) lewat server situs sendiri (/hf/ -> huggingface.co), 2) langsung ke huggingface.co
  const hosts = [self.location.origin + "/hf/", "https://huggingface.co/"];
  let lastErr;
  for (const h of hosts) {
    env.remoteHost = h;
    try { return await build(model); } catch (e) { lastErr = e; delete cache[model]; }
  }
  throw lastErr;
}
function build(model) {
  return (cache[model] ||= pipeline("automatic-speech-recognition", "Xenova/whisper-" + model, {
    device: "wasm", dtype: "q8", progress_callback: (p) => { if (p.file) lastFile = p.file; post({ type: "download", p }); },
  }));
}

self.onmessage = async (e) => {
  const { audio, model, language, duration } = e.data;
  try {
    post({ type: "status", key: "loading" });
    let tr;
    try { tr = await getPipe(model); }
    catch (err) { throw new Error("Gagal mengunduh model (" + (err && err.message ? err.message : err) + "). File terakhir: " + lastFile + ". Cek koneksi → " + await probe()); }
    post({ type: "status", key: "tr" });
    const total = Math.max(1, Math.ceil(duration / 20));
    let done = 0;
    const opts = {
      chunk_length_s: 30, stride_length_s: 5, return_timestamps: true, task: "transcribe",
      chunk_callback: () => { done++; post({ type: "progress", v: Math.min(done / total, 0.99) }); },
    };
    if (language) opts.language = language;
    const out = await tr(audio, opts);
    post({ type: "result", chunks: out.chunks || [{ text: out.text, timestamp: [0, duration] }] });
  } catch (err) {
    delete cache[model];
    post({ type: "error", message: String(err && err.message ? err.message : err) });
  }
};
