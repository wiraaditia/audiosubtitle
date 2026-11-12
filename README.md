# WAV → SRT (Offline)

Dua versi di repo ini:
- **Desktop** (folder ini): `wav2srt.py`, Whisper via faster-whisper, 100% offline setelah model diunduh.
- **Web** (`web/`): berjalan di browser, siap deploy ke Cloudflare Pages/Vercel (root directory `web`, tanpa build).


Mengubah audio WAV (juga mp3/m4a/flac) menjadi subtitle `.srt` memakai Whisper lewat `faster-whisper`. Setelah model diunduh sekali, semuanya jalan tanpa internet.

## Pasang
```
pip install -r requirements.txt
```
Python 3.9+. Tkinter sudah bawaan Python di Windows/macOS (Linux: `sudo apt install python3-tk`). FFmpeg tidak perlu.

## Unduh model (sekali, butuh internet)
```
python wav2srt.py --download small
```
Model tersimpan di folder `models/`. Pilihan: `tiny`, `base`, `small` (disarankan untuk bahasa Indonesia), `medium`, `large-v3` (paling akurat, paling berat).
Bisa juga disalin manual ke `models/<nama>/` dari komputer lain.

## Pakai
GUI: `python wav2srt.py`

CLI:
```
python wav2srt.py audio.wav -m small -l id -o audio.srt
```
Opsi: `--max-chars 42` (karakter per baris), `--max-dur 6` (detik maksimal per subtitle).

## Jadi .exe (Windows)
Cara 1 (di Windows): klik dua kali `build_exe.bat`. Hasil: `dist\wav2srt\wav2srt.exe` (model `small` ikut tersalin ke `models\`, jadi langsung offline).

Cara 2 (tanpa Python): push folder ini ke GitHub, buka tab Actions > build-exe > Run workflow, lalu unduh artifact `wav2srt-windows`.

Bahasa: pilih "Bahasa audio" (Otomatis / Indonesia / English) dan "Tampilan" (Bahasa Indonesia / English) di aplikasi. CLI: `-l id` atau `-l en`.
