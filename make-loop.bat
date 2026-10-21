@echo off
chcp 65001 >nul
setlocal
rem Перетащите один или несколько роликов на этот файл.
rem Для каждого получится луп-превью loops\<имя>.mp4: 5 секунд, 960x720 (4:3, как карточки), без звука, ~1-3 МБ.
rem Ролик любого формата обрезается по центру до 4:3. Начало не с нуля: make-loop.bat видео.mp4 12  (с 12-й секунды)
rem Нужен ffmpeg: winget install Gyan.FFmpeg

where ffmpeg >nul 2>nul || (echo Не найден ffmpeg. Установите: winget install Gyan.FFmpeg & pause & exit /b 1)
if "%~1"=="" (echo Перетащите видео на этот файл. & pause & exit /b 1)
if not exist "%~dp0loops" mkdir "%~dp0loops"

rem second argument = start second (only when one file is given)
set START=0
if not "%~2"=="" if exist "%~1" if not exist "%~2" set START=%~2

for %%F in (%*) do if exist "%%~F" (
  echo.
  echo === %%~nxF
  ffmpeg -hide_banner -loglevel error -y -ss %START% -t 5 -i "%%~F" -an ^
    -vf "scale=960:720:force_original_aspect_ratio=increase,crop=960:720,fps=30" ^
    -c:v libx264 -preset slow -crf 26 -pix_fmt yuv420p -movflags +faststart ^
    "%~dp0loops\%%~nF.mp4" && echo готово: loops\%%~nF.mp4
)
echo.
pause
