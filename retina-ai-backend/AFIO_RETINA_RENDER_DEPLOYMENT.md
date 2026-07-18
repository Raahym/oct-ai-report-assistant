# AFIO Retina Backend Render Deployment

Date: 2026-07-18

## Render Services

```text
afio-retina-dr-backend
afio-retina-glaucoma-backend
afio-retina-hr-backend
```

`afio-retina-ai-backend` may remain as a legacy combined fallback, but the approval/demo architecture should use the split services above so each process loads only one non-Grad-CAM model.

Grad-CAM and other heavier PyTorch workers should run on AWS when Render cannot handle them reliably.

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
best_convnext_model.pth
glaucoma_model.onnx
glaucoma_model.onnx.data
hr_efficientnet_model.onnx
smoke_test.onnx
smoke_test.onnx.data
```

Current final Retina mapping from Arsal:

```text
smoke_test.onnx             -> DR screening ONNX, Render, 224x224 input
glaucoma_model.onnx         -> Glaucoma ONNX, AWS target for current setup, 640x640 input
hr_efficientnet_model.onnx  -> Hypertensive retinopathy ONNX, Render, 300x300 input
best_convnext_model.pth     -> DR Grad-CAM PyTorch checkpoint, AWS
best_efficientnet_model.pth -> HR source/checkpoint artifact, not used by Render runtime
```

## Deployment Mode

Each split service uses:

```text
SKIP_GRADCAM=true
ORT_NUM_THREADS=1
RETINA_SERVICE=dr | glaucoma | hr
```

This keeps the core screening APIs deployable without installing the heavier Python/Torch Grad-CAM service. Do not deploy `best_convnext_model.pth` as the normal DR Render model; it is the DR Grad-CAM/AWS artifact.

## Frontend Hook

After Render creates the services, set these Vercel environment variables as server-only values:

```text
RETINA_DR_BACKEND_URL=<private/server-only DR backend URL>
RETINA_DR_GRADCAM_BACKEND_URL=<private/server-only DR Grad-CAM backend URL>
RETINA_GLAUCOMA_BACKEND_URL=<private/server-only glaucoma backend URL>
RETINA_HR_BACKEND_URL=<private/server-only HR backend URL>
AI_GATEWAY_SHARED_SECRET=<same strong secret configured on Render Retina services>
```

Do not expose Retina service URLs as `NEXT_PUBLIC_*`. The browser calls AFIO `/api/ai/retina/*` gateway routes, and the gateway signs backend requests with HMAC.
