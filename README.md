# D3T — Dynamic Dengue Digital Twin v2

> A real-time, AI-powered clinical intelligence platform for dengue haemorrhagic fever. Maintains a **living digital twin** of every patient — predicting severity, forecasting 7 days ahead with uncertainty bands, explaining every prediction via SHAP, simulating treatment counterfactuals, and self-retraining when the clinical population drifts.

---

## What's New in v2

| Feature | Detail |
|---|---|
| **XGBoost classifier** | Replaces RandomForest — faster, higher AUC, native feature importance |
| **5 new clinical features** | Hematocrit, NS1 antigen, AST/ALT ratio, Pulse Pressure, Warning Sign count |
| **WHO severity alignment** | Labels now map to dengue without/with warning signs/severe dengue (WHO 2009) |
| **SHAP explainability** | Every prediction returns top-5 SHAP values — "why severe?" answered instantly |
| **7-day predictive forecast** | Monte Carlo forward projection (n=200 particles) with P5/P50/P95 confidence bands |
| **Hospital Command Centre** | Aggregate severity census, ICU demand estimate, risk queue sorted by P(severe) |
| **Model Metrics panel** | Calibration curve, ROC-AUC per class, confusion matrix heatmap, Brier score |
| **Patient Admission Form** | Structured clinical input with WHO warning signs checklist |
| **Pre-scripted demo scenarios** | 4 scripted journeys: deterioration, treatment response, outbreak surge, drift+retrain |
| **Prometheus + Grafana** | Live observability: inference latency, request rate, WebSocket connections |
| **Tabbed UI** | Patients · Hospital · Model Metrics tabs with inner forecast/trajectory/SHAP/CF tabs |
| **Risk gauge** | SVG arc speedometer per patient card |

---

## Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│  Browser  →  React 18 + Vite (port 3000)                               │
│               ↕ REST + WebSocket                                       │
│  FastAPI v2  →  XGBoost · SHAP · EKF (Redis) · SEIR PF · Forecaster   │
│               ↕                                                        │
│  Redis 7 (EKF state)    SQLite (outcomes)    model.joblib (XGBoost)    │
│               ↕                                                        │
│  Prometheus (port 9090)  →  Grafana (port 3001)                        │
└────────────────────────────────────────────────────────────────────────┘
```

| Layer | Technology |
|---|---|
| Backend | Python 3.11 · FastAPI 0.110 · XGBoost 2.0 · SHAP 0.45 · scikit-learn 1.4 |
| State | Extended Kalman Filter per patient (Redis 7) |
| Epidemiology | SEIR Particle Filter (500 particles) |
| Explainability | SHAP TreeExplainer |
| Forecasting | Monte Carlo EKF forward projection (7 days, n=200) |
| Drift | Page-Hinkley detector · async auto-retrain with SMOTE |
| Frontend | React 18 · Vite 5 · Recharts · CSS Modules |
| Observability | Prometheus + Grafana |

---

## Quick Start (Docker — recommended)

```bash
git clone <your-repo-url> d3t
cd d3t
docker compose up --build
```

> First build takes ~8–10 minutes (installs XGBoost/SHAP, generates data, trains model).
> Subsequent starts with no code changes: `docker compose up` (~15 seconds).

### Service URLs

| Service | URL | Credentials |
|---|---|---|
| Frontend UI | http://localhost:3000 | — |
| API docs (Swagger) | http://localhost:8000/docs | — |
| Health check | http://localhost:8000/health | — |
| Prometheus | http://localhost:9090 | — |
| Grafana | http://localhost:3001 | admin / d3t_admin |

### Stop

```bash
docker compose down          # stops containers, keeps volumes
docker compose down -v       # also deletes Redis + Grafana data
```

---

## Local Development (Ubuntu / WSL)

### Prerequisites

```bash
# Python 3.11
sudo apt-get install -y python3.11 python3.11-venv python3.11-dev build-essential

# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Redis
sudo apt-get install -y redis-server
sudo systemctl start redis-server
```

### Backend

```bash
cd d3t/backend
python3.11 -m venv venv && source venv/bin/activate
pip install -r requirements.txt

# One-time: generate data + train XGBoost model
python generate_synthetic_data.py
python train.py

# Start server
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### Frontend

```bash
cd d3t/frontend
npm install
npm run dev
```

Open http://localhost:3000.

---

## Feature Vector (24 features)

| # | Feature | Description |
|---|---|---|
| 0 | WBC | White blood cell count (×10³/μL) |
| 1 | Platelets | Platelet count (×10³/μL) · critical <20 |
| 2 | **Hematocrit** | % — rise >20% from baseline = plasma leakage (WHO criterion) |
| 3 | **NS1_antigen** | NS1 antigen test result (1=positive, 0=negative) |
| 4 | **AST_ALT_ratio** | Liver involvement marker — >2 indicates hepatitis |
| 5 | **pulse_pressure** | Systolic−Diastolic mmHg — <20 = impending dengue shock |
| 6 | **warning_signs** | Count of WHO warning signs present (0–5) |
| 7–12 | Temp_lag1–6 | Ambient temperature (°C) past 6 days |
| 13–18 | Rain_lag1–6 | Rainfall (mm) past 6 days |
| 19 | SEIR_Beta | Community transmission rate from particle filter |
| 20 | day_of_illness | Current day since symptom onset |
| 21 | platelet_trend | EKF-estimated platelet velocity (rate of change) |
| 22 | WBC_trend | EKF-estimated WBC velocity |
| 23 | PSOS_prior | Previous prediction's P(severe) — temporal memory |

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/predict` | Run inference · update EKF · compute SHAP · check drift |
| `POST` | `/simulate/counterfactual` | Treatment scenario simulation (up to 5 scenarios, 72h horizon) |
| `POST` | `/seir/update` | Update SEIR particle filter with weekly case count |
| `POST` | `/outcome` | Record confirmed severity outcome (feeds retraining) |
| `GET` | `/patient/{id}/history` | EKF state + outcome history |
| `GET` | `/forecast/{id}` | **NEW** 7-day Monte Carlo predictive trajectory with 90% CI bands |
| `GET` | `/hospital/forecast` | **NEW** Aggregate: severity census, ICU demand, risk queue |
| `GET` | `/model/metrics` | **NEW** Validation metrics: ROC-AUC, calibration, confusion matrix |
| `GET` | `/dashboard/summary` | System stats: patients, drift alerts, beta, retrain time |
| `GET` | `/demo/scenarios` | **NEW** List pre-scripted demo scenario metadata |
| `POST` | `/demo/run/{id}` | **NEW** Execute a full demo scenario, returns all prediction results |
| `GET` | `/health` | Redis ping, model loaded, SHAP ready, version |
| `GET` | `/metrics` | **NEW** Prometheus metrics endpoint |

Full interactive docs at **http://localhost:8000/docs**.

---

## Demo Script (5-minute presentation flow)

1. Open http://localhost:3000
2. Click **▶ Deterioration** in the demo bar — watch Patient DEMO-A admitted on day 2 (mild), progressively worsening to severe by day 5. The trajectory chart and 7-day forecast both show the impending deterioration.
3. Click the patient → **SHAP Why?** tab — see which features (Hematocrit rise, pulse pressure drop, warning signs) drove the severe prediction.
4. Click **Treatment Sim** → Run Simulation — compare aggressive vs no-treatment P(severe) trajectories over 72h.
5. Click **▶ Outbreak Surge** — watch SEIR beta jump and P(severe) rise across all patients simultaneously, demonstrating the SEIR→individual coupling.
6. Click **▶ Drift+Retrain** — watch the amber drift alert banner appear via WebSocket, then the green "retrained" banner when the model hot-swaps.
7. Click **Hospital** tab — see the severity donut, ICU demand estimate, and risk queue.
8. Click **Model Metrics** tab — show calibration curve (should be near-diagonal), ROC-AUC bars, confusion matrix.

---

## Project Structure

```
d3t/
├── docker-compose.yml
├── prometheus.yml
├── grafana/
│   └── provisioning/          # Auto-provisioned datasource + dashboard
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── config.py
│   ├── main.py                # FastAPI app — 12 endpoints + WebSocket
│   ├── features.py            # 24-feature vector builder
│   ├── ekf_state.py           # Extended Kalman Filter (Redis-backed)
│   ├── explainer.py           # SHAP TreeExplainer
│   ├── forecaster.py          # 7-day Monte Carlo forward projection
│   ├── seir_model.py          # SEIR ODE solver
│   ├── seir_particle_filter.py# 500-particle Bayesian SEIR calibration
│   ├── drift_detector.py      # Page-Hinkley concept drift detector
│   ├── retrain_pipeline.py    # Async SMOTE XGBoost retraining
│   ├── counterfactual_engine.py# EKF treatment propagation
│   ├── outcomes_db.py         # aiosqlite CRUD
│   ├── generate_synthetic_data.py  # WHO-aligned synthetic data generator
│   ├── train.py               # Training + validation metrics
│   ├── demo_scenarios.json    # Pre-scripted demo patient journeys
│   └── data/                  # (generated at runtime — gitignored)
└── frontend/
    ├── Dockerfile
    ├── package.json
    └── src/
        ├── App.jsx
        ├── index.css
        ├── api/client.js
        └── components/
            ├── Dashboard.jsx          # Master layout with 3 tabs
            ├── PatientAdmissionForm.jsx  # Clinical input form
            ├── PatientCard.jsx        # Risk gauge arc + severity badge
            ├── TrajectoryChart.jsx    # PSOS over illness day
            ├── ForecastChart.jsx      # 7-day forecast with CI bands
            ├── SHAPChart.jsx          # SHAP waterfall bar chart
            ├── CounterfactualPanel.jsx# Treatment simulation
            ├── HospitalPanel.jsx      # Hospital command centre
            ├── MetricsPanel.jsx       # Calibration, AUC, confusion matrix
            ├── SEIRStatus.jsx         # Community β gauge
            └── DriftAlertBanner.jsx   # Drift + retrain alerts
```

---

## Smoke Tests

```bash
# 1. Health check
curl http://localhost:8000/health

# 2. Predict with full v2 features
curl -s -X POST http://localhost:8000/predict \
  -H "Content-Type: application/json" \
  -d '{
    "patient_id":"P001","day_of_illness":4,
    "WBC":2.8,"Platelets":55,"Hematocrit":46.0,
    "NS1_antigen":1.0,"AST_ALT_ratio":2.1,
    "pulse_pressure":25,"warning_signs":3
  }' | python3 -m json.tool

# 3. 7-day forecast
curl http://localhost:8000/forecast/P001 | python3 -m json.tool

# 4. Hospital view
curl http://localhost:8000/hospital/forecast | python3 -m json.tool

# 5. Model metrics
curl http://localhost:8000/model/metrics | python3 -m json.tool

# 6. Run demo scenario
curl -s -X POST http://localhost:8000/demo/run/classic_deterioration | python3 -m json.tool
```

---

## Troubleshooting

### Port in use
```bash
# Linux/WSL
sudo lsof -ti :8000 | xargs kill -9
sudo lsof -ti :3000 | xargs kill -9
```

### Backend can't find model.joblib (local)
```bash
cd backend && source venv/bin/activate
python generate_synthetic_data.py && python train.py
```

### Docker: old build cache (after changing requirements)
```bash
docker compose down -v
docker compose build --no-cache
docker compose up
```

### SHAP slow on first prediction
SHAP TreeExplainer initialises once at startup and caches — only the first call per server start has extra latency (~200ms). Subsequent calls are fast (<20ms).

### Grafana shows "no data"
Wait ~60 seconds after startup for Prometheus to scrape the first metrics. Then reload the Grafana dashboard.
