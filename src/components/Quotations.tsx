import { useRef, useState, type ReactNode } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { byId, lastCounter, useStore } from '../data/store';
import type { ProductPhoto, Quotation } from '../data/types';
import { newFileId, putBlob } from '../lib/files';
import { PHOTO_ACCEPT, photoProblem } from '../lib/productPhotos';
import { useBlobUrl } from '../lib/blobUrl';
import { money } from '../lib/format';
import { useT } from '../i18n/context';
import { ProductPic, SupplierLogo } from './ui';
import { toast } from './ui-shared';

/** Couleur du statut d'une offre */
// Orange = à vous d'agir, bleu = en attente de l'autre partie (le point de vue change entre JONAS et le portail)
const ACTION = '#e0701a';
const WAITING = '#2f6fed';
const QUOTE_COLOR: Record<Quotation['status'], string> = { demande: WAITING, en_attente: ACTION, negociation: WAITING, acceptee: '#12896c', refusee: '#8a94a6' };
const colorOf = (status: Quotation['status'], portal: boolean) =>
  portal && (status === 'demande' || status === 'negociation') ? ACTION : portal && status === 'en_attente' ? WAITING : QUOTE_COLOR[status];

function Thumb({ photo, onRemove, label }: { photo: ProductPhoto; onRemove?: () => void; label: string }) {
  const url = useBlobUrl(photo.fileId);
  return (
    <span className="qt-thumb">
      {url && <img src={url} alt={label} />}
      {onRemove && (
        <button type="button" className="qt-thumb-x" aria-label={`Retirer ${label}`} onClick={onRemove}>
          <X size={12} />
        </button>
      )}
    </span>
  );
}

/** Dépôt de photos d'une offre (jusqu'à 10), rangées dans l'espace du fournisseur */
export function QuotePhotosInput({ scope, photos, onChange }: { scope: string; photos: ProductPhoto[]; onChange: (p: ProductPhoto[]) => void }) {
  const { t } = useT();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const add = async (files: File[]) => {
    const ok = files.filter((f) => !photoProblem(f));
    if (ok.length < files.length) toast(t('q.photoBad'));
    if (!ok.length) return;
    setBusy(true);
    try {
      const out: ProductPhoto[] = [];
      for (const [i, f] of ok.slice(0, 10 - photos.length).entries()) {
        const fileId = newFileId(scope, 'offre', i);
        await putBlob(fileId, f);
        out.push({ fileId, mime: f.type || 'image/jpeg' });
      }
      onChange([...photos, ...out]);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      className="qt-photos"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        add([...e.dataTransfer.files]);
      }}
    >
      {photos.map((ph, i) => (
        <Thumb key={ph.fileId} photo={ph} label={`photo ${i + 1}`} onRemove={() => onChange(photos.filter((x) => x !== ph))} />
      ))}
      {photos.length < 10 && (
        <button type="button" className="qt-add" disabled={busy} onClick={() => input.current?.click()}>
          <ImagePlus size={22} />
          <span>{t('q.addPhotos')}</span>
        </button>
      )}
      <input ref={input} type="file" hidden multiple accept={PHOTO_ACCEPT} aria-label={t('q.addPhotos')} onChange={(e) => (add([...(e.target.files ?? [])]), (e.target.value = ''))} />
    </div>
  );
}

/** Carte d'une offre : photo, fournisseur, désignation, prix (devise du fournisseur), statut ; actions en bas */
export function QuoteCard({ q, showSupplier = true, best, children }: { q: Quotation; showSupplier?: boolean; best?: boolean; children?: ReactNode }) {
  const { state } = useStore();
  const { t, fmt } = useT();
  const sup = byId(state.suppliers, q.supplierId);
  const [photo, ...more] = q.photos;
  const [big, setBig] = useState<ProductPhoto | undefined>();
  const shown = big ?? photo;
  // Réf. JONAS du produit d'origine : seulement s'il est chez ce même fournisseur (un autre fournisseur ne voit pas notre catalogue)
  const src = q.sourceProductId ? state.products.find((p) => p.id === q.sourceProductId && p.supplierId === q.supplierId) : undefined;
  const counter = lastCounter(q);
  return (
    <div className={`card qt-card qt-${q.status}`} data-testid={`quote-${q.id}`}>
      <div className="qt-hero">
        <ProductPic product={{ emoji: q.emoji ?? '📦', photo: shown, name: q.name }} />
        <span className="qt-status" style={{ background: colorOf(q.status, !showSupplier) }}>
          {q.status === 'refusee' && q.refusedBy === 'fournisseur' ? t('q.declinedBySupplier') : t(`q.status.${q.status}`)}
        </span>
        {best && <span className="qt-best">★ Meilleur prix</span>}
      </div>
      {more.length > 0 && (
        <div className="qt-strip">
          {q.photos.map((ph, i) => (
            <button key={ph.fileId} type="button" className={shown === ph ? 'on' : ''} onClick={() => setBig(ph)} aria-label={`photo ${i + 1}`}>
              <Thumb photo={ph} label={`photo ${i + 1}`} />
            </button>
          ))}
        </div>
      )}
      <div className="qt-body">
        {showSupplier && (
          <div className="qt-sup">
            <SupplierLogo supplier={sup} size={34} />
            <b>{sup.shortName}</b>
          </div>
        )}
        <div className="qt-name">{q.name}</div>
        <div className="qt-price">
          {q.price ? money(q.price, q.currency) : <span className="muted">—</span>}
          {!!q.targetPrice && <small>{t('q.target', { p: money(q.targetPrice, q.currency) })}</small>}
        </div>
        <div className="qt-meta xs muted">
          <span className="qt-origin">{q.origin === 'rfq' ? t('q.origin.rfq') : t('q.origin.spont')}</span>
          {' · '}
          {q.origin === 'rfq' ? t('q.requestedOn', { d: fmt.fdate(q.createdAt.slice(0, 10)) }) : t('q.sentOn', { d: fmt.fdate(q.createdAt.slice(0, 10)) })}
        </div>
        {(!!q.qty || src) && (
          <div className="qt-meta small">
            {!!q.qty && <b>{t('q.qty', { n: fmt.num(q.qty) })}</b>}
            {!!q.qty && src && ' · '}
            {src && <span className="ref-tag">{t('q.product', { ref: src.ref })}</span>}
          </div>
        )}
        {q.note && <div className="qt-note small">{q.note}</div>}
        {!!q.rounds?.length && (q.rounds.length > 1 || q.rounds[0].by === 'jonas') && (
          <div className="qt-rounds" aria-label={t('q.history')}>
            {q.rounds.map((r, i) => [
              i > 0 && (
                <span key={`a${i}`} className="qt-arrow" aria-hidden>
                  →
                </span>
              ),
              <span key={i} className={`qt-round ${r.by}`} title={`${r.who} · ${fmt.fdate(r.at.slice(0, 10))}${r.note ? ` · ${r.note}` : ''}`}>
                <small>{t(`q.by.${r.by}`)}</small> {money(r.price, q.currency)}
                {r.agreed && <em> ✓ {t('q.agreed')}</em>}
              </span>,
            ])}
          </div>
        )}
        {q.status === 'negociation' && counter && (
          <div className="qt-counter">
            {t('q.counter', { p: money(counter.price, q.currency) })}
            {counter.note ? ` · ${counter.note}` : ''}
          </div>
        )}
        {q.reason && <div className="qt-note small">{t('q.reason', { r: q.reason })}</div>}
        {q.status === 'acceptee' && q.productId && (
          <div className="small" style={{ color: QUOTE_COLOR.acceptee, fontWeight: 600 }}>
            {t('q.accepted', { ref: q.productId })}
          </div>
        )}
      </div>
      {children && <div className="qt-actions">{children}</div>}
    </div>
  );
}
