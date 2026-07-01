# Medical Eye Scan Project

This is the organized working folder for the OCT AI Report Assistant.

## Project Path

```text
C:\Users\DELL\Documents\Personal folders\My shit\Internship AI\medical eye scan file
```

## Start Backend

Easiest option for the full website:

```text
Double-click start-website.cmd
```

This starts the frontend, starts the AI backend, waits until both are ready, then opens:

```text
http://127.0.0.1:3000/login
```

To stop both later:

```text
Double-click stop-website.cmd
```

Backend-only option:

```text
Double-click start-backend.cmd
```

Manual option:

```powershell
cd "C:\Users\DELL\Documents\Personal folders\My shit\Internship AI\medical eye scan file\oct-ai-backend"
pip install -r requirements.txt
python -m uvicorn main:app --reload
```

Backend health check:

```text
http://127.0.0.1:8000/health
```

Backend API docs:

```text
http://127.0.0.1:8000/docs
```

## Start Frontend

Frontend-only option:

```text
Double-click start-frontend.cmd
```

Manual option:

Open a second terminal:

```powershell
cd "C:\Users\DELL\Documents\Personal folders\My shit\Internship AI\medical eye scan file"
& "C:\Users\DELL\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" ".\node_modules\next\dist\bin\next" dev --hostname 127.0.0.1 --port 3000
```

Frontend:

```text
http://127.0.0.1:3000/login
```

Demo login:

```text
doctor@octai.local
```

## Important Files

- `src/` - Next.js frontend
- `oct-ai-backend/` - real EfficientNet-B3 FastAPI backend
- `oct-ai-backend/best_oct_model_b3.pth` - trained OCT model
- `supabase/schema.sql` - database schema
- `supabase/finish-setup.sql` - storage/profile policies for real uploads
- `.env.local` - frontend backend URL

## Safety Rule

AI output must always be shown as:

```text
AI-assisted preliminary result. Requires doctor review.
```
