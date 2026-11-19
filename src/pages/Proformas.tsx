import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Landmark,
  Layers,
  List,
  PenLine,
  Search,
  SlidersHorizontal,
  Split,
} from 'lucide-react';
import { byId, isReliquat, openReliquats, shipmentLabel, pendingRevision, pendingVersion, proformaTotals, useAuth, useStore, PROFORMA_STATUS_LABEL, type State } from '../data/store';
import { PROFORMA_STATUSES, type Proforma, type ProformaStatus } from '../data/types';
import { ContainerGlyph, ProformaStatusPill, SupplierMark } from '../components/ui';
import { PROFORMA_ICON, toast } from '../components/ui-shared';
import { TODAY, dec, eur, weekKey, weekLabel, weekRange } from '../lib/format';
import { pressable } from '../lib/a11y';
import { BookingRequestButton } from '../components/BookingDialog';
import { SignDialog } from '../components/ProformaVersions';
import { NewProformaButton } from '../components/NewProforma';
import Combobox from '../components/Combobox';

type View = 'liste' | 'semaine' | 'fournisseur';

export default function Proformas() {
  const { state } = useStore();
  const navigate = useNavigate();
  const auth = useAuth();
  const canSign = auth.can('proforma.sign');
  const showMoney = auth.can('finance.view');
  const [params, setParams] = useSearchParams();
  const status = (params.get('statut') as ProformaStatus | null) ?? 'all';
  const onlyReliquats = params.get('reliquats') === '1';
  const [view, setView] = useState<View>('semaine');
  const [q, setQ] = useState('');
  const [supplier, setSupplier] = useState('all');
  const [showFilter, setShowFilter] = useState(false);
  const [showPast, setShowPast] = useState(false);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return state.proformas
      .filter((p) => status === 'all' || p.status === status)
      .filter((p) => !onlyReliquats || (isReliquat(p) && p.status !== 'arrive'))
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
  }, [state, status, supplier, q, onlyReliquats]);

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
    params.delete('reliquats');
    if (s === 'all') params.delete('statut');
    else params.set('statut', s);
    setParams(params);
  };
  const reliquatsOpen = openReliquats(state).length;
  const [signing, setSigning] = useState<string | null>(null);
  const sign = (id: string) => {
    const pf = state.proformas.find((p) => p.id === id)!;
    if (!pendingVersion(pf)) return toast('En attente de la proforma du fournisseur : il doit la déposer dans son portail');
    setSigning(id);
  };
  const signingPf = signing ? state.proformas.find((p) => p.id === signing) : undefined;
  const signingDoc = signingPf ? pendingVersion(signingPf) : undefined;

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
              <Combobox id="pf-sup" value={supplier} onChange={setSupplier} placeholder="Tapez un fournisseur…" options={[{ id: 'all', label: 'Tous les fournisseurs' }, ...state.suppliers.map((s) => ({ id: s.id, label: s.name, sub: `${s.flag} ${s.city}`, keywords: `${s.name} ${s.shortName}` }))]} />
              {pastWeeks > 0 && (
                <label className="row small" style={{ gap: 6 }}>
                  <input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} /> Afficher les semaines passées ({pastWeeks})
                </label>
              )}
            </div>
          )}
        </div>
        <NewProformaButton onCreated={(id) => navigate(`/proformas/${id}`)} />
        {canSign && (
          <button className="pf-btn primary" onClick={() => setStatus('a_signer')}>
            <PenLine size={21} /> Signer ({toSign.length})
          </button>
        )}
      </div>

      <div className="pf-chips">
        <button className={`pf-chip ${status === 'all' && !onlyReliquats ? 'active' : ''}`} onClick={() => setStatus('all')}>
          <Layers size={19} /> Toutes <b>{state.proformas.length}</b>
        </button>
        {PROFORMA_STATUSES.map((s) => {
          const Icon = PROFORMA_ICON[s].icon;
          return (
            <button key={s} className={`pf-chip ${status === s && !onlyReliquats ? 'active' : ''}`} onClick={() => setStatus(s)}>
              <Icon size={19} style={{ color: status === s ? undefined : PROFORMA_ICON[s].color }} /> {PROFORMA_STATUS_LABEL[s]} <b>{state.proformas.filter((p) => p.status === s).length}</b>
            </button>
          );
        })}
        <button
          className={`pf-chip ${onlyReliquats ? 'active' : ''}`}
          onClick={() => {
            params.delete('statut');
            if (onlyReliquats) params.delete('reliquats');
            else params.set('reliquats', '1');
            setParams(params);
          }}
        >
          <Split size={19} style={{ color: onlyReliquats ? undefined : 'var(--violet)' }} /> Reliquats <b>{reliquatsOpen}</b>
        </button>
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
      {signingPf && signingDoc && <SignDialog pf={signingPf} doc={signingDoc} onClose={() => setSigning(null)} />}
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

  return (
    <section className={`pf-week ${open ? 'open' : ''}`}>
      <header className="pf-week-head" {...pressable(() => setOpen(!open), `${title} : ${open ? 'replier' : 'déplier'}`)} aria-expanded={open}>
        <Calendar className="pf-week-cal" size={38} strokeWidth={1.8} />
        <div className="pf-week-title">
          <h2>{title}</h2>
          <span>{sub}</span>
        </div>
        <span className="pf-count">
          {items.length} proforma{items.length > 1 ? 's' : ''}
        </span>
        <div className="pf-metrics">
          <div className="pf-metric">
            <small>CBM</small>
            <b>{dec(cbm)}</b>
          </div>
          <div className="pf-metric">
            <small>
              <ContainerGlyph size={18} />
            </small>
            <b>≈ {dec(cbm / 69)}</b>
          </div>
          {showMoney && (
            <div className="pf-metric pf-metric-amount">
              <small>Montant</small>
              <b>{eur(amount)}</b>
            </div>
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
            <div className="pf-cards-head">
              <span>Proforma</span>
              <span>Pack</span>
              <span>Chgt</span>
              <span />
            </div>
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
  const title = p.title ?? byId(state.products, p.lines[0].productId).name;
  const packsDone = t.packsOk === t.packsTotal;
  const part = shipmentLabel(state, p);
  return { t, sup, title: part ? `${title} · ${part}` : title, packsDone };
}

function StatusCell({ p, onSign }: { p: Proforma; onSign?: (id: string) => void }) {
  const revision = pendingRevision(p);
  if (revision)
    return (
      <BookingStatus p={p}>
        {onSign ? (
          <button
            className="pf-bk-btn"
            onClick={(e) => {
              e.stopPropagation();
              onSign(p.id);
            }}
          >
            <PenLine size={11} /> Signer la modification v{revision.version}
          </button>
        ) : (
          <small className="pf-bk-wait">Modification v{revision.version} à signer (Direction)</small>
        )}
      </BookingStatus>
    );
  if (p.status === 'a_signer')
    return (
      <div className="pf-sign">
        <span>
          <PenLine size={16} /> À signer
        </span>
        {!pendingVersion(p) ? (
          <small className="pf-bk-wait">Attente de la proforma du fournisseur</small>
        ) : onSign && (
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
  return <BookingStatus p={p} />;
}

/** Statut + accès direct à la demande de booking depuis la liste */
function BookingStatus({ p, children }: { p: Proforma; children?: React.ReactNode }) {
  return (
    <div className="pf-bkcell">
      {children}
      <ProformaStatusPill status={p.status} big />
      <BookingRequestButton pf={p} variant="chip" />
      {p.booking && !p.booking.answeredAt && <small className="pf-bk-wait">Booking demandé · {p.booking.proposal ? 'proposition à valider' : p.booking.ackAt ? `attente ${p.booking.forwarder}` : 'attente fournisseur'}</small>}
    </div>
  );
}

function AmountCell({ p, amount, deposit, amountCur, currency }: { p: Proforma; amount: number; deposit: number; amountCur?: number; currency?: string }) {
  return (
    <div className="pf-amount">
      <b>{eur(amount)}</b>
      {currency && currency !== 'EUR' && amountCur !== undefined && (
        <small className="pf-cur">
          {new Intl.NumberFormat('fr-FR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amountCur)}
        </small>
      )}
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

function PackCell({ ok, total, done }: { ok: number; total: number; done: boolean }) {
  return done ? (
    <span className="pf-ok">OK</span>
  ) : (
    <span className="pf-big">
      {ok}/{total}
    </span>
  );
}

function Row({ p, state, showMoney, onSign, onOpen }: RowProps) {
  const { t, sup, title, packsDone } = useRowData(p, state);
  return (
    <tr {...pressable(onOpen, `Ouvrir ${p.id}`)}>
      <td>
        <div className="pf-ref">
          <SupplierMark supplier={sup} size={30} />
          <b>{p.id}</b>
        </div>
      </td>
      <td className="pf-prod">
        <b>{title}</b>
      </td>
      <td className="pf-sup">{sup.name}</td>
      <td className="c">
        <PackCell ok={t.packsOk} total={t.packsTotal} done={packsDone} />
      </td>
      <td className="c">
        <CheckCircle2 className="pf-check" size={28} strokeWidth={1.8} />
      </td>
      <td className="c">
        <div className="pf-cbm">
          <b>{dec(t.cbm)}</b>
          <small>
            {dec(t.eq40)} <ContainerGlyph size={18} />
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
          <AmountCell p={p} amount={t.amount} deposit={t.deposit} amountCur={t.amountCur} currency={t.currency} />
        </td>
      )}
      <td className="pf-go">
        <ChevronRight size={22} />
      </td>
    </tr>
  );
}

/** Téléphone : ligne fine (identité, état pack, chargement) ; le détail s'ouvre au toucher. */
function Card({ p, state, showMoney, onSign, onOpen }: RowProps) {
  const { t, sup, title, packsDone } = useRowData(p, state);
  const [open, setOpen] = useState(false);
  return (
    <article className={`pf-line ${open ? 'open' : ''}`}>
      <button className="pf-line-main" onClick={() => setOpen(!open)} aria-expanded={open}>
        <SupplierMark supplier={sup} size={22} />
        <span className="pf-line-id">
          <b>{p.id}</b>
          <small>{title}</small>
        </span>
        <span className="pf-line-pack">
          <PackCell ok={t.packsOk} total={t.packsTotal} done={packsDone} />
        </span>
        <span className="pf-line-week">{weekLabel(p.etd)}</span>
        {open ? <ChevronUp size={18} className="muted" /> : <ChevronDown size={18} className="muted" />}
      </button>
      {open && (
        <div className="pf-line-detail">
          <div className="xs muted">{sup.name}</div>
          <div className="pf-card-grid">
            <div>
              <small>Validation</small>
              <CheckCircle2 className="pf-check" size={22} strokeWidth={1.8} />
            </div>
            <div>
              <small>CBM</small>
              <b>{dec(t.cbm)}</b>
            </div>
            <div>
              <small>40HC</small>
              <b>≈ {dec(t.eq40)}</b>
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
              <small>Pack</small>
              <PackCell ok={t.packsOk} total={t.packsTotal} done={packsDone} />
            </div>
          </div>
          <div className="pf-card-bottom">
            <StatusCell p={p} onSign={onSign} />
            {showMoney && <AmountCell p={p} amount={t.amount} deposit={t.deposit} amountCur={t.amountCur} currency={t.currency} />}
          </div>
          <button className="pf-btn pf-line-open" onClick={onOpen}>
            Ouvrir la proforma <ChevronRight size={18} />
          </button>
        </div>
      )}
    </article>
  );
}
