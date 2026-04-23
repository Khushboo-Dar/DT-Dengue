"""Tests for feature vector builder."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import numpy as np
from features import FEATURE_COLS, build_feature_vector


def test_feature_cols_count():
    """24 features are defined."""
    assert len(FEATURE_COLS) == 24


def test_feature_cols_unique():
    """No duplicate feature names."""
    assert len(set(FEATURE_COLS)) == len(FEATURE_COLS)


def test_build_feature_vector_shape():
    """Output shape is (1, 24) for single patient."""
    raw = {
        "WBC": 4.5, "Platelets": 120, "Hematocrit": 42,
        "NS1_antigen": 1, "AST_ALT_ratio": 1.2,
        "pulse_pressure": 35, "warning_signs": 1,
        "SEIR_Beta": 0.3, "day_of_illness": 3,
        **{f"Temp_lag{i}": 37.5 for i in range(1, 7)},
        **{f"Rain_lag{i}": 60 for i in range(1, 7)},
    }
    ekf = {"platelet_trend": -2.0, "WBC_trend": -0.5, "PSOS_prior": 0.3}
    fvec = build_feature_vector(raw, ekf)
    assert fvec.shape == (1, 24)
    assert fvec.dtype == np.float32


def test_build_feature_vector_values():
    """Feature vector preserves input values in correct positions."""
    raw = {
        "WBC": 3.0, "Platelets": 85, "Hematocrit": 44,
        "NS1_antigen": 1, "AST_ALT_ratio": 2.1,
        "pulse_pressure": 25, "warning_signs": 3,
        "SEIR_Beta": 0.55, "day_of_illness": 4,
        **{f"Temp_lag{i}": 38.0 + i * 0.1 for i in range(1, 7)},
        **{f"Rain_lag{i}": 50 + i for i in range(1, 7)},
    }
    ekf = {"platelet_trend": -5.0, "WBC_trend": -1.2, "PSOS_prior": 0.65}
    fvec = build_feature_vector(raw, ekf)

    assert fvec[0, 0] == np.float32(3.0)    # WBC
    assert fvec[0, 1] == np.float32(85)      # Platelets
    assert fvec[0, 19] == np.float32(0.55)   # SEIR_Beta
    assert fvec[0, 21] == np.float32(-5.0)   # platelet_trend
    assert fvec[0, 23] == np.float32(0.65)   # PSOS_prior


def test_build_feature_vector_defaults():
    """Missing optional fields use sensible defaults."""
    raw = {
        "WBC": 5.0, "Platelets": 150,
        "SEIR_Beta": 0.28, "day_of_illness": 2,
    }
    ekf = {}
    fvec = build_feature_vector(raw, ekf)
    assert fvec.shape == (1, 24)
    # Hematocrit default = 40.0
    assert fvec[0, 2] == np.float32(40.0)
    # EKF defaults = 0.0
    assert fvec[0, 21] == np.float32(0.0)
    assert fvec[0, 22] == np.float32(0.0)
    assert fvec[0, 23] == np.float32(0.0)
