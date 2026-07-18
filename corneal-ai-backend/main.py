import base64
import hashlib
import hmac
import os
import time

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from model import (
    DISCLAIMER,
    INVALID_IMAGE_DISCLAIMER,
    MODEL_NAME,
    MODEL_VERSION,
    assess_vkg_image_quality,
    load_models,
    load_summary,
    predict_image,
    read_image_bytes,
)
from schemas import CornealPrediction


DEFAULT_ALLOWED_ORIGINS = "http://127.0.0.1:3000,http://localhost:3000,https://cvclinics.online"
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", DEFAULT_ALLOWED_ORIGINS).split(",")
    if origin.strip()
]

app = FastAPI(title="AFIO Corneal AI Backend", version=MODEL_VERSION)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

models_dict = None
model_error = None
summary = load_summary()
AI_GATEWAY_SHARED_SECRET = os.getenv("AI_GATEWAY_SHARED_SECRET", "")
SEEN_GATEWAY_REQUEST_IDS: dict[str, float] = {}


def get_models():
    global models_dict, model_error
    if models_dict is None:
        models_dict, model_error = load_models()
    return models_dict, model_error


async def verify_ai_gateway_signature(request: Request, file: UploadFile) -> None:
    timestamp = request.headers.get("X-AFIO-Timestamp")
    signature = request.headers.get("X-AFIO-Signature")
    request_id = request.headers.get("X-AFIO-Request-Id")

    if not timestamp or not signature or not request_id:
        raise HTTPException(status_code=401, detail="Missing AFIO signature headers.")

    try:
        timestamp_ms = int(timestamp)
    except ValueError as exc:
        raise HTTPException(status_code=403, detail="Invalid AFIO timestamp.") from exc

    if int(time.time() * 1000) - timestamp_ms > 5 * 60 * 1000:
        raise HTTPException(status_code=403, detail="AFIO signature has expired.")

    if not AI_GATEWAY_SHARED_SECRET:
        raise HTTPException(status_code=500, detail="AI gateway shared secret is not configured.")

    prune_seen_gateway_request_ids()
    if request_id in SEEN_GATEWAY_REQUEST_IDS:
        raise HTTPException(status_code=409, detail="Duplicate AFIO gateway request.")

    file_bytes = await file.read()
    expected_signature = hmac.new(
        AI_GATEWAY_SHARED_SECRET.encode("utf-8"),
        f"{timestamp}.{request_id}.{base64.b64encode(file_bytes).decode('ascii')}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    await file.seek(0)

    if not hmac.compare_digest(expected_signature, signature):
        raise HTTPException(status_code=403, detail="Invalid AFIO signature.")

    SEEN_GATEWAY_REQUEST_IDS[request_id] = time.time()


def prune_seen_gateway_request_ids() -> None:
    cutoff = time.time() - 5 * 60
    for request_id, seen_at in list(SEEN_GATEWAY_REQUEST_IDS.items()):
        if seen_at < cutoff:
            SEEN_GATEWAY_REQUEST_IDS.pop(request_id, None)


@app.get("/")
def root():
    return {
        "status": "ok",
        "service": "AFIO Corneal AI Backend",
        "disclaimer": DISCLAIMER,
    }


@app.get("/health")
def health():
    return {
        "status": "ok",
        "model_loaded": bool(models_dict),
        "error": bool(model_error),
    }


@app.post("/predict", response_model=CornealPrediction)
async def predict(request: Request, file: UploadFile = File(...)):
    loaded_models, load_error = get_models()
    if not loaded_models:
        raise HTTPException(status_code=503, detail=f"Corneal model is not loaded. {load_error}")
    await verify_ai_gateway_signature(request, file)
    if file.content_type not in {"image/jpeg", "image/png"}:
        raise HTTPException(status_code=400, detail="Only JPG, JPEG, and PNG corneal images are supported.")

    try:
        image = read_image_bytes(await file.read())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    quality = assess_vkg_image_quality(image)
    if not quality["is_valid"]:
        return CornealPrediction(
            prediction="INVALID_IMAGE",
            confidence=0,
            probabilities={},
            risk_level="UNKNOWN",
            model_name=MODEL_NAME,
            model_version=MODEL_VERSION,
            models_used=list(loaded_models.keys()),
            is_valid_corneal=False,
            quality_metrics=quality["metrics"],
            validation_warnings=quality["warnings"],
            disclaimer=f"{INVALID_IMAGE_DISCLAIMER} {' '.join(quality['warnings'])}",
        )

    return CornealPrediction(**predict_image(image, loaded_models, quality))
