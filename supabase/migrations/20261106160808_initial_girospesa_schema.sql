-- GiroSpesa initial shared-family shopping schema.
-- All user data is isolated by family and protected by RLS.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.family_members (
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (family_id, user_id)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  category text not null default 'Altro',
  emoji text not null default '🛒',
  usual_quantity integer not null default 1 check (usual_quantity >= 1),
  note text not null default '',
  barcode text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, family_id)
);
create unique index products_family_barcode_unique
  on public.products (family_id, barcode) where barcode is not null and barcode <> '';
create index products_family_name_idx on public.products (family_id, lower(name));

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 100),
  color text not null default '#527e65',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, family_id)
);
create unique index stores_family_name_unique on public.stores (family_id, lower(name));

create table public.store_departments (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  store_id uuid not null,
  name text not null check (length(trim(name)) between 1 and 80),
  position integer not null check (position >= 0),
  created_at timestamptz not null default now(),
  foreign key (store_id, family_id) references public.stores(id, family_id) on delete cascade,
  unique (store_id, name),
  unique (store_id, position)
);

create table public.shopping_lists (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  store_id uuid,
  name text not null default 'Spesa',
  status text not null default 'active' check (status in ('active', 'completed', 'archived')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  foreign key (store_id, family_id) references public.stores(id, family_id) on delete set null (store_id),
  unique (id, family_id)
);
create unique index shopping_lists_one_active_per_store
  on public.shopping_lists (family_id, store_id)
  where status = 'active' and store_id is not null;
create index shopping_lists_family_status_idx on public.shopping_lists (family_id, status, created_at desc);

create table public.shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  shopping_list_id uuid not null,
  product_id uuid not null,
  quantity integer not null default 1 check (quantity >= 1),
  checked boolean not null default false,
  position integer not null default 0 check (position >= 0),
  note text not null default '',
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (shopping_list_id, family_id) references public.shopping_lists(id, family_id) on delete cascade,
  foreign key (product_id, family_id) references public.products(id, family_id) on delete cascade,
  unique (shopping_list_id, product_id)
);
create index shopping_list_items_order_idx on public.shopping_list_items (shopping_list_id, position);

create table public.product_prices (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  product_id uuid not null,
  store_id uuid not null,
  price numeric(10, 2) not null check (price >= 0),
  currency text not null default 'EUR' check (currency = 'EUR'),
  observed_at timestamptz not null default now(),
  foreign key (product_id, family_id) references public.products(id, family_id) on delete cascade,
  foreign key (store_id, family_id) references public.stores(id, family_id) on delete cascade
);
create index product_prices_latest_idx on public.product_prices (family_id, product_id, store_id, observed_at desc);

create or replace function private.is_family_member(target_family_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.family_members fm
    where fm.family_id = target_family_id
      and fm.user_id = (select auth.uid())
  );
$$;
revoke all on function private.is_family_member(uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_family_member(uuid) to authenticated;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function public.set_updated_at() from public, anon, authenticated;

create or replace function public.create_family(family_name text)
returns uuid
language plpgsql
security definer
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

create trigger families_set_updated_at before update on public.families
  for each row execute function public.set_updated_at();
create trigger products_set_updated_at before update on public.products
  for each row execute function public.set_updated_at();
create trigger stores_set_updated_at before update on public.stores
  for each row execute function public.set_updated_at();
create trigger shopping_list_items_set_updated_at before update on public.shopping_list_items
  for each row execute function public.set_updated_at();

alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.products enable row level security;
alter table public.stores enable row level security;
alter table public.store_departments enable row level security;
alter table public.shopping_lists enable row level security;
alter table public.shopping_list_items enable row level security;
alter table public.product_prices enable row level security;

create policy "family members can read their families" on public.families
  for select to authenticated using (private.is_family_member(id));
create policy "family members can update their family" on public.families
  for update to authenticated using (private.is_family_member(id)) with check (private.is_family_member(id));

create policy "members can read household membership" on public.family_members
  for select to authenticated using (user_id = (select auth.uid()) or private.is_family_member(family_id));
create policy "family members manage products" on public.products
  for all to authenticated using (private.is_family_member(family_id))
  with check (private.is_family_member(family_id));
create policy "family members manage stores" on public.stores
  for all to authenticated using (private.is_family_member(family_id))
  with check (private.is_family_member(family_id));
create policy "family members manage store departments" on public.store_departments
  for all to authenticated using (private.is_family_member(family_id))
  with check (private.is_family_member(family_id));
create policy "family members manage shopping lists" on public.shopping_lists
  for all to authenticated using (private.is_family_member(family_id))
  with check (private.is_family_member(family_id));
create policy "family members manage shopping items" on public.shopping_list_items
  for all to authenticated using (private.is_family_member(family_id))
  with check (private.is_family_member(family_id));
create policy "family members manage product prices" on public.product_prices
  for all to authenticated using (private.is_family_member(family_id))
  with check (private.is_family_member(family_id));

grant select, update on public.families to authenticated;
grant select on public.family_members to authenticated;
grant select, insert, update, delete on public.products, public.stores, public.store_departments, public.shopping_lists,
  public.shopping_list_items, public.product_prices to authenticated;
revoke insert, delete on public.families, public.family_members from authenticated;
revoke all on public.families, public.family_members, public.products, public.stores,
  public.store_departments, public.shopping_lists, public.shopping_list_items,
  public.product_prices from anon;
