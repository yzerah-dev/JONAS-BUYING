import { useSyncExternalStore } from 'react';
import { useAuth } from '../data/store';

/** Panier de commande (par utilisateur, gardé dans ce navigateur) : produit → quantité en pièces */
export type Cart = Record<string, number>;

const KEY = (userId: string) => `jonas-buying-cart-${userId}`;
const listeners = new Set<() => void>();
const cache = new Map<string, Cart>();

function read(userId: string): Cart {
  if (cache.has(userId)) return cache.get(userId)!;
  let c: Cart = {};
  try {
    c = JSON.parse(localStorage.getItem(KEY(userId)) ?? '{}') as Cart;
  } catch {
    c = {};
  }
  cache.set(userId, c);
  return c;
}

export function setCart(userId: string, next: Cart) {
  const clean = Object.fromEntries(Object.entries(next).filter(([, q]) => q > 0));
  cache.set(userId, clean);
  try {
    localStorage.setItem(KEY(userId), JSON.stringify(clean));
  } catch {
    /* panier gardé le temps de la session */
  }
  listeners.forEach((l) => l());
}

export function setCartQty(userId: string, productId: string, qty: number) {
  setCart(userId, { ...read(userId), [productId]: Math.max(0, Math.round(qty)) });
}

export function useCart(userId: string): Cart {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => read(userId),
  );
}

/** Peut passer commande depuis le catalogue (acheteurs, Direction, Pilote) */
export function useCanOrder() {
  const auth = useAuth();
  return auth.can('proforma.edit') || auth.can('proforma.sign');
}
