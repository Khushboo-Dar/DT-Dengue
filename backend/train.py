"""
Training script — v2.
  • XGBoost classifier (replaces RandomForest)
  • Proper train/test split (no data leakage)
  • Saves validation_metrics.json: ROC-AUC, calibration buckets,
    confusion matrix, Brier score, feature importance
"""
import json
import os

import joblib
import numpy as np
import pandas as pd
from sklearn.calibration import calibration_curve
from sklearn.metrics import (
    brier_score_loss,
    classification_report,
    confusion_matrix,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import label_binarize
from xgboost import XGBClassifier

from config import config
from features import FEATURE_COLS


def train_model():
    df = pd.read_csv(config.DATASET_PATH)

    # EKF-derived features are zero at training time (no prior state)
    for col in ("platelet_trend", "WBC_trend", "PSOS_prior"):
        if col not in df.columns:
            df[col] = 0.0

    X = df[FEATURE_COLS].values.astype(np.float32)
    y = df["severity_label"].values.astype(int)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.20, stratify=y, random_state=42
    )

    clf = XGBClassifier(
        n_estimators=300,
        max_depth=6,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        use_label_encoder=False,
        eval_metric="mlogloss",
        random_state=42,
        n_jobs=-1,
    )
    clf.fit(X_train, y_train,
            eval_set=[(X_test, y_test)],
            verbose=False)

    y_pred  = clf.predict(X_test)
    y_proba = clf.predict_proba(X_test)       # (n, 3)

    print(classification_report(y_test, y_pred,
                                 target_names=["mild", "moderate", "severe"]))

    # ── ROC-AUC (one-vs-rest) ────────────────────────────────────────────────
    y_bin = label_binarize(y_test, classes=[0, 1, 2])
    auc_per_class = {}
    for i, name in enumerate(["mild", "moderate", "severe"]):
        auc_per_class[name] = round(float(roc_auc_score(y_bin[:, i], y_proba[:, i])), 4)
    auc_macro = round(float(roc_auc_score(y_bin, y_proba, multi_class="ovr",
                                          average="macro")), 4)

    # ── Calibration curve (severe class — most clinically relevant) ──────────
    fraction_pos, mean_pred = calibration_curve(
        (y_test == 2).astype(int), y_proba[:, 2], n_bins=10, strategy="uniform"
    )

    # ── Brier score (severe) ────────────────────────────────────────────────
    brier = round(float(brier_score_loss((y_test == 2).astype(int), y_proba[:, 2])), 4)

    # ── Confusion matrix ────────────────────────────────────────────────────
    cm = confusion_matrix(y_test, y_pred, labels=[0, 1, 2]).tolist()

    # ── Accuracy ────────────────────────────────────────────────────────────
    accuracy = round(float(np.mean(y_pred == y_test)), 4)

    # ── Severe recall ────────────────────────────────────────────────────────
    sev_idx     = np.where(y_test == 2)[0]
    sev_recall  = round(float(np.mean(y_pred[sev_idx] == 2)), 4) if len(sev_idx) else 1.0

    # ── Feature importance ───────────────────────────────────────────────────
    importances = dict(zip(FEATURE_COLS,
                           [round(float(v), 6) for v in clf.feature_importances_]))

    # ── Save ─────────────────────────────────────────────────────────────────
    os.makedirs(config.DATA_DIR, exist_ok=True)

    joblib.dump(clf, config.MODEL_PATH)
    print(f"Model saved → {config.MODEL_PATH}")

    metrics = {
        "accuracy":       accuracy,
        "severe_recall":  sev_recall,
        "brier_score":    brier,
        "roc_auc": {**auc_per_class, "macro": auc_macro},
        "calibration": {
            "fraction_of_positives": [round(float(v), 4) for v in fraction_pos],
            "mean_predicted_value":  [round(float(v), 4) for v in mean_pred],
        },
        "confusion_matrix": cm,
        "feature_importance": importances,
        "n_test": int(len(y_test)),
        "class_labels": ["mild", "moderate", "severe"],
    }
    with open(os.path.join(config.DATA_DIR, "validation_metrics.json"), "w") as f:
        json.dump(metrics, f, indent=2)

    with open(os.path.join(config.DATA_DIR, "feature_importance.json"), "w") as f:
        json.dump(importances, f, indent=2)

    print(f"Accuracy: {accuracy:.4f}  |  Severe recall: {sev_recall:.4f}")
    print(f"ROC-AUC macro: {auc_macro:.4f}  |  Brier: {brier:.4f}")
    print("Training complete.")


if __name__ == "__main__":
    train_model()
