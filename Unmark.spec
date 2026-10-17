# PyInstaller spec for Unmark.exe, or Unmark on Linux (folder build). Normally run through build.py.
# Direct use: pyinstaller Unmark.spec
import os
import sys

from PyInstaller.utils.hooks import collect_all, collect_submodules, copy_metadata

ROOT = SPECPATH
VENDOR = os.path.join(ROOT, "vendor", "rem-wm")  # rem-wm's lama_cleaner package
VERSION_FILE = os.path.join(ROOT, "build", "version_info.txt")
ICON = os.path.join(ROOT, "assets", "unmark.ico")
WINDOWS = sys.platform == "win32"

datas = [
    (os.path.join(ROOT, "frontend", "dist"), os.path.join("frontend", "dist")),
    (ICON, "assets"),
]
binaries, hiddenimports = [], []
# Linux: the window icon is a PNG, and pywebview's Qt backend (PyQt6 + QtWebEngine) is picked at run time.
if not WINDOWS:
    datas.append((os.path.join(ROOT, "assets", "icons", "icon-256.png"), os.path.join("assets", "icons")))
    hiddenimports.append("webview.platforms.qt")

# Florence-2's model code is downloaded at run time (trust_remote_code), so PyInstaller can't see
# what it imports: timm and einops, plus classes transformers only resolves by name (the BART
# tokenizer, the CLIP image processor, the Auto* factories).
for package in ("timm", "einops", "hf_xet"):
    d, b, h = collect_all(package)
    datas, binaries, hiddenimports = datas + d, binaries + b, hiddenimports + h
KEEP_MODELS = {"auto", "bart", "clip"}
hiddenimports += collect_submodules(
    "transformers",
    filter=lambda name: not name.startswith("transformers.models.") or name.split(".")[2] in KEEP_MODELS,
)
hiddenimports += collect_submodules("lama_cleaner.model", filter=lambda name: name.endswith((".lama", ".base", ".utils")))

# transformers checks its dependencies' versions through package metadata at import.
for dist in ("transformers", "tokenizers", "huggingface_hub", "safetensors", "tqdm", "regex", "requests",
             "packaging", "filelock", "numpy", "pyyaml", "torch", "timm", "pillow"):
    datas += copy_metadata(dist)

a = Analysis(
    [os.path.join(ROOT, "Unmark.py")],
    pathex=[ROOT, VENDOR],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    excludes=["tkinter", "matplotlib", "IPython", "pytest", "PyQt5", "PySide6", "gradio",
              "diffusers", "flash_attn", "triton", "tensorboard", "torch.utils.tensorboard"]
             + (["PyQt6"] if WINDOWS else []),
    # Keep .py sources next to the bytecode: torch/timm use TorchScript, which reads source.
    module_collection_mode={"torch": "pyz+py", "torchvision": "pyz+py", "timm": "pyz+py"},
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz, a.scripts, [],
    exclude_binaries=True,
    name="Unmark",
    console=False,
    icon=ICON if WINDOWS else None,
    upx=False,
    version=VERSION_FILE if WINDOWS and os.path.exists(VERSION_FILE) else None,
)
coll = COLLECT(exe, a.binaries, a.datas, name="Unmark", upx=False)
