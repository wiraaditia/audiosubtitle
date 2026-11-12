#!/usr/bin/env python3
"""
WAV -> SRT offline (Whisper via faster-whisper).

GUI  : python wav2srt.py
CLI  : python wav2srt.py audio.wav [-m small] [-l id] [-o out.srt]
Model: python wav2srt.py --download small     (sekali saja, butuh internet)
Setelah model terunduh, semuanya berjalan 100% offline.
"""
import argparse
import os
import queue
import sys
import threading
from pathlib import Path

APP_DIR = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))
MODELS_DIR = Path(sys.argv[0]).resolve().parent / "models" if getattr(sys, "frozen", False) \
    else Path(__file__).resolve().parent / "models"
MODEL_SIZES = ["tiny", "base", "small", "medium", "large-v3"]
LANGUAGES = {
    "Otomatis": None, "Indonesia": "id", "English": "en", "Melayu": "ms",
    "Jawa": "jw", "Sunda": "su", "日本語": "ja", "中文": "zh", "한국어": "ko",
    "Español": "es", "Français": "fr", "Deutsch": "de", "العربية": "ar",
}


# ---------------------------------------------------------------- SRT utils
def fmt_time(t: float) -> str:
    ms = int(round(max(t, 0) * 1000))
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02}:{m:02}:{s:02},{ms:03}"


def wrap_two_lines(text: str, max_chars: int) -> str:
    """Pecah teks jadi maksimal 2 baris seimbang."""
    text = text.strip()
    if len(text) <= max_chars:
        return text
    words = text.split()
    best, best_diff = text, 10**9
    for i in range(1, len(words)):
        a, b = " ".join(words[:i]), " ".join(words[i:])
        diff = abs(len(a) - len(b))
        if diff < best_diff:
            best, best_diff = a + "\n" + b, diff
    return best


def words_to_cues(words, max_chars=42, max_dur=6.0, max_gap=0.8):
    """words: list of (start, end, text). Gabung jadi cue subtitle (maks 2 baris)."""
    limit = max_chars * 2
    cues, cur = [], []

    def flush():
        if cur:
            text = "".join(w[2] for w in cur).strip()
            if text:
                cues.append((cur[0][0], cur[-1][1], wrap_two_lines(text, max_chars)))
            cur.clear()

    for w in words:
        if cur:
            text_len = len("".join(x[2] for x in cur).strip()) + len(w[2])
            too_long = text_len > limit
            too_slow = w[1] - cur[0][0] > max_dur
            gap = w[0] - cur[-1][1] > max_gap
            if too_long or too_slow or gap:
                flush()
        cur.append(w)
        if w[2].strip().endswith((".", "?", "!", "。")) and len(cur) > 2:
            flush()
    flush()

    # cegah tumpang tindih
    for i in range(len(cues) - 1):
        s, e, t = cues[i]
        if e > cues[i + 1][0]:
            cues[i] = (s, cues[i + 1][0], t)
    return cues


def cues_to_srt(cues) -> str:
    out = []
    for i, (s, e, t) in enumerate(cues, 1):
        out.append(f"{i}\n{fmt_time(s)} --> {fmt_time(e)}\n{t}\n")
    return "\n".join(out)


# ---------------------------------------------------------------- model
def resolve_model(name: str):
    """Kembalikan (path_atau_nama, local_only). Cari di ./models/<name> dulu."""
    p = Path(name)
    if p.is_dir():
        return str(p), True
    local = MODELS_DIR / name
    if local.is_dir() and any(local.iterdir()):
        return str(local), True
    return name, False


def download_model(name: str, log=print):
    from faster_whisper.utils import download_model as dl
    out = MODELS_DIR / name
    out.mkdir(parents=True, exist_ok=True)
    log(f"Mengunduh model '{name}' ke {out} ...")
    dl(name, output_dir=str(out))
    log("Selesai. Mulai sekarang bisa dipakai offline.")


def load_audio(path):
    """WAV dibaca langsung (tanpa PyAV) -> float32 mono 16 kHz. Format lain: kembalikan path."""
    if not str(path).lower().endswith(".wav"):
        return path
    try:
        import wave
        import numpy as np
        with wave.open(str(path), "rb") as w:
            ch, sw, sr = w.getnchannels(), w.getsampwidth(), w.getframerate()
            raw = w.readframes(w.getnframes())
        if sw == 1:
            x = (np.frombuffer(raw, np.uint8).astype(np.float32) - 128) / 128
        elif sw == 2:
            x = np.frombuffer(raw, "<i2").astype(np.float32) / 32768
        elif sw == 3:
            b = np.frombuffer(raw, np.uint8).reshape(-1, 3).astype(np.int32)
            v = b[:, 0] | (b[:, 1] << 8) | (b[:, 2] << 16)
            v = np.where(v >= 1 << 23, v - (1 << 24), v)
            x = v.astype(np.float32) / 8388608
        elif sw == 4:
            x = np.frombuffer(raw, "<i4").astype(np.float32) / 2147483648
        else:
            return path
        if ch > 1:
            x = x[: len(x) // ch * ch].reshape(-1, ch).mean(axis=1)
        if sr != 16000:
            k = int(round(sr / 16000))
            if k > 1:  # lowpass kasar (moving average) sebelum downsample
                c = np.cumsum(np.insert(x, 0, 0.0), dtype=np.float64)
                x = ((c[k:] - c[:-k]) / k).astype(np.float32)
            m = int(len(x) * 16000 / sr)
            x = np.interp(np.linspace(0, len(x) - 1, m), np.arange(len(x)), x)
        return np.ascontiguousarray(x, dtype=np.float32)
    except Exception:  # noqa: BLE001
        return path


def transcribe(audio, model_name="small", language=None, max_chars=42,
               max_dur=6.0, progress=None, log=print, cancel=None):
    from faster_whisper import WhisperModel

    path, local_only = resolve_model(model_name)
    if not local_only:
        raise RuntimeError(
            f"Model '{model_name}' belum ada di {MODELS_DIR}.\n"
            f"Jalankan sekali (online): python wav2srt.py --download {model_name}")
    log(f"Memuat model: {path} [CPU int8, build 3]")
    model = WhisperModel(path, device="cpu", compute_type="int8", local_files_only=True)

    log("Transkripsi dimulai ...")
    segments, info = model.transcribe(
        load_audio(audio), language=language, word_timestamps=True,
        vad_filter=True, beam_size=5)
    log(f"Bahasa: {info.language} (p={info.language_probability:.2f}), "
        f"durasi {info.duration:.1f}s")

    words = []
    for seg in segments:
        if cancel and cancel():
            raise RuntimeError("Dibatalkan.")
        if seg.words:
            words += [(w.start, w.end, w.word) for w in seg.words]
        else:
            words.append((seg.start, seg.end, " " + seg.text.strip()))
        if progress and info.duration:
            progress(min(seg.end / info.duration, 1.0))
    if progress:
        progress(1.0)
    return cues_to_srt(words_to_cues(words, max_chars, max_dur))


# ---------------------------------------------------------------- GUI
TXT = {
    "id": {
        "title": "WAV → SRT (Offline)", "file": "File audio:", "pick": "Pilih…",
        "out": "Simpan SRT ke:", "change": "Ubah…", "model": "Model:",
        "lang": "Bahasa audio:", "chars": "Maks karakter/baris:", "start": "Mulai",
        "cancel": "Batal", "dl": "Unduh model (online, sekali)", "ui": "Tampilan:",
        "warn": "Pilih file audio dulu.", "auto": "Otomatis", "saved": "✔ Tersimpan: ",
    },
    "en": {
        "title": "WAV → SRT (Offline)", "file": "Audio file:", "pick": "Browse…",
        "out": "Save SRT to:", "change": "Change…", "model": "Model:",
        "lang": "Audio language:", "chars": "Max chars/line:", "start": "Start",
        "cancel": "Cancel", "dl": "Download model (online, once)", "ui": "Interface:",
        "warn": "Please choose an audio file first.", "auto": "Auto-detect", "saved": "✔ Saved: ",
    },
}
UI_LANGS = {"Bahasa Indonesia": "id", "English": "en"}


def run_gui():
    import tkinter as tk
    from tkinter import filedialog, messagebox, ttk

    root = tk.Tk()
    root.geometry("660x540")
    q = queue.Queue()
    state = {"cancel": False, "ui": "id"}
    v_file, v_out = tk.StringVar(), tk.StringVar()
    v_model, v_chars = tk.StringVar(value="small"), tk.IntVar(value=42)
    v_lang = tk.StringVar(value="id")          # kode: auto / id / en
    v_ui = tk.StringVar(value="Bahasa Indonesia")
    log_text = []
    widgets = {}

    def t(k):
        return TXT[state["ui"]][k]

    def build():
        for w in root.winfo_children():
            w.destroy()
        root.title(t("title"))
        f = ttk.Frame(root, padding=12)
        f.pack(fill="both", expand=True)
        f.columnconfigure(1, weight=1)
        f.rowconfigure(6, weight=1)

        ttk.Label(f, text=t("file")).grid(row=0, column=0, sticky="w")
        ttk.Entry(f, textvariable=v_file).grid(row=0, column=1, sticky="ew", padx=6)
        ttk.Button(f, text=t("pick"), command=pick_file).grid(row=0, column=2)
        ttk.Label(f, text=t("out")).grid(row=1, column=0, sticky="w", pady=6)
        ttk.Entry(f, textvariable=v_out).grid(row=1, column=1, sticky="ew", padx=6)
        ttk.Button(f, text=t("change"), command=pick_out).grid(row=1, column=2)

        opt = ttk.Frame(f)
        opt.grid(row=2, column=0, columnspan=3, sticky="w", pady=4)
        ttk.Label(opt, text=t("lang")).pack(side="left")
        names = [t("auto"), "Indonesia", "English"]
        codes = ["auto", "id", "en"]
        cb = ttk.Combobox(opt, values=names, width=12, state="readonly")
        cb.current(codes.index(v_lang.get()))
        cb.bind("<<ComboboxSelected>>", lambda e: v_lang.set(codes[cb.current()]))
        cb.pack(side="left", padx=(4, 14))
        ttk.Label(opt, text=t("model")).pack(side="left")
        ttk.Combobox(opt, textvariable=v_model, values=MODEL_SIZES, width=9).pack(side="left", padx=(4, 14))
        ttk.Label(opt, text=t("chars")).pack(side="left")
        ttk.Spinbox(opt, from_=20, to=80, textvariable=v_chars, width=4).pack(side="left", padx=4)

        opt2 = ttk.Frame(f)
        opt2.grid(row=3, column=0, columnspan=3, sticky="w")
        ttk.Label(opt2, text=t("ui")).pack(side="left")
        ui = ttk.Combobox(opt2, textvariable=v_ui, values=list(UI_LANGS), width=16, state="readonly")
        ui.pack(side="left", padx=4)
        ui.bind("<<ComboboxSelected>>", on_ui)

        widgets["bar"] = ttk.Progressbar(f, maximum=100)
        widgets["bar"].grid(row=4, column=0, columnspan=3, sticky="ew", pady=8)
        btns = ttk.Frame(f)
        btns.grid(row=5, column=0, columnspan=3, sticky="w")
        widgets["start"] = ttk.Button(btns, text=t("start"), command=start)
        widgets["stop"] = ttk.Button(btns, text=t("cancel"), state="disabled",
                                     command=lambda: state.update(cancel=True))
        widgets["dl"] = ttk.Button(btns, text=t("dl"), command=download)
        for b in widgets.values():
            if isinstance(b, ttk.Button):
                b.pack(side="left", padx=(0, 8))
        box = tk.Text(f, height=14, wrap="word")
        box.grid(row=6, column=0, columnspan=3, sticky="nsew", pady=8)
        box.insert("end", "\n".join(log_text) + ("\n" if log_text else ""))
        box.config(state="disabled")
        widgets["log"] = box

    def on_ui(_e=None):
        state["ui"] = UI_LANGS[v_ui.get()]
        build()

    def pick_file():
        p = filedialog.askopenfilename(
            filetypes=[("Audio", "*.wav *.mp3 *.m4a *.flac *.ogg *.mp4"), ("*", "*.*")])
        if p:
            v_file.set(p)
            v_out.set(str(Path(p).with_suffix(".srt")))

    def pick_out():
        p = filedialog.asksaveasfilename(defaultextension=".srt", filetypes=[("SRT", "*.srt")])
        if p:
            v_out.set(p)

    def log(msg):
        q.put(("log", msg))

    def set_busy(busy):
        widgets["start"].config(state="disabled" if busy else "normal")
        widgets["dl"].config(state="disabled" if busy else "normal")
        widgets["stop"].config(state="normal" if busy else "disabled")

    def work_transcribe():
        try:
            lang = None if v_lang.get() == "auto" else v_lang.get()
            srt = transcribe(v_file.get(), v_model.get(), lang, v_chars.get(),
                             progress=lambda p: q.put(("prog", p * 100)), log=log,
                             cancel=lambda: state["cancel"])
            Path(v_out.get()).write_text(srt, encoding="utf-8")
            log(t("saved") + v_out.get())
        except Exception as e:  # noqa: BLE001
            log(f"✘ {e}")
        q.put(("done", None))

    def work_download():
        try:
            download_model(v_model.get(), log=log)
        except Exception as e:  # noqa: BLE001
            log(f"✘ {e}")
        q.put(("done", None))

    def start():
        if not v_file.get() or not os.path.isfile(v_file.get()):
            messagebox.showwarning("!", t("warn"))
            return
        state["cancel"] = False
        widgets["bar"]["value"] = 0
        set_busy(True)
        threading.Thread(target=work_transcribe, daemon=True).start()

    def download():
        set_busy(True)
        threading.Thread(target=work_download, daemon=True).start()

    def poll():
        try:
            while True:
                kind, val = q.get_nowait()
                if kind == "log":
                    log_text.append(val)
                    b = widgets["log"]
                    b.config(state="normal")
                    b.insert("end", val + "\n")
                    b.see("end")
                    b.config(state="disabled")
                elif kind == "prog":
                    widgets["bar"]["value"] = val
                elif kind == "done":
                    set_busy(False)
        except (queue.Empty, tk.TclError):
            pass
        root.after(100, poll)

    build()
    poll()
    root.mainloop()


# ---------------------------------------------------------------- CLI
def main():
    ap = argparse.ArgumentParser(description="WAV -> SRT offline (Whisper)")
    ap.add_argument("audio", nargs="?", help="file audio (wav/mp3/…)")
    ap.add_argument("-o", "--output")
    ap.add_argument("-m", "--model", default="small", help="tiny|base|small|medium|large-v3 atau path folder")
    ap.add_argument("-l", "--lang", default=None, help="kode bahasa, mis. id, en (default: otomatis)")
    ap.add_argument("--max-chars", type=int, default=42)
    ap.add_argument("--max-dur", type=float, default=6.0)
    ap.add_argument("--download", metavar="MODEL", help="unduh model sekali (butuh internet)")
    a = ap.parse_args()

    if a.download:
        download_model(a.download)
        return
    if not a.audio:
        run_gui()
        return
    out = a.output or str(Path(a.audio).with_suffix(".srt"))
    last = [-1]

    def prog(p):
        pct = int(p * 100)
        if pct != last[0]:
            last[0] = pct
            print(f"\r{pct:3d}%", end="", file=sys.stderr, flush=True)

    srt = transcribe(a.audio, a.model, a.lang, a.max_chars, a.max_dur, progress=prog,
                     log=lambda m: print(m, file=sys.stderr))
    Path(out).write_text(srt, encoding="utf-8")
    print(f"\nTersimpan: {out}", file=sys.stderr)


if __name__ == "__main__":
    main()
