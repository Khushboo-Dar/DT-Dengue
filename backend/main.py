"""
D3T — Dynamic Dengue Digital Twin
FastAPI backend: prediction, EKF state management, SEIR update,
counterfactual simulation, drift detection, WebSocket alerts.
"""
import json
import time
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Set

import joblib
import redis.asyncio as aioredis
from fastapi import BackgroundTasks, FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from config import config
from counterfactual_engine import run_counterfactual
from drift_detector import DriftMonitor
from ekf_state import ekf_get_state, ekf_update
from features import build_feature_vector
from outcomes_db import count_severe_today, init_db, insert_outcome, get_outcomes_for_patient
from retrain_pipeline import retrain_model
from seir_particle_filter import SEIRParticleFilter

# ─────────────────────────────────────────────────────────────────────────────
# Terminal colour helpers
# ─────────────────────────────────────────────────────────────────────────────
_CY = "\033[96m"
_GR = "\033[92m"
_YL = "\033[93m"
_RD = "\033[91m"
_BD = "\033[1m"
_DM = "\033[2m"
_RS = "\033[0m"


def _ts() -> str:
    return datetime.utcnow().strftime("%H:%M:%S")


def _info(tag: str, msg: str) -> None:
    print(f"{_DM}[{_ts()}]{_RS} {_CY}{_BD}[{tag}]{_RS} {msg}")


def _ok(tag: str, msg: str) -> None:
    print(f"{_DM}[{_ts()}]{_RS} {_GR}{_BD}[{tag}]{_RS} {_GR}{msg}{_RS}")


def _warn(tag: str, msg: str) -> None:
    print(f"{_DM}[{_ts()}]{_RS} {_YL}{_BD}[{tag}]{_RS} {_YL}{msg}{_RS}")


def _err(tag: str, msg: str) -> None:
    print(f"{_DM}[{_ts()}]{_RS} {_RD}{_BD}[{tag}]{_RS} {_RD}{msg}{_RS}")


def _banner(msg: str, color: str = _CY) -> None:
    w = 66
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
        _ok("WS", f"Client connected — {len(self._active)} active connection(s)")

    def disconnect(self, ws: WebSocket) -> None:
        self._active.discard(ws)
        _warn("WS", f"Client disconnected — {len(self._active)} active connection(s)")

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
# Lifespan: startup / shutdown
# ─────────────────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    _banner("D3T Backend — Starting Up", _CY)

    _info("STARTUP", f"Loading model from {config.MODEL_PATH}")
    app.state.model = joblib.load(config.MODEL_PATH)
    _ok("STARTUP", "Model loaded ✓")

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
    app.state.ws_broadcast = ws_manager.broadcast  # used by retrain_pipeline

    _banner("D3T is LIVE  ·  http://0.0.0.0:8000/docs", _GR)
    yield

    _banner("D3T Shutting Down", _RD)
    await app.state.redis.aclose()
    _ok("SHUTDOWN", "Redis connection closed ✓")


# ─────────────────────────────────────────────────────────────────────────────
# App
# ─────────────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="D3T — Dynamic Dengue Digital Twin",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─────────────────────────────────────────────────────────────────────────────
# Pydantic request/response models
# ─────────────────────────────────────────────────────────────────────────────
class PredictRequest(BaseModel):
    patient_id: str
    day_of_illness: float
    WBC: float
    Platelets: float
    Temp_lag1: float = 37.0
    Temp_lag2: float = 37.0
    Temp_lag3: float = 37.0
    Temp_lag4: float = 37.0
    Temp_lag5: float = 37.0
    Temp_lag6: float = 37.0
    Rain_lag1: float = 50.0
    Rain_lag2: float = 50.0
    Rain_lag3: float = 50.0
    Rain_lag4: float = 50.0
    Rain_lag5: float = 50.0
    Rain_lag6: float = 50.0


class ScenarioItem(BaseModel):
    label: str
    platelet_recovery_rate: float = Field(default=0.0, ge=0.0, le=20.0)
    iv_fluid_effect: float = Field(default=0.0, ge=0.0, le=100.0)
    intervention_start_hour: float = Field(default=0.0, ge=0.0, le=24.0)


class CounterfactualRequest(BaseModel):
    patient_id: str
    scenarios: list[ScenarioItem] = Field(min_length=1, max_length=5)


class SEIRUpdateRequest(BaseModel):
    week_end_date: str
    new_cases: int = Field(ge=0)


class OutcomeRequest(BaseModel):
    patient_id: str
    confirmed_severity: int = Field(ge=0, le=2)
    outcome_date: str


# ─────────────────────────────────────────────────────────────────────────────
# Sklearn inference helper
# ─────────────────────────────────────────────────────────────────────────────
def _infer(clf, fvec) -> tuple[str, dict]:
    probs_arr = clf.predict_proba(fvec)[0]
    label_idx = int(clf.predict(fvec)[0])
    # clf.classes_ is [0,1,2] but map explicitly to be safe
    prob_map = {int(c): float(p) for c, p in zip(clf.classes_, probs_arr)}
    probs = {
        "mild":     round(prob_map.get(0, 0.0), 4),
        "moderate": round(prob_map.get(1, 0.0), 4),
        "severe":   round(prob_map.get(2, 0.0), 4),
    }
    return ["mild", "moderate", "severe"][label_idx], probs


# ─────────────────────────────────────────────────────────────────────────────
# EKF PSOS patch helper (stores new P_severe back to Redis without re-running KF)
# ─────────────────────────────────────────────────────────────────────────────
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
# Endpoint 1 — POST /predict
# ─────────────────────────────────────────────────────────────────────────────
@app.post("/predict")
async def predict(req: PredictRequest, background_tasks: BackgroundTasks):
    t0 = time.perf_counter()
    seir_beta = app.state.seir_pf.get_beta()

    # Read stored PSOS_prior (the previous prediction's P_severe)
    x_prev, _ = await ekf_get_state(app.state.redis, req.patient_id)
    prev_psos = float(x_prev[4]) if x_prev is not None else 0.0

    # EKF predict + update step
    ekf_data = await ekf_update(
        app.state.redis, req.patient_id,
        req.Platelets, req.WBC,
        psos_prior=prev_psos,
        day=req.day_of_illness,
    )

    raw_data = {
        "WBC":         req.WBC,
        "Platelets":   req.Platelets,
        "SEIR_Beta":   seir_beta,
        "day_of_illness": req.day_of_illness,
        **{f"Temp_lag{i}": getattr(req, f"Temp_lag{i}") for i in range(1, 7)},
        **{f"Rain_lag{i}": getattr(req, f"Rain_lag{i}") for i in range(1, 7)},
    }

    fvec = build_feature_vector(raw_data, ekf_data)
    severity_label, probs = _infer(app.state.model, fvec)

    # Store this prediction's P_severe as the prior for the next call
    await _patch_ekf_psos(app.state.redis, req.patient_id, probs["severe"])

    # Drift check
    drifted = app.state.drift_monitor.update({
        "Platelets": req.Platelets,
        "WBC":       req.WBC,
        "SEIR_Beta": seir_beta,
    })
    drift_alert = len(drifted) > 0

    if drift_alert:
        drift_ts = datetime.utcnow().isoformat()
        _warn("DRIFT", f"Detected in features: {', '.join(drifted)}")
        for feat in drifted:
            background_tasks.add_task(
                ws_manager.broadcast,
                {"type": "drift", "feature": feat, "timestamp": drift_ts},
            )
        background_tasks.add_task(retrain_model, app.state)

    app.state.total_patients.add(req.patient_id)
    inference_ms = round((time.perf_counter() - t0) * 1000, 2)

    sev_color = {"mild": _GR, "moderate": _YL, "severe": _RD}[severity_label]
    _info(
        "PREDICT",
        f"{req.patient_id} | day={req.day_of_illness:.0f}"
        f"  plt={req.Platelets:.0f}  WBC={req.WBC:.1f}"
        f"  → {sev_color}{_BD}{severity_label.upper()}{_RS}"
        f"  P(sv)={probs['severe']:.3f}  [{inference_ms}ms]",
    )

    return {
        "patient_id":    req.patient_id,
        "PSOS":          probs,
        "severity_label": severity_label,
        "ekf_state": {
            "platelet_trend": ekf_data["platelet_trend"],
            "WBC_trend":      ekf_data["WBC_trend"],
            "days_tracked":   ekf_data["days_tracked"],
        },
        "drift_alert":   drift_alert,
        "inference_ms":  inference_ms,
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
    _ok(
        "SEIR",
        f"β̄={stats['beta_mean']:.4f}  ±{stats['beta_std']:.4f}"
        f"  CI=[{stats['beta_p10']:.3f}, {stats['beta_p90']:.3f}]"
        f"  ESS={stats['ess']:.0f}",
    )
    return {**stats, "week_end_date": req.week_end_date}


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
# Endpoint 7 — WebSocket /ws/alerts
# ─────────────────────────────────────────────────────────────────────────────
@app.websocket("/ws/alerts")
async def ws_alerts(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        while True:
            # Keep the socket alive; client may send keepalive pings
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
