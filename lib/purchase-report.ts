import type { Data } from './girospesa-sync';

export type Purchase = {
  id: string;
  productId: string;
  name: string;
  quantity: number;
  unitCents: number | null;
  date: string;
};

export function recordPurchase(data: Data, id: string): Data {
  const trip = data.trip;
  const item = trip?.items.find(entry => entry.productId === id);
  const product = data.products.find(entry => entry.id === id);
  if (!trip || !item || !product) return data;
  const price = product.prices[trip.storeId];
  const purchase: Purchase = {
    id: crypto.randomUUID(),
    productId: id,
    name: product.name,
    quantity: Math.max(1, Number.parseInt(item.qty, 10) || 1),
    unitCents: Number.isFinite(price) ? Math.round(price * 100) : null,
    date: new Date().toISOString(),
  };
  return {
    ...data,
    purchases: [...(data.purchases ?? []), purchase],
    trip: { ...trip, items: trip.items.filter(entry => entry.productId !== id) },
  };
}

export type Period = 'week' | 'month' | 'year';

const italianDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' });
const shortDate = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const monthDate = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const dayKey = (date: Date) => date.toISOString().slice(0, 10);

export function reportPeriod(period: Period, offset: number, now = new Date()) {
  const [year, month, day] = italianDate.format(now).split('-').map(Number);
  const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));
  if (period === 'year') return { start: dayKey(utc(year + offset, 0, 1)), end: dayKey(utc(year + offset + 1, 0, 1)), label: String(year + offset) };
  if (period === 'month') {
    const start = utc(year, month - 1 + offset, 1);
    return { start: dayKey(start), end: dayKey(utc(year, month + offset, 1)), label: monthDate.format(start) };
  }
  const monday = day - (utc(year, month - 1, day).getUTCDay() + 6) % 7 + 7 * offset;
  const start = utc(year, month - 1, monday);
  const last = utc(year, month - 1, monday + 6);
  return { start: dayKey(start), end: dayKey(utc(year, month - 1, monday + 7)), label: shortDate.format(start) + ' – ' + shortDate.format(last) + ' ' + last.getUTCFullYear() };
}

export function summarizePurchases(purchases: Purchase[], start: string, end: string) {
  const totals = new Map<string, { id: string; name: string; qty: number; priced: number; cents: number }>();
  for (const purchase of purchases) {
    const day = italianDate.format(new Date(purchase.date));
    if (day < start || day >= end) continue;
    const row = totals.get(purchase.productId) ?? { id: purchase.productId, name: purchase.name, qty: 0, priced: 0, cents: 0 };
    row.qty += purchase.quantity;
    if (purchase.unitCents !== null) {
      row.priced += purchase.quantity;
      row.cents += purchase.quantity * purchase.unitCents;
    }
    totals.set(row.id, row);
  }
  return [...totals.values()].sort((a, b) => a.name.localeCompare(b.name, 'it'));
}
