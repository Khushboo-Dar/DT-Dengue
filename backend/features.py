import numpy as np

def build_feature_vector(raw_data: dict, ekf_data: dict) -> np.ndarray:
    features = [
        float(raw_data['WBC']),
        float(raw_data['Platelets'])
    ]
    
    for i in range(1, 7):
        features.append(float(raw_data.get(f'Temp_lag{i}', 30.0)))
        
    for i in range(1, 7):
        features.append(float(raw_data.get(f'Rain_lag{i}', 0.0)))
        
    features.extend([
        float(raw_data['SEIR_Beta']),
        float(raw_data['day_of_illness']),
        float(ekf_data.get('platelet_trend', 0.0)),
        float(ekf_data.get('WBC_trend', 0.0)),
        float(ekf_data.get('PSOS_prior', 0.0))
    ])
    
    return np.array([features], dtype=np.float32)