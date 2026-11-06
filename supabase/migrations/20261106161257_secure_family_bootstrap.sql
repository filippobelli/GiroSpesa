-- Keep the public RPC invoker-rights. A private helper lets the first owner
-- membership be inserted without opening the family_members table broadly.

create or replace function private.is_family_creator(target_family_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.families f
    where f.id = target_family_id
      and f.created_by = (select auth.uid())
  );
$$;
revoke all on function private.is_family_creator(uuid) from public, anon;
grant execute on function private.is_family_creator(uuid) to authenticated;

create policy "users can create their own family" on public.families
  for insert to authenticated with check (created_by = (select auth.uid()));
create policy "family creator can add their owner membership" on public.family_members
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and role = 'owner'
    and private.is_family_creator(family_id)
  );

grant insert on public.families, public.family_members to authenticated;

drop function public.create_family(text);
create function public.create_family(family_name text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  new_family_id uuid;
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication is required to create a family';
  end if;
  if length(trim(family_name)) not between 1 and 80 then
    raise exception 'Family name must contain between 1 and 80 characters';
  end if;

  insert into public.families (name, created_by)
  values (trim(family_name), current_user_id)
  returning id into new_family_id;

  insert into public.family_members (family_id, user_id, role)
  values (new_family_id, current_user_id, 'owner');

  return new_family_id;
end;
$$;
revoke all on function public.create_family(text) from public, anon;
grant execute on function public.create_family(text) to authenticated;
