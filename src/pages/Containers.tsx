import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Calendar, CalendarClock, Check, ChevronLeft, ChevronRight, FileText, Home, Mail, Phone, Search, Ship, SlidersHorizontal, Truck, User, X } from 'lucide-react';
import {
  CONTAINER_STATUS_LABEL,
  byId,
  containerCapacity,
  containerCbm,
  containerEta,
  containerEtd,
  containerProformas,
  containerQty,
  containerValue,
  lineCbm,
  CONTAINER_PAYLOAD,
  containerWeight,
  useAuth,
  useStore,
} from '../data/store';
import { CONTAINER_STATUSES, FORWARDERS, type Container, type ContainerStatus, type Forwarder } from '../data/types';
import ReceptionDialog from '../components/ReceptionDialog';
import ContainerCard from '../components/ContainerCard';
import { ContainerStatusPill, Pill, ProductThumb, Progress, Seg, SupplierLogo } from '../components/ui';
import { toast } from '../components/ui-shared';
import { TODAY, addDays, dec, diffDays, eur, fshort, m3, monthKey, monthLabel, num, shiftMonth, weekKey, weekLabel, weekRange } from '../lib/format';
import Combobox from '../components/Combobox';

const GROUP_COLOR: Record<ContainerStatus, string> = {
  a_booker: 'orange',
  booking_demande: 'violet',
  booke: 'green',
  en_transit: 'blue',
  arrive: 'teal',
};

const STATUS_ICON: Record<ContainerStatus, { icon: typeof Calendar; color: string }> = {
  a_booker: { icon: Calendar, color: 'var(--orange)' },
  booking_demande: { icon: CalendarClock, color: 'var(--violet)' },
  booke: { icon: Check, color: 'var(--green)' },
  en_transit: { icon: Truck, color: 'var(--blue)' },
  arrive: { icon: Home, color: 'var(--green-dark)' },
};

export default function Containers() {
  const { state, dispatch } = useStore();
  const auth = useAuth();
  const canBook = auth.can('logistics.booking');
  const [receiving, setReceiving] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();
  const selId = params.get('c');
  const [period, setPeriod] = useState<'mois' | 'semaine'>('mois');
  const [basis, setBasis] = useState<'eta' | 'etd'>('eta');
  const [month, setMonth] = useState(() => {
    const c = selId ? state.containers.find((x) => x.id === selId) : undefined;
    return monthKey(c ? containerEta(c) : '2026-12-01');
  });
  const [weekRef, setWeekRef] = useState('2026-12-14');
  const [statusF, setStatusF] = useState<'all' | ContainerStatus>('all');
  const [supplierF, setSupplierF] = useState('all');
  const [fwdF, setFwdF] = useState('all');
  const [q, setQ] = useState('');
  const [all, setAll] = useState(false);

  const dateOf = (c: Container) => (basis === 'eta' ? containerEta(c) : containerEtd(c));
  const inPeriod = (c: Container) => (all ? true : period === 'mois' ? monthKey(dateOf(c)) === month : weekKey(dateOf(c)) === weekKey(weekRef));

  // Conteneurs de la période et des filtres (hors statut) : sert aux compteurs des pastilles
  const base = useMemo(
    () =>
      state.containers
        .filter(inPeriod)
        .filter((c) => supplierF === 'all' || c.supplierId === supplierF)
        .filter((c) => fwdF === 'all' || c.forwarder === fwdF)
        .filter((c) => {
          const s = q.trim().toLowerCase();
          if (!s) return true;
          return `${c.id} ${c.number ?? ''} ${c.bookingNo ?? ''} ${containerProformas(c).join(' ')} ${byId(state.suppliers, c.supplierId).name}`.toLowerCase().includes(s);
        })
        .sort((a, b) => dateOf(a).localeCompare(dateOf(b))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, month, weekRef, period, basis, supplierF, fwdF, q, all],
  );
  const filtered = statusF === 'all' ? base : base.filter((c) => c.status === statusF);
  const activeFilters = (supplierF !== 'all' ? 1 : 0) + (fwdF !== 'all' ? 1 : 0) + (basis === 'etd' ? 1 : 0);
  const [showFilters, setShowFilters] = useState(false);

  const sel = state.containers.find((c) => c.id === selId);
  const select = (id: string | null) => {
    if (id) params.set('c', id);
    else params.delete('c');
    setParams(params);
    if (id) revealPanel();
  };

  const cbmOf = (list: Container[]) => list.reduce((s, c) => s + containerCbm(state, c), 0);
  const transitValue = filtered.filter((c) => c.status === 'en_transit').reduce((s, c) => s + containerValue(state, c), 0);

  return (
    <>
      <div className="pf-page ctn-head">
        <h1 className="pf-title">Conteneurs</h1>

        <div className="pf-toolbar">
          <label className="pf-search">
            <Search size={20} />
            <input placeholder="N° conteneur, booking, proforma, fournisseur…" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <div style={{ position: 'relative' }}>
            <button className={`pf-btn ${activeFilters ? 'on' : ''}`} onClick={() => setShowFilters(!showFilters)} aria-expanded={showFilters}>
              <SlidersHorizontal size={19} /> Filtrer{activeFilters ? ` (${activeFilters})` : ''}
            </button>
            {showFilters && (
              <div className="card pf-popover ctn-filters">
                <div className="ctn-f-row">
                  <span className="xs muted">Dates</span>
                  <Seg
                    value={basis}
                    onChange={setBasis}
                    options={[
                      { id: 'eta', label: 'Arrivée' },
                      { id: 'etd', label: 'Départ' },
                    ]}
                  />
                </div>
                <label className="ctn-f-row" htmlFor="ctn-sup">
                  <span className="xs muted">Fournisseur</span>
                  <Combobox id="ctn-sup" value={supplierF} onChange={setSupplierF} placeholder="Tapez un fournisseur…" options={[{ id: 'all', label: 'Tous' }, ...state.suppliers.map((s) => ({ id: s.id, label: s.shortName, sub: `${s.flag} ${s.city}`, keywords: `${s.name} ${s.shortName}` }))]} />
                </label>
                <label className="ctn-f-row" htmlFor="ctn-fwd">
                  <span className="xs muted">Transitaire</span>
                  <select id="ctn-fwd" className="input" value={fwdF} onChange={(e) => setFwdF(e.target.value)} aria-label="Transitaire">
                    <option value="all">Tous</option>
                    {FORWARDERS.map((f) => (
                      <option key={f}>{f}</option>
                    ))}
                  </select>
                </label>
                <p className="xs muted" style={{ margin: 0 }}>
                  {basis === 'eta'
                    ? 'Arrivée : conteneurs dont l’arrivée (prévue, révisée ou réelle) tombe dans la période, même partis avant ou pas encore bookés.'
                    : 'Départ : conteneurs dont le départ (prévu ou réel) tombe dans la période.'}
                </p>
                {activeFilters > 0 && (
                  <button
                    className="btn sm ghost"
                    onClick={() => {
                      setSupplierF('all');
                      setFwdF('all');
                      setBasis('eta');
                    }}
                  >
                    Réinitialiser
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="ctn-period">
          <div className="ctn-nav">
            <button aria-label="Période précédente" disabled={all} onClick={() => (period === 'mois' ? setMonth(shiftMonth(month, -1)) : setWeekRef(addDays(weekRef, -7)))}>
              <ChevronLeft size={20} />
            </button>
            <span>
              <b>{all ? 'Tous les conteneurs' : period === 'mois' ? monthLabel(month) : `Semaine ${weekLabel(weekRef).slice(1)}`}</b>
              <small>{all ? 'toutes dates' : period === 'mois' ? `par ${basis === 'eta' ? 'arrivée' : 'départ'}` : weekRange(weekRef)}</small>
            </span>
            <button aria-label="Période suivante" disabled={all} onClick={() => (period === 'mois' ? setMonth(shiftMonth(month, 1)) : setWeekRef(addDays(weekRef, 7)))}>
              <ChevronRight size={20} />
            </button>
          </div>
          <div className="pf-views ctn-range">
            {(
              [
                ['mois', 'Mois'],
                ['semaine', 'Semaine'],
                ['tout', 'Tout'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                className={(id === 'tout' ? all : !all && period === id) ? 'active' : ''}
                onClick={() => {
                  if (id === 'tout') setAll(true);
                  else {
                    setAll(false);
                    setPeriod(id);
                  }
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="pf-chips ctn-chips">
          <button className={`pf-chip ${statusF === 'all' ? 'active' : ''}`} onClick={() => setStatusF('all')}>
            Tous <b>{base.length}</b>
          </button>
          {CONTAINER_STATUSES.map((st) => {
            const n = base.filter((c) => c.status === st).length;
            const Icon = STATUS_ICON[st].icon;
            return (
              <button key={st} className={`pf-chip ${statusF === st ? 'active' : ''} ${n ? '' : 'zero'}`} onClick={() => setStatusF(st)}>
                <Icon size={18} style={{ color: statusF === st ? undefined : STATUS_ICON[st].color }} /> {CONTAINER_STATUS_LABEL[st]} <b>{n}</b>
              </button>
            );
          })}
        </div>

        <div className="ctn-summary">
          <b>{filtered.length}</b> conteneur{filtered.length > 1 ? 's' : ''} · <b>{num(cbmOf(filtered))}</b> m³
          {transitValue > 0 && (
            <>
              {' '}
              · <b>{eur(transitValue)}</b> en transit
            </>
          )}
        </div>
      </div>

      <div className="split">
        <div>
          {filtered.length === 0 && <div className="card empty">Aucun conteneur sur cette période.</div>}

          {CONTAINER_STATUSES.map((s) => {
            const list = filtered.filter((c) => c.status === s);
            if (!list.length) return null;
            return (
              <div key={s} className="card mb">
                <div className={`group-head ${GROUP_COLOR[s]}`}>
                  {CONTAINER_STATUS_LABEL[s]} ({list.length})
                  <div className="grow" />
                  <span className="small">
                    {list.length} conteneurs | {num(cbmOf(list))} m³
                  </span>
                  {s === 'a_booker' && list.some((c) => diffDays(c.etdPlanned, TODAY) < 21) && (
                    <Pill color="red">⚠ {list.filter((c) => diffDays(c.etdPlanned, TODAY) < 21).length} urgent(s)</Pill>
                  )}
                </div>
                <div className="ct-list">
                  {list.map((c) => {
                    return (
                      <ContainerCard
                        key={c.id}
                        s={state}
                        c={c}
                        selected={sel?.id === c.id}
                        onOpen={() => select(c.id)}
                        actions={
                          <>
                              {s === 'a_booker' && canBook && (
                                <Link className="btn sm" to="/booking" onClick={(e) => e.stopPropagation()}>
                                  Demande de booking
                                </Link>
                              )}
                              {s === 'booking_demande' && <Pill color="violet">{c.planValidated ? `Attente ${c.forwarder ?? 'transitaire'}` : 'Attente fournisseur'}</Pill>}
                              {s === 'booke' && canBook && (
                                <button className="btn sm" onClick={() => dispatch({ type: 'ship', containerId: c.id })}>
                                  <Ship size={12} /> Parti
                                </button>
                              )}
                              {s === 'en_transit' && (
                                <div className="row" style={{ gap: 4 }}>
                                  {canBook && <button className="btn sm" onClick={() => setReceiving(c.id)}>
                                    Réceptionner
                                  </button>}
                                </div>
                              )}
                              {s === 'arrive' && <Pill color="green">Réceptionné {fshort(c.receivedOn)}</Pill>}
                          </>
                        }
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <div className="sticky-panel">{sel ? <ContainerDetail c={sel} onClose={() => select(null)} /> : <div className="card empty">Sélectionnez un conteneur pour voir son détail.</div>}</div>
      </div>
      {receiving && <ReceptionDialog c={state.containers.find((x) => x.id === receiving)!} onClose={() => setReceiving(null)} />}
    </>
  );
}

function ContainerDetail({ c, onClose }: { c: Container; onClose: () => void }) {
  const { state, dispatch } = useStore();
  const auth = useAuth();
  const [tab, setTab] = useState<'produits' | 'documents' | 'historique'>('produits');
  const [eta, setEta] = useState(containerEta(c));
  const sup = byId(state.suppliers, c.supplierId);
  const cbm = containerCbm(state, c);
  const order: ContainerStatus[] = ['a_booker', 'booking_demande', 'booke', 'en_transit', 'arrive'];
  const idx = order.indexOf(c.status);
  const steps = [
    { l: 'Commande', d: '' },
    { l: 'Booking', d: c.bookingNo ?? '' },
    { l: 'Chargement', d: `${fshort(containerEtd(c))} (${weekLabel(containerEtd(c))})` },
    { l: 'En transit', d: '' },
    { l: 'Arrivée', d: `${fshort(containerEta(c))} (${weekLabel(containerEta(c))})` },
  ];
  const reached = [true, idx >= 2, idx >= 3, idx >= 3, idx >= 4];

  return (
    <div className="card pad">
      <div className="row">
        <div className="thumb" style={{ width: 70, height: 52, background: 'linear-gradient(135deg,#2a63c7,#183f88)', color: '#fff', fontWeight: 800, fontSize: 12 }}>
          {c.type}
        </div>
        <div className="grow">
          <div className="bold" style={{ fontSize: 18 }}>
            {c.number ?? c.id}
          </div>
          <div className="xs muted">
            {c.type} · Booking : {c.bookingNo ?? '—'}
          </div>
        </div>
        <ContainerStatusPill status={c.status} />
        <button className="btn ghost sm" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      <div className="row mt">
        <SupplierLogo supplier={sup} size={40} />
        <div className="col small">
          <Link to={`/fournisseurs/${sup.id}`} className="bold">
            {sup.name}
          </Link>
          <span className="row" style={{ gap: 4 }}>
            <User size={12} /> {sup.contact.name}
          </span>
          <span className="row" style={{ gap: 4 }}>
            <Phone size={12} /> {sup.contact.phone}
          </span>
          <span className="row" style={{ gap: 4 }}>
            <Mail size={12} /> {sup.contact.email}
          </span>
        </div>
      </div>
      <div className="stepper mt mb">
        {steps.map((s, i) => (
          <div key={s.l} className={`step ${reached[i] ? 'done' : ''}`}>
            <div className="bullet">{reached[i] ? <Check size={14} strokeWidth={3} /> : null}</div>
            <div className="lbl xs">{s.l}</div>
            <div className="xs muted">{s.d}</div>
          </div>
        ))}
      </div>
      <div className="row mb">
        <div className="grow">
          <Progress value={cbm / containerCapacity(c)} warnAt={0.98} />
        </div>
        <span className="small bold">
          {dec(cbm, 1)} / {containerCapacity(c)} m³
        </span>
      </div>
      <Seg
        value={tab}
        onChange={setTab}
        options={[
          { id: 'produits', label: `Produits (${c.allocations.length})` },
          { id: 'documents', label: 'Documents' },
          { id: 'historique', label: 'Suivi' },
        ]}
      />
      {tab === 'produits' && (
        <table className="tbl mt">
          <thead>
            <tr>
              <th>Réf.</th>
              <th className="num">Qté</th>
              <th className="num">PCB</th>
              <th className="num">CBM</th>
            </tr>
          </thead>
          <tbody>
            {c.allocations.map((a) => {
              const p = byId(state.products, a.productId);
              return (
                <tr key={a.proformaId + a.productId}>
                  <td>
                    <Link to={`/produits/${p.id}`} className="row" style={{ gap: 6 }}>
                      <ProductThumb product={p} size={28} />
                      <div>
                        <div className="bold small">{p.ref}</div>
                        <div className="xs muted">{p.name}</div>
                      </div>
                    </Link>
                  </td>
                  <td className="num">{num(a.qty)}</td>
                  <td className="num">{p.pcb}</td>
                  <td className="num">{dec(lineCbm(p, a.qty), 1)}</td>
                </tr>
              );
            })}
            <tr style={{ background: 'var(--green-soft)' }}>
              <td className="bold">Total conteneur</td>
              <td className="num bold">{num(containerQty(c))}</td>
              <td />
              <td className="num bold">{m3(cbm)}</td>
            </tr>
          </tbody>
        </table>
      )}
      {tab === 'documents' && (
        <div className="mt">
          {c.documents.length ? (
            c.documents.map((d) => (
              <div key={d} className="alert-line small">
                <FileText size={14} className="green" /> {d}
              </div>
            ))
          ) : (
            <div className="empty small">BL, Invoice et Packing List disponibles après le départ.</div>
          )}
        </div>
      )}
      {tab === 'historique' && (
        <div className="mt">
          {[...c.dateHistory].reverse().map((h, i) => (
            <div key={i} className="alert-line small">
              <span className="bold">{fshort(h.date)}</span> {h.text}
              <span className="grow" />
              <span className="muted xs">{h.user}</span>
            </div>
          ))}
        </div>
      )}

      <div className="card pad mt" style={{ background: 'var(--green-softer)', boxShadow: 'none' }}>
        <div className="bold mb">Infos logistiques</div>
        <dl className="kv">
          <dt>ETD {c.etdReal ? 'réel' : 'prévue'}</dt>
          <dd>
            {fshort(containerEtd(c))} ({weekLabel(containerEtd(c))})
          </dd>
          <dt>ETA {c.etaReal ? 'réelle' : c.etaRevised ? 'révisée' : 'prévue'}</dt>
          <dd>
            {fshort(containerEta(c))} ({weekLabel(containerEta(c))})
          </dd>
          <dt>Compagnie maritime</dt>
          <dd>{c.carrier ?? '—'}</dd>
          <dt>Transitaire</dt>
          <dd>
            {auth.can('logistics.plan') && c.status !== 'arrive' ? (
              <select
                className="input"
                aria-label="Transitaire du conteneur"
                value={c.forwarder ?? ''}
                onChange={(e) => {
                  dispatch({ type: 'setForwarder', containerId: c.id, forwarder: e.target.value as Forwarder });
                  toast(`Transitaire : ${e.target.value}`);
                }}
              >
                {!c.forwarder && <option value="">À définir</option>}
                {FORWARDERS.map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
            ) : (
              (c.forwarder ?? '—')
            )}
          </dd>
          <dt>Scellé</dt>
          <dd>{c.seal ?? '—'}</dd>
          <dt>Port départ</dt>
          <dd>{c.portFrom}</dd>
          <dt>Port arrivée</dt>
          <dd>{c.portTo}</dd>
          <dt>Entrepôt</dt>
          <dd>{c.warehouse}</dd>
          <dt>Valeur</dt>
          <dd>{eur(containerValue(state, c))}</dd>
          <dt>Poids marchandise</dt>
          <dd className={containerWeight(state, c) > CONTAINER_PAYLOAD[c.type] ? 'red' : ''}>
            {dec(containerWeight(state, c) / 1000, 1)} t / {dec(CONTAINER_PAYLOAD[c.type] / 1000, 1)} t
          </dd>
        </dl>
        {containerWeight(state, c) > CONTAINER_PAYLOAD[c.type] && <div className="pill red mt">Charge utile dépassée : vérifier le plan de chargement</div>}
        {c.reception && (
          <div className="rc-result mt">
            <div className="bold small">
              Contrôle de réception · {c.reception.by} · {c.reception.at.slice(0, 10).split('-').reverse().join('/')}
            </div>
            {c.reception.lines.filter((l) => l.received !== l.expected).length === 0 ? (
              <div className="small green">
                <Check size={13} /> Conforme : {num(c.reception.lines.reduce((t, l) => t + l.received, 0))} pcs reçues
              </div>
            ) : (
              c.reception.lines
                .filter((l) => l.received !== l.expected)
                .map((l) => (
                  <div key={l.proformaId + l.productId} className="small">
                    <b>{byId(state.products, l.productId).ref}</b> : {num(l.received)} reçues / {num(l.expected)} attendues{' '}
                    <span className={l.received < l.expected ? 'red' : 'orange'}>
                      ({l.received - l.expected > 0 ? '+' : ''}
                      {num(l.received - l.expected)})
                    </span>
                  </div>
                ))
            )}
            {c.reception.note && <div className="small muted">Réserves : {c.reception.note}</div>}
          </div>
        )}
        {c.status !== 'arrive' && auth.can('logistics.booking') && (
          <div className="row mt">
            <input className="input" type="date" value={eta} onChange={(e) => setEta(e.target.value)} />
            <button
              className="btn sm"
              disabled={eta === containerEta(c)}
              onClick={() => {
                dispatch({ type: 'reviseEta', containerId: c.id, eta });
                toast('ETA révisée et historisée');
              }}
            >
              Réviser l’ETA
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Sur téléphone, le panneau de détail est sous la liste : on le fait défiler à l'écran. */
function revealPanel() {
  if (window.innerWidth > 1100) return;
  requestAnimationFrame(() => document.querySelector('.sticky-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}
