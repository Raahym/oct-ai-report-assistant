# Group 3 DR ConvNeXt Model Update - 2026-07-16

## Drive Folder Comparison

Source folder:
`https://drive.google.com/drive/folders/1VBxwdx-CoSBP906N3Zx_gEjRGfeQtglo`

Compared against local `models/`.

| File | Result |
| --- | --- |
| `best_efficientnet_model.pth` | Identical to existing local file. No replacement needed. |
| `glaucoma_model.onnx` | Identical to existing local file. No replacement needed. |
| `glaucoma_model.onnx.data` | Identical to existing local file. No replacement needed. |
| `hr_efficientnet_model.onnx` | Identical to existing local file. No replacement needed. |
| `smoke_test.onnx` | Identical to existing local file. No replacement needed. |
| `smoke_test.onnx.data` | Identical to existing local file. No replacement needed. |
| `best_convnext_model.pth` | New file, 350,423,607 bytes, SHA256 starts `472D23E4D44D`. Added as the upgraded DR model. |

## Why This Is Not A Drop-In File Swap

The old DR prediction endpoint used `smoke_test.onnx` through the Node.js `onnxruntime-node` service.

The new file is a PyTorch checkpoint, not ONNX:

`best_convnext_model.pth`

It was inspected locally and matches a timm `convnext_base` model with 5 output classes:

- `No DR`
- `Mild DR`
- `Moderate DR`
- `Severe DR`
- `Proliferative DR`

The checkpoint loaded with zero missing and zero unexpected weights.

## Deployment Change

Only the DR Render service changes:

`afio-retina-dr-backend`

It now runs:

`python dr_convnext_service.py`

Glaucoma and hypertensive-retinopathy services stay on their existing ONNX files and Node.js service.

This keeps the heavier PyTorch ConvNeXt dependency isolated to DR only.

## Validation

Local checks completed:

- Python compile passed for `dr_convnext_service.py`.
- `best_convnext_model.pth` copied into ignored local `models/`.
- ConvNeXt checkpoint loaded successfully.
- The service returned the same response shape expected by the frontend.
- OCT-shaped images are rejected by the DR service instead of being silently classified as fundus.

## Notes

This update proves the new checkpoint is usable and newer than the old ONNX DR model, but it does not prove clinical superiority because the Drive folder did not include a validation report, confusion matrix, sensitivity/specificity, or test-set metrics.

For a proper model-quality decision, compare the old DR ONNX and new ConvNeXt checkpoint on the same held-out fundus validation set.

## Follow-up Check - 2026-07-18

Arsal clarified that the Drive folder is the final Retina model package and that `smoke_test.onnx` is the DR ONNX file. The folder still contains the same seven model files listed above, including `best_convnext_model.pth`.

The earlier Render ConvNeXt export path is no longer the target production DR screening path. `best_convnext_model.pth` belongs with the DR Grad-CAM/AWS worker, not the ordinary Render DR `/predict` service.

The Render DR service now uses:

`RETINA_DR_MODEL_KIND=legacy`

`RETINA_DR_INPUT_SIZE=224`

`RETINA_DR_MODEL_PATH=../models/smoke_test.onnx`

Fresh ONNX inspection showed the final Drive files use:

| File | Input | Output |
| --- | --- | --- |
| `smoke_test.onnx` | `[1, 3, 224, 224]` | `[1, 5]` |
| `glaucoma_model.onnx` | `[1, 3, 640, 640]` | `[1, 2, 640, 640]` |
| `hr_efficientnet_model.onnx` | `[1, 3, 300, 300]` | `[1, 1]` |

The Retina backend was updated to preprocess DR at 224 and glaucoma at 640 so the final models are not fed with the old dimensions.
