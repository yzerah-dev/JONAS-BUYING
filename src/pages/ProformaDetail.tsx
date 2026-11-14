import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Boxes,
  Calendar,
  Check,
  ClipboardList,
  Container as Ctn,
  Download,
  Euro,
  FileText,
  GripVertical,
  History,
  LayoutGrid,
  List,
  Mail,
  MessageCircle,
  PenLine,
  Phone,
  Plus,
  Send,
  Share2,
  Ship,
  Trash2,
  Truck,
  User,
} from 'lucide-react';
import {
  allocatedQty,
  byId,
  containerCapacity,
  containerCbm,
  containerQty,
  lineCbm,
  proformaTotals,
  useAuth,
  useStore,
  type State,
} from '../data/store';
import type { Container, Proforma, ProformaStatus } from '../data/types';
import { BrandLogo, ContainerStatusPill, PackPill, Pill, ProductThumb, ProformaStatusPill, Progress, Ring, Seg, SupplierLogo, Tabs, toast } from '../components/ui';
import { addDays, dec, eur, eur2, fdate, fshort, m3, num, weekLabel } from '../lib/format';

type Tab = 'produits' | 'details' | 'documents' | 'logistique' | 'historique';

export default function ProformaDetail() {
  const { id } = useParams();
  const { state, dispatch } = useStore();
  const auth = useAuth();
  const navigate = useNavigate();
  const pf = state.proformas.find((p) => p.id === id);
  const [tab, setTab] = useState<Tab>('produits');
  const [mode, setMode] = useState<'galerie' | 'liste'>('galerie');
  if (!pf) return <div className="card empty">Proforma introuvable.</div>;
  const sup = byId(state.suppliers, pf.supplierId);
  const t = proformaTotals(state, pf);
  const showMoney = auth.can('finance.view');

  return (
    <>
      <div className="page-head">
        <button className="btn ghost" onClick={() => navigate(-1)}>
          <ArrowLeft size={20} />
        </button>
        <h1>Proforma {pf.id}</h1>
        <ProformaStatusPill status={pf.status} />
        <div className="grow" />
        <button className="btn" onClick={() => toast('Export PDF généré (démo)')}>
          <Download size={16} /> PDF
        </button>
        <button className="btn" onClick={() => toast('Lien de partage copié (démo)')}>
          <Share2 size={16} /> Partager
        </button>
        {auth.can('proforma.sign') && (
          <button
            className="btn primary"
            onClick={() => {
              dispatch({ type: 'signProforma', id: pf.id });
              toast(`${pf.id} signée`);
            }}
          >
            <PenLine size={16} /> {pf.status === 'a_signer' ? 'Signer' : 'Signer à nouveau'}
          </button>
        )}
      </div>

      <div className="row wrap gap-lg" style={{ alignItems: 'stretch' }}>
        <div className="card pad row" style={{ gap: 14, minWidth: 300 }}>
          <SupplierLogo supplier={sup} size={56} />
          <div className="col">
            <Link to={`/fournisseurs/${sup.id}`} style={{ fontSize: 18, fontWeight: 800 }}>
              {sup.name}
            </Link>
            <span className="small row" style={{ gap: 6 }}>
              <User size={13} /> {sup.contact.name}
            </span>
            <span className="small row" style={{ gap: 6 }}>
              <Phone size={13} /> {sup.contact.phone}
            </span>
            <span className="small row" style={{ gap: 6 }}>
              <Mail size={13} /> {sup.contact.email}
            </span>
          </div>
          {sup.contact.wechat && (
            <span title={`WeChat : ${sup.contact.wechat}`} className="kpi-icon" style={{ background: '#2dc100', color: '#fff', width: 36, height: 36, borderRadius: 10, display: 'grid', placeItems: 'center' }}>
              <MessageCircle size={20} />
            </span>
          )}
        </div>
        <div className="card pad grow">
          <div className="kpis" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
            <Info icon={<ClipboardList size={18} />} label="N° commande Jonas" value={pf.poNumber} />
            <Info icon={<Calendar size={18} />} label="Date de la proforma" value={fdate(pf.date)} />
            <Info icon={<Ship size={18} />} label="ETD" value={weekLabel(pf.etd)} sub={`du ${fdate(pf.etd)}`} />
            <Info icon={<Ship size={18} />} label="ETA" value={weekLabel(pf.eta)} sub={`du ${fdate(pf.eta)}`} />
            <Info icon={<Ctn size={18} />} label="Conteneurs" value={dec(t.eq40)} sub="(40HC)" />
            <Info icon={<Boxes size={18} />} label="CBM total" value={m3(t.cbm)} />
            {showMoney && <Info icon={<Euro size={18} />} label="Montant total" value={eur2(t.amount)} />}
          </div>
        </div>
      </div>

      <div className="row wrap">
        <Tabs<Tab>
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'produits', label: `Produits (${pf.lines.length})`, icon: <Boxes size={16} /> },
            { id: 'details', label: 'Détails', icon: <ClipboardList size={16} /> },
            { id: 'documents', label: `Documents (${pf.documents.length})`, icon: <FileText size={16} /> },
            { id: 'logistique', label: 'Suivi & Logistique', icon: <Truck size={16} /> },
            { id: 'historique', label: 'Historique', icon: <History size={16} /> },
          ]}
        />
        <div className="grow" />
        {tab === 'produits' && (
          <Seg
            value={mode}
            onChange={setMode}
            options={[
              { id: 'liste', label: 'Liste', icon: <List size={16} /> },
              { id: 'galerie', label: 'Galerie', icon: <LayoutGrid size={16} /> },
            ]}
          />
        )}
      </div>

      {tab === 'produits' && <ProductsTab pf={pf} state={state} mode={mode} />}
      {tab === 'details' && <DetailsTab pf={pf} state={state} />}
      {tab === 'documents' && <DocumentsTab pf={pf} />}
      {tab === 'logistique' && <LogisticsTab pf={pf} />}
      {tab === 'historique' && (
        <div className="card pad">
          {[...pf.history].reverse().map((h, i) => (
            <div key={i} className="alert-line">
              <History size={15} className="muted" />
              <span className="bold">{fdate(h.date)}</span>
              <span>{h.text}</span>
              <span className="grow" />
              <span className="muted small">{h.user}</span>
            </div>
          ))}
        </div>
      )}

      <div className="card summary-bar">
        <div className="btn primary lg" style={{ cursor: 'default' }}>
          <Boxes size={18} /> Récapitulatif · {pf.lines.length} produits
        </div>
        <Metric l="Qté totale" v={`${num(t.qty)} pcs`} />
        <Metric l="CBM total" v={m3(t.cbm)} />
        <Metric l="Conteneurs" v={`${dec(t.eq40)} (40HC)`} />
        {showMoney && <Metric l="Montant total" v={eur2(t.amount)} />}
        <Metric l="Packs validés" v={`${t.packsOk}/${t.packsTotal}`} />
        <div className="grow" />
        <Pill color="green">
          <Calendar size={14} /> {weekLabel(pf.etd)} Expédition
        </Pill>
        <Pill color="green">
          <Calendar size={14} /> {weekLabel(pf.eta)} Arrivée
        </Pill>
      </div>
    </>
  );
}

function Info({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
      <span className="muted" style={{ marginTop: 2 }}>
        {icon}
      </span>
      <div>
        <div className="muted xs">{label}</div>
        <div className="bold" style={{ fontSize: 17 }}>
          {value}
        </div>
        {sub && <div className="muted xs">{sub}</div>}
      </div>
    </div>
  );
}

function Metric({ l, v }: { l: string; v: string }) {
  return (
    <div className="metric">
      <div className="l">{l}</div>
      <div className="v">{v}</div>
    </div>
  );
}

function ProductsTab({ pf, state, mode }: { pf: Proforma; state: State; mode: 'galerie' | 'liste' }) {
  const navigate = useNavigate();
  if (mode === 'liste')
    return (
      <div className="card tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Produit</th>
              <th>Marque</th>
              <th className="num">PA</th>
              <th className="num">PCB</th>
              <th className="num">Qté</th>
              <th className="num">CBM/carton</th>
              <th className="num">CBM total</th>
              <th className="num">Montant</th>
              <th>Date max artwork</th>
              <th>État pack</th>
            </tr>
          </thead>
          <tbody>
            {pf.lines.map((l) => {
              const p = byId(state.products, l.productId);
              return (
                <tr key={p.id} className="clickable" onClick={() => navigate(`/produits/${p.id}`)}>
                  <td>
                    <div className="row">
                      <ProductThumb product={p} size={40} />
                      <div>
                        <span className="ref-tag">{p.ref}</span>
                        <div className="small">{p.name}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <BrandLogo brand={byId(state.brands, p.brandId)} size={10} />
                  </td>
                  <td className="num">{eur2(l.price)}</td>
                  <td className="num">{p.pcb}</td>
                  <td className="num">{num(l.qty)}</td>
                  <td className="num">{dec(p.cbmCarton, 3)}</td>
                  <td className="num bold">{dec(lineCbm(p, l.qty), 2)} m³</td>
                  <td className="num">{eur(l.qty * l.price)}</td>
                  <td>{fdate(p.pack.artworkDeadline)}</td>
                  <td>
                    <PackPill product={p} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  return (
    <div className="gallery">
      {pf.lines.map((l) => {
        const p = byId(state.products, l.productId);
        return (
          <div key={p.id} className="pcard" onClick={() => navigate(`/produits/${p.id}`)}>
            <div className="photo" style={{ background: p.tint }}>
              {p.emoji}
            </div>
            <div className="row">
              <span className="ref-tag">{p.ref}</span>
              <span className="small">{p.name}</span>
            </div>
            <div className="mini-grid">
              <div>
                <div className="l">PA</div>
                <div className="v">{eur2(l.price)}</div>
              </div>
              <div>
                <div className="l">PCB</div>
                <div className="v">{p.pcb}</div>
              </div>
              <div>
                <div className="l">Qté</div>
                <div className="v">{num(l.qty)}</div>
              </div>
              <div>
                <div className="l">CBM/ctn</div>
                <div className="v">{dec(p.cbmCarton, 3)}</div>
              </div>
              <div>
                <div className="l">CBM tot.</div>
                <div className="v">{dec(lineCbm(p, l.qty), 2)}</div>
              </div>
            </div>
            <div className="small row" style={{ gap: 6 }}>
              <Calendar size={13} /> Date rendu max artwork : <b>{fdate(p.pack.artworkDeadline)}</b>
            </div>
            <div className="row">
              <PackPill product={p} prefix />
              <div className="grow" />
              <BrandLogo brand={byId(state.brands, p.brandId)} size={10} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DetailsTab({ pf, state }: { pf: Proforma; state: State }) {
  const { dispatch } = useStore();
  const auth = useAuth();
  const t = proformaTotals(state, pf);
  return (
    <div className="grid2">
      <div className="card pad">
        <div className="card-title">Conditions d’achat</div>
        <dl className="kv">
          <dt>Incoterm</dt>
          <dd>FOB {byId(state.suppliers, pf.supplierId).port}</dd>
          <dt>Paiement</dt>
          <dd>
            {pf.depositPct} % acompte, solde à l’expédition
          </dd>
          <dt>Port de départ</dt>
          <dd>{byId(state.suppliers, pf.supplierId).port}</dd>
          <dt>Port d’arrivée</dt>
          <dd>Le Havre</dd>
          <dt>ETD</dt>
          <dd>
            {weekLabel(pf.etd)} – {fdate(pf.etd)}
          </dd>
          <dt>ETA</dt>
          <dd>
            {weekLabel(pf.eta)} – {fdate(pf.eta)}
          </dd>
        </dl>
        <div className="mt">
          <div className="muted small mb">Changer le statut</div>
          <select className="input" disabled={!auth.can('proforma.edit')} value={pf.status} onChange={(e) => dispatch({ type: 'setProformaStatus', id: pf.id, status: e.target.value as ProformaStatus })}>
            <option value="a_signer">À signer</option>
            <option value="en_dev">En dev</option>
            <option value="en_production">En production</option>
            <option value="booke">Booké</option>
            <option value="en_transit">En transit</option>
            <option value="arrive">Arrivé</option>
          </select>
        </div>
      </div>
      {auth.can('finance.view') && <div className="card pad">
        <div className="card-title">Finance</div>
        <dl className="kv">
          <dt>Montant total</dt>
          <dd>{eur2(t.amount)}</dd>
          <dt>Acompte ({pf.depositPct} %)</dt>
          <dd>
            {eur2(t.deposit)} {pf.depositPaid ? <Pill color="green">Payé</Pill> : <Pill color="red">À faire</Pill>}
          </dd>
          <dt>Solde</dt>
          <dd>
            {eur2(t.balance)} {pf.balancePaid ? <Pill color="green">Payé</Pill> : <Pill color="orange">Échéance {fdate(pf.balanceDue)}</Pill>}
          </dd>
        </dl>
        <div className="row mt">
          {!pf.depositPaid && auth.can('finance.pay') && (
            <button className="btn primary" onClick={() => dispatch({ type: 'payDeposit', id: pf.id })}>
              <Check size={16} /> Marquer l’acompte payé
            </button>
          )}
          {pf.depositPaid && !pf.balancePaid && auth.can('finance.pay') && (
            <button className="btn primary" onClick={() => dispatch({ type: 'payBalance', id: pf.id })}>
              <Check size={16} /> Marquer le solde payé
            </button>
          )}
        </div>
      </div>}
    </div>
  );
}

function DocumentsTab({ pf }: { pf: Proforma }) {
  return (
    <div className="card pad">
      {pf.documents.map((d) => (
        <div key={d} className="alert-line">
          <FileText size={16} className="green" />
          <span className="bold">{d}</span>
          <span className="grow" />
          <button className="btn sm" onClick={() => toast(`Téléchargement de ${d} (démo)`)}>
            <Download size={13} /> Télécharger
          </button>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Suivi d'expédition + plan de chargement (drag & drop)

const TRACK_STEPS: { label: string; reached: (pf: Proforma) => boolean; date: (pf: Proforma) => string }[] = [
  { label: 'Proforma validée', reached: (p) => p.status !== 'a_signer', date: (p) => fshort(addDays(p.date, 2)) },
  { label: 'Développement produit', reached: (p) => !['a_signer', 'en_dev'].includes(p.status), date: (p) => fshort(addDays(p.date, 5)) },
  { label: 'Production en cours', reached: (p) => !['a_signer', 'en_dev'].includes(p.status), date: (p) => fshort(addDays(p.date, 9)) },
  { label: 'Booking conteneur', reached: (p) => ['booke', 'en_transit', 'arrive'].includes(p.status), date: (p) => fshort(addDays(p.etd, -14)) },
  { label: 'Prêt à charger', reached: (p) => ['en_transit', 'arrive'].includes(p.status), date: (p) => fshort(addDays(p.etd, -3)) },
  { label: 'En transit', reached: (p) => ['en_transit', 'arrive'].includes(p.status), date: (p) => `Depuis le ${fshort(p.etd)}` },
  { label: 'Arrivée port', reached: (p) => p.status === 'arrive', date: (p) => fshort(p.eta) },
  { label: 'Réception', reached: (p) => p.status === 'arrive', date: (p) => weekLabel(addDays(p.eta, 3)) },
];

export function LogisticsTab({ pf, portal }: { pf: Proforma; portal?: boolean }) {
  const { state, dispatch } = useStore();
  const auth = useAuth();
  const [scope, setScope] = useState<'pf' | 'others' | 'all'>('pf');
  const [selected, setSelected] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  const lastReached = TRACK_STEPS.map((s) => s.reached(pf)).lastIndexOf(true);

  // Conteneurs du fournisseur encore modifiables, ou liés à cette proforma
  const containers = useMemo(
    () =>
      state.containers.filter(
        (c) => c.allocations.some((a) => a.proformaId === pf.id) || (c.supplierId === pf.supplierId && ['a_booker', 'booking_demande'].includes(c.status)),
      ),
    [state.containers, pf],
  );
  const sel = containers.find((c) => c.id === selected) ?? containers[0];

  const otherPfs = state.proformas.filter((p) => p.supplierId === pf.supplierId && p.id !== pf.id && !['arrive', 'en_transit'].includes(p.status));
  const sourcePfs = scope === 'pf' ? [pf] : scope === 'others' ? otherPfs : [pf, ...otherPfs];
  const lines = sourcePfs.flatMap((p) => p.lines.map((l) => ({ pf: p, line: l })));

  const totalQty = pf.lines.reduce((s, l) => s + l.qty, 0);
  const totalCbm = proformaTotals(state, pf).cbm;
  const loadedQty = pf.lines.reduce((s, l) => s + Math.min(l.qty, allocatedQty(state, pf.id, l.productId)), 0);
  const loadedCbm = pf.lines.reduce((s, l) => s + lineCbm(byId(state.products, l.productId), Math.min(l.qty, allocatedQty(state, pf.id, l.productId))), 0);

  function drop(c: Container, payload: string) {
    const [proformaId, productId] = payload.split('|');
    const src = state.proformas.find((p) => p.id === proformaId)!;
    const line = src.lines.find((l) => l.productId === productId)!;
    const p = byId(state.products, productId);
    const remaining = line.qty - allocatedQty(state, proformaId, productId);
    if (remaining <= 0) return toast('Cette ligne est déjà entièrement affectée');
    if (!auth.allowed({ type: 'allocate', containerId: c.id, proformaId, productId, qty: 1 })) return toast('Ce conteneur n’est pas modifiable (droits ou plan déjà validé)');
    if (['en_transit', 'arrive'].includes(c.status)) return toast('Conteneur déjà parti : affectation impossible');
    const free = containerCapacity(c) - containerCbm(state, c);
    const maxCartons = Math.floor(free / p.cbmCarton);
    const qty = Math.min(remaining, maxCartons * p.pcb);
    if (qty <= 0) return toast(`Capacité ${c.id} atteinte`);
    dispatch({ type: 'allocate', containerId: c.id, proformaId, productId, qty });
    toast(`${num(qty)} pcs ${p.ref} → ${c.number ?? c.id}${qty < remaining ? ' (capacité limitée)' : ''}`);
    setSelected(c.id);
  }

  return (
    <>
      <div className="card pad mb">
        <div className="row mb">
          <Truck className="green" />
          <span className="bold" style={{ fontSize: 16 }}>
            Suivi d’expédition
          </span>
        </div>
        <div className="stepper">
          {TRACK_STEPS.map((s, i) => (
            <div key={s.label} className={`step ${i < lastReached ? 'done' : i === lastReached ? 'current done' : ''}`}>
              <div className="bullet">{i <= lastReached ? <Check size={15} strokeWidth={3} /> : null}</div>
              <div className="lbl">{s.label}</div>
              <div className="muted xs">{s.date(pf)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="split3">
        <div className="card pad">
          <div className="card-title">
            <Boxes size={18} className="green" /> Produits à consolider
          </div>
          <div className="mb">
            <Seg
              value={scope}
              onChange={setScope}
              options={[
                { id: 'pf', label: `${pf.id.slice(-4)} (${pf.lines.length})` },
                { id: 'others', label: `Autres proformas (${otherPfs.length})` },
                { id: 'all', label: 'Tous' },
              ]}
            />
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th />
                  <th>Réf.</th>
                  <th className="num">Qté</th>
                  <th className="num">Affecté</th>
                  <th className="num">Restant</th>
                  <th className="num">CBM</th>
                </tr>
              </thead>
              <tbody>
                {lines.map(({ pf: src, line }) => {
                  const p = byId(state.products, line.productId);
                  const alloc = allocatedQty(state, src.id, p.id);
                  const rest = Math.max(0, line.qty - alloc);
                  return (
                    <tr key={src.id + p.id} draggable={rest > 0} onDragStart={(e) => e.dataTransfer.setData('text/plain', `${src.id}|${p.id}`)} title={rest > 0 ? 'Glisser vers un conteneur' : 'Entièrement affecté'}>
                      <td>
                        <GripVertical size={14} className="drag-handle" />
                      </td>
                      <td>
                        <div className="row" style={{ gap: 6 }}>
                          <ProductThumb product={p} size={30} />
                          <div>
                            <div className="bold small">{p.ref}</div>
                            <div className="xs muted">{src.id === pf.id ? p.name : src.id}</div>
                          </div>
                        </div>
                      </td>
                      <td className="num">{num(line.qty)}</td>
                      <td className="num green bold">{num(alloc)}</td>
                      <td className="num">{rest > 0 ? <Pill color="orange">{num(rest)}</Pill> : <span className="muted">0</span>}</td>
                      <td className="num">{dec(lineCbm(p, line.qty), 2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="xs muted mt">Glissez une ligne sur un conteneur : la quantité restante est affectée dans la limite de la capacité.</div>
        </div>

        <div className="card pad">
          <div className="card-title">
            <Ctn size={18} className="green" /> Plan de chargement – {containers.length} conteneur{containers.length > 1 ? 's' : ''}
            <div className="grow" />
            <span className="pill grey">Capacité : {m3(containers.reduce((s, c) => s + containerCapacity(c), 0))}</span>
          </div>
          <div className="cgrid">
            {containers.map((c, i) => {
              const cbm = containerCbm(state, c);
              const ratio = cbm / containerCapacity(c);
              return (
                <div
                  key={c.id}
                  className={`ccard ${sel?.id === c.id ? 'selected' : ''} ${dragOver === c.id ? 'drop' : ''}`}
                  onClick={() => setSelected(c.id)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(c.id);
                  }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(null);
                    drop(c, e.dataTransfer.getData('text/plain'));
                  }}
                >
                  <div className="row">
                    <span className={`ctag ${ratio < 0.6 ? 'orange' : ''}`}>C{i + 1}</span>
                    <span className="bold small">{c.type}</span>
                    <div className="grow" />
                    {c.planValidated && <Check size={16} className="green" />}
                  </div>
                  <div className="xs muted">{c.number ?? c.id}</div>
                  <div className="row">
                    <span className="bold" style={{ fontSize: 18 }}>
                      {Math.round(ratio * 100)} %
                    </span>
                    <div className="grow" />
                    <ContainerStatusPill status={c.status} />
                  </div>
                  <Progress value={ratio} warnAt={0.98} />
                  <div className="xs muted">
                    {dec(cbm, 2)} / {dec(containerCapacity(c), 2)} m³
                  </div>
                  <div className="bold">{num(containerQty(c))} pcs</div>
                </div>
              );
            })}
            {auth.can('logistics.plan') && <div
              className="ccard center"
              style={{ justifyContent: 'center', alignItems: 'center', borderStyle: 'dashed', minHeight: 150 }}
              onClick={() => {
                dispatch({ type: 'createContainer', supplierId: pf.supplierId, etd: pf.etd, eta: pf.eta });
                toast('Conteneur 40HC créé');
              }}
            >
              <Plus className="green" />
              <span className="bold small">Nouveau conteneur</span>
            </div>}
          </div>
        </div>

        <div className="card pad">
          {sel ? (
            <ContainerPanel c={sel} index={containers.indexOf(sel) + 1} portal={portal} />
          ) : (
            <div className="empty">Aucun conteneur. Créez-en un pour commencer la consolidation.</div>
          )}
        </div>
      </div>

      <div className="card summary-bar">
        <Ring value={totalQty ? loadedQty / totalQty : 0} size={78} stroke={9} />
        <div className="col">
          <div className="bold" style={{ fontSize: 16 }}>
            Consolidation {pf.id}
          </div>
          <span className="small">
            <Check size={13} className="green" /> Chargé : {num(loadedQty)} pcs ({m3(loadedCbm)})
          </span>
          <span className="small orange">
            ● Reste à consolider : {num(totalQty - loadedQty)} pcs ({m3(totalCbm - loadedCbm)})
          </span>
        </div>
        <div className="grow" />
        <Metric l="Conteneurs" v={`${containers.length} × 40HC`} />
        <Metric l="Quantité totale" v={`${num(totalQty)} pcs`} />
        <Metric l="CBM total" v={m3(totalCbm)} />
      </div>
    </>
  );
}

function ContainerPanel({ c, index, portal }: { c: Container; index: number; portal?: boolean }) {
  const { state, dispatch } = useStore();
  const auth = useAuth();
  const cbm = containerCbm(state, c);
  const ratio = cbm / containerCapacity(c);
  const editable = auth.allowed({ type: 'deallocate', containerId: c.id, proformaId: '', productId: '' }) && ['a_booker', 'booking_demande'].includes(c.status);
  return (
    <>
      <div className="card-title">
        <Ctn size={18} className="green" /> Conteneur C{index} – Détail
      </div>
      <div className="row mb">
        <div className="grow">
          <div className="small">
            {dec(cbm, 2)} / {dec(containerCapacity(c), 2)} m³
          </div>
          <Progress value={ratio} warnAt={0.98} />
        </div>
        <span className="bold">{Math.round(ratio * 100)} %</span>
        <span className="bold">{num(containerQty(c))} pcs</span>
      </div>
      {ratio > 1 && <div className="pill red mb">Dépassement de capacité</div>}
      <div className="row wrap mb">
        {c.planRequested && <Pill color="orange">Plan demandé au fournisseur</Pill>}
        {c.planProposed && <Pill color="violet">Plan proposé par le fournisseur – à valider</Pill>}
        {c.planValidated && <Pill color="green" icon={<Check size={12} />}>Plan validé par JONAS</Pill>}
      </div>
      <table className="tbl">
        <thead>
          <tr>
            <th>Réf.</th>
            <th className="num">Qté</th>
            <th className="num">Cartons</th>
            <th className="num">CBM</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {c.allocations.map((a) => {
            const p = byId(state.products, a.productId);
            return (
              <tr key={a.proformaId + a.productId}>
                <td>
                  <div className="row" style={{ gap: 6 }}>
                    <ProductThumb product={p} size={26} />
                    <div>
                      <div className="bold small">{p.ref}</div>
                      <div className="xs muted">{a.proformaId}</div>
                    </div>
                  </div>
                </td>
                <td className="num">{num(a.qty)}</td>
                <td className="num">{num(a.qty / p.pcb)}</td>
                <td className="num">{dec(lineCbm(p, a.qty), 2)}</td>
                <td>
                  {editable && (
                    <button className="btn ghost sm danger" title="Retirer" onClick={() => dispatch({ type: 'deallocate', containerId: c.id, proformaId: a.proformaId, productId: a.productId })}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
          {c.allocations.length === 0 && (
            <tr>
              <td colSpan={5} className="empty">
                Déposez ici des produits
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <div className="col mt" style={{ gap: 8 }}>
        {c.status === 'a_booker' && !c.planValidated && !c.planRequested && !c.planProposed && auth.can('logistics.plan') && (
          <button
            className="btn"
            onClick={() => {
              dispatch({ type: 'requestPlan', containerId: c.id });
              toast('Plan de chargement demandé au fournisseur');
            }}
          >
            <Send size={16} /> Demander le plan au fournisseur
          </button>
        )}
        {c.status === 'a_booker' && !c.planValidated && auth.can('logistics.plan') && (
          <button className="btn" disabled={!c.allocations.length} onClick={() => dispatch({ type: 'validatePlan', containerId: c.id })}>
            <Check size={16} /> {c.planProposed ? 'Valider le plan proposé' : 'Valider le plan de chargement'}
          </button>
        )}
        {auth.allowed({ type: 'proposePlan', containerId: c.id }) && (
          <button
            className="btn primary"
            disabled={!c.allocations.length || ratio > 1 || c.planProposed}
            onClick={() => {
              dispatch({ type: 'proposePlan', containerId: c.id });
              toast('Plan envoyé à JONAS pour validation');
            }}
          >
            <Send size={16} /> {c.planProposed ? 'Plan envoyé – en attente JONAS' : 'Proposer ce plan à JONAS'}
          </button>
        )}
        {c.status === 'a_booker' && auth.can('logistics.booking') && (
          <button
            className="btn primary"
            disabled={!c.allocations.length || ratio > 1}
            onClick={() => {
              dispatch({ type: 'requestBooking', containerId: c.id });
              toast('Demande de booking envoyée');
            }}
          >
            <Calendar size={16} /> Demande de booking
          </button>
        )}
        {c.status === 'booking_demande' && auth.can('logistics.booking') && (
          <button className="btn primary" onClick={() => dispatch({ type: 'confirmBooking', containerId: c.id })}>
            <Check size={16} /> Confirmer le booking {c.bookingNo}
          </button>
        )}
        {!portal && auth.canSee('conteneurs') && (
          <Link to={`/conteneurs?c=${c.id}`} className="btn ghost sm">
            Voir dans Conteneurs →
          </Link>
        )}
      </div>
    </>
  );
}
