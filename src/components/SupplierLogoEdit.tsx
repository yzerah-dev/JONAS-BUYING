import { useRef, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { useStore } from '../data/store';
import type { Supplier } from '../data/types';
import { newFileId, putBlob, supplierScope } from '../lib/files';
import { PHOTO_ACCEPT, photoProblem } from '../lib/productPhotos';
import { useT } from '../i18n/context';
import { SupplierLogo } from './ui';
import { toast } from './ui-shared';

/** Dépôt du logo d'un fournisseur (portail fournisseur et fiche fournisseur côté JONAS) */
export function SupplierLogoEdit({ supplier, size = 76, showHint = true }: { supplier: Supplier; size?: number; showHint?: boolean }) {
  const { dispatch } = useStore();
  const { t } = useT();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const pick = async (f: File | undefined) => {
    if (!f) return;
    if (photoProblem(f)) return toast(t('logo.bad'));
    setBusy(true);
    try {
      const fileId = newFileId(supplierScope(supplier.id), 'logo', 0);
      await putBlob(fileId, f);
      dispatch({ type: 'setSupplierLogo', supplierId: supplier.id, logo: { fileId, mime: f.type || 'image/png' } });
      toast(t('logo.saved'));
    } catch {
      toast(t('logo.fail'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="slogo-edit">
      <input ref={input} type="file" hidden accept={PHOTO_ACCEPT} aria-label={t('logo.title')} onChange={(e) => (pick(e.target.files?.[0]), (e.target.value = ''))} />
      <button type="button" className="slogo-drop" onClick={() => input.current?.click()} disabled={busy} aria-label={supplier.logo ? t('logo.change') : t('logo.add')}>
        <SupplierLogo supplier={supplier} size={size} />
      </button>
      <div style={{ display: 'grid', gap: 8, flex: '1 1 220px' }}>
        {showHint && (
          <div>
            <b>{t('logo.title')}</b>
            <div className="small muted">{t('logo.hint')}</div>
          </div>
        )}
        <div className="slogo-actions">
          <button type="button" className="btn primary" disabled={busy} onClick={() => input.current?.click()}>
            <ImagePlus size={16} /> {supplier.logo ? t('logo.change') : t('logo.add')}
          </button>
          {supplier.logo && (
            <button
              type="button"
              className="btn ghost"
              disabled={busy}
              onClick={() => {
                dispatch({ type: 'setSupplierLogo', supplierId: supplier.id, logo: null });
                toast(t('logo.removed'));
              }}
            >
              <Trash2 size={16} /> {t('logo.remove')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
