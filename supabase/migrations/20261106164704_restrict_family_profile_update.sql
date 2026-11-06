-- A family member can rename the household, but cannot reassign its owner.
revoke update on public.families from authenticated;
grant update (name) on public.families to authenticated;
