import type { ImportLine, Product } from '../data/types';
import { matchProduct, type ExtractedLine } from './proformaExtract';
import { newFileId, putBlob, supplierScope } from './files';

/** Ligne en cours de saisie : produit existant, ou nouveau produit (lu sur la proforma ou saisi) */
export interface EditLine {
  productId: string; // '' | id | 'new'
  qty: string;
  price: string;
  ref?: string;
  /** Référence JONAS portée par la proforma (sinon attribuée à la création) */
  jonasRef?: string;
  name?: string;
  ean?: string;
  pcb?: string;
  cbm?: string;
  by?: 'ref' | 'ean' | 'nom' | 'new';
  /** Photo lue sur la proforma (pas encore enregistrée) */
  photo?: Blob;
}

export const emptyLine = (): EditLine => ({ productId: '', qty: '', price: '' });
export const toNum = (v?: string) => Number(String(v ?? '').replace(',', '.').replace(/\s/g, ''));

/** Lignes lues sur une proforma → lignes à vérifier, rapprochées du catalogue JONAS et des produits du fournisseur */
export function fromExtraction(lines: ExtractedLine[], products: Product[], catalog: Product[] = products): EditLine[] {
  return lines.map((l) => {
    const m = matchProduct(l, products, catalog);
    return m.product
      ? { productId: m.product.id, qty: String(l.qty), price: String(l.price), by: m.by, photo: m.product.photo ? undefined : l.photo }
      : {
          productId: 'new',
          qty: String(l.qty),
          price: String(l.price),
          ref: l.ref,
          jonasRef: l.jonasRef || undefined,
          name: l.name,
          ean: l.ean,
          pcb: l.pcb ? String(l.pcb) : '',
          cbm: l.cbmCarton ? String(l.cbmCarton) : '',
          by: 'new',
          photo: l.photo,
        };
  });
}

const refKey = (r: string) => r.toUpperCase().replace(/[^A-Z0-9]/g, '');
/** Ligne « nouveau produit » dont la référence est en fait une référence JONAS existante */
export function jonasRefClash(l: EditLine, catalog: Product[]) {
  return l.productId === 'new' && !!l.ref?.trim() ? catalog.find((p) => refKey(p.ref) === refKey(l.ref!)) : undefined;
}

/** Lignes prêtes à enregistrer, ou null si incomplètes */
export function toImport(lines: EditLine[], catalog: Product[] = []): ImportLine[] | null {
  if (lines.some((l) => jonasRefClash(l, catalog))) return null;
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
      out.push({
        newProduct: { supplierRef: l.ref?.trim().toUpperCase() || undefined, ref: l.jonasRef?.trim().toUpperCase() || undefined, ean: l.ean || undefined, name: l.name.trim(), pcb, cbmCarton: cbm },
        qty,
        price,
      });
    }
  }
  return out;
}


/**
 * Enregistre les photos lues sur la proforma (stockage des fichiers du fournisseur) et les joint aux lignes à enregistrer.
 * `imported` : résultat de toImport(lines), dans le même ordre que les lignes renseignées.
 */
export async function withLinePhotos(lines: EditLine[], imported: ImportLine[], supplierId: string, tag: string): Promise<ImportLine[]> {
  const used = lines.filter((l) => l.productId);
  return Promise.all(
    imported.map(async (l, i) => {
      const photo = used[i]?.photo;
      if (!photo) return l;
      const fileId = newFileId(supplierScope(supplierId), `photo-${tag}`, i);
      await putBlob(fileId, photo);
      return { ...l, photo: { fileId, mime: photo.type || 'image/png' } };
    }),
  );
}
