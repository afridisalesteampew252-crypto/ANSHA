export type CatalogItemKind = 'part' | 'vehicle';

export interface SavedCatalogItem {
  id: string;
  kind: CatalogItemKind;
  slug: string;
  title: string;
  subtitle?: string;
  priceLabel?: string;
  imageUrl?: string | null;
  href: string;
  addedAt: number;
}

export const CART_STORAGE_KEY = 'ansha-inquiry-cart';
export const FAVORITES_STORAGE_KEY = 'ansha-favorites';
export const CUSTOMER_LISTS_EVENT = 'ansha-customer-lists';

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function readList(key: string): SavedCatalogItem[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is SavedCatalogItem =>
        Boolean(item)
        && typeof item === 'object'
        && typeof (item as SavedCatalogItem).id === 'string'
        && typeof (item as SavedCatalogItem).slug === 'string'
        && typeof (item as SavedCatalogItem).title === 'string'
        && ((item as SavedCatalogItem).kind === 'part' || (item as SavedCatalogItem).kind === 'vehicle'),
    );
  } catch {
    return [];
  }
}

function writeList(key: string, items: SavedCatalogItem[]) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(key, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent(CUSTOMER_LISTS_EVENT, { detail: { key } }));
}

export function getCartItems(): SavedCatalogItem[] {
  return readList(CART_STORAGE_KEY);
}

export function getFavoriteItems(): SavedCatalogItem[] {
  return readList(FAVORITES_STORAGE_KEY);
}

export function isInCart(id: string, kind: CatalogItemKind = 'part'): boolean {
  return getCartItems().some((item) => item.id === id && item.kind === kind);
}

export function isFavorite(id: string, kind: CatalogItemKind = 'part'): boolean {
  return getFavoriteItems().some((item) => item.id === id && item.kind === kind);
}

export function addToCart(item: Omit<SavedCatalogItem, 'addedAt'>): SavedCatalogItem[] {
  const existing = getCartItems().filter((entry) => !(entry.id === item.id && entry.kind === item.kind));
  const next = [{ ...item, addedAt: Date.now() }, ...existing].slice(0, 40);
  writeList(CART_STORAGE_KEY, next);
  return next;
}

export function removeFromCart(id: string, kind: CatalogItemKind = 'part'): SavedCatalogItem[] {
  const next = getCartItems().filter((item) => !(item.id === id && item.kind === kind));
  writeList(CART_STORAGE_KEY, next);
  return next;
}

export function toggleFavorite(item: Omit<SavedCatalogItem, 'addedAt'>): { items: SavedCatalogItem[]; added: boolean } {
  const current = getFavoriteItems();
  const exists = current.some((entry) => entry.id === item.id && entry.kind === item.kind);
  const next = exists
    ? current.filter((entry) => !(entry.id === item.id && entry.kind === item.kind))
    : [{ ...item, addedAt: Date.now() }, ...current].slice(0, 60);
  writeList(FAVORITES_STORAGE_KEY, next);
  return { items: next, added: !exists };
}

export function removeFavorite(id: string, kind: CatalogItemKind = 'part'): SavedCatalogItem[] {
  const next = getFavoriteItems().filter((item) => !(item.id === id && item.kind === kind));
  writeList(FAVORITES_STORAGE_KEY, next);
  return next;
}

export function subscribeCustomerLists(onStoreChange: () => void) {
  if (!canUseStorage()) return () => undefined;
  const handler = () => onStoreChange();
  window.addEventListener(CUSTOMER_LISTS_EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(CUSTOMER_LISTS_EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}
