@echo off
REM Jalankan di Windows. Hasil: dist\wav2srt\wav2srt.exe
python -m pip install -r requirements.txt pyinstaller || goto :err
if not exist models\small (
  echo Mengunduh model small agar langsung bisa offline...
  python wav2srt.py --download small || goto :err
)
pyinstaller --noconfirm --windowed --name wav2srt --collect-all faster_whisper --collect-all ctranslate2 --collect-all av wav2srt.py || goto :err
xcopy /E /I /Y models dist\wav2srt\models
echo Selesai: dist\wav2srt\wav2srt.exe
pause
exit /b 0
:err
echo GAGAL. Cek pesan di atas.
pause
