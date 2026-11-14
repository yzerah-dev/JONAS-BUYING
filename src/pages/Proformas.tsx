import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Container as Ctn,
  Landmark,
  Layers,
  List,
  PenLine,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import { byId, proformaTotals, useAuth, useStore, PROFORMA_STATUS_LABEL, type State } from '../data/store';
import { PROFORMA_STATUSES, type Proforma, type ProformaStatus } from '../data/types';
import { PROFORMA_ICON, ProformaStatusPill, SupplierMark, toast } from '../components/ui';
import { TODAY, dec, eur, weekKey, weekLabel, weekRange } from '../lib/format';

type View = 'liste' | 'semaine' | 'fournisseur';

export default function Proformas() {
  const { state, dispatch } = useStore();
  const auth = useAuth();
  const canSign = auth.can('proforma.sign');
  const showMoney = auth.can('finance.view');
  const [params, setParams] = useSearchParams();
  const status = (params.get('statut') as ProformaStatus | null) ?? 'all';
  const [view, setView] = useState<View>('semaine');
  const [q, setQ] = useState('');
  const [supplier, setSupplier] = useState('all');
  const [showFilter, setShowFilter] = useState(false);
  const [showPast, setShowPast] = useState(false);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return state.proformas
      .filter((p) => status === 'all' || p.status === status)
      .filter((p) => supplier === 'all' || p.supplierId === supplier)
      .filter((p) => {
        if (!s) return true;
        const sup = byId(state.suppliers, p.supplierId);
        const refs = p.lines.map((l) => {
          const pr = byId(state.products, l.productId);
          return `${pr.ref} ${pr.name}`;
        });
        return `${p.id} ${p.poNumber} ${sup.name} ${refs.join(' ')}`.toLowerCase().includes(s);
      })
      .sort((a, b) => a.etd.localeCompare(b.etd));
  }, [state, status, supplier, q]);

  const groups = useMemo(() => {
    if (view === 'liste') return [{ key: 'all', title: 'Toutes les proformas', sub: `${filtered.length} proformas`, items: filtered, kind: 'liste' as const }];
    const map = new Map<string, Proforma[]>();
    for (const p of filtered) {
      const k = view === 'semaine' ? weekKey(p.etd) : p.supplierId;
      map.set(k, [...(map.get(k) ?? []), p]);
    }
    const current = weekKey(TODAY);
    const entries = [...map.entries()].filter(([key]) => view !== 'semaine' || showPast || status !== 'all' || key >= current);
    return entries.map(([key, items]) =>
      view === 'semaine'
        ? { key, title: `Semaine ${weekLabel(items[0].etd).slice(1)}`, sub: weekRange(items[0].etd), items, kind: 'semaine' as const }
        : { key, title: byId(state.suppliers, key).name, sub: `${byId(state.suppliers, key).flag} ${byId(state.suppliers, key).city}`, items, kind: 'fournisseur' as const },
    );
  }, [filtered, view, state.suppliers, showPast, status]);
  const pastWeeks = view === 'semaine' && status === 'all' ? new Set(filtered.filter((p) => weekKey(p.etd) < weekKey(TODAY)).map((p) => weekKey(p.etd))).size : 0;

  const toSign = state.proformas.filter((p) => p.status === 'a_signer');
  const setStatus = (s: string) => {
    if (s === 'all') params.delete('statut');
    else params.set('statut', s);
    setParams(params);
  };
  const sign = (id: string) => {
    dispatch({ type: 'signProforma', id });
    toast(`${id} signée`);
  };

  return (
    <div className="pf-page">
      <h1 className="pf-title">Proformas</h1>

      <div className="pf-toolbar">
        <label className="pf-search">
          <Search size={20} />
          <input placeholder="Rechercher une proforma, un fournisseur, une référence…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <div style={{ position: 'relative' }}>
          <button className={`pf-btn ${supplier !== 'all' ? 'on' : ''}`} onClick={() => setShowFilter(!showFilter)}>
            <SlidersHorizontal size={19} /> Filtrer
          </button>
          {showFilter && (
            <div className="card pf-popover">
              <label className="xs muted" htmlFor="pf-sup">
                Fournisseur
              </label>
              <select id="pf-sup" className="input" value={supplier} onChange={(e) => setSupplier(e.target.value)}>
                <option value="all">Tous les fournisseurs</option>
                {state.suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              {pastWeeks > 0 && (
                <label className="row small" style={{ gap: 6 }}>
                  <input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} /> Afficher les semaines passées ({pastWeeks})
                </label>
              )}
            </div>
          )}
        </div>
        {canSign && (
          <button className="pf-btn primary" onClick={() => setStatus('a_signer')}>
            <PenLine size={21} /> Signer ({toSign.length})
          </button>
        )}
      </div>

      <div className="pf-chips">
        <button className={`pf-chip ${status === 'all' ? 'active' : ''}`} onClick={() => setStatus('all')}>
          <Layers size={19} /> Toutes <b>{state.proformas.length}</b>
        </button>
        {PROFORMA_STATUSES.map((s) => {
          const Icon = PROFORMA_ICON[s].icon;
          return (
            <button key={s} className={`pf-chip ${status === s ? 'active' : ''}`} onClick={() => setStatus(s)}>
              <Icon size={19} style={{ color: status === s ? undefined : PROFORMA_ICON[s].color }} /> {PROFORMA_STATUS_LABEL[s]} <b>{state.proformas.filter((p) => p.status === s).length}</b>
            </button>
          );
        })}
      </div>

      <div className="pf-views">
        {(
          [
            ['liste', 'Vue liste', List],
            ['semaine', 'Par semaine d’expédition', Calendar],
            ['fournisseur', 'Par fournisseur', Landmark],
          ] as const
        ).map(([id, label, Icon]) => (
          <button key={id} className={view === id ? 'active' : ''} onClick={() => setView(id)}>
            <Icon size={19} /> {label}
          </button>
        ))}
      </div>

      {groups.length === 0 && <div className="card empty">Aucune proforma ne correspond à ces filtres.</div>}
      {groups.map((g, i) => (
        <Group
          key={g.key + view + status}
          title={g.title}
          sub={g.sub}
          items={g.items}
          state={state}
          showMoney={showMoney}
          defaultOpen={i === 0 || view === 'liste'}
          onSign={canSign ? sign : undefined}
        />
      ))}
    </div>
  );
}

function Group({
  title,
  sub,
  items,
  state,
  defaultOpen,
  onSign,
  showMoney,
}: {
  title: string;
  sub: string;
  items: Proforma[];
  state: State;
  defaultOpen: boolean;
  onSign?: (id: string) => void;
  showMoney: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const navigate = useNavigate();
  const totals = items.map((p) => proformaTotals(state, p));
  const cbm = totals.reduce((s, t) => s + t.cbm, 0);
  const amount = totals.reduce((s, t) => s + t.amount, 0);
  const packsOk = totals.reduce((s, t) => s + t.packsOk, 0);
  const packsTotal = totals.reduce((s, t) => s + t.packsTotal, 0);
  const depositTodo = items.reduce((s, p, i) => s + (p.depositPaid ? 0 : totals[i].deposit), 0);

  return (
    <section className={`pf-week ${open ? 'open' : ''}`}>
      <header className="pf-week-head" onClick={() => setOpen(!open)}>
        <Calendar className="pf-week-cal" size={38} strokeWidth={1.8} />
        <div className="pf-week-title">
          <h2>{title}</h2>
          <span>{sub}</span>
        </div>
        <span className="pf-count">
          {items.length} proforma{items.length > 1 ? 's' : ''}
        </span>
        <div className="pf-metrics">
          <div className="pf-pack">
            <Box size={22} strokeWidth={1.8} />
            <div>
              <small>État pack</small>
              <b>
                {packsOk}/{packsTotal}
              </b>
            </div>
          </div>
          <div className="pf-metric">
            <small>CBM</small>
            <b>{dec(cbm)}</b>
          </div>
          <div className="pf-metric">
            <small>
              <Ctn size={15} />
            </small>
            <b>≈ {dec(cbm / 69)}</b>
          </div>
          {showMoney && (
            <>
              <div className="pf-metric">
                <small>Montant</small>
                <b>{eur(amount)}</b>
              </div>
              <div className={`pf-deposit ${depositTodo > 0 ? '' : 'none'}`}>
                <small>Acompte à faire</small>
                <b>{depositTodo > 0 ? eur(depositTodo) : '—'}</b>
              </div>
            </>
          )}
        </div>
        <span className="pf-chevron">{open ? <ChevronUp size={24} /> : <ChevronDown size={24} />}</span>
      </header>

      {open && (
        <div className="pf-body">
          <table className="pf-table">
            <thead>
              <tr>
                <th>Référence</th>
                <th>Produit</th>
                <th>Fournisseur</th>
                <th className="c">Pack</th>
                <th className="c">Validation</th>
                <th className="c">CBM</th>
                <th className="c">Statut</th>
                <th className="c">Chargement</th>
                <th className="c">Arrivée</th>
                {showMoney && <th className="c">Montant</th>}
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <Row key={p.id} p={p} state={state} showMoney={showMoney} onSign={onSign} onOpen={() => navigate(`/proformas/${p.id}`)} />
              ))}
            </tbody>
          </table>

          {/* Téléphone : fiches */}
          <div className="pf-cards">
            {items.map((p) => (
              <Card key={p.id} p={p} state={state} showMoney={showMoney} onSign={onSign} onOpen={() => navigate(`/proformas/${p.id}`)} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

interface RowProps {
  p: Proforma;
  state: State;
  showMoney: boolean;
  onSign?: (id: string) => void;
  onOpen: () => void;
}

function useRowData(p: Proforma, state: State) {
  const t = proformaTotals(state, p);
  const sup = byId(state.suppliers, p.supplierId);
  const names = p.lines.map((l) => byId(state.products, l.productId).name);
  const validated = ['en_production', 'booke', 'en_transit', 'arrive'].includes(p.status);
  return { t, sup, names, validated };
}

function StatusCell({ p, onSign }: { p: Proforma; onSign?: (id: string) => void }) {
  if (p.status === 'a_signer')
    return (
      <div className="pf-sign">
        <span>
          <PenLine size={16} /> À signer
        </span>
        {onSign && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSign(p.id);
            }}
          >
            <PenLine size={11} /> Signer maintenant
          </button>
        )}
      </div>
    );
  return <ProformaStatusPill status={p.status} big />;
}

function AmountCell({ p, amount, deposit }: { p: Proforma; amount: number; deposit: number }) {
  return (
    <div className="pf-amount">
      <b>{eur(amount)}</b>
      <small>Acompte : {eur(deposit)}</small>
      {p.depositPaid ? (
        <span className="ok">
          <Check size={15} strokeWidth={3} />
        </span>
      ) : (
        <span className="todo">À faire</span>
      )}
    </div>
  );
}

function Row({ p, state, showMoney, onSign, onOpen }: RowProps) {
  const { t, sup, names, validated } = useRowData(p, state);
  return (
    <tr onClick={onOpen}>
      <td>
        <div className="pf-ref">
          <SupplierMark supplier={sup} size={30} />
          <b>{p.id}</b>
        </div>
      </td>
      <td className="pf-prod">
        <b>{names[0]}</b>
        {names.length > 1 && <small>+ {names.length - 1} réf.</small>}
      </td>
      <td className="pf-sup">{sup.name}</td>
      <td className="c pf-big">
        {t.packsOk}/{t.packsTotal}
      </td>
      <td className="c">{validated ? <span className="pf-ok">OK</span> : <CheckCircle2 className="pf-check" size={26} strokeWidth={1.8} />}</td>
      <td className="c">
        <div className="pf-cbm">
          <b>{dec(t.cbm)}</b>
          <small>
            {dec(t.eq40)} <Ctn size={15} />
          </small>
        </div>
      </td>
      <td className="c">
        <StatusCell p={p} onSign={onSign} />
      </td>
      <td className="c pf-week-no">{weekLabel(p.etd)}</td>
      <td className="c pf-week-no">{weekLabel(p.eta)}</td>
      {showMoney && (
        <td className="c">
          <AmountCell p={p} amount={t.amount} deposit={t.deposit} />
        </td>
      )}
      <td className="pf-go">
        <ChevronRight size={22} />
      </td>
    </tr>
  );
}

function Card({ p, state, showMoney, onSign, onOpen }: RowProps) {
  const { t, sup, names, validated } = useRowData(p, state);
  return (
    <article className="pf-card" onClick={onOpen}>
      <div className="pf-card-top">
        <SupplierMark supplier={sup} size={28} />
        <div className="grow">
          <b>{p.id}</b>
          <div className="small">
            {names[0]}
            {names.length > 1 ? ` + ${names.length - 1}` : ''}
          </div>
          <div className="xs muted">{sup.name}</div>
        </div>
        <ChevronRight size={20} className="muted" />
      </div>
      <div className="pf-card-grid">
        <div>
          <small>Pack</small>
          <b>
            {t.packsOk}/{t.packsTotal}
          </b>
        </div>
        <div>
          <small>Validation</small>
          {validated ? <span className="pf-ok">OK</span> : <CheckCircle2 className="pf-check" size={22} strokeWidth={1.8} />}
        </div>
        <div>
          <small>CBM</small>
          <b>{dec(t.cbm)}</b>
        </div>
        <div>
          <small>Chargement</small>
          <b>{weekLabel(p.etd)}</b>
        </div>
        <div>
          <small>Arrivée</small>
          <b>{weekLabel(p.eta)}</b>
        </div>
        <div>
          <small>40HC</small>
          <b>≈ {dec(t.eq40)}</b>
        </div>
      </div>
      <div className="pf-card-bottom">
        <StatusCell p={p} onSign={onSign} />
        {showMoney && <AmountCell p={p} amount={t.amount} deposit={t.deposit} />}
      </div>
    </article>
  );
}
