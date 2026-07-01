drop policy if exists "authenticated insert own profile" on profiles;
create policy "authenticated insert own profile"
on profiles for insert to authenticated
with check (auth.uid() = id);

drop policy if exists "authenticated update own profile" on profiles;
create policy "authenticated update own profile"
on profiles for update to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "authenticated upload oct scans" on storage.objects;
create policy "authenticated upload oct scans"
on storage.objects for insert to authenticated
with check (bucket_id = 'oct-scans');

drop policy if exists "authenticated update oct scans" on storage.objects;
create policy "authenticated update oct scans"
on storage.objects for update to authenticated
using (bucket_id = 'oct-scans')
with check (bucket_id = 'oct-scans');

drop policy if exists "public read oct scans" on storage.objects;
create policy "public read oct scans"
on storage.objects for select to public
using (bucket_id = 'oct-scans');

drop policy if exists "authenticated upload reports pdf" on storage.objects;
create policy "authenticated upload reports pdf"
on storage.objects for insert to authenticated
with check (bucket_id = 'reports-pdf');

drop policy if exists "authenticated update reports pdf" on storage.objects;
create policy "authenticated update reports pdf"
on storage.objects for update to authenticated
using (bucket_id = 'reports-pdf')
with check (bucket_id = 'reports-pdf');

drop policy if exists "public read reports pdf" on storage.objects;
create policy "public read reports pdf"
on storage.objects for select to public
using (bucket_id = 'reports-pdf');
