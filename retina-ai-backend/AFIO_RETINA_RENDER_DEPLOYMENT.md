# AFIO Retina Backend Render Deployment

Date: 2026-07-12

## Render Services

```text
afio-retina-dr-backend
afio-retina-glaucoma-backend
afio-retina-hr-backend
```

`afio-retina-ai-backend` may remain as a legacy combined fallback, but the approval/demo architecture should use the split services above so each process loads only one model.

## Endpoints

```text
GET  /health
POST /predict
POST /predict-glaucoma
POST /predict-hr
```

Split service routing:

```text
afio-retina-dr-backend        POST /predict
afio-retina-glaucoma-backend  POST /predict-glaucoma
afio-retina-hr-backend        POST /predict-hr
```

All prediction endpoints expect multipart form-data field:

```text
image
```

## Model Handling

The model files are not committed to GitHub. They are downloaded during the Render build from:

```text
https://drive.google.com/drive/folders/1VBxwdx-CoSBP906N3Zx_gEjRGfeQtglo
```

Required files:

```text
best_efficientnet_model.pth
glaucoma_model.onnx
glaucoma_model.onnx.data
hr_efficientnet_model.onnx
smoke_test.onnx
smoke_test.onnx.data
```

## Deployment Mode

Each split service uses:

```text
SKIP_GRADCAM=true
ORT_NUM_THREADS=1
RETINA_SERVICE=dr | glaucoma | hr
```

This keeps the core screening APIs deployable without installing the heavier Python/Torch Grad-CAM service. Grad-CAM can be enabled later after adding the Python runtime/dependencies strategy.

## Frontend Hook

After Render creates the services, set these Vercel environment variables:

```text
NEXT_PUBLIC_RETINA_DR_BACKEND_URL=https://afio-retina-dr-backend.onrender.com
NEXT_PUBLIC_RETINA_GLAUCOMA_BACKEND_URL=https://afio-retina-glaucoma-backend.onrender.com
NEXT_PUBLIC_RETINA_HR_BACKEND_URL=https://afio-retina-hr-backend.onrender.com
```

`NEXT_PUBLIC_RETINA_BACKEND_URL` can remain set to the old combined service as a fallback during migration. The frontend prefers the split URLs when present, runs all enabled Retina tests from one upload, and stores one combined Retina report draft.
