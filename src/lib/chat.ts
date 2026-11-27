// Discussion produit : messages non lus d'un côté (JONAS ou fournisseur)
import type { ChatMessage, Product } from '../data/types';

export const chatSideOf = (role: string): 'jonas' | 'fournisseur' => (role === 'fournisseur' ? 'fournisseur' : 'jonas');

/** Messages de l'autre côté arrivés après ma dernière lecture */
export function unreadCount(p: Product, side: 'jonas' | 'fournisseur') {
  const seen = p.chatRead?.[side] ?? '';
  return (p.chat ?? []).filter((m) => m.side !== side && m.at > seen).length;
}

/** Toutes les pièces jointes d'un message (ancien format : une seule) */
export const filesOf = (m: ChatMessage) => [...(m.file ? [m.file] : []), ...(m.files ?? [])];
