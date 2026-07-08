drop policy if exists "authenticated delete ai results" on ai_results;

create policy "authenticated delete ai results"
on ai_results for delete to authenticated
using (true);
