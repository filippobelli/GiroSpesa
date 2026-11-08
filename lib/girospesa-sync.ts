import type { SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_ORDER } from './departments';

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
export type Data = { products: Product[]; stores: Store[]; trip: Trip | null };

type Client = SupabaseClient;

const DEFAULT_DEPARTMENTS = DEFAULT_ORDER;

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

export async function loadFamilyData(client: Client, familyId: string, selectedStoreId?: string): Promise<Data> {
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

  if (!stores.length) return { products, stores, trip: null };

  let listQuery = client.from('shopping_lists').select('id,store_id').eq('family_id', familyId).eq('status', 'active');
  if (selectedStoreId) listQuery = listQuery.eq('store_id', selectedStoreId);
  const { data: list, error: listError } = await listQuery.order('created_at', { ascending: false }).limit(1).maybeSingle();
  throwIfError(listError);

  if (!list) {
    const storeId = selectedStoreId && stores.some((store) => store.id === selectedStoreId) ? selectedStoreId : stores[0].id;
    const { data: newList, error: createError } = await client
      .from('shopping_lists')
      .insert({ family_id: familyId, store_id: storeId, name: 'Spesa', status: 'active' })
      .select('id,store_id')
      .single();
    throwIfError(createError);
    if (!newList) throw new Error('Non riesco a creare la lista.');
    const newItems = products.map((product, position) => ({
      family_id: familyId,
      shopping_list_id: newList.id,
      product_id: product.id,
      quantity: safeQuantity(product.qty),
      checked: false,
      position,
    }));
    if (newItems.length) {
      const { error } = await client.from('shopping_list_items').insert(newItems);
      throwIfError(error);
    }
    return { products, stores, trip: { id: newList.id, storeId, items: newItems.map((item) => ({ productId: item.product_id, qty: String(item.quantity), checked: false })) } };
  }

  const { data: items, error: itemsError } = await client
    .from('shopping_list_items')
    .select('product_id,quantity,checked')
    .eq('family_id', familyId)
    .eq('shopping_list_id', list.id)
    .order('position');
  throwIfError(itemsError);

  return {
    products,
    stores,
    trip: {
      id: list.id,
      storeId: list.store_id,
      items: (items ?? []).map((item) => ({ productId: item.product_id, qty: String(item.quantity), checked: item.checked })),
    },
  };
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

  return data;
}

export async function switchStoreTrip(client: Client, familyId: string, userId: string, data: Data, storeId: string): Promise<Data> {
  const { data: list, error } = await client
    .from('shopping_lists')
    .select('id')
    .eq('family_id', familyId)
    .eq('store_id', storeId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();
  throwIfError(error);

  if (list) {
    const { data: items, error: itemsError } = await client
      .from('shopping_list_items')
      .select('product_id,quantity,checked')
      .eq('family_id', familyId)
      .eq('shopping_list_id', list.id)
      .order('position');
    throwIfError(itemsError);
    return { ...data, trip: { id: list.id, storeId, items: (items ?? []).map((item) => ({ productId: item.product_id, qty: String(item.quantity), checked: item.checked })) } };
  }

  const { data: newList, error: createError } = await client
    .from('shopping_lists')
    .insert({ family_id: familyId, store_id: storeId, name: 'Spesa', status: 'active', created_by: userId })
    .select('id')
    .single();
  throwIfError(createError);
  if (!newList) throw new Error('Non riesco a creare la lista del negozio.');
  const items = data.products.map((product, position) => ({
    family_id: familyId,
    shopping_list_id: newList.id,
    product_id: product.id,
    quantity: safeQuantity(product.qty),
    checked: false,
    position,
    added_by: userId,
  }));
  if (items.length) {
    const { error: itemError } = await client.from('shopping_list_items').insert(items);
    throwIfError(itemError);
  }
  return { ...data, trip: { id: newList.id, storeId, items: items.map((item) => ({ productId: item.product_id, qty: String(item.quantity), checked: false })) } };
}

/**
 * Delete a store. If the active trip is at that store, it first moves to `fallbackStoreId`.
 * Active lists of the deleted store are archived (the FK would only null their store_id);
 * its prices and departments go with it by cascade.
 */
export async function deleteStore(client: Client, familyId: string, userId: string, data: Data, storeId: string, fallbackStoreId: string): Promise<Data> {
  let next = data;
  if (data.trip?.storeId === storeId) next = await switchStoreTrip(client, familyId, userId, data, fallbackStoreId);

  const { error: archiveError } = await client
    .from('shopping_lists')
    .update({ status: 'archived' })
    .eq('family_id', familyId)
    .eq('store_id', storeId)
    .eq('status', 'active');
  throwIfError(archiveError);

  const { error } = await client.from('stores').delete().eq('family_id', familyId).eq('id', storeId);
  throwIfError(error);

  return {
    ...next,
    stores: next.stores.filter((store) => store.id !== storeId),
    products: next.products.map((product) => {
      if (!(storeId in product.prices)) return product;
      const prices = { ...product.prices };
      delete prices[storeId];
      return { ...product, prices };
    }),
  };
}

export async function startFreshTrip(client: Client, familyId: string, userId: string, data: Data, storeId: string): Promise<Data> {
  const { data: existing, error: existingError } = await client
    .from('shopping_lists')
    .select('id')
    .eq('family_id', familyId)
    .eq('store_id', storeId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();
  throwIfError(existingError);
  if (existing) {
    const { error } = await client.from('shopping_lists').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', existing.id).eq('family_id', familyId);
    throwIfError(error);
  }
  const { data: list, error } = await client
    .from('shopping_lists')
    .insert({ family_id: familyId, store_id: storeId, name: 'Spesa', status: 'active', created_by: userId })
    .select('id')
    .single();
  throwIfError(error);
  if (!list) throw new Error('Non riesco ad avviare una nuova spesa.');
  const items = data.products.map((product, position) => ({
    family_id: familyId,
    shopping_list_id: list.id,
    product_id: product.id,
    quantity: safeQuantity(product.qty),
    checked: false,
    position,
    added_by: userId,
  }));
  if (items.length) {
    const { error: itemError } = await client.from('shopping_list_items').insert(items);
    throwIfError(itemError);
  }
  return { ...data, trip: { id: list.id, storeId, items: items.map((item) => ({ productId: item.product_id, qty: String(item.quantity), checked: false })) } };
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

  if (previous.trip?.id && previous.trip.id !== next.trip?.id && !nextStores.has(previous.trip.storeId)) {
    const { error } = await client.from('stores').delete().eq('family_id', familyId).eq('id', previous.trip.storeId);
    throwIfError(error);
  }

  if (!next.trip?.id) return;
  if (JSON.stringify(previous.trip) !== JSON.stringify(next.trip)) {
    const { error } = await client.from('shopping_lists').upsert({
      id: next.trip.id,
      family_id: familyId,
      store_id: next.trip.storeId,
      name: 'Spesa',
      status: 'active',
      created_by: userId,
    });
    throwIfError(error);

    const oldItems = new Map((previous.trip?.id === next.trip.id ? previous.trip.items : []).map((item) => [item.productId, item]));
    const newItems = new Map(next.trip.items.map((item) => [item.productId, item]));
    const removedItems = [...oldItems.keys()].filter((productId) => !newItems.has(productId));
    if (removedItems.length) {
      const { error: deleteError } = await client.from('shopping_list_items').delete().eq('family_id', familyId).eq('shopping_list_id', next.trip.id).in('product_id', removedItems);
      throwIfError(deleteError);
    }
    const changedItems = next.trip.items.filter((item) => JSON.stringify(oldItems.get(item.productId)) !== JSON.stringify(item));
    if (changedItems.length) {
      const { error: itemError } = await client.from('shopping_list_items').upsert(changedItems.map((item) => ({
        family_id: familyId,
        shopping_list_id: next.trip!.id,
        product_id: item.productId,
        quantity: safeQuantity(item.qty),
        checked: item.checked,
        position: next.trip!.items.findIndex((candidate) => candidate.productId === item.productId),
        added_by: userId,
      })), { onConflict: 'shopping_list_id,product_id' });
      throwIfError(itemError);
    }
  }
}
