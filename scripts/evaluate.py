"""How often detection fires on clean images, and how much of a known watermark it covers.

Uses the Windows wallpapers as clean photos and stamps synthetic watermarks on copies of them
(a big translucent one in the middle, a small one in the corner):

    .venv\\Scripts\\python scripts\\evaluate.py [--model base]
"""

import argparse
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import numpy as np  # noqa: E402
from PIL import Image, ImageDraw, ImageFont  # noqa: E402

from app.engine import VENDOR, Engine, Settings, load_image  # noqa: E402

FONT = "C:/Windows/Fonts/arialbd.ttf"
TEXTS = ["© Northlight Studio", "SAMPLE", "shutterpix.com", "@mara.draws", "PREVIEW ONLY", "Getty Images"]


def stamp(image: Image.Image, rng: random.Random, style: str) -> tuple[Image.Image, tuple]:
    """Image with a watermark, and the watermark's box."""
    layer = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    text = rng.choice(TEXTS)
    w, h = image.size
    font = ImageFont.truetype(FONT, int(w / 12) if style == "center" else int(w / 40))
    left, top, right, bottom = draw.textbbox((0, 0), text, font=font)
    if style == "center":
        x, y, alpha = (w - right) / 2, (h - bottom) / 2, rng.randint(90, 160)
    else:
        x, y, alpha = w - right - w * 0.03, h - bottom - h * 0.03, rng.randint(170, 230)
    draw.text((x, y), text, font=font, fill=(255, 255, 255, alpha))
    marked = Image.alpha_composite(image.convert("RGBA"), layer).convert("RGB")
    return marked, (x + left, y + top, x + right, y + bottom)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="large")
    args = parser.parse_args()

    rng = random.Random(7)
    clean, marked = [], []
    for path in sorted(Path("C:/Windows/Web").rglob("*.jpg")):
        image = load_image(path).convert("RGB")
        image.thumbnail((1280, 1280))
        clean.append((path.name, image))
        for style in ("center", "corner"):
            stamped, box = stamp(image, rng, style)
            marked.append((f"{path.name} {style}", stamped, box))
    clean.append(("image0 top", load_image(VENDOR / "example_image" / "image0.jpeg").convert("RGB").crop((0, 0, 400, 300))))

    engine = Engine()
    engine.load(args.model)
    for detector in ("box", "segment"):
        settings = Settings(detector=detector, model=args.model)
        false_hits = [name for name, image in clean if engine.detect(image, settings)[1]]
        coverage = []
        for name, image, (x1, y1, x2, y2) in marked:
            mask, _ = engine.detect(image, settings)
            region = mask[int(y1) : int(y2), int(x1) : int(x2)]
            coverage.append((float((region > 0).mean()) if region.size else 0.0, name))
        covered = sum(c >= 0.9 for c, _ in coverage)
        print(f"\n{detector}: clean images flagged {len(false_hits)}/{len(clean)}  {false_hits}")
        print(f"{detector}: watermarks >=90% covered {covered}/{len(marked)}, median coverage {np.median([c for c, _ in coverage]):.2f}")
        for c, name in sorted(coverage)[:5]:
            print(f"   worst {c:.2f}  {name}")


if __name__ == "__main__":
    main()
