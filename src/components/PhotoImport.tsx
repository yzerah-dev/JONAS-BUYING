import { useState } from 'react';
import { Images, Loader2, X } from 'lucide-react';
import { useAuth, useStore } from '../data/store';
import type { Product, ProductPhoto } from '../data/types';
import { matchPhotoFiles, PHOTO_ACCEPT, storePhotos, type PhotoMatch } from '../lib/productPhotos';
import FileDrop from './FileDrop';
import { toast } from './ui-shared';
import { useT } from '../i18n/context';

/**
 * Import de photos en lot : les fichiers sont rapprochés des produits par leur nom (réf. JONAS, EAN, réf. fournisseur),
 * vérifiés dans un tableau, puis ajoutés à la galerie de chaque produit.
 * `products` : produits visibles et modifiables (fournisseur : les siens).
 */
export default function PhotoImport({ products }: { products: Product[] }) {
  const { dispatch } = useStore();
  const { allowed } = useAuth();
  const { t, td } = useT();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<PhotoMatch[]>([]);
  const [saving, setSaving] = useState(false);
  const editable = products.filter((p) => allowed({ type: 'setProductPhotos', productId: p.id, photos: [] }));
  if (!editable.length) return null;
  const ok = rows.filter((r) => r.product && !r.problem);
  const n = new Set(ok.map((r) => r.product!.id)).size;
  const close = () => {
    setOpen(false);
    setRows([]);
  };
  const save = async () => {
    setSaving(true);
    const groups = new Map<string, { product: Product; files: File[] }>();
    for (const r of ok) {
      const g = groups.get(r.product!.id) ?? { product: r.product!, files: [] };
      g.files.push(r.file);
      groups.set(r.product!.id, g);
    }
    const items: { productId: string; photos: ProductPhoto[] }[] = [];
    for (const g of groups.values()) items.push({ productId: g.product.id, photos: await storePhotos(g.product, g.files) });
    dispatch({ type: 'addProductPhotos', items });
    setSaving(false);
    toast(t('pi.done', { ok: ok.length, n }));
    close();
  };
  const how = (r: PhotoMatch) => (r.by === 'ean' ? t('pi.byEan') : r.by === 'refFournisseur' ? t('pi.bySup') : t('pi.byRef'));
  return (
    <>
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        <Images size={16} /> {t('pi.button')}
      </button>
      {open && (
        <div className="palette-back" onMouseDown={close}>
          <div className="card rc-dialog bk-dialog np-dialog" role="dialog" aria-label={t('pi.title')} onMouseDown={(e) => e.stopPropagation()}>
            <header className="rc-head">
              <div>
                <h2>{t('pi.title')}</h2>
                <span className="muted small">{t('pi.hint')}</span>
              </div>
              <button type="button" className="icon-btn" onClick={close} aria-label={t('pi.cancel')}>
                <X size={20} />
              </button>
            </header>
            <div className="bk-form">
              <div className="bk-wide">
                <FileDrop multiple accept={PHOTO_ACCEPT} label={t('pi.drop')} hint={t('pi.choose')} ariaLabel={t('pi.title')} onFiles={(fs) => setRows(matchPhotoFiles([...rows.map((r) => r.file), ...fs], editable))} />
              </div>
              {rows.length > 0 && (
                <div className="bk-wide">
                  <p className="small bold">{t('pi.summary', { ok: ok.length, n, ko: rows.length - ok.length })}</p>
                  <div className="pi-table">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>{t('pi.file')}</th>
                          <th>{t('pi.product')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r, i) => (
                          <tr key={`${r.file.name}-${i}`} className={r.product && !r.problem ? '' : 'pi-ko'}>
                            <td className="small">{r.file.name}</td>
                            <td className="small">
                              {r.problem ? (
                                <span className="red">{t('pi.badFile')}</span>
                              ) : r.product ? (
                                <>
                                  <b>{r.product.ref}</b> · {td(r.product.name).slice(0, 50)} <span className="muted">({how(r)})</span>
                                </>
                              ) : (
                                <span className="red">{t('pi.unknown')}</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
            <footer className="rc-foot">
              <span />
              <button type="button" className="btn" onClick={close}>
                {t('pi.cancel')}
              </button>
              <button type="button" className="btn primary" disabled={!ok.length || saving} onClick={save}>
                {saving ? <Loader2 size={16} className="spin" /> : <Images size={16} />} {saving ? t('pi.saving') : t('pi.import', { ok: ok.length })}
              </button>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
