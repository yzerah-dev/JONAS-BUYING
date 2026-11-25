import { useRef } from 'react';
import { Camera, Trash2 } from 'lucide-react';
import { useAuth, useStore } from '../data/store';
import type { Product } from '../data/types';
import { newFileId, putBlob, supplierScope } from '../lib/files';
import { toast } from './ui-shared';
import { useT } from '../i18n/context';

const IMAGE = /^image\/(png|jpe?g|webp|gif)$/;

/** Ajouter, changer ou retirer la photo d'un produit (équipe JONAS ; fournisseur pour ses produits) */
export default function ProductPhotoEdit({ product, compact }: { product: Product; compact?: boolean }) {
  const { dispatch } = useStore();
  const { allowed } = useAuth();
  const { t } = useT();
  const input = useRef<HTMLInputElement>(null);
  if (!allowed({ type: 'setProductPhoto', productId: product.id, photo: null })) return null;
  const pick = async (f?: File) => {
    if (!f) return;
    if (!IMAGE.test(f.type)) return toast(t('ph.badType'));
    if (f.size > 8 * 1024 * 1024) return toast(t('ph.tooBig'));
    const fileId = newFileId(supplierScope(product.supplierId), `photo-${product.id}`, 0);
    await putBlob(fileId, f);
    dispatch({ type: 'setProductPhoto', productId: product.id, photo: { fileId, mime: f.type } });
    toast(t('ph.saved', { ref: product.ref }));
  };
  return (
    <span className="row" style={{ gap: 6 }}>
      <label className="btn sm">
        <Camera size={14} /> {compact ? '' : product.photo ? t('ph.change') : t('ph.add')}
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          aria-label={`${product.photo ? t('ph.change') : t('ph.add')} ${product.ref}`}
          style={{ display: 'none' }}
          onChange={(e) => {
            pick(e.target.files?.[0]);
            if (input.current) input.current.value = '';
          }}
        />
      </label>
      {product.photo && !compact && (
        <button
          type="button"
          className="btn sm ghost"
          aria-label={`${t('ph.remove')} ${product.ref}`}
          onClick={() => {
            dispatch({ type: 'setProductPhoto', productId: product.id, photo: null });
            toast(t('ph.removed', { ref: product.ref }));
          }}
        >
          <Trash2 size={14} />
        </button>
      )}
    </span>
  );
}
