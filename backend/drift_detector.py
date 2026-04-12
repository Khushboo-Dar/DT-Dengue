"""
Custom Page-Hinkley concept-drift detector (pure numpy, no extra lib).

PageHinkleyDetector: single-feature sequential change-point test.
DriftMonitor: orchestrates one detector per monitored feature.
"""


class PageHinkleyDetector:
    """
    Page-Hinkley test for upward shifts in the mean of a data stream.

    The cumulative sum tracks deviations from a running mean. When the
    sum exceeds the minimum by more than lambda_, a drift is flagged.

    Args:
        delta   : small constant that prevents false positives on tiny shifts
        lambda_ : detection threshold (higher = fewer false alarms)
        alpha   : forgetting factor for the running mean (closer to 1 = slower adaptation)
    """

    def __init__(self, delta: float = 0.005, lambda_: float = 50, alpha: float = 0.9999):
        self.delta = delta
        self.lambda_ = lambda_
        self.alpha = alpha
        self._mean = 0.0
        self._cumsum = 0.0
        self._minimum = float("inf")
        self.n_samples = 0
        self.drift_detected = False

    def update(self, value: float) -> bool:
        self.n_samples += 1
        self._mean = self.alpha * self._mean + (1.0 - self.alpha) * value
        self._cumsum += value - self._mean - self.delta
        self._minimum = min(self._minimum, self._cumsum)
        self.drift_detected = (self._cumsum - self._minimum) > self.lambda_
        return self.drift_detected

    def reset(self) -> None:
        self._mean = 0.0
        self._cumsum = 0.0
        self._minimum = float("inf")
        self.n_samples = 0
        self.drift_detected = False


class DriftMonitor:
    """
    Maintains one PageHinkleyDetector per monitored feature.
    Exposes a single update() call that returns any drifting feature names.
    """

    FEATURES_TO_MONITOR: list[str] = ["Platelets", "WBC", "SEIR_Beta"]

    def __init__(self) -> None:
        self._detectors: dict[str, PageHinkleyDetector] = {
            f: PageHinkleyDetector() for f in self.FEATURES_TO_MONITOR
        }

    def update(self, feature_values: dict) -> list[str]:
        """
        Feed current observation values. Returns names of features where
        drift was detected this step.
        """
        drifted: list[str] = []
        for name in self.FEATURES_TO_MONITOR:
            if name in feature_values:
                detected = self._detectors[name].update(float(feature_values[name]))
                if detected:
                    drifted.append(name)
        return drifted

    def get_status(self) -> dict:
        return {
            name: {
                "drift": self._detectors[name].drift_detected,
                "n_samples": self._detectors[name].n_samples,
            }
            for name in self.FEATURES_TO_MONITOR
        }
