# FastAPI Backend

Run locally:

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
set ALLOW_DUMMY_AI=true
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Endpoints:

- `GET /health`
- `POST /predict` with form field `file`

Place the trained PyTorch model at `backend/saved_model/oct_model.pth` or set `MODEL_PATH`.
