# ContraVis — setup del backend en Windows (PowerShell).
# Instala uv (si falta) y las dependencias del backend desde uv.lock.
$ErrorActionPreference = "Stop"

Write-Host "== ContraVis backend setup (Windows) =="

# 1) Instalar uv si no está disponible.
if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    Write-Host "Instalando uv..."
    Invoke-RestMethod https://astral.sh/uv/install.ps1 | Invoke-Expression
    # uv se instala en %USERPROFILE%\.local\bin; lo añadimos a esta sesión.
    $env:Path = "$env:USERPROFILE\.local\bin;$env:Path"
}

uv --version

# 2) Instalar el backend (uv descarga el Python fijado e instala desde uv.lock).
$server = Resolve-Path (Join-Path $PSScriptRoot "..\..\server")
Push-Location $server
try {
    uv sync
}
finally {
    Pop-Location
}

Write-Host ""
Write-Host "Listo. Para correr el backend: scripts\windows\run.ps1  (o run.bat)"
