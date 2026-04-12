import json
import joblib
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report
from config import config


def train_model():
    df = pd.read_csv(config.DATASET_PATH)

    df['platelet_trend'] = 0.0
    df['WBC_trend'] = 0.0
    df['PSOS_prior'] = 0.0

    feature_cols = [
        'WBC', 'Platelets',
        'Temp_lag1', 'Temp_lag2', 'Temp_lag3', 'Temp_lag4', 'Temp_lag5', 'Temp_lag6',
        'Rain_lag1', 'Rain_lag2', 'Rain_lag3', 'Rain_lag4', 'Rain_lag5', 'Rain_lag6',
        'SEIR_Beta', 'day_of_illness', 'platelet_trend', 'WBC_trend', 'PSOS_prior',
    ]

    X = df[feature_cols]
    y = df['severity_label']

    clf = RandomForestClassifier(n_estimators=200, max_depth=12, random_state=42, n_jobs=-1)
    clf.fit(X, y)

    print(classification_report(y, clf.predict(X)))

    joblib.dump(clf, config.MODEL_PATH)
    print(f"Model saved to {config.MODEL_PATH}")

    importances = dict(zip(feature_cols, clf.feature_importances_))
    with open(config.DATA_DIR + "/feature_importance.json", "w") as f:
        json.dump(importances, f, indent=2)

    print("Training complete.")


if __name__ == "__main__":
    train_model()
