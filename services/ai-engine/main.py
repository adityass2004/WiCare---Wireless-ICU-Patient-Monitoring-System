import os
from typing import List, Optional
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from model import AIModelPipeline
from features import extract_features_from_window

app = FastAPI(
    title="WiCare Local AI Predictive Engine",
    description="Local machine learning anomaly scoring and explanation service for WiCare patient monitoring",
    version="1.0.0"
)

pipeline = AIModelPipeline()

@app.on_event("startup")
def startup_event():
    success = pipeline.load()
    if not success:
        print("Model file not found on startup! Training pipeline...")
        from model import train_and_save
        train_and_save()
        pipeline.load()
    print("WiCare AI Engine models loaded successfully!")

class VitalSample(BaseModel):
    heart_rate: float = Field(..., example=75.0)
    spo2: float = Field(..., example=98.0)
    temperature: float = Field(..., example=36.6)
    respiratory_rate: float = Field(..., example=16.0)

class ScoreRequest(BaseModel):
    patientId: str = Field(..., example="P-001")
    window: List[VitalSample]

class ScoreResponse(BaseModel):
    patientId: str
    riskScore: float
    label: str
    confidence: float
    isoRiskScore: float
    rfRiskScore: float
    explanations: List[str]

@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "wicare-ai-engine",
        "is_fitted": pipeline.is_fitted
    }

@app.post("/score", response_model=ScoreResponse)
def score_patient_window(request: ScoreRequest):
    if not request.window:
        raise HTTPException(status_code=400, detail="Window must contain at least 1 reading sample")

    readings = [sample.model_dump() for sample in request.window]
    feats = extract_features_from_window(readings)
    res = pipeline.predict_window(feats)

    return ScoreResponse(
        patientId=request.patientId,
        riskScore=res['risk_score'],
        label=res['label'],
        confidence=res['confidence'],
        isoRiskScore=res['iso_risk_score'],
        rfRiskScore=res['rf_risk_score'],
        explanations=res['explanations']
    )

if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
