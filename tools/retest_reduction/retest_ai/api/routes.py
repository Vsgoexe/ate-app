from fastapi import APIRouter, HTTPException, status, UploadFile, File, Form, Body
from typing import List, Union, Optional, Dict, Any
import io
import os
import pandas as pd
from pydantic import BaseModel

from .schemas import (
    PreRetestEvent,
    BatchEventItem,
    BatchPredictionRequest,
    SinglePredictionResponse,
    BatchPredictionResponse,
    HealthResponse,
    ModelInfoResponse
)
from ..models.service import MLService
from ..demo_cache import load_demo_response_cache, save_demo_response_cache
from ..config.settings import (
    ALL_MODEL_FEATURES,
    IDENTIFIER_COLS,
    TARGET_COL,
    MONTH_12_OUTCOMES_FILE,
    ATE_COST_PER_HOUR,
    ATE_COST_CURRENCY,
)
from ..validation.outcome_validator import validate_recommendations_against_outcomes
from ..kpis.business_impact import (
    ESTIMATED_TIME_COL,
    calculate_time_and_cost_impact,
)


def _demo_datasets_root() -> str:
    env = os.environ.get("VERILUMEN_DEMO_DATASETS", "").strip()
    if env and os.path.isdir(env):
        return os.path.abspath(env)
    here = os.path.dirname(os.path.abspath(__file__))
    for rel in (
        "../../../../../demo_datasets",
        "../../../../demo_datasets",
        "../../../demo_datasets",
    ):
        candidate = os.path.abspath(os.path.join(here, rel))
        if os.path.isdir(candidate):
            return candidate
    raise FileNotFoundError("demo_datasets folder not found")


def _validate_predictions_with_outcomes(df_preds: pd.DataFrame, df_outcomes: pd.DataFrame) -> dict:
    keys = [c for c in IDENTIFIER_COLS if c in df_preds.columns and c in df_outcomes.columns]
    if not keys:
        raise ValueError("Cannot join outcomes: missing Device_ID or Failure_Event.")

    extra = [c for c in [TARGET_COL, "Retest_Result", "Final_Result"] if c in df_outcomes.columns]
    joined = df_preds.merge(
        df_outcomes[list(dict.fromkeys(keys + extra))],
        on=keys,
        how="inner",
        suffixes=("", "_outcome"),
    )
    if len(joined) == 0:
        raise ValueError("No matching records found between predictions and outcomes.")

    validation_kpis = validate_recommendations_against_outcomes(
        joined[TARGET_COL], joined["AI_Recommendation"], events=joined
    )

    benefit_n = int((joined["Ground_Truth"] == "RETEST_BENEFICIAL").sum())
    persist_n = int((joined["Ground_Truth"] == "PERSISTENT_FAILURE").sum())
    benefit_rate = (benefit_n / len(joined) * 100) if len(joined) else 0.0

    rec_col = joined["AI_Recommendation"].astype(str).str.strip()
    retest_devs = set(joined.loc[rec_col == "RETEST", "Device_ID"].dropna().astype(str))
    unnecessary_ev = validation_kpis.get("unnecessary_retest_events")
    if unnecessary_ev is not None and len(unnecessary_ev) > 0 and "Device_ID" in unnecessary_ev.columns:
        unnecessary_devs = set(unnecessary_ev["Device_ID"].dropna().astype(str)).intersection(retest_devs)
    else:
        unnecessary_devs = set()
    benefit_devs = retest_devs - unnecessary_devs

    unnecessary_records = (
        unnecessary_ev.to_dict(orient="records")
        if unnecessary_ev is not None and len(unnecessary_ev) > 0
        else []
    )
    beneficial_ev = joined[(rec_col == "RETEST") & (joined["Ground_Truth"] == "RETEST_BENEFICIAL")]
    beneficial_records = beneficial_ev.to_dict(orient="records")
    joined_records = joined.to_dict(orient="records")

    return {
        "kpis": {
            "accuracy": validation_kpis.get("accuracy"),
            "precision": validation_kpis.get("precision"),
            "recall": validation_kpis.get("recall"),
            "specificity": validation_kpis.get("specificity"),
            "f1": validation_kpis.get("f1"),
            "total_events": validation_kpis.get("total_events"),
            "tp": validation_kpis.get("tp"),
            "fp": validation_kpis.get("fp"),
            "fn": validation_kpis.get("fn"),
            "tn": validation_kpis.get("tn"),
            "unnecessary_retests_pct": validation_kpis.get("unnecessary_retests_pct"),
            "missed_opportunities_pct": validation_kpis.get("missed_opportunities_pct"),
            "benefit_rate_pct": round(benefit_rate, 2),
            "benefit_events_count": benefit_n,
            "benefit_devices_count": len(benefit_devs),
            "unnecessary_devices_count": len(unnecessary_devs),
        },
        "unnecessary_events": unnecessary_records,
        "beneficial_events": beneficial_records,
        "joined_records": joined_records,
    }

router = APIRouter()

@router.get("/health", response_model=HealthResponse)
def get_health():
    """Service health check endpoint."""
    return {
        "status": "ok",
        "service": "ATE Retest-Benefit Prediction AI"
    }

@router.get("/model/info", response_model=ModelInfoResponse)
def get_model_info():
    """Retrieve active model information, feature whitelist, and training metadata."""
    ml_service = MLService.get_instance()
    return ml_service.get_model_info()

@router.get("/datasets/single-event-options")
def get_single_event_options():
    """Returns available devices and their events from the Month 12 dataset."""
    ml_service = MLService.get_instance()
    df_m12 = ml_service.datasets["month_12"].copy()
    records = df_m12.to_dict(orient="records")
    dev_list = sorted(df_m12["Device_ID"].dropna().unique().tolist())
    return {
        "devices": dev_list,
        "events": records,
        "features": ALL_MODEL_FEATURES
    }

@router.post("/predict", response_model=SinglePredictionResponse)
def predict_single_event(event: PreRetestEvent):
    """
    Generate P(RETEST_BENEFICIAL) and a DOCX-reference recommendation
    for a single pre-retest failure event.
    """
    ml_service = MLService.get_instance()
    try:
        result = ml_service.predict_single_event(event.model_dump())
        return result
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(ve)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Prediction error: {str(e)}"
        )

@router.post("/predict/single-with-shap")
def predict_single_with_shap(event: Dict[str, Any]):
    """
    Single event prediction with SHAP explainability.
    Direct pure wrapper around MLService.predict_single_event and ModelExplainer.explain_instance.
    """
    ml_service = MLService.get_instance()
    try:
        event_clean = {k: v for k, v in event.items() if k in ALL_MODEL_FEATURES or k in IDENTIFIER_COLS}
        input_dict = {k: v for k, v in event_clean.items() if k in ALL_MODEL_FEATURES}
        if "Device_ID" in event_clean:
            input_dict["Device_ID"] = event_clean["Device_ID"]
        if "Failure_Event" in event_clean:
            input_dict["Failure_Event"] = int(event_clean["Failure_Event"])

        pred_res = ml_service.predict_single_event(input_dict)
        event_df = pd.DataFrame([event_clean])
        explanation = ml_service.explainer.explain_instance(event_df)

        expected_val = None
        if hasattr(ml_service.explainer, "explainer") and hasattr(ml_service.explainer.explainer, "expected_value"):
            ev = ml_service.explainer.explainer.expected_value
            if isinstance(ev, (list, tuple, pd.Series)) or hasattr(ev, "__len__"):
                expected_val = float(ev[1]) if len(ev) > 1 else float(ev[0])
            else:
                expected_val = float(ev)

        return {
            "prediction": pred_res,
            "explanation": explanation,
            "expected_value": expected_val,
            "event_data": event_clean,
        }
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(ve)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Prediction and SHAP error: {str(e)}"
        )

@router.post("/predict/batch", response_model=BatchPredictionResponse)
def predict_batch_events(payload: Union[BatchPredictionRequest, List[BatchEventItem]]):
    """Generate P(RETEST_BENEFICIAL) and DOCX-reference recommendations for multiple events."""
    ml_service = MLService.get_instance()
    if isinstance(payload, BatchPredictionRequest):
        event_list = [item.model_dump() for item in payload.events]
    else:
        event_list = [item.model_dump() for item in payload]

    try:
        predictions = ml_service.predict_batch_events(event_list)
        return {"predictions": predictions}
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(ve)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Batch prediction error: {str(e)}"
        )

@router.get("/analysis/month12-batch")
def get_month12_batch(cost_per_hour: float = ATE_COST_PER_HOUR):
    """
    Returns the scored Month 12 batch dataset with cost impact and overview counts.
    Pure pass-through to MLService.get_month_12_batch_table() and MLService.get_cost_impact().
    """
    ml_service = MLService.get_instance()
    df_m12 = ml_service.get_month_12_batch_table()
    cost_impact = ml_service.get_cost_impact(df_m12, cost_per_hour=cost_per_hour)
    records = df_m12.to_dict(orient="records")
    return {
        "records": records,
        "cost_impact": cost_impact,
        "total_events": len(df_m12),
        "total_devices": int(df_m12["Device_ID"].nunique()) if "Device_ID" in df_m12.columns else 0
    }

@router.post("/analysis/upload-pre-retest")
async def upload_pre_retest(file: UploadFile = File(...), cost_per_hour: float = Form(ATE_COST_PER_HOUR)):
    """
    Processes an uploaded pre-retest XLSX file.
    Pure pass-through to MLService.load_and_predict_pre_retest_workbook().
    """
    ml_service = MLService.get_instance()
    try:
        content = await file.read()
        buf = io.BytesIO(content)
        df_scored = ml_service.load_and_predict_pre_retest_workbook(buf)
        cost_impact = ml_service.get_cost_impact(df_scored, cost_per_hour=cost_per_hour)
        records = df_scored.to_dict(orient="records")
        return {
            "records": records,
            "cost_impact": cost_impact,
            "filename": file.filename,
            "total_events": len(df_scored),
            "total_devices": int(df_scored["Device_ID"].nunique()) if "Device_ID" in df_scored.columns else 0
        }
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(ve)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Upload error: {str(e)}"
        )

@router.post("/analysis/demo/load")
def load_demo_analysis(cost_per_hour: float = ATE_COST_PER_HOUR):
    """Load bundled 200-event pre-retest + 119-event post-retest demo datasets."""
    demo_root = _demo_datasets_root()
    cached = load_demo_response_cache(demo_root)
    if cached is not None:
        if cost_per_hour != ATE_COST_PER_HOUR and cached.get("records"):
            ml_service = MLService.get_instance()
            import pandas as pd

            df = pd.DataFrame(cached["records"])
            cached = dict(cached)
            cached["cost_impact"] = ml_service.get_cost_impact(df, cost_per_hour=cost_per_hour)
        return cached

    ml_service = MLService.get_instance()
    pre_path = os.path.join(
        demo_root,
        "retest",
        "ATE_Retest_Pre_Retest_Upload_Dataset_200_Events_Unique.xlsx",
    )
    post_path = os.path.join(
        demo_root,
        "retest",
        "post_retest_synthetic_validation_119_events.xlsx",
    )
    if not os.path.isfile(pre_path):
        raise HTTPException(status_code=404, detail=f"Demo pre-retest file not found: {pre_path}")
    if not os.path.isfile(post_path):
        raise HTTPException(status_code=404, detail=f"Demo outcomes file not found: {post_path}")

    try:
        with open(pre_path, "rb") as handle:
            df_scored = ml_service.load_and_predict_pre_retest_workbook(io.BytesIO(handle.read()))
        cost_impact = ml_service.get_cost_impact(df_scored, cost_per_hour=cost_per_hour)
        records = df_scored.to_dict(orient="records")

        with open(post_path, "rb") as handle:
            df_outcomes = pd.read_excel(io.BytesIO(handle.read()), sheet_name=0)
        if TARGET_COL not in df_outcomes.columns:
            raise ValueError(f"Demo outcomes workbook must contain '{TARGET_COL}'.")
        ml_service.month_12_outcomes = df_outcomes

        validation = _validate_predictions_with_outcomes(df_scored, df_outcomes)

        payload = {
            "demo": True,
            "records": records,
            "cost_impact": cost_impact,
            "filename": os.path.basename(pre_path),
            "total_events": len(df_scored),
            "total_devices": int(df_scored["Device_ID"].nunique()) if "Device_ID" in df_scored.columns else 0,
            "validation": validation,
            "outcomes_loaded": True,
            "prediction_source_label": "Demo pre-retest dataset (200 events)",
        }
        try:
            save_demo_response_cache(demo_root, payload)
        except OSError:
            pass
        return payload
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(ve)) from ve
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Demo load error: {str(e)}",
        ) from e

@router.post("/analysis/validate-outcomes")
async def validate_outcomes(
    file: Optional[UploadFile] = File(None),
    use_local_file: bool = Form(False),
    predictions: str = Form(...)
):
    """
    Validates active predictions against uploaded outcomes or local private outcomes.
    Pure pass-through to MLService.load_month_12_outcomes() and validate_recommendations_against_outcomes().
    """
    ml_service = MLService.get_instance()
    import json
    try:
        preds_list = json.loads(predictions)
        df_preds = pd.DataFrame(preds_list)
        if len(df_preds) == 0:
            raise ValueError("Predictions dataframe is empty.")

        if use_local_file:
            df_outcomes = ml_service.load_month_12_outcomes()
        elif file is not None:
            content = await file.read()
            buf = io.BytesIO(content)
            df_outcomes = pd.read_excel(buf, sheet_name=0)
            if TARGET_COL not in df_outcomes.columns:
                raise ValueError(f"Uploaded outcomes workbook must contain '{TARGET_COL}'.")
            ml_service.month_12_outcomes = df_outcomes
        else:
            raise ValueError("No outcome file provided.")

        keys = [c for c in IDENTIFIER_COLS if c in df_preds.columns and c in df_outcomes.columns]
        if not keys:
            raise ValueError("Cannot join outcomes: missing Device_ID or Failure_Event.")

        extra = [c for c in [TARGET_COL, "Retest_Result", "Final_Result"] if c in df_outcomes.columns]
        joined = df_preds.merge(
            df_outcomes[list(dict.fromkeys(keys + extra))],
            on=keys,
            how="inner",
            suffixes=("", "_outcome")
        )

        if len(joined) == 0:
            raise ValueError("No matching records found between predictions and outcomes.")

        validation_kpis = validate_recommendations_against_outcomes(
            joined[TARGET_COL], joined["AI_Recommendation"], events=joined
        )

        benefit_n = int((joined["Ground_Truth"] == "RETEST_BENEFICIAL").sum())
        persist_n = int((joined["Ground_Truth"] == "PERSISTENT_FAILURE").sum())
        benefit_rate = (benefit_n / len(joined) * 100) if len(joined) else 0.0

        rec_col = joined["AI_Recommendation"].astype(str).str.strip()
        retest_devs = set(joined.loc[rec_col == "RETEST", "Device_ID"].dropna().astype(str))
        unnecessary_ev = validation_kpis.get("unnecessary_retest_events")
        if unnecessary_ev is not None and len(unnecessary_ev) > 0 and "Device_ID" in unnecessary_ev.columns:
            unnecessary_devs = set(unnecessary_ev["Device_ID"].dropna().astype(str)).intersection(retest_devs)
        else:
            unnecessary_devs = set()
        benefit_devs = retest_devs - unnecessary_devs

        unnecessary_records = unnecessary_ev.to_dict(orient="records") if unnecessary_ev is not None and len(unnecessary_ev) > 0 else []
        beneficial_ev = joined[(rec_col == "RETEST") & (joined["Ground_Truth"] == "RETEST_BENEFICIAL")]
        beneficial_records = beneficial_ev.to_dict(orient="records")

        joined_records = joined.to_dict(orient="records")

        return {
            "kpis": {
                "accuracy": validation_kpis.get("accuracy"),
                "precision": validation_kpis.get("precision"),
                "recall": validation_kpis.get("recall"),
                "specificity": validation_kpis.get("specificity"),
                "f1": validation_kpis.get("f1"),
                "total_events": validation_kpis.get("total_events"),
                "tp": validation_kpis.get("tp"),
                "fp": validation_kpis.get("fp"),
                "fn": validation_kpis.get("fn"),
                "tn": validation_kpis.get("tn"),
                "unnecessary_retests_pct": validation_kpis.get("unnecessary_retests_pct"),
                "missed_opportunities_pct": validation_kpis.get("missed_opportunities_pct"),
                "benefit_rate_pct": round(benefit_rate, 2),
                "benefit_events_count": benefit_n,
                "benefit_devices_count": len(benefit_devs),
                "unnecessary_devices_count": len(unnecessary_devs),
            },
            "unnecessary_events": unnecessary_records,
            "beneficial_events": beneficial_records,
            "joined_records": joined_records,
        }
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(ve)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Validation error: {str(e)}"
        )

@router.get("/analysis/historical-validation")
def get_historical_validation():
    """
    Returns historical temporal validation results (Month 0 train / Month 6 holdout),
    model comparison table, radar chart metrics, calibration bucket table,
    reporting cutoff metrics, and holdout 2x2 confusion matrix KPIs.
    Pure pass-through to MLService.comparison_results and MLService.get_historical_decision_kpis().
    """
    ml_service = MLService.get_instance()
    comp = ml_service.comparison_results
    hist_kpis = ml_service.get_historical_decision_kpis()
    hist_table = ml_service.get_historical_validation_table()

    models_data = {}
    for name, res in comp["results"].items():
        models_data[name] = {
            "calibrated_metrics": res["calibrated_metrics"],
            "calibration_diagnostics": res.get("calibrated_calibration", {}),
            "reporting_cutoff_metrics": res.get("calibrated_metrics_reporting_cutoff"),
        }

    return {
        "best_model_name": comp["best_model_name"],
        "selection_reason": comp.get("selection_reason", ""),
        "comparison_table": comp["comparison_table"].to_dict(orient="records"),
        "models": models_data,
        "historical_holdout_kpis": {
            "accuracy": hist_kpis.get("accuracy"),
            "precision": hist_kpis.get("precision"),
            "recall": hist_kpis.get("recall"),
            "specificity": hist_kpis.get("specificity"),
            "f1": hist_kpis.get("f1"),
            "tp": hist_kpis.get("tp"),
            "fp": hist_kpis.get("fp"),
            "fn": hist_kpis.get("fn"),
            "tn": hist_kpis.get("tn"),
            "total_events": hist_kpis.get("total_events"),
            "unnecessary_retests_pct": hist_kpis.get("unnecessary_retests_pct"),
            "missed_opportunities_pct": hist_kpis.get("missed_opportunities_pct"),
        },
        "holdout_records_sample": hist_table.head(10).to_dict(orient="records")
    }

@router.get("/analysis/reference-audit")
def get_reference_audit():
    """
    Returns reference report DOCX audit KPIs recomputed from the AI dataset.
    Pure pass-through to MLService.get_reference_report_kpis().
    """
    ml_service = MLService.get_instance()
    audit_kpis = ml_service.get_reference_report_kpis()
    return {
        "recomputed_kpis": audit_kpis,
        "docx_reference_values": {
            "accuracy": 0.704,
            "retest_decision_threshold": 0.30,
            "policy_label": "Reference / DOCX decision policy — subject to validation",
            "total_events": 125,
        }
    }

@router.get("/online-learning/status")
def get_online_learning_status():
    """Returns RLS online learning status. Pure pass-through to MLService.get_online_learning_status()."""
    ml_service = MLService.get_instance()
    return ml_service.get_online_learning_status()

class OnlineLearnRequest(BaseModel):
    validated_events: List[Dict[str, Any]]

@router.post("/online-learning/learn")
def learn_from_validated_outcomes(payload: OnlineLearnRequest):
    """
    Updates the RLS online calibrator with approved post-retest outcomes.
    Pure pass-through to MLService.update_from_validated_outcomes().
    """
    ml_service = MLService.get_instance()
    df_val = pd.DataFrame(payload.validated_events)
    res = ml_service.update_from_validated_outcomes(df_val)
    return res

@router.post("/online-learning/reset")
def reset_online_learning():
    """Resets RLS online calibrator. Pure pass-through to MLService.reset_online_learning()."""
    ml_service = MLService.get_instance()
    return ml_service.reset_online_learning()

class CostImpactRequest(BaseModel):
    events: List[Dict[str, Any]]
    cost_per_hour: float = ATE_COST_PER_HOUR

@router.post("/cost-impact")
def calculate_cost_impact_endpoint(payload: CostImpactRequest):
    """
    Calculates tester time and cost impact for given events and tester rate.
    PURE PASS-THROUGH WRAPPER: Calls existing calculate_time_and_cost_impact via MLService.get_cost_impact().
    """
    ml_service = MLService.get_instance()
    df = pd.DataFrame(payload.events)
    res = ml_service.get_cost_impact(df, cost_per_hour=payload.cost_per_hour)
    return res
