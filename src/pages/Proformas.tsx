import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowUpDown, Calendar, Check, CheckCircle2, ChevronDown, ChevronRight, ChevronUp, PenLine, Search } from 'lucide-react';
import { byId, isReliquat, openReliquats, shipmentLabel, pendingRevision, pendingVersion, proformaTotals, useAuth, useStore, PROFORMA_STATUS_LABEL, type State, hasDeposit } from '../data/store';
import { PROFORMA_STATUSES, type Proforma, type ProformaStatus } from '../data/types';
import { ProformaStatusPill, SupplierMark } from '../components/ui';
import { toast } from '../components/ui-shared';
import { TODAY, addDays, dec, diffDays, fdate, weekKey, weekLabel, weekRange, weekStart } from '../lib/format';
import { pressable } from '../lib/a11y';
import { cur0, curSumLabel, sumCur } from '../lib/curr';
import { BookingRequestButton } from '../components/BookingDialog';
import { SignDialog } from '../components/ProformaVersions';
import { NewProformaButton } from '../components/NewProforma';

type View = 'liste' | 'semaine' | 'fournisseur';

/** Libellés de la liste (maquette) : « En développement » en toutes lettres */
const STATUS_TEXT: Record<ProformaStatus, string> = { ...PROFORMA_STATUS_LABEL, en_dev: 'En développement' };

/** Déplacer une proforma vers une autre semaine d'expédition : même jour de la semaine, dans la semaine choisie */
const etdInWeek = (etd: string, weekDate: string) => addDays(weekStart(weekDate), diffDays(etd, weekStart(etd)));

interface MoveCtx {
  /** Proforma choisie au toucher (barre des semaines affichée) */
  moving: string | null;
  /** Proforma en cours de glisser-déposer (pas de barre : la page ne bouge pas sous la souris) */
  dragging: string | null;
  start: (id: string) => void;
  setDragging: (id: string | null) => void;
  drop: (weekDate: string, id?: string) => void;
  canMove: (p: Proforma) => boolean;
}

export default function Proformas() {
  const { state } = useStore();
  const navigate = useNavigate();
  const auth = useAuth();
  const canSign = auth.can('proforma.sign');
  const showMoney = auth.can('finance.view');
  const [params, setParams] = useSearchParams();
  const status = (params.get('statut') as ProformaStatus | null) ?? 'all';
  const onlyReliquats = params.get('reliquats') === '1';
  const showCancelled = params.get('annulees') === '1';
  const cancelled = state.archived ?? [];
  const [view, setView] = useState<View>('semaine');
  const [q, setQ] = useState('');
  const [showPast, setShowPast] = useState(false);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return state.proformas
      .filter((p) => status === 'all' || p.status === status)
      .filter((p) => !onlyReliquats || (isReliquat(p) && p.status !== 'arrive'))
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
  }, [state, status, q, onlyReliquats]);

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

  const { dispatch } = useStore();
  const [moving, setMoving] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const move: MoveCtx = {
    moving,
    dragging,
    start: (id) => setMoving(moving === id ? null : id),
    setDragging,
    drop: (weekDate, id) => {
      const pf = state.proformas.find((p) => p.id === (id ?? moving ?? dragging));
      setMoving(null);
      setDragging(null);
      if (!pf) return;
      const etd = etdInWeek(pf.etd, weekDate);
      if (etd === pf.etd) return;
      dispatch({ type: 'setProformaEtd', id: pf.id, etd });
      toast(`${pf.id} déplacée en ${weekLabel(etd)} (départ ${fdate(etd)})`);
    },
    canMove: (p) => view === 'semaine' && auth.allowed({ type: 'setProformaEtd', id: p.id, etd: addDays(p.etd, 7) }),
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

  const statusValue = showCancelled ? 'annulees' : onlyReliquats ? 'reliquats' : status;
  const pickStatus = (v: string) => {
    for (const k of ['statut', 'reliquats', 'annulees']) params.delete(k);
    if (v === 'reliquats') params.set('reliquats', '1');
    else if (v === 'annulees') params.set('annulees', '1');
    else if (v !== 'all') params.set('statut', v);
    setParams(params);
  };

  return (
    <div className="pf-page pfx-page">
      <div className="pfx-top">
        <h1 className="pf-title">Proformas</h1>
        <NewProformaButton className="pf-btn primary" onCreated={(id) => navigate(`/proformas/${id}`)} />
      </div>

      <div className="pf-toolbar pfx-toolbar">
        <label className="pf-search">
          <Search size={20} />
          <input placeholder="Rechercher une commande, un fournisseur, une référence…" aria-label="Rechercher une proforma" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label className="pfx-select">
          <select aria-label="Statut" value={statusValue} onChange={(e) => pickStatus(e.target.value)}>
            <option value="all">Tous les statuts ({state.proformas.length})</option>
            {PROFORMA_STATUSES.map((st) => (
              <option key={st} value={st}>
                {STATUS_TEXT[st]} ({state.proformas.filter((p) => p.status === st).length})
              </option>
            ))}
            <option value="reliquats">Reliquats ({reliquatsOpen})</option>
            {cancelled.length > 0 && <option value="annulees">Annulées ({cancelled.length})</option>}
          </select>
          <ChevronDown size={20} />
        </label>
        <label className="pfx-select">
          <Calendar size={20} />
          <select aria-label="Affichage" value={view} onChange={(e) => setView(e.target.value as View)} disabled={showCancelled}>
            <option value="semaine">Par semaine</option>
            <option value="fournisseur">Par fournisseur</option>
            <option value="liste">Liste</option>
          </select>
          <ChevronDown size={20} />
        </label>
      </div>

      {showCancelled ? (
        <div className="card tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Proforma</th>
                <th>Fournisseur</th>
                <th>Intitulé</th>
                <th>Annulée le</th>
                <th>Par</th>
                <th>Motif</th>
              </tr>
            </thead>
            <tbody>
              {cancelled.map((p) => (
                <tr key={p.id} className="clickable" onClick={() => navigate(`/proformas/${p.id}`)}>
                  <td className="bold">{p.id}</td>
                  <td>{byId(state.suppliers, p.supplierId).shortName}</td>
                  <td>{p.title}</td>
                  <td>{fdate(p.cancelled!.at.slice(0, 10))}</td>
                  <td>{p.cancelled!.by}</td>
                  <td className="small">{p.cancelled!.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          {moving && view === 'semaine' && (
            <div className="pf-movebar" role="region" aria-label="Déplacer vers la semaine">
              <b>
                <ArrowUpDown size={16} /> {moving} : choisissez la semaine d’expédition
              </b>
              <div className="pf-movebar-weeks">
                {Array.from({ length: 20 }, (_, i) => addDays(weekStart(TODAY), i * 7)).map((w) => (
                  <button
                    key={w}
                    type="button"
                    className={`pf-wk ${weekKey(w) === weekKey(state.proformas.find((p) => p.id === moving)?.etd ?? '') ? 'cur' : ''}`}
                    onClick={() => move.drop(w)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      move.drop(w);
                    }}
                  >
                    <b>{weekLabel(w)}</b>
                    <small>{fdate(w).slice(0, 5)}</small>
                  </button>
                ))}
              </div>
              <button type="button" className="btn sm ghost" onClick={() => setMoving(null)}>
                Annuler
              </button>
            </div>
          )}
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
              weekDate={g.kind === 'semaine' ? g.items[0].etd : undefined}
              move={move}
            />
          ))}
          {pastWeeks > 0 && (
            <button type="button" className="pfx-past" onClick={() => setShowPast(!showPast)}>
              {showPast ? 'Masquer les semaines passées' : `Afficher les semaines passées (${pastWeeks})`}
            </button>
          )}
        </>
      )}
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
  weekDate,
  move,
}: {
  title: string;
  sub: string;
  items: Proforma[];
  state: State;
  defaultOpen: boolean;
  onSign?: (id: string) => void;
  showMoney: boolean;
  weekDate?: string;
  move: MoveCtx;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [over, setOver] = useState(false);
  const target = !!weekDate && !!(move.moving || move.dragging);
  const navigate = useNavigate();
  const totals = items.map((p) => proformaTotals(state, p));
  const cbm = totals.reduce((s, t) => s + t.cbm, 0);
  const amount = sumCur(totals.map((t) => ({ currency: t.currency, v: t.amountCur })));

  return (
    <section
      className={`pf-week ${open ? 'open' : ''} ${target ? 'drop-target' : ''} ${over ? 'drop-over' : ''}`}
      onDragOver={(e) => {
        if (!weekDate) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        if (!weekDate) return;
        const id = e.dataTransfer.getData('text/plain');
        if (!id && !move.moving) return;
        e.preventDefault();
        setOver(false);
        move.drop(weekDate, id || undefined);
      }}
    >
      <header
        className="pf-week-head"
        {...pressable(() => (target ? move.drop(weekDate!) : setOpen(!open)), target ? `Déplacer ${move.moving} en ${title}` : `${title} : ${open ? 'replier' : 'déplier'}`)}
        aria-expanded={open}
      >
        <Calendar className="pf-week-cal" size={34} strokeWidth={1.8} />
        <div className="pf-week-title">
          <h2>{title}</h2>
          <span>{sub}</span>
        </div>
        <div className="pfx-metrics">
          <span className="pfx-count">
            {items.length} proforma{items.length > 1 ? 's' : ''}
          </span>
          <span>{dec(cbm)} m³</span>
          <span>≈ {dec(cbm / 69)} containers</span>
          {showMoney && <b>{curSumLabel(amount)}</b>}
        </div>
        <span className="pf-chevron">{open ? <ChevronUp size={24} /> : <ChevronDown size={24} />}</span>
      </header>

      {open && (
        <div className="pf-body">
          <table className="pfx">
            <thead>
              <tr>
                <th>Commande</th>
                <th className="c">Packs</th>
                <th>Statut</th>
                {showMoney && <th className="r">Montant</th>}
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <Row key={p.id} p={p} state={state} showMoney={showMoney} onSign={onSign} onOpen={() => navigate(`/proformas/${p.id}`)} move={move} />
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
              <Card key={p.id} p={p} state={state} showMoney={showMoney} onSign={onSign} onOpen={() => navigate(`/proformas/${p.id}`)} move={move} />
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
  move?: MoveCtx;
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
        ) : (
          onSign && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSign(p.id);
              }}
            >
              <PenLine size={11} /> Signer maintenant
            </button>
          )
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
      {p.booking && !p.booking.answeredAt && (
        <small className="pf-bk-wait">Booking demandé · {p.booking.proposal ? 'proposition à valider' : p.booking.ackAt ? `attente ${p.booking.forwarder}` : 'attente fournisseur'}</small>
      )}
    </div>
  );
}

function AmountCell({ p, deposit, amountCur, currency }: { p: Proforma; deposit: number; amountCur: number; currency: string }) {
  return (
    <div className="pf-amount">
      <b>{cur0(amountCur, currency)}</b>
      {hasDeposit(p) ? (
        <>
          <small>Acompte : {cur0(deposit, currency)}</small>
          {p.depositPaid ? (
            <span className="ok">
              <Check size={15} strokeWidth={3} />
            </span>
          ) : (
            <span className="todo">À faire</span>
          )}
        </>
      ) : (
        <small>Sans acompte</small>
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

/** Statut en pastille : point de couleur + libellé (maquette) */
function StatusDot({ status }: { status: ProformaStatus }) {
  return (
    <span className={`pfx-st ${status}`}>
      <i /> {STATUS_TEXT[status]}
    </span>
  );
}

function Row({ p, state, showMoney, onSign, onOpen, move }: RowProps) {
  const { t, sup, title, packsDone } = useRowData(p, state);
  const movable = !!move?.canMove(p);
  const revision = pendingRevision(p);
  // Une seule action par ligne : signer (proforma déposée par le fournisseur, ou modification), sinon demander le booking
  const signable = !!onSign && (revision || (p.status === 'a_signer' && pendingVersion(p)));
  const depositDue = hasDeposit(p) && !p.depositPaid;
  return (
    <tr
      {...pressable(onOpen, `Ouvrir ${p.id}`)}
      className={move?.moving === p.id ? 'pf-moving' : undefined}
      draggable={movable}
      title={movable ? 'Glissez la ligne sur une autre semaine pour changer la date d’expédition' : undefined}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', p.id);
        e.dataTransfer.effectAllowed = 'move';
        move?.setDragging(p.id);
      }}
      onDragEnd={() => move?.setDragging(null)}
    >
      <td>
        <div className="pfx-cmd">
          <span className="pfx-logo">
            <SupplierMark supplier={sup} size={100} wide />
          </span>
          <div>
            <div className="pfx-line1">
              <b>{title}</b>
              <strong className="pfx-sup">{sup.name}</strong>
            </div>
            <small>{p.id}</small>
          </div>
        </div>
      </td>
      <td className="c">
        {packsDone ? (
          <span className="pfx-ok">
            <Check size={22} strokeWidth={3} /> OK
          </span>
        ) : (
          <span className="pfx-packs">
            {t.packsOk}/{t.packsTotal}
          </span>
        )}
      </td>
      <td>
        <StatusDot status={p.status} />
        {revision && <small className="pfx-note">Modification v{revision.version} à signer</small>}
        {p.status === 'a_signer' && !pendingVersion(p) && <small className="pfx-note">Attente de la proforma du fournisseur</small>}
      </td>
      {showMoney && (
        <td className="r">
          <div className="pfx-amount">
            <b>{cur0(t.amountCur, t.currency)}</b>
            {depositDue && <small>Acompte à faire</small>}
          </div>
        </td>
      )}
      <td className="pfx-act">
        {signable ? (
          <button
            type="button"
            className="pfx-sign"
            title={revision ? `Signer la modification v${revision.version}` : 'Signer la proforma déposée par le fournisseur'}
            onClick={(e) => {
              e.stopPropagation();
              onSign!(p.id);
            }}
          >
            Signer
          </button>
        ) : (
          <span className="pfx-act-row">
            <BookingRequestButton pf={p} variant="row" />
            <ChevronRight size={24} />
          </span>
        )}
      </td>
    </tr>
  );
}

/** Téléphone : ligne fine (identité, état pack, chargement) ; le détail s'ouvre au toucher. */
function Card({ p, state, showMoney, onSign, onOpen, move }: RowProps) {
  const { t, sup, title, packsDone } = useRowData(p, state);
  const [open, setOpen] = useState(false);
  const movable = !!move?.canMove(p);
  return (
    <article className={`pf-line ${open ? 'open' : ''} ${move?.moving === p.id ? 'pf-moving' : ''}`}>
      {movable && (
        <button type="button" className="pf-grip pf-grip-card" aria-label={`Déplacer ${p.id} (carte)`} onClick={() => move!.start(p.id)}>
          <ArrowUpDown size={15} />
        </button>
      )}
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
            {showMoney && <AmountCell p={p} deposit={t.depositCur} amountCur={t.amountCur} currency={t.currency} />}
          </div>
          <button className="pf-btn pf-line-open" onClick={onOpen}>
            Ouvrir la proforma <ChevronRight size={18} />
          </button>
        </div>
      )}
    </article>
  );
}
