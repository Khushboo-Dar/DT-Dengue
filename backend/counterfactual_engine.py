"""
Counterfactual scenario engine.

For each treatment scenario, clones the patient's current EKF state vector,
applies the intervention deltas to platelet/WBC velocity components, then
propagates the state 3 × 24 h forward using the EKF transition matrix F,
running sklearn inference at each step to trace the PSOS severity trajectory.

The scenario with the lowest peak P_severe is marked recommended=True.
"""
import numpy as np

from ekf_state import F, ekf_get_state
from features import build_feature_vector


def _sklearn_probs(clf, feature_vec: np.ndarray) -> dict[str, float]:
    """Run sklearn inference; return {mild, moderate, severe} probabilities."""
    probs_arr = clf.predict_proba(feature_vec)[0]
    prob_map = {int(c): float(p) for c, p in zip(clf.classes_, probs_arr)}
    return {
        "mild":     round(prob_map.get(0, 0.0), 4),
        "moderate": round(prob_map.get(1, 0.0), 4),
        "severe":   round(prob_map.get(2, 0.0), 4),
    }


async def run_counterfactual(
    redis_client,
    patient_id: str,
    scenarios: list[dict],
    model_session,           # sklearn RandomForestClassifier loaded via joblib
    seir_beta: float,
) -> dict:
    # Fetch current EKF state; fall back to a zero-vector for new patients
    x_hat, _ = await ekf_get_state(redis_client, patient_id)
    if x_hat is None:
        x_hat = np.zeros(6, dtype=np.float64)

    results: list[dict] = []

    for scenario in scenarios[:5]:
        label = str(scenario.get("label", "Scenario"))

        # Intervention magnitudes
        platelet_delta = float(scenario.get("platelet_recovery_rate", 0.0))
        # iv_fluid_effect is 0–100; map to a WBC velocity boost of 0–1.0
        wbc_delta = float(scenario.get("iv_fluid_effect", 0.0)) * 0.01

        # Clone state and apply intervention to velocity components
        x = x_hat.copy()
        x[1] += platelet_delta   # platelet_velocity
        x[3] += wbc_delta        # WBC_velocity

        trajectory: list[dict] = []
        for step in range(3):   # t+24h, t+48h, t+72h
            # Advance one day using EKF state-transition matrix
            x = F @ x
            # Clip physiological values to non-negative
            x[0] = max(0.0, x[0])   # platelets
            x[2] = max(0.0, x[2])   # WBC

            ekf_data = {
                "platelet_trend": float(x[1]),
                "WBC_trend":      float(x[3]),
                "PSOS_prior":     float(x[4]),
            }
            raw_data = {
                "WBC":           float(x[2]),
                "Platelets":     float(x[0]),
                "Temp_lag1": 37.0, "Temp_lag2": 37.0, "Temp_lag3": 37.0,
                "Temp_lag4": 37.0, "Temp_lag5": 37.0, "Temp_lag6": 37.0,
                "Rain_lag1": 50.0, "Rain_lag2": 50.0, "Rain_lag3": 50.0,
                "Rain_lag4": 50.0, "Rain_lag5": 50.0, "Rain_lag6": 50.0,
                "SEIR_Beta":      seir_beta,
                "day_of_illness": float(x[5]) + step + 1,
            }

            fvec  = build_feature_vector(raw_data, ekf_data)
            probs = _sklearn_probs(model_session, fvec)
            trajectory.append({"hour": (step + 1) * 24, **probs})

        peak_severe = max(t["severe"] for t in trajectory)
        results.append({
            "label":       label,
            "trajectory":  trajectory,
            "peak_severe": round(peak_severe, 4),
            "recommended": False,
        })

    # Mark the scenario with the lowest peak severe probability as recommended
    if results:
        best = min(range(len(results)), key=lambda i: results[i]["peak_severe"])
        results[best]["recommended"] = True

    return {
        "patient_id":     patient_id,
        "horizons_hours": [24, 48, 72],
        "scenarios":      results,
    }
