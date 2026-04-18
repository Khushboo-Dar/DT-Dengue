"""
SHAP explainability module.

Uses TreeExplainer (fast, exact for XGBoost) to produce per-feature
SHAP values for a single prediction vector.

Returns top-N features sorted by absolute SHAP value for the
predicted class, giving clinicians a reason for every prediction.
"""
import numpy as np
import shap

from features import FEATURE_COLS


def build_explainer(model):
    """Build a SHAP TreeExplainer from a fitted XGBoost (or RF) model."""
    return shap.TreeExplainer(model)


def explain_prediction(
    explainer,
    feature_vec: np.ndarray,
    predicted_class_idx: int,
    top_n: int = 5,
) -> list[dict]:
    """
    Compute SHAP values for feature_vec and return the top_n features
    by absolute contribution towards predicted_class_idx.

    Returns:
        list of {"feature": str, "value": float, "shap": float}
        sorted by |shap| descending.
    """
    # shap_values shape: (n_samples, n_features, n_classes)
    shap_values = explainer.shap_values(feature_vec)

    # Handle both 2-D (binary) and 3-D (multiclass) outputs
    if isinstance(shap_values, list):
        # scikit-learn RF style: list of arrays per class
        sv_for_class = shap_values[predicted_class_idx][0]
    elif shap_values.ndim == 3:
        sv_for_class = shap_values[0, :, predicted_class_idx]
    else:
        sv_for_class = shap_values[0]

    feature_vals = feature_vec[0].tolist()
    ranked = sorted(
        range(len(FEATURE_COLS)),
        key=lambda i: abs(sv_for_class[i]),
        reverse=True,
    )[:top_n]

    return [
        {
            "feature": FEATURE_COLS[i],
            "value":   round(float(feature_vals[i]), 3),
            "shap":    round(float(sv_for_class[i]), 4),
        }
        for i in ranked
    ]
