# Unmark

Remove watermarks from one image or a whole folder. A desktop app: Python + [pywebview](https://pywebview.flowrl.com/) with a
React + [HeroUI v3](https://heroui.com) UI (HeroUI's default theme, following the system light/dark setting).

The removal pipeline is [rem-wm](https://github.com/Damarcreative/rem-wm) (vendored in `vendor/rem-wm`):
**Florence-2** finds the watermark, **LaMa** paints over it.

## Setup

Needs Python 3.12, Node 20+, and an NVIDIA GPU for reasonable speed (it falls back to the CPU, slowly).

```powershell
powershell -ExecutionPolicy Bypass -File setup.ps1
```

That creates `.venv` with CUDA torch, installs the Python packages, and builds the UI. The first launch downloads the
models (~1.7 GB: Florence-2-large from Hugging Face, big-lama from GitHub) into the usual Hugging Face / torch caches.

## Run

```bat
run.bat
```

- **Single**: open or drop an image, *Remove watermark*, drag the before/after slider, toggle *Show mask* to see what was
  painted out, *Save…*.
- **Batch**: add images or a folder (or drop them), pick the output folder (default: an `unmarked` folder next to the
  images), *Remove from N images*. Originals are never touched. Click the eye on a row to compare.
- Dropping several images on the Single tab moves them to Batch. Ctrl+O opens, Ctrl+S saves.

## Settings

| Setting | What it does |
| --- | --- |
| Look for | The text prompt Florence-2 searches for: `watermark`, `logo`, `text`, `signature`… |
| Detection | **Boxes** (default): Florence-2 open-vocabulary detection, filled rectangles. Fast (~0.3 s) and covers the whole mark. **Outline**: rem-wm's original `<REGION_TO_SEGMENTATION>` polygons. Tighter, but several seconds per image and it can spill into the picture. |
| Grow mask | Dilates the mask so soft edges and drop shadows go too. |
| Fill | **Detail** (default): LaMa at full resolution around each mark. **Fast (rem-wm)**: rem-wm's own config, inpaints at 200 px and scales back up (soft on big images). **Whole image**: full frame at full resolution. |
| Detector model | Florence-2 Large (rem-wm's default) or Base (lighter, quicker). |

Settings persist in `%APPDATA%\Unmark\settings.json`.

## How it differs from calling rem-wm directly

- `remwm.py` runs `pip install flash-attn` on import, so the app doesn't import it. `app/engine.py` reuses rem-wm's
  `lama_cleaner` package and reproduces its Florence → mask → LaMa pipeline.
- Florence-2 always answers "watermark" with *something*, even on a clean photo. On clean images that answer is a box
  over most of the frame or one hugging two of its borders, so those are discarded (`plausible()` in the engine).
  Images where nothing survives are reported as "Nothing found" and copied unchanged. On the Windows wallpapers
  (`scripts/evaluate.py`) Boxes still flags 4 of 37 clean images and fully covers 67 of 72 synthetic watermarks;
  Outline flags 14/37 and covers 32/72, which is why Boxes is the default. Glance at the compare view before trusting a
  batch blindly.
- TorchScript's profiling executor is turned off: otherwise LaMa re-optimises for every new image size (seconds each).
- Florence-2 revisions are pinned (it runs code from its model repo).
- Transparency and EXIF orientation are kept; output format follows the input.

## Development

```bat
run.bat --dev
```

starts Vite on :5173 and points the window at it (hot reload, DevTools open).

| Path | |
| --- | --- |
| `app/engine.py` | The rem-wm pipeline |
| `app/api.py` | Everything the UI can call (`window.pywebview.api.*`), plus progress events |
| `app/main.py` | Window, drag-and-drop paths, `--smoke-test` |
| `frontend/src` | React UI (`features/` views, `state/` hooks, `lib/bridge.ts` typed API, `lib/motion.ts`) |
| `assets/icon.svg`, `icon-small.svg` | The app icon (the small one is drawn for 16–32 px) |
| `scripts/smoke_test.py` | Run the engine on images without the UI |
| `scripts/evaluate.py` | False-positive rate and mask coverage on clean vs synthetic-watermarked images |

Motion: entrances use HeroUI's own curves (`--ease-out-quint`, `--ease-in-out-quart`), only transform, opacity,
filter and clip-path animate, views animate when their content changes but not when a tab is switched, and
`prefers-reduced-motion` keeps the fades and drops the movement. The batch list uses Motion for exits and reflow.

## Build the installer

```bat
.venv\Scripts\python build.py
```

Builds the UI, packs `assets/icons/*.png` into `assets/unmark.ico`, freezes the app with PyInstaller into
`dist\Unmark\`, smoke-tests `Unmark.exe --smoke-test` (it removes a synthetic watermark on the GPU, no window), then
compiles `installer\Unmark.iss` with Inno Setup 6.5+ into `dist\Unmark-<version>-setup.exe`. The installer holds
the CUDA build of torch (a few GB); models still download on first launch. `--icons` re-renders the icon PNGs
from the SVGs first (`npm --prefix frontend run icons`), `--no-installer` stops after the app folder.
