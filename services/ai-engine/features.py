import numpy as np
import pandas as pd
from typing import List, Dict, Any

FEATURE_NAMES = [
  'hr_mean', 'hr_std', 'hr_min', 'hr_max', 'hr_slope', 'hr_last',
  'spo2_mean', 'spo2_std', 'spo2_min', 'spo2_max', 'spo2_slope', 'spo2_last',
  'temp_mean', 'temp_std', 'temp_min', 'temp_max', 'temp_slope', 'temp_last',
  'rr_mean', 'rr_std', 'rr_min', 'rr_max', 'rr_slope', 'rr_last',
  'cross_hr_spo2_ratio', 'cross_hr_up_spo2_down'
]

def calculate_slope(values: np.ndarray) -> float:
    if len(values) < 2:
        return 0.0
    x = np.arange(len(values))
    # Simple linear regression slope
    slope, _ = np.polyfit(x, values, 1)
    return float(slope)

def extract_features_from_window(readings: List[Dict[str, Any]]) -> Dict[str, float]:
    """
    Extracts rolling window statistical and interaction features from a list of vitals samples.
    Each reading is expected to be a dict with keys:
      - heart_rate: float
      - spo2: float
      - temperature: float
      - respiratory_rate: float
    """
    if not readings:
        return {f: 0.0 for f in FEATURE_NAMES}

    df = pd.DataFrame(readings)
    for col in ['heart_rate', 'spo2', 'temperature', 'respiratory_rate']:
        if col not in df.columns:
            df[col] = 0.0
        df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0.0)

    hr = df['heart_rate'].values
    spo2 = df['spo2'].values
    temp = df['temperature'].values
    rr = df['respiratory_rate'].values

    hr_mean = float(np.mean(hr))
    hr_std = float(np.std(hr)) if len(hr) > 1 else 0.0
    hr_min = float(np.min(hr))
    hr_max = float(np.max(hr))
    hr_slope = calculate_slope(hr)
    hr_last = float(hr[-1])

    spo2_mean = float(np.mean(spo2))
    spo2_std = float(np.std(spo2)) if len(spo2) > 1 else 0.0
    spo2_min = float(np.min(spo2))
    spo2_max = float(np.max(spo2))
    spo2_slope = calculate_slope(spo2)
    spo2_last = float(spo2[-1])

    temp_mean = float(np.mean(temp))
    temp_std = float(np.std(temp)) if len(temp) > 1 else 0.0
    temp_min = float(np.min(temp))
    temp_max = float(np.max(temp))
    temp_slope = calculate_slope(temp)
    temp_last = float(temp[-1])

    rr_mean = float(np.mean(rr))
    rr_std = float(np.std(rr)) if len(rr) > 1 else 0.0
    rr_min = float(np.min(rr))
    rr_max = float(np.max(rr))
    rr_slope = calculate_slope(rr)
    rr_last = float(rr[-1])

    cross_hr_spo2_ratio = hr_mean / max(spo2_mean, 1.0)
    cross_hr_up_spo2_down = max(0.0, hr_slope) * max(0.0, -spo2_slope)

    return {
        'hr_mean': hr_mean,
        'hr_std': hr_std,
        'hr_min': hr_min,
        'hr_max': hr_max,
        'hr_slope': hr_slope,
        'hr_last': hr_last,

        'spo2_mean': spo2_mean,
        'spo2_std': spo2_std,
        'spo2_min': spo2_min,
        'spo2_max': spo2_max,
        'spo2_slope': spo2_slope,
        'spo2_last': spo2_last,

        'temp_mean': temp_mean,
        'temp_std': temp_std,
        'temp_min': temp_min,
        'temp_max': temp_max,
        'temp_slope': temp_slope,
        'temp_last': temp_last,

        'rr_mean': rr_mean,
        'rr_std': rr_std,
        'rr_min': rr_min,
        'rr_max': rr_max,
        'rr_slope': rr_slope,
        'rr_last': rr_last,

        'cross_hr_spo2_ratio': cross_hr_spo2_ratio,
        'cross_hr_up_spo2_down': cross_hr_up_spo2_down,
    }
