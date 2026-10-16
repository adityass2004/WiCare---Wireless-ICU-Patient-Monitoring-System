# WiCare Local AI Predictive Engine (`services/ai-engine`)

A high-performance, standalone Python FastAPI microservice providing real-time multi-vital anomaly detection, patient deterioration risk scoring, and plain-language explanation generation.

> **CRITICAL DISCLAIMER & LIMITATION NOTICE**
> Synthetic data demonstrates software functionality, system architecture, and machine learning pipeline integration, not clinical accuracy or diagnostic efficacy.

---

## Architecture Overview

1. **Feature Extraction (`features.py`)**: Computes rolling statistics (`mean`, `std`, `min`, `max`, `slope`) and multi-vital interaction ratios (`cross_hr_spo2_ratio`, `cross_hr_up_spo2_down`) over a sliding window of recent telemetry samples.
2. **Model Ensemble (`model.py`)**: Combines an unsupervised **Isolation Forest** (for novel anomaly detection) and a supervised **Random Forest Classifier** to produce normalized risk scores (0.0 to 1.0).
3. **Natural Language Explanations (`explain.py`)**: Identifies top feature Z-score deviations from healthy baselines and generates human-readable diagnostic explanations.
4. **FastAPI Service (`main.py`)**: REST microservice listening on `http://127.0.0.1:8000` exposing `POST /score` and `GET /health`.

---

## Setup & Running Instructions

### 1. Install Python Dependencies
```bash
pip install -r requirements.txt
```

### 2. Generate Synthetic Datasets
Generates patient-wise split datasets (Train / Val / Test) with 0 data leakage:
```bash
python data_generator.py
```

### 3. Train Models
Trains Isolation Forest and Random Forest models and persists them to `models/`:
```bash
python model.py
```

### 4. Run Model Evaluation Report
Evaluates held-out test data, compares AI vs Phase 4 rule-based baseline, generates `roc_curve.png`, and writes `docs/experiments.md`:
```bash
python eval.py
```

### 5. Start Local AI FastAPI Server
Starts the HTTP scoring engine on `http://127.0.0.1:8000`:
```bash
python main.py
```

---

## API Endpoints

- `GET /health` — Check engine status.
- `POST /score` — Compute risk score and explanation for a patient window.
