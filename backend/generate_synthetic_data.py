import os
import pandas as pd
import numpy as np
from imblearn.over_sampling import SMOTE
from config import config

def generate_data():
    np.random.seed(42)
    n = 2000
    
    data = {
        'patient_id': [f"P{i:04d}" for i in range(n)],
        'day_of_illness': np.random.randint(1, 8, n),
        'WBC': np.random.uniform(2.0, 12.0, n),
        'Platelets': np.random.uniform(10, 280, n),
        'SEIR_Beta': np.random.uniform(0.1, 0.8, n)
    }
    
    for i in range(1, 7):
        data[f'Temp_lag{i}'] = np.random.uniform(27, 40, n)
        data[f'Rain_lag{i}'] = np.random.uniform(0, 200, n)
        
    df = pd.DataFrame(data)
    
    # 60% mild (0), 30% moderate (1), 10% severe (2)
    probs = np.random.rand(n)
    labels = np.where(probs < 0.6, 0, np.where(probs < 0.9, 1, 2))
    df['severity_label'] = labels

    os.makedirs(config.DATA_DIR, exist_ok=True)
    
    # Balance with SMOTE
    features = df.drop(columns=['patient_id', 'severity_label'])
    smote = SMOTE(random_state=42)
    X_res, y_res = smote.fit_resample(features, df['severity_label'])
    
    df_res = pd.DataFrame(X_res, columns=features.columns)
    df_res['severity_label'] = y_res
    df_res['patient_id'] = [f"S{i:04d}" for i in range(len(df_res))]
    
    df_res.to_csv(config.DATASET_PATH, index=False)
    print(f"Dataset generated at {config.DATASET_PATH}")

if __name__ == "__main__":
    generate_data()