import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { ProductPhoto } from '../data/types';
import { useBlobUrl } from '../lib/blobUrl';
import { useT } from '../i18n/context';

/** Photo en grand, plein écran : flèches pour passer d'une photo à l'autre, Échap ou clic pour fermer */
export default function PhotoLightbox({ photos, index, alt, onIndex, onClose }: { photos: ProductPhoto[]; index: number; alt: string; onIndex: (i: number) => void; onClose: () => void }) {
  const { t } = useT();
  const url = useBlobUrl(photos[index]?.fileId);
  const n = photos.length;
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && n > 1) onIndex((index + 1) % n);
      if (e.key === 'ArrowLeft' && n > 1) onIndex((index - 1 + n) % n);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [index, n, onIndex, onClose]);
  return createPortal(
    <div className="lightbox" role="dialog" aria-label={alt} onClick={onClose}>
      <button type="button" className="lb-close" aria-label={t('ph.close')} onClick={onClose}>
        <X size={26} />
      </button>
      {n > 1 && (
        <button
          type="button"
          className="lb-nav prev"
          aria-label={t('ph.prev')}
          onClick={(e) => {
            e.stopPropagation();
            onIndex((index - 1 + n) % n);
          }}
        >
          <ChevronLeft size={34} />
        </button>
      )}
      {url && <img src={url} alt={alt} onClick={(e) => e.stopPropagation()} />}
      {n > 1 && (
        <button
          type="button"
          className="lb-nav next"
          aria-label={t('ph.next')}
          onClick={(e) => {
            e.stopPropagation();
            onIndex((index + 1) % n);
          }}
        >
          <ChevronRight size={34} />
        </button>
      )}
      {n > 1 && (
        <div className="lb-count">
          {index + 1} / {n}
        </div>
      )}
    </div>,
    document.body,
  );
}
