@echo off
cd /d "%~dp0"
start "CCA-F Practice Server" cmd /k "set PORT=5181 && cd /d C:\Users\aksha\Documents\Codex\CCA-F-Practice && node server.js"
timeout /t 2 /nobreak >nul
start "" http://127.0.0.1:5181
