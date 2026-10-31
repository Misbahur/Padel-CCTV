@echo off
title Papan Skor Padel + CCTV
cd /d "%~dp0"
if exist "%LOCALAPPDATA%\Microsoft\WinGet\Links\ffmpeg.exe" (
  set "PATH=%LOCALAPPDATA%\Microsoft\WinGet\Links;%PATH%"
)
start "" http://localhost:8080
python padel_cctv.py
if errorlevel 1 (
  echo.
  echo Python belum terpasang? Unduh di https://www.python.org/downloads/
  pause
)
