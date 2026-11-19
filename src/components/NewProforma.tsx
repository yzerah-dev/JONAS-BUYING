import { useState } from 'react';
import { Plus, Send, Trash2, X } from 'lucide-react';
import { currentUser, nextProformaId, supplierTerms, useAuth, useStore } from '../data/store';
import { isSupplier } from '../data/permissions';
import { newFileId, putBlob } from '../lib/files';
import { TODAY, addDays } from '../lib/format';
import { useT } from '../i18n';
import { toast } from './ui-shared';
import FileDrop from './FileDrop';

const OK_TYPES = ['application/pdf', 'image/png', 'image/jpeg'];
type Line = { productId: string; qty: string; price: string };
/** Prix saisi avec virgule ou point */
const toNum = (v: string) => Number(String(v).replace(',', '.').replace(/\s/g, ''));

/** Bouton « Nouvelle proforma » : côté JONAS (acheteurs, Direction) et côté fournisseur (avec sa proforma jointe) */
export function NewProformaButton({ onCreated, className = 'pf-btn' }: { onCreated?: (id: string) => void; className?: string }) {
  const { state } = useStore();
  const auth = useAuth();
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const me = currentUser(state);
  const sup = isSupplier(me);
  if (!sup && !auth.can('proforma.edit') && !auth.can('proforma.sign')) return null;
  return (
    <>
      <button className={className} onClick={() => setOpen(true)}>
        <Plus size={19} /> {t('np.new')}
      </button>
      {open && <NewProformaDialog onClose={() => setOpen(false)} onCreated={onCreated} />}
    </>
  );
}

function NewProformaDialog({ onClose, onCreated }: { onClose: () => void; onCreated?: (id: string) => void }) {
  const { state, dispatch } = useStore();
  const { t, fmt, td } = useT();
  const me = currentUser(state);
  const supplierSide = isSupplier(me);
  const id = nextProformaId(state);
  const [supplierId, setSupplierId] = useState(me.supplierId ?? state.suppliers.find((s) => s.active)?.id ?? '');
  const [title, setTitle] = useState('');
  const [etd, setEtd] = useState(addDays(TODAY, 70));
  const [eta, setEta] = useState(addDays(TODAY, 105));
  const [lines, setLines] = useState<Line[]>([{ productId: '', qty: '', price: '' }]);
  const [file, setFile] = useState<File | null>(null);
  const products = state.products.filter((p) => p.supplierId === supplierId);
  const terms = supplierTerms(state, supplierId);
  const currency = terms.currency;
  const total = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (toNum(l.price) || 0), 0);
  const setLine = (i: number, patch: Partial<Line>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return toast(t('np.needTitle'));
    const ls = lines
      .filter((l) => l.productId)
      .map((l) => ({ productId: l.productId, qty: Math.round(Number(l.qty)), price: toNum(l.price) }));
    if (!ls.length || ls.some((l) => !(l.qty > 0) || !(l.price >= 0))) return toast(t('np.needLines'));
    if (supplierSide && !file) return toast(t('np.needFile'));
    let f: { fileId: string; name: string; size: number; mime: string } | undefined;
    if (file) {
      const fileId = newFileId(id, 0);
      await putBlob(fileId, file);
      f = { fileId, name: file.name, size: file.size, mime: file.type };
    }
    dispatch({ type: 'createProforma', id, supplierId, title, etd, eta, lines: ls, file: f });
    toast(supplierSide ? t('np.createdSup', { id }) : t('np.createdJonas', { id }));
    onClose();
    onCreated?.(id);
  };

  return (
    <div className="palette-back" onMouseDown={onClose}>
      <form className="card rc-dialog bk-dialog np-dialog" role="dialog" aria-label={t('np.title', { id })} onMouseDown={(e) => e.stopPropagation()} onSubmit={submit}>
        <header className="rc-head">
          <div>
            <h2>{t('np.title', { id })}</h2>
            <span className="muted small">{supplierSide ? t('np.hintSup') : t('np.hintJonas')}</span>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t('np.close')}>
            <X size={20} />
          </button>
        </header>
        <div className="bk-form">
          {!supplierSide && (
            <label htmlFor="np-sup">
              {t('np.supplier')}
              <select
                id="np-sup"
                className="input"
                value={supplierId}
                onChange={(e) => {
                  setSupplierId(e.target.value);
                  setLines([{ productId: '', qty: '', price: '' }]);
                }}
              >
                {state.suppliers
                  .filter((s) => s.active)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <label htmlFor="np-title" className={supplierSide ? 'bk-wide' : ''}>
            {t('np.label')}
            <input id="np-title" className="input" placeholder={t('np.labelPh')} value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label htmlFor="np-etd">
            {t('np.etd')}
            <input
              id="np-etd"
              className="input"
              type="date"
              required
              value={etd}
              onChange={(e) => {
                setEtd(e.target.value);
                if (e.target.value) setEta(addDays(e.target.value, 35));
              }}
            />
          </label>
          <label htmlFor="np-eta">
            {t('np.eta')}
            <input id="np-eta" className="input" type="date" required value={eta} onChange={(e) => setEta(e.target.value)} />
          </label>
          <p className="bk-wide np-terms">{t('np.terms', { cur: terms.currency, dep: terms.depositPct, days: terms.balanceDays })}</p>

          <div className="bk-wide np-lines">
            <b className="small">{t('np.lines')}</b>
            {products.length === 0 && <p className="small muted">{t('np.noProducts')}</p>}
            {lines.map((l, i) => (
              <div key={i} className="np-line">
                <select aria-label={`${t('np.product')} ${i + 1}`} className="input" value={l.productId} onChange={(e) => setLine(i, { productId: e.target.value })}>
                  <option value="">{t('np.product')}…</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.ref} · {td(p.name)}
                    </option>
                  ))}
                </select>
                <input aria-label={`${t('np.qty')} ${i + 1}`} className="input" type="number" min={1} placeholder={t('np.qty')} value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} />
                <input
                  aria-label={`${t('np.price')} ${i + 1}`}
                  className="input"
                  inputMode="decimal"
                  placeholder={`${t('np.price')} (${currency})`}
                  value={l.price}
                  onChange={(e) => setLine(i, { price: e.target.value })}
                />
                <span className="np-amount">{fmt.num((Number(l.qty) || 0) * (toNum(l.price) || 0))}</span>
                <button type="button" className="icon-btn" aria-label={t('np.removeLine')} disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, j) => j !== i))}>
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <button type="button" className="btn sm" onClick={() => setLines([...lines, { productId: '', qty: '', price: '' }])}>
                <Plus size={14} /> {t('np.addLine')}
              </button>
              <b>
                {t('np.total')} : {fmt.num(total)} {currency}
              </b>
            </div>
          </div>

          <div className="bk-wide np-filebox">
            <span className="small bold">{supplierSide ? t('np.file') : t('np.fileOpt')}</span>
            <FileDrop
              ariaLabel={supplierSide ? t('np.file') : t('np.fileOpt')}
              current={file?.name}
              onFile={(f) => {
                if (!OK_TYPES.includes(f.type)) return toast(t('pv.badType'));
                setFile(f);
              }}
            />
          </div>
        </div>
        <footer className="rc-foot">
          <span />
          <button type="button" className="btn" onClick={onClose}>
            {t('np.cancel')}
          </button>
          <button type="submit" className="btn primary">
            {supplierSide ? <Send size={16} /> : <Plus size={16} />} {supplierSide ? t('np.send') : t('np.create')}
          </button>
        </footer>
      </form>
    </div>
  );
}
