-- create_family() is security invoker: its `insert ... returning id` on families is
-- checked against the SELECT policy, which only admitted existing members. The creator
-- is not a member yet at that moment, so every family creation failed with an RLS error.
-- Let the creator read the family they created.
drop policy if exists "family creator can read their family" on public.families;
create policy "family creator can read their family" on public.families
  for select to authenticated using (created_by = (select auth.uid()));
