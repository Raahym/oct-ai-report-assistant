from pydantic import BaseModel


class CornealPrediction(BaseModel):
    prediction: str
    confidence: float
    probabilities: dict[str, float]
    risk_level: str
    model_name: str
    model_version: str
    models_used: list[str]
    is_valid_corneal: bool
    quality_metrics: dict[str, float | bool | str] = {}
    validation_warnings: list[str] = []
    disclaimer: str
    inference_time_ms: int | None = None
