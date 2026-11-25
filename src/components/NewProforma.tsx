import { useState } from 'react';
import { Loader2, Plus, Send, X } from 'lucide-react';
import { currentUser, nextProformaId, supplierTerms, useAuth, useStore } from '../data/store';
import { isSupplier } from '../data/permissions';
import { newFileId, putBlob, supplierScope } from '../lib/files';
import { TODAY, addDays } from '../lib/format';
import { useT } from '../i18n';
import { toast } from './ui-shared';
import FileDrop from './FileDrop';
import Combobox from './Combobox';
import LinesEditor from './LinesEditor';
import { emptyLine, fromExtraction, toImport, type EditLine } from '../lib/editLines';
import { extractProforma } from '../lib/proformaExtract';
import { isSheet, readSheet } from '../lib/excelImport';
import { Seg } from './ui';

const OK_TYPES = ['application/pdf', 'image/png', 'image/jpeg'];

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
        <Plus size={19} /> {sup ? t('np.new') : t('po.newOrder')}
      </button>
      {open && <NewProformaDialog onClose={() => setOpen(false)} onCreated={onCreated} />}
    </>
  );
}

function NewProformaDialog({ onClose, onCreated }: { onClose: () => void; onCreated?: (id: string) => void }) {
  const { state, dispatch } = useStore();
  const { t } = useT();
  const me = currentUser(state);
  const supplierSide = isSupplier(me);
  const id = nextProformaId(state);
  const [supplierId, setSupplierId] = useState(me.supplierId ?? state.suppliers.find((s) => s.active)?.id ?? '');
  const [title, setTitle] = useState('');
  const [etd, setEtd] = useState(addDays(TODAY, 70));
  const [eta, setEta] = useState(addDays(TODAY, 105));
  const [lines, setLines] = useState<EditLine[]>([emptyLine()]);
  const [file, setFile] = useState<File | null>(null);
  const [reading, setReading] = useState(false);
  // Commande JONAS : articles saisis, importés d'un Excel, ou d'un bon de commande TCI (PDF)
  const [source, setSource] = useState<'saisie' | 'excel' | 'bc'>('saisie');
  const [orderFile, setOrderFile] = useState<File | null>(null);
  const products = state.products.filter((p) => p.supplierId === supplierId);
  const terms = supplierTerms(state, supplierId);
  const currency = terms.currency;
  // Proforma jointe : on lit ses lignes et on les rapproche des produits du fournisseur
  const attach = async (f: File) => {
    if (!OK_TYPES.includes(f.type)) return toast(t('pv.badType'));
    setFile(f);
    setReading(true);
    const ex = await extractProforma(f, f.type).catch(() => ({ lines: [], engine: 'aucun' as const }));
    setReading(false);
    if (ex.lines.length) {
      setLines(fromExtraction(ex.lines, products, state.products));
      toast(t('ex.found', { n: ex.lines.length }));
    } else toast(t('ex.none'));
  };

  const importOrder = async (f: File) => {
    const ok = source === 'excel' ? isSheet(f) : f.type === 'application/pdf';
    if (!ok) return toast(source === 'excel' ? t('po.excelHint') : t('pv.badType'));
    setOrderFile(f);
    setReading(true);
    const read = source === 'excel' ? await readSheet(f).catch(() => []) : (await extractProforma(f, f.type).catch(() => ({ lines: [] }))).lines;
    setReading(false);
    if (read.length) {
      setLines(fromExtraction(read, products, state.products));
      toast(t('po.read', { n: read.length }));
    } else toast(t('po.none'));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return toast(t('np.needTitle'));
    const ls = toImport(lines, state.products);
    if (!ls) return toast(t('ex.invalid'));
    if (supplierSide && !file) return toast(t('np.needFile'));
    let f: { fileId: string; name: string; size: number; mime: string } | undefined;
    if (file) {
      const fileId = newFileId(supplierScope(supplierId), id, 0);
      await putBlob(fileId, file);
      f = { fileId, name: file.name, size: file.size, mime: file.type };
    }
    let order: { source: typeof source; file?: { fileId: string; name: string; size: number; mime: string } } | undefined;
    if (!supplierSide) {
      order = { source };
      if (orderFile && source !== 'saisie') {
        const fileId = newFileId(supplierScope(supplierId), id, 1);
        await putBlob(fileId, orderFile);
        order.file = { fileId, name: orderFile.name, size: orderFile.size, mime: orderFile.type || 'application/octet-stream' };
      }
    }
    dispatch({ type: 'createProforma', id, supplierId, title, etd, eta, lines: ls, file: f, order });
    toast(supplierSide ? t('np.createdSup', { id }) : file ? t('np.createdJonas', { id }) : t('po.created', { id }));
    onClose();
    onCreated?.(id);
  };

  return (
    <div className="palette-back" onMouseDown={onClose}>
      <form className="card rc-dialog bk-dialog np-dialog" role="dialog" aria-label={supplierSide ? t('np.title', { id }) : t('po.title', { id })} onMouseDown={(e) => e.stopPropagation()} onSubmit={submit}>
        <header className="rc-head">
          <div>
            <h2>{supplierSide ? t('np.title', { id }) : t('po.title', { id })}</h2>
            <span className="muted small">{supplierSide ? t('np.hintSup') : t('po.hint')}</span>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t('np.close')}>
            <X size={20} />
          </button>
        </header>
        <div className="bk-form">
          {!supplierSide && (
            <label htmlFor="np-sup">
              {t('np.supplier')}
              <Combobox
                id="np-sup"
                value={supplierId}
                placeholder="Tapez le nom du fournisseur…"
                options={state.suppliers
                  .filter((s) => s.active)
                  .map((s) => ({ id: s.id, label: s.name, sub: `${s.flag} ${s.city} · ${s.country}`, keywords: s.shortName }))}
                onChange={(v) => {
                  setSupplierId(v);
                  setLines([emptyLine()]);
                }}
              />
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

          {!supplierSide && (
            <div className="bk-wide np-filebox">
              <span className="small bold">{t('po.source')}</span>
              <Seg
                value={source}
                onChange={(v) => {
                  setSource(v);
                  setOrderFile(null);
                }}
                options={[
                  { id: 'saisie', label: t('po.src.saisie') },
                  { id: 'excel', label: t('po.src.excel') },
                  { id: 'bc', label: t('po.src.bc') },
                ]}
              />
              {source !== 'saisie' && (
                <FileDrop
                  ariaLabel={source === 'excel' ? t('po.src.excel') : t('po.src.bc')}
                  label={source === 'excel' ? t('po.dropExcel') : t('po.dropBc')}
                  hint={source === 'excel' ? t('po.excelHint') : undefined}
                  accept={source === 'excel' ? '.xlsx,.xls,.csv' : '.pdf,application/pdf'}
                  current={orderFile?.name}
                  onFile={importOrder}
                />
              )}
            </div>
          )}

          <div className="bk-wide np-filebox">
            <span className="small bold">{supplierSide ? t('np.file') : t('np.fileOpt')}</span>
            <FileDrop ariaLabel={supplierSide ? t('np.file') : t('np.fileOpt')} current={file?.name} onFile={attach} />
            {reading && (
              <span className="small muted row" style={{ gap: 6 }}>
                <Loader2 size={14} className="spin" /> {t('ex.reading')}
              </span>
            )}
          </div>

          <div className="bk-wide">
            <LinesEditor supplierId={supplierId} currency={currency} lines={lines} setLines={setLines} />
          </div>
        </div>
        <footer className="rc-foot">
          <span />
          <button type="button" className="btn" onClick={onClose}>
            {t('np.cancel')}
          </button>
          <button type="submit" className="btn primary">
            {supplierSide ? <Send size={16} /> : <Plus size={16} />} {supplierSide ? t('np.send') : file ? t('np.create') : t('po.create')}
          </button>
        </footer>
      </form>
    </div>
  );
}
