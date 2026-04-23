"""Tests for SEIR model."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import numpy as np
from seir_model import run_seir, compute_static_beta


def test_seir_population_conserved():
    """Total population (S+E+I+R) should remain constant."""
    result = run_seir(beta=0.5, S0=9900, E0=50, I0=50, R0=0, days=60)
    N = 10000
    for i in range(len(result["S"])):
        total = result["S"][i] + result["E"][i] + result["I"][i] + result["R"][i]
        assert abs(total - N) < 1.0, f"Population not conserved at step {i}: {total}"


def test_seir_no_infection_without_beta():
    """With beta=0, no new infections should occur."""
    result = run_seir(beta=0.0, S0=9900, E0=0, I0=100, R0=0, days=30)
    # S should remain unchanged (no new exposures)
    assert result["S"][-1] == 9900.0


def test_seir_output_length():
    """Output arrays should have days+1 entries."""
    result = run_seir(beta=0.3, S0=9000, E0=500, I0=500, R0=0, days=30)
    for compartment in ["S", "E", "I", "R"]:
        assert len(result[compartment]) == 31


def test_seir_epidemic_curve():
    """Infected should peak then decline."""
    result = run_seir(beta=0.6, S0=9900, E0=50, I0=50, R0=0, days=200)
    peak_I = max(result["I"])
    assert peak_I > 50  # Peak should be higher than initial
    assert result["I"][-1] < peak_I  # Should decline after peak


def test_compute_static_beta_range():
    """Beta should be clamped to [0.1, 0.9]."""
    assert compute_static_beta(0, 0) >= 0.1
    assert compute_static_beta(100, 1000) <= 0.9


def test_compute_static_beta_increases_with_temp():
    """Higher temperature should increase beta."""
    low = compute_static_beta(25, 50)
    high = compute_static_beta(35, 50)
    assert high > low
