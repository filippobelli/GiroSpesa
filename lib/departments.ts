/**
 * Departments are flat strings; a subcategory is "Parent · Sub" (e.g. "Dispensa · Dolci").
 * Each one has its own place in a store's route, so no schema change is needed.
 */
import type { Data, Product } from './girospesa-sync';

export const SEP = ' · ';

export const MAIN_ICONS: Record<string, string> = {
  Ortofrutta: '🥬', Panetteria: '🥖', Freschi: '🧀', Pesce: '🐟', Dispensa: '🫙',
  Casa: '🧹', Igiene: '🧴', Bevande: '🥤', Surgelati: '🧊', Altro: '🛒',
};

const SUB_ICONS: Record<string, string> = {
  'Dispensa · Dolci': '🍪', 'Dispensa · Pane': '🥨', 'Dispensa · Pesce': '🥫',
  'Dispensa · Legumi': '🫘', 'Dispensa · Altro': '🫙',
};

export const DISPENSA_SUBS = ['Dolci', 'Pane', 'Pesce', 'Legumi', 'Altro'].map((s) => `Dispensa${SEP}${s}`);

/** Route used for new stores: Dispensa already split into its subcategories. */
export const DEFAULT_ORDER = Object.keys(MAIN_ICONS).flatMap((c) => (c === 'Dispensa' ? DISPENSA_SUBS : [c]));

export function parentOf(cat: string) { return cat.split(SEP)[0]; }
export function subOf(cat: string) { const i = cat.indexOf(SEP); return i < 0 ? '' : cat.slice(i + SEP.length); }
export function iconFor(cat: string) { return SUB_ICONS[cat] ?? MAIN_ICONS[cat] ?? MAIN_ICONS[parentOf(cat)] ?? '🛒'; }

/** Add `cat` to a route right after the last department of the same parent (or at the end). */
export function insertDept(order: string[], cat: string): string[] {
  if (order.includes(cat)) return order;
  const parent = parentOf(cat);
  let at = -1;
  order.forEach((c, i) => { if (parentOf(c) === parent) at = i; });
  if (at < 0) return [...order, cat];
  // Keep the "Altro" catch-all as the last subcategory of its parent.
  const other = order.indexOf(`${parent}${SEP}Altro`);
  if (other >= 0 && subOf(cat) !== 'Altro') at = other - 1;
  return [...order.slice(0, at + 1), cat, ...order.slice(at + 1)];
}

export type DeptGroup = { parent: string; options: string[] };

/** Departments for pickers: subcategories grouped under their parent, parent kept only if in use. */
export function departmentGroups(data: Data): DeptGroup[] {
  const all: string[] = [];
  const add = (c: string) => { if (c && !all.includes(c)) all.push(c); };
  Object.keys(MAIN_ICONS).forEach(add);
  data.stores.forEach((s) => s.order.forEach(add));
  data.products.forEach((p) => add(p.category));
  const used = new Set<string>([...data.stores.flatMap((s) => s.order), ...data.products.map((p) => p.category)]);

  const parents: string[] = [];
  all.forEach((c) => { const p = parentOf(c); if (!parents.includes(p)) parents.push(p); });
  return parents.map((parent) => {
    const subs = all.filter((c) => c !== parent && parentOf(c) === parent);
    if (!subs.length) return { parent, options: [parent] };
    return { parent, options: [...(used.has(parent) ? [parent] : []), ...subs] };
  });
}

export function flatDepartments(data: Data): string[] {
  return departmentGroups(data).flatMap((g) => g.options);
}

/** Label for a department inside its parent's group. */
export function shortLabel(cat: string) { return subOf(cat) || `${cat} (generico)`; }

/** The ten built-in departments are the fixed skeleton: subcategories and custom ones are editable. */
export function isEditableDept(cat: string) { return !(cat in MAIN_ICONS); }

/** Tidy a user-typed department name: no separator inside, single spaces, capitalised. */
export function cleanDeptName(raw: string) {
  const name = raw.replace(/·/g, '-').replace(/\s+/g, ' ').trim();
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : '';
}

function mapCat(c: string, from: string, to: string) {
  if (c === from) return to;
  return c.startsWith(from + SEP) ? to + c.slice(from.length) : c;
}

/** Rename a department everywhere (its subcategories follow when it is a parent). */
export function renameDeptIn(data: Data, from: string, to: string): Data {
  return {
    ...data,
    products: data.products.map((p) => { const category = mapCat(p.category, from, to); return category === p.category ? p : { ...p, category }; }),
    stores: data.stores.map((s) => ({ ...s, order: s.order.map((c) => mapCat(c, from, to)) })),
  };
}

/** Delete a department: its products move to `target`, routes drop it. */
export function deleteDeptIn(data: Data, cat: string, target: string): Data {
  const moving = data.products.some((p) => p.category === cat);
  return {
    ...data,
    products: data.products.map((p) => (p.category === cat ? { ...p, category: target } : p)),
    stores: data.stores.map((s) => {
      const order = s.order.filter((c) => c !== cat);
      return { ...s, order: moving && target ? insertDept(order, target) : order };
    }),
  };
}

/** Best place for the products of a department being deleted. */
export function defaultMoveTarget(cat: string, options: string[]) {
  const parent = parentOf(cat);
  const candidates = [`${parent}${SEP}Altro`, parent, 'Altro'];
  return candidates.find((c) => c !== cat && options.includes(c)) ?? options.find((c) => c !== cat) ?? '';
}

/**
 * One-time split of plain "Dispensa": products get a subcategory, routes get the five
 * subcategories in the place where "Dispensa" was. Returns the same object if nothing to do.
 */
export function migrateDispensa(data: Data, subFor: (name: string) => string): Data {
  const needsProducts = data.products.some((p) => p.category === 'Dispensa');
  const needsStores = data.stores.some((s) => s.order.includes('Dispensa'));
  if (!needsProducts && !needsStores) return data;
  const products: Product[] = data.products.map((p) => {
    if (p.category !== 'Dispensa') return p;
    const category = `Dispensa${SEP}${subFor(p.name)}`;
    return { ...p, category, emoji: p.emoji === MAIN_ICONS.Dispensa ? iconFor(category) : p.emoji };
  });
  const stores = data.stores.map((s) => {
    const at = s.order.indexOf('Dispensa');
    if (at < 0) return s;
    const subs = DISPENSA_SUBS.filter((c) => !s.order.includes(c));
    return { ...s, order: [...s.order.slice(0, at), ...subs, ...s.order.slice(at + 1)] };
  });
  return { ...data, products, stores };
}
