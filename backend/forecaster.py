"""
Predictive trajectory forecaster — 7-day forward projection.

Clones the patient's current EKF state, runs Monte Carlo noise (N=200 samples)
through the EKF transition matrix F for up to 7 days, runs XGBoost inference
at each step, and returns per-day percentile bands for P(severe).

This is the core "digital twin looks ahead" feature: the virtual patient
runs T days into the future before the real patient reaches that day.
"""
import numpy as np

from ekf_state import F, ekf_get_state
from features import build_feature_vector

_HORIZON_DAYS = 7
_N_PARTICLES  = 200   # Monte Carlo samples for uncertainty


async def forecast_patient(
    redis_client,
    patient_id: str,
    model,
    seir_beta: float,
) -> dict:
    """
    Returns:
        {
          "patient_id": str,
          "days": [1..7],
          "p_severe_p5":  [...],
          "p_severe_p50": [...],
          "p_severe_p95": [...],
          "p_mild_p50":   [...],
          "p_moderate_p50": [...],
        }
    """
    x_hat, P = await ekf_get_state(redis_client, patient_id)
    if x_hat is None:
        # No state yet — return flat uncertain forecast
        return _flat_forecast(patient_id)

    # ── Monte Carlo: sample starting states from EKF posterior ──────────────
    try:
        particles = np.random.multivariate_normal(x_hat, P, size=_N_PARTICLES)
    except Exception:
        particles = np.tile(x_hat, (_N_PARTICLES, 1))
        particles += np.random.normal(0, 0.1, particles.shape)

    # Process noise per step
    q_diag = np.array([100.0, 25.0, 4.0, 1.0, 0.01, 0.0])

    severe_all   = np.zeros((_N_PARTICLES, _HORIZON_DAYS))
    mild_all     = np.zeros((_N_PARTICLES, _HORIZON_DAYS))
    moderate_all = np.zeros((_N_PARTICLES, _HORIZON_DAYS))

    for p_idx in range(_N_PARTICLES):
        x = particles[p_idx].copy()
        for d in range(_HORIZON_DAYS):
            # EKF transition
            x = F @ x
            x += np.random.normal(0, np.sqrt(q_diag))
            x[0] = max(1.0, x[0])    # platelets ≥ 1
            x[2] = max(0.5, x[2])    # WBC ≥ 0.5

            ekf_data = {
                "platelet_trend": float(x[1]),
                "WBC_trend":      float(x[3]),
                "PSOS_prior":     float(x[4]),
            }
            raw_data = {
                "WBC":            float(x[2]),
                "Platelets":      float(x[0]),
                "Hematocrit":     40.0,
                "NS1_antigen":    0.0,
                "AST_ALT_ratio":  1.0,
                "pulse_pressure": 38.0,
                "warning_signs":  0.0,
                **{f"Temp_lag{i}": 37.0  for i in range(1, 7)},
                **{f"Rain_lag{i}": 50.0  for i in range(1, 7)},
                "SEIR_Beta":      seir_beta,
                "day_of_illness": float(x[5]) + d + 1,
            }
            fvec  = build_feature_vector(raw_data, ekf_data)
            proba = model.predict_proba(fvec)[0]
            prob_map = {int(c): float(p)
                        for c, p in zip(model.classes_, proba)}
            severe_all[p_idx, d]   = prob_map.get(2, 0.0)
            mild_all[p_idx, d]     = prob_map.get(0, 0.0)
            moderate_all[p_idx, d] = prob_map.get(1, 0.0)

    return {
        "patient_id":       patient_id,
        "days":             list(range(1, _HORIZON_DAYS + 1)),
        "p_severe_p5":      [round(float(v), 4) for v in np.percentile(severe_all,  5, axis=0)],
        "p_severe_p50":     [round(float(v), 4) for v in np.percentile(severe_all, 50, axis=0)],
        "p_severe_p95":     [round(float(v), 4) for v in np.percentile(severe_all, 95, axis=0)],
        "p_mild_p50":       [round(float(v), 4) for v in np.percentile(mild_all,   50, axis=0)],
        "p_moderate_p50":   [round(float(v), 4) for v in np.percentile(moderate_all, 50, axis=0)],
    }


def _flat_forecast(patient_id: str) -> dict:
    return {
        "patient_id":     patient_id,
        "days":           list(range(1, _HORIZON_DAYS + 1)),
        "p_severe_p5":    [0.0] * _HORIZON_DAYS,
        "p_severe_p50":   [0.1] * _HORIZON_DAYS,
        "p_severe_p95":   [0.3] * _HORIZON_DAYS,
        "p_mild_p50":     [0.7] * _HORIZON_DAYS,
        "p_moderate_p50": [0.2] * _HORIZON_DAYS,
    }
