import { useRef } from 'react';
import { Camera } from 'lucide-react';
import { useAuth } from '../data/store';
import type { Product } from '../data/types';
import { PHOTO_ACCEPT } from '../lib/productPhotos';
import { useAddPhotos } from '../lib/useAddPhotos';
import { useT } from '../i18n/context';

/** Bouton compact (listes, portail fournisseur) : ajouter une ou plusieurs photos au produit */
export default function ProductPhotoEdit({ product }: { product: Product }) {
  const { allowed } = useAuth();
  const { t } = useT();
  const input = useRef<HTMLInputElement>(null);
  const add = useAddPhotos(product);
  if (!allowed({ type: 'setProductPhotos', productId: product.id, photos: [] })) return null;
  return (
    <label className="btn sm" title={t('ph.addMany')}>
      <Camera size={14} />
      <input
        ref={input}
        type="file"
        multiple
        accept={PHOTO_ACCEPT}
        aria-label={`${t('ph.addMany')} ${product.ref}`}
        style={{ display: 'none' }}
        onChange={(e) => {
          add([...(e.target.files ?? [])]);
          if (input.current) input.current.value = '';
        }}
      />
    </label>
  );
}
