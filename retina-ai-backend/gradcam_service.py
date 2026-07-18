import base64
import hashlib
import hmac
import os
import time

import cv2
import numpy as np
import timm
import torch
from flask import Flask, jsonify, request

MODEL_PATH = os.path.join(
    os.path.dirname(__file__), "..", "models", "best_convnext_model.pth"
)
IMAGE_SIZE = 224
OVERLAY_OPACITY = 0.4
AI_GATEWAY_SHARED_SECRET = os.environ.get("AI_GATEWAY_SHARED_SECRET", "")
REQUIRE_AI_GATEWAY_SIGNATURE = os.environ.get("REQUIRE_AI_GATEWAY_SIGNATURE", "true").lower() != "false"
MAX_SIGNATURE_AGE_MS = int(os.environ.get("AI_GATEWAY_SIGNATURE_MAX_AGE_MS", str(5 * 60 * 1000)))
SEEN_GATEWAY_REQUEST_IDS = {}

app = Flask(__name__)


class GradCAM:
    def __init__(self, model, target_layer):
        self.model = model
        self.activations = None
        self.gradients = None
        target_layer.register_forward_hook(self._save_activation)
        target_layer.register_full_backward_hook(self._save_gradient)

    def _save_activation(self, module, input, output):
        self.activations = output.detach()

    def _save_gradient(self, module, grad_input, grad_output):
        self.gradients = grad_output[0].detach()

    def generate(self, input_tensor):
        self.model.zero_grad()
        output = self.model(input_tensor)
        predicted_class = output.argmax(dim=1).item()

        score = output[0, predicted_class]
        score.backward()

        gradients = self.gradients[0]
        activations = self.activations[0]
        weights = gradients.mean(dim=(1, 2))

        cam = torch.zeros(activations.shape[1:], dtype=torch.float32)
        for i, w in enumerate(weights):
            cam += w * activations[i]

        cam = torch.relu(cam).numpy()
        cam = cv2.resize(cam, (IMAGE_SIZE, IMAGE_SIZE))
        cam = cam - cam.min()
        if cam.max() > 0:
            cam = cam / cam.max()

        # only show top 70% of attention
        cam_threshold = cam.copy()
        cam_threshold[cam_threshold < 0.3] = 0
        cam = cam_threshold

        return cam, predicted_class


def crop_to_circle(image_bgr):
    height, width = image_bgr.shape[:2]
    center = (width // 2, height // 2)
    radius = int(min(width, height) * 0.48)
    mask = np.zeros((height, width), dtype=np.uint8)
    cv2.circle(mask, center, radius, 255, -1)
    cropped = cv2.bitwise_and(image_bgr, image_bgr, mask=mask)
    x1 = max(center[0] - radius, 0)
    y1 = max(center[1] - radius, 0)
    x2 = min(center[0] + radius, width)
    y2 = min(center[1] + radius, height)
    return cropped[y1:y2, x1:x2]


def apply_clahe(image_rgb):
    lab = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2LAB)
    l_channel, a_channel, b_channel = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced_l = clahe.apply(l_channel)
    enhanced_lab = cv2.merge((enhanced_l, a_channel, b_channel))
    return cv2.cvtColor(enhanced_lab, cv2.COLOR_LAB2RGB)


def preprocess_image(image_bgr):
    cropped = crop_to_circle(image_bgr)
    resized = cv2.resize(cropped, (IMAGE_SIZE, IMAGE_SIZE))
    rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB)
    enhanced = apply_clahe(rgb)

    normalized = enhanced.astype(np.float32) / 255.0
    tensor = torch.from_numpy(normalized.transpose(2, 0, 1)).unsqueeze(0).float()

    return tensor, resized


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


def apply_circular_mask(heatmap, image):
    h, w = heatmap.shape[:2]
    center_x, center_y = w // 2, h // 2

    # radius is 46% of the smaller dimension
    radius = int(min(h, w) * 0.46)

    # create distance map from center
    Y, X = np.ogrid[:h, :w]
    dist_from_center = np.sqrt((X - center_x) ** 2 + (Y - center_y) ** 2)

    # create soft mask — 1.0 inside, gradual fade at edge
    # transition zone is 8% of radius width
    transition = radius * 0.08
    mask = np.clip((radius - dist_from_center) / transition, 0, 1).astype(np.float32)

    # apply soft mask to each channel of heatmap
    if len(heatmap.shape) == 3:
        mask = mask[:, :, np.newaxis]

    heatmap_masked = heatmap * mask
    return heatmap_masked.astype(heatmap.dtype)


def overlay_heatmap(cam, original_bgr):
    heatmap = cv2.applyColorMap(np.uint8(255 * cam), cv2.COLORMAP_JET)
    overlay = cv2.addWeighted(
        heatmap, OVERLAY_OPACITY, original_bgr, 1 - OVERLAY_OPACITY, 0
    )
    return overlay


def encode_image_base64(image_bgr):
    success, buffer = cv2.imencode(".png", image_bgr)
    if not success:
        raise ValueError("Failed to encode overlay image")
    return base64.b64encode(buffer).decode("utf-8")


model = timm.create_model("convnext_base", pretrained=False, num_classes=5)
model.load_state_dict(torch.load(MODEL_PATH, map_location="cpu"))
model.eval()

grad_cam = GradCAM(model, model.stages[-1])


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


@app.route("/gradcam", methods=["POST"])
def gradcam():
    if "image" not in request.files:
        return jsonify({"error": "No image file uploaded"}), 400

    raw_file_bytes = request.files["image"].read()
    signature_error = verify_ai_gateway_signature(raw_file_bytes)
    if signature_error is not None:
        return signature_error

    file_bytes = np.frombuffer(raw_file_bytes, dtype=np.uint8)
    image_bgr = cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)
    if image_bgr is None:
        return jsonify({"error": "Could not decode image"}), 400

    input_tensor, resized_original = preprocess_image(image_bgr)
    cam, predicted_class = grad_cam.generate(input_tensor)
    cam = apply_circular_mask(cam, resized_original)
    overlay = overlay_heatmap(cam, resized_original)
    heatmap_b64 = encode_image_base64(overlay)

    return jsonify({"heatmap": heatmap_b64, "predicted_class": predicted_class})


if __name__ == "__main__":
    app.run(port=5000)
