import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Calendar, CalendarClock, Check, ChevronLeft, ChevronRight, Container as Ctn, FileText, Home, Mail, Phone, Search, Ship, Square, Truck, User, X } from 'lucide-react';
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
  useAuth,
  useStore,
} from '../data/store';
import { CONTAINER_STATUSES, type Container, type ContainerStatus } from '../data/types';
import { ContainerStatusPill, Kpi, Pill, ProductThumb, Progress, Seg, SupplierLogo, toast } from '../components/ui';
import { TODAY, addDays, dec, diffDays, eur, fshort, m3, monthKey, monthLabel, num, shiftMonth, weekKey, weekLabel, weekRange } from '../lib/format';

const GROUP_COLOR: Record<ContainerStatus, string> = {
  a_booker: 'orange',
  booking_demande: 'violet',
  booke: 'green',
  en_transit: 'blue',
  arrive: 'teal',
};

export default function Containers() {
  const { state, dispatch } = useStore();
  const auth = useAuth();
  const canBook = auth.can('logistics.booking');
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
  const [q, setQ] = useState('');
  const [all, setAll] = useState(false);

  const dateOf = (c: Container) => (basis === 'eta' ? containerEta(c) : containerEtd(c));
  const inPeriod = (c: Container) => (all ? true : period === 'mois' ? monthKey(dateOf(c)) === month : weekKey(dateOf(c)) === weekKey(weekRef));

  const filtered = useMemo(
    () =>
      state.containers
        .filter(inPeriod)
        .filter((c) => statusF === 'all' || c.status === statusF)
        .filter((c) => supplierF === 'all' || c.supplierId === supplierF)
        .filter((c) => {
          const s = q.trim().toLowerCase();
          if (!s) return true;
          return `${c.id} ${c.number ?? ''} ${c.bookingNo ?? ''} ${containerProformas(c).join(' ')} ${byId(state.suppliers, c.supplierId).name}`.toLowerCase().includes(s);
        })
        .sort((a, b) => dateOf(a).localeCompare(dateOf(b))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, month, weekRef, period, basis, statusF, supplierF, q, all],
  );

  const sel = state.containers.find((c) => c.id === selId);
  const select = (id: string | null) => {
    if (id) params.set('c', id);
    else params.delete('c');
    setParams(params);
    if (id) revealPanel();
  };

  const count = (s: ContainerStatus) => state.containers.filter((c) => c.status === s).length;
  const cbmOf = (list: Container[]) => list.reduce((s, c) => s + containerCbm(state, c), 0);
  const transitValue = filtered.filter((c) => c.status === 'en_transit').reduce((s, c) => s + containerValue(state, c), 0);

  return (
    <>
      <div className="page-head">
        <div className="cal-icon" style={{ width: 54, height: 54 }}>
          <Ctn size={28} />
        </div>
        <div>
          <h1>Mes conteneurs</h1>
          <div className="page-sub">Suivi, planning, bookings, productions et arrivages</div>
        </div>
      </div>
      <div className="kpis mb">
        <Kpi icon={<Ctn size={18} />} value={state.containers.length} label="Conteneurs" />
        <Kpi icon={<Check size={18} />} value={count('booke')} label="Bookés" onClick={() => setStatusF('booke')} />
        <Kpi icon={<Truck size={18} />} value={count('en_transit')} label="En transit" color="blue" onClick={() => setStatusF('en_transit')} />
        <Kpi icon={<Home size={18} />} value={count('arrive')} label="Arrivés" onClick={() => setStatusF('arrive')} />
        <Kpi icon={<Calendar size={18} />} value={count('a_booker')} label="À booker" color="orange" onClick={() => setStatusF('a_booker')} />
        <Kpi icon={<CalendarClock size={18} />} value={count('booking_demande')} label="Booking demandé" color="violet" onClick={() => setStatusF('booking_demande')} />
        <Kpi icon={<Ship size={18} />} value={`${num(cbmOf(state.containers))} m³`} label="Total (CBM)" />
      </div>

      <div className="row wrap mb">
        <Seg
          value={all ? 'tous' : 'periode'}
          onChange={(v) => setAll(v === 'tous')}
          options={[
            { id: 'periode', label: 'Période' },
            { id: 'tous', label: 'Tous' },
          ]}
        />
        <Seg
          value={period}
          onChange={setPeriod}
          options={[
            { id: 'semaine', label: 'Vue par semaine' },
            { id: 'mois', label: 'Vue par mois' },
          ]}
        />
        <Seg
          value={basis}
          onChange={setBasis}
          options={[
            { id: 'etd', label: 'Par ETD (départ)' },
            { id: 'eta', label: 'Par ETA (arrivée)' },
          ]}
        />
        <div className="seg">
          <button onClick={() => (period === 'mois' ? setMonth(shiftMonth(month, -1)) : setWeekRef(addDays(weekRef, -7)))}>
            <ChevronLeft size={16} />
          </button>
          <button className="active" style={{ minWidth: 150, justifyContent: 'center' }}>
            {period === 'mois' ? monthLabel(month) : `${weekLabel(weekRef)} · ${weekRange(weekRef)}`}
          </button>
          <button onClick={() => (period === 'mois' ? setMonth(shiftMonth(month, 1)) : setWeekRef(addDays(weekRef, 7)))}>
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="search grow">
          <Search size={16} className="muted" />
          <input placeholder="N° conteneur, booking, proforma, fournisseur…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      <div className="row wrap mb">
        <select className="input" value={statusF} onChange={(e) => setStatusF(e.target.value as ContainerStatus | 'all')}>
          <option value="all">Statut : Tous</option>
          {CONTAINER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {CONTAINER_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <select className="input" value={supplierF} onChange={(e) => setSupplierF(e.target.value)}>
          <option value="all">Fournisseur : Tous</option>
          {state.suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.shortName}
            </option>
          ))}
        </select>
        <span className="xs muted">
          {basis === 'eta'
            ? 'Par ETA : conteneurs dont l’arrivée prévue, révisée ou réelle tombe dans la période, même si l’ETD est antérieure ou qu’ils ne sont pas bookés.'
            : 'Par ETD : conteneurs dont le départ prévu ou réel tombe dans la période.'}
        </span>
      </div>

      <div className="split">
        <div>
          <div className="card pad row wrap gap-lg mb">
            <Calendar className="green" />
            <div>
              <div className="bold" style={{ fontSize: 20 }}>
                {all ? 'Tous les conteneurs' : period === 'mois' ? monthLabel(month) : `Semaine ${weekLabel(weekRef)}`}
              </div>
              <div className="small muted">
                {filtered.length} conteneurs | {num(cbmOf(filtered))} m³
              </div>
            </div>
            {CONTAINER_STATUSES.map((s) => {
              const l = filtered.filter((c) => c.status === s);
              return (
                <div key={s} className="metric" style={{ borderLeft: '1px solid var(--line)', paddingLeft: 14 }}>
                  <div className="bold" style={{ fontSize: 18 }}>
                    {l.length}
                  </div>
                  <div className="xs muted">{CONTAINER_STATUS_LABEL[s]}</div>
                  <div className="xs muted">{num(cbmOf(l))} m³</div>
                </div>
              );
            })}
            <div className="grow" />
            <div className="pill green" style={{ flexDirection: 'column', padding: '8px 14px', borderRadius: 12 }}>
              <span className="xs">Valeur en transit</span>
              <span style={{ fontSize: 18 }}>{eur(transitValue)}</span>
            </div>
          </div>

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
                <div className="tbl-wrap">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>{s === 'a_booker' ? 'N° prévision' : s === 'booking_demande' ? 'N° demande' : 'N° conteneur'}</th>
                        <th>Fournisseur</th>
                        <th>Proforma(s)</th>
                        <th className="num">Qté</th>
                        <th className="num">CBM</th>
                        <th>ETD</th>
                        <th>ETA</th>
                        <th>{s === 'en_transit' ? 'Jours restants' : s === 'arrive' ? 'Réception' : 'Actions'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((c) => {
                        const sup = byId(state.suppliers, c.supplierId);
                        const cbm = containerCbm(state, c);
                        const left = diffDays(containerEta(c), TODAY);
                        return (
                          <tr key={c.id} className={`clickable ${sel?.id === c.id ? 'selected' : ''}`} onClick={() => select(c.id)}>
                            <td>
                              <div className="row" style={{ gap: 6 }}>
                                <Square size={14} className="muted" />
                                <span className="bold">{s === 'a_booker' ? c.id : s === 'booking_demande' ? c.bookingNo : c.number}</span>
                              </div>
                              {s !== 'a_booker' && s !== 'booking_demande' && <div className="xs muted">{c.bookingNo}</div>}
                              {c.planRequested && <Pill color="orange">Plan demandé</Pill>}
                              {c.planProposed && <Pill color="violet">Plan fournisseur à valider</Pill>}
                            </td>
                            <td>
                              <div className="row" style={{ gap: 6 }}>
                                <SupplierLogo supplier={sup} size={24} />
                                <span className="small">{sup.shortName}</span>
                              </div>
                            </td>
                            <td className="small">{containerProformas(c).join(', ') || '—'}</td>
                            <td className="num">{num(containerQty(c))}</td>
                            <td className="num">
                              {dec(cbm, 1)}
                              <div className="xs muted">{Math.round((cbm / containerCapacity(c)) * 100)} %</div>
                            </td>
                            <td className="small nowrap">
                              {weekLabel(containerEtd(c))} – {fshort(containerEtd(c))}
                              {c.etdReal && <div className="xs green">réel</div>}
                            </td>
                            <td className={`small nowrap ${c.etaRevised ? 'red bold' : ''}`}>
                              {weekLabel(containerEta(c))} – {fshort(containerEta(c))}
                              {c.etaRevised && !c.etaReal && <div className="xs">révisée (prévue {fshort(c.etaPlanned)})</div>}
                            </td>
                            <td onClick={(e) => e.stopPropagation()}>
                              {s === 'a_booker' && canBook && (
                                <button
                                  className="btn primary sm"
                                  disabled={!c.allocations.length}
                                  onClick={() => {
                                    dispatch({ type: 'requestBooking', containerId: c.id });
                                    toast('Demande de booking envoyée');
                                  }}
                                >
                                  <Check size={12} /> Booker
                                </button>
                              )}
                              {s === 'booking_demande' && canBook && (
                                <div className="row" style={{ gap: 4 }}>
                                  <button className="btn sm" onClick={() => toast(`Relance envoyée à ${c.carrier}`)}>
                                    Relancer
                                  </button>
                                  <button className="btn primary sm" onClick={() => dispatch({ type: 'confirmBooking', containerId: c.id })}>
                                    Confirmer
                                  </button>
                                </div>
                              )}
                              {s === 'booke' && canBook && (
                                <button className="btn sm" onClick={() => dispatch({ type: 'ship', containerId: c.id })}>
                                  <Ship size={12} /> Parti
                                </button>
                              )}
                              {s === 'en_transit' && (
                                <div className="row" style={{ gap: 4 }}>
                                  <Pill color={left < 0 ? 'red' : left < 10 ? 'orange' : 'grey'}>{left < 0 ? `+${-left} j` : `J-${left}`}</Pill>
                                  {canBook && <button className="btn sm" onClick={() => dispatch({ type: 'receive', containerId: c.id })}>
                                    Réceptionner
                                  </button>}
                                </div>
                              )}
                              {s === 'arrive' && <Pill color="green">Réceptionné {fshort(c.receivedOn)}</Pill>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
        <div className="sticky-panel">{sel ? <ContainerDetail c={sel} onClose={() => select(null)} /> : <div className="card empty">Sélectionnez un conteneur pour voir son détail.</div>}</div>
      </div>
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
          <dt>Transporteur</dt>
          <dd>{c.carrier ?? '—'}</dd>
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
        </dl>
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
