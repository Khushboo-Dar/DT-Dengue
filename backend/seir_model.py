import numpy as np

def run_seir(beta: float, S0: float, E0: float, I0: float, R0: float, days: int = 60) -> dict:
    N = S0 + E0 + I0 + R0
    sigma = 0.2
    gamma = 0.1
    
    S, E, I, R = [S0], [E0], [I0], [R0]
    
    for _ in range(days):
        dS = -beta * S[-1] * I[-1] / N
        dE = beta * S[-1] * I[-1] / N - sigma * E[-1]
        dI = sigma * E[-1] - gamma * I[-1]
        dR = gamma * I[-1]
        
        S.append(max(0.0, S[-1] + dS))
        E.append(max(0.0, E[-1] + dE))
        I.append(max(0.0, I[-1] + dI))
        R.append(max(0.0, R[-1] + dR))
        
    return {"S": np.array(S), "E": np.array(E), "I": np.array(I), "R": np.array(R)}

def compute_static_beta(temp_mean: float, rain_mean: float) -> float:
    beta = 0.3 + 0.002 * temp_mean + 0.0005 * rain_mean
    return float(np.clip(beta, 0.1, 0.9))