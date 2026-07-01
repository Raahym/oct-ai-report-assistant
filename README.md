# OCT AI Report Assistant

Production-style MVP frontend for an AI-assisted ophthalmology OCT report workflow.

The current build is a working demo-mode app. It uses Next.js, React, TypeScript, Tailwind CSS, local browser storage, demo AI results, editable report templates, role-aware approval behavior, and PDF export.

## What Works Now

- Login screens for doctor, admin, and assistant demo users
- Dashboard with patient, scan, and report stats
- Patient creation and search
- Patient profile with scan/report history
- OCT upload with image preview and file validation
- Demo AI analysis for CNV, DME, DRUSEN, NORMAL
- Required safety label: `AI-assisted preliminary result. Requires doctor review.`
- Template-based report generation
- Editable report sections
- Doctor/admin approval only
- Final report view with PDF download
- Report history search
- Admin users, templates, and audit log screens

## Demo Login

Use any of these emails. The password field is present for UI realism but not verified until Supabase Auth is connected.

- `doctor@octai.local`
- `admin@octai.local`
- `assistant@octai.local`

## Run Frontend

```bash
pnpm install
pnpm exec next dev --hostname 127.0.0.1 --port 3000
```

Open `http://127.0.0.1:3000/login`.

## Folder Structure

```text
src/app/                 Next.js App Router pages
src/components/          App shell and screen views
src/lib/                 Demo store, types, templates, PDF generator, Supabase client
supabase/schema.sql      PostgreSQL tables and MVP RLS policies
backend/                 FastAPI prediction service scaffold
```

## Connect Supabase Next

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the SQL editor.
3. Create storage buckets:
   - `oct-scans`
   - `reports-pdf`
4. Copy `.env.example` to `.env.local`.
5. Add:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_AI_BACKEND_URL`
6. Replace the local functions in `src/lib/demo-store.ts` with Supabase calls while keeping the same UI-facing function names.

## Deployment

See `DEPLOYMENT.md`.

## Connect AI Backend

Run the backend from `backend/`, then update `NEXT_PUBLIC_AI_BACKEND_URL`.

The frontend currently uses demo AI mode. When connecting the backend, call:

```ts
const formData = new FormData();
formData.append("file", file);

await fetch(`${process.env.NEXT_PUBLIC_AI_BACKEND_URL}/predict`, {
  method: "POST",
  body: formData
});
```

Save the returned prediction, confidence, probabilities, model name/version, and `is_dummy_result` into `ai_results`.

## Medical Safety

This MVP must not present AI output as a final diagnosis. AI output is always preliminary and requires qualified doctor review before a report becomes final.
