-- Approval flow for OCT AI Report Assistant.
-- Run this in Supabase SQL Editor after the main schema and finish setup.

update profiles
set role = 'admin',
    is_active = true
where lower(email) = 'raahymm@gmail.com';

drop policy if exists "authenticated update own profile" on profiles;
drop policy if exists "super admin update profiles" on profiles;

create policy "super admin update profiles"
on profiles for update to authenticated
using (lower(auth.jwt() ->> 'email') = 'raahymm@gmail.com')
with check (lower(auth.jwt() ->> 'email') = 'raahymm@gmail.com');

drop policy if exists "authenticated insert own profile" on profiles;
create policy "authenticated insert own profile"
on profiles for insert to authenticated
with check (id = auth.uid());
