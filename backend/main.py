"""
D3T — Dynamic Dengue Digital Twin  v2
FastAPI backend: prediction, EKF state, SEIR, counterfactual simulation,
7-day forecast, SHAP explainability, hospital aggregate view,
drift detection, WebSocket alerts, Prometheus metrics.
"""
import json
import math
import os
import time
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Optional, Set

import joblib
import redis.asyncio as aioredis
from fastapi import BackgroundTasks, FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from prometheus_fastapi_instrumentator import Instrumentator

from config import config
from counterfactual_engine import run_counterfactual
from drift_detector import DriftMonitor
from ekf_state import ekf_get_state, ekf_update
from explainer import build_explainer, explain_prediction
from features import build_feature_vector, FEATURE_COLS
from forecaster import forecast_patient
from outcomes_db import count_severe_today, init_db, insert_outcome, get_outcomes_for_patient
from retrain_pipeline import retrain_model
from seir_particle_filter import SEIRParticleFilter

# ─────────────────────────────────────────────────────────────────────────────
# JSON NaN/Inf sanitizer — Python's json.dumps rejects float('nan')
# ─────────────────────────────────────────────────────────────────────────────
def _clean(obj):
    """Recursively replace NaN/Inf floats with 0 so FastAPI can serialise."""
    if isinstance(obj, float):
        return 0.0 if (math.isnan(obj) or math.isinf(obj)) else obj
    if isinstance(obj, dict):
        return {k: _clean(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_clean(v) for v in obj]
    return obj


# ─────────────────────────────────────────────────────────────────────────────
# Terminal colour helpers
# ─────────────────────────────────────────────────────────────────────────────
_CY = "\033[96m"; _GR = "\033[92m"; _YL = "\033[93m"
_RD = "\033[91m"; _BD = "\033[1m";  _DM = "\033[2m";  _RS = "\033[0m"

def _ts() -> str: return datetime.utcnow().strftime("%H:%M:%S")
def _info(t, m): print(f"{_DM}[{_ts()}]{_RS} {_CY}{_BD}[{t}]{_RS} {m}")
def _ok(t, m):   print(f"{_DM}[{_ts()}]{_RS} {_GR}{_BD}[{t}]{_RS} {_GR}{m}{_RS}")
def _warn(t, m): print(f"{_DM}[{_ts()}]{_RS} {_YL}{_BD}[{t}]{_RS} {_YL}{m}{_RS}")
def _err(t, m):  print(f"{_DM}[{_ts()}]{_RS} {_RD}{_BD}[{t}]{_RS} {_RD}{m}{_RS}")
def _banner(msg, color=_CY):
    w = 70
    print(f"\n{color}{_BD}{'═'*w}{_RS}")
    print(f"{color}{_BD}  {msg}{_RS}")
    print(f"{color}{'═'*w}{_RS}\n")


# ─────────────────────────────────────────────────────────────────────────────
# WebSocket connection manager
# ─────────────────────────────────────────────────────────────────────────────
class ConnectionManager:
    def __init__(self) -> None:
        self._active: Set[WebSocket] = set()

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self._active.add(ws)
        _ok("WS", f"Client connected — {len(self._active)} active")

    def disconnect(self, ws: WebSocket) -> None:
        self._active.discard(ws)
        _warn("WS", f"Client disconnected — {len(self._active)} active")

    async def broadcast(self, payload: dict) -> None:
        msg = json.dumps(payload)
        dead: Set[WebSocket] = set()
        for ws in self._active:
            try:
                await ws.send_text(msg)
            except Exception:
                dead.add(ws)
        self._active -= dead

ws_manager = ConnectionManager()


# ─────────────────────────────────────────────────────────────────────────────
# Lifespan
# ─────────────────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    _banner("D3T Backend v2 — Starting Up", _CY)

    _info("STARTUP", f"Loading XGBoost model from {config.MODEL_PATH}")
    app.state.model = joblib.load(config.MODEL_PATH)
    _ok("STARTUP", "Model loaded ✓")

    _info("STARTUP", "Building SHAP TreeExplainer")
    app.state.shap_explainer = build_explainer(app.state.model)
    _ok("STARTUP", "SHAP explainer ready ✓")

    _info("STARTUP", f"Connecting to Redis at {config.REDIS_URL}")
    app.state.redis = await aioredis.from_url(config.REDIS_URL, decode_responses=True)
    await app.state.redis.ping()
    _ok("STARTUP", "Redis OK ✓")

    _info("STARTUP", "Initialising SEIR Particle Filter")
    app.state.seir_pf = SEIRParticleFilter()
    _ok("STARTUP", f"SEIR PF ready  β̄={app.state.seir_pf.get_beta():.4f} ✓")

    app.state.drift_monitor = DriftMonitor()
    _ok("STARTUP", "DriftMonitor ready ✓")

    await init_db()
    _ok("STARTUP", "SQLite outcomes DB ready ✓")

    app.state.total_patients: set = set()
    app.state.model_last_retrained: str = "never"
    app.state.ws_broadcast = ws_manager.broadcast

    # In-memory prediction cache for hospital aggregate view
    app.state.patient_predictions: dict = {}

    _banner("D3T v2 is LIVE  ·  http://0.0.0.0:8000/docs", _GR)
    yield

    _banner("D3T Shutting Down", _RD)
    await app.state.redis.aclose()
    _ok("SHUTDOWN", "Redis connection closed ✓")


# ─────────────────────────────────────────────────────────────────────────────
# App
# ─────────────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="D3T — Dynamic Dengue Digital Twin v2",
    version="2.0.0",
    description="Real-time AI clinical monitoring with XGBoost, SHAP, 7-day forecasting, and hospital-level analytics.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Prometheus metrics at /metrics
Instrumentator().instrument(app).expose(app)


# ─────────────────────────────────────────────────────────────────────────────
# Pydantic models
# ─────────────────────────────────────────────────────────────────────────────
class PredictRequest(BaseModel):
    patient_id:     str
    day_of_illness: float
    WBC:            float
    Platelets:      float
    Hematocrit:     float = 40.0
    NS1_antigen:    float = 0.0
    AST_ALT_ratio:  float = 1.0
    pulse_pressure: float = 38.0
    warning_signs:  float = 0.0
    Temp_lag1: float = 37.0; Temp_lag2: float = 37.0; Temp_lag3: float = 37.0
    Temp_lag4: float = 37.0; Temp_lag5: float = 37.0; Temp_lag6: float = 37.0
    Rain_lag1: float = 50.0; Rain_lag2: float = 50.0; Rain_lag3: float = 50.0
    Rain_lag4: float = 50.0; Rain_lag5: float = 50.0; Rain_lag6: float = 50.0


class ScenarioItem(BaseModel):
    label: str
    platelet_recovery_rate:  float = Field(default=0.0, ge=0.0, le=20.0)
    iv_fluid_effect:         float = Field(default=0.0, ge=0.0, le=100.0)
    intervention_start_hour: float = Field(default=0.0, ge=0.0, le=24.0)


class CounterfactualRequest(BaseModel):
    patient_id: str
    scenarios:  list[ScenarioItem] = Field(min_length=1, max_length=5)


class SEIRUpdateRequest(BaseModel):
    week_end_date: str
    new_cases:     int = Field(ge=0)


class OutcomeRequest(BaseModel):
    patient_id:         str
    confirmed_severity: int = Field(ge=0, le=2)
    outcome_date:       str


# ─────────────────────────────────────────────────────────────────────────────
# Inference helper
# ─────────────────────────────────────────────────────────────────────────────
def _infer(clf, fvec) -> tuple[str, dict, int]:
    probs_arr  = clf.predict_proba(fvec)[0]
    label_idx  = int(clf.predict(fvec)[0])
    prob_map   = {int(c): float(p) for c, p in zip(clf.classes_, probs_arr)}
    probs = {
        "mild":     round(prob_map.get(0, 0.0), 4),
        "moderate": round(prob_map.get(1, 0.0), 4),
        "severe":   round(prob_map.get(2, 0.0), 4),
    }
    return ["mild", "moderate", "severe"][label_idx], probs, label_idx


async def _patch_ekf_psos(redis_client, patient_id: str, new_psos: float) -> None:
    raw = await redis_client.get(f"patient:{patient_id}:ekf")
    if not raw:
        return
    state = json.loads(raw)
    state["x_hat"][4] = new_psos
    state["last_updated"] = datetime.utcnow().isoformat()
    await redis_client.setex(
        f"patient:{patient_id}:ekf", 2592000, json.dumps(state)
    )


# ─────────────────────────────────────────────────────────────────────────────
# Endpoint 1 — POST /predict  (now returns SHAP + new features)
# ─────────────────────────────────────────────────────────────────────────────
@app.post("/predict")
async def predict(req: PredictRequest, background_tasks: BackgroundTasks):
    t0        = time.perf_counter()
    seir_beta = app.state.seir_pf.get_beta()

    x_prev, _ = await ekf_get_state(app.state.redis, req.patient_id)
    prev_psos = float(x_prev[4]) if x_prev is not None else 0.0

    ekf_data = await ekf_update(
        app.state.redis, req.patient_id,
        req.Platelets, req.WBC,
        psos_prior=prev_psos,
        day=req.day_of_illness,
    )

    raw_data = {
        "WBC":           req.WBC,
        "Platelets":     req.Platelets,
        "Hematocrit":    req.Hematocrit,
        "NS1_antigen":   req.NS1_antigen,
        "AST_ALT_ratio": req.AST_ALT_ratio,
        "pulse_pressure":req.pulse_pressure,
        "warning_signs": req.warning_signs,
        "SEIR_Beta":     seir_beta,
        "day_of_illness":req.day_of_illness,
        **{f"Temp_lag{i}": getattr(req, f"Temp_lag{i}") for i in range(1, 7)},
        **{f"Rain_lag{i}": getattr(req, f"Rain_lag{i}") for i in range(1, 7)},
    }

    fvec = build_feature_vector(raw_data, ekf_data)
    severity_label, probs, label_idx = _infer(app.state.model, fvec)

    # SHAP explanation
    shap_explanation = []
    try:
        if app.state.shap_explainer is not None:
            shap_explanation = explain_prediction(
                app.state.shap_explainer, fvec, label_idx, top_n=5
            )
    except Exception as e:
        _warn("SHAP", f"Explanation failed: {e}")

    await _patch_ekf_psos(app.state.redis, req.patient_id, probs["severe"])

    drifted    = app.state.drift_monitor.update({
        "Platelets": req.Platelets, "WBC": req.WBC, "SEIR_Beta": seir_beta,
    })
    drift_alert = len(drifted) > 0

    if drift_alert:
        drift_ts = datetime.utcnow().isoformat()
        _warn("DRIFT", f"Detected in: {', '.join(drifted)}")
        for feat in drifted:
            background_tasks.add_task(
                ws_manager.broadcast,
                {"type": "drift", "feature": feat, "timestamp": drift_ts},
            )
        background_tasks.add_task(retrain_model, app.state)

    app.state.total_patients.add(req.patient_id)
    app.state.patient_predictions[req.patient_id] = {
        "severity_label": severity_label,
        "PSOS": probs,
        "hematocrit":     req.Hematocrit,
        "warning_signs":  req.warning_signs,
        "pulse_pressure": req.pulse_pressure,
        "last_seen":      datetime.utcnow().isoformat(),
    }

    inference_ms = round((time.perf_counter() - t0) * 1000, 2)
    sev_color = {"mild": _GR, "moderate": _YL, "severe": _RD}[severity_label]
    _info("PREDICT",
        f"{req.patient_id} | day={req.day_of_illness:.0f}"
        f"  plt={req.Platelets:.0f}  WBC={req.WBC:.1f}"
        f"  HCT={req.Hematocrit:.1f}  PP={req.pulse_pressure:.0f}"
        f"  → {sev_color}{_BD}{severity_label.upper()}{_RS}"
        f"  P(sv)={probs['severe']:.3f}  [{inference_ms}ms]",
    )

    return {
        "patient_id":     req.patient_id,
        "PSOS":           probs,
        "severity_label": severity_label,
        "ekf_state": {
            "platelet_trend": ekf_data["platelet_trend"],
            "WBC_trend":      ekf_data["WBC_trend"],
            "days_tracked":   ekf_data["days_tracked"],
        },
        "shap":        shap_explanation,
        "drift_alert": drift_alert,
        "inference_ms":inference_ms,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Endpoint 2 — POST /simulate/counterfactual
# ─────────────────────────────────────────────────────────────────────────────
@app.post("/simulate/counterfactual")
async def simulate_counterfactual(req: CounterfactualRequest):
    _info("CF", f"{req.patient_id} | {len(req.scenarios)} scenario(s)")
    result = await run_counterfactual(
        redis_client=app.state.redis,
        patient_id=req.patient_id,
        scenarios=[s.model_dump() for s in req.scenarios],
        model_session=app.state.model,
        seir_beta=app.state.seir_pf.get_beta(),
    )
    rec = next((s["label"] for s in result["scenarios"] if s["recommended"]), "-")
    _ok("CF", f"Recommended: {rec}")
    return result


# ─────────────────────────────────────────────────────────────────────────────
# Endpoint 3 — POST /seir/update
# ─────────────────────────────────────────────────────────────────────────────
@app.post("/seir/update")
async def seir_update(req: SEIRUpdateRequest):
    _info("SEIR", f"Updating — {req.new_cases} new cases  ({req.week_end_date})")
    stats = app.state.seir_pf.update(req.new_cases)
    _ok("SEIR",
        f"β̄={stats['beta_mean']:.4f} ±{stats['beta_std']:.4f}"
        f"  CI=[{stats['beta_p10']:.3f}, {stats['beta_p90']:.3f}]"
        f"  ESS={stats['ess']:.0f}",
    )
    return _clean({**stats, "week_end_date": req.week_end_date})


# ─────────────────────────────────────────────────────────────────────────────
# Endpoint 4 — POST /outcome
# ─────────────────────────────────────────────────────────────────────────────
@app.post("/outcome")
async def record_outcome(req: OutcomeRequest):
    await insert_outcome(req.patient_id, req.confirmed_severity, req.outcome_date)
    sev = ["mild", "moderate", "severe"][req.confirmed_severity]
    _ok("OUTCOME", f"{req.patient_id} → {sev} on {req.outcome_date}")
    return {"stored": True, "patient_id": req.patient_id}


# ─────────────────────────────────────────────────────────────────────────────
# Endpoint 5 — GET /patient/{patient_id}/history
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/patient/{patient_id}/history")
async def patient_history(patient_id: str):
    x_hat, _ = await ekf_get_state(app.state.redis, patient_id)
    outcomes  = await get_outcomes_for_patient(patient_id)

    ekf_payload = None
    if x_hat is not None:
        ekf_payload = {
            "platelet":          round(float(x_hat[0]), 2),
            "platelet_velocity": round(float(x_hat[1]), 4),
            "WBC":               round(float(x_hat[2]), 2),
            "WBC_velocity":      round(float(x_hat[3]), 4),
            "PSOS_prior":        round(float(x_hat[4]), 4),
            "days_since_onset":  round(float(x_hat[5]), 1),
        }

    return {"patient_id": patient_id, "ekf_state": ekf_payload, "outcomes": outcomes}


# ─────────────────────────────────────────────────────────────────────────────
# Endpoint 6 — GET /dashboard/summary
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/dashboard/summary")
async def dashboard_summary():
    drift_status  = app.state.drift_monitor.get_status()
    active_drifts = sum(1 for v in drift_status.values() if v["drift"])
    severe_today  = await count_severe_today()

    return {
        "total_patients_tracked": len(app.state.total_patients),
        "active_drift_alerts":    active_drifts,
        "current_beta_mean":      round(app.state.seir_pf.get_beta(), 4),
        "model_last_retrained":   app.state.model_last_retrained,
        "severe_cases_today":     severe_today,
        "drift_feature_status":   drift_status,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Endpoint 7 — GET /forecast/{patient_id}  [NEW]
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/forecast/{patient_id}")
async def get_forecast(patient_id: str):
    """
    7-day Monte Carlo forward projection of severity probabilities.
    Returns per-day P5/P50/P95 bands for P(severe), plus P50 for mild/moderate.
    This is the core 'digital twin looks ahead' feature.
    """
    result = await forecast_patient(
        redis_client=app.state.redis,
        patient_id=patient_id,
        model=app.state.model,
        seir_beta=app.state.seir_pf.get_beta(),
    )
    _ok("FORECAST", f"{patient_id} | 7-day projection computed")
    return result


# ─────────────────────────────────────────────────────────────────────────────
# Endpoint 8 — GET /model/metrics  [NEW]
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/model/metrics")
async def model_metrics():
    """
    Returns validation metrics from training:
    ROC-AUC, calibration curve, confusion matrix, Brier score.
    """
    # Docker bakes the file to /app/ (outside the volume-mounted /app/data/).
    # Fall back to config.DATA_DIR for local development.
    for candidate in ["/app/validation_metrics.json",
                      os.path.join(config.DATA_DIR, "validation_metrics.json")]:
        if os.path.exists(candidate):
            with open(candidate) as f:
                return _clean(json.load(f))
    raise HTTPException(status_code=404, detail="Metrics not found — run train.py first")


# ─────────────────────────────────────────────────────────────────────────────
# Endpoint 9 — GET /hospital/forecast  [NEW]
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/hospital/forecast")
async def hospital_forecast():
    """
    Hospital-level aggregate view:
    - Severity distribution across all tracked patients
    - ICU demand estimate (patients with P_severe > 0.5)
    - Risk queue: top-10 patients sorted by P(severe) descending
    - Outbreak level derived from SEIR beta
    """
    preds = app.state.patient_predictions
    if not preds:
        return {
            "total": 0, "mild": 0, "moderate": 0, "severe": 0,
            "icu_demand_estimate": 0,
            "risk_queue": [],
            "outbreak_level": "LOW",
            "beta_mean": round(app.state.seir_pf.get_beta(), 4),
        }

    mild_c = sum(1 for p in preds.values() if p["severity_label"] == "mild")
    mod_c  = sum(1 for p in preds.values() if p["severity_label"] == "moderate")
    sev_c  = sum(1 for p in preds.values() if p["severity_label"] == "severe")
    icu    = sum(1 for p in preds.values() if p["PSOS"]["severe"] > 0.5)

    risk_queue = sorted(
        [
            {
                "patient_id":    pid,
                "p_severe":      round(data["PSOS"]["severe"], 4),
                "severity_label":data["severity_label"],
                "warning_signs": data.get("warning_signs", 0),
                "pulse_pressure":data.get("pulse_pressure", 38),
            }
            for pid, data in preds.items()
        ],
        key=lambda x: x["p_severe"],
        reverse=True,
    )[:10]

    beta = app.state.seir_pf.get_beta()
    if beta < 0.35:
        outbreak_level = "LOW"
    elif beta < 0.55:
        outbreak_level = "MODERATE"
    elif beta < 0.72:
        outbreak_level = "HIGH"
    else:
        outbreak_level = "CRITICAL"

    return _clean({
        "total":                len(preds),
        "mild":                 mild_c,
        "moderate":             mod_c,
        "severe":               sev_c,
        "icu_demand_estimate":  icu,
        "risk_queue":           risk_queue,
        "outbreak_level":       outbreak_level,
        "beta_mean":            round(beta, 4),
    })


# ─────────────────────────────────────────────────────────────────────────────
# Endpoint 10 — GET /demo/scenarios  [NEW]
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/demo/scenarios")
async def get_demo_scenarios():
    """Returns the pre-scripted demo scenario metadata (no patient data)."""
    demo_path = os.path.join(os.path.dirname(__file__), "demo_scenarios.json")
    with open(demo_path) as f:
        data = json.load(f)
    # Return only metadata, not the raw steps (frontend fetches steps separately)
    return {
        "scenarios": [
            {
                "id":          s["id"],
                "name":        s["name"],
                "description": s["description"],
                "color":       s["color"],
                "step_count":  len(s["steps"]),
            }
            for s in data["scenarios"]
        ]
    }


@app.post("/demo/run/{scenario_id}")
async def run_demo_scenario(scenario_id: str, background_tasks: BackgroundTasks):
    """
    Runs a pre-scripted demo scenario: fires all steps through /predict
    and returns the results array.
    If scenario has a seir_update, applies it first.
    """
    demo_path = os.path.join(os.path.dirname(__file__), "demo_scenarios.json")
    with open(demo_path) as f:
        data = json.load(f)

    scenario = next((s for s in data["scenarios"] if s["id"] == scenario_id), None)
    if scenario is None:
        raise HTTPException(status_code=404, detail=f"Scenario '{scenario_id}' not found")

    seir_update_result = None
    if "seir_update" in scenario:
        su = scenario["seir_update"]
        seir_update_result = app.state.seir_pf.update(su["new_cases"])
        _ok("DEMO", f"SEIR updated: β̄={seir_update_result['beta_mean']:.4f}")

    results = []
    for step in scenario["steps"]:
        req = PredictRequest(**step)
        result = await predict(req, background_tasks)
        results.append(result)

    _ok("DEMO", f"Scenario '{scenario_id}' ran {len(results)} steps")
    return {
        "scenario_id":   scenario_id,
        "name":          scenario["name"],
        "seir_update":   seir_update_result,
        "results":       results,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Endpoint 11 — GET /health  [NEW]
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/health")
async def health_check():
    redis_ok = False
    try:
        await app.state.redis.ping()
        redis_ok = True
    except Exception:
        pass

    return {
        "status":       "healthy" if redis_ok else "degraded",
        "redis":        redis_ok,
        "model_loaded": app.state.model is not None,
        "shap_ready":   app.state.shap_explainer is not None,
        "version":      "2.0.0",
        "timestamp":    datetime.utcnow().isoformat(),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Endpoint 12 — WebSocket /ws/alerts
# ─────────────────────────────────────────────────────────────────────────────
@app.websocket("/ws/alerts")
async def ws_alerts(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
