import numpy as np
from typing import Dict, List
from features import FEATURE_NAMES

# Normal baseline reference values for feature deviation calculations
BASELINE_MEANS = {
    'hr_mean': 75.0,
    'hr_std': 1.0,
    'hr_slope': 0.0,
    'spo2_mean': 98.0,
    'spo2_std': 0.3,
    'spo2_slope': 0.0,
    'temp_mean': 36.6,
    'temp_slope': 0.0,
    'rr_mean': 16.0,
    'rr_slope': 0.0,
    'cross_hr_spo2_ratio': 0.765,
    'cross_hr_up_spo2_down': 0.0,
}

FEATURE_DESCRIPTIONS = {
    'hr_mean': ('Heart rate mean elevated', 'Heart rate mean abnormally low'),
    'hr_slope': ('Heart rate rising rapidly', 'Heart rate dropping rapidly'),
    'spo2_mean': ('SpO2 level normal', 'SpO2 level abnormally low'),
    'spo2_slope': ('SpO2 stable', 'SpO2 dropping rapidly'),
    'temp_mean': ('Body temperature elevated (Fever)', 'Body temperature low (Hypothermia)'),
    'rr_mean': ('Respiratory rate elevated (Tachypnea)', 'Respiratory rate low (Bradypnea)'),
    'cross_hr_spo2_ratio': ('HR/SpO2 mismatch ratio high', 'HR/SpO2 mismatch ratio low'),
    'cross_hr_up_spo2_down': ('Cardiopulmonary stress coupling (HR rising while SpO2 falling)', ''),
}

def generate_explanation(feature_dict: Dict[str, float], top_n: int = 3) -> List[str]:
    """
    Generates plain-language explanation of top contributing features
    based on normalized Z-score deviation from healthy baseline.
    """
    deviations = []

    for feat, val in feature_dict.items():
        base = BASELINE_MEANS.get(feat, 0.0)
        if feat == 'spo2_mean':
            # Negative deviation for SpO2 dropping is critical
            dev = max(0.0, base - val) * 3.0
            direction = 'low'
        elif feat == 'spo2_slope':
            dev = max(0.0, -val) * 5.0
            direction = 'drop'
        elif feat == 'hr_slope':
            dev = max(0.0, val) * 2.0
            direction = 'rise'
        elif feat == 'cross_hr_up_spo2_down':
            dev = val * 10.0
            direction = 'coupling'
        else:
            dev = abs(val - base)
            direction = 'high' if val > base else 'low'

        deviations.append((feat, dev, val, direction))

    # Sort by magnitude of deviation descending
    deviations.sort(key=lambda x: x[1], reverse=True)

    reasons = []
    for feat, dev, val, direction in deviations[:top_n]:
        if dev < 0.1:
            continue

        if feat in FEATURE_DESCRIPTIONS:
            pos_desc, neg_desc = FEATURE_DESCRIPTIONS[feat]
            if direction in ['rise', 'coupling', 'high'] and pos_desc:
                reasons.append(f"{pos_desc} ({val:.1f})")
            elif direction in ['drop', 'low'] and neg_desc:
                reasons.append(f"{neg_desc} ({val:.1f})")
            elif pos_desc:
                reasons.append(f"{pos_desc} ({val:.1f})")
        else:
            reasons.append(f"{feat.replace('_', ' ').title()}: {val:.2f}")

    if not reasons:
        reasons.append("Vitals within normal baseline ranges.")

    return reasons
