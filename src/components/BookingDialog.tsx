import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Boxes, Calendar, CalendarPlus, Check, ClipboardList, Send, X } from 'lucide-react';
import { allocatedQty, byId, containerCbm, containerEtd, containerProformas, containerQty, lineCbm, useAuth, useStore } from '../data/store';
import { FORWARDERS, type Container, type Forwarder, type Proforma } from '../data/types';
import { loadingTrack, planTrack, type TrackState } from '../data/tracks';
import { toast } from './ui-shared';
import { ContainerStatusPill, ProductThumb } from './ui';
import { addDays, dec, fdate, fshort, fstamp, num, weekLabel } from '../lib/format';

const CARRIERS = ['MSC', 'CMA CGM', 'Maersk', 'COSCO', 'Hapag-Lloyd'];
export type BookingMode = 'request' | 'confirm' | 'date';

export function Track({ n, label, t, children }: { n: number; label: string; t: TrackState; children?: ReactNode }) {
  return (
    <div className={`bk-track bk-t-${t.tone}`}>
      <span className="bk-step">{t.tone === 'green' ? <Check size={14} strokeWidth={3} /> : n}</span>
      <div>
        <small>{label}</small>
        <b>{t.title}</b>
        <span>{t.detail}</span>
      </div>
      {children}
    </div>
  );
}

export function BookingDialog({ mode, c, onClose }: { mode: BookingMode; c: Container; onClose: () => void }) {
  const { state, dispatch } = useStore();
  const sup = byId(state.suppliers, c.supplierId);
  const [forwarder, setForwarder] = useState<Forwarder>(c.forwarder ?? 'Logfret');
  const [etd, setEtd] = useState(c.booking?.etdWanted ?? c.etdPlanned);
  const [bookingNo, setBookingNo] = useState('');
  const [carrier, setCarrier] = useState(c.carrier ?? 'MSC');
  const [vessel, setVessel] = useState('');
  const [cutoff, setCutoff] = useState(addDays(c.booking?.etdWanted ?? c.etdPlanned, -3));
  const [loadDate, setLoadDate] = useState(c.loading?.date ?? addDays(c.etdPlanned, -6));
  const title = { request: 'Demander le container', confirm: 'Confirmer le booking', date: 'Proposer une date de chargement' }[mode];

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'date') {
      if (!loadDate) return toast('Choisissez une date de chargement');
      dispatch({ type: 'proposeLoadingDate', containerId: c.id, date: loadDate });
      toast(`Date de chargement proposée à ${sup.shortName}`);
    } else if (mode === 'request') {
      dispatch({ type: 'requestBooking', containerId: c.id, forwarder, etdWanted: etd });
      toast(`Demande de container envoyée à ${forwarder}`);
    } else {
      if (!bookingNo.trim()) return toast('Indiquez le n° de booking reçu du transitaire');
      dispatch({ type: 'confirmBooking', containerId: c.id, bookingNo: bookingNo.trim(), carrier, vessel: vessel.trim() || undefined, cutoff, etd });
      toast(`Booking ${bookingNo.trim()} confirmé`);
    }
    onClose();
  };

  return (
    <div className="palette-back" onMouseDown={onClose}>
      <form className="card rc-dialog bk-dialog" role="dialog" aria-label={title} onMouseDown={(e) => e.stopPropagation()} onSubmit={submit}>
        <header className="rc-head">
          <div>
            <h2>{title}</h2>
            <span className="muted small">
              {c.number ?? c.id} · {sup.shortName} · {c.portFrom} → {c.portTo} · {dec(containerCbm(state, c), 1)} m³
            </span>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fermer">
            <X size={20} />
          </button>
        </header>
        <div className="bk-form">
          {mode === 'date' ? (
            <>
              <label htmlFor="bk-load">
                Date de chargement
                <input id="bk-load" className="input" type="date" autoFocus value={loadDate} max={c.etdPlanned} onChange={(e) => setLoadDate(e.target.value)} />
              </label>
              <label>
                Départ prévu
                <input className="input" value={`${fdate(c.etdPlanned)} · ${weekLabel(c.etdPlanned)}`} readOnly />
              </label>
              <p className="small muted">
                {sup.shortName} confirme cette date ou en propose une autre depuis son portail. La demande de container à la compagnie se fait une fois la date validée.
              </p>
            </>
          ) : mode === 'request' ? (
            <>
              <p className="bk-ok">
                <Check size={16} /> Chargement validé par {sup.shortName} le <b>{c.loading ? fdate(c.loading.date) : '—'}</b>
              </p>
              <label htmlFor="bk-fwd">
                Transitaire
                <select id="bk-fwd" className="input" value={forwarder} onChange={(e) => setForwarder(e.target.value as Forwarder)}>
                  {FORWARDERS.map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </select>
              </label>
              <label htmlFor="bk-etd">
                Départ souhaité
                <input id="bk-etd" className="input" type="date" value={etd} onChange={(e) => setEtd(e.target.value)} />
              </label>
              <p className="small muted">
                Le transitaire demande le container à la compagnie pour cette date de chargement · volumes et proformas {containerProformas(c).join(', ')}
                {c.planValidated ? '' : ' · le plan de chargement peut encore être ajusté avec le fournisseur'}.
              </p>
            </>
          ) : (
            <>
              <label htmlFor="bk-no">
                N° de booking
                <input id="bk-no" className="input" autoFocus placeholder="Ex. BK-98760" value={bookingNo} onChange={(e) => setBookingNo(e.target.value)} />
              </label>
              <label htmlFor="bk-carrier">
                Compagnie maritime
                <select id="bk-carrier" className="input" value={carrier} onChange={(e) => setCarrier(e.target.value)}>
                  {CARRIERS.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
              <label htmlFor="bk-vessel">
                Navire
                <input id="bk-vessel" className="input" placeholder="Ex. MSC ARINA" value={vessel} onChange={(e) => setVessel(e.target.value)} />
              </label>
              <label htmlFor="bk-etd2">
                Départ confirmé (ETD)
                <input id="bk-etd2" className="input" type="date" value={etd} onChange={(e) => setEtd(e.target.value)} />
              </label>
              <label htmlFor="bk-cut">
                Cut-off terminal
                <input id="bk-cut" className="input" type="date" value={cutoff} onChange={(e) => setCutoff(e.target.value)} />
              </label>
              <p className="small muted">
                Transitaire : {c.forwarder ?? '—'} · demande du {c.booking?.requestedAt ? fdate(c.booking.requestedAt.slice(0, 10)) : '—'}
              </p>
            </>
          )}
        </div>
        <footer className="rc-foot">
          <span />
          <button type="button" className="btn" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" className="btn primary">
            {mode === 'date' ? (
              <>
                <Send size={16} /> Envoyer au fournisseur
              </>
            ) : mode === 'request' ? (
              <>
                <Send size={16} /> Envoyer la demande
              </>
            ) : (
              <>
                <Check size={16} /> Confirmer le booking
              </>
            )}
          </button>
        </footer>
      </form>
    </div>
  );
}

/**
 * Booking depuis une proforma : ses conteneurs, les deux circuits (date de chargement, plan)
 * et la demande de container, sans quitter la proforma.
 */
export function ProformaBooking({ pf, containers, onClose }: { pf: Proforma; containers: Container[]; onClose: () => void }) {
  const { state, dispatch } = useStore();
  const auth = useAuth();
  const [sub, setSub] = useState<{ mode: BookingMode; c: Container } | null>(null);
  const sup = byId(state.suppliers, pf.supplierId);
  // Conteneurs relus depuis l'état (la fenêtre reste ouverte après « Préparer le chargement »)
  const list = state.containers.filter((c) => c.allocations.some((a) => a.proformaId === pf.id) || containers.some((x) => x.id === c.id && c.allocations.length));
  const left = pf.lines.map((l) => {
    const p = byId(state.products, l.productId);
    const q = Math.max(0, l.qty - allocatedQty(state, pf.id, p.id));
    return { q, cbm: lineCbm(p, q) };
  });
  const remaining = left.reduce((t, x) => t + x.q, 0);
  const remainingCbm = left.reduce((t, x) => t + x.cbm, 0);
  if (sub) return <BookingDialog key={sub.c.id + sub.mode} mode={sub.mode} c={state.containers.find((x) => x.id === sub.c.id) ?? sub.c} onClose={() => setSub(null)} />;
  return (
    <div className="palette-back" onMouseDown={onClose}>
      <div className="card rc-dialog pb-dialog" role="dialog" aria-label={`Booking ${pf.id}`} onMouseDown={(e) => e.stopPropagation()}>
        <header className="rc-head">
          <div>
            <h2>Booking · {pf.id}</h2>
            <span className="muted small">
              {sup.shortName} · {pf.title} · départ prévu {fshort(pf.etd)} ({weekLabel(pf.etd)})
            </span>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fermer">
            <X size={20} />
          </button>
        </header>
        <div className="pb-body">
          {remaining > 0 && (
            <div className="pb-start">
              <span className="pb-start-ico">
                <Boxes size={22} />
              </span>
              <div>
                <b>{list.length ? 'Il reste de la marchandise à charger' : 'Étape 1 · Préparer le chargement'}</b>
                <small>
                  {num(remaining)} pcs · {dec(remainingCbm, 1)} m³ pas encore dans un conteneur (≈ {Math.max(1, Math.ceil(remainingCbm / 68))} × 40HC)
                </small>
              </div>
              {auth.can('logistics.plan') && (
                <button
                  className="btn primary"
                  onClick={() => {
                    dispatch({ type: 'autoLoad', proformaId: pf.id });
                    toast('Conteneur(s) préparé(s) avec les lignes de la proforma');
                  }}
                >
                  <Boxes size={16} /> Préparer le chargement
                </button>
              )}
            </div>
          )}
          {!list.length && (
            <ol className="pb-steps">
              <li>
                <b>Préparer le chargement</b> : les lignes de la proforma sont réparties dans des conteneurs 40HC (ajustable ensuite dans « Suivi &amp; Logistique »).
              </li>
              <li>
                <b>Date de chargement</b> : JONAS la propose, le fournisseur la confirme ou en donne une autre.
              </li>
              <li>
                <b>Plan de chargement</b> : envoyé au fournisseur, qui le valide tel quel ou le modifie.
              </li>
              <li>
                <b>Demander le container</b> : dès que la date est validée, la demande part au transitaire (Logfret / Kuehne + Nagel).
              </li>
            </ol>
          )}
          {list.map((c) => {
            const top = [...c.allocations].sort((a, b) => b.qty - a.qty)[0];
            const p = byId(state.products, top.productId);
            const open = c.status === 'a_booker';
            const plan = planTrack(c);
            return (
              <div key={c.id} className="pb-ctn">
                <div className="pb-top">
                  <ProductThumb product={p} size={40} />
                  <div className="pb-id">
                    <b>{c.number ?? c.id}</b>
                    <small>
                      {c.type} · {num(containerQty(c))} pcs · {dec(containerCbm(state, c), 1)} m³ · {containerProformas(c).join(', ')}
                    </small>
                  </div>
                  <ContainerStatusPill status={c.status} />
                </div>
                {open ? (
                  <>
                    <div className="bk-tracks">
                      <Track n={1} label="Date de chargement" t={loadingTrack(c)}>
                        {auth.can('logistics.booking') && c.loading?.status !== 'validated' && (
                          <button className="btn sm" onClick={() => setSub({ mode: 'date', c })}>
                            <CalendarPlus size={14} /> {c.loading ? 'Modifier' : 'Proposer une date'}
                          </button>
                        )}
                      </Track>
                      <Track n={2} label="Plan de chargement" t={plan}>
                        {auth.can('logistics.plan') && plan.tone === 'grey' && (
                          <button
                            className="btn sm"
                            onClick={() => {
                              dispatch({ type: 'requestPlan', containerId: c.id });
                              toast('Plan de chargement envoyé au fournisseur');
                            }}
                          >
                            <ClipboardList size={14} /> Envoyer le plan
                          </button>
                        )}
                        {auth.can('logistics.plan') && plan.tone === 'violet' && (
                          <button
                            className="btn sm primary"
                            onClick={() => {
                              dispatch({ type: 'validatePlan', containerId: c.id });
                              toast('Modifications du fournisseur validées');
                            }}
                          >
                            <Check size={14} /> Valider les modifications
                          </button>
                        )}
                      </Track>
                    </div>
                    {auth.can('logistics.booking') && (
                      <div className="pb-actions">
                        <button
                          className="btn primary"
                          disabled={!auth.allowed({ type: 'requestBooking', containerId: c.id })}
                          title={c.loading?.status === 'validated' ? undefined : 'Attendre la date de chargement validée par le fournisseur'}
                          onClick={() => setSub({ mode: 'request', c })}
                        >
                          <Send size={16} /> Demander le container
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="pb-state">
                    {c.status === 'booking_demande' ? (
                      <>
                        Demandé à <b>{c.forwarder ?? 'transitaire'}</b> le {c.booking?.requestedAt ? fstamp(c.booking.requestedAt) : '—'} · en attente de confirmation
                      </>
                    ) : (
                      <>
                        <Calendar size={14} /> Booking <b>{c.bookingNo ?? '—'}</b>
                        {c.carrier ? ` · ${c.carrier}` : ''}
                        {c.booking?.vessel ? ` · ${c.booking.vessel}` : ''} · départ {fshort(containerEtd(c))}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <footer className="rc-foot">
          <span />
          {auth.canSee('booking') && (
            <Link className="btn ghost" to="/booking">
              Tous les bookings →
            </Link>
          )}
          <button type="button" className="btn" onClick={onClose}>
            Fermer
          </button>
        </footer>
      </div>
    </div>
  );
}
