import os
from pathlib import Path

import timm
import torch
from onnxruntime.quantization import QuantType, quantize_dynamic


ROOT = Path(__file__).resolve().parent
MODELS_DIR = (ROOT / ".." / "models").resolve()
CHECKPOINT_PATH = Path(
    os.environ.get("RETINA_DR_CONVNEXT_MODEL_PATH", MODELS_DIR / "best_convnext_model.pth")
)
ONNX_PATH = Path(
    os.environ.get("RETINA_DR_CONVNEXT_ONNX_PATH", MODELS_DIR / "best_convnext_model.onnx")
)
QUANTIZED_ONNX_PATH = Path(
    os.environ.get(
        "RETINA_DR_CONVNEXT_QUANTIZED_ONNX_PATH",
        MODELS_DIR / "best_convnext_model.quant.onnx",
    )
)
MODEL_NAME = os.environ.get("RETINA_DR_CONVNEXT_ARCH", "convnext_base")
IMAGE_SIZE = int(os.environ.get("RETINA_DR_IMAGE_SIZE", "224"))


def load_model():
    if not CHECKPOINT_PATH.exists():
        raise FileNotFoundError(f"ConvNeXt checkpoint not found: {CHECKPOINT_PATH}")

    model = timm.create_model(MODEL_NAME, pretrained=False, num_classes=5)
    state_dict = torch.load(CHECKPOINT_PATH, map_location="cpu")
    model.load_state_dict(state_dict, strict=True)
    model.eval()
    return model


def main():
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    model = load_model()
    dummy_input = torch.randn(1, 3, IMAGE_SIZE, IMAGE_SIZE)

    torch.onnx.export(
        model,
        dummy_input,
        ONNX_PATH,
        input_names=["input"],
        output_names=["logits"],
        opset_version=17,
        do_constant_folding=True,
        dynamic_axes=None,
        dynamo=False,
    )

    quantize_dynamic(
        model_input=str(ONNX_PATH),
        model_output=str(QUANTIZED_ONNX_PATH),
        weight_type=QuantType.QUInt8,
    )

    print(f"exported={ONNX_PATH} bytes={ONNX_PATH.stat().st_size}")
    print(f"quantized={QUANTIZED_ONNX_PATH} bytes={QUANTIZED_ONNX_PATH.stat().st_size}")


if __name__ == "__main__":
    main()
