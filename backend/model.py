import os
import random
from dataclasses import dataclass

import torch
from torchvision import models


CLASSES = ["CNV", "DME", "DRUSEN", "NORMAL"]


@dataclass
class PredictionResult:
    prediction: str
    confidence: float
    probabilities: dict[str, float]
    model_name: str
    model_version: str
    is_dummy_result: bool


class OCTModelService:
    def __init__(self) -> None:
        self.model_name = "EfficientNet-B0"
        self.model_version = "v1.0"
        self.model_path = os.getenv("MODEL_PATH", "saved_model/oct_model.pth")
        self.allow_dummy = os.getenv("ALLOW_DUMMY_AI", "true").lower() == "true"
        self.model = self._load_model()

    @property
    def model_loaded(self) -> bool:
        return self.model is not None

    def _load_model(self):
        if not os.path.exists(self.model_path):
            return None
        model = models.efficientnet_b0(weights=None)
        in_features = model.classifier[1].in_features
        model.classifier[1] = torch.nn.Linear(in_features, len(CLASSES))
        model.load_state_dict(torch.load(self.model_path, map_location="cpu"))
        model.eval()
        return model

    def predict(self, tensor) -> PredictionResult:
        if self.model is None:
            if not self.allow_dummy:
                raise RuntimeError("Model file is missing and dummy mode is disabled.")
            return self._dummy_prediction()

        with torch.no_grad():
            outputs = self.model(tensor)
            probs = torch.softmax(outputs, dim=1).squeeze().tolist()

        probabilities = {label: round(float(probs[index]), 4) for index, label in enumerate(CLASSES)}
        prediction = max(probabilities, key=probabilities.get)
        return PredictionResult(
            prediction=prediction,
            confidence=probabilities[prediction],
            probabilities=probabilities,
            model_name=self.model_name,
            model_version=self.model_version,
            is_dummy_result=False,
        )

    def _dummy_prediction(self) -> PredictionResult:
        prediction = random.choice(CLASSES)
        confidence = round(random.uniform(0.79, 0.93), 2)
        remaining = 1 - confidence
        others = [label for label in CLASSES if label != prediction]
        probabilities = {
            prediction: confidence,
            others[0]: round(remaining * 0.42, 2),
            others[1]: round(remaining * 0.35, 2),
        }
        probabilities[others[2]] = round(1 - sum(probabilities.values()), 2)
        return PredictionResult(
            prediction=prediction,
            confidence=confidence,
            probabilities=probabilities,
            model_name=self.model_name,
            model_version="demo-v1.0",
            is_dummy_result=True,
        )
