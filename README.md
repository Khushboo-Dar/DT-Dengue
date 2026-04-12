# D3T — Dynamic Dengue Digital Twin

A real-time AI-powered clinical monitoring system for dengue hemorrhagic fever.
The system maintains a **living digital twin** of each patient — predicting severity, tracking clinical trajectory over time, simulating treatment scenarios, and auto-retraining when the model drifts.

---

## Architecture at a glance

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser  →  React 18 + Recharts (port 3000)                    │
│               ↕ REST + WebSocket                                │
│  FastAPI  →  sklearn RF · EKF state (Redis) · SEIR PF          │
│               ↕                                                 │
│  Redis 7  (patient EKF state)   SQLite (outcomes)              │
└─────────────────────────────────────────────────────────────────┘
```

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.11 · FastAPI · scikit-learn · Redis · SQLite |
| Frontend | React 18 · Vite · Recharts · plain CSS Modules |
| Inference | joblib-serialised RandomForestClassifier (`model.joblib`) |
| State | Extended Kalman Filter per patient, stored in Redis |
| Epidemiology | SEIR Particle Filter (500 particles) |
| Drift | Page-Hinkley detector · async auto-retrain |

---

## Option A — Docker (recommended for any OS)

This is the fastest path. One command builds everything, trains the model, and starts all services.

### Prerequisites

| Tool | Minimum version |
|------|----------------|
| Docker Engine | 24+ |
| Docker Compose | v2 (bundled with Docker Desktop / Engine) |

#### Install Docker on Ubuntu

```bash
# Remove old versions
sudo apt-get remove -y docker docker-engine docker.io containerd runc 2>/dev/null

# Add Docker's official repo
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Allow running docker without sudo (log out and back in after this)
sudo usermod -aG docker $USER
newgrp docker

# Verify
docker --version
docker compose version
```

### Clone and run

```bash
git clone <your-repo-url> d3t
cd d3t
docker compose up --build
```

> **First build takes ~5 minutes** — pip installs all Python deps and trains the RandomForest model.
> Subsequent starts (no `--build`) take ~10 seconds.

### Check it's running

| Service | URL |
|---------|-----|
| Frontend UI | http://localhost:3000 |
| API docs (Swagger) | http://localhost:8000/docs |
| API health | http://localhost:8000/dashboard/summary |

### Stop

```bash
docker compose down          # stops containers, keeps data volumes
docker compose down -v       # also deletes Redis data volume
```

---

## Option B — Local development (Ubuntu)

Use this when you want live hot-reload on both backend and frontend without Docker overhead.

### 1. System dependencies

```bash
sudo apt-get update
sudo apt-get install -y python3.11 python3.11-venv python3.11-dev \
                        build-essential curl git redis-server
```

Verify Python version:
```bash
python3.11 --version   # must be 3.11.x
```

#### Install Node.js 20 (via NodeSource)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version    # v20.x.x
npm --version
```

#### Start Redis

```bash
sudo systemctl enable redis-server
sudo systemctl start redis-server
redis-cli ping    # should return PONG
```

---

### 2. Backend setup

```bash
cd d3t/backend

# Create virtual environment
python3.11 -m venv venv
source venv/bin/activate

# Install dependencies
pip install --upgrade pip
pip install -r requirements.txt
```

#### Generate dataset + train model (one-time)

```bash
# Inside backend/ with venv activated
python generate_synthetic_data.py   # creates data/dengue_dataset.csv
python train.py                      # creates model.joblib + data/feature_importance.json
```

You should see a classification report printed and:
```
Model saved to model.joblib
Training complete.
```

#### Start the backend server

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

The terminal will print the D3T startup banner with green checkmarks for each component.

---

### 3. Frontend setup

Open a **second terminal**:

```bash
cd d3t/frontend
npm install          # first time only — installs React, Recharts, axios, Vite
npm run dev
```

Vite prints:
```
  VITE v5.x.x  ready in Xms
  ➜  Local:   http://localhost:3000/
```

---

### 4. Environment variables (local)

The defaults work out of the box for local dev. To override, create `backend/.env` (never committed):

```env
REDIS_URL=redis://localhost:6379
MODEL_PATH=model.joblib
DATA_DIR=data
```

For the frontend, create `frontend/.env.local`:

```env
VITE_API_URL=http://localhost:8000
```

---

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/predict` | Run inference for a patient, update EKF state |
| `POST` | `/simulate/counterfactual` | Simulate up to 5 treatment scenarios |
| `POST` | `/seir/update` | Feed weekly case count into particle filter |
| `POST` | `/outcome` | Record a confirmed severity outcome |
| `GET`  | `/patient/{id}/history` | EKF state + outcome history for a patient |
| `GET`  | `/dashboard/summary` | System-wide stats (patients tracked, drift, beta) |
| `WS`   | `/ws/alerts` | WebSocket — receives drift and retrain events |

Full interactive docs at **http://localhost:8000/docs**.

### Quick smoke test

```bash
# 1. Predict
curl -s -X POST http://localhost:8000/predict \
  -H "Content-Type: application/json" \
  -d '{"patient_id":"P001","day_of_illness":3,"WBC":3.5,"Platelets":85}' \
  | python3 -m json.tool

# 2. Dashboard
curl -s http://localhost:8000/dashboard/summary | python3 -m json.tool

# 3. Counterfactual simulation
curl -s -X POST http://localhost:8000/simulate/counterfactual \
  -H "Content-Type: application/json" \
  -d '{
    "patient_id": "P001",
    "scenarios": [
      {"label": "No Treatment",    "iv_fluid_effect": 0,  "platelet_recovery_rate": 0},
      {"label": "Aggressive",      "iv_fluid_effect": 90, "platelet_recovery_rate": 15}
    ]
  }' | python3 -m json.tool

# 4. SEIR update
curl -s -X POST http://localhost:8000/seir/update \
  -H "Content-Type: application/json" \
  -d '{"week_end_date":"2025-04-12","new_cases":312}' \
  | python3 -m json.tool

# 5. Verify Redis stored EKF state (Docker)
docker exec d3t-redis-1 redis-cli GET patient:P001:ekf

# 5b. Verify Redis (local)
redis-cli GET patient:P001:ekf
```

---

## Project structure

```
d3t/
├── docker-compose.yml
├── .gitignore
├── README.md
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── config.py                  # env var config
│   ├── generate_synthetic_data.py # creates 2,000 synthetic patient records
│   ├── train.py                   # trains RF, saves model.joblib
│   ├── main.py                    # FastAPI app — all endpoints + WebSocket
│   ├── features.py                # builds 19-feature vector
│   ├── ekf_state.py               # Extended Kalman Filter (Redis-backed)
│   ├── seir_model.py              # SEIR ODE
│   ├── seir_particle_filter.py    # 500-particle Bayesian SEIR calibration
│   ├── drift_detector.py          # Page-Hinkley drift detector
│   ├── retrain_pipeline.py        # async SMOTE retraining pipeline
│   ├── counterfactual_engine.py   # EKF propagation for treatment paths
│   ├── outcomes_db.py             # aiosqlite CRUD
│   └── data/
│       ├── dengue_dataset.csv     # committed seed dataset (2,000 records)
│       ├── model.joblib           # generated — gitignored
│       ├── outcomes.db            # generated at runtime — gitignored
│       ├── seir_particles.json    # generated at runtime — gitignored
│       └── feature_importance.json # generated at runtime — gitignored
└── frontend/
    ├── Dockerfile
    ├── package.json
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── main.jsx
        ├── App.jsx                # global state + WebSocket lifecycle
        ├── index.css
        ├── api/
        │   └── client.js          # axios wrapper for all API calls
        └── components/
            ├── Dashboard.jsx      # two-column master layout
            ├── PatientCard.jsx    # 72px compact patient row
            ├── TrajectoryChart.jsx # PSOS probability over illness day
            ├── CounterfactualPanel.jsx # treatment simulation sliders + chart
            ├── SEIRStatus.jsx     # SVG arc gauge for community β
            └── DriftAlertBanner.jsx # amber WebSocket alert banner
```

---

## Troubleshooting

### Port already in use

```bash
# Find and kill what's using port 8000 or 3000
sudo lsof -ti :8000 | xargs kill -9
sudo lsof -ti :3000 | xargs kill -9
```

### Redis connection refused (local)

```bash
sudo systemctl status redis-server
sudo systemctl start redis-server
```

### Backend can't find model.joblib

You haven't run training yet:
```bash
cd backend && source venv/bin/activate
python generate_synthetic_data.py && python train.py
```

### Docker: permission denied on /var/run/docker.sock

```bash
sudo usermod -aG docker $USER
newgrp docker   # apply without logout
```

### Docker: old build cache causing issues

```bash
docker compose down -v
docker compose build --no-cache
docker compose up
```

### Frontend shows "Could not reach backend"

- Confirm the backend is running on port 8000
- Check `VITE_API_URL` in `frontend/.env.local` (local) or `docker-compose.yml` (Docker)
- The browser connects to `http://localhost:8000` — if running Docker on a remote server replace `localhost` with the server IP in both `docker-compose.yml` and the browser URL

---

## How the UI works

1. Open **http://localhost:3000**
2. Click **"+ Add Test Patient"** — generates synthetic clinical data, calls `POST /predict`, and renders a `PatientCard`
3. Click a card to select the patient — the **Trajectory Chart** shows mild/moderate/severe probability lines over illness day
4. Adjust the sliders in **Treatment Counterfactuals** and click **"Run Simulation"** — four scenario trajectories appear; the recommended one (lowest peak P_severe) is highlighted in green
5. Click **"Update Outbreak Data"** in the SEIR gauge to submit new weekly case counts and watch the β posterior update live
6. The amber **Drift Alert Banner** appears automatically via WebSocket when the Page-Hinkley detector flags a feature shift
