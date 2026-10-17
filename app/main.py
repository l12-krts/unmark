"""Unmark: remove watermarks from one image or a whole folder (rem-wm under the hood).

    python -m app.main                      built UI from frontend/dist
    python -m app.main --dev                UI from the Vite dev server (npm --prefix frontend run dev)
    Unmark.exe --smoke-test report.json     no window: run the engine once, write a JSON report, exit
"""

from __future__ import annotations

import ctypes
import json
import os
import sys
import tempfile
import time
import traceback
from pathlib import Path

from . import __version__

WINDOWS = sys.platform == "win32"
if WINDOWS:
    import winreg

FROZEN = getattr(sys, "frozen", False)
# Frozen (PyInstaller): data files sit in _internal next to Unmark.exe.
BASE = Path(getattr(sys, "_MEIPASS", "")) if FROZEN else Path(__file__).resolve().parent.parent
DIST = BASE / "frontend" / "dist" / "index.html"
# Linux (Qt) takes a PNG for the window icon; Windows reads the .ico baked into Unmark.exe.
ICON = BASE / "assets" / ("unmark.ico" if WINDOWS else "icons/icon-256.png")
DEV_URL = "http://localhost:5173"
LOG_DIR = Path(os.environ.get("LOCALAPPDATA") or tempfile.gettempdir()) / "Unmark"


def system_is_dark() -> bool:
    if not WINDOWS:
        return False
    try:
        with winreg.OpenKey(
            winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize"
        ) as key:
            return winreg.QueryValueEx(key, "AppsUseLightTheme")[0] == 0
    except OSError:
        return False


def route_output_to_log() -> None:
    """A windowed exe has no stdout/stderr; loguru, tqdm (model downloads) and tracebacks need one."""
    if sys.stderr is not None and sys.stdout is not None:
        return
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    log = open(LOG_DIR / "unmark.log", "a", encoding="utf-8", buffering=1)  # noqa: SIM115 - lives for the process
    log.write(f"\n--- Unmark {__version__} {time.strftime('%Y-%m-%d %H:%M:%S')}\n")
    sys.stdout = sys.stdout or log
    sys.stderr = sys.stderr or log


def smoke_test(report: Path) -> int:
    """Remove a synthetic watermark without opening a window; used by build.py on the frozen app."""
    result: dict = {"version": __version__, "ok": False, "ui": DIST.exists(), "icon": ICON.exists()}
    try:
        from PIL import Image, ImageDraw, ImageFont

        from .engine import Engine, Settings

        image = Image.new("RGB", (640, 420))
        draw = ImageDraw.Draw(image)
        for y in range(420):
            draw.line([(0, y), (640, y)], fill=(60 + y // 4, 90 + y // 6, 160))
        try:
            font = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf" if WINDOWS else "DejaVuSans-Bold.ttf", 56)
        except OSError:
            font = ImageFont.load_default(56)
        draw.text((150, 180), "SAMPLE", font=font, fill=(255, 255, 255))
        source = Path(tempfile.gettempdir()) / "unmark-smoke.png"
        image.save(source)

        engine = Engine()
        started = time.perf_counter()
        removed = engine.remove(source, Settings())
        result.update(
            device=engine.device,
            gpu=engine.gpu_name,
            regions=removed.regions,
            seconds=round(time.perf_counter() - started, 2),
            ok=result["ui"] and result["icon"],
        )
        source.unlink(missing_ok=True)
    except Exception:
        result["error"] = traceback.format_exc()
    report.write_text(json.dumps(result, indent=2), "utf-8")
    return 0 if result["ok"] else 1


def main() -> None:
    route_output_to_log()
    if "--smoke-test" in sys.argv:
        sys.exit(smoke_test(Path(sys.argv[sys.argv.index("--smoke-test") + 1])))

    dev = "--dev" in sys.argv
    if not dev and not DIST.exists():
        sys.exit("The UI isn't built yet. Run: npm --prefix frontend run build")

    # Own taskbar identity, so Windows shows Unmark's icon rather than Python's when run from source.
    if WINDOWS:
        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("lab.krts.Unmark")

    import webview
    from webview.dom import DOMEventHandler

    from .api import Api

    api = Api()
    window = webview.create_window(
        "Unmark",
        DEV_URL if dev else str(DIST),
        js_api=api,
        width=1280,
        height=840,
        min_size=(980, 660),
        # HeroUI's default page backgrounds, so the window doesn't flash before React paints.
        background_color="#0A0A0B" if system_is_dark() else "#F5F5F5",
    )
    api._window = window

    def bind_drop() -> None:
        # Paths of dropped files only reach Python through a DOM drop handler.
        window.dom.document.events.drop += DOMEventHandler(api._on_drop, prevent_default=True)

    window.events.loaded += bind_drop
    webview.start(api._startup, debug=dev, http_server=not dev, icon=str(ICON) if ICON.exists() else None,
                  gui=None if WINDOWS else "qt")


if __name__ == "__main__":
    main()
