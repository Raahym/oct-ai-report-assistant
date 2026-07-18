import os
import base64
import hashlib
import hmac
import time
from io import BytesIO

import numpy as np
import timm
import torch
from flask import Flask, jsonify, request
from flask_cors import CORS
from PIL import Image, ImageStat


PORT = int(os.environ.get("PORT", "3000"))
ALLOWED_ORIGIN = os.environ.get("ALLOWED_ORIGIN", "*")
MODEL_PATH = os.environ.get(
    "RETINA_DR_CONVNEXT_MODEL_PATH",
    os.path.join(os.path.dirname(__file__), "..", "models", "best_convnext_model.pth"),
)
MODEL_NAME = os.environ.get("RETINA_DR_CONVNEXT_ARCH", "convnext_base")
IMAGE_SIZE = int(os.environ.get("RETINA_DR_IMAGE_SIZE", "224"))
TORCH_THREADS = int(os.environ.get("TORCH_NUM_THREADS", "1"))
AI_GATEWAY_SHARED_SECRET = os.environ.get("AI_GATEWAY_SHARED_SECRET", "")
REQUIRE_AI_GATEWAY_SIGNATURE = os.environ.get("REQUIRE_AI_GATEWAY_SIGNATURE", "true").lower() != "false"
MAX_SIGNATURE_AGE_MS = int(os.environ.get("AI_GATEWAY_SIGNATURE_MAX_AGE_MS", str(5 * 60 * 1000)))
SEEN_GATEWAY_REQUEST_IDS = {}

CLASS_LABELS = {
    0: "No DR",
    1: "Mild DR",
    2: "Moderate DR",
    3: "Severe DR",
    4: "Proliferative DR",
}

REFERRAL_GUIDANCE = {
    0: "Re-screen in 12 months",
    1: "Re-screen in 6 months",
    2: "Refer to ophthalmologist within 6 months",
    3: "Urgent referral within 2-4 weeks",
    4: "Emergency referral - high risk of vision loss",
}

IMAGENET_MEAN = torch.tensor([0.485, 0.456, 0.406]).view(3, 1, 1)
IMAGENET_STD = torch.tensor([0.229, 0.224, 0.225]).view(3, 1, 1)

torch.set_num_threads(TORCH_THREADS)

app = Flask(__name__)
CORS(app, origins=ALLOWED_ORIGIN)
model = None


def load_model():
    if not os.path.exists(MODEL_PATH):
        raise FileNotFoundError(f"ConvNeXt DR model not found: {MODEL_PATH}")

    loaded_model = timm.create_model(MODEL_NAME, pretrained=False, num_classes=5)
    state_dict = torch.load(MODEL_PATH, map_location="cpu")
    loaded_model.load_state_dict(state_dict, strict=True)
    loaded_model.eval()
    return loaded_model


def get_model():
    global model
    if model is None:
        model = load_model()
    return model


def is_model_loaded():
    return model is not None


def validate_fundus_image(image):
    width, height = image.size
    if width < 128 or height < 128:
        return False, "Image is too small for retina screening."

    aspect_ratio = width / height
    if aspect_ratio > 1.35 or aspect_ratio < 0.75:
        return False, "Image does not look like a fundus photograph."

    stat = ImageStat.Stat(image)
    mean_brightness = sum(stat.mean) / len(stat.mean)
    if mean_brightness < 10:
        return False, "Image is too dark for retina screening."

    return True, None


def preprocess_image(file_bytes):
    image = Image.open(BytesIO(file_bytes)).convert("RGB")
    valid, error = validate_fundus_image(image)
    if not valid:
        raise ValueError(error)

    image = image.resize((IMAGE_SIZE, IMAGE_SIZE), Image.Resampling.BICUBIC)
    array = np.asarray(image).astype("float32") / 255.0
    tensor = torch.from_numpy(array).permute(2, 0, 1)
    tensor = (tensor - IMAGENET_MEAN) / IMAGENET_STD
    return tensor.unsqueeze(0)


def prune_seen_gateway_request_ids():
    cutoff = time.time() - (MAX_SIGNATURE_AGE_MS / 1000)
    for request_id, seen_at in list(SEEN_GATEWAY_REQUEST_IDS.items()):
        if seen_at < cutoff:
            SEEN_GATEWAY_REQUEST_IDS.pop(request_id, None)


def verify_ai_gateway_signature(file_bytes):
    if not REQUIRE_AI_GATEWAY_SIGNATURE:
        return None

    if not AI_GATEWAY_SHARED_SECRET:
        return jsonify({"error": "AI gateway shared secret is not configured"}), 500

    timestamp = request.headers.get("X-AFIO-Timestamp")
    signature = request.headers.get("X-AFIO-Signature")
    request_id = request.headers.get("X-AFIO-Request-Id")
    if not timestamp or not signature or not request_id:
        return jsonify({"error": "Missing AFIO gateway signature"}), 401

    try:
        timestamp_ms = int(timestamp)
    except ValueError:
        return jsonify({"error": "Invalid AFIO gateway timestamp"}), 403

    if abs(int(time.time() * 1000) - timestamp_ms) > MAX_SIGNATURE_AGE_MS:
        return jsonify({"error": "Invalid or expired AFIO gateway signature"}), 403

    prune_seen_gateway_request_ids()
    if request_id in SEEN_GATEWAY_REQUEST_IDS:
        return jsonify({"error": "Duplicate AFIO gateway request"}), 409

    expected_signature = hmac.new(
        AI_GATEWAY_SHARED_SECRET.encode("utf-8"),
        f"{timestamp}.{request_id}.{base64.b64encode(file_bytes).decode('ascii')}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(expected_signature, signature):
        return jsonify({"error": "Invalid AFIO gateway signature"}), 403

    SEEN_GATEWAY_REQUEST_IDS[request_id] = time.time()
    return None


@app.get("/health")
def health():
    return jsonify({"status": "ok" if is_model_loaded() else "model_error"})


@app.post("/predict")
def predict():
    uploaded = request.files.get("image")
    if uploaded is None:
        return jsonify({"error": "No image file uploaded"}), 400
    file_bytes = uploaded.read()

    signature_error = verify_ai_gateway_signature(file_bytes)
    if signature_error is not None:
        return signature_error

    try:
        tensor = preprocess_image(file_bytes)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception:
        return jsonify({"error": "Invalid image file"}), 400

    with torch.inference_mode():
        output = get_model()(tensor)
        probabilities = torch.softmax(output, dim=1)[0].cpu().numpy()

    predicted_class = int(probabilities.argmax())
    top_score = float(probabilities[predicted_class])
    second_score = float(np.partition(probabilities, -2)[-2])
    is_low_confidence = top_score < 0.5 or top_score - second_score < 0.15

    return jsonify(
        {
            "predicted_class": predicted_class,
            "severity_label": CLASS_LABELS[predicted_class],
            "confidence": round(top_score, 2),
            "scores": [round(float(score), 2) for score in probabilities],
            "referral": REFERRAL_GUIDANCE[predicted_class],
            "heatmap": None,
            "low_confidence": is_low_confidence,
            "confidence_warning": "Low confidence prediction - consider re-imaging or specialist review"
            if is_low_confidence
            else None,
            "model_name": "ConvNeXt-Base DR Screening Model",
        }
    )


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=PORT)
