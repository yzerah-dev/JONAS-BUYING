import { useState, type ReactNode } from 'react';
import { Anchor, CalendarCheck, Check, ChevronDown, ChevronUp, ClipboardCheck, FileUp, Search, Ship, Truck, Warehouse, X } from 'lucide-react';
import { byId, containerCbm, containerEta, containerEtd, containerProformas, containerQty, currentUser, useStore, type State } from '../data/store';
import type { Container } from '../data/types';
import { ProductThumb, SupplierLogo } from '../components/ui';
import { toast } from '../components/ui-shared';
import { CarrierBadge } from '../components/ContainerCard';
import { TODAY, addDays, dec, diffDays, fdate, fshort, num, weekLabel } from '../lib/format';
import { pressable } from '../lib/a11y';
import { DOC_LABEL, REQUIRED_DOCS, fwdStages } from './fwd';

type Dialog = { mode: 'confirm' | 'eta' | 'delivery'; c: Container } | null;

export default function ForwarderHome() {
  const { state } = useStore();
  const user = currentUser(state);
  const [q, setQ] = useState('');
  const [dialog, setDialog] = useState<Dialog>(null);
  const st = fwdStages(state, user);
  const match = (c: Container) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    const sup = byId(state.suppliers, c.supplierId);
    return `${c.id} ${c.number ?? ''} ${c.bookingNo ?? ''} ${c.booking?.vessel ?? ''} ${sup.name} ${containerProformas(c).join(' ')}`.toLowerCase().includes(s);
  };
  const [toConfirm, ready, atSea, arrived] = [st.toConfirm, st.ready, st.atSea, st.arrived].map((l) => l.filter(match));
  const soon = st.atSea.filter((c) => diffDays(containerEta(c), TODAY) <= 7).length;

  return (
    <div className="pf-page">
      <div className="page-head">
        <h1>Mes conteneurs</h1>
        <span className="page-sub">Bookings JONAS confiés à {user.forwarder} : confirmation, départ, suivi, douane et livraison.</span>
      </div>

      <div className="bk-kpis">
        <div className="kpi-box">
          <small>À confirmer</small>
          <b>{st.toConfirm.length}</b>
          <span className={st.toConfirm.length ? 'orange' : ''}>{st.toConfirm.length ? 'N° de conteneur et navire attendus' : 'Tout est confirmé'}</span>
        </div>
        <div className="kpi-box">
          <small>Prêts au départ</small>
          <b>{st.ready.length}</b>
          <span>en attente de chargement</span>
        </div>
        <div className="kpi-box">
          <small>En mer</small>
          <b>{st.atSea.length}</b>
          <span className={soon ? 'orange' : ''}>{soon ? `${soon} arrivée(s) sous 7 j` : 'Aucune arrivée proche'}</span>
        </div>
        <div className="kpi-box">
          <small>Arrivés</small>
          <b>{st.arrived.length}</b>
          <span>{st.arrived.filter((c) => c.customs === 'dedouane').length} dédouané(s)</span>
        </div>
      </div>

      <div className="pf-toolbar">
        <label className="pf-search">
          <Search size={20} />
          <input placeholder="N° conteneur, booking, navire, fournisseur, proforma…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>

      <Stage icon={<ClipboardCheck size={34} strokeWidth={1.8} />} tone="orange" title="Bookings à confirmer" sub="Booké par le fournisseur : confirmez le n° de conteneur, le navire et le cut-off" items={toConfirm}>
        {toConfirm.map((c) => (
          <Row key={c.id} s={state} c={c}>
            <Info c={c} s={state} />
            <div className="bk-actions">
              <button className="btn sm primary" onClick={() => setDialog({ mode: 'confirm', c })}>
                <Check size={14} /> Confirmer
              </button>
            </div>
          </Row>
        ))}
      </Stage>

      <Stage icon={<CalendarCheck size={34} strokeWidth={1.8} />} tone="violet" title="Prêts au départ" sub="Booking confirmé, en attente du chargement et du départ" items={ready}>
        {ready.map((c) => (
          <ShipRow key={c.id} s={state} c={c} onDialog={setDialog} />
        ))}
      </Stage>

      <Stage icon={<Ship size={34} strokeWidth={1.8} />} tone="green" title="En mer" sub="Suivi de l’ETA, documents, dédouanement et livraison à l’entrepôt" items={atSea}>
        {atSea.map((c) => (
          <ShipRow key={c.id} s={state} c={c} onDialog={setDialog} />
        ))}
      </Stage>

      <Stage icon={<Anchor size={30} strokeWidth={1.8} />} tone="grey" title="Arrivés" sub="Historique : dédouanement et livraison" items={arrived} defaultOpen={false}>
        {arrived.map((c) => (
          <ShipRow key={c.id} s={state} c={c} onDialog={setDialog} />
        ))}
      </Stage>

      {dialog && <FwdDialog key={dialog.c.id + dialog.mode} mode={dialog.mode} c={dialog.c} onClose={() => setDialog(null)} />}
    </div>
  );
}

/** Ligne d'un conteneur confirmé : dates, documents, douane, livraison et action suivante */
function ShipRow({ s, c, onDialog }: { s: State; c: Container; onDialog: (d: Dialog) => void }) {
  const { dispatch } = useStore();
  const eta = containerEta(c);
  const left = diffDays(eta, TODAY);
  const missing = REQUIRED_DOCS.filter((d) => !c.documents.includes(d));
  return (
    <Row s={s} c={c} carrier>
      <div className="bk-info">
        <small>
          <Ship size={12} /> {c.booking?.vessel ?? 'Navire à préciser'} · {c.bookingNo ?? '—'}
        </small>
        {c.status === 'booke' ? (
          <b>
            Départ {fshort(containerEtd(c))} · cut-off {fshort(c.booking?.cutoff)}
          </b>
        ) : (
          <b className={c.etaRevised && c.status === 'en_transit' ? 'red' : ''}>
            Arrivée {c.portTo} {fshort(eta)}
            {c.status === 'en_transit' ? ` · J-${Math.max(0, left)}` : ''}
          </b>
        )}
        <span className="fw-tags">
          {c.status !== 'booke' &&
            REQUIRED_DOCS.map((d) =>
              c.documents.includes(d) ? (
                <span key={d} className="fw-doc ok">
                  <Check size={11} /> {DOC_LABEL[d]}
                </span>
              ) : (
                <button
                  key={d}
                  className="fw-doc missing"
                  title={`Déposer : ${DOC_LABEL[d]}`}
                  onClick={() => {
                    dispatch({ type: 'addContainerDoc', containerId: c.id, doc: d });
                    toast(`${DOC_LABEL[d]} déposé`);
                  }}
                >
                  <FileUp size={11} /> {DOC_LABEL[d]}
                </button>
              ),
            )}
          {c.customs && <span className={`fw-doc ${c.customs === 'dedouane' ? 'ok' : 'wait'}`}>{c.customs === 'dedouane' ? 'Dédouané' : 'Douane en cours'}</span>}
          {c.deliveryDate && (
            <span className="fw-doc ok">
              <Warehouse size={11} /> Livraison {fshort(c.deliveryDate)}
            </span>
          )}
        </span>
      </div>
      <div className="bk-actions">
        {c.status === 'booke' && (
          <>
            <button className="btn sm ghost" onClick={() => onDialog({ mode: 'confirm', c })}>
              Modifier
            </button>
            <button
              className="btn sm primary"
              onClick={() => {
                dispatch({ type: 'ship', containerId: c.id });
                toast(`${c.number ?? c.id} parti : en mer`);
              }}
            >
              <Ship size={14} /> Départ effectué
            </button>
          </>
        )}
        {c.status === 'en_transit' && (
          <>
            <button className="btn sm ghost" onClick={() => onDialog({ mode: 'eta', c })}>
              Nouvelle ETA
            </button>
            {!c.customs && (
              <button
                className={`btn sm ${left <= 7 ? 'primary' : ''}`}
                disabled={missing.length > 0}
                title={missing.length ? `Documents manquants : ${missing.map((d) => DOC_LABEL[d]).join(', ')}` : undefined}
                onClick={() => {
                  dispatch({ type: 'setCustoms', containerId: c.id, status: 'en_cours' });
                  toast('Dédouanement lancé');
                }}
              >
                Lancer la douane
              </button>
            )}
          </>
        )}
        {c.customs === 'en_cours' && (
          <button
            className="btn sm primary"
            onClick={() => {
              dispatch({ type: 'setCustoms', containerId: c.id, status: 'dedouane' });
              toast('Marchandise dédouanée');
            }}
          >
            <Check size={14} /> Dédouané
          </button>
        )}
        {c.customs === 'dedouane' && !c.deliveryDate && (
          <button className="btn sm primary" onClick={() => onDialog({ mode: 'delivery', c })}>
            <Truck size={14} /> Planifier la livraison
          </button>
        )}
      </div>
    </Row>
  );
}

function Info({ c, s }: { c: Container; s: State }) {
  const pf = s.proformas.find((p) => containerProformas(c).includes(p.id));
  const b = pf?.booking;
  return (
    <div className="bk-info">
      <small>
        Booké par le fournisseur {b?.answeredAt ? `le ${fdate(b.answeredAt.slice(0, 10))}` : ''} · {c.carrier ?? 'compagnie à préciser'}
        {c.bookingNo ? ` · ${c.bookingNo}` : ''}
      </small>
      <b>
        Chargement {fshort(c.loading?.date ?? b?.loadingDate)} · départ {fshort(c.etdPlanned)} ({weekLabel(c.etdPlanned)})
      </b>
      <span>Arrivée prévue {fshort(c.etaPlanned)} · livraison {c.warehouse}</span>
    </div>
  );
}

function Stage({ icon, tone, title, sub, items, children, defaultOpen = true }: { icon: ReactNode; tone: string; title: string; sub: string; items: unknown[]; children: ReactNode; defaultOpen?: boolean }) {
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

function Row({ s, c, children, carrier }: { s: State; c: Container; children: ReactNode; carrier?: boolean }) {
  const sup = byId(s.suppliers, c.supplierId);
  const top = [...c.allocations].sort((a, b) => b.qty - a.qty)[0];
  const p = top ? byId(s.products, top.productId) : undefined;
  return (
    <div className="bk-row">
      <div className="bk-ctn">
        {p && <ProductThumb product={p} size={44} />}
        <div>
          <span className="bk-num">
            {c.number ? <strong>{c.number}</strong> : <strong className="wait">N° à venir</strong>}
            <span className="ct-type">{c.type}</span>
          </span>
          <small>
            {containerProformas(c).join(', ')} · {num(containerQty(c))} pcs · {dec(containerCbm(s, c), 1)} m³
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
      <div className="bk-who">{carrier ? <CarrierBadge carrier={c.carrier} /> : <span className="pill orange">À confirmer</span>}</div>
      {children}
    </div>
  );
}

const CARRIERS_PREFIX: Record<string, string> = { MSC: 'MSCU', 'CMA CGM': 'CMAU', Maersk: 'MSKU', COSCO: 'CSNU', 'Hapag-Lloyd': 'HLXU' };

function FwdDialog({ mode, c, onClose }: { mode: 'confirm' | 'eta' | 'delivery'; c: Container; onClose: () => void }) {
  const { state, dispatch } = useStore();
  const sup = byId(state.suppliers, c.supplierId);
  const [number, setNumber] = useState(c.number ?? CARRIERS_PREFIX[c.carrier ?? ''] ?? '');
  const [seal, setSeal] = useState(c.seal ?? '');
  const [vessel, setVessel] = useState(c.booking?.vessel ?? '');
  const [cutoff, setCutoff] = useState(c.booking?.cutoff ?? addDays(c.etdPlanned, -3));
  const [etd, setEtd] = useState(c.etdPlanned);
  const [date, setDate] = useState(mode === 'eta' ? containerEta(c) : addDays(containerEta(c), 4));
  const title = { confirm: 'Confirmer le booking', eta: 'Nouvelle ETA', delivery: 'Planifier la livraison' }[mode];

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'confirm') {
      if (!/^[A-Z]{4}\d{7}$/.test(number.trim().toUpperCase())) return toast('N° de conteneur attendu : 4 lettres + 7 chiffres (ex. MSCU1234567)');
      if (!vessel.trim()) return toast('Indiquez le navire');
      dispatch({ type: 'fwdConfirm', containerId: c.id, number: number.trim().toUpperCase(), seal: seal.trim() || undefined, vessel: vessel.trim().toUpperCase(), cutoff, etd });
      toast(`Booking confirmé : ${number.trim().toUpperCase()}`);
    } else if (mode === 'eta') {
      dispatch({ type: 'reviseEta', containerId: c.id, eta: date });
      toast(`ETA mise à jour : ${fdate(date)}`);
    } else {
      dispatch({ type: 'planDelivery', containerId: c.id, date });
      toast(`Livraison planifiée le ${fdate(date)} à ${c.warehouse}`);
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
              {c.number ?? c.id} · {sup.shortName} · {c.portFrom} → {c.portTo} · {containerProformas(c).join(', ')}
            </span>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fermer">
            <X size={20} />
          </button>
        </header>
        <div className="bk-form">
          {mode === 'confirm' ? (
            <>
              <label htmlFor="fw-num">
                N° de conteneur
                <input id="fw-num" className="input" autoFocus placeholder="MSCU1234567" value={number} onChange={(e) => setNumber(e.target.value)} />
              </label>
              <label htmlFor="fw-seal">
                N° de plomb (facultatif)
                <input id="fw-seal" className="input" value={seal} onChange={(e) => setSeal(e.target.value)} />
              </label>
              <label htmlFor="fw-vessel">
                Navire
                <input id="fw-vessel" className="input" placeholder="Ex. MSC ARINA" value={vessel} onChange={(e) => setVessel(e.target.value)} />
              </label>
              <label htmlFor="fw-cut">
                Cut-off terminal
                <input id="fw-cut" className="input" type="date" value={cutoff} onChange={(e) => setCutoff(e.target.value)} />
              </label>
              <label htmlFor="fw-etd">
                Départ (ETD)
                <input id="fw-etd" className="input" type="date" value={etd} onChange={(e) => setEtd(e.target.value)} />
              </label>
              <p className="small muted">
                Booking fournisseur : {c.carrier ?? 'compagnie à préciser'} {c.bookingNo ? `· ${c.bookingNo}` : ''} · chargement {fshort(c.loading?.date)}
              </p>
            </>
          ) : (
            <>
              <label htmlFor="fw-date">
                {mode === 'eta' ? `Nouvelle ETA à ${c.portTo}` : `Livraison à ${c.warehouse}`}
                <input id="fw-date" className="input" type="date" autoFocus value={date} onChange={(e) => setDate(e.target.value)} />
              </label>
              <p className="small muted">
                {mode === 'eta' ? `ETA actuelle ${fdate(containerEta(c))} · JONAS est prévenu automatiquement.` : 'Rendez-vous transmis à l’entrepôt JONAS pour la réception.'}
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
            <Check size={16} /> {mode === 'confirm' ? 'Confirmer le booking' : 'Enregistrer'}
          </button>
        </footer>
      </form>
    </div>
  );
}
