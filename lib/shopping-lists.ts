import type { Data, TripItem } from './girospesa-sync';

export type ShoppingList = { id: string; name: string; items: TripItem[]; storeId?: string; legacyStoreId?: string };
export const GENERAL = 'Generale';
const quantity = (item: TripItem) => Math.max(1, Number.parseInt(item.qty, 10) || 1);

export function visibleItems(lists: ShoppingList[], listId: string, familyId: string): TripItem[] {
  if (listId !== familyId) return lists.find(list => list.id === listId)?.items ?? [];
  const items = new Map<string, TripItem>();
  for (const list of lists) {
    for (const item of list.items) {
      const previous = items.get(item.productId);
      items.set(item.productId, previous
        ? { ...item, qty: String(quantity(previous) + quantity(item)), checked: previous.checked && item.checked }
        : item);
    }
  }
  return [...items.values()];
}

export function chooseList(data: Data, listId: string, familyId: string, storeId?: string): Data {
  const list = data.lists?.find(candidate => candidate.id === listId);
  if (!list) return { ...data, trip: null };
  const chosenStore = [storeId, list.storeId, list.legacyStoreId]
    .find(id => data.stores.some(store => store.id === id)) ?? data.stores[0]?.id ?? '';
  return { ...data, trip: { id: listId, storeId: chosenStore, items: visibleItems(data.lists ?? [], listId, familyId) } };
}

export function assignListStore(data: Data, listId: string, familyId: string, storeId: string): Data {
  if (!data.stores.some(store => store.id === storeId) || !data.lists) return data;
  const lists = data.lists.map(list => list.id === listId ? { ...list, storeId } : list);
  return chooseList({ ...data, lists }, listId, familyId);
}

/** Translate changes in the selected list into changes to their owning rows. */
export function updateListItems(previous: Data, next: Data, familyId: string): Data {
  const trip = next.trip;
  if (!trip?.id || previous.trip?.id !== trip.id || !next.lists || previous.lists !== next.lists) return next;
  if (previous.trip.items === trip.items) return next;
  if (trip.id !== familyId) {
    return { ...next, lists: next.lists.map(list => list.id === trip.id ? { ...list, items: trip.items } : list) };
  }

  const desired = new Map(trip.items.map(item => [item.productId, item]));
  const original = new Map(previous.trip.items.map(item => [item.productId, item]));
  const lists = next.lists.map(list => ({ ...list, items: [...list.items] }));
  const general = lists.find(list => list.id === familyId)!;
  for (const [id, before] of original) {
    const after = desired.get(id);
    if (!after) {
      for (const list of lists) list.items = list.items.filter(item => item.productId !== id);
      continue;
    }
    let remaining = quantity(before) - quantity(after);
    const owners = [general, ...lists.filter(list => list !== general)];
    for (const list of owners) {
      list.items = list.items.flatMap(item => {
        if (item.productId !== id) return [item];
        const removed = Math.min(Math.max(remaining, 0), quantity(item));
        remaining -= removed;
        if (removed === quantity(item)) return [];
        return [{ ...item, qty: String(quantity(item) - removed), checked: before.checked === after.checked ? item.checked : after.checked }];
      });
    }
    if (remaining < 0) {
      const direct = general.items.find(item => item.productId === id);
      if (direct) direct.qty = String(quantity(direct) - remaining);
      else general.items.push({ ...after, qty: String(-remaining) });
    }
  }
  for (const item of trip.items) {
    if (!original.has(item.productId)) general.items.push(item);
  }
  return chooseList({ ...next, lists }, familyId, familyId, trip.storeId);
}

export function removeCatalogProduct(data: Data, id: string, familyId: string): Data {
  const next = {
    ...data,
    products: data.products.filter(product => product.id !== id),
    lists: data.lists?.map(list => ({ ...list, items: list.items.filter(item => item.productId !== id) })),
  };
  return data.trip?.id ? chooseList(next, data.trip.id, familyId, data.trip.storeId) : next;
}
