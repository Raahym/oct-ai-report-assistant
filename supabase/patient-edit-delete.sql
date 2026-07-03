-- Allows approved authenticated clinical users to edit and delete patient records.
-- Run this in Supabase SQL Editor if these policies are not already present.

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'patients'
      and policyname = 'authenticated update patients'
  ) then
    create policy "authenticated update patients"
    on patients for update to authenticated
    using (true)
    with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'patients'
      and policyname = 'authenticated delete patients'
  ) then
    create policy "authenticated delete patients"
    on patients for delete to authenticated
    using (true);
  end if;
end $$;
