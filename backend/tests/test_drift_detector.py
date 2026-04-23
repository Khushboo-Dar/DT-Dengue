"""Tests for Page-Hinkley drift detection."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from drift_detector import PageHinkleyDetector, DriftMonitor


def test_no_drift_on_stable_data():
    """Stable values should not trigger drift."""
    det = PageHinkleyDetector()
    for _ in range(100):
        det.update(100.0)
    assert not det.drift_detected


def test_drift_on_sudden_shift():
    """Large mean shift should trigger drift."""
    det = PageHinkleyDetector(delta=0.005, lambda_=50, alpha=0.9999)
    # Feed stable data
    for _ in range(50):
        det.update(100.0)
    # Sudden shift up
    for _ in range(200):
        result = det.update(300.0)
    assert result is True
    assert det.drift_detected


def test_reset_clears_state():
    """After reset, detector should be fresh."""
    det = PageHinkleyDetector()
    for _ in range(50):
        det.update(100.0)
    det.reset()
    assert det.n_samples == 0
    assert det.drift_detected is False


def test_drift_monitor_no_drift():
    """DriftMonitor returns empty list when no drift."""
    dm = DriftMonitor()
    for _ in range(20):
        drifted = dm.update({"Platelets": 150, "WBC": 5.0, "SEIR_Beta": 0.3})
    assert drifted == []


def test_drift_monitor_status():
    """get_status returns info for all monitored features."""
    dm = DriftMonitor()
    dm.update({"Platelets": 150, "WBC": 5.0, "SEIR_Beta": 0.3})
    status = dm.get_status()
    assert "Platelets" in status
    assert "WBC" in status
    assert "SEIR_Beta" in status
    assert status["Platelets"]["n_samples"] == 1


def test_drift_monitor_ignores_unknown():
    """Unknown features are silently ignored."""
    dm = DriftMonitor()
    drifted = dm.update({"unknown_feature": 999})
    assert drifted == []
