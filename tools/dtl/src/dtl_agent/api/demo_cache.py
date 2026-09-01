"""Pre-baked demo analysis session cache for instant presentation loads."""

from __future__ import annotations

import json
import os
import shutil
import tempfile
import uuid
from pathlib import Path
from typing import Any

from dtl_agent.api.analysis_session import register_session, update_job_status
from dtl_agent.data.temporal.paths import temporal_artifact_root
from dtl_agent.ml.phase12_9_analysis import MONTHS


def demo_cache_dir(demo_datasets_root: Path) -> Path:
    return demo_datasets_root / "dtl" / "cache"


def demo_cache_ready(demo_datasets_root: Path) -> bool:
    root = demo_cache_dir(demo_datasets_root)
    return (root / "sandbox").is_dir() and (root / "session_meta.json").is_file()


def restore_demo_session_from_cache(demo_datasets_root: Path) -> dict[str, Any] | None:
    """Clone pre-baked sandbox into a new session; return API payload or None if cache missing."""
    cache_root = demo_cache_dir(demo_datasets_root)
    sandbox_src = cache_root / "sandbox"
    meta_path = cache_root / "session_meta.json"
    if not sandbox_src.is_dir() or not meta_path.is_file():
        return None

    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    sandbox = Path(tempfile.mkdtemp(prefix="dtl_demo_cache_"))
    shutil.copytree(sandbox_src, sandbox, dirs_exist_ok=True)

    analysis_session_id = str(uuid.uuid4())
    source_files = dict(meta.get("source_files") or {})
    month_mappings = dict(meta.get("month_mappings") or {})
    provenance = dict(meta.get("provenance") or {})

    register_session(
        sandbox,
        months=tuple(MONTHS),
        source_files=source_files,
        provenance=provenance,
        session_id=analysis_session_id,
    )

    marker_path = temporal_artifact_root(sandbox) / "shared" / "upload_session.json"
    if marker_path.is_file():
        marker = json.loads(marker_path.read_text(encoding="utf-8"))
        marker["analysis_session_id"] = analysis_session_id
        marker["month_mappings"] = month_mappings
        marker_path.write_text(json.dumps(marker, indent=2), encoding="utf-8")

    result_meta = {
        "months": list(MONTHS),
        "used_uploaded_measurements": True,
        "used_static_three_month_measurements": False,
        "source_files": source_files,
        "month_mappings": month_mappings,
        "primary_die": provenance.get("primary_die"),
        "scorable_parameters": provenance.get("scorable_parameters"),
        "data_provenance": meta.get("data_provenance")
        or "Analysis generated from uploaded test data (demo cache)",
    }
    update_job_status(
        analysis_session_id,
        status="completed",
        stage="Ready",
        progress_pct=100,
        result_meta=result_meta,
    )

    return {
        "analysis_session_id": analysis_session_id,
        "status": "completed",
        "stage": "Ready",
        "progress_pct": 100,
        "months": list(MONTHS),
        "used_uploaded_measurements": True,
        "used_static_three_month_measurements": False,
        "source_files": source_files,
        "month_mappings": month_mappings,
        "data_provenance": result_meta["data_provenance"],
        "demo": True,
        "demo_cached": True,
    }


def demo_datasets_root_from_env() -> Path | None:
    env = os.environ.get("VERILUMEN_DEMO_DATASETS", "").strip()
    if env and Path(env).is_dir():
        return Path(env).resolve()
    return None
