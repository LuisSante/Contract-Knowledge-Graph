# Windows scripts

Windows equivalent of the `Makefile` (`make install` / `make run`), since Windows
has no `make` by default. These use **uv**.

## Easiest: just double-click
1. Double-click **`install.bat`** → installs uv (if missing) and the backend
   dependencies. Run this once.
2. Double-click **`run.bat`** → starts the backend at http://localhost:8300

That's it — double-clicking runs everything; no terminal needed.

## From PowerShell (if you prefer the console)
Run these from the repo root:
```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\install.ps1
powershell -ExecutionPolicy Bypass -File scripts\windows\run.ps1
```

## Notes
- You only need an internet connection the first time (uv downloads the Python
  version pinned in `server/.python-version` and the deps from `server/uv.lock`).
- If `install.bat` installs uv but `uv` is "not found" right after, **close and
  reopen** the terminal/window (PATH updates for new sessions).
- The repo's `.sh` files (if any) are for Linux/Mac or Git Bash; on native Windows
  use these `.ps1` / `.bat`.
