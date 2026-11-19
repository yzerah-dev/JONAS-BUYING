// Commande dictée à l'assistant : « passe la commande de 10 000 KF032 et 5 000 JO-R301 ».
// On repère les couples quantité + référence (JONAS ou fournisseur), dans un sens ou dans l'autre.
import type { Product } from '../data/types';

export interface OrderItem {
  qty: number;
  /** Référence telle qu'écrite */
  ref: string;
  product?: Product;
}

const key = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** « 10 000 », « 10.000 », « 10k », « 2,5k » → nombre de pièces */
function qtyOf(raw: string, k?: string) {
  const n = Number(raw.replace(/[\s  .]/g, '').replace(',', '.'));
  return Math.round(k ? n * 1000 : n);
}

// « 3k » (milliers) seulement collé au nombre et suivi d'un séparateur : « 10 000 KF032 » reste 10 000 × KF032
const QTY = String.raw`(\d{1,3}(?:[\s  .]\d{3})+|\d+(?:,\d+)?)(k(?![A-Za-z0-9]))?`;
const REF = String.raw`([A-Za-z]{1,5}[-\s]?[A-Za-z]?\d{2,6}[A-Za-z]?)`;
const SEP = String.raw`\s*(?:x|×|pcs|pces|pi[eè]ces?|unit[ée]s?|de|du|des|d['’]|en)?\s*(?:la|le|l['’]|ref\.?|réf\.?|référence)?\s*`;

/** Lignes de commande trouvées dans la phrase, rapprochées du catalogue */
export function parseOrderCommand(text: string, products: Product[]): OrderItem[] {
  const found: { qty: number; ref: string; at: number }[] = [];
  const qtyFirst = new RegExp(`${QTY}${SEP}${REF}\\b`, 'gi');
  const refFirst = new RegExp(`\\b${REF}\\s*(?:x|×|:|-)?\\s*${QTY}\\s*(?:pcs|pces|pi[eè]ces?|unit[ée]s?)\\b`, 'gi');
  for (const m of text.matchAll(qtyFirst)) found.push({ qty: qtyOf(m[1], m[2]), ref: m[3], at: m.index ?? 0 });
  for (const m of text.matchAll(refFirst)) {
    if (!found.some((f) => key(f.ref) === key(m[1]))) found.push({ qty: qtyOf(m[2], m[3]), ref: m[1], at: m.index ?? 0 });
  }
  return found
    .filter((f) => f.qty > 0 && /\d/.test(f.ref))
    .sort((a, b) => a.at - b.at)
    .map((f) => ({
      qty: f.qty,
      ref: f.ref.toUpperCase().replace(/\s+/g, ''),
      product: products.find((p) => key(p.ref) === key(f.ref)) ?? products.find((p) => p.supplierRef && key(p.supplierRef) === key(f.ref)),
    }));
}
