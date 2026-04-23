# D3T — Dynamic Dengue Digital Twin

A real-time AI-powered clinical decision support system for dengue fever. It creates a **living digital copy** of each patient — predicting who will get worse before it happens, explaining why, forecasting 7 days ahead, and simulating treatment outcomes.

Dengue kills ~20,000 people per year worldwide. The biggest challenge is figuring out which patients will deteriorate from mild to severe. D3T solves this by combining machine learning, signal processing, and epidemiological modeling into one unified system.

---

## What It Does (In Simple Words)

1. **A doctor admits a patient** with blood test results (WBC, platelets, hematocrit, etc.)
2. **The system instantly predicts** if the patient will be mild, moderate, or severe
3. **An animated human body** shows the patient's condition visually — skin changes with fever, petechiae (red spots) appear as platelets drop, heart beats faster with low pulse pressure
4. **It forecasts 7 days ahead** with confidence intervals — showing when things might get critical
5. **Doctors can simulate treatments** — "What if I give IV fluids vs. wait?" — and see predicted outcomes over 72 hours
6. **Every prediction is explained** — SHAP values show exactly which factors are driving the result (so doctors trust it)
7. **The system watches for outbreaks** — a community transmission model connects city-level data to each patient's individual risk
8. **If patient patterns change**, the system detects it automatically and retrains itself

---

## Key Features

### AI & Machine Learning
- **XGBoost severity classifier** trained on WHO 2009 dengue classification criteria
- **24-feature vector** combining clinical, environmental, and epidemiological data
- **SHAP explainability** — every prediction comes with top-5 feature attributions
- **Auto-retraining** — Page-Hinkley drift detection triggers SMOTE-balanced retraining when patient patterns shift

### Signal Processing
- **Extended Kalman Filter (EKF)** — tracks platelet and WBC trajectories per patient, stored in Redis with 30-day TTL
- **6-dimensional state vector**: platelet count, platelet velocity, WBC count, WBC velocity, prior P(severe), days since onset

### Epidemiology
- **SEIR Particle Filter** — 500 particles estimate community transmission rate (beta) from weekly case counts
- **Outbreak levels**: LOW / MODERATE / HIGH / CRITICAL based on beta thresholds
- Changes in community transmission automatically affect individual patient predictions

### Forecasting & Simulation
- **7-day Monte Carlo projection** — 200 particles propagated through EKF + XGBoost, outputs P5/P50/P95 bands
- **Counterfactual treatment engine** — simulates up to 5 treatment scenarios over 72 hours, recommends the one with lowest peak P(severe)

### User Interface
- **Animated SVG Human Twin** — body reacts to clinical values in real-time (skin color, petechiae, heartbeat, organ glow, ECG strip)
- **Interactive sliders** — drag to see the twin respond instantly (no API call needed)
- **Patient timeline** — vertical journey view showing admission, deterioration, improvement events
- **Hospital Command Centre** — severity census, ICU demand estimate, risk queue
- **Model metrics panel** — calibration curve, ROC-AUC, confusion matrix, Brier score
- **PDF clinical reports** — exportable patient reports with severity assessment, SHAP explanation, and forecast

### UX Features
- **Landing page** — clean entry point with feature overview
- **Auto-loaded demo data** — dashboard pre-populates with patients on first load
- **Guided tour** — step-by-step walkthrough of all features
- **Dark/light mode** — theme toggle with persistent preference
- **Multi-language** — English, Bahasa Melayu, and Spanish
- **Role-based views** — Doctor, Hospital Admin, Epidemiologist, Full Access
- **Real weather integration** — Open-Meteo API provides actual temperature and rainfall data
- **Mobile responsive** — works on tablets and smaller screens

---

## Architecture

```
Browser (React 18 + Vite)
    |
    |-- REST API + WebSocket
    |
FastAPI Backend
    |-- XGBoost classifier (severity prediction)
    |-- SHAP TreeExplainer (explainability)
    |-- Extended Kalman Filter (patient state tracking, Redis-backed)
    |-- SEIR Particle Filter (community outbreak level)
    |-- Monte Carlo Forecaster (7-day projections)
    |-- Counterfactual Engine (treatment simulation)
    |-- Page-Hinkley Drift Detector (auto-retraining trigger)
    |-- Open-Meteo integration (real weather data)
    |
Redis 7 (EKF state) + SQLite (outcomes) + model.joblib (XGBoost)
```

| Layer | Technology |
|---|---|
| Backend | Python 3.11, FastAPI 0.110, XGBoost 2.0, SHAP 0.45, scikit-learn 1.4 |
| State Tracking | Extended Kalman Filter per patient (Redis 7) |
| Epidemiology | SEIR Particle Filter (500 particles) |
| Forecasting | Monte Carlo EKF forward projection (7 days, n=200) |
| Drift Detection | Page-Hinkley detector + async SMOTE auto-retrain |
| Frontend | React 18, Vite 5, Recharts, CSS Modules, jsPDF |
| Weather | Open-Meteo API (free, no API key needed) |

---

## How to Run

### Option 1: Docker (Recommended)

```bash
git clone https://github.com/Khushboo-Dar/DT-Dengue.git d3t
cd d3t
docker compose up --build
```

The first build takes about 8-10 minutes because it:
1. Installs Python dependencies (XGBoost, SHAP, scikit-learn)
2. Generates WHO-aligned synthetic patient data (2000 patients)
3. Trains the XGBoost model with SMOTE balancing
4. Installs frontend dependencies and builds the app

After the first build, `docker compose up` starts in ~15 seconds.

### Option 2: Local Development

**Prerequisites:**
- Python 3.11+
- Node.js 20+
- Redis server running on port 6379

**Backend:**
```bash
cd backend
python -m venv venv
source venv/bin/activate        # Linux/Mac
# venv\Scripts\activate         # Windows

pip install -r requirements.txt

# First time only: generate data and train model
python generate_synthetic_data.py
python train.py

# Start the server
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

### Service URLs

| Service | URL |
|---|---|
| Frontend UI | http://localhost:3000 |
| API Docs (Swagger) | http://localhost:8000/docs |
| Health Check | http://localhost:8000/health |

### Stop

```bash
docker compose down          # stops containers, keeps data
docker compose down -v       # also removes Redis volume
```

---

## Running Tests

```bash
cd backend
pip install pytest pytest-asyncio
pytest tests/ -v
```

Tests cover:
- Feature vector builder (shape, values, defaults)
- Drift detector (stable data, drift detection, reset)
- SEIR model (population conservation, epidemic curve, beta computation)
- Particle filter (initial state, update stats, beta response)

---

## Demo Script (5-Minute Presentation)

1. Open http://localhost:3000 — see the landing page, click **Enter Dashboard**
2. Dashboard auto-loads demo patients — click **DEMO-A** to see the animated twin
3. Use the **interactive sliders** to change platelets/temperature and watch the body react
4. Click **7-Day Forecast** tab — see P(severe) projection with confidence bands
5. Click **Timeline** tab — see the patient journey from admission to deterioration
6. Click **SHAP Why?** tab — see which features drove the severe prediction
7. Click **Treatment Sim** tab — run simulation to compare treatment scenarios
8. Click **Outbreak Surge** in the demo bar — watch SEIR beta jump and all patients' risk increase
9. Click **Drift+Retrain** — watch drift alert appear via WebSocket, then model auto-retrains
10. Switch to **Hospital** tab — see severity census, ICU demand, risk queue
11. Switch to **Model Metrics** tab — show calibration curve, ROC-AUC, confusion matrix
12. Click **Export PDF Report** on any patient — download a professional clinical report
13. Try switching roles (Doctor / Hospital Admin / Epidemiologist) to show role-based views
14. Switch language to Bahasa Melayu or Spanish to show multilingual support

---

## API Endpoints

| Method | Path | What It Does |
|---|---|---|
| `POST` | `/predict` | Run AI inference, update EKF, compute SHAP, check drift |
| `POST` | `/simulate/counterfactual` | Simulate up to 5 treatment scenarios over 72 hours |
| `POST` | `/seir/update` | Update SEIR particle filter with weekly case count |
| `POST` | `/outcome` | Record confirmed severity outcome (feeds future retraining) |
| `GET` | `/patient/{id}/history` | Get EKF state + outcome history for a patient |
| `GET` | `/forecast/{id}` | 7-day Monte Carlo severity projection with 90% CI |
| `GET` | `/hospital/forecast` | Severity census, ICU demand, risk queue, outbreak level |
| `GET` | `/model/metrics` | Validation metrics: ROC-AUC, calibration, confusion matrix |
| `GET` | `/dashboard/summary` | System stats: patient count, drift alerts, beta |
| `GET` | `/weather/lags` | Real 6-day weather from Open-Meteo API |
| `GET` | `/demo/scenarios` | List available demo scenarios |
| `POST` | `/demo/run/{id}` | Execute a pre-scripted demo scenario |
| `GET` | `/health` | System health check |
| `WS` | `/ws/alerts` | Real-time WebSocket for drift and retrain notifications |

Full interactive API docs at http://localhost:8000/docs.

---

## 24-Feature Vector

| # | Feature | What It Is |
|---|---|---|
| 0 | WBC | White blood cell count (x10^3/uL) |
| 1 | Platelets | Platelet count — critical below 20 |
| 2 | Hematocrit | % rise above baseline indicates plasma leakage |
| 3 | NS1_antigen | Dengue NS1 test result (positive/negative) |
| 4 | AST_ALT_ratio | Liver involvement — above 2 means hepatitis |
| 5 | pulse_pressure | Systolic minus Diastolic — below 20 means impending shock |
| 6 | warning_signs | Count of WHO warning signs (0-5) |
| 7-12 | Temp_lag1-6 | Temperature over past 6 days (from Open-Meteo or manual) |
| 13-18 | Rain_lag1-6 | Rainfall over past 6 days |
| 19 | SEIR_Beta | Community transmission rate from particle filter |
| 20 | day_of_illness | Days since first symptom |
| 21 | platelet_trend | Rate of platelet change (from Kalman Filter) |
| 22 | WBC_trend | Rate of WBC change (from Kalman Filter) |
| 23 | PSOS_prior | Previous prediction's P(severe) — gives temporal memory |

---

## Project Structure

```
d3t/
├── docker-compose.yml              # 3 services: Redis, Backend, Frontend
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── main.py                     # FastAPI app — all endpoints + WebSocket
│   ├── config.py                   # Environment config
│   ├── features.py                 # 24-feature vector builder
│   ├── ekf_state.py                # Extended Kalman Filter (Redis-backed)
│   ├── explainer.py                # SHAP TreeExplainer wrapper
│   ├── forecaster.py               # 7-day Monte Carlo forward projection
│   ├── seir_model.py               # SEIR ODE solver
│   ├── seir_particle_filter.py     # 500-particle Bayesian SEIR
│   ├── drift_detector.py           # Page-Hinkley concept drift detector
│   ├── retrain_pipeline.py         # Async SMOTE + XGBoost retraining
│   ├── counterfactual_engine.py    # Treatment simulation engine
│   ├── weather_api.py              # Open-Meteo real weather integration
│   ├── outcomes_db.py              # SQLite outcomes CRUD
│   ├── generate_synthetic_data.py  # WHO-aligned synthetic data generator
│   ├── train.py                    # XGBoost training + validation metrics
│   ├── demo_scenarios.json         # 4 pre-scripted demo patient journeys
│   └── tests/                      # pytest unit tests
│       ├── test_features.py
│       ├── test_drift_detector.py
│       ├── test_seir_model.py
│       └── test_seir_particle_filter.py
└── frontend/
    ├── Dockerfile
    ├── package.json
    └── src/
        ├── main.jsx                # Entry point with LanguageProvider
        ├── App.jsx                 # Root: landing page -> dashboard
        ├── index.css               # Global styles + dark/light themes
        ├── api/client.js           # Axios API client + WebSocket URL
        ├── i18n/
        │   ├── translations.js     # EN / BM / ES translations
        │   └── LanguageContext.jsx  # React context for i18n
        └── components/
            ├── LandingPage.jsx         # Landing page with feature cards
            ├── Dashboard.jsx           # Master layout (3-tab, role-filtered)
            ├── HumanTwin.jsx           # Animated SVG body + ECG + sliders
            ├── PatientAdmissionForm.jsx# Clinical input form
            ├── PatientCard.jsx         # Risk gauge arc + severity badge
            ├── PatientTimeline.jsx     # Vertical patient journey timeline
            ├── PatientReport.jsx       # PDF export (jsPDF)
            ├── ForecastChart.jsx       # 7-day forecast with CI bands
            ├── TrajectoryChart.jsx     # P(severe) over illness days
            ├── SHAPChart.jsx           # SHAP feature attribution bars
            ├── CounterfactualPanel.jsx # Treatment simulation UI
            ├── HospitalPanel.jsx       # Hospital command centre
            ├── MetricsPanel.jsx        # Calibration, AUC, confusion matrix
            ├── SEIRStatus.jsx          # Community beta gauge
            ├── DriftAlertBanner.jsx    # Drift + retrain alerts (WebSocket)
            ├── GuidedTour.jsx          # Step-by-step feature tour
            ├── ThemeToggle.jsx         # Dark/light mode switch
            ├── LanguageSelector.jsx    # EN/BM/ES language switcher
            └── RoleSelector.jsx        # Doctor/Admin/Epidemiologist roles
```

---

## Troubleshooting

**Port in use:**
```bash
# Linux/WSL
sudo lsof -ti :8000 | xargs kill -9
sudo lsof -ti :3000 | xargs kill -9
```

**Backend can't find model.joblib (local dev):**
```bash
cd backend && source venv/bin/activate
python generate_synthetic_data.py && python train.py
```

**Docker: stale build cache:**
```bash
docker compose down -v
docker compose build --no-cache
docker compose up
```

**SHAP slow on first prediction:**
TreeExplainer initializes once at startup. First call has ~200ms extra latency. All subsequent calls are fast (<20ms).

---

## What Makes This Project Innovative

1. **Multi-layer AI fusion** — EKF (signal processing) + XGBoost (ML) + SEIR (epidemiology) work together, not in isolation
2. **Community-to-individual coupling** — outbreak level directly affects each patient's risk assessment
3. **Self-healing model** — drift detection + auto-retraining keeps the model current
4. **Explainable AI** — SHAP makes every prediction transparent and trustworthy for clinicians
5. **Treatment simulation** — doctors can test interventions before applying them
6. **Living digital twin** — not just a classifier, but a continuously evolving patient model

---

Built with Python, FastAPI, XGBoost, SHAP, React, and Redis.
Follows WHO 2009 Dengue Classification guidelines.
