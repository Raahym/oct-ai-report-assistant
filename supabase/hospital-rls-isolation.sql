create or replace function public.current_profile_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.current_profile_clinic_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select clinic_id from public.profiles where id = auth.uid();
$$;

create or replace function public.current_profile_is_afio_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_profile_role() = 'afio_admin', false);
$$;

alter table profiles enable row level security;
alter table clinics enable row level security;
alter table departments enable row level security;
alter table clinic_modules enable row level security;
alter table department_users enable row level security;
alter table patients enable row level security;
alter table scans enable row level security;
alter table ai_results enable row level security;
alter table reports enable row level security;
alter table report_versions enable row level security;
alter table audit_logs enable row level security;

drop policy if exists "authenticated read profiles" on profiles;
drop policy if exists "super admin update profiles" on profiles;
drop policy if exists "authenticated insert own profile" on profiles;
drop policy if exists "authenticated update own profile" on profiles;
drop policy if exists "authenticated read clinics" on clinics;
drop policy if exists "authenticated read departments" on departments;
drop policy if exists "authenticated read clinic modules" on clinic_modules;
drop policy if exists "authenticated read department users" on department_users;
drop policy if exists "authenticated read patients" on patients;
drop policy if exists "authenticated insert patients" on patients;
drop policy if exists "authenticated update patients" on patients;
drop policy if exists "authenticated delete patients" on patients;
drop policy if exists "authenticated read scans" on scans;
drop policy if exists "authenticated insert scans" on scans;
drop policy if exists "authenticated update scans" on scans;
drop policy if exists "authenticated delete scans" on scans;
drop policy if exists "authenticated read ai results" on ai_results;
drop policy if exists "authenticated insert ai results" on ai_results;
drop policy if exists "authenticated delete ai results" on ai_results;
drop policy if exists "authenticated read reports" on reports;
drop policy if exists "authenticated write reports" on reports;
drop policy if exists "authenticated read report versions" on report_versions;
drop policy if exists "authenticated insert report versions" on report_versions;
drop policy if exists "authenticated read audit logs" on audit_logs;
drop policy if exists "authenticated insert audit logs" on audit_logs;

drop policy if exists "scoped read profiles" on profiles;
drop policy if exists "scoped update profiles" on profiles;
drop policy if exists "scoped read clinics" on clinics;
drop policy if exists "scoped read departments" on departments;
drop policy if exists "scoped read clinic modules" on clinic_modules;
drop policy if exists "scoped read department users" on department_users;
drop policy if exists "scoped read patients" on patients;
drop policy if exists "scoped insert patients" on patients;
drop policy if exists "scoped update patients" on patients;
drop policy if exists "scoped delete patients" on patients;
drop policy if exists "scoped read scans" on scans;
drop policy if exists "scoped insert scans" on scans;
drop policy if exists "scoped update scans" on scans;
drop policy if exists "scoped delete scans" on scans;
drop policy if exists "scoped read ai results" on ai_results;
drop policy if exists "scoped insert ai results" on ai_results;
drop policy if exists "scoped delete ai results" on ai_results;
drop policy if exists "scoped read reports" on reports;
drop policy if exists "scoped write reports" on reports;
drop policy if exists "scoped read report versions" on report_versions;
drop policy if exists "scoped insert report versions" on report_versions;
drop policy if exists "scoped read audit logs" on audit_logs;
drop policy if exists "scoped insert audit logs" on audit_logs;

create policy "scoped read profiles"
on profiles for select to authenticated
using (
  public.current_profile_is_afio_admin()
  or id = auth.uid()
  or clinic_id = public.current_profile_clinic_id()
);

create policy "authenticated insert own profile"
on profiles for insert to authenticated
with check (id = auth.uid() or public.current_profile_is_afio_admin());

create policy "scoped update profiles"
on profiles for update to authenticated
using (id = auth.uid() or public.current_profile_is_afio_admin())
with check (id = auth.uid() or public.current_profile_is_afio_admin());

create policy "scoped read clinics"
on clinics for select to authenticated
using (public.current_profile_is_afio_admin() or id = public.current_profile_clinic_id());

create policy "scoped read departments"
on departments for select to authenticated
using (public.current_profile_is_afio_admin() or clinic_id = public.current_profile_clinic_id());

create policy "scoped read clinic modules"
on clinic_modules for select to authenticated
using (public.current_profile_is_afio_admin() or clinic_id = public.current_profile_clinic_id());

create policy "scoped read department users"
on department_users for select to authenticated
using (
  public.current_profile_is_afio_admin()
  or exists (
    select 1 from departments
    where departments.id = department_users.department_id
      and departments.clinic_id = public.current_profile_clinic_id()
  )
);

create policy "scoped read patients"
on patients for select to authenticated
using (public.current_profile_is_afio_admin() or clinic_id = public.current_profile_clinic_id());

create policy "scoped insert patients"
on patients for insert to authenticated
with check (public.current_profile_is_afio_admin() or clinic_id = public.current_profile_clinic_id());

create policy "scoped update patients"
on patients for update to authenticated
using (public.current_profile_is_afio_admin() or clinic_id = public.current_profile_clinic_id())
with check (public.current_profile_is_afio_admin() or clinic_id = public.current_profile_clinic_id());

create policy "scoped delete patients"
on patients for delete to authenticated
using (public.current_profile_is_afio_admin() or clinic_id = public.current_profile_clinic_id());

create policy "scoped read scans"
on scans for select to authenticated
using (public.current_profile_is_afio_admin() or clinic_id = public.current_profile_clinic_id());

create policy "scoped insert scans"
on scans for insert to authenticated
with check (public.current_profile_is_afio_admin() or clinic_id = public.current_profile_clinic_id());

create policy "scoped update scans"
on scans for update to authenticated
using (public.current_profile_is_afio_admin() or clinic_id = public.current_profile_clinic_id())
with check (public.current_profile_is_afio_admin() or clinic_id = public.current_profile_clinic_id());

create policy "scoped delete scans"
on scans for delete to authenticated
using (public.current_profile_is_afio_admin() or clinic_id = public.current_profile_clinic_id());

create policy "scoped read ai results"
on ai_results for select to authenticated
using (
  public.current_profile_is_afio_admin()
  or exists (
    select 1 from scans
    where scans.id = ai_results.scan_id
      and scans.clinic_id = public.current_profile_clinic_id()
  )
);

create policy "scoped insert ai results"
on ai_results for insert to authenticated
with check (
  public.current_profile_is_afio_admin()
  or exists (
    select 1 from scans
    where scans.id = ai_results.scan_id
      and scans.clinic_id = public.current_profile_clinic_id()
  )
);

create policy "scoped delete ai results"
on ai_results for delete to authenticated
using (
  public.current_profile_is_afio_admin()
  or exists (
    select 1 from scans
    where scans.id = ai_results.scan_id
      and scans.clinic_id = public.current_profile_clinic_id()
  )
);

create policy "scoped read reports"
on reports for select to authenticated
using (
  public.current_profile_is_afio_admin()
  or clinic_id = public.current_profile_clinic_id()
  or exists (
    select 1 from patients
    where patients.id = reports.patient_id
      and patients.clinic_id = public.current_profile_clinic_id()
  )
);

create policy "scoped write reports"
on reports for all to authenticated
using (
  public.current_profile_is_afio_admin()
  or clinic_id = public.current_profile_clinic_id()
)
with check (
  public.current_profile_is_afio_admin()
  or clinic_id = public.current_profile_clinic_id()
);

create policy "scoped read report versions"
on report_versions for select to authenticated
using (
  public.current_profile_is_afio_admin()
  or exists (
    select 1 from reports
    where reports.id = report_versions.report_id
      and reports.clinic_id = public.current_profile_clinic_id()
  )
);

create policy "scoped insert report versions"
on report_versions for insert to authenticated
with check (
  public.current_profile_is_afio_admin()
  or exists (
    select 1 from reports
    where reports.id = report_versions.report_id
      and reports.clinic_id = public.current_profile_clinic_id()
  )
);

create policy "scoped read audit logs"
on audit_logs for select to authenticated
using (
  public.current_profile_is_afio_admin()
  or user_id = auth.uid()
);

create policy "scoped insert audit logs"
on audit_logs for insert to authenticated
with check (public.current_profile_is_afio_admin() or user_id = auth.uid());
