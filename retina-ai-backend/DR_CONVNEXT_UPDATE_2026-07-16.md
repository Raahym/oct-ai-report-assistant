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

The Render DR service remains configured for the optimized ConvNeXt ONNX path:

`RETINA_DR_MODEL_KIND=convnext`

`RETINA_DR_MODEL_PATH=../models/best_convnext_model.quant.onnx`

To avoid relying on ignored local files, the DR Render build now downloads the Drive folder and runs `export_convnext_onnx.py` during build. This generates `best_convnext_model.quant.onnx` from `best_convnext_model.pth` before `node server.js` starts.
