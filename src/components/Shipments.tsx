import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Split, Truck, X } from 'lucide-react';
import { byId, currentUser, shipmentsOf, shippedQty, useAuth, useStore } from '../data/store';
import { ROLE_DEFS } from '../data/permissions';
import type { Proforma } from '../data/types';
import { addDays } from '../lib/format';
import { useT } from '../i18n';
import { ProformaStatusPill } from './ui';
import { toast } from './ui-shared';

/**
 * Expéditions d'une proforma : expédition unique, ou plusieurs (Exp. 1/2, 2/2…) avec leurs quantités et dates.
 * Le fournisseur (problème usine) ou JONAS (priorité) demande une expédition partielle ; l'autre partie l'accepte.
 */
export default function ShipmentsPanel({ pf }: { pf: Proforma }) {
  const { state, dispatch } = useStore();
  const auth = useAuth();
  const { t, fmt } = useT();
  const me = currentUser(state);
  const portal = ROLE_DEFS[me.role].portal;
  const [open, setOpen] = useState(false);
  const family = shipmentsOf(state, pf);
  const r = pf.splitRequest;
  const qty = (p: Proforma) => p.lines.reduce((s, l) => s + l.qty, 0);
  const canRequest = canAskSplit(pf);
  const canAccept = auth.allowed({ type: 'acceptSplit', id: pf.id });
  const canRefuse = auth.allowed({ type: 'refuseSplit', id: pf.id });
  const mine = r && (r.side === 'fournisseur') === portal;
  const link = (id: string) => (portal ? `/portail/proformas?pf=${id}` : `/proformas/${id}`);

  function canAskSplit(p: Proforma) {
    // Le bouton est proposé dès que la demande est possible avec au moins une ligne en reliquat
    if (p.lines.length === 0) return false;
    const l = p.lines.find((x) => x.qty > 1 && x.qty > shippedQty(state, p.id, x.productId));
    if (!l) return false;
    return auth.allowed({
      type: 'requestSplit',
      id: p.id,
      lines: [{ productId: l.productId, qtyNow: Math.max(shippedQty(state, p.id, l.productId), Math.floor(l.qty / 2)) }],
      etdLater: p.etd,
      reason: 'x',
    });
  }

  if (family.length <= 1 && !r && !canRequest) return null;

  return (
    <div className="card pad sp-card">
      <div className="card-title">
        <Truck size={18} /> {t('sp.title')}
        <span className="grow" />
        {canRequest && !r && (
          <button className="btn sm" onClick={() => setOpen(true)}>
            <Split size={14} /> {t('sp.split')}
          </button>
        )}
      </div>
      {family.length <= 1 ? (
        <p className="small muted" style={{ margin: 0 }}>
          {t('sp.single', { qty: fmt.num(qty(pf)), date: `${fmt.fshort(pf.etd)} (${fmt.weekLabel(pf.etd)})` })}
        </p>
      ) : (
        <div className="sp-list">
          {family.map((p) => (
            <Link key={p.id} to={link(p.id)} className={`sp-row ${p.id === pf.id ? 'current' : ''}`}>
              <b className="sp-part">{t('sp.part', { n: p.split?.part ?? 1, total: family.length })}</b>
              <span className="sp-id">{p.id}</span>
              <span className="small muted">{t('sp.partLine', { qty: fmt.num(qty(p)), date: `${fmt.fshort(p.etd)} (${fmt.weekLabel(p.etd)})` })}</span>
              <ProformaStatusPill status={p.status} />
            </Link>
          ))}
        </div>
      )}
      {r && (
        <div className="sp-request">
          <b>{t('sp.pending', { who: `${r.side === 'fournisseur' ? t('sp.sideSup') : t('sp.sideJonas')} (${r.by})`, date: fmt.fdate(r.at.slice(0, 10)), reason: r.reason })}</b>
          <span className="small">
            {t('sp.pendingDetail', {
              now: fmt.num(r.lines.reduce((s, l) => s + l.qtyNow, 0) + pf.lines.filter((l) => !r.lines.some((x) => x.productId === l.productId)).reduce((s, l) => s + l.qty, 0)),
              later: fmt.num(pf.lines.reduce((s, l) => s + l.qty - (r.lines.find((x) => x.productId === l.productId)?.qtyNow ?? l.qty), 0)),
              date: fmt.fdate(r.etdLater),
            })}
          </span>
          <div className="row wrap" style={{ gap: 8, justifyContent: 'flex-end' }}>
            {!canAccept && <span className="small muted grow">{r.side === 'fournisseur' ? t('sp.waitJonas') : t('sp.waitSup')}</span>}
            {canRefuse && (
              <button
                className="btn sm ghost"
                onClick={() => {
                  dispatch({ type: 'refuseSplit', id: pf.id, reason: mine ? undefined : t('sp.refuse') });
                  toast(mine ? t('sp.cancelledToast') : t('sp.refusedToast'));
                }}
              >
                <X size={14} /> {mine ? t('sp.cancel') : t('sp.refuse')}
              </button>
            )}
            {canAccept && (
              <button
                className="btn sm primary"
                onClick={() => {
                  const root = pf.split?.root ?? pf.id;
                  const next = family.reduce((m, p) => Math.max(m, p.split?.part ?? 1), 1) + 1;
                  dispatch({ type: 'acceptSplit', id: pf.id });
                  toast(t('sp.acceptedToast', { id: `${root}-${next}` }));
                }}
              >
                <Check size={14} /> {t('sp.accept')}
              </button>
            )}
          </div>
        </div>
      )}
      {open && <SplitDialog pf={pf} onClose={() => setOpen(false)} />}
    </div>
  );
}

function SplitDialog({ pf, onClose }: { pf: Proforma; onClose: () => void }) {
  const { state, dispatch } = useStore();
  const { t, fmt, td } = useT();
  const me = currentUser(state);
  const portal = ROLE_DEFS[me.role].portal;
  const [now, setNow] = useState<Record<string, number>>(() => Object.fromEntries(pf.lines.map((l) => [l.productId, l.qty])));
  const [date, setDate] = useState(addDays(pf.etd, 21));
  const [reason, setReason] = useState('');
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const lines = pf.lines.map((l) => ({ productId: l.productId, qtyNow: Math.round(now[l.productId] ?? l.qty) }));
    const a = { type: 'requestSplit' as const, id: pf.id, lines, etdLater: date, reason: reason.trim() };
    if (!reason.trim()) return toast(t('sp.needReason'));
    const total = pf.lines.reduce((s, l) => s + l.qty, 0);
    const n = lines.reduce((s, l) => s + l.qtyNow, 0);
    const bad = n <= 0 || n >= total || pf.lines.some((l) => (now[l.productId] ?? l.qty) > l.qty || (now[l.productId] ?? l.qty) < shippedQty(state, pf.id, l.productId));
    if (bad) return toast(t('sp.invalid'));
    dispatch(a);
    toast(t('sp.sentToast', { who: portal ? t('sp.whoJonas') : t('sp.whoSup') }));
    onClose();
  };
  return (
    <div className="palette-back" onMouseDown={onClose}>
      <form className="card rc-dialog bk-dialog sp-dialog" role="dialog" aria-label={t('sp.dlgTitle', { pf: pf.id })} onMouseDown={(e) => e.stopPropagation()} onSubmit={submit}>
        <header className="rc-head">
          <div>
            <h2>{t('sp.dlgTitle', { pf: pf.id })}</h2>
            <span className="muted small">{t('sp.dlgHint')}</span>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t('sp.close')}>
            <X size={20} />
          </button>
        </header>
        <div className="bk-form">
          <div className="tbl-wrap bk-wide">
            <table className="tbl sp-tbl">
              <thead>
                <tr>
                  <th>{t('col.product')}</th>
                  <th className="num">{t('sp.colQty')}</th>
                  <th className="num">{t('sp.colNow')}</th>
                  <th className="num">{t('sp.colLater')}</th>
                </tr>
              </thead>
              <tbody>
                {pf.lines.map((l) => {
                  const p = byId(state.products, l.productId);
                  const shipped = shippedQty(state, pf.id, l.productId);
                  const v = now[l.productId] ?? l.qty;
                  return (
                    <tr key={l.productId}>
                      <td>
                        <span className="ref-tag">{p.ref}</span> <span className="small">{td(p.name)}</span>
                        {shipped > 0 && <div className="xs muted">{t('sp.minShipped', { n: fmt.num(shipped) })}</div>}
                      </td>
                      <td className="num">{fmt.num(l.qty)}</td>
                      <td className="num">
                        <input
                          id={`sp-qty-${p.ref}`}
                          aria-label={`${t('sp.colNow')} ${p.ref}`}
                          className="input sp-qty"
                          type="number"
                          min={shipped}
                          max={l.qty}
                          value={v}
                          onChange={(e) => setNow({ ...now, [l.productId]: Math.max(0, Number(e.target.value) || 0) })}
                        />
                      </td>
                      <td className={`num ${l.qty - v > 0 ? 'orange bold' : 'muted'}`}>{fmt.num(Math.max(0, l.qty - v))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <label htmlFor="sp-date">
            {t('sp.dateLater')}
            <input id="sp-date" className="input" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label htmlFor="sp-reason">
            {t('sp.reason')}
            <input id="sp-reason" className="input" placeholder={t('sp.reasonPh')} value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
        </div>
        <footer className="rc-foot">
          <span />
          <button type="button" className="btn" onClick={onClose}>
            {t('sp.dlgCancel')}
          </button>
          <button type="submit" className="btn primary">
            <Split size={16} /> {t('sp.send')}
          </button>
        </footer>
      </form>
    </div>
  );
}
