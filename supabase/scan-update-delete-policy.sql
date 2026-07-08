drop policy if exists "authenticated update scans" on scans;
create policy "authenticated update scans"
on scans for update to authenticated
using (true)
with check (true);

drop policy if exists "authenticated delete scans" on scans;
create policy "authenticated delete scans"
on scans for delete to authenticated
using (true);

drop policy if exists "authenticated delete oct scans" on storage.objects;
create policy "authenticated delete oct scans"
on storage.objects for delete to authenticated
using (bucket_id = 'oct-scans');
