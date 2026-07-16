# AFIO Security And Delivery Checklist

Date: 2026-07-17

This checklist converts the reference screenshots into AFIO-specific work items for the website, AI services, and clinical workflows.

## Product Documents

AFIO should keep these six documents current before major feature pushes:

1. PRD: hospital/user problem, workflows, roles, module activation, success criteria.
2. TRD: frontend, Supabase, Render services, Vercel envs, model APIs, deployment/runtime limits.
3. UI/UX design: dashboard, sidebar, guided screening, report editor, patient portal, admin controls.
4. App flow: hospital provisioning, patient journey, scan upload, AI analysis, report approval, patient access.
5. Backend schema: Supabase tables, RLS, storage buckets, constraints, audit logs, model service contracts.
6. Implementation plan: phased tasks, risks, tests, deploy/rollback steps.

## AI / Model Firewall

- Browser should not call model services directly in production.
- Put inference behind an AFIO API gateway.
- Gateway checks user auth, hospital module activation, quota, file type, file size, and role.
- Gateway signs backend calls with server-only HMAC headers.
- Backends reject unsigned requests.
- Log inference request IDs, model versions, clinic IDs, timings, and failures.
- Add rate limits per clinic/user/device/module to reduce model scraping and abuse.

## File Upload Safety

- Accept only expected image MIME types: JPG, JPEG, PNG.
- Validate content bytes, not just filename extension.
- Enforce size limits before processing.
- Re-encode or normalize images before storage and inference.
- Store uploads in Supabase Storage or isolated object storage, never executable web paths.
- Never execute or import uploaded files.
- Strip suspicious filenames and generate server-side storage names.
- Keep scan replacement/delete actions audited.

## Error Handling And Information Leakage

- Users should see safe messages like “Analysis failed, try again or contact admin.”
- Do not show stack traces, local file paths, SQL errors, env names, service-role failures, or model paths in the UI.
- Log full error detail server-side for developers/admins.
- Backend health endpoints should show minimal operational state publicly.
- Production model endpoints should not reveal private download links or filesystem paths.

## Dependency Vulnerability Checks

- Run frontend dependency audit before release.
- Run Python backend dependency review before release.
- Pin model backend dependencies.
- Avoid unnecessary heavy packages on free-tier deploys.
- Replace packages with critical vulnerabilities when safe.
- Keep separate backend requirements per service to reduce attack surface.

## Secrets

- Scan repo before every push for API keys, tokens, passwords, service role keys, private URLs, and hardcoded credentials.
- Keep Supabase service-role keys server-side only.
- Do not put protected model backend secrets in `NEXT_PUBLIC_*`.
- Use Render/Vercel environment variables for secrets.
- Never paste secrets in chat, docs, commits, screenshots, or frontend code.
- Rotate any secret that was exposed.

## Input Validation

- Validate every API route body against strict allowed fields.
- Validate role changes, module IDs, report statuses, patient age, CNIC, email, and upload metadata.
- Reject unknown module IDs instead of silently defaulting to OCT in server routes.
- Validate report template classes against the module being edited.
- Validate device/machine ingest metadata before creating scans.

## Rate Limiting

Apply configurable limits by endpoint type:

- Login/signup/password reset: strict per-IP and per-account limits with exponential backoff.
- Public report check: strict per-IP and per-access-ID limits.
- Feedback/complaints: moderate per-IP limits.
- AI inference: per-clinic, per-user, per-device, per-module limits.
- Admin actions: audit heavily and rate-limit destructive actions.

Avoid hard lockouts where possible; prefer temporary cooldowns and clear recovery paths.

## Current Priority For AFIO

1. Add API gateway for AI inference.
2. Move backend URLs from public frontend envs to server-only envs.
3. Add HMAC verification to model services.
4. Add central rate-limiting helpers for Next API routes.
5. Add dependency/secret scan scripts to the release checklist.
6. Keep all new modules, including Corneal Ulcer Detection, behind Business Admin activation.

