@echo off
rem Unmark launcher. "run.bat --dev" loads the UI from the Vite dev server instead of frontend\dist.
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo Run setup.ps1 first.
  pause
  exit /b 1
)
if /i "%~1"=="--dev" (
  start "Unmark UI dev server" /min cmd /c "npm --prefix frontend run dev"
  ".venv\Scripts\python.exe" -m app.main --dev
) else (
  start "" ".venv\Scripts\pythonw.exe" -m app.main
)
