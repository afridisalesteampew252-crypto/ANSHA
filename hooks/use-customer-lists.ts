'use client';

import { useCallback, useSyncExternalStore } from 'react';
import {
  addToCart,
  getCartItems,
  getFavoriteItems,
  isFavorite,
  isInCart,
  removeFavorite,
  removeFromCart,
  subscribeCustomerLists,
  toggleFavorite,
  type CatalogItemKind,
  type SavedCatalogItem,
} from '@/lib/customer-lists';

function getCartSnapshot() {
  return JSON.stringify(getCartItems());
}

function getFavoritesSnapshot() {
  return JSON.stringify(getFavoriteItems());
}

function getServerSnapshot() {
  return '[]';
}

export function useCustomerLists() {
  const cartRaw = useSyncExternalStore(subscribeCustomerLists, getCartSnapshot, getServerSnapshot);
  const favoritesRaw = useSyncExternalStore(subscribeCustomerLists, getFavoritesSnapshot, getServerSnapshot);

  const cart = JSON.parse(cartRaw) as SavedCatalogItem[];
  const favorites = JSON.parse(favoritesRaw) as SavedCatalogItem[];

  const cartHas = useCallback((id: string, kind: CatalogItemKind = 'part') => isInCart(id, kind), [cartRaw]);
  const favoriteHas = useCallback((id: string, kind: CatalogItemKind = 'part') => isFavorite(id, kind), [favoritesRaw]);

  return {
    cart,
    favorites,
    cartCount: cart.length,
    favoritesCount: favorites.length,
    cartHas,
    favoriteHas,
    addToCart,
    removeFromCart,
    toggleFavorite,
    removeFavorite,
  };
}
