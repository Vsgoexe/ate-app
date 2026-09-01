from fastapi import FastAPI, File, Form, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import asyncio
import datetime
import random

app = FastAPI(title="ATE Intelligence Local Backend", version="1.0.0")

# credentials=True + allow_origins=["*"] is rejected by browsers (CORS).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mock Data Generators
def generate_die_grid(wafer_id: str, total_dies: int = 196):
    grid = []
    size = int(total_dies ** 0.5)
    for row in range(size):
        for col in range(size):
            # Circular wafer die filter
            center = size / 2
            dist = ((row - center) ** 2 + (col - center) ** 2) ** 0.5
            if dist > center:
                continue
            
            rand = random.random()
            if rand > 0.15:
                res = "pass"
            elif rand > 0.08:
                res = "retest"
            elif rand > 0.03:
                res = "fail"
            else:
                res = "reclass"
                
            grid.append({
                "die_id": f"DIE-{row:02d}-{col:02d}",
                "wafer_id": wafer_id,
                "x": col,
                "y": row,
                "row": row,
                "column": col,
                "result": res,
                "bin": res,
                "fail_code": "FREQ_MARGIN" if res == "fail" else None,
                "test_time_ms": random.randint(45, 120),
                "confidence": round(random.uniform(0.85, 0.99), 2),
                "timestamp": datetime.datetime.now().isoformat()
            })
    return grid

MOCK_WAFERS = {
    "WFR-9082": {
        "wafer_id": "WFR-9082",
        "lot_id": "LOT-2026-A1",
        "status": "COMPLETED",
        "yield_pct": 94.2,
        "total_dies": 180,
        "tested_dies": 180,
        "caption": "Lot 2026-A1 - Wafer 12 (300mm Silicon)",
        "bin_counts": {"pass": 169, "retest": 6, "fail": 4, "reclass": 1},
        "pass_count": 169,
        "fail_count": 4,
        "retest_count": 6,
        "reclass_count": 1,
        "updated_at": datetime.datetime.now().isoformat()
    }
}

MOCK_DIES = {
    "WFR-9082": generate_die_grid("WFR-9082", 225)
}

def _now() -> str:
    return datetime.datetime.now().isoformat()


def _kpi(id_, name, value, unit, baseline, target, previous, trend="up", status="on_track", spark=None, description=""):
    series = spark or [baseline, value]
    history = [
        {
            "timestamp": (datetime.datetime.now() - datetime.timedelta(hours=len(series) - i)).isoformat(),
            "value": v,
            "index": i,
        }
        for i, v in enumerate(series)
    ]
    return {
        "id": id_,
        "name": name,
        "title": name,
        "value": value,
        "unit": unit,
        "baseline": baseline,
        "target": target,
        "previous_value": previous,
        "improvement": round(value - previous, 2),
        "trend": trend,
        "status": status,
        "spark": series,
        "series": series,
        "description": description,
        "timestamp": _now(),
        "history": history,
    }


MOCK_KPIS = [
    _kpi("retest_reduction", "Retest Reduction", 22.4, "%", 0, 25, 19.1,
         spark=[8, 12, 15, 18, 20, 21.5, 22.4],
         description="XGBoost retest-benefit recommendations"),
    _kpi("m_bist_shmoo", "SHMOO ML-Based Optimization", 96.4, "%", 90, 98, 94.8,
         spark=[90, 91.5, 93, 94.2, 95.1, 95.8, 96.4],
         description="LightGBM Shmoo classification + RANSAC boundary"),
    _kpi("test_time_reduction", "Test Time Optimization", 18.5, "%", 100, 80, 16.2,
         spark=[100, 94, 90, 86, 84, 82.5, 81.5],
         description="LSTM pattern selection test cycle speedup"),
    _kpi("false_failure_reduction", "False Failure Reduction", 42.1, "%", 0, 50, 38.0,
         status="on_track", spark=[10, 18, 25, 30, 36, 40, 42.1],
         description="Dynamic guardband Cpk tuning"),
    _kpi("yield_improvement", "Yield Improvement", 3.8, "%", 91.2, 95.0, 3.2,
         spark=[91.2, 92.0, 92.5, 93.1, 93.8, 94.2, 95.0],
         description="AI adaptive limit optimization yield gain"),
    _kpi("escape_prevention", "Escape Prevention", 99.1, "%", 97.0, 99.5, 98.6,
         spark=[97.0, 97.4, 97.9, 98.3, 98.6, 98.9, 99.1],
         description="Marginal-die escape screening"),
    _kpi("pattern_count_reduction", "Pattern Count Reduction", 31.0, "%", 0, 40, 27.5,
         spark=[10, 16, 21, 24, 27, 29, 31],
         description="Vector-memory pattern compression"),
    _kpi("shmoo_yield_analysis", "Shmoo Yield Analysis", 96.4, "%", 90, 98, 95.1),
    _kpi("shmoo_debugging", "Shmoo Debugging", 3, "", 0, 0, 4, trend="down"),
    _kpi("shmoo_binning", "Shmoo Binning", 8, "", 6, 10, 7),
    _kpi("shmoo_characterization", "Shmoo Characterization", 92.5, "%", 88, 95, 91.0),
    _kpi("vector_memory_optimization", "Vector Memory", 24.0, "%", 0, 30, 21.2),
]

MOCK_LIMITS = [
    {
        "limit_id": "LIM-VDD-01",
        "parameter": "VDD_MIN_V",
        "test_name": "Low-VDD Functional Speedpath",
        "name": "VDD Core Minimum Voltage",
        "site_id": "SITE-01",
        "tester_id": "ADV-93K-01",
        "lot_id": "LOT-2026-A1",
        "previous_limit": 0.75,
        "current_limit": 0.72,
        "delta": -0.03,
        "change_percentage": -4.0,
        "change_pct": -4.0,
        "change_label": "-0.03 V (Tightened)",
        "direction": "tightened",
        "cpk": 1.67,
        "target_cpk": 1.50,
        "confidence": 0.98,
        "reason": "Process capability Cpk = 1.67 exceeds target 1.50. Tightened limit to prevent marginal timing escapes.",
        "status": "RECOMMENDED",
        "created_at": datetime.datetime.now().isoformat(),
        "updated_at": datetime.datetime.now().isoformat()
    },
    {
        "limit_id": "LIM-FREQ-02",
        "parameter": "FMAX_GHZ",
        "test_name": "MBIST Fmax Characterization",
        "name": "Maximum Memory Frequency",
        "site_id": "SITE-02",
        "tester_id": "ADV-93K-02",
        "lot_id": "LOT-2026-A1",
        "previous_limit": 2.10,
        "current_limit": 2.25,
        "delta": 0.15,
        "change_percentage": 7.1,
        "change_pct": 7.1,
        "change_label": "+0.15 GHz (Widened)",
        "direction": "widened",
        "cpk": 1.82,
        "target_cpk": 1.50,
        "confidence": 0.95,
        "reason": "RANSAC Shmoo boundary supports higher frequency binning with 99.2% confidence.",
        "status": "ACTIVE",
        "created_at": datetime.datetime.now().isoformat(),
        "updated_at": datetime.datetime.now().isoformat()
    }
]

MOCK_EVENTS = [
    {
        "event_id": "EVT-1001",
        "event_type": "LIMIT_RECOMMENDATION",
        "timestamp": datetime.datetime.now().isoformat(),
        "tag": "info",
        "text": "Dynamic limit LIM-VDD-01 recommended tightening based on 3-month Cpk trend.",
        "lot_id": "LOT-2026-A1",
        "wafer_id": "WFR-9082",
        "tester_id": "ADV-93K-01"
    },
    {
        "event_id": "EVT-1002",
        "event_type": "SHMOO_OPTIMIZATION",
        "timestamp": datetime.datetime.now().isoformat(),
        "tag": "pass",
        "text": "Shmoo ML classifier verified Normal Pass region for Wafer WFR-9082.",
        "lot_id": "LOT-2026-A1",
        "wafer_id": "WFR-9082",
        "tester_id": "ADV-93K-02"
    }
]


def _floor_event(event_id, severity, event_type, message, seq, tester="ADV-93K-01", die_id=None):
    return {
        "event_id": event_id,
        "timestamp": datetime.datetime.now().isoformat(),
        "severity": severity,
        "event_type": event_type,
        "source": "local-ate",
        "tester_id": tester,
        "site_id": "SITE-01",
        "lot_id": "LOT-2026-A1",
        "wafer_id": "WFR-9082",
        "die_id": die_id,
        "message": message,
        "metadata": {},
        "acknowledged": False,
        "acknowledged_by": None,
        "acknowledged_at": None,
        "sequence_number": seq,
    }


MOCK_FLOOR_EVENTS = [
    _floor_event("EVT-1001", "INFO", "dynamic_limit_updated",
                 "Dynamic limit LIM-VDD-01 recommended tightening based on 3-month Cpk trend.", 1),
    _floor_event("EVT-1002", "PASS", "optimization_completed",
                 "Shmoo ML classifier verified Normal Pass region for Wafer WFR-9082.", 2, tester="ADV-93K-02"),
    _floor_event("EVT-1003", "WARN", "escape_risk_detected",
                 "Marginal timing die flagged on SITE-01 — escape screen applied.", 3, die_id="DIE-07-08"),
    _floor_event("EVT-1004", "INFO", "wafer_progress",
                 "Wafer WFR-9082 180/180 dies tested. Yield 94.2%.", 4),
]

SHMOO_LATEST: Optional[Dict[str, Any]] = None
TINY_PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01"
    b"\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
)
MINIMAL_PDF = b"%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R>>endobj\n4 0 obj<</Length 44>>stream\nBT /F1 18 Tf 72 720 Td (VERILUMEN Shmoo Report) Tj ET\nendstream\nendobj\nxref\n0 5\ntrailer<</Size 5/Root 1 0 R>>\nstartxref\n0\n%%EOF\n"

MOCK_MAINTENANCE = {
    "flagged_count": 1,
    "model_available": True,
    "assets": [
        {
            "asset_id": "AST-ADV-93K-01",
            "name": "Advantest V93000 Tester #1 Pin Electronics",
            "health_pct": 92.5,
            "status": "HEALTHY",
            "rul_days": 145,
            "tester_id": "ADV-93K-01",
            "component": "PE_CARD_3",
            "failure_probability": 0.04,
            "confidence": 0.96,
            "severity": "LOW",
            "recommended_action": "Routine calibration at next planned maintenance cycle.",
            "model_available": True,
            "updated_at": datetime.datetime.now().isoformat()
        }
    ]
}

# Routes
@app.get("/health")
@app.get("/api/health")
def health():
    return {"status": "ok", "service": "ate_backend", "database": True, "redis": True}

@app.get("/ready")
@app.get("/api/ready")
def ready():
    return {"status": "ready", "database": True, "redis": True, "websocket_clients": 1}

class LoginRequest(BaseModel):
    username: str
    password: str

# Canonical role names expected by the dashboard auth store.
ROLE_MAP = {
    "viewer": "VIEWER",
    "test_eng": "TEST_ENGINEER",
    "process_eng": "PROCESS_ENGINEER",
    "ai_eng": "AI_ENGINEER",
    "maint_eng": "MAINTENANCE_ENGINEER",
    "admin": "ADMIN",
}

SESSION = {"username": "viewer", "role": "VIEWER"}


def resolve_role(username: str) -> str:
    key = (username or "").strip().lower()
    if key in ROLE_MAP:
        return ROLE_MAP[key]
    upper = (username or "").strip().upper()
    if upper in ROLE_MAP.values():
        return upper
    return "VIEWER"

@app.post("/auth/login")
@app.post("/api/auth/login")
def login(req: LoginRequest):
    role = resolve_role(req.username)
    SESSION["username"] = (req.username or "viewer").strip() or "viewer"
    SESSION["role"] = role
    return {
        "access_token": "local-verilumen-jwt-token",
        "token_type": "bearer",
        "role": role,
        "username": SESSION["username"],
        "user_id": "USR-LOCAL-01",
        "expires_in_minutes": 1440
    }

@app.get("/auth/me")
@app.get("/api/auth/me")
def auth_me():
    return {
        "user_id": "USR-LOCAL-01",
        "username": SESSION["username"],
        "full_name": "ATE Test Engineer",
        "role": SESSION["role"],
        "permissions": ["*"]
    }

@app.get("/dashboard/summary")
@app.get("/api/dashboard/summary")
def dashboard_summary():
    return {
        "header": {
            "lots_in_test": 4,
            "test_time_saved_hours": 142.5,
            "overall_yield_pct": 94.2
        },
        "active_wafer": MOCK_WAFERS["WFR-9082"],
        "kpis": MOCK_KPIS,
        "maintenance": MOCK_MAINTENANCE,
        "test_limits": {
            "adjustments_today": len(MOCK_LIMITS),
            "items": MOCK_LIMITS
        },
        "recent_events": MOCK_EVENTS,
        "connection_hint": "Connected to local ATE Intelligence Backend (Offline Mode)"
    }

@app.get("/wafers/{wafer_id}")
@app.get("/api/wafers/{wafer_id}")
def get_wafer(wafer_id: str):
    return MOCK_WAFERS.get(wafer_id, MOCK_WAFERS["WFR-9082"])

@app.get("/wafers/{wafer_id}/dies")
@app.get("/api/wafers/{wafer_id}/dies")
def get_wafer_dies(wafer_id: str):
    return MOCK_DIES.get(wafer_id, MOCK_DIES["WFR-9082"])

@app.get("/kpis")
@app.get("/api/kpis")
def get_kpis():
    return {"kpis": MOCK_KPIS}

@app.get("/kpis/{kpi_id}/history")
@app.get("/api/kpis/{kpi_id}/history")
def get_kpi_history(kpi_id: str, limit: int = 48):
    kpi = next((k for k in MOCK_KPIS if k["id"] == kpi_id), MOCK_KPIS[0])
    history = list(kpi.get("history") or [])[-limit:]
    if not history:
        history = [
            {
                "timestamp": (datetime.datetime.now() - datetime.timedelta(hours=i)).isoformat(),
                "value": round(kpi["value"] - i * 0.05, 2),
                "index": i,
            }
            for i in range(limit, 0, -1)
        ]
    return {
        "id": kpi["id"],
        "name": kpi["name"],
        "unit": kpi["unit"],
        "history": history,
    }

@app.get("/kpis/{kpi_id}")
@app.get("/api/kpis/{kpi_id}")
def get_kpi(kpi_id: str):
    kpi = next((k for k in MOCK_KPIS if k["id"] == kpi_id), MOCK_KPIS[0])
    return {
        **kpi,
        "lots": 4,
        "wafers": 12,
        "testers": 2,
        "sites": 2,
        "recent_events": MOCK_EVENTS,
    }

@app.get("/events/filters")
@app.get("/api/events/filters")
def get_event_filters():
    return {
        "testers": ["ADV-93K-01", "ADV-93K-02"],
        "sites": ["SITE-01", "SITE-02"],
        "lots": ["LOT-2026-A1"],
        "wafers": ["WFR-9082"],
        "severities": ["INFO", "PASS", "WARN", "ERROR", "CRITICAL"],
        "event_types": sorted({e["event_type"] for e in MOCK_FLOOR_EVENTS}),
    }

@app.get("/events")
@app.get("/api/events")
def get_events():
    items = MOCK_FLOOR_EVENTS
    unack = sum(1 for e in items if not e.get("acknowledged"))
    return {"total": len(items), "unacknowledged": unack, "items": items}

@app.get("/events/{event_id}")
@app.get("/api/events/{event_id}")
def get_event(event_id: str):
    for e in MOCK_FLOOR_EVENTS:
        if e["event_id"] == event_id:
            return e
    return MOCK_FLOOR_EVENTS[0]

class AckRequest(BaseModel):
    actor: Optional[str] = None
    comment: Optional[str] = None

@app.post("/events/{event_id}/acknowledge")
@app.post("/api/events/{event_id}/acknowledge")
def acknowledge_event(event_id: str, req: AckRequest = AckRequest()):
    for e in MOCK_FLOOR_EVENTS:
        if e["event_id"] == event_id:
            e["acknowledged"] = True
            e["acknowledged_by"] = req.actor or SESSION["username"]
            e["acknowledged_at"] = datetime.datetime.now().isoformat()
            return e
    return MOCK_FLOOR_EVENTS[0]

@app.get("/maintenance")
@app.get("/api/maintenance")
def get_maintenance():
    return MOCK_MAINTENANCE

@app.get("/maintenance/{tester_id}")
@app.get("/api/maintenance/{tester_id}")
def get_maintenance_tester(tester_id: str):
    assets = [a for a in MOCK_MAINTENANCE["assets"] if a.get("tester_id") == tester_id]
    if not assets:
        assets = list(MOCK_MAINTENANCE["assets"])
    asset = assets[0]
    now = datetime.datetime.now()
    return {
        "tester_id": tester_id,
        "name": asset.get("name") or tester_id,
        "status": asset.get("status") or "HEALTHY",
        "site_id": "SITE-01",
        "overall_severity": (asset.get("severity") or "healthy").lower(),
        "model_available": True,
        "components": assets,
        "history": [
            {
                "history_id": "MH-001",
                "tester_id": tester_id,
                "component": asset.get("component") or "PE_CARD_3",
                "event_type": "health_check",
                "detail": asset.get("recommended_action") or "Routine calibration.",
                "health_score": asset.get("health_pct"),
                "severity": asset.get("severity"),
                "created_at": now.isoformat(),
            }
        ],
        "health_series": [
            {
                "timestamp": (now - datetime.timedelta(days=i)).isoformat(),
                "health_score": max(80.0, float(asset.get("health_pct") or 92) - i * 0.4),
                "failure_probability": min(0.2, float(asset.get("failure_probability") or 0.04) + i * 0.002),
                "rul_days": max(30, int(asset.get("rul_days") or 145) - i),
                "severity": asset.get("severity") or "healthy",
                "component": asset.get("component") or "PE_CARD_3",
            }
            for i in range(14, -1, -1)
        ],
    }

class PredictRequest(BaseModel):
    tester_id: Optional[str] = None
    component: Optional[str] = None
    publish: Optional[bool] = False

@app.post("/maintenance/predict")
@app.post("/api/maintenance/predict")
def maintenance_predict(req: PredictRequest = PredictRequest()):
    return {"predictions": MOCK_MAINTENANCE["assets"]}

@app.get("/test-limits")
@app.get("/api/test-limits")
def get_test_limits():
    return {"adjustments_today": len(MOCK_LIMITS), "items": MOCK_LIMITS}

@app.get("/test-limits/{limit_id}")
@app.get("/api/test-limits/{limit_id}")
def get_test_limit(limit_id: str):
    for l in MOCK_LIMITS:
        if l["limit_id"] == limit_id:
            return l
    return MOCK_LIMITS[0]

class RecommendRequest(BaseModel):
    samples: Optional[List[float]] = None
    lsl: Optional[float] = None
    usl: Optional[float] = None
    target_cpk: Optional[float] = None
    actor: Optional[str] = None

@app.post("/test-limits/{limit_id}/recommend")
@app.post("/api/test-limits/{limit_id}/recommend")
def recommend_limit(limit_id: str, req: RecommendRequest = RecommendRequest()):
    for l in MOCK_LIMITS:
        if l["limit_id"] == limit_id:
            l["status"] = "RECOMMENDED"
            l["updated_at"] = datetime.datetime.now().isoformat()
            return l
    return MOCK_LIMITS[0]

@app.post("/uploads")
@app.post("/api/uploads")
async def uploads(file: UploadFile = File(...), kind: str = Form("auto")):
    wafer = MOCK_WAFERS["WFR-9082"]
    return {
        "status": "ok",
        "kind": kind or "auto",
        "filename": file.filename,
        "wafer_id": wafer["wafer_id"],
        "dies": wafer["tested_dies"],
        "yield_pct": wafer["yield_pct"],
        "events_accepted": len(MOCK_FLOOR_EVENTS),
        "lines": wafer["tested_dies"],
    }

def _shmoo_payload(filename: str = "demo_shmoo.csv") -> Dict[str, Any]:
    return {
        "status": "ok",
        "session_id": "SHMOO-LOCAL-01",
        "filename": filename,
        "meta": {
            "n_points": 240,
            "n_dies": 16,
            "is_multi_die": True,
            "die_id_cols": ["die_x", "die_y"],
            "vdd_range": [0.72, 0.95],
            "freq_range": [1.6, 2.4],
            "pass_rate": 0.964,
            "n_pass": 231,
            "n_fail": 9,
            "failure_codes": {"FREQ_MARGIN": 5, "VDD_MIN": 4},
            "lot_id": "LOT-2026-A1",
            "wafer_id": "WFR-9082",
            "die_id": "DIE-07-08",
            "temp_c": 25.0,
        },
        "results": {
            "accuracy": 0.964,
            "cv_accuracy": 0.951,
            "cv_std": 0.012,
            "boundary_slope": -3.2,
            "boundary_intercept": 4.8,
            "boundary_r2": 0.92,
            "recommended_vdd": 0.82,
            "recommended_freq": 2.1,
            "voltage_margin_v": 0.06,
            "freq_margin_ghz": 0.18,
            "n_pass": 231,
            "n_fail": 9,
            "failure_code_dist": {"FREQ_MARGIN": 5, "VDD_MIN": 4},
            "critical_fault_patterns": [{"pattern": "Vmin corner", "fail_count": 4, "fault_type": "voltage"}],
            "timing_fail_patterns": [{"pattern": "Fmax edge", "fail_count": 5, "fault_type": "timing"}],
        },
        "plot_url": "/api/shmoo/plot/character",
        "plot_urls": {
            "character": "/api/shmoo/plot/character",
            "yield": "/api/shmoo/plot/yield",
            "debug": "/api/shmoo/plot/debug",
        },
    }

@app.post("/shmoo/upload")
@app.post("/api/shmoo/upload")
async def shmoo_upload(file: UploadFile = File(...)):
    global SHMOO_LATEST
    SHMOO_LATEST = _shmoo_payload(file.filename or "upload.csv")
    return SHMOO_LATEST

@app.get("/shmoo/latest")
@app.get("/api/shmoo/latest")
def shmoo_latest():
    if not SHMOO_LATEST:
        return {**_shmoo_payload(), "status": "ok"}
    return SHMOO_LATEST

@app.get("/shmoo/plot/{name}")
@app.get("/api/shmoo/plot/{name}")
def shmoo_plot(name: str):
    return Response(content=TINY_PNG, media_type="image/png")

class ReportRequest(BaseModel):
    session_id: Optional[str] = None
    text_mode: Optional[str] = "template"

@app.post("/shmoo/report")
@app.post("/api/shmoo/report")
def shmoo_report(req: ReportRequest = ReportRequest()):
    return Response(content=MINIMAL_PDF, media_type="application/pdf")

@app.post("/test-limits/{limit_id}/approve")
@app.post("/api/test-limits/{limit_id}/approve")
def approve_limit(limit_id: str):
    for l in MOCK_LIMITS:
        if l["limit_id"] == limit_id:
            l["status"] = "ACTIVE"
            l["updated_at"] = datetime.datetime.now().isoformat()
            return l
    return MOCK_LIMITS[0]

@app.post("/test-limits/{limit_id}/reject")
@app.post("/api/test-limits/{limit_id}/reject")
def reject_limit(limit_id: str):
    for l in MOCK_LIMITS:
        if l["limit_id"] == limit_id:
            l["status"] = "REJECTED"
            l["updated_at"] = datetime.datetime.now().isoformat()
            return l
    return MOCK_LIMITS[0]

@app.post("/test-limits/{limit_id}/rollback")
@app.post("/api/test-limits/{limit_id}/rollback")
def rollback_limit(limit_id: str):
    for l in MOCK_LIMITS:
        if l["limit_id"] == limit_id:
            l["status"] = "ROLLED_BACK"
            l["updated_at"] = datetime.datetime.now().isoformat()
            return l
    return MOCK_LIMITS[0]


def _ws_heartbeat(seq: int) -> dict:
    return {"kind": "heartbeat", "status": "ok", "sequence_number": seq}


def _ws_die_event(seq: int) -> dict:
    dies = MOCK_DIES.get("WFR-9082") or []
    die = dies[seq % max(len(dies), 1)] if dies else {
        "die_id": "DIE-00-00",
        "x": 0,
        "y": 0,
        "result": "pass",
        "fail_code": None,
        "test_time_ms": 80,
        "confidence": 0.95,
    }
    now = datetime.datetime.now().isoformat()
    event = {
        "event_id": f"WS-{seq:06d}",
        "event_type": "die_tested" if die.get("result") == "pass" else f"die_{die.get('result', 'pass')}",
        "timestamp": now,
        "source": "local-ate",
        "tester_id": "ADV-93K-01",
        "site_id": "SITE-01",
        "lot_id": "LOT-2026-A1",
        "wafer_id": "WFR-9082",
        "die_id": die.get("die_id"),
        "sequence_number": seq,
        "payload": {
            "x": die.get("x"),
            "y": die.get("y"),
            "bin": die.get("result"),
            "fail_code": die.get("fail_code"),
            "test_time_ms": die.get("test_time_ms"),
            "confidence": die.get("confidence"),
            "yield_pct": MOCK_WAFERS["WFR-9082"]["yield_pct"],
        },
    }
    test_event = None
    if seq % 4 == 0:
        test_event = {
            "event_id": f"FLOOR-{seq:06d}",
            "timestamp": now,
            "severity": "INFO",
            "event_type": "wafer_progress",
            "source": "local-ate",
            "tester_id": "ADV-93K-01",
            "site_id": "SITE-01",
            "lot_id": "LOT-2026-A1",
            "wafer_id": "WFR-9082",
            "die_id": die.get("die_id"),
            "message": f"Local telemetry tick {seq} on wafer WFR-9082",
            "metadata": {},
            "acknowledged": False,
            "sequence_number": seq,
        }
    return {"kind": "telemetry_event", "event": event, "test_event": test_event}


@app.websocket("/ws/test-floor")
@app.websocket("/api/ws/test-floor")
async def test_floor_ws(websocket: WebSocket):
    await websocket.accept()
    seq = 0
    try:
        while True:
            seq += 1
            if seq % 2 == 1:
                await websocket.send_json(_ws_heartbeat(seq))
            else:
                await websocket.send_json(_ws_die_event(seq))
            try:
                await asyncio.wait_for(websocket.receive_text(), timeout=8.0)
            except asyncio.TimeoutError:
                pass
    except WebSocketDisconnect:
        return
    except Exception:
        return


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
