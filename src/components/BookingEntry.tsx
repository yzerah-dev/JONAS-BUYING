import { useState } from 'react';
import { Check } from 'lucide-react';
import { useStore } from '../data/store';
import type { Proforma } from '../data/types';
import { addDays } from '../lib/format';
import { useT } from '../i18n';
import { CARRIERS, toast } from './ui-shared';

/**
 * Proposition de booking d'une proforma : par le transitaire (portail transitaire),
 * ou par le fournisseur pour le transitaire quand celui-ci ne passe pas par l'application.
 * Elle doit ensuite être acceptée par le fournisseur et par JONAS.
 */
export default function BookingEntry({ pf, onDone, onCancel, label }: { pf: Proforma; onDone?: () => void; onCancel?: () => void; label?: string }) {
  const { dispatch } = useStore();
  const { t, fmt } = useT();
  const b = pf.booking!;
  const id = pf.id.replace(/\W/g, '');
  const ready = b.readyDate ?? b.dateWanted;
  const [carrier, setCarrier] = useState('');
  const [no, setNo] = useState('');
  const [vessel, setVessel] = useState('');
  const [loading, setLoading] = useState(ready > b.dateWanted ? ready : b.dateWanted);
  const [etd, setEtd] = useState(pf.etd > loading ? pf.etd : addDays(loading, 5));
  const [cutoff, setCutoff] = useState(addDays(pf.etd > loading ? pf.etd : addDays(loading, 5), -3));
  const [eta, setEta] = useState(pf.eta);
  const [note, setNote] = useState('');
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!carrier || !no.trim()) return toast(t('be.needCarrier'));
    dispatch({
      type: 'proposePfBooking',
      proformaId: pf.id,
      carrier,
      bookingNo: no.trim().toUpperCase(),
      vessel: vessel.trim().toUpperCase() || undefined,
      cutoff,
      loadingDate: loading,
      etd,
      eta,
      note: note.trim() || undefined,
    });
    toast(t('be.toast', { pf: pf.id }));
    onDone?.();
  };
  const opt = (k: Parameters<typeof t>[0]) => (
    <span>
      {t(k)} <em>({t('be.optional')})</em>
    </span>
  );
  return (
    <form className="be-form" onSubmit={submit} aria-label={`${t('be.title')} ${pf.id}`}>
      <p className="small muted">{t('be.ready', { date: fmt.fdate(ready) })}</p>
      <div className="pb-dates">
        <label htmlFor={`be-car-${id}`}>
          {t('be.carrier')}
          <select id={`be-car-${id}`} className="input" required value={carrier} onChange={(e) => setCarrier(e.target.value)}>
            <option value="">—</option>
            {CARRIERS.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label htmlFor={`be-no-${id}`}>
          {t('be.no')}
          <input id={`be-no-${id}`} className="input" required value={no} onChange={(e) => setNo(e.target.value)} />
        </label>
        <label htmlFor={`be-ves-${id}`}>
          {opt('be.vessel')}
          <input id={`be-ves-${id}`} className="input" placeholder="Ex. MSC ARINA" value={vessel} onChange={(e) => setVessel(e.target.value)} />
        </label>
        <label htmlFor={`be-load-${id}`}>
          {t('be.loading')}
          <input id={`be-load-${id}`} className="input" type="date" required value={loading} onChange={(e) => setLoading(e.target.value)} />
        </label>
        <label htmlFor={`be-cut-${id}`}>
          {t('be.cutoff')}
          <input id={`be-cut-${id}`} className="input" type="date" required value={cutoff} onChange={(e) => setCutoff(e.target.value)} />
        </label>
        <label htmlFor={`be-etd-${id}`}>
          {t('be.etd')}
          <input id={`be-etd-${id}`} className="input" type="date" required value={etd} onChange={(e) => setEtd(e.target.value)} />
        </label>
        <label htmlFor={`be-eta-${id}`}>
          {t('be.eta')}
          <input id={`be-eta-${id}`} className="input" type="date" required value={eta} onChange={(e) => setEta(e.target.value)} />
        </label>
        <label htmlFor={`be-note-${id}`}>
          {opt('be.note')}
          <input id={`be-note-${id}`} className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>
      <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
        {onCancel && (
          <button type="button" className="btn" onClick={onCancel}>
            {t('be.cancel')}
          </button>
        )}
        <button type="submit" className="btn primary">
          <Check size={16} /> {label ?? t('be.send')}
        </button>
      </div>
    </form>
  );
}
