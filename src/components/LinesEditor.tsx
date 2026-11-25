import { Plus, Trash2 } from 'lucide-react';
import { ProductPic } from './ui';
import { jonasCodesFor, useStore } from '../data/store';
import { emptyLine, jonasRefClash, toNum, type EditLine } from '../lib/editLines';
import { useT } from '../i18n';
import Combobox from './Combobox';

/** Éditeur de lignes : produit (saisie avec suggestions ou nouveau produit), quantité, prix, montant */
export default function LinesEditor({ supplierId, currency, lines, setLines }: { supplierId: string; currency: string; lines: EditLine[]; setLines: (l: EditLine[]) => void }) {
  const { state } = useStore();
  const { t, fmt, td } = useT();
  const products = state.products.filter((p) => p.supplierId === supplierId);
  // Produits JONAS d'un autre fournisseur reconnus par leur référence : proposés aussi
  const others = state.products.filter((p) => p.supplierId !== supplierId && lines.some((l) => l.productId === p.id));
  const options = [
    { id: 'new', label: t('ex.newProduct') },
    ...[...products, ...others].map((p) => ({ id: p.id, label: `${p.ref} · ${td(p.name)}`, keywords: `${p.ean} ${p.supplierRef ?? ''}` })),
  ];
  // Codes JONAS qui seront attribués aux nouveaux produits, dans l'ordre des lignes
  const codes = jonasCodesFor(state, supplierId, lines.filter((l) => l.productId === 'new').map((l) => ({ ref: l.jonasRef, ean: l.ean })));
  const codeOf = (i: number) => codes[lines.slice(0, i).filter((l) => l.productId === 'new').length];
  const set = (i: number, patch: Partial<EditLine>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const total = lines.reduce((s, l) => s + (toNum(l.qty) || 0) * (toNum(l.price) || 0), 0);
  const badge = (l: EditLine) =>
    l.by === 'ref' ? (
      <span className="pill green">
        {t('ex.matchRef')}
        {state.products.find((p) => p.id === l.productId && p.supplierId !== supplierId) ? ` · ${t('ex.otherSupplier')}` : ''}
      </span>
    ) : l.by === 'ean' ? (
      <span className="pill green">{t('ex.matchEan')}</span>
    ) : l.by === 'nom' ? (
      <span className="pill orange">{t('ex.matchName')}</span>
    ) : l.productId === 'new' ? (
      <span className="pill violet">{t('ex.new')}</span>
    ) : null;
  return (
    <div className="np-lines">
      <b className="small">{t('np.lines')}</b>
      {lines.map((l, i) => (
        <div key={i} className={`np-line-wrap ${l.productId === 'new' ? 'is-new' : ''}`}>
          <div className="np-line">
            <div className="np-prod">
              <Combobox
                id={`ln-prod-${i}`}
                value={l.productId}
                options={options}
                placeholder={t('ex.search')}
                onChange={(v) => set(i, { productId: v, by: v === 'new' ? 'new' : undefined })}
              />
              {badge(l)}
              {l.photo && (
                <span className="np-photo" title={t('ph.fromDoc')}>
                  <ProductPic product={{ emoji: '', name: t('ph.fromDoc') }} src={l.photo} />
                </span>
              )}
            </div>
            <input aria-label={`${t('np.qty')} ${i + 1}`} className="input" inputMode="numeric" placeholder={t('np.qty')} value={l.qty} onChange={(e) => set(i, { qty: e.target.value })} />
            <input aria-label={`${t('np.price')} ${i + 1}`} className="input" inputMode="decimal" placeholder={`${t('np.price')} (${currency})`} value={l.price} onChange={(e) => set(i, { price: e.target.value })} />
            <span className="np-amount">{fmt.num((toNum(l.qty) || 0) * (toNum(l.price) || 0))}</span>
            <button type="button" className="icon-btn" aria-label={t('np.removeLine')} disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, j) => j !== i))}>
              <Trash2 size={16} />
            </button>
          </div>
          {jonasRefClash(l, state.products) && (
            <div className="np-clash small">
              {t('ex.clash', { ref: jonasRefClash(l, state.products)!.ref, name: td(jonasRefClash(l, state.products)!.name) })}{' '}
              <button type="button" className="btn sm" onClick={() => set(i, { productId: jonasRefClash(l, state.products)!.id, by: 'ref' })}>
                {t('ex.useIt')}
              </button>
            </div>
          )}
          {l.productId === 'new' && (
            <div className="np-codes small">
              {t('ex.jonasCodes', { ref: codeOf(i)?.ref ?? '', ean: codeOf(i)?.ean ?? '' })}
            </div>
          )}
          {l.productId === 'new' && (
            <div className="np-new">
              <input aria-label={`${t('ex.ref')} ${i + 1}`} className="input" placeholder={t('ex.ref')} value={l.ref ?? ''} onChange={(e) => set(i, { ref: e.target.value })} />
              <input aria-label={`${t('ex.name')} ${i + 1}`} className="input" placeholder={t('ex.name')} value={l.name ?? ''} onChange={(e) => set(i, { name: e.target.value })} />
              <input aria-label={`${t('ex.pcb')} ${i + 1}`} className="input" inputMode="numeric" placeholder={t('ex.pcb')} value={l.pcb ?? ''} onChange={(e) => set(i, { pcb: e.target.value })} />
              <input aria-label={`${t('ex.cbm')} ${i + 1}`} className="input" inputMode="decimal" placeholder={t('ex.cbm')} value={l.cbm ?? ''} onChange={(e) => set(i, { cbm: e.target.value })} />
            </div>
          )}
        </div>
      ))}
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <button type="button" className="btn sm" onClick={() => setLines([...lines, emptyLine()])}>
          <Plus size={14} /> {t('np.addLine')}
        </button>
        <b>
          {t('np.total')} : {fmt.num(total)} {currency}
        </b>
      </div>
    </div>
  );
}
