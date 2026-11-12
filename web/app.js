import { chunksToCues, cuesToSrt } from "./srt.js";
import { parseWav } from "./wav.js";

const T = {
  id: {
    title: "WAV → SRT", ui: "Tampilan",
    sub: "Ubah audio jadi subtitle .srt langsung di browser. Audio tidak diunggah ke server mana pun.",
    drop: "Klik atau seret file audio ke sini (WAV, MP3, M4A, FLAC)", lang: "Bahasa audio", auto: "Otomatis",
    model: "Model", chars: "Maks karakter/baris", gpu: "Pakai WebGPU (eksperimental, lebih cepat jika didukung)",
    start: "Mulai", cancel: "Batal", result: "Hasil SRT", download: "Unduh .srt", copy: "Salin",
    note: "Model diunduh sekali saat pertama dipakai lalu disimpan di browser; setelah itu bisa dipakai tanpa internet. Proses berjalan di perangkatmu, jadi audio panjang bisa memakan waktu dan memori.",
    s_decode: "Membaca audio…", s_loading: "Memuat model…", s_dl: "Mengunduh model", s_tr: "Transkripsi…",
    s_done: "Selesai.", s_gpuFail: "WebGPU gagal, memakai CPU (WASM)…", s_copied: "Tersalin.",
    s_err: "Gagal: ", s_cancel: "Dibatalkan.", s_big: "File besar; bisa lambat atau kehabisan memori.",
  },
  en: {
    title: "WAV → SRT", ui: "Interface",
    sub: "Turn audio into .srt subtitles right in your browser. Your audio is never uploaded to any server.",
    drop: "Click or drop an audio file here (WAV, MP3, M4A, FLAC)", lang: "Audio language", auto: "Auto-detect",
    model: "Model", chars: "Max chars/line", gpu: "Use WebGPU (experimental, faster if supported)",
    start: "Start", cancel: "Cancel", result: "SRT result", download: "Download .srt", copy: "Copy",
    note: "The model downloads once on first use and is stored in your browser; afterwards it works without internet. Processing runs on your device, so long audio may take time and memory.",
    s_decode: "Reading audio…", s_loading: "Loading model…", s_dl: "Downloading model", s_tr: "Transcribing…",
    s_done: "Done.", s_gpuFail: "WebGPU failed, using CPU (WASM)…", s_copied: "Copied.",
    s_err: "Failed: ", s_cancel: "Cancelled.", s_big: "Large file; may be slow or run out of memory.",
  },
};

const $ = (id) => document.getElementById(id);
let ui = localStorage.getItem("ui") || ((navigator.language || "id").slice(0, 2) === "en" ? "en" : "id");
let file = null, worker = null, fileName = "audio", duration = 0, statusKey = null, lastStatus = "";

const t = (k) => T[ui][k];
function applyUi() {
  document.documentElement.lang = ui;
  document.querySelectorAll("[data-i]").forEach((el) => (el.textContent = t(el.dataset.i)));
  $("ui").value = ui;
  $("fname").textContent = file ? file.name : "";
  if (statusKey) setStatus(statusKey.key, statusKey.cls, statusKey.extra);
}
function setStatus(key, cls = "", extra = "") {
  statusKey = { key, cls, extra };
  const el = $("status");
  el.className = cls;
  el.textContent = t("s_" + key) + extra;
}
function setBar(v) { $("bar").style.width = Math.round(v * 100) + "%"; }
$("ui").onchange = (e) => { ui = e.target.value; localStorage.setItem("ui", ui); applyUi(); };

if (!("gpu" in navigator)) $("gpuRow").classList.add("hidden");

// ---- file pick
const drop = $("drop");
drop.onclick = () => $("file").click();
drop.onkeydown = (e) => (e.key === "Enter" || e.key === " ") && $("file").click();
drop.ondragover = (e) => { e.preventDefault(); drop.classList.add("over"); };
drop.ondragleave = () => drop.classList.remove("over");
drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove("over"); pick(e.dataTransfer.files[0]); };
$("file").onchange = (e) => pick(e.target.files[0]);
function pick(f) {
  if (!f) return;
  file = f;
  fileName = f.name.replace(/\.[^.]+$/, "");
  $("fname").textContent = f.name;
  $("go").disabled = false;
  if (f.size > 200 * 1024 * 1024) setStatus("big");
}

// ---- audio -> Float32 mono 16 kHz
async function resample16k(buf) {
  const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(buf.duration * 16000)), 16000);
  const src = off.createBufferSource();
  src.buffer = buf; src.connect(off.destination); src.start();
  const r = await off.startRendering();
  return { audio: r.getChannelData(0), duration: buf.duration };
}
async function decode(f) {
  const arr = await f.arrayBuffer();
  const w = parseWav(arr);
  if (w && w.samples.length) {           // WAV: dibaca sendiri (lebih andal dari decodeAudioData)
    if (w.sampleRate === 16000) return { audio: w.samples, duration: w.samples.length / 16000 };
    const ab = new AudioBuffer({ length: w.samples.length, sampleRate: w.sampleRate, numberOfChannels: 1 });
    ab.copyToChannel(w.samples, 0);
    return resample16k(ab);
  }
  const ac = new (window.AudioContext || window.webkitAudioContext)();   // mp3/m4a/flac/dll
  const buf = await ac.decodeAudioData(arr);
  ac.close();
  return resample16k(buf);
}

// ---- worker
function newWorker() {
  if (worker) worker.terminate();
  worker = new Worker("worker.js", { type: "module" });
  const files = {};
  worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === "status") setStatus(m.key);
    else if (m.type === "download") {
      const p = m.p;
      if (p.status === "progress" && p.total) {
        files[p.file] = { l: p.loaded, t: p.total };
        let l = 0, tt = 0;
        for (const k in files) { l += files[k].l; tt += files[k].t; }
        setBar(l / tt);
        setStatus("dl", "", ` ${Math.round((l / tt) * 100)}% (${(l / 1048576).toFixed(0)}/${(tt / 1048576).toFixed(0)} MB)`);
      }
    } else if (m.type === "progress") { setBar(m.v); setStatus("tr", "", ` ${Math.round(m.v * 100)}%`); }
    else if (m.type === "result") finish(m.chunks);
    else if (m.type === "error") fail(m.message);
  };
  worker.onerror = (e) => fail(e.message || "worker error");
}

function busy(b) {
  $("go").disabled = b || !file;
  $("stop").classList.toggle("hidden", !b);
}
function fail(msg) { busy(false); setStatus("err", "err", msg); }

function finish(chunks) {
  const cues = chunksToCues(chunks, duration, Math.max(20, +$("chars").value || 42));
  $("srt").value = cuesToSrt(cues);
  $("out").classList.remove("hidden");
  setBar(1); busy(false); setStatus("done", "ok");
}

$("go").onclick = async () => {
  if (!file) return;
  busy(true); setBar(0); $("out").classList.add("hidden");
  try {
    setStatus("decode");
    const d = await decode(file);
    duration = d.duration;
    newWorker();
    worker.postMessage({
      audio: d.audio, duration: d.duration, model: $("model").value,
      language: $("lang").value || null, gpu: $("gpu").checked && !$("gpuRow").classList.contains("hidden"),
    }, [d.audio.buffer]);
  } catch (err) { fail(err.message || String(err)); }
};
$("stop").onclick = () => { if (worker) worker.terminate(); worker = null; busy(false); setBar(0); setStatus("cancel"); };

$("dl").onclick = () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([$("srt").value], { type: "application/x-subrip;charset=utf-8" }));
  a.download = fileName + ".srt";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
$("copy").onclick = async () => { await navigator.clipboard.writeText($("srt").value); setStatus("copied", "ok"); };

applyUi();
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
