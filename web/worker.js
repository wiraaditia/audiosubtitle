import { pipeline, env } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3";

env.allowLocalModels = false;
const cache = {};
const post = (m) => self.postMessage(m);

async function getPipe(model, gpu) {
  const key = model + (gpu ? ":gpu" : ":wasm");
  if (cache[key]) return cache[key];
  const progress_callback = (p) => post({ type: "download", p });
  const id = "Xenova/whisper-" + model;
  if (gpu) {
    try {
      return (cache[key] = await pipeline("automatic-speech-recognition", id,
        { device: "webgpu", dtype: "fp32", progress_callback }));
    } catch (err) {
      post({ type: "status", key: "gpuFail" });
    }
  }
  const k2 = model + ":wasm";
  return (cache[k2] ||= await pipeline("automatic-speech-recognition", id,
    { device: "wasm", dtype: "q8", progress_callback }));
}

self.onmessage = async (e) => {
  const { audio, model, language, gpu, duration } = e.data;
  try {
    post({ type: "status", key: "loading" });
    const tr = await getPipe(model, gpu);
    post({ type: "status", key: "transcribing" });
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
    post({ type: "error", message: String(err && err.message ? err.message : err) });
  }
};
