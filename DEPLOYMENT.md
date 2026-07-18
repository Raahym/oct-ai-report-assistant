# Deployment

## What Goes Where

Deploy the Next.js frontend to Vercel.

Deploy the FastAPI PyTorch backend somewhere that supports long-running Python servers and model files, such as Render or Railway. Vercel is not the right place for the `.pth` model backend.

## Vercel Frontend

1. Push this project folder to GitHub.
2. Create a new Vercel project from that GitHub repo.
3. Add these Vercel environment variables:

```text
NEXT_PUBLIC_SUPABASE_URL=https://vxivcawwlxcrnkofbywg.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your Supabase anon public key
NEXT_PUBLIC_APP_URL=https://cvclinics.online
SUPABASE_SERVICE_ROLE_KEY=your Supabase service role key
AI_GATEWAY_SHARED_SECRET=one strong shared secret also configured on Render AI services
OCT_AI_BACKEND_URL=server-only OCT backend URL
VKG_BACKEND_URL=server-only corneal/VKG backend URL
CORNEAL_BACKEND_URL=server-only corneal/VKG backend URL
CORNEAL_ULCER_BACKEND_URL=server-only corneal ulcer backend URL
RETINA_DR_BACKEND_URL=server-only Retina DR backend URL
RETINA_DR_GRADCAM_BACKEND_URL=server-only Retina Grad-CAM backend URL
RETINA_GLAUCOMA_BACKEND_URL=server-only Retina glaucoma backend URL
RETINA_HR_BACKEND_URL=server-only Retina HR backend URL
RESEND_API_KEY=your Resend API key
EMAIL_FROM=AFIO Platform <reports@cvclinics.online>
```

4. Deploy.

`RESEND_API_KEY` is optional for the hospital onboarding flow. If it is missing, AFIO still shows the activation link and temporary password in the success panel so onboarding can continue manually.

## Supabase Auth URLs

In Supabase, open:

```text
Authentication > URL Configuration
```

Set:

```text
Site URL = https://your-vercel-app.vercel.app
```

Add redirect URLs:

```text
http://127.0.0.1:3000/**
https://your-vercel-app.vercel.app/**
```

## Supabase SQL

Run both files in Supabase SQL Editor:

```text
supabase/schema.sql
supabase/finish-setup.sql
```

## Backend Environment

For the backend host, upload/copy:

```text
oct-ai-backend/main.py
oct-ai-backend/requirements.txt
oct-ai-backend/best_oct_model_b3.pth
```

Start command:

```text
uvicorn main:app --host 0.0.0.0 --port $PORT
```

Environment variable:

```text
ALLOWED_ORIGINS=https://your-vercel-app.vercel.app
```

For public patient report lookup and automatic access emails, also add:

```text
SUPABASE_URL=https://vxivcawwlxcrnkofbywg.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your Supabase service role key
RESEND_API_KEY=your Resend API key
EMAIL_FROM=AFIO Platform <reports@cvclinics.online>
FRONTEND_URL=https://oct-ai-report-assistant.vercel.app
SMTP_HOST=your SMTP host
SMTP_PORT=587
SMTP_USERNAME=your SMTP username
SMTP_PASSWORD=your SMTP password
SMTP_FROM_EMAIL=reports@your-clinic-domain.com
SMTP_FROM_NAME=OCT AI Report Assistant
```

The service role key must stay on the backend only. Do not add it to Vercel `NEXT_PUBLIC_*` variables.

After backend deployment, set AI backend URLs only as server-side Vercel env vars. Do not use `NEXT_PUBLIC_*_BACKEND_URL`; browser traffic must go through `/api/ai/*` gateway routes.
