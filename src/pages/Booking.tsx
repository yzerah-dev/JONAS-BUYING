import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Anchor, Ban, BadgeCheck, BellRing, Boxes, CalendarCheck, CalendarClock, CalendarPlus, ChevronDown, ChevronUp, Search, Send, Ship } from 'lucide-react';
import { bookingStage, byId, shipmentLabel, canRequestBooking, pfContainers, proformaTotals, useAuth, useStore, type State } from '../data/store';
import type { Proforma } from '../data/types';
import { ProductThumb, ProformaStatusPill, SupplierLogo } from '../components/ui';
import { estimateContainers, toast } from '../components/ui-shared';
import { CarrierBadge } from '../components/ContainerCard';
import { BookingRequestDialog } from '../components/BookingDialog';
import BookingReview, { LastRejection } from '../components/BookingReview';
import { TODAY, dec, diffDays, fshort, fstamp, weekLabel } from '../lib/format';
import { pressable } from '../lib/a11y';

/** Au-delà de ce délai sans réponse (fournisseur ou transitaire), la demande est à relancer */
const WAIT_ALERT = 3;
/** Jours d'attente à l'étape en cours : depuis la demande (fournisseur) ou depuis la prise en compte (transitaire) */
const waitDays = (pf: Proforma) => (pf.booking ? diffDays(TODAY, (pf.booking.ackAt ?? pf.booking.requestedAt).slice(0, 10)) : 0);

export default function Booking() {
  const { state, dispatch } = useStore();
  const auth = useAuth();
  const canBook = auth.can('logistics.booking');
  const [q, setQ] = useState('');
  const [asking, setAsking] = useState<Proforma | null>(null);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return state.proformas;
    return state.proformas.filter((pf) => {
      const sup = byId(state.suppliers, pf.supplierId);
      return `${pf.id} ${pf.title ?? ''} ${sup.name} ${pf.booking?.bookingNo ?? ''} ${pfContainers(state, pf.id)
        .map((c) => c.number ?? c.id)
        .join(' ')}`
        .toLowerCase()
        .includes(s);
    });
  }, [state, q]);

  const shipped = (pf: Proforma) => ['en_transit', 'arrive'].includes(pf.status);
  const toAsk = list.filter(canRequestBooking).sort((a, b) => a.etd.localeCompare(b.etd));
  const atSupplier = list.filter((pf) => bookingStage(pf) === 'fournisseur').sort((a, b) => waitDays(b) - waitDays(a));
  const atForwarder = list.filter((pf) => bookingStage(pf) === 'transitaire').sort((a, b) => waitDays(b) - waitDays(a));
  const toValidate = list.filter((pf) => bookingStage(pf) === 'validation');
  const waiting = [...atSupplier, ...atForwarder];
  const booked = list.filter((pf) => pf.booking?.answeredAt && !shipped(pf)).sort((a, b) => (a.booking!.etd ?? a.etd).localeCompare(b.booking!.etd ?? b.etd));
  const gone = list.filter((pf) => pf.booking?.answeredAt && shipped(pf));

  const delays = state.proformas
    .filter((pf) => pf.booking?.answeredAt)
    .map((pf) => diffDays(pf.booking!.answeredAt!.slice(0, 10), pf.booking!.requestedAt.slice(0, 10)));
  const remindRemove = (pf: Proforma, w: number) =>
    canBook && (
      <>
        <button
          className={`btn sm ${w > WAIT_ALERT ? 'danger' : ''}`}
          onClick={() => {
            dispatch({ type: 'remindPfBooking', proformaId: pf.id });
            const sup = byId(state.suppliers, pf.supplierId).shortName;
            toast(pf.booking!.ackAt ? `Relance envoyée à ${pf.booking!.forwarder} et ${sup}` : `Relance envoyée à ${sup}`);
          }}
        >
          <BellRing size={14} /> Relancer
        </button>
        <button
          className="btn sm ghost"
          title="Annuler la demande"
          aria-label="Annuler la demande"
          onClick={() => {
            dispatch({ type: 'cancelPfBooking', proformaId: pf.id });
            toast('Demande de booking annulée');
          }}
        >
          <Ban size={14} />
        </button>
      </>
    );
  const avgDelay = delays.length ? delays.reduce((a, b) => a + b, 0) / delays.length : 0;
  const urgent = toAsk.filter((pf) => diffDays(pf.etd, TODAY) < 21).length;
  const late = waiting.filter((pf) => waitDays(pf) > WAIT_ALERT).length;

  return (
    <div className="pf-page">
      <h1 className="pf-title">Booking</h1>

      <div className="bk-kpis">
        <div className="kpi-box">
          <small>À demander</small>
          <b>{toAsk.length}</b>
          <span className={urgent ? 'red' : ''}>{urgent ? `${urgent} départ(s) sous 3 semaines` : 'Rien d’urgent'}</span>
        </div>
        <div className="kpi-box">
          <small>Attente fournisseur / transitaire / à valider</small>
          <b>
            {atSupplier.length} / {atForwarder.length} / {toValidate.length}
          </b>
          <span className={late ? 'red' : ''}>{late ? `${late} sans réponse depuis +${WAIT_ALERT} j` : 'Réponses dans les temps'}</span>
        </div>
        <div className="kpi-box">
          <small>Délai moyen demande → booking</small>
          <b>{delays.length ? `${dec(avgDelay, 1)} j` : '—'}</b>
          <span>sur {delays.length} booking(s)</span>
        </div>
        <div className="kpi-box">
          <small>Bookés à partir</small>
          <b>{booked.length}</b>
          <span>{booked.reduce((t, pf) => t + pfContainers(state, pf.id).length, 0)} container(s)</span>
        </div>
      </div>

      <div className="pf-toolbar">
        <label className="pf-search">
          <Search size={20} />
          <input placeholder="Proforma, fournisseur, n° de booking, conteneur…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>

      <Stage icon={<CalendarPlus size={34} strokeWidth={1.8} />} tone="orange" title="À demander" sub="Proformas signées sans booking : envoyer la demande au fournisseur" items={toAsk}>
        {toAsk.map((pf) => {
          const cbm = proformaTotals(state, pf).cbm;
          const d = diffDays(pf.etd, TODAY);
          return (
            <Row key={pf.id} s={state} pf={pf}>
              <div className="bk-info">
                <small>Départ prévu</small>
                <b className={d < 21 ? 'red' : ''}>
                  {fshort(pf.etd)} · {weekLabel(pf.etd)}
                </b>
                <span>
                  {dec(cbm, 1)} m³ · ≈ {estimateContainers(cbm)} × 40HC
                </span>
              </div>
              <div className="bk-actions">
                {canBook && (
                  <button className="btn sm primary" onClick={() => setAsking(pf)}>
                    <Send size={14} /> Demande de booking
                  </button>
                )}
              </div>
            </Row>
          );
        })}
      </Stage>

      <Stage icon={<CalendarClock size={34} strokeWidth={1.8} />} tone="violet" title="Attente fournisseur" sub="Le fournisseur prend en compte : plan de chargement, date de marchandise prête, boîtes demandées au transitaire" items={atSupplier}>
        {atSupplier.map((pf) => {
          const b = pf.booking!;
          const w = waitDays(pf);
          return (
            <Row key={pf.id} s={state} pf={pf}>
              <div className="bk-info">
                <small>
                  {b.containers} × 40HC · chargement souhaité {fshort(b.dateWanted)}
                </small>
                <b className={w > WAIT_ALERT ? 'red' : ''}>Pas encore pris en compte · {w} j</b>
                <span>
                  Envoyée le {fstamp(b.requestedAt)} · {b.reminders.length ? `${b.reminders.length} relance(s), dernière ${fstamp(b.reminders.at(-1))}` : 'aucune relance'}
                </span>
              </div>
              <div className="bk-actions">{remindRemove(pf, w)}</div>
            </Row>
          );
        })}
      </Stage>

      <Stage icon={<Boxes size={34} strokeWidth={1.8} />} tone="violet" title="Attente transitaire" sub="Le transitaire choisi par JONAS prépare sa proposition (ou le fournisseur la saisit pour lui)" items={atForwarder}>
        {atForwarder.map((pf) => {
          const b = pf.booking!;
          const w = waitDays(pf);
          return (
            <Row key={pf.id} s={state} pf={pf}>
              <div className="bk-info">
                <small>
                  {pfContainers(state, pf.id).length || b.containers} × 40HC · transmis à {b.forwarder} le {fshort(b.ackAt!.slice(0, 10))}
                </small>
                <b className={w > WAIT_ALERT ? 'red' : ''}>
                  Marchandise prête le {fshort(b.readyDate)} · attente proposition {w} j
                </b>
                <span>
                  Pris en compte par {b.ackBy}
                  {b.ackNote ? ` · « ${b.ackNote} »` : ''}
                  {b.reminders.length ? ` · ${b.reminders.length} relance(s)` : ''}
                </span>
                <LastRejection pf={pf} />
              </div>
              <div className="bk-actions">{remindRemove(pf, w)}</div>
            </Row>
          );
        })}
      </Stage>

      <Stage icon={<BadgeCheck size={34} strokeWidth={1.8} />} tone="blue" title="À valider" sub="Proposition du transitaire : à accepter par le fournisseur et par JONAS" items={toValidate}>
        {toValidate.map((pf) => (
          <Row key={pf.id} s={state} pf={pf} carrier={pf.booking!.proposal!.carrier}>
            <div className="bk-span">
              <BookingReview pf={pf} />
            </div>
          </Row>
        ))}
      </Stage>

      <Stage icon={<CalendarCheck size={34} strokeWidth={1.8} />} tone="green" title="Bookés" sub="Proposition acceptée par le fournisseur et JONAS : compagnie, navire et dates réelles" items={booked}>
        {booked.map((pf) => (
          <BookedRow key={pf.id} s={state} pf={pf} canShip={canBook} />
        ))}
      </Stage>

      {gone.length > 0 && (
        <Stage icon={<Anchor size={30} strokeWidth={1.8} />} tone="grey" title="Partis" sub="Historique des bookings" items={gone} defaultOpen={false}>
          {gone.map((pf) => (
            <BookedRow key={pf.id} s={state} pf={pf} />
          ))}
        </Stage>
      )}

      {asking && <BookingRequestDialog pf={asking} onClose={() => setAsking(null)} />}
    </div>
  );
}

function BookedRow({ s, pf, canShip }: { s: State; pf: Proforma; canShip?: boolean }) {
  const { dispatch } = useStore();
  const b = pf.booking!;
  const cs = pfContainers(s, pf.id);
  const toShip = cs.filter((c) => c.status === 'booke');
  return (
    <Row s={s} pf={pf} carrier={b.carrier}>
      <div className="bk-info">
        <small>
          {cs.length} container(s) · {cs.map((c) => c.number ?? c.id).join(', ')}
          {b.bookingNo ? ` · ${b.bookingNo}` : ''}
        </small>
        <b>
          Chargement {fshort(b.loadingDate)} · départ {fshort(b.etd)} · arrivée {fshort(b.eta)}
        </b>
        <span>
          {b.bookedBy === 'transitaire' ? `Proposé par ${b.forwarder}` : `Saisi par ${b.bookedBy === 'fournisseur' ? 'le fournisseur' : 'JONAS'} pour ${b.forwarder ?? 'le transitaire'}`}, accepté le {fstamp(b.answeredAt)}
          {b.vessel ? ` · ${b.vessel}` : ''}
          {b.supplierNote ? ` · « ${b.supplierNote} »` : ''}
        </span>
        {toShip.length > 0 && toShip.some((c) => !c.number) && <span className="orange bold">N° de conteneur à venir ({b.forwarder ?? 'transitaire'})</span>}
      </div>
      <div className="bk-actions">
        {canShip && toShip.length > 0 && (
          <button
            className="btn sm"
            onClick={() => {
              toShip.forEach((c) => dispatch({ type: 'ship', containerId: c.id }));
              toast(`${pf.id} parti : ${toShip.length} container(s) en transit`);
            }}
          >
            <Ship size={14} /> Parti
          </button>
        )}
        <Link className="btn sm ghost" to={`/proformas/${pf.id}`}>
          Voir
        </Link>
      </div>
    </Row>
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
  items: unknown[];
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
          {items.length} proforma{items.length > 1 ? 's' : ''}
        </span>
        <span className="pf-chevron">{open ? <ChevronUp size={24} /> : <ChevronDown size={24} />}</span>
      </header>
      {open && <div className="pf-body bk-body">{items.length ? children : <div className="empty small">Rien ici.</div>}</div>}
    </section>
  );
}

function Row({ s, pf, children, carrier }: { s: State; pf: Proforma; children: ReactNode; carrier?: string }) {
  const sup = byId(s.suppliers, pf.supplierId);
  const top = [...pf.lines].sort((a, b) => b.qty - a.qty)[0];
  const p = top ? byId(s.products, top.productId) : undefined;
  return (
    <div className="bk-row">
      <div className="bk-ctn">
        {p && <ProductThumb product={p} size={44} />}
        <div>
          <span className="bk-num">
            <Link to={`/proformas/${pf.id}`}>
              <strong>{pf.id}</strong>
            </Link>
            {shipmentLabel(s, pf) && <span className="ct-type">{shipmentLabel(s, pf)}</span>}
          </span>
          <small>
            {pf.title ?? (p ? p.name : '')} · {pf.lines.length} réf.
          </small>
        </div>
      </div>
      <div className="bk-sup">
        <SupplierLogo supplier={sup} size={32} />
        <span>
          <b>{sup.shortName}</b>
          <small>
            {sup.port} → Le Havre
          </small>
        </span>
      </div>
      <div className="bk-who">{carrier ? <CarrierBadge carrier={carrier} /> : <ProformaStatusPill status={pf.status} />}</div>
      {children}
    </div>
  );
}
