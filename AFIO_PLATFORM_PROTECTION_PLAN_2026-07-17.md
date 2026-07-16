# AFIO Platform Protection And Integration Plan

Date: 2026-07-17

This note turns the open architecture questions into an implementation path for AFIO. The core idea is simple: keep patients and hospitals in one AFIO clinical platform, keep AI models hidden behind protected services, and route every scan through a gateway that can enable, disable, audit, and bill modules without exposing model endpoints or model files.

## 1. License And IP Protection

### Problem

AFIO currently has a frontend that can call model backends directly through `NEXT_PUBLIC_*` URLs. That is okay for a demo, but not good for protecting intellectual property because:

- Public browser variables reveal backend service URLs.
- Anyone with a visible endpoint can attempt direct calls.
- Model behavior can be scraped by repeated requests.
- Model files are safer than before because they run server-side, but the service boundary still needs stronger controls.

### Recommended Protection Model

Use a layered SaaS license instead of relying on one license key.

1. Keep model files server-side only.
2. Remove public browser access to AI backend URLs.
3. Add one AFIO API gateway route inside the Next.js app.
4. Gateway signs every internal model request with an HMAC service token.
5. Backends reject every request without a valid AFIO signature.
6. Every hospital/module/device gets an entitlement row.
7. Gateway checks entitlements before forwarding scans.
8. Gateway logs every inference request for audit, usage limits, and abuse detection.

### Clever IP Protection Tactics

- **Signed internal inference requests:** Gateway sends `X-AFIO-Timestamp`, `X-AFIO-Clinic-ID`, `X-AFIO-Module`, `X-AFIO-Nonce`, and `X-AFIO-Signature`. Backends recompute HMAC with a backend-only secret and reject stale or unsigned calls.
- **Short replay window:** Reject signatures older than 60 seconds. Store nonce hashes briefly to block replay.
- **Backend allowlist:** Backends should allow only the AFIO frontend/gateway origin, but signature validation is the real protection.
- **Model custody:** Do not ship `.pth`, `.onnx`, preprocessing constants, or model download links to the browser. Keep them in private object storage or private deployment artifacts.
- **Watermarked inference metadata:** Every result stores `model_name`, `model_version`, `clinic_id`, `request_id`, and optional hidden version hash. If a report leaks, AFIO knows which deployment generated it.
- **Quota and anomaly throttles:** Rate-limit by clinic, module, user, and device. Stop model-scraping style traffic automatically.
- **Separate demo from production:** Demo can stay loose. Production should require gateway signatures and no public model-service URLs.
- **Legal wrapper:** Use a proprietary EULA plus hospital subscription agreement. Code security protects the model; legal terms protect commercialization.

### License States

Use these states at hospital + module level:

- `trial`: enabled with low quota and expiry date.
- `active`: enabled with production quota.
- `past_due`: grace period, warn admins, keep clinical access temporarily.
- `suspended`: block new inference, keep historical records readable.
- `disabled`: module hidden or read-only.

## 2. Three Backend Applications With Protected APIs

AFIO should treat OCT, VKG/corneal, and retina as three protected AI applications behind one gateway.

### Logical Backends

1. **OCT backend**
   - OCT classification.
   - Grad-CAM support.
   - Endpoint behind gateway: `POST /api/ai/oct/analyze`.

2. **VKG/corneal backend**
   - Corneal/VKG model or ensemble.
   - Endpoint behind gateway: `POST /api/ai/vkg/analyze`.

3. **Retina/fundus backend**
   - DR ConvNeXt.
   - Glaucoma.
   - Hypertensive retinopathy.
   - Endpoint behind gateway: `POST /api/ai/retina/analyze`.

### Gateway Contract

Browser sends only to AFIO:

```http
POST /api/ai/analyze
Content-Type: multipart/form-data

moduleId=retina
patientId=...
eyeSide=Right
services={"dr":true,"glaucoma":true,"hr":true}
image=<file>
```

Gateway performs:

1. Auth check.
2. Clinic lookup.
3. Module entitlement check.
4. Device entitlement check if request came from a machine/device.
5. File validation.
6. Request audit log creation.
7. Signed internal call to the correct backend.
8. Response normalization.
9. Result storage.
10. Usage counter update.

Backends receive only trusted internal calls:

```http
POST /predict
X-AFIO-Clinic-ID: <clinic uuid>
X-AFIO-Module: retina
X-AFIO-Request-ID: <uuid>
X-AFIO-Timestamp: <unix seconds>
X-AFIO-Nonce: <random>
X-AFIO-Signature: <hmac>
```

## 3. API Gateway Enable / Disable

The gateway should be the enforcement point. The frontend should not decide whether a hospital can use a model. It can hide UI for convenience, but the gateway must enforce.

### Required Tables

Recommended Supabase additions:

```sql
create table clinic_module_entitlements (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  module_id text not null check (module_id in ('oct', 'vkg', 'corneal', 'retina')),
  status text not null check (status in ('trial', 'active', 'past_due', 'suspended', 'disabled')),
  starts_at timestamptz default now(),
  expires_at timestamptz,
  monthly_quota int,
  used_this_month int not null default 0,
  allow_machine_ingest boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (clinic_id, module_id)
);

create table ai_gateway_requests (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  user_id uuid,
  patient_id uuid,
  scan_id uuid,
  module_id text not null,
  device_id uuid,
  backend_service text not null,
  status text not null,
  request_ms int,
  error_message text,
  created_at timestamptz default now()
);
```

### Gateway Decision Rules

- If clinic inactive: block new inference.
- If module disabled/suspended: block new inference.
- If trial expired: block or degrade to read-only.
- If quota exceeded: block or require admin override.
- If backend unhealthy: show a clear clinical-safe error.
- If user lacks role: block.
- If device token not allowed: block machine-originated request.

## 4. Connecting Machines Directly To Applications

There are two realistic modes.

### Mode A: Browser Upload From Machine Export

This is safest and easiest. The OCT/VKG/fundus machine exports a JPG/PNG/DICOM-like image to a local workstation. Staff upload in AFIO. This already works.

Pros:

- No hospital networking complexity.
- No device credential risk.
- Works everywhere.

Cons:

- Manual upload step remains.

### Mode B: AFIO Device Connector

Install a small local connector app near the machine. It watches a folder or receives DICOM/HTTP pushes, then uploads to AFIO gateway.

Connector responsibilities:

- Pair with clinic using one-time code from AFIO admin.
- Store a device token locally.
- Watch folders like `C:\AFIO\Incoming\OCT`.
- Detect patient metadata from filename, sidecar JSON, DICOM tags, or manual queue.
- Upload image + metadata to `POST /api/devices/ingest`.
- Retry safely if internet drops.
- Never contain AI model files.

### Device Tables

```sql
create table clinic_devices (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  name text not null,
  device_type text not null check (device_type in ('oct', 'vkg', 'fundus', 'mixed')),
  vendor text,
  serial_number text,
  token_hash text not null,
  status text not null default 'active' check (status in ('pending', 'active', 'revoked')),
  last_seen_at timestamptz,
  created_at timestamptz default now()
);

create table device_ingest_events (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  device_id uuid not null references clinic_devices(id),
  patient_id uuid,
  module_id text not null,
  eye_side text,
  source_filename text,
  status text not null,
  error_message text,
  created_at timestamptz default now()
);
```

### Device API

```http
POST /api/devices/ingest
Authorization: Bearer <device token>
Content-Type: multipart/form-data

moduleId=oct
patientLookup=CNIC or MR number
eyeSide=Right
capturedAt=...
image=<file>
```

Gateway action:

1. Hash token and find active device.
2. Confirm module entitlement and `allow_machine_ingest`.
3. Match patient by clinic + CNIC/MR/global key.
4. If no patient match, create an “unmatched device queue” item instead of losing the scan.
5. Save scan.
6. Optionally auto-analyze if clinic setting allows it.

## 5. Patient Journey And Database Continuity

### Patient Switching Systems

If a hospital switches from old paper/software to AFIO, do not force a perfect migration before go-live. Use a staged model:

1. **Minimum import:** CNIC/MR number, name, age/date of birth, gender, phone.
2. **Historical attachment import:** old reports/images as files if available.
3. **Progressive enrichment:** fill diabetes history, disease history, and prior visits when patient returns.
4. **Deduplication:** detect same CNIC/phone/name/date of birth combinations.

### Patient Identity Strategy

Use three identifiers:

- `patient.id`: internal UUID, never shown as clinical MR.
- `patient_code`: clinic-facing AFIO MR number.
- `global_patient_key`: stable hash for dedupe and future cross-hospital matching.

Recommended `global_patient_key`:

```text
sha256(normalized_cnic || normalized_phone || date_of_birth_or_age_bucket)
```

Do not expose the raw hash publicly. Use it only for internal duplicate detection.

### Returning Patient Flow

When a patient returns:

1. Search by CNIC, MR number, phone, or name.
2. Show previous visits grouped by date and module.
3. Select `New Visit`.
4. Upload OD/OS scans under the same patient.
5. Compare latest result to prior result.
6. Generate updated report.

### Visit-Centered Data Model

AFIO should add a visit layer between patient and scans:

```sql
create table visits (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  patient_id uuid not null references patients(id) on delete cascade,
  visit_code text not null,
  reason text,
  clinician_id uuid references profiles(id),
  started_at timestamptz default now(),
  closed_at timestamptz,
  created_at timestamptz default now()
);

alter table scans add column if not exists visit_id uuid references visits(id);
alter table reports add column if not exists visit_id uuid references visits(id);
```

This makes repeat visits clean. A patient can have many visits, each visit can contain OCT/VKG/retina scans, and reports belong to that visit.

### Cross-Module Patient Journey

One patient record should support multiple clinical workflows:

- OCT visit today.
- Retina screening next month.
- VKG/corneal test later.

Do not duplicate patients per module unless a hospital specifically wants isolated departments. Instead:

- Keep one patient profile.
- Keep module-specific scans and reports.
- Use `module_id` on scans/reports.
- Add `visits` to group encounters.

## Recommended Implementation Order

### Phase 1: Gateway Hardening

1. Add `POST /api/ai/analyze`.
2. Move `NEXT_PUBLIC_*_BACKEND_URL` usage out of browser code.
3. Store backend URLs as server-only env vars.
4. Add module entitlement checks.
5. Add gateway audit logs.

### Phase 2: Protected Backend APIs

1. Add HMAC signature validation to OCT backend.
2. Add HMAC signature validation to VKG/corneal backend.
3. Add HMAC signature validation to retina backend.
4. Reject unsigned direct calls in production.

### Phase 3: License Controls

1. Add `clinic_module_entitlements`.
2. Map existing `clinic_modules` into entitlement records.
3. Add quota counters and expiry dates.
4. Add Business Admin controls for enable/disable/quota.

### Phase 4: Patient Journey

1. Add `visits`.
2. Add “New Visit” flow on patient profile.
3. Attach scans/reports to visits.
4. Add duplicate patient detection.

### Phase 5: Device Connector

1. Add `clinic_devices`.
2. Add pairing code flow.
3. Add `POST /api/devices/ingest`.
4. Build lightweight Windows connector later.

## Current AFIO Repo Impact

The current repo already has useful foundations:

- Hospital/module access exists through `clinics` and `clinic_modules`.
- RLS and clinic isolation migrations exist.
- Separate backends already exist for OCT, corneal/VKG, and retina.
- Reports, scans, AI results, patient access, and audit logs already exist.

The main gap is that inference routing is still frontend-visible. Gateway-first routing fixes that and becomes the backbone for license protection, backend protection, machine ingestion, and clean patient journeys.

