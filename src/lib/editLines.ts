import type { ImportLine, Product } from '../data/types';
import { matchProduct, type ExtractedLine } from './proformaExtract';

/** Ligne en cours de saisie : produit existant, ou nouveau produit (lu sur la proforma ou saisi) */
export interface EditLine {
  productId: string; // '' | id | 'new'
  qty: string;
  price: string;
  ref?: string;
  name?: string;
  ean?: string;
  pcb?: string;
  cbm?: string;
  by?: 'ref' | 'ean' | 'nom' | 'new';
}

export const emptyLine = (): EditLine => ({ productId: '', qty: '', price: '' });
export const toNum = (v?: string) => Number(String(v ?? '').replace(',', '.').replace(/\s/g, ''));

/** Lignes lues sur une proforma → lignes à vérifier, rapprochées des produits du fournisseur */
export function fromExtraction(lines: ExtractedLine[], products: Product[]): EditLine[] {
  return lines.map((l) => {
    const m = matchProduct(l, products);
    return m.product
      ? { productId: m.product.id, qty: String(l.qty), price: String(l.price), by: m.by }
      : {
          productId: 'new',
          qty: String(l.qty),
          price: String(l.price),
          ref: l.ref,
          name: l.name,
          ean: l.ean,
          pcb: l.pcb ? String(l.pcb) : '',
          cbm: l.cbmCarton ? String(l.cbmCarton) : '',
          by: 'new',
        };
  });
}

/** Lignes prêtes à enregistrer, ou null si incomplètes */
export function toImport(lines: EditLine[]): ImportLine[] | null {
  const used = lines.filter((l) => l.productId);
  if (!used.length) return null;
  const out: ImportLine[] = [];
  for (const l of used) {
    const qty = Math.round(toNum(l.qty));
    const price = toNum(l.price);
    if (!(qty > 0) || !(price >= 0)) return null;
    if (l.productId !== 'new') out.push({ productId: l.productId, qty, price });
    else {
      const pcb = Math.round(toNum(l.pcb));
      const cbm = toNum(l.cbm);
      if (!l.name?.trim() || !(pcb > 0) || !(cbm > 0)) return null;
      // La référence lue sur la proforma est celle du fournisseur ; la référence et l'EAN JONAS sont attribués à la création
      out.push({ newProduct: { supplierRef: l.ref?.trim().toUpperCase() || undefined, name: l.name.trim(), pcb, cbmCarton: cbm }, qty, price });
    }
  }
  return out;
}

