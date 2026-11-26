import type { Product } from '../data/types';

/**
 * Taille du produit : champ « Tailles » de la fiche, sinon la mention « SIZE : … » du texte du fournisseur
 * (ex. « SIZE :18*14*8cm » → « 18 × 14 × 8 cm »).
 */
export function productSize(p: Pick<Product, 'sizes' | 'name' | 'description'>): { text: string; fromSupplier: boolean } | null {
  if (p.sizes?.trim()) return { text: p.sizes.trim(), fromSupplier: false };
  const src = `${p.description?.en ?? ''}\n${p.name}`;
  const m = src.match(/SIZE\s*[:：]?\s*([^\n(]+?)(?=\s{2,}|\(|\n|$)/i);
  if (!m) return null;
  const text = m[1]
    .trim()
    .replace(/\s+\d+\s*pcs\b.*$/i, '') // conditionnement (« 16pcs/PDQ ») : pas une taille
    .replace(/[,;；]\s*$/, '')
    .replace(/\s*；\s*/g, ' ; ')
    .replace(/\bdia\s*(?=[\d.])/gi, 'Ø ')
    .replace(/\s*[*x×]\s*(?=[\d.])/gi, ' × ')
    .replace(/(\d)\s*(cm|mm|m)\b/gi, (_, d: string, u: string) => `${d} ${u.toLowerCase()}`);
  return text ? { text, fromSupplier: true } : null;
}
