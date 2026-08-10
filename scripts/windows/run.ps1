# ContraVis — correr el backend en Windows (PowerShell).
$ErrorActionPreference = "Stop"

# uv puede estar instalado pero no en el PATH de esta sesión; lo añadimos.
if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    $env:Path = "$env:USERPROFILE\.local\bin;$env:Path"
}
if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    Write-Error "uv no esta instalado. Corre primero: scripts\windows\install.ps1"
    exit 1
}

$server = Resolve-Path (Join-Path $PSScriptRoot "..\..\server")
Push-Location $server
try {
    uv run uvicorn main:app --reload --port 8300
}
finally {
    Pop-Location
}
