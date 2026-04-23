"""Tests for SEIR Particle Filter."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from seir_particle_filter import SEIRParticleFilter


def test_pf_initial_beta():
    """Initial beta should be reasonable (0.1 - 0.9)."""
    pf = SEIRParticleFilter(n_particles=50)
    beta = pf.get_beta()
    assert 0.1 <= beta <= 0.9


def test_pf_update_returns_stats():
    """Update should return a dict with expected keys."""
    pf = SEIRParticleFilter(n_particles=50)
    stats = pf.update(100)
    assert "beta_mean" in stats
    assert "beta_std" in stats
    assert "beta_p10" in stats
    assert "beta_p90" in stats
    assert "ess" in stats


def test_pf_beta_increases_with_high_cases():
    """High case counts should push beta upward."""
    pf = SEIRParticleFilter(n_particles=100)
    initial_beta = pf.get_beta()
    # Feed a very high case count
    for _ in range(5):
        pf.update(2000)
    final_beta = pf.get_beta()
    assert final_beta > initial_beta
