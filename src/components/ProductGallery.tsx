import { useRef, useState } from 'react';
import { ImagePlus, Star, Trash2 } from 'lucide-react';
import { allPhotos, useAuth, useStore } from '../data/store';
import type { Product, ProductPhoto } from '../data/types';
import { PHOTO_ACCEPT } from '../lib/productPhotos';
import { useAddPhotos } from '../lib/useAddPhotos';
import { useBlobUrl } from '../lib/blobUrl';
import { toast } from './ui-shared';
import { useT } from '../i18n/context';

function Thumb({ photo, alt, active, onClick }: { photo: ProductPhoto; alt: string; active: boolean; onClick: () => void }) {
  const url = useBlobUrl(photo.fileId);
  return (
    <button type="button" className={`gal-thumb ${active ? 'active' : ''}`} onClick={onClick} aria-label={alt} aria-pressed={active}>
      {url && <img src={url} alt="" />}
    </button>
  );
}

/**
 * Galerie de la fiche produit : grande photo (on peut y glisser-déposer des photos), vignettes,
 * photo principale (étoile), suppression. Sans droit de modification : consultation seule.
 */
export default function ProductGallery({ product }: { product: Product }) {
  const { dispatch } = useStore();
  const { allowed } = useAuth();
  const { t } = useT();
  const photos = allPhotos(product);
  const [sel, setSel] = useState(0);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const cur = photos[Math.min(sel, photos.length - 1)];
  const url = useBlobUrl(cur?.fileId);
  const canEdit = allowed({ type: 'setProductPhotos', productId: product.id, photos: [] });
  const add = useAddPhotos(product);
  const setList = (list: ProductPhoto[]) => dispatch({ type: 'setProductPhotos', productId: product.id, photos: list });
  const idx = Math.min(sel, photos.length - 1);

  return (
    <div className="gallery-box">
      <div
        className={`thumb gal-main ${over ? 'over' : ''}`}
        style={{ background: product.tint }}
        onDragOver={(e) => {
          if (!canEdit) return;
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          if (!canEdit) return;
          e.preventDefault();
          setOver(false);
          add([...e.dataTransfer.files]);
        }}
        aria-label={t('ph.dropOn', { ref: product.ref })}
      >
        {url ? <img className="product-pic" src={url} alt={product.name} /> : <span className="gal-emoji">{product.emoji}</span>}
        {over && <div className="gal-over">{t('ph.dropHere')}</div>}
        {idx === 0 && photos.length > 1 && <span className="gal-badge">{t('ph.main')}</span>}
      </div>
      {(photos.length > 1 || canEdit) && (
        <div className="gal-strip">
          {photos.map((p, i) => (
            <Thumb key={p.fileId} photo={p} alt={t('ph.view', { n: i + 1 })} active={i === idx} onClick={() => setSel(i)} />
          ))}
          {canEdit && (
            <label className="gal-thumb gal-add" title={t('ph.addMany')}>
              <ImagePlus size={18} />
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
          )}
        </div>
      )}
      {canEdit && cur && (
        <div className="row" style={{ gap: 6, justifyContent: 'center' }}>
          {idx > 0 && (
            <button
              type="button"
              className="btn sm"
              onClick={() => {
                setList([cur, ...photos.filter((_, i) => i !== idx)]);
                setSel(0);
                toast(t('ph.mainSet', { ref: product.ref }));
              }}
            >
              <Star size={14} /> {t('ph.makeMain')}
            </button>
          )}
          <button
            type="button"
            className="btn sm ghost"
            aria-label={`${t('ph.remove')} ${product.ref}`}
            onClick={() => {
              setList(photos.filter((_, i) => i !== idx));
              setSel(Math.max(0, idx - 1));
              toast(t('ph.removed', { ref: product.ref }));
            }}
          >
            <Trash2 size={14} /> {t('ph.remove')}
          </button>
        </div>
      )}
      {canEdit && !photos.length && <small className="muted">{t('ph.dropHint')}</small>}
    </div>
  );
}
