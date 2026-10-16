"""Run the engine on rem-wm's example images without the UI.

    .venv\\Scripts\\python scripts\\smoke_test.py [image ...] [--detector box] [--model base]

Writes <name>-unmarked.<ext> and <name>-mask.png into ./out.
"""

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from PIL import Image  # noqa: E402

from app.engine import VENDOR, Engine, Settings, save_image  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("images", nargs="*", type=Path)
    parser.add_argument("--detector", default="segment")
    parser.add_argument("--model", default="large")
    parser.add_argument("--strategy", default="crop")
    parser.add_argument("--prompt", default="watermark")
    args = parser.parse_args()

    images = args.images or sorted((VENDOR / "example_image").glob("*.jp*g"))
    out = ROOT / "out"
    out.mkdir(exist_ok=True)

    engine = Engine()
    print(f"device: {engine.device} {engine.gpu_name or ''}")
    settings = Settings.from_dict(vars(args))
    for path in images:
        result = engine.remove(path, settings, on_stage=lambda s: print(f"  {s}"))
        target = save_image(result.image, out / f"{path.stem}-unmarked{path.suffix}")
        Image.fromarray(result.mask).save(out / f"{path.stem}-mask.png")
        print(f"{path.name}: {result.regions} region(s), {result.seconds:.2f}s -> {target}")


if __name__ == "__main__":
    main()
