@echo off
REM Doble clic para instalar uv + dependencias del backend.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
echo.
pause
