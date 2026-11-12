@echo off
cd /d "%~dp0"
set M=small

if exist models\%M%\model.bin goto copy
if exist models\%M% rmdir /s /q models\%M%
echo Mengunduh model %M% (sekitar 480 MB). Jangan ditutup sampai selesai...
python wav2srt.py --download %M% || goto err

:copy
if not exist models\%M%\model.bin goto err
xcopy /E /I /Y models dist\wav2srt\models
echo.
echo SELESAI. Buka dist\wav2srt\wav2srt.exe
pause
exit /b 0

:err
echo.
echo GAGAL: model.bin belum ada. Cek koneksi internet lalu jalankan ulang file ini.
pause
exit /b 1
