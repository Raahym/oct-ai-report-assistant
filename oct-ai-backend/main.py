import os
from io import BytesIO
from pathlib import Path
from typing import Any

import numpy as np
import torch
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, UnidentifiedImageError
from torchvision import models, transforms


CLASSES = ["CNV", "DME", "DRUSEN", "NORMAL"]
MODEL_NAME = "EfficientNet-B3"
MODEL_VERSION = "v1.0"
DISCLAIMER = "AI-assisted preliminary result. Requires doctor review."
INVALID_IMAGE_DISCLAIMER = "This does not appear to be a valid OCT scan. Please upload an OCT image."
LOW_CONFIDENCE_DISCLAIMER = "Uploaded image may not be a valid OCT scan or confidence is too low. Requires doctor review."
MODEL_PATH = Path(os.getenv("MODEL_PATH", "best_oct_model_b3.pth"))
MIN_CONFIDENCE = float(os.getenv("MIN_OCT_CONFIDENCE", "0.70"))
DEFAULT_ALLOWED_ORIGINS = "http://127.0.0.1:3000,http://localhost:3000"
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", DEFAULT_ALLOWED_ORIGINS).split(",")
    if origin.strip()
]

app = FastAPI(title="OCT AI Backend", version=MODEL_VERSION)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

preprocess = transforms.Compose(
    [
        transforms.Resize((300, 300)),
        transforms.ToTensor(),
        transforms.Normalize(
            mean=[0.485, 0.456, 0.406],
            std=[0.229, 0.224, 0.225],
        ),
    ]
)


def build_model() -> torch.nn.Module:
    model = models.efficientnet_b3(weights=None)
    in_features = model.classifier[1].in_features
    model.classifier[1] = torch.nn.Linear(in_features, len(CLASSES))
    return model


def clean_state_dict(checkpoint: Any) -> dict[str, torch.Tensor]:
    if isinstance(checkpoint, torch.nn.Module):
        return checkpoint.state_dict()

    if isinstance(checkpoint, dict):
        for key in ("model_state_dict", "state_dict", "model"):
            nested = checkpoint.get(key)
            if isinstance(nested, dict):
                checkpoint = nested
                break

    if not isinstance(checkpoint, dict):
        raise RuntimeError("Unsupported model checkpoint format.")

    cleaned = {}
    for key, value in checkpoint.items():
        if key.startswith("module."):
            key = key[len("module.") :]
        cleaned[key] = value
    return cleaned


def load_model() -> tuple[torch.nn.Module | None, str | None]:
    if not MODEL_PATH.exists():
        return None, f"Model file not found: {MODEL_PATH}"

    try:
        model = build_model()
        checkpoint = torch.load(MODEL_PATH, map_location=device)
        model.load_state_dict(clean_state_dict(checkpoint), strict=True)
        model.to(device)
        model.eval()
        return model, None
    except Exception as exc:
        return None, str(exc)


model, model_error = load_model()


def basic_oct_image_check(image: Image.Image) -> bool:
    rgb = np.array(image.convert("RGB").resize((300, 300)))
    gray = np.array(image.convert("L").resize((300, 300)))

    contrast = float(gray.std())
    brightness = float(gray.mean())

    red_green = np.abs(rgb[:, :, 0].astype(float) - rgb[:, :, 1].astype(float)).mean()
    green_blue = np.abs(rgb[:, :, 1].astype(float) - rgb[:, :, 2].astype(float)).mean()
    color_delta = float((red_green + green_blue) / 2)

    if contrast < 20:
        return False

    if brightness < 10 or brightness > 245:
        return False

    # OCT B-scans are usually grayscale-like. Strong color differences often mean
    # the upload is a normal photo, screenshot, fundus photo, or other non-OCT image.
    if color_delta > 18:
        return False

    return True


@app.get("/")
def root():
    return {
        "status": "ok",
        "service": "OCT AI Backend",
        "model_name": MODEL_NAME,
        "model_version": MODEL_VERSION,
        "disclaimer": DISCLAIMER,
    }


@app.get("/health")
def health():
    return {
        "status": "ok" if model is not None else "model_error",
        "model_loaded": model is not None,
        "model_path": str(MODEL_PATH),
        "device": str(device),
        "error": model_error,
    }


@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    if model is None:
        raise HTTPException(
            status_code=503,
            detail=f"AI model is not loaded. {model_error}",
        )

    if file.content_type not in {"image/jpeg", "image/png"}:
        raise HTTPException(
            status_code=400,
            detail="Only JPG, JPEG, and PNG OCT images are supported.",
        )

    try:
        image_bytes = await file.read()
        image = Image.open(BytesIO(image_bytes)).convert("RGB")
    except (UnidentifiedImageError, OSError) as exc:
        raise HTTPException(status_code=400, detail="Invalid image file.") from exc

    try:
        if not basic_oct_image_check(image):
            return {
                "prediction": "INVALID_IMAGE",
                "confidence": 0,
                "probabilities": {},
                "model_name": MODEL_NAME,
                "model_version": MODEL_VERSION,
                "is_valid_oct": False,
                "disclaimer": INVALID_IMAGE_DISCLAIMER,
            }

        image_tensor = preprocess(image).unsqueeze(0).to(device)
        with torch.no_grad():
            logits = model(image_tensor)
            softmax = torch.softmax(logits, dim=1).squeeze(0).cpu()

        probabilities = {
            class_name: round(float(softmax[index]), 4)
            for index, class_name in enumerate(CLASSES)
        }
        prediction = max(probabilities, key=probabilities.get)
        confidence = probabilities[prediction]

        if confidence < MIN_CONFIDENCE:
            return {
                "prediction": "INVALID_OR_UNCERTAIN_IMAGE",
                "confidence": confidence,
                "probabilities": probabilities,
                "model_name": MODEL_NAME,
                "model_version": MODEL_VERSION,
                "is_valid_oct": False,
                "disclaimer": LOW_CONFIDENCE_DISCLAIMER,
            }

        return {
            "prediction": prediction,
            "confidence": confidence,
            "probabilities": probabilities,
            "model_name": MODEL_NAME,
            "model_version": MODEL_VERSION,
            "is_valid_oct": True,
            "disclaimer": DISCLAIMER,
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {exc}") from exc
