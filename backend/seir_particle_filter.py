import json
import os
import numpy as np
from seir_model import run_seir
from config import config


def _safe(v: float, fallback: float = 0.3) -> float:
    """Return fallback if value is NaN or Inf."""
    if v is None or (isinstance(v, float) and (np.isnan(v) or np.isinf(v))):
        return fallback
    return float(v)


class SEIRParticleFilter:
    def __init__(self, N: int = 500, pop_size: int = 100000):
        self.N = N
        self.pop_size = pop_size
        self.particles = np.column_stack((
            np.random.uniform(0.1, 0.9, N),
            np.random.uniform(0.05, 0.3, N)
        ))
        self.weights = np.ones(N) / N
        self.load(config.PARTICLES_PATH)

    def update(self, weekly_new_cases: int) -> dict:
        predicted_cases = np.zeros(self.N)
        for i in range(self.N):
            beta, gamma = self.particles[i]
            res = run_seir(beta, S0=self.pop_size - 100, E0=50, I0=50, R0=0, days=7)
            predicted_cases[i] = max(0, res['I'][-1] - res['I'][0] + res['R'][-1] - res['R'][0])

        # Log-space likelihood to avoid overflow with large case counts
        log_lk = weekly_new_cases * np.log(predicted_cases + 1e-8) - (predicted_cases + 1e-8)
        log_lk -= log_lk.max()          # numerical stability
        likelihoods = np.exp(log_lk)

        self.weights *= likelihoods
        weight_sum = np.sum(self.weights)
        if weight_sum < 1e-300:         # total collapse — reset
            self.weights = np.ones(self.N) / self.N
        else:
            self.weights /= weight_sum

        ess = 1.0 / (np.sum(self.weights ** 2) + 1e-12)
        if ess < self.N / 2:
            indices = np.random.choice(self.N, self.N, p=self.weights)
            self.particles = self.particles[indices]
            self.weights = np.ones(self.N) / self.N

        self.particles += np.random.normal(0, [0.01, 0.005], (self.N, 2))
        self.particles[:, 0] = np.clip(self.particles[:, 0], 0.1, 0.9)
        self.particles[:, 1] = np.clip(self.particles[:, 1], 0.05, 0.3)

        self.save(config.PARTICLES_PATH)

        beta_mean = float(np.average(self.particles[:, 0], weights=self.weights))
        try:
            beta_std = float(np.sqrt(np.cov(self.particles[:, 0], aweights=self.weights)))
        except Exception:
            beta_std = 0.05

        return {
            "beta_mean": _safe(beta_mean, 0.3),
            "beta_std":  _safe(beta_std,  0.05),
            "beta_p10":  _safe(float(np.percentile(self.particles[:, 0], 10)), 0.2),
            "beta_p90":  _safe(float(np.percentile(self.particles[:, 0], 90)), 0.5),
            "ess":       _safe(float(ess), float(self.N / 2)),
        }

    def get_beta(self) -> float:
        v = float(np.average(self.particles[:, 0], weights=self.weights))
        return _safe(v, 0.3)

    def save(self, path: str):
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        with open(path, 'w') as f:
            json.dump({
                "particles": self.particles.tolist(),
                "weights":   self.weights.tolist(),
            }, f)

    def load(self, path: str):
        if os.path.exists(path):
            try:
                with open(path) as f:
                    data = json.load(f)
                p = np.array(data["particles"])
                w = np.array(data["weights"])
                if p.shape == (self.N, 2) and w.shape == (self.N,):
                    self.particles = p
                    self.weights   = w
            except Exception:
                pass    # corrupt file — keep defaults
