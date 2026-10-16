"""Build Unmark: the frozen app folder and its installer.

    .venv\\Scripts\\python build.py                 everything:
                                                 dist/Unmark/ (the app, PyInstaller),
                                                 dist/Unmark-<version>-setup.exe (needs Inno Setup 6.5+)
    .venv\\Scripts\\python build.py --icons         re-render assets/icon.svg first (needs npm)
    .venv\\Scripts\\python build.py --no-installer  skip the Inno Setup installer
    .venv\\Scripts\\python build.py --skip-test     don't run the frozen app's smoke test

The installer carries the whole CUDA build of torch (~3 GB on disk). The models (~1.7 GB) are not
bundled: Unmark downloads them on first launch, as it does when run from source.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
VENV = ROOT / ".venv"
BUILD = ROOT / "build"
DIST = ROOT / "dist"
FRONTEND = ROOT / "frontend"
ASSETS = ROOT / "assets"
APP = "Unmark"
PUBLISHER = "lab.krts"
ICON_SIZES = [16, 20, 24, 32, 40, 48, 64, 96, 128, 256]
INNO_SETUP_URL = "https://jrsoftware.org/isdl.php"


def ensure_venv() -> None:
    py = VENV / "Scripts" / "python.exe"
    if not py.exists():
        raise SystemExit("No .venv: run setup.ps1 first.")
    if Path(sys.prefix).resolve() != VENV.resolve():
        sys.exit(subprocess.call([str(py), str(Path(__file__).resolve()), *sys.argv[1:]]))
    subprocess.check_call([str(py), "-m", "pip", "install", "-q", "--disable-pip-version-check", "pyinstaller>=6.10"])


def npm(*args: str) -> None:
    exe = shutil.which("npm")
    if exe is None:
        raise SystemExit("npm was not found. Install Node.js, then run build.py again.")
    subprocess.run([exe, *args], cwd=FRONTEND, check=True)


def version() -> str:
    namespace: dict = {}
    exec((ROOT / "app" / "__init__.py").read_text("utf-8"), namespace)
    return namespace["__version__"]


# --------------------------------------------------------------------------------------- icons

def write_icons() -> None:
    """assets/unmark.ico from the rendered PNGs (one exact render per size)."""
    from PIL import Image

    images = [Image.open(ASSETS / "icons" / f"icon-{s}.png").convert("RGBA") for s in ICON_SIZES]
    images[-1].save(ASSETS / "unmark.ico", format="ICO", sizes=[(s, s) for s in ICON_SIZES],
                    append_images=images[:-1])


def write_wizard_images() -> dict[str, str]:
    """Installer artwork: the tall side panel (opaque) and the small header icon (with alpha)."""
    from PIL import Image, ImageDraw

    icon = Image.open(ASSETS / "icons" / "icon-512.png").convert("RGBA")
    large, small = [], []
    for scale in (100, 150, 200):
        w, h = round(164 * scale / 100), round(314 * scale / 100)
        panel = Image.new("RGB", (w, h))
        draw = ImageDraw.Draw(panel)
        top, bottom = (0x3E, 0x8B, 0xFF), (0x6B, 0x3F, 0xF2)  # the icon's tile gradient
        for y in range(h):
            t = y / (h - 1)
            draw.line([(0, y), (w, y)], fill=tuple(round(a + (b - a) * t) for a, b in zip(top, bottom)))
        side = round(w * 0.62)
        mark = icon.resize((side, side), Image.Resampling.LANCZOS)
        panel.paste(mark, ((w - side) // 2, round(h * 0.36) - side // 2), mark)
        path = BUILD / f"wizard-large-{scale}.bmp"
        panel.save(path)
        large.append(str(path))

        side = round(55 * scale / 100)
        path = BUILD / f"wizard-small-{scale}.bmp"
        icon.resize((side, side), Image.Resampling.LANCZOS).save(path)  # 32-bit, alpha kept
        small.append(str(path))
    return {"large": ",".join(large), "small": ",".join(small)}


def write_version_file(path: Path, ver: str) -> None:
    nums = tuple(([int(p) for p in ver.split(".")[:4]] + [0, 0, 0, 0])[:4])
    strings = {
        "CompanyName": PUBLISHER, "FileDescription": "Unmark - watermark remover",
        "FileVersion": ver, "InternalName": APP, "OriginalFilename": f"{APP}.exe",
        "ProductName": APP, "ProductVersion": ver,
    }
    entries = ",\n".join(f"          StringStruct('{k}', '{v}')" for k, v in strings.items())
    path.write_text(f"""VSVersionInfo(
  ffi=FixedFileInfo(filevers={nums}, prodvers={nums}, mask=0x3f, flags=0x0, OS=0x40004,
                    fileType=0x1, subtype=0x0, date=(0, 0)),
  kids=[
    StringFileInfo([StringTable('040904B0', [
{entries}
    ])]),
    VarFileInfo([VarStruct('Translation', [1033, 1200])])
  ]
)
""", encoding="utf-8")


# ------------------------------------------------------------------------------- build & test

def smoke_test(exe: Path) -> bool:
    """The frozen app removes a synthetic watermark (no window) and reports back."""
    print(f"Smoke test: {exe.name} --smoke-test ...")
    report = Path(tempfile.gettempdir()) / "unmark_smoke.json"
    report.unlink(missing_ok=True)
    try:
        subprocess.run([str(exe), "--smoke-test", str(report)], timeout=900)
    except subprocess.TimeoutExpired:
        print("  FAILED: the app did not exit.")
        return False
    if not report.exists():
        print("  FAILED: no report written.")
        return False
    result = json.loads(report.read_text("utf-8"))
    report.unlink(missing_ok=True)
    if result.get("error"):
        print(result["error"])
    print("  " + ", ".join(f"{k}={v}" for k, v in result.items() if k != "error"))
    return bool(result.get("ok"))


def find_iscc() -> Path | None:
    """Inno Setup 6's command-line compiler: $ISCC, PATH, or the default install folders."""
    candidates = [os.environ.get("ISCC", ""), shutil.which("iscc") or ""]
    for base in (os.environ.get("ProgramFiles(x86)"), os.environ.get("ProgramFiles"),
                 str(Path(os.environ.get("LOCALAPPDATA", "")) / "Programs")):
        if base:
            candidates.append(str(Path(base) / "Inno Setup 6" / "ISCC.exe"))
    return next((Path(c) for c in candidates if c and Path(c).is_file()), None)


def build_installer(ver: str, source: Path) -> Path | None:
    iscc = find_iscc()
    if iscc is None:
        print(f"Inno Setup 6 was not found, so no installer was made. Install it from {INNO_SETUP_URL} "
              "(or: winget install JRSoftware.InnoSetup), then run build.py again.")
        return None
    images = write_wizard_images()
    print(f"Building the installer with {iscc} (a few minutes: ~3 GB to compress) ...")
    subprocess.run([str(iscc), "/Q",
                    f"/DAppVersion={ver}",
                    f"/DSourceDir={source}",
                    f"/DOutputDir={DIST}",
                    f"/DIconFile={ASSETS / 'unmark.ico'}",
                    f"/DWizardLarge={images['large']}",
                    f"/DWizardSmall={images['small']}",
                    str(ROOT / "installer" / f"{APP}.iss")], check=True)
    setup = DIST / f"{APP}-{ver}-setup.exe"
    return setup if setup.exists() else None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--icons", action="store_true", help="re-render the icon PNGs from assets/icon.svg")
    parser.add_argument("--no-installer", action="store_true", help="don't build the Inno Setup installer")
    parser.add_argument("--skip-test", action="store_true", help="don't run the frozen app's smoke test")
    args = parser.parse_args()
    ensure_venv()

    ver = version()
    BUILD.mkdir(exist_ok=True)
    print(f"Building {APP} {ver} ...")

    # 1. The UI bundle and the icon.
    if not (FRONTEND / "node_modules").is_dir():
        npm("ci")
    if args.icons or not (ASSETS / "icons" / "icon-512.png").exists():
        npm("run", "icons")
    write_icons()
    npm("run", "build")

    # 2. The app folder.
    import PyInstaller.__main__

    write_version_file(BUILD / "version_info.txt", ver)
    PyInstaller.__main__.run([str(ROOT / f"{APP}.spec"), "--noconfirm", "--clean",
                              "--distpath", str(DIST), "--workpath", str(BUILD / "pyinstaller")])
    app_dir = DIST / APP
    exe = app_dir / f"{APP}.exe"
    if not exe.exists():
        print("Build failed: no Unmark.exe produced.")
        return 1
    size = sum(f.stat().st_size for f in app_dir.rglob("*") if f.is_file())
    print(f"Done: {app_dir} ({size / 1024 ** 3:.2f} GB)")
    if not args.skip_test and not smoke_test(exe):
        print("The frozen app failed its smoke test; not building the installer.")
        return 1

    # 3. The installer.
    if not args.no_installer:
        setup = build_installer(ver, app_dir)
        if setup:
            print(f"Done: {setup} ({setup.stat().st_size / 1024 ** 3:.2f} GB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
