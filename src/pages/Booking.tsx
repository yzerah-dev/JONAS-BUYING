import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Anchor, Ban, BellRing, CalendarCheck, CalendarClock, CalendarPlus, Check, ChevronDown, ChevronUp, ClipboardList, Search, Send, Ship, X } from 'lucide-react';
import { byId, containerCbm, containerEtd, containerProformas, containerQty, useAuth, useStore, type State } from '../data/store';
import { FORWARDERS, type Container, type Forwarder } from '../data/types';
import { ProductThumb, SupplierLogo } from '../components/ui';
import { toast } from '../components/ui-shared';
import { CarrierBadge, ForwarderBadge } from '../components/ContainerCard';
import { TODAY, addDays, dec, diffDays, fdate, fshort, fstamp, num, weekLabel } from '../lib/format';
import { pressable } from '../lib/a11y';
import { loadingTrack, planTrack, type TrackState } from '../data/tracks';

const CARRIERS = ['MSC', 'CMA CGM', 'Maersk', 'COSCO', 'Hapag-Lloyd'];
/** Au-delà de ce délai sans réponse du transitaire, la demande est à relancer */
const WAIT_ALERT = 3;

const waitDays = (c: Container) => (c.booking?.requestedAt ? diffDays(TODAY, c.booking.requestedAt.slice(0, 10)) : 0);
const lastReminder = (c: Container) => c.booking?.reminders?.at(-1);

function mainProduct(s: State, c: Container) {
  const top = [...c.allocations].sort((a, b) => b.qty - a.qty)[0];
  return { p: top ? byId(s.products, top.productId) : undefined, refs: new Set(c.allocations.map((a) => a.productId)).size };
}

type Mode = 'request' | 'confirm' | 'date';
type Dialog = { mode: Mode; c: Container } | null;

function Track({ n, label, t, children }: { n: number; label: string; t: TrackState; children?: ReactNode }) {
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

export default function Booking() {
  const { state, dispatch } = useStore();
  const auth = useAuth();
  const canBook = auth.can('logistics.booking');
  const canPlan = auth.can('logistics.plan');
  const [q, setQ] = useState('');
  const [fwd, setFwd] = useState<'all' | Forwarder>('all');
  const [dialog, setDialog] = useState<Dialog>(null);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return state.containers
      .filter((c) => fwd === 'all' || c.forwarder === fwd)
      .filter((c) => {
        if (!s) return true;
        const sup = byId(state.suppliers, c.supplierId);
        return `${c.id} ${c.number ?? ''} ${c.bookingNo ?? ''} ${c.booking?.vessel ?? ''} ${containerProformas(c).join(' ')} ${sup.name}`.toLowerCase().includes(s);
      });
  }, [state, q, fwd]);

  // Prêts à demander (date validée) d'abord, puis par date de départ
  const ready = (c: Container) => (c.loading?.status === 'validated' ? 0 : 1);
  const toRequest = list.filter((c) => c.status === 'a_booker').sort((a, b) => ready(a) - ready(b) || a.etdPlanned.localeCompare(b.etdPlanned));
  const readyCount = toRequest.filter((c) => !ready(c)).length;
  const waitSupplier = toRequest.filter((c) => c.loading?.status === 'proposed' || c.planRequested || c.planProposed).length;
  const waiting = list.filter((c) => c.status === 'booking_demande').sort((a, b) => waitDays(b) - waitDays(a));
  const confirmed = list.filter((c) => c.status === 'booke').sort((a, b) => containerEtd(a).localeCompare(containerEtd(b)));
  const gone = list.filter((c) => (c.status === 'en_transit' || c.status === 'arrive') && c.booking?.confirmedAt);

  // Délai moyen demande → confirmation (jours)
  const delays = state.containers
    .filter((c) => c.booking?.requestedAt && c.booking?.confirmedAt)
    .map((c) => diffDays(c.booking!.confirmedAt!.slice(0, 10), c.booking!.requestedAt!.slice(0, 10)));
  const avgDelay = delays.length ? delays.reduce((a, b) => a + b, 0) / delays.length : 0;
  const urgentRequest = toRequest.filter((c) => diffDays(c.etdPlanned, TODAY) < 21).length;
  const lateWaiting = waiting.filter((c) => waitDays(c) > WAIT_ALERT).length;
  const soonCutoff = confirmed.filter((c) => c.booking?.cutoff && diffDays(c.booking.cutoff, TODAY) <= 7).length;

  const remind = (c: Container) => {
    dispatch({ type: 'remindBooking', containerId: c.id });
    toast(`Relance envoyée à ${c.forwarder ?? 'transitaire'}`);
  };
  const cancel = (c: Container) => {
    dispatch({ type: 'cancelBooking', containerId: c.id });
    toast('Demande de booking annulée');
  };

  return (
    <div className="pf-page">
      <h1 className="pf-title">Booking</h1>

      <div className="bk-kpis">
        <div className="kpi-box">
          <small>En préparation</small>
          <b>{toRequest.length}</b>
          <span className={urgentRequest ? 'red' : ''}>
            {readyCount} prêt(s) à demander{urgentRequest ? ` · ${urgentRequest} départ(s) < 3 sem.` : ''}
          </span>
        </div>
        <div className="kpi-box">
          <small>En attente du transitaire</small>
          <b>{waiting.length}</b>
          <span className={lateWaiting ? 'red' : ''}>{lateWaiting ? `${lateWaiting} sans réponse depuis +${WAIT_ALERT} j` : 'Réponses dans les temps'}</span>
        </div>
        <div className="kpi-box">
          <small>Délai moyen de confirmation</small>
          <b>{delays.length ? `${dec(avgDelay, 1)} j` : '—'}</b>
          <span>sur {delays.length} booking(s)</span>
        </div>
        <div className="kpi-box">
          <small>Confirmés à partir</small>
          <b>{confirmed.length}</b>
          <span className={soonCutoff ? 'orange' : ''}>{soonCutoff ? `${soonCutoff} cut-off sous 7 j` : 'Aucun cut-off proche'}</span>
        </div>
      </div>

      <div className="pf-toolbar">
        <label className="pf-search">
          <Search size={20} />
          <input placeholder="N° conteneur, booking, navire, proforma, fournisseur…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <div className="pf-views bk-fwd">
          {(['all', ...FORWARDERS] as const).map((f) => (
            <button key={f} className={fwd === f ? 'active' : ''} onClick={() => setFwd(f)}>
              {f === 'all' ? (
                <>
                  <span className="ct-lg">Tous transitaires</span>
                  <span className="ct-sm">Tous</span>
                </>
              ) : (
                f
              )}
            </button>
          ))}
        </div>
      </div>

      <Stage
        icon={<CalendarPlus size={34} strokeWidth={1.8} />}
        tone="orange"
        title="En préparation"
        sub={`Date de chargement et plan validés avec le fournisseur${waitSupplier ? ` · ${waitSupplier} en attente de sa réponse` : ''}`}
        items={toRequest}
      >
        {toRequest.map((c) => {
          const dateOk = c.loading?.status === 'validated';
          const plan = planTrack(c);
          return (
            <Row key={c.id} s={state} c={c}>
              <div className="bk-tracks">
                <Track n={1} label="Date de chargement" t={loadingTrack(c)}>
                  {canBook && !dateOk && (
                    <button className="btn sm" onClick={() => setDialog({ mode: 'date', c })}>
                      <CalendarPlus size={14} /> {c.loading ? 'Modifier' : 'Proposer une date'}
                    </button>
                  )}
                </Track>
                <Track n={2} label="Plan de chargement" t={plan}>
                  {canPlan && plan.tone === 'grey' && (
                    <button
                      className="btn sm"
                      disabled={!c.allocations.length}
                      onClick={() => {
                        dispatch({ type: 'requestPlan', containerId: c.id });
                        toast('Plan de chargement envoyé au fournisseur');
                      }}
                    >
                      <ClipboardList size={14} /> Envoyer le plan
                    </button>
                  )}
                  {canPlan && plan.tone === 'violet' && (
                    <>
                      <Link className="btn sm ghost" to={`/conteneurs?c=${c.id}`}>
                        Revoir
                      </Link>
                      <button
                        className="btn sm primary"
                        onClick={() => {
                          dispatch({ type: 'validatePlan', containerId: c.id });
                          toast('Modifications du fournisseur validées');
                        }}
                      >
                        <Check size={14} /> Valider les modifications
                      </button>
                    </>
                  )}
                </Track>
              </div>
              <div className="bk-actions">
                {canBook && (
                  <button
                    className="btn sm primary"
                    disabled={!auth.allowed({ type: 'requestBooking', containerId: c.id }) || !c.allocations.length}
                    title={dateOk ? 'Demander le container à la compagnie via le transitaire' : 'Attendre la date de chargement validée par le fournisseur'}
                    onClick={() => setDialog({ mode: 'request', c })}
                  >
                    <Send size={14} /> Demander le container
                  </button>
                )}
              </div>
            </Row>
          );
        })}
      </Stage>

      <Stage icon={<CalendarClock size={34} strokeWidth={1.8} />} tone="violet" title="Demandes envoyées" sub="En attente de confirmation du transitaire" items={waiting}>
        {waiting.map((c) => {
          const w = waitDays(c);
          const rem = lastReminder(c);
          return (
            <Row key={c.id} s={state} c={c}>
              <div className="bk-info">
                <small>Demandé le {c.booking?.requestedAt ? fstamp(c.booking.requestedAt) : '—'}</small>
                <b className={w > WAIT_ALERT ? 'red' : ''}>En attente depuis {w} j</b>
                <span>
                  {c.booking?.reminders?.length ? `${c.booking.reminders.length} relance(s) · dernière ${fstamp(rem)}` : 'Aucune relance'} · départ souhaité{' '}
                  {fshort(c.booking?.etdWanted ?? c.etdPlanned)}
                </span>
              </div>
              <div className="bk-actions">
                {canBook && (
                  <>
                    <button className={`btn sm ${w > WAIT_ALERT ? 'danger' : ''}`} onClick={() => remind(c)}>
                      <BellRing size={14} /> Relancer
                    </button>
                    <button className="btn sm primary" onClick={() => setDialog({ mode: 'confirm', c })}>
                      <Check size={14} /> Confirmer
                    </button>
                    <button className="btn sm ghost" title="Annuler la demande" aria-label="Annuler la demande" onClick={() => cancel(c)}>
                      <Ban size={14} />
                    </button>
                  </>
                )}
              </div>
            </Row>
          );
        })}
      </Stage>

      <Stage icon={<CalendarCheck size={34} strokeWidth={1.8} />} tone="green" title="Bookings confirmés" sub="Confirmés par le transitaire, en attente de départ" items={confirmed}>
        {confirmed.map((c) => {
          const cut = c.booking?.cutoff;
          return (
            <Row key={c.id} s={state} c={c} showCarrier>
              <div className="bk-info">
                <small>
                  <Ship size={12} /> {c.booking?.vessel ?? 'Navire à préciser'} · {c.bookingNo}
                </small>
                <b>
                  Départ {fshort(containerEtd(c))} · {weekLabel(containerEtd(c))}
                </b>
                <span className={cut && diffDays(cut, TODAY) <= 7 ? 'orange bold' : ''}>
                  Cut-off {cut ? fshort(cut) : '—'} · confirmé le {c.booking?.confirmedAt ? fstamp(c.booking.confirmedAt) : '—'}
                </span>
              </div>
              <div className="bk-actions">
                {canBook && (
                  <button
                    className="btn sm"
                    onClick={() => {
                      dispatch({ type: 'ship', containerId: c.id });
                      toast('Conteneur parti : passé en transit');
                    }}
                  >
                    <Ship size={14} /> Parti
                  </button>
                )}
              </div>
            </Row>
          );
        })}
      </Stage>

      {gone.length > 0 && (
        <Stage icon={<Anchor size={30} strokeWidth={1.8} />} tone="grey" title="Partis" sub="Historique des bookings réalisés" items={gone} defaultOpen={false}>
          {gone.map((c) => (
            <Row key={c.id} s={state} c={c} showCarrier>
              <div className="bk-info">
                <small>
                  <Ship size={12} /> {c.booking?.vessel ?? '—'} · {c.bookingNo}
                </small>
                <b>Parti le {fshort(containerEtd(c))}</b>
                <span>
                  Demande → confirmation : {diffDays(c.booking!.confirmedAt!.slice(0, 10), (c.booking?.requestedAt ?? c.booking!.confirmedAt!).slice(0, 10))} j
                </span>
              </div>
              <div className="bk-actions">
                <Link className="btn sm ghost" to={`/conteneurs?c=${c.id}`} onClick={(e) => e.stopPropagation()}>
                  Voir le conteneur
                </Link>
              </div>
            </Row>
          ))}
        </Stage>
      )}

      {dialog && <BookingDialog key={dialog.c.id + dialog.mode} mode={dialog.mode} c={dialog.c} onClose={() => setDialog(null)} />}
    </div>
  );
}

function Stage({
  icon,
  tone,
  title,
  sub,
  items,
  children,
  defaultOpen = true,
}: {
  icon: ReactNode;
  tone: string;
  title: string;
  sub: string;
  items: Container[];
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`pf-week bk-stage bk-${tone} ${open ? 'open' : ''}`}>
      <header className="pf-week-head" {...pressable(() => setOpen(!open))} aria-expanded={open}>
        <span className="bk-ico">{icon}</span>
        <div className="pf-week-title">
          <h2>{title}</h2>
          <span>{sub}</span>
        </div>
        <span className="pf-count">
          {items.length} conteneur{items.length > 1 ? 's' : ''}
        </span>
        <span className="pf-chevron">{open ? <ChevronUp size={24} /> : <ChevronDown size={24} />}</span>
      </header>
      {open && <div className="pf-body bk-body">{items.length ? children : <div className="empty small">Rien ici.</div>}</div>}
    </section>
  );
}

function Row({ s, c, children, showCarrier }: { s: State; c: Container; children: ReactNode; showCarrier?: boolean }) {
  const sup = byId(s.suppliers, c.supplierId);
  const { p, refs } = mainProduct(s, c);
  return (
    <div className="bk-row">
      <div className="bk-ctn">
        {p && <ProductThumb product={p} size={44} />}
        <div>
          <span className="bk-num">
            {c.number ? <strong>{c.number}</strong> : <strong className="wait">{c.id}</strong>}
            <span className="ct-type">{c.type}</span>
          </span>
          <small>
            {p ? p.name : 'Conteneur'}
            {refs > 1 ? ` + ${refs - 1} réf.` : ''} · {num(containerQty(c))} pcs · {dec(containerCbm(s, c), 1)} m³
          </small>
        </div>
      </div>
      <div className="bk-sup">
        <SupplierLogo supplier={sup} size={32} />
        <span>
          <b>{sup.shortName}</b>
          <small>
            {c.portFrom} → {c.portTo}
          </small>
        </span>
      </div>
      <div className="bk-who">
        <ForwarderBadge forwarder={c.forwarder} />
        {showCarrier && <CarrierBadge carrier={c.carrier} />}
        {c.status !== 'a_booker' && !c.planValidated && <span className={`bk-chip bk-t-${planTrack(c).tone}`}>Plan : {planTrack(c).title.toLowerCase()}</span>}
      </div>
      {children}
    </div>
  );
}

function BookingDialog({ mode, c, onClose }: { mode: Mode; c: Container; onClose: () => void }) {
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
