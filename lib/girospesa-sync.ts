import type { SupabaseClient } from '@supabase/supabase-js';
import type { Purchase } from './purchase-report';
import { DEFAULT_ORDER } from './departments';
import { chooseList, GENERAL, type ShoppingList } from './shopping-lists';

export type Product = {
  id: string;
  name: string;
  category: string;
  emoji: string;
  qty: string;
  note: string;
  barcode: string;
  prices: Record<string, number>;
};

export type Store = { id: string; name: string; color: string; order: string[] };
export type TripItem = { productId: string; qty: string; checked: boolean };
export type Trip = { id?: string; storeId: string; items: TripItem[] };
export type Data = { products: Product[]; stores: Store[]; trip: Trip | null; lists?: ShoppingList[]; purchases?: Purchase[] };

type Client = SupabaseClient;

const DEFAULT_DEPARTMENTS = DEFAULT_ORDER;

// The legacy store_id column permits only one active list per store.
const storedStore = /\n@store:([0-9a-f-]{36})$/i;

function storedListName(list: ShoppingList) {
  return list.storeId ? list.name + '\n@store:' + list.storeId : list.name;
}

function throwIfError(error: { message?: string } | null) {
  if (error) throw new Error(error.message || 'Errore durante la sincronizzazione.');
}

function safeQuantity(value: string | number | null | undefined) {
  const quantity = Number.parseInt(String(value ?? '1'), 10);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
}

function packageQuantity(value: string | number | null | undefined) {
  const text = String(value ?? '1');
  const multiplied = text.match(/^\s*(\d+)\s*[x×]/i);
  if (multiplied) return safeQuantity(multiplied[1]);
  const plainNumber = text.match(/^\s*(\d+)\s*$/);
  if (plainNumber) return safeQuantity(plainNumber[1]);
  const labelled = text.match(/^\s*(\d+)\s+(?:confezion|pezzi|bottigl|lattin|vasett|pacch|scatol|unit|barattol)/i);
  return labelled ? safeQuantity(labelled[1]) : 1;
}

export async function getFamilyName(client: Client, familyId: string) {
  const { data, error } = await client.from('families').select('name').eq('id', familyId).single();
  throwIfError(error);
  if (!data) throw new Error('Famiglia non trovata.');
  return data.name as string;
}

export async function loadFamilyData(client: Client, familyId: string, selectedListId?: string): Promise<Data> {
  const [productsResult, storesResult, departmentsResult, pricesResult] = await Promise.all([
    client.from('products').select('id,name,category,emoji,usual_quantity,note,barcode').eq('family_id', familyId).order('name'),
    client.from('stores').select('id,name,color').eq('family_id', familyId).order('created_at'),
    client.from('store_departments').select('store_id,name,position').eq('family_id', familyId).order('position'),
    client.from('product_prices').select('product_id,store_id,price,observed_at').eq('family_id', familyId).order('observed_at', { ascending: false }),
  ]);
  throwIfError(productsResult.error);
  throwIfError(storesResult.error);
  throwIfError(departmentsResult.error);
  throwIfError(pricesResult.error);

  const stores = (storesResult.data ?? []).map((store) => ({
    id: store.id,
    name: store.name,
    color: store.color,
    order: (departmentsResult.data ?? [])
      .filter((department) => department.store_id === store.id)
      .sort((a, b) => a.position - b.position)
      .map((department) => department.name),
  })).map((store) => ({ ...store, order: store.order.length ? store.order : DEFAULT_DEPARTMENTS }));

  const pricesByProduct: Record<string, Record<string, number>> = {};
  for (const price of pricesResult.data ?? []) {
    pricesByProduct[price.product_id] ??= {};
    if (pricesByProduct[price.product_id][price.store_id] === undefined) {
      pricesByProduct[price.product_id][price.store_id] = Number(price.price);
    }
  }

  const products: Product[] = (productsResult.data ?? []).map((product) => ({
    id: product.id,
    name: product.name,
    category: product.category,
    emoji: product.emoji,
    qty: String(product.usual_quantity),
    note: product.note,
    barcode: product.barcode ?? '',
    prices: pricesByProduct[product.id] ?? {},
  }));

  const { error: generalError } = await client.from('shopping_lists').upsert(
    { id: familyId, family_id: familyId, name: GENERAL },
    { onConflict: 'id', ignoreDuplicates: true },
  );
  throwIfError(generalError);

  const [listsResult, itemsResult] = await Promise.all([
    client.from('shopping_lists').select('id,name,store_id').eq('family_id', familyId).eq('status', 'active').order('created_at'),
    loadListItems(client, familyId),
  ]);
  throwIfError(listsResult.error);

  const lists: ShoppingList[] = (listsResult.data ?? []).map(list => {
    const storeId = list.name.match(storedStore)?.[1];
    const name = list.name.replace(storedStore, '');
    return {
      id: list.id,
      name: list.id === familyId ? GENERAL : (!storeId && name === 'Spesa' && list.store_id
        ? stores.find(store => store.id === list.store_id)?.name ?? name
        : name),
      storeId,
      legacyStoreId: list.store_id ?? undefined,
      items: itemsResult.get(list.id) ?? [],
    };
  });
  lists.sort((a, b) => Number(b.id === familyId) - Number(a.id === familyId));
  const purchases = await loadPurchases(client, familyId);
  const data = { products, stores, lists, purchases, trip: null };
  return selectedListId ? chooseList(data, selectedListId, familyId) : data;
}

// Completed rows hold immutable purchase snapshots, independent of the catalog.
const PURCHASE_PREFIX = '@girospesa-purchase:';

async function loadPurchases(client: Client, familyId: string): Promise<Purchase[]> {
  const purchases: Purchase[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client.from('shopping_lists').select('id,name,completed_at')
      .eq('family_id', familyId).eq('status', 'completed').like('name', PURCHASE_PREFIX + '%')
      .order('completed_at').order('id').range(offset, offset + pageSize - 1);
    throwIfError(error);
    for (const row of data ?? []) {
      const snapshot = JSON.parse(row.name.slice(PURCHASE_PREFIX.length));
      purchases.push({ ...snapshot, id: row.id, date: row.completed_at });
    }
    if ((data?.length ?? 0) < pageSize) return purchases;
  }
}

async function loadListItems(client: Client, familyId: string) {
  const byList = new Map<string, TripItem[]>();
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client.from('shopping_list_items')
      .select('id,shopping_list_id,product_id,quantity,checked,shopping_lists!inner(status)')
      .eq('family_id', familyId).eq('shopping_lists.status', 'active')
      .order('position').order('id').range(offset, offset + pageSize - 1);
    throwIfError(error);
    for (const item of data ?? []) {
      const items = byList.get(item.shopping_list_id) ?? [];
      items.push({ productId: item.product_id, qty: String(item.quantity), checked: item.checked });
      byList.set(item.shopping_list_id, items);
    }
    if ((data?.length ?? 0) < pageSize) return byList;
  }
}

export async function namedListId(familyId: string, name: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256',
    new TextEncoder().encode(familyId + ':' + name.toLocaleLowerCase('it'))));
  bytes[6] = (bytes[6] & 15) | 128;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes.slice(0, 16), byte => byte.toString(16).padStart(2, '0')).join('');
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
}

/** Import the current browser list once when its new family has no catalog yet. */
export async function importLocalData(client: Client, familyId: string, userId: string, local: Data): Promise<Data> {
  const productIds = new Map(local.products.map((product) => [product.id, crypto.randomUUID()]));
  const storeIds = new Map(local.stores.map((store) => [store.id, crypto.randomUUID()]));
  const products: Product[] = local.products.map((product) => ({
    ...product,
    id: productIds.get(product.id)!,
    qty: String(product.category === 'Ortofrutta' || product.category === 'Pesce' || /uova/i.test(product.name) ? 1 : packageQuantity(product.qty)),
  }));
  const stores: Store[] = local.stores.map((store) => ({ ...store, id: storeIds.get(store.id)! }));
  const tripStoreId = local.trip ? storeIds.get(local.trip.storeId) : undefined;
  const tripId = crypto.randomUUID();
  const data: Data = {
    products,
    stores,
    trip: local.trip && tripStoreId ? {
      id: tripId,
      storeId: tripStoreId,
      items: local.trip.items.flatMap((item) => {
        const productId = productIds.get(item.productId);
        return productId ? [{ ...item, productId, qty: String(packageQuantity(item.qty)) }] : [];
      }),
    } : null,
  };

  if (products.length) {
    const { error } = await client.from('products').insert(products.map((product) => ({
      id: product.id,
      family_id: familyId,
      name: product.name,
      category: product.category,
      emoji: product.emoji,
      usual_quantity: safeQuantity(product.qty),
      note: product.note,
      barcode: product.barcode || null,
      created_by: userId,
    })));
    throwIfError(error);
  }

  if (stores.length) {
    const { error } = await client.from('stores').insert(stores.map((store) => ({
      id: store.id,
      family_id: familyId,
      name: store.name,
      color: store.color,
    })));
    throwIfError(error);

    const departments = stores.flatMap((store) => store.order.map((name, position) => ({
      family_id: familyId,
      store_id: store.id,
      name,
      position,
    })));
    if (departments.length) {
      const { error: departmentError } = await client.from('store_departments').insert(departments);
      throwIfError(departmentError);
    }
  }

  const priceRows = products.flatMap((product) => Object.entries(product.prices).flatMap(([oldStoreId, price]) => {
    const storeId = storeIds.get(oldStoreId);
    return storeId ? [{ family_id: familyId, product_id: product.id, store_id: storeId, price, currency: 'EUR' }] : [];
  }));
  if (priceRows.length) {
    const { error } = await client.from('product_prices').insert(priceRows);
    throwIfError(error);
  }

  if (data.trip) {
    const { error } = await client.from('shopping_lists').insert({
      id: data.trip.id,
      family_id: familyId,
      store_id: data.trip.storeId,
      name: 'Spesa',
      status: 'active',
      created_by: userId,
    });
    throwIfError(error);
    const { error: itemError } = await client.from('shopping_list_items').insert(data.trip.items.map((item, position) => ({
      family_id: familyId,
      shopping_list_id: data.trip!.id,
      product_id: item.productId,
      quantity: safeQuantity(item.qty),
      checked: item.checked,
      position,
      added_by: userId,
    })));
    throwIfError(itemError);
  }

  return loadFamilyData(client, familyId);
}

export async function deleteStore(client: Client, familyId: string, data: Data, storeId: string, fallbackStoreId: string): Promise<Data> {
  // Give legacy lists an explicit name before the foreign key clears the store.
  for (const list of data.lists ?? []) {
    if (list.legacyStoreId !== storeId && list.storeId !== storeId) continue;
    const replacement = list.storeId && list.storeId !== storeId ? list.storeId : fallbackStoreId;
    const { error } = await client.from('shopping_lists')
      .update({ name: storedListName({ ...list, storeId: replacement }), store_id: null })
      .eq('family_id', familyId).eq('id', list.id);
    throwIfError(error);
  }

  const { error } = await client.from('stores').delete().eq('family_id', familyId).eq('id', storeId);
  throwIfError(error);
  return loadFamilyData(client, familyId, data.trip?.id);
}

export async function persistDataChanges(client: Client, familyId: string, userId: string, previous: Data, next: Data) {
  const previousProducts = new Map(previous.products.map((product) => [product.id, product]));
  const nextProducts = new Map(next.products.map((product) => [product.id, product]));
  const changedProducts = next.products.filter((product) => JSON.stringify(previousProducts.get(product.id)) !== JSON.stringify(product));
  const removedProductIds = previous.products.filter((product) => !nextProducts.has(product.id)).map((product) => product.id);

  if (changedProducts.length) {
    const { error } = await client.from('products').upsert(changedProducts.map((product) => ({
      id: product.id,
      family_id: familyId,
      name: product.name,
      category: product.category,
      emoji: product.emoji,
      usual_quantity: safeQuantity(product.qty),
      note: product.note,
      barcode: product.barcode || null,
      created_by: userId,
    })));
    throwIfError(error);
  }

  if (removedProductIds.length) {
    const { error } = await client.from('products').delete().eq('family_id', familyId).in('id', removedProductIds);
    throwIfError(error);
  }

  const previousStores = new Map(previous.stores.map((store) => [store.id, store]));
  const nextStores = new Map(next.stores.map((store) => [store.id, store]));
  const changedStores = next.stores.filter((store) => {
    const old = previousStores.get(store.id);
    return !old || old.name !== store.name || old.color !== store.color;
  });
  if (changedStores.length) {
    const { error } = await client.from('stores').upsert(changedStores.map((store) => ({ id: store.id, family_id: familyId, name: store.name, color: store.color })));
    throwIfError(error);
  }

  for (const store of next.stores) {
    const old = previousStores.get(store.id);
    if (!old || JSON.stringify(old.order) !== JSON.stringify(store.order)) {
      const { error } = await client.from('store_departments').delete().eq('family_id', familyId).eq('store_id', store.id);
      throwIfError(error);
      if (store.order.length) {
        const { error: insertError } = await client.from('store_departments').insert(store.order.map((name, position) => ({ family_id: familyId, store_id: store.id, name, position })));
        throwIfError(insertError);
      }
    }
  }

  const pricesToInsert = next.products.flatMap((product) => {
    const oldProduct = previousProducts.get(product.id);
    return Object.entries(product.prices).flatMap(([storeId, price]) => {
      if (oldProduct?.prices[storeId] === price) return [];
      return [{ family_id: familyId, product_id: product.id, store_id: storeId, price, currency: 'EUR' }];
    });
  });
  if (pricesToInsert.length) {
    const { error } = await client.from('product_prices').insert(pricesToInsert);
    throwIfError(error);
  }

  const savedPurchases = new Set(previous.purchases?.map(purchase => purchase.id));
  const newPurchases = (next.purchases ?? []).filter(purchase => !savedPurchases.has(purchase.id));
  if (newPurchases.length) {
    const { error } = await client.from('shopping_lists').upsert(newPurchases.map(({ id, date, ...snapshot }) => ({
      id,
      family_id: familyId,
      created_by: userId,
      status: 'completed',
      completed_at: date,
      name: PURCHASE_PREFIX + JSON.stringify(snapshot),
    })), { onConflict: 'id', ignoreDuplicates: true });
    throwIfError(error);
  }

  if (next.lists) {
    await persistNamedLists(client, familyId, userId, previous.lists ?? [], next.lists);
  } else if (next.trip?.id && previous.trip?.id === next.trip.id) {
    // Replay pending edits saved by the previous version before loading the new lists.
    await persistListItems(client, familyId, userId, next.trip.id, previous.trip.items, next.trip.items);
  }
}

async function persistNamedLists(client: Client, familyId: string, userId: string, previous: ShoppingList[], next: ShoppingList[]) {
  const previousById = new Map(previous.map(list => [list.id, list]));
  const newLists = next.filter(list => !previousById.has(list.id));
  if (newLists.length) {
    const { error } = await client.from('shopping_lists').upsert(newLists.map(list => ({
      id: list.id, family_id: familyId, name: storedListName(list), created_by: userId,
    })), { onConflict: 'id', ignoreDuplicates: true });
    throwIfError(error);
  }

  for (const list of next) {
    const before = previousById.get(list.id);
    if (!before || before.storeId === list.storeId) continue;
    const { error } = await client.from('shopping_lists')
      .update({ name: storedListName(list) })
      .eq('family_id', familyId).eq('id', list.id).eq('status', 'active');
    throwIfError(error);
  }

  const removed = next.flatMap(list => {
    const remaining = new Set(list.items.map(item => item.productId));
    return (previousById.get(list.id)?.items ?? [])
      .filter(item => !remaining.has(item.productId))
      .map(item => ({ listId: list.id, productId: item.productId }));
  });
  for (let offset = 0; offset < removed.length; offset += 40) {
    const filters = removed.slice(offset, offset + 40).map(({ listId, productId }) =>
      'and(shopping_list_id.eq.' + listId + ',product_id.eq.' + productId + ')');
    const { error } = await client.from('shopping_list_items').delete()
      .eq('family_id', familyId).or(filters.join(','));
    throwIfError(error);
  }
  for (const list of next) {
    await persistListItems(client, familyId, userId, list.id, previousById.get(list.id)?.items ?? [], list.items, false);
  }
}

async function persistListItems(client: Client, familyId: string, userId: string, listId: string, previous: TripItem[], next: TripItem[], deleteMissing = true) {
  const previousById = new Map(previous.map(item => [item.productId, item]));
  const nextIds = new Set(next.map(item => item.productId));
  const removed = previous.filter(item => !nextIds.has(item.productId)).map(item => item.productId);
  if (deleteMissing && removed.length) {
    const { error } = await client.from('shopping_list_items').delete()
      .eq('family_id', familyId).eq('shopping_list_id', listId).in('product_id', removed);
    throwIfError(error);
  }
  const changed = next.flatMap((item, position) => {
    const old = previousById.get(item.productId);
    if (old?.qty === item.qty && old.checked === item.checked) return [];
    return [{
      family_id: familyId, shopping_list_id: listId, product_id: item.productId,
      quantity: safeQuantity(item.qty), checked: item.checked, position, added_by: userId,
    }];
  });
  if (changed.length) {
    const { error } = await client.from('shopping_list_items').upsert(changed, { onConflict: 'shopping_list_id,product_id' });
    throwIfError(error);
  }
}
