alter table profiles add column if not exists business_permissions jsonb default '{}'::jsonb;

create table if not exists platform_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references profiles(id) on delete cascade,
  role text not null check (role in ('owner', 'business_admin', 'support', 'security_auditor')),
  permissions jsonb not null default '{}'::jsonb,
  mfa_required boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

update profiles
set business_permissions = '{
  "manage_members": true,
  "add_hospitals": true,
  "edit_hospitals": true,
  "suspend_hospitals": true,
  "manage_modules": true,
  "delete_hospitals": true
}'::jsonb
where role = 'afio_admin'
  and lower(email) = 'raahymm@gmail.com';

insert into platform_members (user_id, role, permissions, is_active)
select id, 'owner', '{
  "manage_members": true,
  "add_hospitals": true,
  "edit_hospitals": true,
  "suspend_hospitals": true,
  "manage_modules": true,
  "delete_hospitals": true
}'::jsonb, true
from profiles
where role = 'afio_admin'
  and lower(email) = 'raahymm@gmail.com'
on conflict (user_id) do update
set role = 'owner',
    permissions = excluded.permissions,
    is_active = true,
    updated_at = now();

alter table platform_members enable row level security;

drop policy if exists "platform members can read active platform members" on platform_members;
create policy "platform members can read active platform members"
on platform_members for select to authenticated
using (
  exists (
    select 1
    from platform_members requester
    where requester.user_id = auth.uid()
      and requester.is_active = true
  )
);
