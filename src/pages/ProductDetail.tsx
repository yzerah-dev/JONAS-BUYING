import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  BarChart3,
  Boxes,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Container as Ctn,
  Download,
  Factory,
  FileText,
  FlaskConical,
  History,
  LayoutGrid,
  Palette,
  ShoppingCart,
  Tag,
  Truck,
  Warehouse,
} from 'lucide-react';
import {
  byId,
  containerEta,
  containerEtd,
  packDone,
  productQuantities,
  useAuth,
  useStore,
  type State,
  brandOf,
} from '../data/store';
import { DEV_STAGES, type Product } from '../data/types';
import { SITES } from '../data/seed';
import PackFiles from '../components/PackFiles';
import ProductGallery from '../components/ProductGallery';
import { BrandLogo, ProductPic, ContainerStatusPill, PackPill, Pill, ProformaStatusPill, Progress, Tabs, ValidationCircuit } from '../components/ui';
import { toast } from '../components/ui-shared';
import { dec, eur, eur2, fdate, fshort, num, weekLabel } from '../lib/format';

type Tab = 'overview' | 'design' | 'dev' | 'commandes' | 'production' | 'logistique' | 'stock' | 'docs';

export default function ProductDetail() {
  const { id } = useParams();
  const { state } = useStore();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('overview');
  const idx = state.products.findIndex((p) => p.id === id);
  const p = state.products[idx];
  if (!p) return <div className="card empty">Produit introuvable.</div>;
  const q = productQuantities(state, p.id);
  const brand = brandOf(state.brands, p.brandId);
  const go = (d: number) => navigate(`/produits/${state.products[(idx + d + state.products.length) % state.products.length].id}`);

  return (
    <>
      <div className="page-head">
        <button className="btn" onClick={() => navigate('/produits')}>
          <ChevronLeft size={16} /> Retour
        </button>
        <h1>Fiche produit</h1>
        <div className="grow" />
        <button className="btn ghost" onClick={() => go(-1)}>
          <ChevronLeft />
        </button>
        <span className="bold">
          {idx + 1} / {state.products.length}
        </span>
        <button className="btn ghost" onClick={() => go(1)}>
          <ChevronRight />
        </button>
      </div>

      <div className="card pad row wrap gap-lg">
        <ProductGallery product={p} />
        <BrandLogo brand={brand} size={20} />
        <div className="col" style={{ gap: 8 }}>
          <h2 style={{ fontSize: 26, color: 'var(--green-dark)' }}>{p.name}</h2>
          <div className="muted">
            Réf. <b>{p.ref}</b> · EAN : {p.ean}
            {p.supplierRef ? ` · Réf. fournisseur : ${p.supplierRef}` : ''}
          </div>
          <div className="row wrap">
            {p.developed ? <Pill color="green" icon={<Check size={13} />}>Développé</Pill> : <Pill color="violet">En développement</Pill>}
            {q.open > 0 && <Pill color="blue" icon={<ShoppingCart size={13} />}>En commande</Pill>}
            {q.nextArrival && (
              <Pill color="grey" icon={<Calendar size={13} />}>
                Prochain arrivage : {weekLabel(q.nextArrival)}
              </Pill>
            )}
            <PackPill product={p} prefix />
          </div>
        </div>
        <div className="grow" />
        <div className="kpis" style={{ gridTemplateColumns: 'repeat(5, minmax(100px, 1fr))' }}>
          <Stat l="PA" v={eur2(p.pa)} />
          <Stat l="PCB" v={String(p.pcb)} />
          <Stat l="Qté totale" v={num(q.ordered)} />
          <Stat l="En transit" v={num(q.inTransit)} />
          <Stat l="En stock" v={num(q.stock)} />
        </div>
      </div>

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'overview', label: 'Vue d’ensemble', icon: <LayoutGrid size={16} /> },
          { id: 'design', label: 'Design & Pack', icon: <Palette size={16} /> },
          { id: 'dev', label: 'Développement', icon: <FlaskConical size={16} /> },
          { id: 'commandes', label: 'Commandes', icon: <ShoppingCart size={16} /> },
          { id: 'production', label: 'Production', icon: <Factory size={16} /> },
          { id: 'logistique', label: 'Logistique & Conteneurs', icon: <Ctn size={16} /> },
          { id: 'stock', label: 'Stock & Ventes', icon: <Warehouse size={16} /> },
          { id: 'docs', label: 'Documents & Historique', icon: <History size={16} /> },
        ]}
      />

      {tab === 'overview' && (
        <div className="split3">
          <div className="col gap-lg">
            <InfoCard p={p} state={state} />
            <PriceCard p={p} q={q.ordered} />
          </div>
          <div className="col gap-lg">
            <DesignCard p={p} />
            <OrdersCard p={p} state={state} />
            <LogisticsCard p={p} state={state} />
          </div>
          <div className="col gap-lg">
            <ArrivalsCard p={p} state={state} />
            <StockCard p={p} state={state} />
            <IndicatorsCard p={p} state={state} />
          </div>
        </div>
      )}
      {tab === 'design' && <DesignCard p={p} full />}
      {tab === 'dev' && <DevCard p={p} />}
      {tab === 'commandes' && <OrdersCard p={p} state={state} />}
      {tab === 'production' && <ProductionCard p={p} state={state} />}
      {tab === 'logistique' && <LogisticsCard p={p} state={state} />}
      {tab === 'stock' && (
        <div className="grid2">
          <StockCard p={p} state={state} />
          <IndicatorsCard p={p} state={state} />
        </div>
      )}
      {tab === 'docs' && <DocsCard p={p} state={state} />}
    </>
  );
}

function Stat({ l, v }: { l: string; v: string }) {
  return (
    <div className="kpi" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
      <div className="kpi-label">{l}</div>
      <div className="kpi-value">{v}</div>
    </div>
  );
}

function Card({ title, icon, children, action }: { title: string; icon: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="card pad">
      <div className="card-title">
        {icon} {title}
        <div className="grow" />
        {action}
      </div>
      {children}
    </div>
  );
}

function InfoCard({ p, state }: { p: Product; state: State }) {
  return (
    <Card title="Informations produit" icon={<Tag size={18} className="green" />}>
      <dl className="kv">
        <dt>Marque</dt>
        <dd>{brandOf(state.brands, p.brandId).name}</dd>
        <dt>Réf. interne</dt>
        <dd>{p.ref}</dd>
        <dt>EAN</dt>
        <dd>{p.ean}</dd>
        {p.supplierRef && (
          <>
            <dt>Réf. fournisseur</dt>
            <dd>{p.supplierRef}</dd>
          </>
        )}
        <dt>Désignation</dt>
        <dd>{p.name}</dd>
        <dt>Rayon</dt>
        <dd>{p.rayon}</dd>
        <dt>Collection</dt>
        <dd>{p.collection}</dd>
        <dt>Genre</dt>
        <dd>{p.gender}</dd>
        {p.sizes && (
          <>
            <dt>Tailles</dt>
            <dd>{p.sizes}</dd>
          </>
        )}
        <dt>Matière</dt>
        <dd>{p.material}</dd>
        <dt>Fournisseur</dt>
        <dd>
          <Link className="green" to={`/fournisseurs/${p.supplierId}`}>
            {byId(state.suppliers, p.supplierId).name}
          </Link>
        </dd>
      </dl>
    </Card>
  );
}

function PriceCard({ p, q }: { p: Product; q: number }) {
  const cbmPiece = p.cbmCarton / p.pcb;
  return (
    <Card title="Prix & conditionnement" icon={<Boxes size={18} className="green" />}>
      <dl className="kv">
        <dt>PA unitaire</dt>
        <dd>{eur2(p.pa)}</dd>
        <dt>PCB</dt>
        <dd>{p.pcb}</dd>
        <dt>Poids unitaire</dt>
        <dd>{dec(p.weight, 2)} kg</dd>
        <dt>CBM carton</dt>
        <dd>{dec(p.cbmCarton, 3)} m³</dd>
        <dt>Cartons / 40HC</dt>
        <dd>{num(Math.floor(69 / p.cbmCarton))}</dd>
        <dt>Pièces / 40HC</dt>
        <dd>{num(Math.floor(69 / p.cbmCarton) * p.pcb)}</dd>
        <dt>CBM total ({num(q)})</dt>
        <dd>{dec(cbmPiece * q, 1)} m³</dd>
      </dl>
    </Card>
  );
}

function DesignCard({ p, full }: { p: Product; full?: boolean }) {
  const { dispatch } = useStore();
  const auth = useAuth();
  const steps = ['Brief', 'Design', 'Pack'];
  return (
    <Card title="Flux de design & validations" icon={<Palette size={18} className="green" />} action={<PackPill product={p} />}>
      <div className="row mb small">
        {steps.map((s) => (
          <Pill key={s} color="green" icon={<Check size={12} />}>
            {s}
          </Pill>
        ))}
        <span className="muted">Type de pack : </span>
        <b>{p.pack.type}</b>
      </div>
      <ValidationCircuit product={p} />
      <div className="grid3 mt">
        <div className="thumb" style={{ height: 90, background: '#f1ebe2', fontSize: 13, fontWeight: 800 }}>
          📦 Pack v{p.pack.artworkVersions}
        </div>
        <div className="thumb" style={{ height: 90, background: '#f5f7f6', fontSize: 13, fontWeight: 800 }}>
          ✂️ Die cut {p.pack.dieCut === 'received' ? '(reçu)' : p.pack.dieCut === 'requested' ? '(demandé)' : '(—)'}
        </div>
        <div className="thumb" style={{ height: 90, background: p.tint, fontSize: 44 }}>
          <ProductPic product={p} />
        </div>
      </div>
      <div className="row wrap mt">
        <button className="btn sm" onClick={() => toast('Téléchargement Pack (AI) – démo')}>
          <Download size={13} /> Pack (AI)
        </button>
        <button className="btn sm" disabled={p.pack.dieCut !== 'received'} onClick={() => toast('Téléchargement Die cut (PDF) – démo')}>
          <Download size={13} /> Die cut (PDF)
        </button>
        <button className="btn sm" onClick={() => toast('Téléchargement Rendus (JPG) – démo')}>
          <Download size={13} /> Rendus (JPG)
        </button>
        {full && !packDone(p) && auth.allowed({ type: 'validatePack', productId: p.id }) && (
          <button className="btn primary sm" onClick={() => dispatch({ type: 'validatePack', productId: p.id })}>
            <Check size={13} /> Valider l’étape en cours
          </button>
        )}
      </div>
      {full && (
        <div className="mt">
          <PackFiles p={p} />
        </div>
      )}
      <div className="small muted mt">
        Designer : <b>{p.pack.designer}</b> · Date limite artwork : <b className={p.pack.artworkDeadline < '2026-11-14' && !packDone(p) ? 'red' : ''}>{fdate(p.pack.artworkDeadline)}</b>
      </div>
    </Card>
  );
}

function DevCard({ p }: { p: Product }) {
  return (
    <Card title="Développement" icon={<FlaskConical size={18} className="green" />}>
      <div className="stepper mb">
        {DEV_STAGES.map((s, i) => (
          <div key={s} className={`step ${i < p.devStage ? 'done' : i === p.devStage ? 'current' : ''}`}>
            <div className="bullet">{i < p.devStage || (p.developed && i === p.devStage) ? <Check size={15} strokeWidth={3} /> : i + 1}</div>
            <div className="lbl">{s}</div>
          </div>
        ))}
      </div>
      <dl className="kv">
        <dt>Étape actuelle</dt>
        <dd>{DEV_STAGES[p.devStage]}</dd>
        <dt>Prochaine action</dt>
        <dd>{p.nextAction}</dd>
        <dt>Échéance</dt>
        <dd>{fdate(p.devDeadline)}</dd>
        {!p.developed && (
          <>
            <dt>Quantité cible</dt>
            <dd>{num(p.targetQty)} pcs</dd>
          </>
        )}
      </dl>
    </Card>
  );
}

function OrdersCard({ p, state }: { p: Product; state: State }) {
  const rows = state.proformas.flatMap((pf) => pf.lines.filter((l) => l.productId === p.id).map((l) => ({ pf, l })));
  const total = rows.reduce((s, r) => s + r.l.qty, 0);
  const amount = rows.reduce((s, r) => s + r.l.qty * r.l.price, 0);
  return (
    <Card title={`Commandes & proformas (${rows.length})`} icon={<ShoppingCart size={18} className="green" />}>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>N° commande</th>
              <th>N° proforma</th>
              <th className="num">Qté</th>
              <th className="num">Montant</th>
              <th>Sem. départ</th>
              <th>Statut</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ pf, l }) => (
              <tr key={pf.id}>
                <td className="bold">{pf.poNumber}</td>
                <td>
                  <Link className="green bold" to={`/proformas/${pf.id}`}>
                    {pf.id}
                  </Link>
                </td>
                <td className="num">{num(l.qty)}</td>
                <td className="num">{eur(l.qty * l.price)}</td>
                <td>{weekLabel(pf.etd)}</td>
                <td>
                  <ProformaStatusPill status={pf.status} />
                </td>
              </tr>
            ))}
            <tr>
              <td className="bold">Total</td>
              <td />
              <td className="num bold">{num(total)}</td>
              <td className="num bold">{eur(amount)}</td>
              <td colSpan={2} />
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}

const PROD_PROGRESS = { a_signer: 0, en_dev: 0.1, en_production: 0.6, booke: 1, en_transit: 1, arrive: 1 };

function ProductionCard({ p, state }: { p: Product; state: State }) {
  const rows = state.proformas.flatMap((pf) => pf.lines.filter((l) => l.productId === p.id).map((l) => ({ pf, l })));
  return (
    <Card title="Production" icon={<Factory size={18} className="green" />}>
      <table className="tbl">
        <thead>
          <tr>
            <th>Proforma</th>
            <th className="num">Commandé</th>
            <th className="num">Produit</th>
            <th className="num">Reste à produire</th>
            <th style={{ width: 200 }}>Avancement</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ pf, l }) => {
            const r = PROD_PROGRESS[pf.status];
            const done = Math.round((l.qty * r) / p.pcb) * p.pcb;
            return (
              <tr key={pf.id}>
                <td className="bold">{pf.id}</td>
                <td className="num">{num(l.qty)}</td>
                <td className="num">{num(done)}</td>
                <td className="num">{num(l.qty - done)}</td>
                <td>
                  <Progress value={r} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

function LogisticsCard({ p, state }: { p: Product; state: State }) {
  const rows = state.containers.flatMap((c) => c.allocations.filter((a) => a.productId === p.id).map((a) => ({ c, a })));
  return (
    <Card title={`Logistique & conteneurs (${rows.length})`} icon={<Truck size={18} className="green" />}>
      {rows.length === 0 ? (
        <div className="empty">Pas encore affecté à un conteneur.</div>
      ) : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Conteneur</th>
                <th>Commande</th>
                <th className="num">Qté</th>
                <th>Départ (ETD)</th>
                <th>Arrivée (ETA)</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ c, a }) => (
                <tr key={c.id + a.proformaId}>
                  <td>
                    <Link className="bold green" to={`/conteneurs?c=${c.id}`}>
                      {c.number ?? c.id}
                    </Link>
                    <div className="xs muted">{c.type}</div>
                  </td>
                  <td>{byId(state.proformas, a.proformaId).poNumber}</td>
                  <td className="num">{num(a.qty)}</td>
                  <td>
                    {fshort(containerEtd(c))} ({weekLabel(containerEtd(c))})
                  </td>
                  <td>
                    {fshort(containerEta(c))} ({weekLabel(containerEta(c))})
                  </td>
                  <td>
                    <ContainerStatusPill status={c.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function ArrivalsCard({ p, state }: { p: Product; state: State }) {
  const rows = state.containers
    .filter((c) => c.status !== 'arrive')
    .flatMap((c) => c.allocations.filter((a) => a.productId === p.id).map((a) => ({ c, a })))
    .sort((x, y) => containerEta(x.c).localeCompare(containerEta(y.c)));
  const planned = state.proformas.filter((pf) => ['a_signer', 'en_dev', 'en_production'].includes(pf.status) && pf.lines.some((l) => l.productId === p.id));
  return (
    <Card title="Planning des arrivages" icon={<Calendar size={18} className="green" />}>
      {rows.map(({ c, a }) => (
        <div key={c.id} className="alert-line">
          <span className="bold">
            {weekLabel(containerEta(c))} – {fshort(containerEta(c))}
          </span>
          <span className="small muted">
            {num(a.qty)} pcs ({c.number ?? c.id})
          </span>
          <span className="grow" />
          <ContainerStatusPill status={c.status} />
        </div>
      ))}
      {planned
        .filter((pf) => !rows.some((r) => r.a.proformaId === pf.id))
        .map((pf) => (
          <div key={pf.id} className="alert-line">
            <span className="bold">
              {weekLabel(pf.eta)} – {fshort(pf.eta)}
            </span>
            <span className="small muted">
              {num(pf.lines.find((l) => l.productId === p.id)!.qty)} pcs ({pf.id})
            </span>
            <span className="grow" />
            <Pill color="grey">Prévu</Pill>
          </div>
        ))}
      {rows.length + planned.length === 0 && <div className="empty">Aucun arrivage prévu.</div>}
    </Card>
  );
}

function StockCard({ p, state }: { p: Product; state: State }) {
  const incoming: Record<string, number> = {};
  for (const c of state.containers)
    if (c.status !== 'arrive') for (const a of c.allocations) if (a.productId === p.id) incoming[c.warehouse] = (incoming[c.warehouse] ?? 0) + a.qty;
  const tot = { s: 0, i: 0 };
  return (
    <Card title="Stocks & prévisions" icon={<Warehouse size={18} className="green" />}>
      <div className="tbl-wrap">
      <table className="tbl">
        <thead>
          <tr>
            <th>Lieu</th>
            <th className="num">Stock actuel</th>
            <th className="num">Arrivages à venir</th>
            <th className="num">Stock projeté</th>
          </tr>
        </thead>
        <tbody>
          {SITES.map((site) => {
            const s = p.stock[site] ?? 0;
            const i = incoming[site] ?? 0;
            tot.s += s;
            tot.i += i;
            return (
              <tr key={site}>
                <td>{site}</td>
                <td className="num">{num(s)}</td>
                <td className="num">{num(i)}</td>
                <td className="num">{num(s + i)}</td>
              </tr>
            );
          })}
          <tr style={{ background: 'var(--green-soft)' }}>
            <td className="bold">Total</td>
            <td className="num bold">{num(tot.s)}</td>
            <td className="num bold">{num(tot.i)}</td>
            <td className="num bold">{num(tot.s + tot.i)}</td>
          </tr>
        </tbody>
      </table>
      </div>
      <div className="xs muted mt">Stock à connecter à l’ERP TCI. Valeurs actuelles : démonstration.</div>
    </Card>
  );
}

function IndicatorsCard({ p, state }: { p: Product; state: State }) {
  const q = productQuantities(state, p.id);
  const dailySales = Math.max(20, Math.round(q.ordered / 365));
  return (
    <Card title="Indicateurs" icon={<BarChart3 size={18} className="green" />}>
      <div className="kpis">
        <Stat l="Couverture" v={`${Math.round(q.stock / dailySales)} jours`} />
        <Stat l="Rotation" v={`${dec(q.ordered / Math.max(1, q.stock + q.inTransit), 1)} / an`} />
        <Stat l="Marge cible" v="30 %" />
      </div>
    </Card>
  );
}

function DocsCard({ p, state }: { p: Product; state: State }) {
  const events = [
    ...state.proformas
      .filter((pf) => pf.lines.some((l) => l.productId === p.id))
      .flatMap((pf) => pf.history.map((h) => ({ ...h, text: `${pf.id} · ${h.text}` }))),
    ...Object.entries(p.pack.validations)
      .filter(([, v]) => v.state === 'done')
      .map(([k, v]) => ({ date: v.date!, user: k, text: `Pack validé (${k})` })),
    ...(state.journal ?? []).filter((e) => e.target === p.ref).map((e) => ({ date: e.at.slice(0, 10), user: e.user, text: `${e.text} · ${e.at.slice(11, 16)}` })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div className="grid2">
      <Card title="Documents" icon={<FileText size={18} className="green" />}>
        {['Fiche technique.pdf', `Pack ${p.ref} v${p.pack.artworkVersions}.ai`, 'Die cut.pdf', 'Rendus.jpg', 'Certificat conformité.pdf'].map((d) => (
          <div key={d} className="alert-line">
            <FileText size={15} className="green" /> {d}
          </div>
        ))}
      </Card>
      <Card title="Historique" icon={<History size={18} className="green" />}>
        {events.map((e, i) => (
          <div key={i} className="alert-line">
            <span className="bold">{fdate(e.date)}</span> {e.text}
            <span className="grow" />
            <span className="muted xs">{e.user}</span>
          </div>
        ))}
      </Card>
    </div>
  );
}
