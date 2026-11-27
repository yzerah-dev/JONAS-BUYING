import type { ProductPhoto } from '../data/types';
import { getBlob, newFileId, putBlob } from './files';

/** Champ prix (décimal, virgule acceptée) */
export const parsePrice = (v: string) => {
  const n = Number(v.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 10000) / 10000 : 0;
};

/** Photos d'une demande de prix recopiées dans l'espace de chaque fournisseur interrogé (il ne lit que ses propres fichiers) */
export async function copyPhotosTo(scope: string, photos: ProductPhoto[]): Promise<ProductPhoto[]> {
  const out: ProductPhoto[] = [];
  for (const [i, ph] of photos.entries()) {
    const blob = await getBlob(ph.fileId);
    if (!blob) continue;
    const fileId = newFileId(scope, 'demande-prix', i);
    await putBlob(fileId, blob);
    out.push({ fileId, mime: ph.mime });
  }
  return out;
}
