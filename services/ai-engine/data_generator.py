import os
import random
import numpy as np
import pandas as pd
from typing import Tuple
from features import extract_features_from_window, FEATURE_NAMES

SEED = 42

def set_seed(seed=SEED):
    random.seed(seed)
    np.random.seed(seed)

def generate_patient_session(patient_id: str, scenario: str, num_samples: int = 120) -> pd.DataFrame:
    """
    Generates time-series vitals sequence (1 sample/sec) for a given scenario.
    Labels:
      0: Normal
      1: Gradual Deterioration
      2: Sudden Change (Spike/Drop)
      3: Sensor Malfunction
    """
    set_seed(hash(patient_id) % 100000)

    # Baseline vitals
    base_hr = np.random.normal(75, 4)
    base_spo2 = np.random.normal(98, 0.8)
    base_temp = np.random.normal(36.6, 0.2)
    base_rr = np.random.normal(16, 1.5)

    hrs, spo2s, temps, rrs, labels = [], [], [], [], []

    for t in range(num_samples):
        hr, spo2, temp, rr = base_hr, base_spo2, base_temp, base_rr
        label = 0

        if scenario == 'normal':
            hr += np.random.normal(0, 1.2)
            spo2 += np.random.normal(0, 0.3)
            temp += np.random.normal(0, 0.05)
            rr += np.random.normal(0, 0.5)
            label = 0

        elif scenario == 'gradual_deterioration':
            # After t=30, vitals start slowly deteriorating
            if t > 30:
                progress = (t - 30) / (num_samples - 30)
                hr += progress * 45  # HR rises to ~120
                spo2 -= progress * 12  # SpO2 drops to ~86%
                temp += progress * 1.8 # Temp rises to ~38.4
                rr += progress * 10   # RR rises to ~26
                label = 1
            else:
                hr += np.random.normal(0, 1.2)
                spo2 += np.random.normal(0, 0.3)
                label = 0

        elif scenario == 'sudden_change':
            # Sudden onset after t=40
            if t > 40:
                hr += 50 + np.random.normal(0, 3)
                spo2 -= 10 + np.random.normal(0, 1)
                label = 2
            else:
                hr += np.random.normal(0, 1.2)
                spo2 += np.random.normal(0, 0.3)
                label = 0

        elif scenario == 'sensor_malfunction':
            # Sensor glitch after t=40 (impossible value or flatline)
            if t > 40:
                if t % 2 == 0:
                    spo2 = 12.0  # Impossible SpO2
                else:
                    spo2 = 98.0  # Flatline/glitch
                label = 3
            else:
                spo2 += np.random.normal(0, 0.3)
                label = 0

        # Clip values to realistic bounds
        spo2 = max(0.0, min(100.0, spo2))
        hr = max(0.0, min(250.0, hr))
        temp = max(20.0, min(45.0, temp))
        rr = max(0.0, min(60.0, rr))

        hrs.append(hr)
        spo2s.append(spo2)
        temps.append(temp)
        rrs.append(rr)
        labels.append(label)

    df = pd.DataFrame({
        'patient_id': patient_id,
        'step': np.arange(num_samples),
        'heart_rate': hrs,
        'spo2': spo2s,
        'temperature': temps,
        'respiratory_rate': rrs,
        'label': labels
    })
    return df

def generate_dataset(num_patients: int = 50, window_size: int = 15) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    set_seed(SEED)
    patients = [f"P-{str(i).zfill(3)}" for i in range(1, num_patients + 1)]
    random.shuffle(patients)

    # 70% train (35 patients), 15% val (7 patients), 15% test (8 patients)
    train_patients = patients[:35]
    val_patients = patients[35:42]
    test_patients = patients[42:]

    scenarios = ['normal', 'gradual_deterioration', 'sudden_change', 'sensor_malfunction']

    def create_features_for_patient_list(patient_list):
        records = []
        for p in patient_list:
            for sc in scenarios:
                raw_df = generate_patient_session(p, sc, num_samples=100)
                readings_dict = raw_df[['heart_rate', 'spo2', 'temperature', 'respiratory_rate']].to_dict('records')
                labels_series = raw_df['label'].values

                for t in range(window_size, len(raw_df)):
                    window = readings_dict[t - window_size:t]
                    feats = extract_features_from_window(window)
                    target_label = labels_series[t - 1]

                    row = {'patient_id': p, 'scenario': sc, 'step': t, 'label': target_label, **feats}
                    records.append(row)
        return pd.DataFrame(records)

    train_df = create_features_for_patient_list(train_patients)
    val_df = create_features_for_patient_list(val_patients)
    test_df = create_features_for_patient_list(test_patients)

    return train_df, val_df, test_df

if __name__ == '__main__':
    data_dir = os.path.join(os.path.dirname(__file__), 'data')
    os.makedirs(data_dir, exist_ok=True)

    print("Generating synthetic datasets (split by patient)...")
    train_df, val_df, test_df = generate_dataset(num_patients=50)

    train_path = os.path.join(data_dir, 'train.csv')
    val_path = os.path.join(data_dir, 'val.csv')
    test_path = os.path.join(data_dir, 'test.csv')

    train_df.to_csv(train_path, index=False)
    val_df.to_csv(val_path, index=False)
    test_df.to_csv(test_path, index=False)

    print(f"Train dataset saved: {len(train_df)} samples ({len(train_df['patient_id'].unique())} patients) -> {train_path}")
    print(f"Val dataset saved:   {len(val_df)} samples ({len(val_df['patient_id'].unique())} patients) -> {val_path}")
    print(f"Test dataset saved:  {len(test_df)} samples ({len(test_df['patient_id'].unique())} patients) -> {test_path}")
