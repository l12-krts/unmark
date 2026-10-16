"""The bridge the React UI calls as window.pywebview.api.*

pywebview exposes every public attribute to JavaScript (recursively), so all state lives on
underscore names. Long work reports back through `unmark` CustomEvents on window.
"""

from __future__ import annotations

import base64
import ctypes
import io
import json
import os
import subprocess
import threading
import time
import traceback
import uuid
from pathlib import Path
from typing import Any

import numpy as np
import webview
from PIL import Image, ImageOps

IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"}
FILE_TYPES = ("Images (*.png;*.jpg;*.jpeg;*.webp;*.bmp;*.tif;*.tiff)",)
CONFIG_DIR = Path(os.environ.get("APPDATA") or Path.home()) / "Unmark"
SETTINGS_FILE = CONFIG_DIR / "settings.json"
PREVIEW_SIDE = 2048
THUMB_SIDE = 256
MODEL_NAMES = {"large": "Unmark Detail", "base": "Unmark Lite"}  # as the settings panel calls them


def data_url(image: Image.Image, max_side: int, quality: int = 88) -> str:
    image = image.copy()
    image.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
    buffer = io.BytesIO()
    if image.mode in ("RGBA", "LA", "PA", "P"):
        image.convert("RGBA").save(buffer, "PNG", optimize=False)
        mime = "image/png"
    else:
        image.convert("RGB").save(buffer, "JPEG", quality=quality)
        mime = "image/jpeg"
    return f"data:{mime};base64,{base64.b64encode(buffer.getvalue()).decode()}"


def mask_url(mask: np.ndarray) -> str:
    """White where the mask is set, transparent elsewhere: used as a CSS mask-image."""
    alpha = Image.fromarray(mask)
    alpha.thumbnail((PREVIEW_SIDE, PREVIEW_SIDE), Image.Resampling.BILINEAR)
    image = Image.new("LA", alpha.size, 255)
    image.putalpha(alpha)
    buffer = io.BytesIO()
    image.save(buffer, "PNG")
    return f"data:image/png;base64,{base64.b64encode(buffer.getvalue()).decode()}"


def describe(path: Path) -> dict | None:
    """Metadata and a thumbnail for one image, or None if it can't be read."""
    try:
        with Image.open(path) as image:
            width, height = image.size
            if image.getexif().get(0x0112, 1) in (5, 6, 7, 8):
                width, height = height, width
            image.draft("RGB", (THUMB_SIDE * 2, THUMB_SIDE * 2))
            thumb = data_url(ImageOps.exif_transpose(image), THUMB_SIDE, quality=80)
    except Exception:
        return None
    return {
        "id": uuid.uuid4().hex,
        "path": str(path),
        "name": path.name,
        "bytes": path.stat().st_size,
        "width": width,
        "height": height,
        "thumb": thumb,
    }


def collect(paths: list[str]) -> list[Path]:
    """Expand folders (not recursively) and keep image files, in order, without duplicates."""
    found: list[Path] = []
    seen: set[str] = set()
    for raw in paths:
        path = Path(raw)
        candidates = sorted(p for p in path.iterdir() if p.is_file()) if path.is_dir() else [path]
        for p in candidates:
            key = str(p.resolve()).lower()
            if p.suffix.lower() in IMAGE_EXTS and key not in seen:
                seen.add(key)
                found.append(p)
    return found


def output_target(out_dir: Path, source: Path, used: set[str]) -> Path:
    stem, ext = source.stem, source.suffix.lower()
    if out_dir.resolve() == source.parent.resolve():
        stem += "-unmarked"  # never overwrite the original
    name, n = f"{stem}{ext}", 2
    while name.lower() in used:
        name, n = f"{stem} ({n}){ext}", n + 1
    used.add(name.lower())
    return out_dir / name


def redirection_guard_enforced() -> bool:
    """Whether Windows' RedirectionGuard is on for this process. A parent can pass it on (Inno Setup's
    finish page did); it blocks the user-made symlinks the Hugging Face model cache is built from."""
    k32 = ctypes.WinDLL("kernel32")
    k32.GetCurrentProcess.restype = ctypes.c_void_p
    k32.GetProcessMitigationPolicy.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_void_p, ctypes.c_size_t]
    flags = ctypes.c_ulong()
    ok = k32.GetProcessMitigationPolicy(k32.GetCurrentProcess(), 16, ctypes.byref(flags), ctypes.sizeof(flags))
    return bool(ok and flags.value & 1)  # 16 = ProcessRedirectionTrustPolicy, bit 0 = enforce


def friendly_error(exc: BaseException) -> str:
    text = str(exc) or exc.__class__.__name__
    if "out of memory" in text.lower():
        return f"Ran out of GPU memory. Try the Fast fill or {MODEL_NAMES['base']}."
    if isinstance(exc, PermissionError):
        return f"Unmark can't write to {exc.filename or 'that folder'}. Choose another output folder."
    # The blocked symlink surfaces as EINVAL (Windows error 448 has no errno of its own).
    if isinstance(exc, OSError) and exc.errno == 22 and redirection_guard_enforced():
        return "Windows blocked the model cache for this window (it was started by another program). Close Unmark and open it from the Start menu."
    return text.splitlines()[0][:300]


class Api:
    def __init__(self) -> None:
        self._window: webview.Window | None = None
        self._engine = None
        self._engine_lock = threading.Lock()
        self._state: dict[str, Any] = {"state": "starting", "message": "Starting", "device": None, "gpu": None}
        self._single: tuple[str, Image.Image] | None = None
        self._masks: dict[str, str] = {}
        self._batch_thread: threading.Thread | None = None
        self._batch_cancel = threading.Event()
        self._last_drop: tuple[float, tuple[str, ...]] = (0.0, ())

    # -- plumbing (not exposed: underscore names) ------------------------------------------------

    def _emit(self, kind: str, **payload: Any) -> None:
        if self._window is None:
            return
        message = json.dumps({"type": kind, **payload})
        try:
            self._window.evaluate_js(f"window.dispatchEvent(new CustomEvent('unmark',{{detail:{message}}}))")
        except Exception:
            pass

    def _set_state(self, state: str, message: str = "") -> None:
        self._state.update(state=state, message=message)
        self._emit("engine", **self._state)

    def _engine_ready(self):
        """Import torch & friends once (slow), off the UI thread."""
        with self._engine_lock:
            if self._engine is None:
                self._set_state("starting", "Starting the engine")
                from .engine import Engine

                self._engine = Engine()
                self._state.update(device=self._engine.device, gpu=self._engine.gpu_name)
                self._set_state("idle", "Models load on first use")
        return self._engine

    def _settings(self, data: dict | None):
        from .engine import Settings

        return Settings.from_dict(data)

    def _ensure_models(self, settings) -> None:
        engine = self._engine_ready()
        if engine.loaded(settings.model):
            return
        downloading = not engine.is_cached(settings.model)

        def report(step: str) -> None:
            # The UI's names for the models, not the engine's.
            text = "Loading the fill model" if "LaMa" in step else f"Loading {MODEL_NAMES.get(settings.model, 'models')}"
            self._set_state(
                "downloading" if downloading else "loading",
                f"{text} (first run downloads ~1.7 GB)" if downloading else text,
            )

        try:
            engine.load(settings.model, report)
        except Exception as exc:
            self._set_state("error", friendly_error(exc))
            raise
        self._set_state("ready", "Ready")

    def _startup(self) -> None:
        """Runs once the window is up: warm the engine with the saved model."""
        try:
            self._ensure_models(self._settings(self.get_settings()))
        except Exception:
            traceback.print_exc()

    def _on_drop(self, event: dict) -> None:
        files = event.get("dataTransfer", {}).get("files", [])
        paths = tuple(f["pywebviewFullPath"] for f in files if f.get("pywebviewFullPath"))
        now = time.monotonic()
        if paths and paths == self._last_drop[1] and now - self._last_drop[0] < 1:
            return  # handlers can be registered twice after a dev reload
        self._last_drop = (now, paths)
        self._emit("dropped", items=self.describe(list(paths)))  # empty list: nothing usable was dropped

    # -- engine ---------------------------------------------------------------------------------

    def status(self) -> dict:
        return self._state

    def warmup(self, settings: dict) -> None:
        threading.Thread(target=self._warmup, args=(settings,), daemon=True).start()

    def _warmup(self, settings: dict) -> None:
        try:
            self._ensure_models(self._settings(settings))
        except Exception:
            traceback.print_exc()

    # -- settings -------------------------------------------------------------------------------

    def get_settings(self) -> dict:
        try:
            return json.loads(SETTINGS_FILE.read_text("utf-8"))
        except (OSError, ValueError):
            return {}

    def save_settings(self, data: dict) -> None:
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        SETTINGS_FILE.write_text(json.dumps(data, indent=2), "utf-8")

    # -- files ----------------------------------------------------------------------------------

    def pick_images(self, multiple: bool = True) -> list[dict]:
        paths = self._window.create_file_dialog(
            webview.FileDialog.OPEN, allow_multiple=multiple, file_types=FILE_TYPES
        )
        return self.describe(list(paths or []))

    def pick_folder(self) -> list[dict]:
        paths = self._window.create_file_dialog(webview.FileDialog.FOLDER)
        return self.describe(list(paths or []))

    def pick_output_dir(self) -> str | None:
        paths = self._window.create_file_dialog(webview.FileDialog.FOLDER)
        return paths[0] if paths else None

    def describe(self, paths: list[str]) -> list[dict]:
        return [item for item in map(describe, collect(paths)) if item]

    def default_output_dir(self, path: str) -> str:
        return str(Path(path).parent / "unmarked")

    def preview(self, path: str) -> str:
        from .engine import load_image

        return data_url(load_image(path), PREVIEW_SIDE)

    def open_path(self, path: str) -> None:
        os.startfile(path)  # noqa: S606 - local file the user picked

    def reveal(self, path: str) -> None:
        subprocess.Popen(["explorer", "/select,", os.path.normpath(path)])

    # -- single ---------------------------------------------------------------------------------

    def remove_single(self, path: str, settings: dict) -> dict:
        from .engine import load_image

        s = self._settings(settings)
        try:
            self._ensure_models(s)
            result = self._engine.remove(path, s, lambda stage: self._emit("stage", job="single", stage=stage))
        except Exception as exc:
            traceback.print_exc()
            raise RuntimeError(friendly_error(exc)) from exc
        result_id = uuid.uuid4().hex
        self._single = (result_id, result.image)
        return {
            "id": result_id,
            "before": data_url(load_image(path), PREVIEW_SIDE),
            "after": data_url(result.image, PREVIEW_SIDE),
            "mask": mask_url(result.mask) if result.regions else None,
            "regions": result.regions,
            "seconds": round(result.seconds, 2),
        }

    def save_single(self, result_id: str, source_path: str) -> str | None:
        from .engine import save_image

        if not self._single or self._single[0] != result_id:
            raise RuntimeError("That result is gone. Run it again.")
        source = Path(source_path)
        chosen = self._window.create_file_dialog(
            webview.FileDialog.SAVE,
            directory=str(source.parent),
            save_filename=f"{source.stem}-unmarked{source.suffix}",
        )
        if not chosen:
            return None
        target = chosen if isinstance(chosen, str) else chosen[0]
        return str(save_image(self._single[1], target))

    # -- batch ----------------------------------------------------------------------------------

    def start_batch(self, items: list[dict], settings: dict, output_dir: str) -> bool:
        if self._batch_thread and self._batch_thread.is_alive():
            return False
        self._batch_cancel.clear()
        self._batch_thread = threading.Thread(
            target=self._run_batch, args=(items, self._settings(settings), Path(output_dir)), daemon=True
        )
        self._batch_thread.start()
        return True

    def cancel_batch(self) -> None:
        self._batch_cancel.set()

    def batch_compare(self, item_id: str, source: str, output: str) -> dict:
        from .engine import load_image

        return {
            "before": data_url(load_image(source), PREVIEW_SIDE),
            "after": data_url(load_image(output), PREVIEW_SIDE),
            "mask": self._masks.get(item_id),
        }

    def _run_batch(self, items: list[dict], settings, out_dir: Path) -> None:
        from .engine import save_image

        self._emit("batch", state="running", total=len(items))
        try:
            out_dir.mkdir(parents=True, exist_ok=True)
            self._ensure_models(settings)
        except Exception as exc:
            self._emit("batch", state="failed", error=friendly_error(exc))
            return

        used: set[str] = set()
        for item in items:
            if self._batch_cancel.is_set():
                break
            item_id, source = item["id"], Path(item["path"])
            self._emit("batch-item", id=item_id, state="running")
            try:
                result = self._engine.remove(
                    source, settings, lambda stage: self._emit("stage", job="batch", id=item_id, stage=stage)
                )
                saved = save_image(result.image, output_target(out_dir, source, used))
                if result.regions:
                    self._masks[item_id] = mask_url(result.mask)
                self._emit(
                    "batch-item",
                    id=item_id,
                    state="done" if result.regions else "empty",
                    output=str(saved),
                    regions=result.regions,
                    seconds=round(result.seconds, 2),
                    thumb=data_url(result.image, THUMB_SIDE, quality=80),
                )
            except Exception as exc:
                traceback.print_exc()
                self._emit("batch-item", id=item_id, state="error", error=friendly_error(exc))

        self._emit("batch", state="cancelled" if self._batch_cancel.is_set() else "finished", output=str(out_dir))
