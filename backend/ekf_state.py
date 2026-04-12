import json
import numpy as np
from datetime import datetime
import redis.asyncio as redis

# x_hat = [platelet, platelet_velocity, WBC, WBC_velocity, PSOS_prior, days_since_onset]
F = np.eye(6)
F[0, 1] = 1.0
F[2, 3] = 1.0

H = np.zeros((2, 6))
H[0, 0] = 1.0
H[1, 2] = 1.0

Q = np.diag([100.0, 25.0, 4.0, 1.0, 0.01, 0.0])
R = np.diag([400.0, 2.25])

async def ekf_get_state(redis_client: redis.Redis, patient_id: str):
    data = await redis_client.get(f"patient:{patient_id}:ekf")
    if not data:
        return None, None
    parsed = json.loads(data)
    return np.array(parsed["x_hat"]), np.array(parsed["P"])

async def ekf_update(redis_client: redis.Redis, patient_id: str, platelet_obs: float, wbc_obs: float, psos_prior: float, day: float):
    x_hat, P = await ekf_get_state(redis_client, patient_id)
    
    if x_hat is None:
        x_hat = np.array([platelet_obs, 0.0, wbc_obs, 0.0, psos_prior, day], dtype=np.float64)
        P = np.eye(6) * 10.0
    else:
        # Predict
        x_hat = F @ x_hat
        x_hat[4] = psos_prior
        x_hat[5] = day
        P = F @ P @ F.T + Q
        
        # Update
        Z = np.array([platelet_obs, wbc_obs])
        y = Z - (H @ x_hat)
        S = H @ P @ H.T + R
        K = P @ H.T @ np.linalg.inv(S)
        x_hat = x_hat + (K @ y)
        P = (np.eye(6) - K @ H) @ P

    state_dict = {
        "x_hat": x_hat.tolist(),
        "P": P.tolist(),
        "last_updated": datetime.utcnow().isoformat()
    }
    await redis_client.setex(f"patient:{patient_id}:ekf", 2592000, json.dumps(state_dict))
    
    return {
        "platelet_trend": float(x_hat[1]),
        "WBC_trend": float(x_hat[3]),
        "PSOS_prior": float(x_hat[4]),
        "days_tracked": float(x_hat[5])
    }

async def ekf_reset(redis_client: redis.Redis, patient_id: str):
    await redis_client.delete(f"patient:{patient_id}:ekf")