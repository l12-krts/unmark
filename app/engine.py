"""The rem-wm pipeline: Florence-2 finds the watermark, LaMa paints over it.

Follows WatermarkRemover in vendor/rem-wm/remwm.py, minus its import-time
`pip install flash-attn`, and adds a detection prompt, a box detector, mask
expansion and a choice of inpainting strategy.
"""

from __future__ import annotations

import sys
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable
from unittest.mock import patch

VENDOR = Path(__file__).resolve().parent.parent / "vendor" / "rem-wm"
if str(VENDOR) not in sys.path:
    sys.path.insert(0, str(VENDOR))

import cv2  # noqa: E402
import numpy as np  # noqa: E402
import torch  # noqa: E402
from loguru import logger  # noqa: E402
from PIL import Image, ImageDraw, ImageOps  # noqa: E402
from transformers import AutoModelForCausalLM, AutoProcessor  # noqa: E402
from transformers.dynamic_module_utils import get_imports  # noqa: E402

from lama_cleaner.model.lama import LaMa  # noqa: E402
from lama_cleaner.schema import Config, HDStrategy, LDMSampler  # noqa: E402

# LaMa is TorchScript; the profiling executor re-optimises for every new image size (seconds each).
torch._C._jit_set_profiling_executor(False)
# lama_cleaner logs every forward pass at INFO.
logger.remove()
if sys.stderr is not None:
    logger.add(sys.stderr, level="WARNING")

# Pinned commits: Florence-2 runs code from its repo (trust_remote_code).
FLORENCE_MODELS = {
    "large": ("microsoft/Florence-2-large", "21a599d414c4d928c9032694c424fb94458e3594"),  # rem-wm's default
    "base": ("microsoft/Florence-2-base", "5ca5edf5bd017b9919c05d08aebef5e4c7ac3bac"),
}

# rem-wm's own Config is "fast": everything is inpainted at 200 px and scaled back up.
STRATEGIES = {
    "crop": dict(hd_strategy=HDStrategy.CROP, hd_strategy_crop_margin=128,
                 hd_strategy_crop_trigger_size=800, hd_strategy_resize_limit=2048),
    "fast": dict(hd_strategy=HDStrategy.RESIZE, hd_strategy_crop_margin=32,
                 hd_strategy_crop_trigger_size=200, hd_strategy_resize_limit=200),
    "original": dict(hd_strategy=HDStrategy.ORIGINAL, hd_strategy_crop_margin=32,
                     hd_strategy_crop_trigger_size=200, hd_strategy_resize_limit=200),
}

# Florence answers "watermark" with *something* even on a clean image. Those answers are a box
# over most of the frame or one hugging its borders; real marks sit inside it (scripts/evaluate.py).
MAX_BOX_AREA = 0.4
EDGE = 0.006  # within 0.6% of a border counts as touching it


def plausible(box, width: int, height: int) -> bool:
    x1, y1, x2, y2 = box
    if (x2 - x1) * (y2 - y1) > MAX_BOX_AREA * width * height:
        return False
    touching = (x1 <= EDGE * width) + (y1 <= EDGE * height) + (x2 >= (1 - EDGE) * width) + (y2 >= (1 - EDGE) * height)
    return touching < 2


def grow(mask: np.ndarray, px: int) -> np.ndarray:
    """Dilate a 0/255 mask by px, so soft edges and shadows go too."""
    if not px or not mask.any():
        return mask
    k = px * 2 + 1
    return cv2.dilate(mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))


def regions_mask(size: tuple[int, int], shapes: list[dict] | None) -> tuple[np.ndarray, int]:
    """Mask of regions drawn by hand, and how many. Shapes use fractions of the image, so the same
    regions fit any image size: {"kind": "box", x, y, w, h} or {"kind": "stroke", r, points: [[x, y], ...]}
    where r is the brush radius as a fraction of the image's shorter side."""
    width, height = size
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    count = 0
    for shape in shapes or []:
        if shape.get("kind") == "box":
            x, y, w, h = (float(shape[k]) for k in ("x", "y", "w", "h"))
            draw.rectangle((x * width, y * height, (x + w) * width, (y + h) * height), fill=255)
            count += 1
        elif shape.get("kind") == "stroke" and shape.get("points"):
            r = max(1.0, float(shape["r"]) * min(width, height))
            points = [(px * width, py * height) for px, py in shape["points"]]
            if len(points) > 1:
                draw.line(points, fill=255, width=round(2 * r), joint="curve")
            for px, py in points:  # round caps and joints
                draw.ellipse((px - r, py - r, px + r, py + r), fill=255)
            count += 1
    return np.array(mask), count


@dataclass
class Settings:
    prompt: str = "watermark"
    detector: str = "box"  # "box", "segment" (rem-wm's outline) or "none" (drawn regions only)
    model: str = "large"
    expand: int = 6  # px the mask grows by
    strategy: str = "crop"

    @classmethod
    def from_dict(cls, data: dict | None) -> "Settings":
        data = data or {}
        s = cls(**{k: data[k] for k in cls.__dataclass_fields__ if k in data})
        s.prompt = (s.prompt or "").strip() or "watermark"
        s.detector = s.detector if s.detector in ("segment", "box", "none") else "box"
        s.model = s.model if s.model in FLORENCE_MODELS else "large"
        s.expand = max(0, min(64, int(s.expand)))
        s.strategy = s.strategy if s.strategy in STRATEGIES else "crop"
        return s


@dataclass
class Result:
    image: Image.Image  # cleaned, same size and mode as the source
    mask: np.ndarray  # HxW uint8, 255 where something was removed
    regions: int
    seconds: float


def load_image(path: str | Path) -> Image.Image:
    """Open an image upright (EXIF orientation applied)."""
    image = Image.open(path)
    image = ImageOps.exif_transpose(image)
    return image


def _imports_without_flash_attn(filename):
    imports = get_imports(filename)
    if "flash_attn" in imports:
        imports.remove("flash_attn")
    return imports


class Engine:
    def __init__(self) -> None:
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.dtype = torch.float16 if self.device == "cuda" else torch.float32
        self.gpu_name = torch.cuda.get_device_name(0) if self.device == "cuda" else None
        self._lock = threading.RLock()
        self._florence_key: str | None = None
        self._florence = None
        self._processor = None
        self._lama: LaMa | None = None

    # -- models ---------------------------------------------------------------------------------

    @staticmethod
    def is_cached(model: str) -> bool:
        from huggingface_hub import try_to_load_from_cache

        repo, revision = FLORENCE_MODELS.get(model, FLORENCE_MODELS["large"])
        weights = [try_to_load_from_cache(repo, f, revision=revision) for f in ("model.safetensors", "pytorch_model.bin")]
        return any(isinstance(w, str) for w in weights) and LaMa.is_downloaded()

    def loaded(self, model: str) -> bool:
        return self._lama is not None and self._florence_key == model

    def load(self, model: str, on_status: Callable[[str], None] = lambda _: None) -> None:
        with self._lock:
            if self._lama is None:
                on_status("Loading LaMa")
                self._lama = LaMa(self.device)
                # The first TorchScript call is slow whatever the size: pay it now, not on image one.
                blank = np.zeros((256, 256, 3), np.uint8)
                self._lama(blank, np.full((256, 256), 255, np.uint8), Config(ldm_steps=1, **STRATEGIES["original"]))
            if self._florence_key != model:
                self._florence = self._processor = None
                if self.device == "cuda":
                    torch.cuda.empty_cache()
                repo, revision = FLORENCE_MODELS[model]
                on_status(f"Loading {repo.split('/')[-1]}")
                with patch("transformers.dynamic_module_utils.get_imports", _imports_without_flash_attn):
                    self._florence = AutoModelForCausalLM.from_pretrained(
                        repo, revision=revision, trust_remote_code=True, torch_dtype=self.dtype,
                        attn_implementation="eager",
                    ).to(self.device).eval()
                    self._processor = AutoProcessor.from_pretrained(repo, revision=revision, trust_remote_code=True)
                self._florence_key = model

    # -- pipeline -------------------------------------------------------------------------------

    def _florence_run(self, task: str, prompt: str, image: Image.Image) -> dict:
        inputs = self._processor(text=task + prompt, images=image, return_tensors="pt")
        with torch.inference_mode():
            generated_ids = self._florence.generate(
                input_ids=inputs["input_ids"].to(self.device),
                pixel_values=inputs["pixel_values"].to(self.device, self.dtype),
                max_new_tokens=1024,
                early_stopping=False,
                do_sample=False,
                num_beams=3,
            )
        text = self._processor.batch_decode(generated_ids, skip_special_tokens=False)[0]
        return self._processor.post_process_generation(text, task=task, image_size=image.size)[task]

    def detect(self, image: Image.Image, settings: Settings) -> tuple[np.ndarray, int]:
        """Mask (HxW uint8, 0/255) of everything matching the prompt, and how many regions."""
        mask = Image.new("L", image.size, 0)
        draw = ImageDraw.Draw(mask)
        regions = 0
        if settings.detector == "box":
            found = self._florence_run("<OPEN_VOCABULARY_DETECTION>", settings.prompt, image)
            for box in found.get("bboxes", []):
                if plausible(box, *image.size):
                    draw.rectangle(box, fill=255)
                    regions += 1
        else:
            found = self._florence_run("<REGION_TO_SEGMENTATION>", settings.prompt, image)
            for polygons in found.get("polygons", []):
                shapes = [np.array(p).reshape(-1, 2) for p in polygons]
                shapes = [p for p in shapes if len(p) >= 3]
                if not shapes:
                    continue
                points = np.concatenate(shapes)
                if not plausible((*points.min(0), *points.max(0)), *image.size):
                    continue
                for shape in shapes:
                    draw.polygon(shape.reshape(-1).tolist(), fill=255)
                regions += 1
        return grow(np.array(mask), settings.expand), regions

    def inpaint(self, rgb: np.ndarray, mask: np.ndarray, strategy: str) -> np.ndarray:
        """rgb HxWx3 uint8 -> cleaned rgb."""
        config = Config(ldm_steps=1, ldm_sampler=LDMSampler.ddim, **STRATEGIES[strategy])
        bgr = self._lama(rgb, mask, config)
        return cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)

    def remove(self, path: str | Path, settings: Settings,
               on_stage: Callable[[str], None] = lambda _: None, shapes: list[dict] | None = None) -> Result:
        """Clean one image: what detection finds plus any regions drawn by hand (shapes)."""
        started = time.perf_counter()
        source = load_image(path)
        alpha = source.getchannel("A") if source.mode in ("RGBA", "LA", "PA") else None
        rgb_image = source.convert("RGB")
        drawn, drawn_count = regions_mask(rgb_image.size, shapes)

        with self._lock:
            if not self.loaded(settings.model):
                self.load(settings.model, on_stage)
            if settings.detector == "none":
                mask, regions = np.zeros_like(drawn), 0
            else:
                on_stage("Finding the watermark")
                mask, regions = self.detect(rgb_image, settings)
            if drawn_count:
                mask = np.maximum(mask, grow(drawn, settings.expand))
                regions += drawn_count
            if regions:
                on_stage("Painting it out")
                cleaned = Image.fromarray(self.inpaint(np.array(rgb_image), mask, settings.strategy))
            else:
                cleaned = rgb_image

        if alpha is not None:
            cleaned = cleaned.convert("RGBA")
            cleaned.putalpha(alpha)
        return Result(cleaned, mask, regions, time.perf_counter() - started)


def save_image(image: Image.Image, path: str | Path) -> Path:
    path = Path(path)
    ext = path.suffix.lower()
    if ext in (".jpg", ".jpeg"):
        image.convert("RGB").save(path, quality=95, subsampling=0)
    elif ext == ".webp":
        image.save(path, quality=95, method=5)
    elif ext in (".png", ".bmp", ".tif", ".tiff"):
        image.save(path)
    else:
        path = path.with_suffix(".png")
        image.save(path)
    return path
