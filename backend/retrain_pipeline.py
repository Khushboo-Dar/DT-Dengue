"""
Automated SMOTE retraining pipeline.

Triggered by DriftMonitor via FastAPI BackgroundTasks.
Merges confirmed outcomes with the synthetic base dataset (catastrophic-forgetting guard),
applies SMOTE, trains a new RandomForest, validates on a 20% holdout, and hot-swaps
the ONNX session in app.state if the new model passes quality gates.
"""
import json
import os
from datetime import datetime

import joblib
import numpy as np
import pandas as pd
from imblearn.over_sampling import SMOTE
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import recall_score
from sklearn.model_selection import train_test_split

from config import config
from outcomes_db import get_all_outcomes, get_outcomes_since

FEATURE_COLS: list[str] = [
    "WBC", "Platelets",
    "Temp_lag1", "Temp_lag2", "Temp_lag3", "Temp_lag4", "Temp_lag5", "Temp_lag6",
    "Rain_lag1", "Rain_lag2", "Rain_lag3", "Rain_lag4", "Rain_lag5", "Rain_lag6",
    "SEIR_Beta", "day_of_illness",
    "platelet_trend", "WBC_trend", "PSOS_prior",
]

_C = "\033[96m"
_G = "\033[92m"
_Y = "\033[93m"
_R = "\033[91m"
_B = "\033[1m"
_X = "\033[0m"


def _log(entry: dict) -> None:
    log_path = os.path.join(config.DATA_DIR, "retrain_log.jsonl")
    with open(log_path, "a") as fh:
        fh.write(json.dumps(entry) + "\n")


def _best_known_accuracy() -> float:
    """Read the highest accepted accuracy from the retrain log; default 0.95."""
    log_path = os.path.join(config.DATA_DIR, "retrain_log.jsonl")
    if not os.path.exists(log_path):
        return 0.95
    best = 0.95
    with open(log_path) as fh:
        for line in fh:
            try:
                entry = json.loads(line)
                if entry.get("retrained") and "accuracy" in entry:
                    best = max(best, float(entry["accuracy"]))
            except (json.JSONDecodeError, KeyError):
                continue
    return best


async def retrain_model(app_state) -> dict:
    ts = datetime.utcnow().isoformat()
    _log({"event": "retrain_triggered", "timestamp": ts})
    print(f"\n{_Y}{_B}[RETRAIN]{_X} ⚡  Triggered at {ts}")

    # ── 1. Fetch confirmed outcomes ──────────────────────────────────────────
    outcomes = await get_outcomes_since(90)
    if len(outcomes) < 100:
        outcomes = await get_all_outcomes()

    if len(outcomes) < 100:
        msg = f"Insufficient confirmed outcomes ({len(outcomes)} < 100). Skipping."
        _log({"event": "skip", "reason": msg, "timestamp": ts})
        print(f"{_R}[RETRAIN]{_X} ✗ {msg}")
        return {"retrained": False, "accuracy": None, "severe_recall": None}

    print(f"{_C}[RETRAIN]{_X}   Outcomes available: {len(outcomes)}")

    # ── 2. Build outcome rows (default features, confirmed labels) ───────────
    outcome_rows = []
    for rec in outcomes:
        row = {col: 0.0 for col in FEATURE_COLS}
        row["severity_label"] = int(rec["confirmed_severity"])
        outcome_rows.append(row)
    outcomes_df = pd.DataFrame(outcome_rows)

    # ── 3. Load synthetic base dataset (catastrophic-forgetting guard) ───────
    base_df = pd.read_csv(config.DATASET_PATH)
    for col in ("platelet_trend", "WBC_trend", "PSOS_prior"):
        if col not in base_df.columns:
            base_df[col] = 0.0

    combined = pd.concat(
        [base_df[FEATURE_COLS + ["severity_label"]], outcomes_df],
        ignore_index=True,
    )

    X = combined[FEATURE_COLS].values.astype(np.float32)
    y = combined["severity_label"].values.astype(int)

    # ── 4. Train / test split then SMOTE on training fold ───────────────────
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, stratify=y, random_state=42
    )
    X_res, y_res = SMOTE(random_state=42).fit_resample(X_train, y_train)

    # ── 5. Train ─────────────────────────────────────────────────────────────
    clf = RandomForestClassifier(
        n_estimators=200, max_depth=12, random_state=42, n_jobs=-1
    )
    clf.fit(X_res, y_res)

    # ── 6. Evaluate ──────────────────────────────────────────────────────────
    y_pred = clf.predict(X_test)
    accuracy = float(np.mean(y_pred == y_test))

    severe_indices = np.where(y_test == 2)[0]
    severe_recall = (
        float(np.mean(y_pred[severe_indices] == 2)) if len(severe_indices) > 0 else 1.0
    )

    current_acc = _best_known_accuracy()
    print(
        f"{_C}[RETRAIN]{_X}   acc={accuracy:.4f} (prev={current_acc:.4f})"
        f"  |  severe_recall={severe_recall:.4f}"
    )

    # ── 7. Accept / reject ───────────────────────────────────────────────────
    if accuracy >= current_acc - 0.01 and severe_recall >= 0.95:
        tmp_path = config.MODEL_PATH + ".new"
        joblib.dump(clf, tmp_path)
        os.replace(tmp_path, config.MODEL_PATH)  # atomic swap

        # Hot-reload model
        app_state.model = joblib.load(config.MODEL_PATH)
        app_state.model_last_retrained = ts

        importances = dict(zip(FEATURE_COLS, clf.feature_importances_))
        with open(os.path.join(config.DATA_DIR, "feature_importance.json"), "w") as fh:
            json.dump(importances, fh, indent=2)

        _log({"event": "retrained", "retrained": True, "accuracy": accuracy,
              "severe_recall": severe_recall, "timestamp": ts})
        print(f"{_G}[RETRAIN]{_X} ✓ Model accepted & hot-reloaded  acc={accuracy:.4f}")

        if hasattr(app_state, "ws_broadcast"):
            await app_state.ws_broadcast(
                {"type": "retrain", "accuracy": round(accuracy, 4), "timestamp": ts}
            )

        return {"retrained": True, "accuracy": accuracy, "severe_recall": severe_recall}

    # Model rejected
    _log({"event": "model_rejected", "retrained": False,
          "accuracy": accuracy, "severe_recall": severe_recall, "timestamp": ts})
    print(
        f"{_R}[RETRAIN]{_X} ✗ Rejected — "
        f"acc={accuracy:.4f}  severe_recall={severe_recall:.4f}"
    )
    return {"retrained": False, "accuracy": accuracy, "severe_recall": severe_recall}
