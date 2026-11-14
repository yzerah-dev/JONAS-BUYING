import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Building2, Calendar, Check, ChevronDown, ChevronRight, ChevronUp, Container as Ctn, List, PenLine, Search } from 'lucide-react';
import { byId, proformaTotals, useStore, PROFORMA_STATUS_LABEL, type State } from '../data/store';
import { PROFORMA_STATUSES, type Proforma, type ProformaStatus } from '../data/types';
import { Pill, ProformaStatusPill, Seg, SupplierLogo, toast } from '../components/ui';
import { TODAY, dec, eur, weekKey, weekLabel, weekRange } from '../lib/format';

type View = 'liste' | 'semaine' | 'fournisseur';

export default function Proformas() {
  const { state, dispatch } = useStore();
  const [params, setParams] = useSearchParams();
  const status = (params.get('statut') as ProformaStatus | null) ?? 'all';
  const [view, setView] = useState<View>('semaine');
  const [q, setQ] = useState('');
  const [supplier, setSupplier] = useState('all');
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
    if (view === 'liste') return [{ key: 'all', title: 'Toutes les proformas', sub: '', items: filtered }];
    const map = new Map<string, Proforma[]>();
    for (const p of filtered) {
      const k = view === 'semaine' ? weekKey(p.etd) : p.supplierId;
      map.set(k, [...(map.get(k) ?? []), p]);
    }
    const current = weekKey(TODAY);
    const entries = [...map.entries()].filter(([key]) => view !== 'semaine' || showPast || status !== 'all' || key >= current);
    return entries.map(([key, items]) =>
      view === 'semaine'
        ? { key, title: `Semaine ${weekLabel(items[0].etd).slice(1)}`, sub: weekRange(items[0].etd), items }
        : { key, title: byId(state.suppliers, key).name, sub: `${byId(state.suppliers, key).city} · ${byId(state.suppliers, key).flag}`, items },
    );
  }, [filtered, view, state.suppliers, showPast, status]);
  const pastWeeks = view === 'semaine' && status === 'all' ? new Set(filtered.filter((p) => weekKey(p.etd) < weekKey(TODAY)).map((p) => weekKey(p.etd))).size : 0;

  const toSign = state.proformas.filter((p) => p.status === 'a_signer');
  const setStatus = (s: string) => {
    if (s === 'all') params.delete('statut');
    else params.set('statut', s);
    setParams(params);
  };

  return (
    <>
      <div className="page-head">
        <h1>Proformas</h1>
      </div>
      <div className="row wrap mb">
        <div className="search grow">
          <Search size={17} className="muted" />
          <input placeholder="Rechercher une proforma, un fournisseur, une référence…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="input" value={supplier} onChange={(e) => setSupplier(e.target.value)}>
          <option value="all">Tous les fournisseurs</option>
          {state.suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <button className="btn primary lg" onClick={() => setStatus('a_signer')}>
          <PenLine size={18} /> Signer ({toSign.length})
        </button>
      </div>

      <div className="chips mb">
        <button className={`chip ${status === 'all' ? 'active' : ''}`} onClick={() => setStatus('all')}>
          Toutes <span className="count">{state.proformas.length}</span>
        </button>
        {PROFORMA_STATUSES.map((s) => (
          <button key={s} className={`chip ${status === s ? 'active' : ''}`} onClick={() => setStatus(s)}>
            {PROFORMA_STATUS_LABEL[s]} <span className="count">{state.proformas.filter((p) => p.status === s).length}</span>
          </button>
        ))}
      </div>

      <div className="mb">
        <Seg<View>
          value={view}
          onChange={setView}
          options={[
            { id: 'liste', label: 'Vue liste', icon: <List size={16} /> },
            { id: 'semaine', label: 'Par semaine d’expédition', icon: <Calendar size={16} /> },
            { id: 'fournisseur', label: 'Par fournisseur', icon: <Building2 size={16} /> },
          ]}
        />
      </div>

      {pastWeeks > 0 && (
        <button className="btn sm mb" onClick={() => setShowPast(!showPast)}>
          {showPast ? 'Masquer' : 'Afficher'} les semaines passées ({pastWeeks})
        </button>
      )}
      {groups.length === 0 && <div className="card empty">Aucune proforma ne correspond à ces filtres.</div>}
      {groups.map((g, i) => (
        <Group key={g.key + view + status} title={g.title} sub={g.sub} items={g.items} state={state} defaultOpen={i === 0 || view === 'liste' || status !== 'all'} onSign={(id) => {
          dispatch({ type: 'signProforma', id });
          toast(`${id} signée`);
        }} />
      ))}
    </>
  );
}

function Group({ title, sub, items, state, defaultOpen, onSign }: { title: string; sub: string; items: Proforma[]; state: State; defaultOpen: boolean; onSign: (id: string) => void }) {
  const [open, setOpen] = useState(defaultOpen);
  const navigate = useNavigate();
  const totals = items.map((p) => proformaTotals(state, p));
  const cbm = totals.reduce((s, t) => s + t.cbm, 0);
  const amount = totals.reduce((s, t) => s + t.amount, 0);
  const packsOk = totals.reduce((s, t) => s + t.packsOk, 0);
  const packsTotal = totals.reduce((s, t) => s + t.packsTotal, 0);
  const depositTodo = items.reduce((s, p, i) => s + (p.depositPaid ? 0 : totals[i].deposit), 0);

  return (
    <div className="card week">
      <div className={`week-head ${open ? 'open' : ''}`} onClick={() => setOpen(!open)}>
        <div className="cal-icon">
          <Calendar size={24} />
        </div>
        <div style={{ minWidth: 190 }}>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{title}</div>
          <div className="muted">{sub}</div>
        </div>
        <Pill color="green">{items.length} proforma{items.length > 1 ? 's' : ''}</Pill>
        <div className="grow" />
        <div className="metric">
          <div className="l">Packs OK</div>
          <div className="v">
            {packsOk}/{packsTotal}
          </div>
        </div>
        <div className="metric">
          <div className="l">CBM</div>
          <div className="v">{dec(cbm)}</div>
        </div>
        <div className="metric">
          <div className="l">
            <Ctn size={12} /> 40HC
          </div>
          <div className="v">≈ {dec(cbm / 69)}</div>
        </div>
        <div className="metric">
          <div className="l">Montant</div>
          <div className="v">{eur(amount)}</div>
        </div>
        <div className="metric">
          <div className="l">Acompte à faire</div>
          <div className={`v ${depositTodo > 0 ? 'red' : 'green'}`} style={{ fontSize: 16 }}>
            {depositTodo > 0 ? eur(depositTodo) : '—'}
          </div>
        </div>
        {open ? <ChevronUp /> : <ChevronDown />}
      </div>
      {open && (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Référence</th>
                <th>Produits</th>
                <th>Fournisseur</th>
                <th className="center">Pack</th>
                <th className="num">CBM</th>
                <th>Statut</th>
                <th className="center">Chargement</th>
                <th className="center">Arrivée</th>
                <th className="num">Montant</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((p) => {
                const t = proformaTotals(state, p);
                const sup = byId(state.suppliers, p.supplierId);
                const names = p.lines.map((l) => byId(state.products, l.productId).name);
                return (
                  <tr key={p.id} className="clickable" onClick={() => navigate(`/proformas/${p.id}`)}>
                    <td>
                      <div className="row">
                        <SupplierLogo supplier={sup} size={32} />
                        <span className="bold nowrap">{p.id}</span>
                      </div>
                    </td>
                    <td style={{ maxWidth: 220 }}>
                      <div className="bold">{names[0]}</div>
                      {names.length > 1 && <div className="muted small">+ {names.length - 1} autre{names.length > 2 ? 's' : ''} référence{names.length > 2 ? 's' : ''}</div>}
                    </td>
                    <td>{sup.name}</td>
                    <td className="center">
                      <Pill color={t.packsOk === t.packsTotal ? 'green' : t.packsOk === 0 ? 'red' : 'orange'}>
                        {t.packsOk === t.packsTotal ? 'OK' : `${t.packsOk}/${t.packsTotal}`}
                      </Pill>
                    </td>
                    <td className="num">
                      <div className="bold">{dec(t.cbm)}</div>
                      <div className="muted small">{dec(t.eq40)} × 40HC</div>
                    </td>
                    <td>
                      <div className="col" style={{ alignItems: 'flex-start' }}>
                        <ProformaStatusPill status={p.status} />
                        {p.status === 'a_signer' && (
                          <button
                            className="btn primary sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSign(p.id);
                            }}
                          >
                            <PenLine size={12} /> Signer maintenant
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="center bold">{weekLabel(p.etd)}</td>
                    <td className="center bold">{weekLabel(p.eta)}</td>
                    <td className="num">
                      <div className="bold">{eur(t.amount)}</div>
                      <div className="muted xs">
                        Acompte {p.depositPct} % : {eur(t.deposit)}
                      </div>
                      {p.depositPaid ? (
                        <Check size={16} className="green" />
                      ) : (
                        <Pill color="red">À faire</Pill>
                      )}
                    </td>
                    <td>
                      <ChevronRight size={18} className="muted" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
