-- AFIO gateway-first commercial hardening.
-- Apply in Supabase SQL Editor after deploying the gateway code.
-- This migration is additive and safe for the current clinic_modules flow.

create extension if not exists "pgcrypto";

create table if not exists clinic_module_entitlements (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  module_id text not null check (module_id in ('oct', 'vkg', 'corneal', 'corneal_ulcer', 'retina')),
  status text not null default 'active' check (status in ('active', 'disabled', 'expired', 'trial', 'suspended')),
  starts_at timestamptz default now(),
  expires_at timestamptz,
  monthly_scan_quota integer check (monthly_scan_quota is null or monthly_scan_quota >= 0),
  monthly_scan_count integer not null default 0 check (monthly_scan_count >= 0),
  quota_resets_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, module_id)
);

insert into clinic_module_entitlements (clinic_id, module_id, status, notes)
select clinic_id, module_id, case when is_enabled then 'active' else 'disabled' end, 'Backfilled from clinic_modules'
from clinic_modules
on conflict (clinic_id, module_id) do update
set status = excluded.status,
    updated_at = now();

create table if not exists model_registry (
  id uuid primary key default gen_random_uuid(),
  module_id text not null check (module_id in ('oct', 'vkg', 'corneal', 'corneal_ulcer', 'retina')),
  model_key text not null,
  model_name text not null,
  model_version text not null,
  service_name text,
  service_url_env text,
  artifact_ref text,
  artifact_sha256 text,
  is_active boolean not null default false,
  deployed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (module_id, model_key, model_version)
);

create unique index if not exists model_registry_one_active_per_key
on model_registry(module_id, model_key)
where is_active = true;

insert into model_registry (module_id, model_key, model_name, model_version, service_name, service_url_env, is_active, notes)
values
  ('oct', 'oct-primary', 'OCT screening model', 'current', 'afio-oct-gradcam-backend', 'OCT_AI_BACKEND_URL', true, 'Backfilled from current AFIO deployment'),
  ('vkg', 'vkg-ensemble', 'VKG corneal ensemble', 'current', 'afio-corneal-*', 'CORNEAL_*_BACKEND_URL', true, 'Backfilled from current AFIO deployment'),
  ('corneal', 'corneal-ensemble', 'Corneal keratoconus ensemble', 'current', 'afio-corneal-*', 'CORNEAL_*_BACKEND_URL', true, 'Backfilled from current AFIO deployment'),
  ('corneal_ulcer', 'corneal-ulcer-primary', 'Corneal ulcer slit-lamp model', 'v6', 'afio-corneal-ulcer-backend', 'CORNEAL_ULCER_BACKEND_URL', true, 'Backfilled from current AFIO deployment'),
  ('retina', 'retina-dr', 'Retina DR ConvNeXt', 'convnext-quant-onnx', 'afio-retina-dr-backend', 'RETINA_DR_BACKEND_URL', true, 'Backfilled from current AFIO deployment'),
  ('retina', 'retina-hr', 'Retina hypertensive retinopathy model', 'current', 'afio-retina-hr-backend', 'RETINA_HR_BACKEND_URL', true, 'Backfilled from current AFIO deployment'),
  ('retina', 'retina-glaucoma', 'Retina glaucoma model', 'current', 'aws-ec2-glaucoma', 'RETINA_GLAUCOMA_BACKEND_URL', false, 'AWS endpoint pending repair')
on conflict (module_id, model_key, model_version) do update
set service_name = excluded.service_name,
    service_url_env = excluded.service_url_env,
    is_active = excluded.is_active,
    updated_at = now();

create table if not exists ai_gateway_requests (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  clinic_id uuid references clinics(id) on delete set null,
  user_id uuid references profiles(id) on delete set null,
  module_id text not null check (module_id in ('oct', 'vkg', 'corneal', 'corneal_ulcer', 'retina')),
  route text not null,
  backend_path text not null,
  model_registry_id uuid references model_registry(id) on delete set null,
  status_code integer not null,
  duration_ms integer not null check (duration_ms >= 0),
  file_size_bytes integer check (file_size_bytes is null or file_size_bytes >= 0),
  content_type text,
  created_at timestamptz not null default now()
);

create index if not exists ai_gateway_requests_clinic_created_idx
on ai_gateway_requests(clinic_id, created_at desc);

create index if not exists ai_gateway_requests_user_created_idx
on ai_gateway_requests(user_id, created_at desc);

create index if not exists ai_gateway_requests_module_created_idx
on ai_gateway_requests(module_id, created_at desc);

create or replace function increment_clinic_module_scan_usage(
  target_clinic_id uuid,
  target_module_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update clinic_module_entitlements
  set monthly_scan_count = monthly_scan_count + 1,
      updated_at = now()
  where clinic_id = target_clinic_id
    and module_id = target_module_id;
end;
$$;

alter table clinic_module_entitlements enable row level security;
alter table model_registry enable row level security;
alter table ai_gateway_requests enable row level security;

drop policy if exists "business read clinic module entitlements" on clinic_module_entitlements;
create policy "business read clinic module entitlements"
on clinic_module_entitlements for select to authenticated
using (
  exists (
    select 1
    from profiles
    where profiles.id = auth.uid()
      and profiles.role = 'afio_admin'
      and profiles.is_active is distinct from false
  )
);

drop policy if exists "clinic read own module entitlements" on clinic_module_entitlements;
create policy "clinic read own module entitlements"
on clinic_module_entitlements for select to authenticated
using (
  clinic_id = (
    select profiles.clinic_id
    from profiles
    where profiles.id = auth.uid()
      and profiles.is_active is distinct from false
  )
);

drop policy if exists "authenticated read active model registry" on model_registry;
create policy "authenticated read active model registry"
on model_registry for select to authenticated
using (is_active = true);

drop policy if exists "business read all model registry" on model_registry;
create policy "business read all model registry"
on model_registry for select to authenticated
using (
  exists (
    select 1
    from profiles
    where profiles.id = auth.uid()
      and profiles.role = 'afio_admin'
      and profiles.is_active is distinct from false
  )
);

drop policy if exists "business read ai gateway requests" on ai_gateway_requests;
create policy "business read ai gateway requests"
on ai_gateway_requests for select to authenticated
using (
  exists (
    select 1
    from profiles
    where profiles.id = auth.uid()
      and profiles.role = 'afio_admin'
      and profiles.is_active is distinct from false
  )
);

drop policy if exists "clinic admins read own ai gateway requests" on ai_gateway_requests;
create policy "clinic admins read own ai gateway requests"
on ai_gateway_requests for select to authenticated
using (
  clinic_id = (
    select profiles.clinic_id
    from profiles
    where profiles.id = auth.uid()
      and profiles.role in ('hospital_admin', 'admin')
      and profiles.is_active is distinct from false
  )
);
