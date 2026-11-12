# WAV → SRT (web, berjalan di browser)

Situs statis tanpa build. Whisper (transformers.js) berjalan di browser pengguna; audio tidak diunggah.

## Deploy
- **Cloudflare Pages**: Create project > Direct Upload > seret folder ini. (Atau sambungkan repo GitHub, build command kosong, output directory `/`.)
- **Vercel**: `npx vercel --prod` di folder ini (Framework: Other, tanpa build).
- **Netlify**: seret folder ke app.netlify.com/drop.
- **GitHub Pages**: push ke repo, aktifkan Pages.

Harus lewat HTTPS (atau `localhost`) agar Web Worker modul dan service worker jalan.

## Coba lokal
```
python -m http.server 8000
```
lalu buka http://localhost:8000

## Format audio
WAV dibaca langsung. MP3/M4A/FLAC/OGG memakai decoder browser. AMR, AWB, 3GP, WMA, OPUS dikonversi lewat ffmpeg.wasm (~32 MB dari unpkg.com, diunduh sekali lalu dicache).

## Catatan
- Model dari Hugging Face (`Xenova/whisper-tiny|base|small`) diunduh sekali lalu dicache browser.
- Library dimuat dari cdn.jsdelivr.net. Untuk fully self-hosted, salin paket `@huggingface/transformers` dan file wasm onnxruntime ke situsmu.
- Setelah mengubah file, naikkan nama cache di `sw.js` (`wav2srt-v1` -> `v2`) agar pengguna mendapat versi baru.
