import { parseWav } from "./wav.js";

// ffmpeg.wasm core (~32 MB) hanya diunduh bila format tidak bisa dibaca browser (mis. AMR).
export const FFMPEG_BASE = () => globalThis.FFMPEG_CORE_BASE || "https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd";

async function resample16k(buf) {
  const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(buf.duration * 16000)), 16000);
  const src = off.createBufferSource();
  src.buffer = buf; src.connect(off.destination); src.start();
  const r = await off.startRendering();
  return { audio: r.getChannelData(0), duration: buf.duration };
}

function viaFfmpeg(arr, ext) {
  return new Promise((resolve, reject) => {
    const w = new Worker("ffdecode.js");
    w.onmessage = (e) => {
      w.terminate();
      e.data.ok ? resolve({ audio: e.data.audio, duration: e.data.audio.length / 16000 }) : reject(new Error(e.data.error));
    };
    w.onerror = (e) => { w.terminate(); reject(new Error(e.message || "ffmpeg worker error")); };
    w.postMessage({ data: arr, ext, base: FFMPEG_BASE() }, [arr]);
  });
}

// onConvert dipanggil sebelum konversi ffmpeg (untuk menampilkan status).
export async function decodeFile(f, onConvert = () => {}) {
  const arr = await f.arrayBuffer();
  const ext = (f.name.split(".").pop() || "").toLowerCase();
  const w = parseWav(arr);
  if (w && w.samples.length) {                       // WAV: dibaca sendiri
    if (w.sampleRate === 16000) return { audio: w.samples, duration: w.samples.length / 16000 };
    const ab = new AudioBuffer({ length: w.samples.length, sampleRate: w.sampleRate, numberOfChannels: 1 });
    ab.copyToChannel(w.samples, 0);
    return resample16k(ab);
  }
  if (!["amr", "awb", "3ga", "3gp", "wma", "opus"].includes(ext)) {   // mp3/m4a/flac/ogg: decoder browser
    try {
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      const buf = await ac.decodeAudioData(arr.slice(0));
      ac.close();
      return await resample16k(buf);
    } catch (_) { /* lanjut ke ffmpeg */ }
  }
  onConvert();
  return viaFfmpeg(arr, ext);
}
