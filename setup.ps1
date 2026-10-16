# One-time setup: Python venv (CUDA torch) + UI build. Run from this folder:
#   powershell -ExecutionPolicy Bypass -File setup.ps1
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

# rem-wm is a git submodule; a plain copy of this folder gets a fresh clone instead.
if (-not (Test-Path 'vendor\rem-wm\lama_cleaner')) {
    if (Test-Path '.git') { git submodule update --init --depth 1 }
    else { git clone --depth 1 https://github.com/Damarcreative/rem-wm.git vendor\rem-wm }
}

if (-not (Test-Path '.venv\Scripts\python.exe')) { py -3.12 -m venv .venv }
$py = '.venv\Scripts\python.exe'
& $py -m pip install --upgrade pip
# CUDA 12.4 build; drop the index URL for a CPU-only machine (much slower).
& $py -m pip install torch==2.6.0 torchvision==0.21.0 --index-url https://download.pytorch.org/whl/cu124
& $py -m pip install -r requirements.txt

npm --prefix frontend install
npm --prefix frontend run build

Write-Host "`nDone. Start Unmark with run.bat (models download on first launch, ~1.7 GB)."
