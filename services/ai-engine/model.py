import os
import joblib
import numpy as np
import pandas as pd
from typing import Dict, Any, Tuple
from sklearn.ensemble import IsolationForest, RandomForestClassifier
from sklearn.preprocessing import StandardScaler
from features import FEATURE_NAMES
from explain import generate_explanation

MODEL_DIR = os.path.join(os.path.dirname(__file__), 'models')

class AIModelPipeline:
    def __init__(self):
        self.scaler = StandardScaler()
        self.iso_forest = IsolationForest(n_estimators=100, contamination=0.15, random_state=42)
        self.rf_classifier = RandomForestClassifier(n_estimators=100, random_state=42)
        self.is_fitted = False

    def fit(self, train_df: pd.DataFrame):
        X = train_df[FEATURE_NAMES].values
        y = train_df['label'].values

        # Scale features
        X_scaled = self.scaler.fit_transform(X)

        # Fit Isolation Forest (Unsupervised - trained on normal samples if available, or all samples)
        X_normal = X_scaled[y == 0] if (y == 0).sum() > 50 else X_scaled
        self.iso_forest.fit(X_normal)

        # Fit Random Forest Classifier (Supervised)
        self.rf_classifier.fit(X_scaled, y)
        self.is_fitted = True

    def save(self, path_dir=MODEL_DIR):
        os.makedirs(path_dir, exist_ok=True)
        joblib.dump(self.scaler, os.path.join(path_dir, 'scaler.joblib'))
        joblib.dump(self.iso_forest, os.path.join(path_dir, 'iso_forest.joblib'))
        joblib.dump(self.rf_classifier, os.path.join(path_dir, 'rf_classifier.joblib'))
        print(f"Models successfully saved to {path_dir}")

    def load(self, path_dir=MODEL_DIR) -> bool:
        scaler_path = os.path.join(path_dir, 'scaler.joblib')
        iso_path = os.path.join(path_dir, 'iso_forest.joblib')
        rf_path = os.path.join(path_dir, 'rf_classifier.joblib')

        if os.path.exists(scaler_path) and os.path.exists(iso_path) and os.path.exists(rf_path):
            self.scaler = joblib.load(scaler_path)
            self.iso_forest = joblib.load(iso_path)
            self.rf_classifier = joblib.load(rf_path)
            self.is_fitted = True
            return True
        return False

    def predict_window(self, feature_dict: Dict[str, float]) -> Dict[str, Any]:
        if not self.is_fitted:
            raise RuntimeError("Model pipeline is not fitted or loaded!")

        X_vec = np.array([[feature_dict[f] for f in FEATURE_NAMES]])
        X_scaled = self.scaler.transform(X_vec)

        # Isolation forest anomaly score (-1 = anomaly, 1 = normal)
        iso_score_raw = self.iso_forest.score_samples(X_scaled)[0]
        # Normalize isolation forest score to [0, 1] risk score
        # iso_score_raw typically ranges between -0.8 (anomaly) and -0.4 (normal)
        risk_score_iso = float(np.clip((0.6 - (iso_score_raw + 0.5)) / 0.6, 0.0, 1.0))

        # Supervised classification probabilities
        proba = self.rf_classifier.predict_proba(X_scaled)[0]
        pred_label_id = int(np.argmax(proba))
        risk_score_rf = float(1.0 - proba[0]) # 1 - prob(normal)

        # Combined composite risk score
        risk_score = float(np.round(0.4 * risk_score_iso + 0.6 * risk_score_rf, 3))

        label_map = {
            0: 'normal',
            1: 'gradual_deterioration',
            2: 'sudden_change',
            3: 'sensor_malfunction'
        }
        label_str = label_map.get(pred_label_id, 'anomaly')

        explanations = generate_explanation(feature_dict)

        return {
            'risk_score': risk_score,
            'label': label_str,
            'confidence': float(np.round(np.max(proba), 3)),
            'iso_risk_score': float(np.round(risk_score_iso, 3)),
            'rf_risk_score': float(np.round(risk_score_rf, 3)),
            'explanations': explanations
        }

def train_and_save():
    train_path = os.path.join(os.path.dirname(__file__), 'data', 'train.csv')
    if not os.path.exists(train_path):
        from data_generator import generate_dataset
        train_df, _, _ = generate_dataset()
    else:
        train_df = pd.read_csv(train_path)

    print("Training AI models...")
    pipeline = AIModelPipeline()
    pipeline.fit(train_df)
    pipeline.save()

if __name__ == '__main__':
    train_and_save()
