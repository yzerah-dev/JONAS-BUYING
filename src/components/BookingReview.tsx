import { useState } from 'react';
import { Check, CornerUpLeft, X } from 'lucide-react';
import { currentUser, useAuth, useStore } from '../data/store';
import { isSupplier } from '../data/permissions';
import type { Proforma } from '../data/types';
import { useT } from '../i18n';
import { toast } from './ui-shared';

/**
 * Proposition de booking du transitaire : à accepter par le fournisseur et par JONAS.
 * Un refus (avec motif) renvoie la demande au transitaire.
 */
export default function BookingReview({ pf, compact }: { pf: Proforma; compact?: boolean }) {
  const { state, dispatch } = useStore();
  const auth = useAuth();
  const { t, fmt } = useT();
  const [refusing, setRefusing] = useState(false);
  const [reason, setReason] = useState('');
  const b = pf.booking!;
  const p = b.proposal!;
  const fwd = b.forwarder ?? '';
  const id = pf.id.replace(/\W/g, '');
  const canAccept = auth.allowed({ type: 'acceptPfBooking', proformaId: pf.id });
  const canReject = auth.allowed({ type: 'rejectPfBooking', proformaId: pf.id, reason: 'x' });
  const accept = () => {
    const u = currentUser(state);
    // Booké si l'autre côté a déjà accepté (le pilote accepte pour les deux)
    const booked = u.role === 'pilote' || (isSupplier(u) ? !!p.jonasOk : !!p.supplierOk);
    dispatch({ type: 'acceptPfBooking', proformaId: pf.id });
    toast(booked ? t('pr.bookedToast', { pf: pf.id }) : t('pr.acceptToast'));
  };
  const reject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) return toast(t('pr.needReason'));
    dispatch({ type: 'rejectPfBooking', proformaId: pf.id, reason: reason.trim() });
    toast(t('pr.rejectToast', { fwd }));
  };
  return (
    <div className={`bk-review ${compact ? 'compact' : ''}`} aria-label={t('pr.title', { fwd })}>
      <div className="bk-review-main">
        <small>
          {t('pr.title', { fwd })}
          {p.enteredBy !== 'transitaire' ? ` · ${t('pr.enteredBySup', { fwd })}` : ''}
        </small>
        <b>
          {p.carrier} · {p.bookingNo}
          {p.vessel ? ` · ${p.vessel}` : ''}
        </b>
        <span>
          {t('pr.dates', { load: fmt.fshort(p.loadingDate), etd: fmt.fshort(p.etd), eta: fmt.fshort(p.eta) })}
          {p.cutoff ? ` · ${t('pr.cutoff', { date: fmt.fshort(p.cutoff) })}` : ''}
        </span>
        {p.note && <span className="muted">« {p.note} »</span>}
        <span className="bk-review-oks">
          <span className={`fw-doc ${p.supplierOk ? 'ok' : 'wait'}`}>
            {p.supplierOk ? <Check size={11} /> : null} {p.supplierOk ? t('pr.supOk') : t('pr.supWait')}
          </span>
          <span className={`fw-doc ${p.jonasOk ? 'ok' : 'wait'}`}>
            {p.jonasOk ? <Check size={11} /> : null} {p.jonasOk ? t('pr.jonasOk') : t('pr.jonasWait')}
          </span>
        </span>
      </div>
      {(canAccept || canReject) && !refusing && (
        <div className="bk-actions">
          {canReject && (
            <button type="button" className="btn sm ghost" onClick={() => setRefusing(true)}>
              <X size={14} /> {t('pr.reject')}
            </button>
          )}
          {canAccept && (
            <button type="button" className="btn sm primary" onClick={accept}>
              <Check size={14} /> {t('pr.accept')}
            </button>
          )}
        </div>
      )}
      {refusing && (
        <form className="bk-review-refuse" onSubmit={reject}>
          <label htmlFor={`pr-reason-${id}`}>
            {t('pr.reason')}
            <input id={`pr-reason-${id}`} className="input" autoFocus placeholder={t('pr.reasonPh')} value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn sm" onClick={() => setRefusing(false)}>
              {t('be.cancel')}
            </button>
            <button type="submit" className="btn sm danger">
              <CornerUpLeft size={14} /> {t('pr.rejectSend')}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

/** Dernier refus d'une proposition, affiché au transitaire et au fournisseur */
export function LastRejection({ pf }: { pf: Proforma }) {
  const { t } = useT();
  const r = pf.booking?.rejections?.at(-1);
  if (!r || pf.booking?.proposal) return null;
  return <p className="bk-reject-note">{t('pr.lastReject', { who: r.side === 'fournisseur' ? t('pr.sideSup') : t('pr.sideJonas'), reason: r.reason })}</p>;
}
