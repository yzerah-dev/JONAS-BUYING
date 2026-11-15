import { useState } from 'react';
import { Lock, Send, Ship, X } from 'lucide-react';
import { byId, proformaTotals, useAuth, useStore } from '../data/store';
import { ROLE_DEFS } from '../data/permissions';
import type { Proforma } from '../data/types';
import { estimateContainers, toast } from './ui-shared';
import { addDays, dec, fdate, weekLabel } from '../lib/format';


/**
 * Demande de booking d'une proforma : nombre de containers et date souhaitée.
 * Le fournisseur reçoit l'alerte et répond avec le plan de chargement et les dates réelles.
 */
export function BookingRequestDialog({ pf, onClose }: { pf: Proforma; onClose: () => void }) {
  const { state, dispatch } = useStore();
  const sup = byId(state.suppliers, pf.supplierId);
  const cbm = proformaTotals(state, pf).cbm;
  const [n, setN] = useState(estimateContainers(cbm));
  const [date, setDate] = useState(addDays(pf.etd, -5));
  const [note, setNote] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || n < 1) return toast('Indiquez le nombre de containers et la date souhaitée');
    dispatch({ type: 'requestPfBooking', proformaId: pf.id, containers: n, dateWanted: date, note: note.trim() || undefined });
    toast(`Demande de booking envoyée à ${sup.shortName}`);
    onClose();
  };

  return (
    <div className="palette-back" onMouseDown={onClose}>
      <form className="card rc-dialog bk-dialog" role="dialog" aria-label={`Demande de booking ${pf.id}`} onMouseDown={(e) => e.stopPropagation()} onSubmit={submit}>
        <header className="rc-head">
          <div>
            <h2>Demande de booking</h2>
            <span className="muted small">
              {pf.id} · {sup.shortName} · {pf.title} · {dec(cbm, 1)} m³
            </span>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fermer">
            <X size={20} />
          </button>
        </header>
        <div className="bk-form">
          <label htmlFor="bk-n">
            Nombre de containers (40HC)
            <input id="bk-n" className="input" type="number" min={1} max={20} value={n} onChange={(e) => setN(Math.max(1, Number(e.target.value) || 1))} />
          </label>
          <label htmlFor="bk-date">
            Date de chargement souhaitée
            <input id="bk-date" className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label htmlFor="bk-note" className="bk-wide">
            Message au fournisseur (facultatif)
            <input id="bk-note" className="input" placeholder="Ex. grouper avec la commande suivante" value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <p className="small muted">
            Départ prévu {fdate(pf.etd)} ({weekLabel(pf.etd)}). {sup.shortName} reçoit l’alerte « Effectuez le booking de {pf.id} » et répond avec le plan de
            chargement et les dates réelles.
          </p>
        </div>
        <footer className="rc-foot">
          <span />
          <button type="button" className="btn" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" className="btn primary">
            <Send size={16} /> Envoyer au fournisseur
          </button>
        </footer>
      </form>
    </div>
  );
}

/**
 * Bouton « Demande de booking » : visible sur toute proforma pas encore bookée.
 * S'il ne peut pas encore servir (proforma à signer, droits), il explique pourquoi au lieu de disparaître.
 */
export function BookingRequestButton({ pf, variant = 'btn' }: { pf: Proforma; variant?: 'btn' | 'chip' }) {
  const { state } = useStore();
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const me = state.users.find((u) => u.id === state.currentUserId);
  if (!me || ROLE_DEFS[me.role].portal) return null;
  if (pf.booking || ['booke', 'en_transit', 'arrive'].includes(pf.status)) return null;
  const allowed = auth.allowed({ type: 'requestPfBooking', proformaId: pf.id, containers: 1, dateWanted: pf.etd });
  const reason =
    pf.status === 'a_signer'
      ? 'Signez d’abord la proforma pour pouvoir demander le booking'
      : 'Demande de booking réservée à la logistique et aux acheteurs';
  const click = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (allowed) setOpen(true);
    else toast(reason);
  };
  return (
    <>
      <button
        className={variant === 'chip' ? `pf-bk-btn ${allowed ? '' : 'locked'}` : `btn ${allowed ? 'primary' : 'locked'}`}
        title={allowed ? 'Envoyer la demande de booking au fournisseur' : reason}
        onClick={click}
      >
        {allowed ? <Ship size={variant === 'chip' ? 11 : 16} /> : <Lock size={variant === 'chip' ? 11 : 16} />} Demande de booking
      </button>
      {open && (
        <div onClick={(e) => e.stopPropagation()}>
          <BookingRequestDialog pf={pf} onClose={() => setOpen(false)} />
        </div>
      )}
    </>
  );
}
