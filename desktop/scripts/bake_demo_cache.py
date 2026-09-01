#!/usr/bin/env python3
"""Bake pre-computed demo caches into demo_datasets for fast agent preload.

Run during installer build (after pip deps are installed) or manually:

  python desktop/scripts/bake_demo_cache.py \\
    --demo-root demo_datasets \\
    --dtl-project tools/dtl
"""
from __future__ import annotations

import argparse
import io
import json
import os
import shutil
import sys
from pathlib import Path


def bake_retest(demo_root: Path) -> None:
    retest_dir = Path(__file__).resolve().parents[2] / "tools" / "retest_reduction"
    sys.path.insert(0, str(retest_dir))
    os.environ["VERILUMEN_DEMO_DATASETS"] = str(demo_root.resolve())

    import pandas as pd

    from retest_ai.api.routes import (
        ATE_COST_PER_HOUR,
        TARGET_COL,
        _demo_datasets_root,
        _validate_predictions_with_outcomes,
    )
    from retest_ai.models.service import MLService

    pre_path = demo_root / "retest" / "ATE_Retest_Pre_Retest_Upload_Dataset_200_Events_Unique.xlsx"
    post_path = demo_root / "retest" / "post_retest_synthetic_validation_119_events.xlsx"
    if not pre_path.is_file() or not post_path.is_file():
        print(f"SKIP retest cache: missing xlsx under {demo_root / 'retest'}")
        return

    ml_service = MLService.get_instance()
    with open(pre_path, "rb") as handle:
        df_scored = ml_service.load_and_predict_pre_retest_workbook(io.BytesIO(handle.read()))
    cost_impact = ml_service.get_cost_impact(df_scored, cost_per_hour=ATE_COST_PER_HOUR)
    with open(post_path, "rb") as handle:
        df_outcomes = pd.read_excel(io.BytesIO(handle.read()), sheet_name=0)
    validation = _validate_predictions_with_outcomes(df_scored, df_outcomes)

    payload = {
        "demo": True,
        "records": df_scored.to_dict(orient="records"),
        "cost_impact": cost_impact,
        "filename": pre_path.name,
        "total_events": len(df_scored),
        "total_devices": int(df_scored["Device_ID"].nunique()) if "Device_ID" in df_scored.columns else 0,
        "validation": validation,
        "outcomes_loaded": True,
        "prediction_source_label": "Demo pre-retest dataset (200 events)",
    }

    from retest_ai.demo_cache import save_demo_response_cache

    out = save_demo_response_cache(Path(_demo_datasets_root()), payload)
    print(f"OK retest demo cache -> {out} ({out.stat().st_size} bytes)")


def bake_dtl(demo_root: Path, dtl_project: Path) -> None:
    src = dtl_project / "src"
    sys.path.insert(0, str(src))
    os.environ["VERILUMEN_DEMO_DATASETS"] = str(demo_root.resolve())
    os.environ["DTL_PROJECT_ROOT"] = str(dtl_project.resolve())

    from dtl_agent.api.upload_analysis import create_upload_analysis_session

    demo_dtl = demo_root / "dtl"
    files = {
        "january": ("dtl_input_2026_01.zip", (demo_dtl / "dtl_input_2026_01.zip").read_bytes()),
        "february": ("dtl_input_2026_02.zip", (demo_dtl / "dtl_input_2026_02.zip").read_bytes()),
        "march": ("dtl_input_2026_03.zip", (demo_dtl / "dtl_input_2026_03.zip").read_bytes()),
    }
    if not all((demo_dtl / name).is_file() for name in (
        "dtl_input_2026_01.zip",
        "dtl_input_2026_02.zip",
        "dtl_input_2026_03.zip",
    )):
        print(f"SKIP dtl cache: missing zips under {demo_dtl}")
        return

    sess, provenance = create_upload_analysis_session(files=files, source_root=dtl_project)
    cache_root = demo_root / "dtl" / "cache"
    sandbox_dst = cache_root / "sandbox"
    if sandbox_dst.exists():
        shutil.rmtree(sandbox_dst)
    shutil.copytree(sess.root, sandbox_dst)

    from dtl_agent.data.temporal.paths import temporal_artifact_root

    month_mappings = {}
    marker = temporal_artifact_root(sess.root) / "shared" / "upload_session.json"
    if marker.is_file():
        month_mappings = json.loads(marker.read_text(encoding="utf-8")).get("month_mappings") or {}

    meta = {
        "source_files": sess.source_files,
        "month_mappings": month_mappings,
        "provenance": provenance,
        "data_provenance": "Analysis generated from uploaded test data (demo cache)",
    }
    cache_root.mkdir(parents=True, exist_ok=True)
    meta_path = cache_root / "session_meta.json"
    meta_path.write_text(json.dumps(meta, indent=2, default=str), encoding="utf-8")

    from dtl_agent.api.analysis_session import delete_session

    delete_session(sess.analysis_session_id)
    print(f"OK dtl demo cache -> {sandbox_dst} + {meta_path}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Bake demo caches for Retest and DTL")
    parser.add_argument("--demo-root", type=Path, required=True)
    parser.add_argument("--dtl-project", type=Path, required=True)
    parser.add_argument("--skip-retest", action="store_true")
    parser.add_argument("--skip-dtl", action="store_true")
    args = parser.parse_args()
    demo_root = args.demo_root.resolve()
    if not demo_root.is_dir():
        raise SystemExit(f"demo-root not found: {demo_root}")

    if not args.skip_retest:
        bake_retest(demo_root)
    if not args.skip_dtl:
        bake_dtl(demo_root, args.dtl_project.resolve())


if __name__ == "__main__":
    main()
