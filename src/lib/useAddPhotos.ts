import { useStore } from '../data/store';
import type { Product } from '../data/types';
import { photoProblem, storePhotos } from './productPhotos';
import { toast } from '../components/ui-shared';
import { useT } from '../i18n/context';

/** Ajoute des photos à un produit (contrôle des fichiers, enregistrement, galerie) */
export function useAddPhotos(product: Product) {
  const { dispatch } = useStore();
  const { t } = useT();
  return async (files: File[]) => {
    const ok = files.filter((f) => !photoProblem(f));
    const bad = files.find((f) => photoProblem(f));
    if (bad) toast(photoProblem(bad) === 'size' ? t('ph.tooBig') : t('ph.badType'));
    if (!ok.length) return;
    const stored = await storePhotos(product, ok);
    dispatch({ type: 'addProductPhotos', items: [{ productId: product.id, photos: stored }] });
    toast(t('ph.added', { n: ok.length, ref: product.ref }));
  };
}

