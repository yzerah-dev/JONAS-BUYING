import { useState } from 'react';
import { Download, FileSpreadsheet, Loader2, X } from 'lucide-react';
import { canEditProduct, currentUser, PATCH_LABELS, productPatchErrors, purchasePrice, useStore } from '../data/store';
import type { Product, ProductPatch } from '../data/types';
import { exportProducts, readProductSheet, type SheetUpdate } from '../lib/productSheet';
import { saveBlob } from '../lib/files';
import { money } from '../lib/format';
import FileDrop from './FileDrop';
import { toast } from './ui-shared';

/** Valeur lisible d'un champ de fiche, avant / après */
function show(p: Product, k: keyof ProductPatch, patch: ProductPatch | null, s: ReturnType<typeof useStore>['state']): string {
  const v = patch ? patch[k] : k === 'paSupplier' ? purchasePrice(s, p.id) : p[k as keyof Product];
  if (v === undefined || v === null || v === '') return '—';
  if (k === 'paSupplier') {
    const x = v as { price: number; currency: string };
    return money(x.price, x.currency);
  }
  if (k === 'brandId') return s.brands.find((b) => b.id === v)?.name ?? String(v).toUpperCase();
  if (k === 'supplierId') return s.suppliers.find((x) => x.id === v)?.shortName ?? String(v);
  if (k === 'description') {
    const d = v as { fr?: string; en?: string };
    return [d.fr && `FR : ${d.fr}`, d.en && `EN : ${d.en}`].filter(Boolean).join(' · ').slice(0, 120) || '—';
  }
  return String(v);
}

/**
 * Fiches produit en Excel (Pilote, Direction, acheteurs) : export du catalogue affiché, à modifier dans Excel,
 * puis import avec aperçu des modifications avant de les appliquer.
 */
export default function ProductSheetImport({ products }: { products: Product[] }) {
  const { state, dispatch } = useStore();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<SheetUpdate | null>(null);
  const [file, setFile] = useState('');
  if (!canEditProduct(currentUser(state))) return null;
  const pa = (id: string) => purchasePrice(state, id);
  const errors = res ? productPatchErrors(state, res.items, res.brands) : [];
  const close = () => {
    setOpen(false);
    setRes(null);
    setFile('');
  };
  const doExport = async () => {
    const blob = await exportProducts(products, state, pa);
    const name = `fiches-produits-JONAS-${new Date().toISOString().slice(0, 10)}.xlsx`;
    const r = await saveBlob(blob, name);
    if (r === 'saved' || r === 'zipped') toast(`${products.length} fiche(s) exportée(s) : ${name}`);
  };
  const read = async (f: File) => {
    setBusy(true);
    setFile(f.name);
    setRes(await readProductSheet(f, state, pa).catch(() => ({ items: [], brands: [], notFound: [], problems: ['Fichier illisible : choisissez un Excel (.xlsx, .xls) ou un CSV'], unchanged: 0 })));
    setBusy(false);
  };
  const apply = () => {
    if (!res || errors.length || !res.items.length) return;
    dispatch({ type: 'updateProducts', items: res.items, brands: res.brands, source: 'excel' });
    toast(`${res.items.length} fiche(s) produit mise(s) à jour`);
    close();
  };
  return (
    <>
      <button type="button" className="btn" onClick={doExport}>
        <Download size={16} /> Exporter les fiches
      </button>
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        <FileSpreadsheet size={16} /> Importer les fiches
      </button>
      {open && (
        <div className="palette-back" onMouseDown={close}>
          <div className="card rc-dialog bk-dialog np-dialog" role="dialog" aria-label="Importer les fiches produit" onMouseDown={(e) => e.stopPropagation()}>
            <header className="rc-head">
              <div>
                <h2>Importer les fiches produit (Excel)</h2>
                <span className="muted small">
                  Partez de « Exporter les fiches », modifiez dans Excel, puis déposez le fichier. Chaque ligne est retrouvée par sa réf. JONAS (ou son EAN si la réf. change). Une cellule vide ne change rien. Le PA est dans la devise indiquée (EUR, USD, CNY).
                </span>
              </div>
              <button type="button" className="icon-btn" onClick={close} aria-label="Fermer">
                <X size={20} />
              </button>
            </header>
            <div className="bk-form">
              <div className="bk-wide">
                <FileDrop accept=".xlsx,.xls,.csv" ariaLabel="Fichier des fiches produit" label="Glissez-déposez l'Excel des fiches ici" hint="Choisir le fichier (xlsx, xls, csv)" current={file || undefined} onFile={read} />
              </div>
              {busy && (
                <span className="bk-wide small muted row" style={{ gap: 6 }}>
                  <Loader2 size={14} className="spin" /> Lecture…
                </span>
              )}
              {res && (
                <div className="bk-wide sheet-preview">
                  <p className="small bold">
                    {res.items.length} fiche(s) à modifier · {res.unchanged} inchangée(s)
                    {res.notFound.length ? ` · ${res.notFound.length} réf. inconnue(s)` : ''}
                  </p>
                  {[...errors, ...res.problems].map((e) => (
                    <p key={e} className="small red">
                      {e}
                    </p>
                  ))}
                  {res.notFound.map((e) => (
                    <p key={e} className="small orange">
                      Produit introuvable — {e}
                    </p>
                  ))}
                  {res.brands.length > 0 && <p className="small">Nouvelle(s) marque(s) : {res.brands.map((b) => b.name).join(', ')}</p>}
                  <div className="pi-table">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Produit</th>
                          <th>Champ</th>
                          <th>Avant</th>
                          <th>Après</th>
                        </tr>
                      </thead>
                      <tbody>
                        {res.items.flatMap(({ productId, patch }) => {
                          const p = state.products.find((x) => x.id === productId)!;
                          return (Object.keys(patch) as (keyof ProductPatch)[]).map((k, i) => (
                            <tr key={`${productId}-${k}`}>
                              <td className="small bold">{i === 0 ? p.ref : ''}</td>
                              <td className="small">{PATCH_LABELS[k]}</td>
                              <td className="small muted">{show(p, k, null, state)}</td>
                              <td className="small">{show(p, k, patch, state)}</td>
                            </tr>
                          ));
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
            <footer className="rc-foot">
              <span />
              <button type="button" className="btn" onClick={close}>
                Annuler
              </button>
              <button type="button" className="btn primary" disabled={!res || !res.items.length || errors.length > 0} onClick={apply}>
                <FileSpreadsheet size={16} /> Appliquer {res?.items.length ?? 0} fiche(s)
              </button>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
