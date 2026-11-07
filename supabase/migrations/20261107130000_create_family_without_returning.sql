-- Family creation kept failing with "new row violates row-level security policy for
-- table families". Make it independent of the SELECT policy: generate the id up front
-- and insert without RETURNING, so only the INSERT check (created_by = auth.uid()) applies.
-- Idempotent: safe to run whether or not the previous fixes were applied by hand.

drop policy if exists "users can create their own family" on public.families;
create policy "users can create their own family" on public.families
  for insert to authenticated with check (created_by = (select auth.uid()));

drop policy if exists "family creator can read their family" on public.families;
create policy "family creator can read their family" on public.families
  for select to authenticated using (created_by = (select auth.uid()));

grant insert on public.families, public.family_members to authenticated;

create or replace function public.create_family(family_name text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  new_family_id uuid := gen_random_uuid();
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication is required to create a family';
  end if;
  if length(trim(family_name)) not between 1 and 80 then
    raise exception 'Family name must contain between 1 and 80 characters';
  end if;

  insert into public.families (id, name, created_by)
  values (new_family_id, trim(family_name), current_user_id);

  insert into public.family_members (family_id, user_id, role)
  values (new_family_id, current_user_id, 'owner');

  return new_family_id;
end;
$$;
revoke all on function public.create_family(text) from public, anon;
grant execute on function public.create_family(text) to authenticated;
