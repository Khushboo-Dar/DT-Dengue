# D3T Dengue Digital Twin — Complete Skill Profile

> **Version:** v3 (April 2026)
> **Purpose:** Enable any LLM/chatbot to fully understand, explain, and answer questions about the D3T project — its architecture, algorithms, UX features, data pipeline, tests, and deployment.

---

## Table of Contents

1. [Project Summary](#1-project-summary)
2. [Architecture Overview](#2-architecture-overview)
3. [Algorithm and Method Details](#3-algorithm-and-method-details)
4. [File-by-File Breakdown](#4-file-by-file-breakdown)
5. [Data Handling](#5-data-handling)
6. [User Experience Features](#6-user-experience-features)
7. [Testing and Reliability](#7-testing-and-reliability)
8. [Deployment Instructions](#8-deployment-instructions)
9. [Skill Metadata](#9-skill-metadata)

---

## 1. Project Summary

**D3T (Dengue Digital Twin)** is an AI-powered clinical decision-support system for dengue fever management. It creates a real-time virtual representation ("digital twin") of each dengue patient, continuously updated as new clinical measurements arrive, and uses that twin to:

- **Classify** current disease severity (Mild / Moderate / Severe) using an XGBoost model trained on 24 clinical, epidemiological, and time-lagged features.
- **Forecast** the 7-day probabilistic trajectory of the patient's condition using Monte Carlo simulation.
- **Explain** each prediction via SHAP feature attribution — showing clinicians *why* the model flagged a patient as high risk.
- **Simulate counterfactual treatments** (platelet transfusion, IV fluids) over a 72-hour horizon to recommend the treatment with the lowest predicted peak severity.
- **Track epidemiological context** through a live SEIR particle-filter that estimates city-level dengue transmission rate (β) and flags outbreak conditions.
- **Detect model drift** automatically (Page-Hinkley test) and trigger XGBoost retraining with SMOTE balancing when clinical distributions shift.
- **Visualise** patient state through an animated SVG human body that changes colour, shows petechiae, organ glow, fever skin tone, and pulsing severity aura in real time.

**Impact:** D3T brings together bedside AI, epidemiological modelling, explainability, and clinical workflow tools (PDF reports, guided tour, multilingual UI, role-based access) into a single, containerised web application deployable by any hospital or public health agency.

---

## 2. Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│                     BROWSER (React + Vite)               │
│  LandingPage → RoleSelector → Dashboard (3 tabs)        │
│  HumanTwin (SVG) │ Charts │ Forms │ Reports │ Tour       │
└────────────────────────┬─────────────────────────────────┘
                         │  REST (Axios, port 3000→8000)
                         │  WebSocket (/ws/alerts)
┌────────────────────────▼─────────────────────────────────┐
│                   BACKEND (FastAPI, port 8000)            │
│                                                          │
│  /predict          EKF update → 24-feature build →       │
│                    XGBoost → SHAP → drift check →        │
│                    (background retrain if drift)         │
│                                                          │
│  /forecast         Monte Carlo 200-particle 7-day        │
│  /simulate/cf      Counterfactual 72-hour treatment sim  │
│  /seir/update      SEIR Particle Filter Bayesian update  │
│  /hospital/…       ICU demand, risk queue, outbreak level│
│  /model/metrics    Validation metrics from train         │
│  /ws/alerts        WebSocket: drift + retrain events     │
└─────┬─────────────────┬──────────────────────────────────┘
      │                 │
┌─────▼──────┐   ┌──────▼──────┐   ┌────────────────────┐
│  Redis 7   │   │  SQLite     │   │  Open-Meteo API    │
│ (EKF state │   │ (confirmed  │   │ (6-day weather     │
│  per patient│  │  outcomes)  │   │  lags: temp+rain)  │
│  30d TTL)  │   └─────────────┘   └────────────────────┘
└────────────┘
```

### Data Flow (per prediction)

1. Clinician submits patient vitals via `PatientAdmissionForm`.
2. Frontend calls `POST /predict` with 24-field `PredictRequest`.
3. Backend: EKF updates platelet/WBC state in Redis → `build_feature_vector` assembles 24-dim numpy array → XGBoost infers P(mild/moderate/severe) → SHAP computes top-5 feature contributions → Page-Hinkley checks for drift.
4. If drift detected: background task triggers SMOTE retraining; WebSocket broadcasts `drift` event to all clients.
5. Response includes: severity probabilities, SHAP top-5, EKF derived metrics, SEIR β, day of illness.
6. Frontend updates patient card, HumanTwin animation, and all charts.

### Key Integration Points

| Component | Technology | Notes |
|---|---|---|
| ML model | XGBoost (joblib) | Trained at Docker build time; hot-swapped on retrain |
| State estimation | Extended Kalman Filter | Per-patient, Redis-backed, 30-day TTL |
| Explainability | SHAP TreeExplainer | Rebuilt lazily after retrain |
| Epidemiology | SEIR + Particle Filter | 500 particles, Poisson reweighting |
| Drift detection | Page-Hinkley test | 3 features: Platelets, WBC, SEIR_Beta |
| Counterfactuals | EKF clone simulation | 3 time steps × N scenarios |
| Weather | Open-Meteo (async) | 1-hour in-memory cache, fallback defaults |
| Persistence | Redis (state) + SQLite (outcomes) | aiosqlite for async SQLite |
| Real-time | WebSocket `/ws/alerts` | `ConnectionManager` with dead-socket cleanup |

---

## 3. Algorithm and Method Details

### 3.1 Extended Kalman Filter (EKF)

**File:** `backend/ekf_state.py`

**Purpose:** Tracks the latent clinical trajectory of each patient over time. Rather than treating each measurement as independent, the EKF maintains a continuously-updated belief about the patient's underlying physiological state and uses the history to compute *trends* (platelet velocity, WBC velocity) that the classifier uses as features.

**State vector (6-dimensional):**
```
x = [platelet, platelet_velocity, WBC, WBC_velocity, PSOS_prior, days_since_onset]
```

**Transition matrix F (6×6):**
```
F = I  with  F[0,1]=1, F[2,3]=1
```
This models platelets and WBC as "constant velocity" processes — today's value ≈ yesterday's value + velocity.

**Observation matrix H (2×6):**
```
H = [[1, 0, 0, 0, 0, 0],   # observes platelet
     [0, 0, 1, 0, 0, 0]]   # observes WBC
```

**Predict step:**
```
x_pred = F @ x_hat
P_pred = F @ P @ F.T + Q
```

**Update step (Kalman gain + state correction):**
```
y = z - H @ x_pred              # innovation
S = H @ P_pred @ H.T + R        # innovation covariance
K = P_pred @ H.T @ inv(S)       # Kalman gain
x_hat = x_pred + K @ y
P = (I - K @ H) @ P_pred
```

**Storage:** Serialised as JSON in Redis with a 30-day TTL (key: `ekf:{patient_id}`).

**Outputs fed to classifier:** `platelet_trend` (x[1]), `WBC_trend` (x[3]), `PSOS_prior` (x[4]).

---

### 3.2 XGBoost Classifier

**Files:** `backend/train.py`, `backend/retrain_pipeline.py`, `backend/main.py`

**Purpose:** Core severity classifier — predicts P(mild), P(moderate), P(severe) from the 24-feature vector for a given patient at a given day of illness.

**Hyperparameters:** `n_estimators=300, max_depth=6, learning_rate=0.05, subsample=0.8, colsample_bytree=0.8, eval_metric='mlogloss', use_label_encoder=False`

**Training data:** 2000 WHO-aligned synthetic patients (generated by `generate_synthetic_data.py`) with SMOTE applied to balance three severity classes.

**Validation output** (`validation_metrics.json`): accuracy, per-class ROC-AUC, macro ROC-AUC, Brier score, confusion matrix, calibration curve, feature importance.

**Serving:** Loaded once at FastAPI startup into `app.state.model`. After auto-retrain, hot-swapped atomically (`os.replace`) and reloaded into `app.state.model` without restarting the server.

---

### 3.3 SHAP (SHapley Additive exPlanations)

**File:** `backend/explainer.py`

**Purpose:** Provides local post-hoc explanations — for any prediction, shows which of the 24 features pushed the model toward the predicted class and by how much.

**Method:** `shap.TreeExplainer` (tree-native exact Shapley values, not approximation). Computes SHAP values for the full 3-class output; selects SHAP values for the predicted class, sorts by absolute value, returns top-N `{feature, value, shap}` dicts.

**Lifecycle:** Built once at startup from the loaded XGBoost model. Set to `None` when auto-retrain begins; rebuilt lazily (if `app.state.explainer is None`) on the next `/predict` call after retrain completes.

**Frontend visualisation:** `SHAPChart.jsx` renders a horizontal bar chart (positive SHAP = increased risk, negative = protective), colour-coded by direction.

---

### 3.4 SEIR Particle Filter

**Files:** `backend/seir_particle_filter.py`, `backend/seir_model.py`

**Purpose:** Estimates the real-time dengue transmission rate β for the city/region. β is used both as a feature in the classifier (feature index 19: `SEIR_Beta`) and to compute the `outbreak_level` in the hospital command centre.

**SEIR ODE model** (`seir_model.py`):
```
dS/dt = -β × S × I / N
dE/dt =  β × S × I / N - σ × E     (σ = 0.2, incubation)
dI/dt =  σ × E - γ × I              (γ = 0.1, recovery)
dR/dt =  γ × I
```
Solved with Euler integration. `compute_static_beta(temp, rain)` provides a weather-based prior: `β = clip(0.3 + 0.002×temp + 0.0005×rain, 0.1, 0.9)`.

**Particle Filter** (`seir_particle_filter.py`):
- 500 particles, each representing a (β, γ) hypothesis.
- **Bayesian update** on weekly new case count: weight `∝ Poisson(k=observed | λ=predicted)` computed in log-space for numerical stability.
- **Systematic resampling** when ESS (Effective Sample Size) < N/2 to prevent particle collapse.
- **Jitter noise** added post-resample to maintain diversity.
- Returns `{beta_mean, beta_std, beta_p10, beta_p90, ess}`.
- Persisted to JSON between restarts.

**Outbreak levels** (used in `/hospital/forecast`):
```
β < 0.35  → LOW
β < 0.55  → MODERATE
β < 0.72  → HIGH
β ≥ 0.72  → CRITICAL
```

---

### 3.5 Page-Hinkley Drift Detection

**File:** `backend/drift_detector.py`

**Purpose:** Detects when the distribution of incoming patient data has shifted significantly — indicating that the training-time distribution no longer matches real-world data, and the model should be retrained.

**Algorithm (for each monitored feature):**
- Maintains exponential moving average of the feature: `μ_t = α×μ_{t-1} + (1-α)×x_t` (α=0.9999)
- Cumulative sum: `M_t = M_{t-1} + (x_t - μ_t - λ)` (λ=0.005 tolerance threshold)
- Drift detected when `M_t - min(M_1..t) > δ` (δ=50 detection threshold)

**Monitored features:** `["Platelets", "WBC", "SEIR_Beta"]`

**Integration:** `DriftMonitor.update(feature_values)` is called on every `/predict` request. Returns list of drifted feature names. If non-empty, a background task calls `retrain_model(app.state)`.

---

### 3.6 Counterfactual Treatment Simulation

**File:** `backend/counterfactual_engine.py`

**Purpose:** Answers "What if?" clinical questions — e.g., "If we give this patient IV fluids and a platelet transfusion, how will they look in 72 hours?" Clinicians can compare multiple treatment scenarios side-by-side to select the one with the lowest predicted peak severity.

**Method:**
1. Clone the patient's current EKF state (platelet, platelet_velocity, WBC, WBC_velocity, ...).
2. Apply scenario adjustments to the cloned state:
   - `platelet_recovery_rate` → added to platelet_velocity (x[1])
   - `iv_fluid_effect × 0.01` → added to WBC velocity (x[3])
3. Propagate 3 steps through F matrix (each step ≈ 24 hours).
4. Build feature vector and run XGBoost inference at t=24h, t=48h, t=72h.
5. Record P(mild), P(moderate), P(severe) at each time point.
6. Mark as `recommended=True` the scenario with the lowest peak P(severe).

**Scenarios:** 1–5 scenarios per request. Each has `name`, `platelet_recovery_rate`, `iv_fluid_effect`, `description`.

**Frontend:** `CounterfactualPanel.jsx` renders line charts of P(severe) over 72h for all scenarios, with the recommended one highlighted.

---

### 3.7 Animated SVG Human Twin

**Files:** `frontend/src/components/HumanTwin.jsx`, `frontend/src/components/HumanTwin.module.css`, `frontend/src/index.css`

**Purpose:** Provides an intuitive, at-a-glance visual representation of patient state that non-technical clinical staff can interpret immediately — without reading numbers.

**Visual encodings:**

| Patient parameter | Visual change |
|---|---|
| Temperature | Skin colour interpolates from `--skin-base` (#F5CBA7) toward `--skin-fever` (#E74C3C) |
| Platelet count | Petechiae (bleeding spots) appear in tiers: 0 spots at >150, tier 1 at 100-150, tier 2 at 50-100, all 4 tiers at <50 |
| Severity (overall) | Aura animation: slow blue for Mild, faster orange for Moderate, rapid red for Severe |
| Pulse pressure | Blood vessel opacity (0.3–1.0), heart animation speed (slow/medium/critical), ECG BPM (72–130) |
| AST/ALT ratio | Liver colour shifts from healthy to inflamed; organ flash animation when >3 |
| Warning signs | Stomach opacity increases; warning badge appears when ≥2 |
| NS1 antigen | NS1 badge with virus icon appears when positive |

**Sub-components:**
- `ECGStrip`: canvas-drawn ECG line using `requestAnimationFrame`. BPM derived from pulse_pressure. Adds jitter and clipping artifacts when critical.
- `VitalSlider`: interactive range inputs that let users manually override displayed vitals in real time (local state only, doesn't re-call the API).

**Critical CSS rule:** All `@keyframes` (`heartbeat`, `heartbeatFast`, `heartbeatCritical`, `breathe`, `auraPulseMild`, `auraPulseModerate`, `auraPulseSevere`, `petechaieBleed`, `organFlash`, `shockPulse`) are defined in `index.css` (global scope). They cannot be in `HumanTwin.module.css` because CSS Modules hash keyframe names, and those hashed names would not be found by inline style `animation` props.

---

## 4. File-by-File Breakdown

### Backend

#### `backend/config.py`
- **Purpose:** Centralised environment configuration.
- **Key:** `Config` class reads `REDIS_URL`, `MODEL_PATH`, `DATA_DIR` from env; derives `DB_PATH` (SQLite), `PARTICLES_PATH` (SEIR PF JSON), `DATASET_PATH` (synthetic CSV).
- Singleton instance `config` imported by all other backend modules.

#### `backend/features.py`
- **Purpose:** Single source of truth for the 24-feature vector definition.
- **Key:** `FEATURE_COLS` (list of 24 strings in canonical order); `build_feature_vector(raw_data, ekf_data)` assembles `(1, 24)` float32 numpy array.
- **Feature ordering:** WBC(0), Platelets(1), Hematocrit(2), NS1_antigen(3), AST_ALT_ratio(4), pulse_pressure(5), warning_signs(6), Temp_lag1-6(7-12), Rain_lag1-6(13-18), SEIR_Beta(19), day_of_illness(20), platelet_trend(21), WBC_trend(22), PSOS_prior(23).
- **Contract:** This exact ordering must match `train.py` and `retrain_pipeline.py`. EKF features at indices 21-23 are zero at training time.

#### `backend/ekf_state.py`
- **Purpose:** Per-patient Extended Kalman Filter state management backed by Redis.
- **Functions:** `ekf_get_state`, `ekf_update`, `ekf_reset` (all async).
- See Section 3.1 for full mathematical detail.

#### `backend/explainer.py`
- **Purpose:** SHAP TreeExplainer wrapper.
- **Functions:** `build_explainer(model)` → `shap.TreeExplainer`; `explain_prediction(explainer, feature_vec, predicted_class_idx, top_n=5)` → list of `{feature, value, shap}` dicts.

#### `backend/forecaster.py`
- **Purpose:** 7-day Monte Carlo probabilistic forecast per patient.
- **Functions:** `forecast_patient(redis_client, patient_id, model, seir_beta)` → 200-particle simulation sampling from EKF posterior; `_flat_forecast` fallback.
- **Output:** `{days, p_severe_p5/p50/p95, p_mild_p50, p_moderate_p50}` — provides uncertainty bands (5th/50th/95th percentile) for severe probability.

#### `backend/seir_model.py`
- **Purpose:** Deterministic SEIR ODE solver used inside the particle filter.
- **Functions:** `run_seir(beta, S0, E0, I0, R0, days)` → dict of numpy arrays; `compute_static_beta(temp_mean, rain_mean)` → float.

#### `backend/seir_particle_filter.py`
- **Purpose:** Bayesian online estimation of dengue transmission rate β.
- **Class:** `SEIRParticleFilter` with `update`, `get_beta`, `save`, `load`.
- See Section 3.4 for algorithm detail.

#### `backend/drift_detector.py`
- **Purpose:** Concept drift detection for model retraining trigger.
- **Classes:** `PageHinkleyDetector` (single feature); `DriftMonitor` (monitors Platelets, WBC, SEIR_Beta).
- See Section 3.5 for algorithm detail.

#### `backend/retrain_pipeline.py`
- **Purpose:** Automated background XGBoost retraining when drift detected.
- **Function:** `retrain_model(app_state)` — fetches recent outcomes, merges with base synthetic data (anti-catastrophic-forgetting), SMOTE balancing, retrains, applies quality gates (`accuracy ≥ best_known - 0.01` AND `severe_recall ≥ 0.95`), atomic file swap, hot-swaps model, broadcasts WebSocket event, logs to `retrain_log.jsonl`.

#### `backend/counterfactual_engine.py`
- **Purpose:** Treatment scenario simulation over 72-hour horizon.
- **Function:** `run_counterfactual(redis_client, patient_id, scenarios, model_session, seir_beta)`.
- See Section 3.6 for detail.

#### `backend/weather_api.py`
- **Purpose:** Real-time weather lag fetching for feature vector.
- **Function:** `get_weather_lags(lat, lon)` — async call to Open-Meteo API; 1-hour in-memory cache; returns 6 temperature lags and 6 rainfall lags; defaults to Kuala Lumpur coords (3.139N, 101.687E).

#### `backend/outcomes_db.py`
- **Purpose:** SQLite persistence for confirmed patient outcomes (ground truth for retraining).
- **Functions:** `init_db`, `insert_outcome`, `get_outcomes_since(days)`, `get_outcomes_for_patient`, `get_all_outcomes`, `count_severe_today` — all async (aiosqlite).
- **Schema:** `patient_outcomes(id, patient_id, confirmed_severity, outcome_date, created_at)` where severity is 0=mild, 1=moderate, 2=severe.

#### `backend/generate_synthetic_data.py`
- **Purpose:** Generates 2000 WHO-aligned synthetic dengue patients for initial model training.
- **Function:** `generate_data()` — WHO severity rules for label assignment; saves to CSV; applies SMOTE to balance classes.
- Executed at Docker image build time.

#### `backend/train.py`
- **Purpose:** Initial XGBoost model training from synthetic dataset.
- **Function:** `train_model()` — 80/20 stratified split, trains XGBoost, saves `model.joblib`, saves `validation_metrics.json` and `feature_importance.json`.
- Executed at Docker image build time after data generation.

#### `backend/main.py`
- **Purpose:** FastAPI application entry point — all REST endpoints, WebSocket, startup/shutdown.
- **Key classes:** `ConnectionManager` (WebSocket management); Pydantic models: `PredictRequest`, `ScenarioItem`, `CounterfactualRequest`, `SEIRUpdateRequest`, `OutcomeRequest`.
- **Startup sequence:** load model → build SHAP explainer → connect Redis → init SEIR PF → init DriftMonitor → init SQLite DB.
- **All 15+ endpoints** documented in Section 2 (Architecture Overview).

#### `backend/demo_scenarios.json`
- **Purpose:** 4 pre-scripted demo patient journeys for instant UI demonstration.
- **Scenarios:** `classic_deterioration` (platelets drop, severe by day 5), `treatment_response` (improves under treatment), `outbreak_surge` (multiple patients, high β), `drift_retrain` (triggers model retraining).

#### `backend/Dockerfile`
- **Purpose:** Builds production backend image.
- **Key:** Runs `generate_synthetic_data.py` + `train.py` at build time; copies `validation_metrics.json` + `feature_importance.json` to `/app/` (outside volume mount) to survive Docker volume mounts.

#### `backend/requirements.txt`
- **Key deps:** `fastapi`, `uvicorn[standard]`, `xgboost`, `shap`, `numpy`, `pandas`, `scikit-learn`, `imbalanced-learn` (SMOTE), `redis[asyncio]`, `aiosqlite`, `httpx`, `joblib`, `pydantic`.

---

### Frontend

#### `frontend/src/main.jsx`
- **Purpose:** Application entry point.
- Wraps `<App>` in `<LanguageProvider>` (i18n context) and `<React.StrictMode>`.

#### `frontend/src/App.jsx`
- **Purpose:** Root component — manages global state and WebSocket connection.
- **State:** `showDashboard`, `patients[]`, `patientHistory{}`, `patientForecasts{}`, `driftAlerts[]`, `seir{}`, `hospitalData`.
- **Key functions:** `handleNewPatient(result, dayOfIllness, formPayload)` — merges/upserts patient, stores `.inputs` for report export; WebSocket `connect()` with 3s auto-reconnect and 25s ping keepalive.

#### `frontend/src/index.css`
- **Purpose:** Global CSS — design tokens (dark/light theme), reset, typography, and ALL HumanTwin animation keyframes.
- **CSS variables:** `--skin-base`, `--skin-fever`, `--color-primary`, `--bg-primary`, `--bg-card`, etc.
- **Global keyframes:** `heartbeat`, `heartbeatFast`, `heartbeatCritical`, `breathe`, `auraPulseMild`, `auraPulseModerate`, `auraPulseSevere`, `petechaieBleed`, `organFlash`, `shockPulse`.

#### `frontend/src/api/client.js`
- **Purpose:** Centralised API layer — Axios instance + all API call functions.
- **Exports:** `predict`, `simulate`, `updateSEIR`, `submitOutcome`, `getDashboardSummary`, `getForecast`, `getModelMetrics`, `getHospitalForecast`, `getDemoScenarios`, `runDemoScenario`, `getWeatherLags`, `WS_URL`.

#### `frontend/src/i18n/translations.js`
- **Purpose:** All UI strings in English (en), Bahasa Melayu (ms), and Spanish (es).
- **Keys:** landing, dashboard, tabs, severity, form fields, report labels.

#### `frontend/src/i18n/LanguageContext.jsx`
- **Purpose:** React context for i18n.
- **Exports:** `LanguageProvider` (persists `d3t-lang` to localStorage), `useLanguage()` hook with `t(key)` translator (falls back to English).

#### `frontend/src/components/Dashboard.jsx`
- **Purpose:** Main application view after login.
- **Layout:** 3-column grid (250px patient list sidebar | animated twin centre pane | 350px detail panel).
- **Tabs:** Patients / Hospital / Model Metrics (role-filtered).
- **Inner tabs for selected patient:** Forecast | Timeline | Trajectory | Counterfactual | SHAP.
- **Auto-loads demo data** on first mount (runs `classic_deterioration` + `outbreak_surge` scenarios via background API calls — controlled by `autoLoadedRef` to run only once).
- **Sub-components:** `DemoScenarioBar` (4 demo buttons).

#### `frontend/src/components/Dashboard.module.css`
- **Purpose:** Dashboard layout styles — 3-column `.patientsLayout` grid, `.twinPane` centering, responsive breakpoints at 1100px and 750px.

#### `frontend/src/components/HumanTwin.jsx`
- **Purpose:** Animated SVG human body visualisation. See Section 3.7 for full detail.
- **Sub-components:** `ECGStrip` (canvas ECG), `VitalSlider` (interactive override sliders).

#### `frontend/src/components/HumanTwin.module.css`
- **Purpose:** Layout and structural styles for HumanTwin (container, ECG strip wrapper, slider section). Does NOT contain keyframes.

#### `frontend/src/components/PatientAdmissionForm.jsx`
- **Purpose:** Form for entering new patient data.
- **Fields:** 19 clinical inputs (WBC, Platelets, Hematocrit, NS1, AST/ALT, pulse pressure, warning signs, temp/rain lags, day of illness).
- **Features:** Auto-fetches weather lags from `/weather/lags` on mount; collapsible advanced section for lag inputs; WHO warning signs reference text; client-side validation (WBC 0-20, Platelets 1-400, Hematocrit 20-65).

#### `frontend/src/components/PatientCard.jsx`
- **Purpose:** Compact patient list item in sidebar — shows ID, severity badge, platelet count, day of illness.

#### `frontend/src/components/PatientTimeline.jsx`
- **Purpose:** Visual chronological history of a patient's severity assessments.
- **Functions:** `getSeverity(entry)` — derives label from probability triplet; `getEvent(entry, prev)` — detects clinical events (Admitted, Deteriorated, Improved, etc.).
- **Render:** Vertical timeline with colour-coded dots and connector lines.

#### `frontend/src/components/PatientReport.jsx`
- **Purpose:** One-click PDF report export.
- **Method:** Lazy-loads `jspdf` + `jspdf-autotable` on button click; generates multi-page PDF with patient summary, severity probabilities, clinical values with WHO reference ranges, EKF state, SHAP attributions, 7-day forecast.
- **Filename:** `D3T_Report_{patient_id}_{date}.pdf`.

#### `frontend/src/components/LandingPage.jsx`
- **Purpose:** Login/landing page shown before dashboard.
- Displays project branding, feature highlights; Enter button calls `onEnter` callback to show Dashboard.

#### `frontend/src/components/GuidedTour.jsx`
- **Purpose:** 6-step interactive onboarding tour for new users.
- **Steps target:** patient sidebar, admit button, twin pane, detail pane, demo bar, tabs (via `data-tour` DOM attributes).
- **Mechanism:** Uses `getBoundingClientRect` to position spotlight overlay and floating tooltip; supports right/left/bottom tooltip positions; progress dots + Back/Next navigation.

#### `frontend/src/components/RoleSelector.jsx`
- **Purpose:** Switches between 4 user roles that filter Dashboard tab visibility.
- **Roles:** `doctor` (Patients tab only), `admin` (Patients + Hospital), `epidemiologist` (all tabs), `all` (all tabs).
- Exports `ROLES` constant used by Dashboard to conditionally render tabs.

#### `frontend/src/components/ThemeToggle.jsx`
- **Purpose:** Dark/light mode toggle.
- Persists `d3t-theme` to localStorage; sets `data-theme="dark"` or `data-theme="light"` on `document.documentElement` (CSS variables respond to this attribute).

#### `frontend/src/components/LanguageSelector.jsx`
- **Purpose:** Inline EN / BM / ES language switcher.
- Renders three text buttons; active language highlighted.

#### `frontend/src/components/ForecastChart.jsx`
- **Purpose:** Recharts area chart showing 7-day P(severe) with uncertainty bands (p5/p50/p95).

#### `frontend/src/components/SHAPChart.jsx`
- **Purpose:** Horizontal bar chart of SHAP feature attributions (positive = risk-increasing, negative = protective).

#### `frontend/src/components/TrajectoryChart.jsx`
- **Purpose:** Line chart of historical severity probability across a patient's admission days.

#### `frontend/src/components/HospitalPanel.jsx`
- **Purpose:** Hospital Command Centre view (admin/epidemiologist role).
- Shows: total patients, severity census (mild/moderate/severe counts), ICU demand estimate, top-10 risk patients, outbreak level badge, SEIR β value and trend.

#### `frontend/src/components/MetricsPanel.jsx`
- **Purpose:** Model performance view.
- Shows: accuracy, per-class ROC-AUC, macro AUC, Brier score, severe recall, confusion matrix, calibration curve, feature importance chart.

#### `frontend/src/components/SEIRStatus.jsx`
- **Purpose:** Compact SEIR epidemic status widget showing β, outbreak level, ESS.

#### `frontend/src/components/DriftAlertBanner.jsx`
- **Purpose:** Dismissable banner shown when drift detected — lists drifted features and indicates whether retraining is in progress.

#### `frontend/src/components/CounterfactualPanel.jsx`
- **Purpose:** Treatment simulation interface — scenario input sliders + multi-line chart comparing 72-hour trajectories; recommended scenario highlighted.

---

### Infrastructure

#### `docker-compose.yml`
- **Services:** `redis` (redis:7-alpine, port 6379), `backend` (builds `./backend`, port 8000), `frontend` (builds `./frontend`, port 3000).
- **No Prometheus/Grafana** (removed in v3).
- Named volume `redis_data` for EKF state persistence across container restarts.

#### `README.md`
- Project overview, quick-start instructions, feature list.

#### `.gitignore`
- Excludes `__pycache__`, `.env`, `node_modules`, `dist`, `*.joblib`, `data/`, `*.db`.

---

## 5. Data Handling

### Synthetic Training Data

- **Generator:** `backend/generate_synthetic_data.py`
- **Volume:** 2000 patients, 24 features each.
- **WHO severity labelling logic:**
  - **Severe (label=2):** platelets < 30, HCT > 52, pulse_pressure < 20, AST_ALT_ratio > 3, warning_signs ≥ 4
  - **Moderate (label=1):** platelets < 80, HCT > 46, WBC < 3, warning_signs ≥ 2, AST_ALT_ratio > 1.8, pulse_pressure < 28
  - **Mild (label=0):** all others
- **SMOTE:** Applied to balance classes before saving to CSV.
- **Storage:** `backend/data/synthetic_dengue_data.csv` (volume-mounted, persists between runs).

### Real-Time Patient Data

- Entered via `PatientAdmissionForm` (manual clinical entry).
- Weather lags auto-populated from Open-Meteo API (6-day historical temperature + precipitation).
- Each prediction call updates the patient's EKF state in Redis.
- Prediction results stored in `app.state.patient_predictions` (in-memory, resets on restart).

### Outcomes / Ground Truth

- Clinicians submit confirmed outcomes via `/outcome` endpoint.
- Stored in `patient_outcomes` SQLite table (aiosqlite).
- Used by retrain pipeline: fetches last 90 days of outcomes (minimum 100 required).

### Weather Integration

- **Source:** Open-Meteo public API (free, no key required).
- **Data:** 6-day daily max temperature (°C) + total precipitation (mm) for a given lat/lon.
- **Features:** Temp_lag1 (yesterday) through Temp_lag6 (6 days ago); Rain_lag1 through Rain_lag6.
- **Default location:** Kuala Lumpur (3.139°N, 101.687°E).
- **Cache:** 1-hour in-memory cache to avoid redundant API calls.
- **Fallback:** 30°C temperature, 10mm rain on API error.

### Persistence

| Data type | Storage | Mechanism |
|---|---|---|
| EKF state (per patient) | Redis | JSON-serialised, 30-day TTL |
| Confirmed outcomes | SQLite (`patient_outcomes`) | aiosqlite async writes |
| SEIR particle state | JSON file (`seir_particles.json`) | Saved/loaded by particle filter |
| Retrain log | JSONL (`retrain_log.jsonl`) | Append-only |
| Trained model | File (`model.joblib`) | Atomic replace on retrain |
| Validation metrics | JSON (`validation_metrics.json`) | Written at train time |

### Visualisation Pipeline

1. Raw patient data → EKF update → 24-feature vector → XGBoost → probabilities + SHAP.
2. Probabilities → HumanTwin SVG animations (severity aura, skin tone, petechiae).
3. SHAP values → `SHAPChart.jsx` horizontal bars.
4. 7-day forecast → `ForecastChart.jsx` area chart with percentile bands.
5. Historical predictions → `TrajectoryChart.jsx` line chart.
6. Counterfactual scenarios → `CounterfactualPanel.jsx` multi-line comparison.
7. All data → `PatientReport.jsx` → PDF export.

---

## 6. User Experience Features

### Landing Page

- Component: `LandingPage.jsx`
- Displays D3T branding, key feature highlights, and an "Enter Dashboard" button.
- No authentication — the role selector on the dashboard provides access control.

### Role-Based Views

- Component: `RoleSelector.jsx`
- **Doctor:** Sees only the Patients tab (patient list, twin, individual charts).
- **Admin:** Sees Patients + Hospital Command Centre tabs.
- **Epidemiologist:** Sees all tabs including Model Metrics.
- **All:** Full access (default for demo).

### Dashboard

- 3-column layout: patient sidebar → animated twin → charts/detail.
- Auto-loads two demo scenarios on first open so the UI is never empty.
- Tabs per patient: Forecast / Timeline / Trajectory / Counterfactual / SHAP.
- "Admit Patient" modal overlay for new patient entry.

### Animated Human Twin

- Real-time visual encoding of 7+ clinical parameters simultaneously.
- Interactive vital sliders let users explore "what-if" visual changes without calling the API.
- ECG strip with BPM derived from pulse pressure.
- See Section 3.7 for full technical detail.

### Guided Tour

- Component: `GuidedTour.jsx`
- 6-step interactive walkthrough using DOM spotlight and floating tooltips.
- Highlights: patient list → admit button → twin pane → detail pane → demo bar → role tabs.
- Accessible via a "Take Tour" button in the dashboard header.

### PDF Report Export

- Component: `PatientReport.jsx`
- One-click export of a full clinical summary PDF for any selected patient.
- Includes: severity probability table, clinical values with WHO reference ranges, EKF state, SHAP attributions, 7-day forecast.

### Dark Mode

- Component: `ThemeToggle.jsx`
- Toggles `data-theme` on `<html>` element.
- All colours defined as CSS variables in `index.css` responding to `[data-theme="dark"]` and `[data-theme="light"]`.
- Preference persisted to `localStorage`.

### Multi-Language Support

- Languages: English (en), Bahasa Melayu (ms), Spanish (es).
- Component: `LanguageSelector.jsx` + `LanguageContext.jsx` + `translations.js`.
- All UI strings use `t(key)` from `useLanguage()` hook.
- Selected language persisted to `localStorage`.

### Mobile Responsiveness

- `Dashboard.module.css` includes responsive breakpoints:
  - ≤1100px: twin pane stacks below patient list.
  - ≤750px: single-column layout, sidebar becomes top list.

### Patient Timeline

- Component: `PatientTimeline.jsx`
- Vertical timeline of all assessments for a patient.
- Detects and labels clinical events: Admitted, Deteriorated to Severe, Worsened to Moderate, Improved to Mild, Improving, Assessment Updated.
- Colour-coded severity dots.

### Demo Scenarios

- 4 scripted scenarios accessible from `DemoScenarioBar` in the dashboard header.
- Scenario data in `demo_scenarios.json`; each step calls `/predict` in sequence.
- Allow demonstration of the full system without manual data entry.

### Drift Alert Banner

- Component: `DriftAlertBanner.jsx`
- Appears when WebSocket receives a `drift` event.
- Shows which features drifted; updates to "Retraining..." when `retrain` event arrives; dismissable.

---

## 7. Testing and Reliability

### Unit Tests

Located in `backend/tests/`. Run with `pytest`.

#### `test_features.py` (5 tests)
- Asserts FEATURE_COLS has exactly 24 entries with no duplicates.
- Verifies `build_feature_vector` returns `(1, 24)` float32 array.
- Checks specific feature values at known indices (WBC@0, Platelets@1, SEIR_Beta@19, platelet_trend@21).
- Checks default values for optional fields (Hematocrit=40.0, EKF features=0.0).

#### `test_drift_detector.py` (6 tests)
- Verifies no false drift on 100 identical values.
- Verifies drift triggers on sudden 3× mean shift.
- Verifies `reset()` clears all state.
- Verifies `DriftMonitor` returns empty list on stable inputs.
- Verifies all 3 monitored features appear in status dict.
- Verifies unknown features are silently ignored.

#### `test_seir_model.py` (6 tests)
- Population conservation (S+E+I+R = constant throughout simulation).
- No infection when β=0 (S stays unchanged).
- Correct output array lengths (days+1).
- Epidemic curve shape (peak I > initial, I[-1] < peak).
- `compute_static_beta` clamped to [0.1, 0.9].
- Higher temperature raises β.

#### `test_seir_particle_filter.py` (3 tests)
- Initial β is within valid range [0.1, 0.9].
- `update()` returns dict with all required keys.
- 5 updates with 2000 cases/week raises mean β (epidemiologically correct).

### Drift Detection (Runtime)

- Page-Hinkley test runs on every `/predict` call — no manual intervention needed.
- Monitored features: Platelets, WBC, SEIR_Beta.
- Drift triggers background retraining automatically.

### Auto-Retraining

- Triggered by drift detection.
- Quality gates prevent deploying a worse model:
  - `accuracy ≥ best_known_accuracy - 0.01`
  - `severe_recall ≥ 0.95` (hard floor to protect critical case detection)
- Atomic file swap prevents serving a partially-written model.
- WebSocket broadcast notifies frontend when retraining completes.
- All retrain events logged to `retrain_log.jsonl` for audit.

### SHAP Explainer Lifecycle Safety

- SHAP explainer set to `None` immediately before retrain starts.
- Rebuilt lazily on first `/predict` after retrain completes.
- Prevents serving stale explanations from the old model.

### Reliability Patterns

- WebSocket auto-reconnects after 3 seconds on disconnect; 25-second ping keepalive.
- Redis connection failure → FastAPI logs error, endpoints that need EKF state return graceful error.
- Weather API failure → returns default values (30°C, 10mm), logs warning.
- Open-Meteo 1-hour cache prevents rate limiting.
- Patient predictions in-memory dict: tolerates Redis restart (EKF state would be lost but predictions continue with flat priors).

---

## 8. Deployment Instructions

### Prerequisites

- Docker Desktop (or Docker Engine + Docker Compose v2)
- At least 4GB RAM for the build step (XGBoost training)
- Ports 3000 and 8000 available

### Quick Start

```bash
# Clone the repository
git clone <repo-url>
cd d3t

# Build and start all services (first build ~10 minutes due to data generation + model training)
docker compose up --build

# Access the application
# Frontend: http://localhost:3000
# Backend API: http://localhost:8000
# API docs: http://localhost:8000/docs
```

### Services

| Service | Port | Description |
|---|---|---|
| redis | 6379 | EKF state store |
| backend | 8000 | FastAPI + ML inference |
| frontend | 3000 | React Vite app |

### Stopping

```bash
docker compose down          # stop containers, preserve data volumes
docker compose down -v       # stop containers AND delete Redis data
```

### Local Development (without Docker)

**Backend:**
```bash
cd backend
python -m venv venv && source venv/bin/activate   # or venv\Scripts\activate on Windows
pip install -r requirements.txt
python generate_synthetic_data.py
python train.py
uvicorn main:app --reload --port 8000
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev   # starts on port 3000 (or 5173 in some Vite configs)
```

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `REDIS_URL` | `redis://redis:6379` | Redis connection string |
| `MODEL_PATH` | `/app/data/model.joblib` | Path to XGBoost model file |
| `DATA_DIR` | `/app/data` | Directory for SQLite DB, particles, logs |
| `VITE_API_URL` | `http://localhost:8000` | Backend URL for frontend Axios client |

### Running Tests

```bash
cd backend
pip install pytest
pytest tests/ -v
```

### Data Persistence

- Redis data: stored in Docker named volume `redis_data` — survives container restarts.
- SQLite DB + retrain log + SEIR particles: stored in `./backend/data/` (bind-mounted volume) — persist on host filesystem.
- Model file (`model.joblib`): also in `./backend/data/` — persists auto-retrained models.

---

## 9. Skill Metadata

```json
{
  "skill_id": "d3t-dengue-digital-twin",
  "name": "D3T Dengue Digital Twin",
  "version": "3.0.0",
  "release_date": "2026-04",
  "short_description": "AI-powered dengue patient monitoring system with XGBoost severity classification, EKF state tracking, SEIR epidemiology, SHAP explainability, counterfactual treatment simulation, and animated SVG human body visualisation.",
  "long_description": "D3T is a full-stack clinical decision-support system for dengue fever. It creates a real-time digital twin of each patient by combining bedside clinical data with weather and epidemiological context. The system classifies severity (Mild/Moderate/Severe), forecasts 7-day trajectories, explains predictions with SHAP, simulates counterfactual treatments, detects model drift automatically, retrains when data distributions shift, and visualises all of this through an animated SVG human body. Built with FastAPI (backend) and React+Vite (frontend), deployable via Docker Compose.",
  "tags": [
    "dengue",
    "digital-twin",
    "clinical-decision-support",
    "XGBoost",
    "SHAP",
    "explainability",
    "Extended Kalman Filter",
    "SEIR",
    "particle-filter",
    "concept-drift",
    "Page-Hinkley",
    "counterfactual",
    "Monte Carlo",
    "FastAPI",
    "React",
    "Vite",
    "SVG animation",
    "epidemiology",
    "machine-learning",
    "healthcare-AI",
    "auto-retraining",
    "SMOTE",
    "multilingual",
    "PDF-report",
    "docker",
    "Redis",
    "SQLite",
    "WebSocket"
  ],
  "keywords": [
    "dengue severity prediction",
    "platelet trend tracking",
    "NS1 antigen",
    "warning signs",
    "hematocrit",
    "pulse pressure",
    "AST ALT ratio",
    "fever skin tone",
    "petechiae visualisation",
    "organ glow",
    "ECG strip",
    "hospital command centre",
    "outbreak level",
    "drift detection",
    "model retraining",
    "treatment simulation",
    "7-day forecast",
    "Bahasa Melayu",
    "guided tour",
    "role-based dashboard"
  ],
  "tech_stack": {
    "backend": ["Python 3.11", "FastAPI", "XGBoost", "SHAP", "scikit-learn", "imbalanced-learn", "Redis", "SQLite", "aiosqlite", "httpx", "numpy", "pandas"],
    "frontend": ["React 18", "Vite", "Recharts", "CSS Modules", "Axios", "jsPDF", "jspdf-autotable"],
    "infrastructure": ["Docker", "Docker Compose", "Redis 7"]
  },
  "ports": {
    "frontend": 3000,
    "backend": 8000,
    "redis": 6379
  },
  "api_endpoints": [
    "POST /predict",
    "POST /simulate/counterfactual",
    "POST /seir/update",
    "POST /outcome",
    "GET /patient/{patient_id}/history",
    "GET /dashboard/summary",
    "GET /forecast/{patient_id}",
    "GET /model/metrics",
    "GET /hospital/forecast",
    "GET /demo/scenarios",
    "POST /demo/run/{scenario_id}",
    "GET /weather/lags",
    "GET /health",
    "WS /ws/alerts"
  ],
  "feature_count": 24,
  "severity_classes": ["Mild", "Moderate", "Severe"],
  "languages_supported": ["English (en)", "Bahasa Melayu (ms)", "Spanish (es)"]
}
```

---
