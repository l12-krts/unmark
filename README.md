# Unmark

![assets/icons/icon-256.png](https://github.com/l12-krts/unmark/blob/c22ebe5b6ad143b700f2b2eed97fe4cb8e21cfcb/assets/icons/icon-256.png?raw=true)

Remove watermarks from one image or a whole folder.

The removal pipeline is [rem-wm](https://github.com/Damarcreative/rem-wm) (vendored in `vendor/rem-wm`):

## Setup

Needs Python 3.12, Node 20+, and an NVIDIA GPU for reasonable speed (it falls back to the CPU, slowly).

```powershell
powershell -ExecutionPolicy Bypass -File setup.ps1
```

That creates `.venv` with CUDA torch, installs the packages, and builds the UI. The first launch downloads the
models (~1.7 GB: Florence-2-large from Hugging Face, big-lama from GitHub) into the usual Hugging Face / torch caches.

## Run

```bat
run.bat
```

- **Single**: open or drop an image, *Remove watermark*, drag the before/after slider, toggle *Show mask* to see what was
  painted out, *Save…*.
- **Batch**: add images or a folder (or drop them), pick the output folder (default: an `unmarked` folder next to the
  images), *Remove from N images*. Originals are never touched. Click the eye on a row to compare.
- **Drawn regions**: mark what detection misses with **Box** (drag) or **Brush** (paint, with a size slider). Click a
  box to select it; Delete removes it, Ctrl+Z undoes. Drawn regions are removed together with whatever detection
  finds; set Detection to **Manual** to remove only what you draw. In Single, *Edit regions* goes back from a result;
  in Batch, *Draw…* sets regions once for every image (stored as relative positions, so they suit sets with the mark
  in a fixed place; flip through the images in that window to check).
- Dropping several images on the Single tab moves them to Batch. Ctrl+O opens, Ctrl+S saves.

## Settings

| Setting | What it does |
| --- | --- |
| Look for | The text prompt Florence-2 searches for: `watermark`, `logo`, `text`, `signature`… |
| Detection | **Boxes** (default): Florence-2 open-vocabulary detection, filled rectangles. Fast (~0.3 s) and covers the whole mark. **Outline**: rem-wm's original `<REGION_TO_SEGMENTATION>` polygons. Tighter, but several seconds per image and it can spill into the picture. **Manual**: no detection, only drawn regions. |
| Grow mask | Dilates the mask so soft edges and drop shadows go too. |
| Fill | **Detail** (default): LaMa at full resolution around each mark. **Fast (rem-wm)**: rem-wm's own config, inpaints at 200 px and scales back up (soft on big images). **Whole image**: full frame at full resolution. |
| Detector model | Florence-2 Large (rem-wm's default) or Base (lighter, quicker). |

Settings persist in `%APPDATA%\Unmark\settings.json`.

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

## Build the installer

```bat
.venv\Scripts\python build.py
```

Builds the UI, packs `assets/icons/*.png` into `assets/unmark.ico`, freezes the app with PyInstaller into
`dist\Unmark\`, smoke-tests `Unmark.exe --smoke-test` (it removes a synthetic watermark on the GPU, no window), then
compiles `installer\Unmark.iss` with Inno Setup 6.5+ into `dist\Unmark-<version>-setup.exe`. The installer holds
the CUDA build of torch (a few GB); models still download on first launch. `--icons` re-renders the icon PNGs
from the SVGs first (`npm --prefix frontend run icons`), `--no-installer` stops after the app folder.

On Linux, `.venv/bin/python build.py` builds `dist/Unmark/Unmark` (the window is pywebview's Qt backend, from
`requirements.txt`) and packs it into `dist/Unmark-<version>-linux-x64.tar.xz` instead of an installer.

## Release

`.github/workflows/release.yml` builds both on GitHub Actions, smoke-tests them, and publishes a new release with the
installer and the Linux archive. Bump `__version__` in `app/__init__.py`, then push the matching tag:

```bash
git tag v1.1.0 && git push origin v1.1.0
```

or run *Release* from the Actions tab, which tags `v<__version__>` itself. Files over GitHub's 2 GiB limit go up in
parts (`.part00`, `.part01`…; the release notes say how to join them).
