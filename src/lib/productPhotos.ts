// Photos produit : contrôle des fichiers, enregistrement, et rapprochement d'un lot de photos avec les produits
// d'après le nom du fichier (référence JONAS, EAN ou référence fournisseur : « LTM007.jpg », « LTM007-2.jpg »…).
import type { Product, ProductPhoto } from '../data/types';
import { newFileId, putBlob, supplierScope } from './files';

export const PHOTO_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif';
export const PHOTO_MAX = 8 * 1024 * 1024;
const IMAGE = /^image\/(png|jpe?g|webp|gif)$/;
const EXT = /\.(png|jpe?g|webp|gif)$/i;

export type PhotoProblem = 'type' | 'size';
/** Fichier refusé (format, taille), sinon null */
export function photoProblem(f: File): PhotoProblem | null {
  if (!IMAGE.test(f.type) && !(f.type === '' && EXT.test(f.name))) return 'type';
  if (f.size > PHOTO_MAX) return 'size';
  return null;
}

const mimeOf = (f: File) => f.type || (/\.png$/i.test(f.name) ? 'image/png' : /\.webp$/i.test(f.name) ? 'image/webp' : /\.gif$/i.test(f.name) ? 'image/gif' : 'image/jpeg');

/** Enregistre des photos d'un produit (dossier du fournisseur dans le stockage) */
export async function storePhotos(p: Pick<Product, 'id' | 'supplierId'>, files: File[]): Promise<ProductPhoto[]> {
  const out: ProductPhoto[] = [];
  for (const [i, f] of files.entries()) {
    const fileId = newFileId(supplierScope(p.supplierId), `photo-${p.id}`, i);
    await putBlob(fileId, f);
    out.push({ fileId, mime: mimeOf(f) });
  }
  return out;
}

const key = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

export interface PhotoMatch {
  file: File;
  product?: Product;
  /** Comment le produit a été reconnu */
  by?: 'ref' | 'ean' | 'refFournisseur';
  problem?: PhotoProblem;
}

/**
 * Rapproche chaque photo d'un produit d'après son nom : « LTM007.jpg », « LTM007-2.jpg », « LTM007_dos.png »,
 * « 3701571431633.jpg » (EAN) ou « 71726 (1).jpg » (réf. fournisseur). Les photos d'un même produit
 * sont rangées par nom, celle sans suffixe en premier.
 */
export function matchPhotoFiles(files: File[], products: Product[]): PhotoMatch[] {
  const byRef = new Map(products.map((p) => [key(p.ref), p]));
  const byEan = new Map(products.filter((p) => p.ean).map((p) => [p.ean, p]));
  const bySup = new Map<string, Product | null>();
  for (const p of products) {
    if (!p.supplierRef) continue;
    const k = key(p.supplierRef);
    bySup.set(k, bySup.has(k) ? null : p); // même réf. chez deux fournisseurs : ambigu
  }
  const find = (stem: string): Pick<PhotoMatch, 'product' | 'by'> => {
    const k = key(stem);
    if (!k) return {};
    if (byRef.has(k)) return { product: byRef.get(k), by: 'ref' };
    const digits = stem.replace(/\D/g, '');
    if (digits.length >= 8 && byEan.has(digits) && /^\D*\d+\D*$/.test(stem)) return { product: byEan.get(digits), by: 'ean' };
    const sup = bySup.get(k);
    if (sup) return { product: sup, by: 'refFournisseur' };
    return {};
  };
  // Tri par nom sans extension : « LTM007 » avant « LTM007-2 » (la photo sans suffixe devient la principale)
  const stemOf = (f: File) => f.name.replace(/\.[^.]+$/, '');
  const sorted = [...files].sort((a, b) => stemOf(a).localeCompare(stemOf(b), 'fr', { numeric: true }));
  return sorted.map((file) => {
    const problem = photoProblem(file) ?? undefined;
    const stem = file.name.replace(/\.[^.]+$/, '').trim();
    // Nom complet, puis sans suffixe : « -2 », « _1 », « (3) », « dos », « _detail »…
    let m = find(stem);
    if (!m.product) {
      const parts = stem.split(/[\s_]+|-(?=[^-]*$)|\(/);
      for (let n = parts.length - 1; n >= 1 && !m.product; n--) m = find(parts.slice(0, n).join(' '));
    }
    return { file, ...m, problem };
  });
}
