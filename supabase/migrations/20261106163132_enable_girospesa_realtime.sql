-- Enable live cross-device updates for authenticated family members.
alter publication supabase_realtime add table
  public.families,
  public.family_members,
  public.products,
  public.stores,
  public.store_departments,
  public.shopping_lists,
  public.shopping_list_items,
  public.product_prices;
