import { pipeline, env } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3";

env.allowLocalModels = false;
const cache = {};
const post = (m) => self.postMessage(m);

function getPipe(model) {
  return (cache[model] ||= pipeline("automatic-speech-recognition", "Xenova/whisper-" + model, {
    device: "wasm", dtype: "q8", progress_callback: (p) => post({ type: "download", p }),
  }));
}

self.onmessage = async (e) => {
  const { audio, model, language, duration } = e.data;
  try {
    post({ type: "status", key: "loading" });
    const tr = await getPipe(model);
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
    delete cache[model];
    post({ type: "error", message: String(err && err.message ? err.message : err) });
  }
};
