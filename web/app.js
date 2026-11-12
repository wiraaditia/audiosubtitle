import { chunksToCues, cuesToSrt } from "./srt.js";
import { decodeFile } from "./audio.js";

const T = {
  id: {
    title: "WAV → SRT", ui: "Tampilan",
    sub: "Ubah audio jadi subtitle .srt langsung di browser. Audio tidak diunggah ke server mana pun.",
    drop: "Klik atau seret file audio ke sini (WAV, MP3, M4A, AMR, FLAC)", lang: "Bahasa audio", auto: "Otomatis", chars: "Maks karakter/baris",
    start: "Mulai", cancel: "Batal", result: "Hasil SRT", download: "Unduh .srt", copy: "Salin",
    note: "Model (~250 MB) diunduh sekali saat pertama dipakai lalu disimpan di browser; setelah itu bisa dipakai tanpa internet. Proses berjalan di perangkatmu, jadi audio panjang bisa memakan waktu dan memori.",
    s_decode: "Membaca audio…", s_conv: "Mengonversi format audio (unduh ~30 MB, sekali saja)…", s_loading: "Memuat model…", s_dl: "Mengunduh model", s_tr: "Transkripsi…",
    s_done: "Selesai.", s_copied: "Tersalin.",
    s_err: "Gagal: ", s_cancel: "Dibatalkan.", s_big: "File besar; bisa lambat atau kehabisan memori.",
  },
  en: {
    title: "WAV → SRT", ui: "Interface",
    sub: "Turn audio into .srt subtitles right in your browser. Your audio is never uploaded to any server.",
    drop: "Click or drop an audio file here (WAV, MP3, M4A, AMR, FLAC)", lang: "Audio language", auto: "Auto-detect", chars: "Max chars/line",
    start: "Start", cancel: "Cancel", result: "SRT result", download: "Download .srt", copy: "Copy",
    note: "The model (~250 MB) downloads once on first use and is stored in your browser; afterwards it works without internet. Processing runs on your device, so long audio may take time and memory.",
    s_decode: "Reading audio…", s_conv: "Converting audio format (one-time ~30 MB download)…", s_loading: "Loading model…", s_dl: "Downloading model", s_tr: "Transcribing…",
    s_done: "Done.", s_copied: "Copied.",
    s_err: "Failed: ", s_cancel: "Cancelled.", s_big: "Large file; may be slow or run out of memory.",
  },
};

const MODEL = "small"; // model standar (~250 MB, sekali unduh)
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
  worker.onerror = (e) => fail("Gagal memuat library dari cdn.jsdelivr.net (" + (e.message || "worker error") + ")");
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
    const d = await decodeFile(file, () => setStatus("conv"));
    duration = d.duration;
    newWorker();
    worker.postMessage({
      audio: d.audio, duration: d.duration, model: MODEL,
      language: $("lang").value || null,
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
