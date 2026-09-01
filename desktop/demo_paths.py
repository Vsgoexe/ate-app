"""Resolve bundled demo dataset root for packaged and dev runs."""
from __future__ import annotations

import os
from pathlib import Path


def demo_datasets_root() -> Path:
    env = os.environ.get("VERILUMEN_DEMO_DATASETS", "").strip()
    if env:
        p = Path(env)
        if p.is_dir():
            return p.resolve()

    verilumen_root = os.environ.get("VERILUMEN_ROOT", "").strip()
    if verilumen_root:
        candidate = Path(verilumen_root) / "demo_datasets"
        if candidate.is_dir():
            return candidate.resolve()

    here = Path(__file__).resolve().parent
    for base in (here.parent, here.parent.parent):
        candidate = base / "demo_datasets"
        if candidate.is_dir():
            return candidate.resolve()

    cwd = Path.cwd()
    for parent in [cwd, *cwd.parents]:
        candidate = parent / "demo_datasets"
        if candidate.is_dir():
            return candidate.resolve()

    raise FileNotFoundError(
        "demo_datasets folder not found. Set VERILUMEN_DEMO_DATASETS or place demo_datasets at repo root."
    )


def demo_file(*parts: str) -> Path:
    path = demo_datasets_root().joinpath(*parts)
    if not path.is_file():
        raise FileNotFoundError(f"Demo file not found: {path}")
    return path
