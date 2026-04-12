import json
import os
import numpy as np
from seir_model import run_seir
from config import config

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
            res = run_seir(beta, S0=self.pop_size-100, E0=50, I0=50, R0=0, days=7)
            predicted_cases[i] = max(0, res['I'][-1] - res['I'][0] + res['R'][-1] - res['R'][0])
            
        likelihoods = (predicted_cases + 1e-8)**weekly_new_cases * np.exp(-(predicted_cases + 1e-8))
        self.weights *= likelihoods
        self.weights /= (np.sum(self.weights) + 1e-12)
        
        ess = 1.0 / (np.sum(self.weights**2) + 1e-12)
        if ess < self.N / 2:
            indices = np.random.choice(self.N, self.N, p=self.weights)
            self.particles = self.particles[indices]
            self.weights = np.ones(self.N) / self.N
            
        self.particles += np.random.normal(0, [0.01, 0.005], (self.N, 2))
        self.particles[:, 0] = np.clip(self.particles[:, 0], 0.1, 0.9)
        self.particles[:, 1] = np.clip(self.particles[:, 1], 0.05, 0.3)
        
        self.save(config.PARTICLES_PATH)
        
        return {
            "beta_mean": float(np.average(self.particles[:, 0], weights=self.weights)),
            "beta_std": float(np.sqrt(np.cov(self.particles[:, 0], aweights=self.weights))),
            "beta_p10": float(np.percentile(self.particles[:, 0], 10)),
            "beta_p90": float(np.percentile(self.particles[:, 0], 90)),
            "ess": float(ess)
        }

    def get_beta(self) -> float:
        return float(np.average(self.particles[:, 0], weights=self.weights))

    def save(self, path: str):
        with open(path, 'w') as f:
            json.dump({"particles": self.particles.tolist(), "weights": self.weights.tolist()}, f)

    def load(self, path: str):
        if os.path.exists(path):
            with open(path, 'r') as f:
                data = json.load(f)
                self.particles = np.array(data["particles"])
                self.weights = np.array(data["weights"])