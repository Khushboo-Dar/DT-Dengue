"""
Feature vector builder — v2.
Total: 24 features.

Order (must match FEATURE_COLS in train.py / retrain_pipeline.py):
  0  WBC
  1  Platelets
  2  Hematocrit
  3  NS1_antigen
  4  AST_ALT_ratio
  5  pulse_pressure
  6  warning_signs
  7  Temp_lag1 … Temp_lag6  (indices 7-12)
  13 Rain_lag1 … Rain_lag6  (indices 13-18)
  19 SEIR_Beta
  20 day_of_illness
  21 platelet_trend   (from EKF)
  22 WBC_trend        (from EKF)
  23 PSOS_prior       (from EKF)
"""
import numpy as np


FEATURE_COLS = [
    "WBC", "Platelets", "Hematocrit", "NS1_antigen",
    "AST_ALT_ratio", "pulse_pressure", "warning_signs",
    "Temp_lag1", "Temp_lag2", "Temp_lag3", "Temp_lag4", "Temp_lag5", "Temp_lag6",
    "Rain_lag1", "Rain_lag2", "Rain_lag3", "Rain_lag4", "Rain_lag5", "Rain_lag6",
    "SEIR_Beta", "day_of_illness",
    "platelet_trend", "WBC_trend", "PSOS_prior",
]


def build_feature_vector(raw_data: dict, ekf_data: dict) -> np.ndarray:
    features = [
        float(raw_data["WBC"]),
        float(raw_data["Platelets"]),
        float(raw_data.get("Hematocrit",    40.0)),
        float(raw_data.get("NS1_antigen",    0.0)),
        float(raw_data.get("AST_ALT_ratio",  1.0)),
        float(raw_data.get("pulse_pressure", 38.0)),
        float(raw_data.get("warning_signs",  0.0)),
    ]

    for i in range(1, 7):
        features.append(float(raw_data.get(f"Temp_lag{i}", 37.0)))

    for i in range(1, 7):
        features.append(float(raw_data.get(f"Rain_lag{i}", 50.0)))

    features.extend([
        float(raw_data["SEIR_Beta"]),
        float(raw_data["day_of_illness"]),
        float(ekf_data.get("platelet_trend", 0.0)),
        float(ekf_data.get("WBC_trend",      0.0)),
        float(ekf_data.get("PSOS_prior",     0.0)),
    ])

    return np.array([features], dtype=np.float32)
