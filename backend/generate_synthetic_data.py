"""
Synthetic dengue patient dataset generator — v2.
Adds WHO-aligned clinical features:
  Hematocrit (HCT), NS1 antigen, AST/ALT ratio,
  Pulse Pressure, Warning Sign count.
Labels are assigned using clinically-grounded heuristic rules.
"""
import os
import numpy as np
import pandas as pd
from imblearn.over_sampling import SMOTE
from config import config


def generate_data():
    np.random.seed(42)
    n = 2000

    # ── Core haematology ────────────────────────────────────────────────────
    platelets    = np.random.uniform(10, 280, n)
    wbc          = np.random.uniform(2.0, 12.0, n)
    hct          = np.random.uniform(30.0, 58.0, n)   # % — normal 37-52
    day          = np.random.randint(1, 8, n).astype(float)
    seir_beta    = np.random.uniform(0.1, 0.8, n)

    # ── Environmental lags ──────────────────────────────────────────────────
    temp_lags = {f"Temp_lag{i}": np.random.uniform(27, 40, n) for i in range(1, 7)}
    rain_lags = {f"Rain_lag{i}": np.random.uniform(0, 200, n)  for i in range(1, 7)}

    # ── Additional clinical features ────────────────────────────────────────
    # NS1 antigen: positive (1) on days 1-5, negative on later days
    ns1_antigen    = ((day <= 5) & (np.random.rand(n) < 0.85)).astype(float)

    # AST/ALT ratio: mild ~1, severe dengue hepatitis pushes >2
    ast_alt_ratio  = np.random.lognormal(mean=0.15, sigma=0.35, size=n)
    ast_alt_ratio  = np.clip(ast_alt_ratio, 0.5, 8.0)

    # Pulse pressure (systolic - diastolic mmHg): normal ~40, shock <20
    pulse_pressure = np.random.normal(38, 10, n)
    pulse_pressure = np.clip(pulse_pressure, 5, 80)

    # Warning signs (0-7 count): abdominal pain, persistent vomiting,
    # fluid accumulation, mucosal bleed, lethargy, liver >2cm, rapid plt drop
    warning_signs  = np.random.choice([0, 1, 2, 3, 4, 5], n,
                                       p=[0.50, 0.22, 0.12, 0.08, 0.05, 0.03])
    warning_signs  = warning_signs.astype(float)

    # ── Clinically-grounded label assignment ────────────────────────────────
    # WHO 2009: dengue without warning signs (0), with warning signs (1),
    # severe dengue (2)
    labels = np.zeros(n, dtype=int)

    severe_mask = (
        (platelets < 30) |
        (hct > 52) |                    # haemoconcentration → plasma leakage
        (pulse_pressure < 20) |         # impending shock
        (ast_alt_ratio > 3.0) |         # hepatic involvement
        (warning_signs >= 4)
    )
    moderate_mask = (
        (~severe_mask) & (
            (platelets < 80) |
            (hct > 46) |
            (wbc < 3.0) |
            (warning_signs >= 2) |
            (ast_alt_ratio > 1.8) |
            (pulse_pressure < 28)
        )
    )
    labels[severe_mask]   = 2
    labels[moderate_mask] = 1
    # rest remain 0 (mild / no warning signs)

    # ── Assemble DataFrame ──────────────────────────────────────────────────
    data = {
        "patient_id":     [f"P{i:04d}" for i in range(n)],
        "day_of_illness":  day,
        "WBC":             wbc,
        "Platelets":       platelets,
        "Hematocrit":      hct,
        "NS1_antigen":     ns1_antigen,
        "AST_ALT_ratio":   ast_alt_ratio,
        "pulse_pressure":  pulse_pressure,
        "warning_signs":   warning_signs,
        "SEIR_Beta":       seir_beta,
    }
    data.update(temp_lags)
    data.update(rain_lags)

    df = pd.DataFrame(data)
    df["severity_label"] = labels

    # ── SMOTE balance ───────────────────────────────────────────────────────
    feature_cols = [c for c in df.columns if c not in ("patient_id", "severity_label")]
    smote = SMOTE(random_state=42)
    X_res, y_res = smote.fit_resample(df[feature_cols], df["severity_label"])

    df_out = pd.DataFrame(X_res, columns=feature_cols)
    df_out["severity_label"] = y_res
    df_out["patient_id"]     = [f"S{i:04d}" for i in range(len(df_out))]

    os.makedirs(config.DATA_DIR, exist_ok=True)
    df_out.to_csv(config.DATASET_PATH, index=False)
    print(f"Dataset generated: {len(df_out)} records → {config.DATASET_PATH}")
    print(f"Class distribution:\n{df_out['severity_label'].value_counts().sort_index()}")


if __name__ == "__main__":
    generate_data()
