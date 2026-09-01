"""Disk cache for Retest demo analysis API responses."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any


def _root(demo_datasets_root: Path | str) -> Path:
    return demo_datasets_root if isinstance(demo_datasets_root, Path) else Path(demo_datasets_root)


def demo_cache_path(demo_datasets_root: Path | str) -> Path:
    return _root(demo_datasets_root) / "retest" / "cache" / "demo_response.json"


def load_demo_response_cache(demo_datasets_root: Path | str) -> dict[str, Any] | None:
    path = demo_cache_path(demo_datasets_root)
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, dict) and data.get("records"):
            out = dict(data)
            out["demo"] = True
            out["demo_cached"] = True
            return out
    except (json.JSONDecodeError, OSError):
        return None
    return None


def save_demo_response_cache(demo_datasets_root: Path | str, payload: dict[str, Any]) -> Path:
    path = demo_cache_path(demo_datasets_root)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")
    return path


def demo_datasets_root_from_env() -> Path | None:
    env = os.environ.get("VERILUMEN_DEMO_DATASETS", "").strip()
    if env and Path(env).is_dir():
        return Path(env).resolve()
    return None
