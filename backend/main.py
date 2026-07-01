from io import BytesIO

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image

from model import OCTModelService
from preprocessing import preprocess_image


DISCLAIMER = "AI-assisted preliminary result. Requires doctor review."

app = FastAPI(title="OCT AI Report Assistant Backend")
model_service = OCTModelService()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:3000", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {"status": "ok", "service": "OCT AI Report Assistant Backend"}


@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": model_service.model_loaded}


@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    if file.content_type not in {"image/jpeg", "image/png"}:
        raise HTTPException(status_code=400, detail="Only JPG, JPEG, and PNG OCT images are supported.")

    try:
        image_bytes = await file.read()
        image = Image.open(BytesIO(image_bytes))
        tensor = preprocess_image(image)
        result = model_service.predict(tensor)
        return {
            "prediction": result.prediction,
            "confidence": result.confidence,
            "probabilities": result.probabilities,
            "model_name": result.model_name,
            "model_version": result.model_version,
            "is_dummy_result": result.is_dummy_result,
            "disclaimer": DISCLAIMER,
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
