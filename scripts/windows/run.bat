@echo off
REM Doble clic para correr el backend (FastAPI con uv).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run.ps1"
pause
