import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Calendar, Check, ChevronDown, ChevronUp, Flame, Search, Users } from 'lucide-react';
import { brandOf, byId, capacityOf, packTrack, matchTrack, TRACK_CHIPS, TRACK_ORDER, useAuth, useStore, type TrackFilter, type State } from '../data/store';
import PackTrackDots from '../components/PackTrack';
import type { Product } from '../data/types';
import { BrandLogo, Pill, ProductThumb, PA } from '../components/ui';
import { designerColor, toast } from '../components/ui-shared';
import { pressable } from '../lib/a11y';
import { TODAY, diffDays, fshort, fstamp, initials, num, weekKey, weekLabel, weekRange } from '../lib/format';

type Tab = 'designer' | 'semaine' | 'urgent';
const isLate = (p: Product) => p.devDeadline < TODAY;
const isPushed = (p: Product) => !!p.urgent;

/** La page repart de zéro à chaque changement d'utilisateur (filtre designer par défaut). */
export default function Development() {
  const { user } = useAuth();
  return <DevelopmentPage key={user.id} />;
}

function DevelopmentPage() {
  const { state, dispatch } = useStore();
  const auth = useAuth();
  const navigate = useNavigate();
  const canAct = auth.can('dev.advance');
  const canAssign = auth.can('pack.assign');
  const [sortBy, setSortBy] = useState<'echeance' | 'marque' | 'collection' | 'type' | 'pack'>('echeance');
  const [track, setTrack] = useState<TrackFilter>('all');
  const [dropKey, setDropKey] = useState<string | null>(null);
  const brandName = (p: Product) => brandOf(state.brands, p.brandId).name;
  const sortFn = (a: Product, b: Product) =>
    (sortBy === 'marque'
      ? brandName(a).localeCompare(brandName(b))
      : sortBy === 'collection'
        ? a.collection.localeCompare(b.collection)
        : sortBy === 'type'
          ? a.pack.type.localeCompare(b.pack.type)
          : sortBy === 'pack'
            ? TRACK_ORDER[packTrack(a).status] - TRACK_ORDER[packTrack(b).status] || Number(packTrack(b).dieCutMissing) - Number(packTrack(a).dieCutMissing)
            : 0) || a.devDeadline.localeCompare(b.devDeadline);
  /** Zone de dépôt (administrateur) : change designer et/ou semaine */
  const dropZone = (key: string, toDesigner?: string, toWeekOf?: string) =>
    canAssign
      ? {
          className: dropKey === key ? 'dev-drop' : undefined,
          onDragOver: (e: React.DragEvent) => {
            e.preventDefault();
            if (dropKey !== key) setDropKey(key);
          },
          onDragLeave: () => setDropKey(null),
          onDrop: (e: React.DragEvent) => {
            e.preventDefault();
            setDropKey(null);
            const id = e.dataTransfer.getData('text/plain');
            const prod = state.products.find((x) => x.id === id);
            if (!prod) return;
            dispatch({ type: 'reassignPack', productId: id, designer: toDesigner, weekOf: toWeekOf });
            toast(`${prod.ref} → ${[toDesigner, toWeekOf ? `semaine ${weekLabel(toWeekOf)}` : ''].filter(Boolean).join(' · ')}`);
          },
        }
      : {};

  const designers = useMemo(() => {
    const names = new Set<string>();
    state.users.filter((u) => u.designerName && u.active).forEach((u) => names.add(u.designerName!));
    state.products.forEach((p) => names.add(p.pack.designer));
    return [...names];
  }, [state.users, state.products]);
  const colorOf = designerColor;

  const [tab, setTab] = useState<Tab>('designer');
  // Un designer voit d'abord ses propres produits
  const [designer, setDesigner] = useState(auth.user.designerName ?? 'all');
  const [showDone, setShowDone] = useState(false);
  const [q, setQ] = useState('');
  const qs = q.trim().toLowerCase();

  const todo = state.products
    .filter((p) => !p.developed)
    .filter((p) => designer === 'all' || p.pack.designer === designer)
    .filter((p) => !qs || `${p.ref} ${p.name} ${byId(state.suppliers, p.supplierId).name}`.toLowerCase().includes(qs))
    .filter((p) => matchTrack(p, track))
    .sort(sortFn);
  // Compteurs du suivi pack (avant le filtre de suivi)
  const base = state.products.filter((p) => !p.developed && (designer === 'all' || p.pack.designer === designer));
  const trackCount = (f: TrackFilter) => base.filter((p) => matchTrack(p, f)).length;
  const done = state.products.filter((p) => p.developed && (designer === 'all' || p.pack.designer === designer));
  const pushed = todo.filter(isPushed).sort((a, b) => Number(isLate(b)) - Number(isLate(a)) || a.devDeadline.localeCompare(b.devDeadline));
  const late = todo.filter(isLate);
  const lateNotPushed = late.filter((p) => !p.urgent);
  const thisWeek = todo.filter((p) => weekKey(p.devDeadline) === weekKey(TODAY));

  const lineProps = {
    state,
    canAct,
    colorOf,
    onOpen: (p: Product) => navigate(`/produits/${p.id}`),
    onUrgent: (p: Product) => {
      dispatch({ type: 'toggleUrgent', productId: p.id });
      toast(p.urgent ? `${p.ref} retiré de PUSH URGENT` : `${p.ref} poussé en urgent`);
    },
    onDone: (p: Product) => {
      dispatch({ type: 'markDeveloped', productId: p.id });
      toast(`${p.ref} développé`);
    },
    onRemind: (p: Product) => toast(`Relance envoyée à ${p.pack.designer} pour ${p.ref}`),
    draggable: canAssign,
  };

  return (
    <div className="pf-page">
      <h1 className="pf-title">Développement</h1>

      <div className="dev-kpis">
        <button className={`dev-kpi ${tab !== 'urgent' ? 'on' : ''}`} onClick={() => setTab('designer')}>
          <small>À développer</small>
          <b>{todo.length}</b>
        </button>
        <button className="dev-kpi" onClick={() => setTab('semaine')}>
          <small>Cette semaine ({weekLabel(TODAY)})</small>
          <b>{thisWeek.length}</b>
        </button>
        <button className="dev-kpi late" onClick={() => setTab('urgent')}>
          <small>En retard</small>
          <b>{late.length}</b>
        </button>
        <button className={`dev-kpi push ${tab === 'urgent' ? 'on' : ''}`} onClick={() => setTab('urgent')}>
          <small>Push urgent</small>
          <b>{pushed.length}</b>
        </button>
      </div>

      <div className="dev-bar">
        <div className="pf-views">
          <button className={tab === 'designer' ? 'active' : ''} onClick={() => setTab('designer')}>
            <Users size={19} /> Par designer
          </button>
          <button className={tab === 'semaine' ? 'active' : ''} onClick={() => setTab('semaine')}>
            <Calendar size={19} /> Par semaine
          </button>
          <button className={`push-tab ${tab === 'urgent' ? 'active' : ''}`} onClick={() => setTab('urgent')}>
            <Flame size={19} /> PUSH URGENT <span className="push-count">{pushed.length}</span>
          </button>
        </div>
        <div className="dev-designers">
          <button className={`pf-chip ${designer === 'all' ? 'active' : ''}`} onClick={() => setDesigner('all')}>
            Tous
          </button>
          {designers.map((d) => (
            <button
              key={d}
              {...dropZone(`chip-${d}`, d)}
              className={`pf-chip ${designer === d ? 'active' : ''} ${dropKey === `chip-${d}` ? 'dev-drop' : ''}`}
              onClick={() => setDesigner(d)}
            >
              <span className="dev-avatar" style={{ background: colorOf(d) }}>
                {initials(d)}
              </span>
              {d} <b>{state.products.filter((p) => !p.developed && p.pack.designer === d).length}</b>
            </button>
          ))}
        </div>
      </div>

      <div className="dev-tools">
        <label className="pf-search dev-search">
          <Search size={18} />
          <input placeholder="Rechercher une référence, un produit, un fournisseur…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label className="pk-group" htmlFor="dev-sort">
          <span className="xs muted">Trier</span>
          <select id="dev-sort" className="input" value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}>
            <option value="echeance">Échéance</option>
            <option value="marque">Marque</option>
            <option value="collection">Collection</option>
            <option value="type">Type de pack</option>
            <option value="pack">Statut du pack</option>
          </select>
        </label>
        {canAssign && <span className="pk-hint">Administrateur : glissez un produit sur un designer ou une semaine pour le réaffecter.</span>}
      </div>

      {/* Suivi du pack : filtre par statut */}
      <div className="dev-trackbar" role="group" aria-label="Suivi pack">
        {TRACK_CHIPS.map(([k, label, cls]) => (
          <button key={k} type="button" className={`pf-chip ${track === k ? 'active' : ''}`} aria-pressed={track === k} onClick={() => setTrack(k)}>
            {cls && <span className={`dev-dot ${cls}`} />} {label} <b>{trackCount(k)}</b>
          </button>
        ))}
      </div>

      {todo.length === 0 && <div className="card empty">Aucun produit à développer{designer !== 'all' ? ` pour ${designer}` : ''}.</div>}

      {tab === 'designer' &&
        (designer === 'all' ? designers : [designer])
          .map((d) => ({ d, items: todo.filter((p) => p.pack.designer === d) }))
          .filter((g) => g.items.length)
          .map(({ d, items }) => (
            <DesignerBlock
              key={d}
              name={d}
              title={state.users.find((u) => u.designerName === d)?.title ?? 'Designer'}
              color={colorOf(d)}
              items={items}
              drop={dropZone(`grp-${d}`, d)}
            >
              {weeksOf(items).map(([wk, ps]) => (
                <Group
                  key={wk}
                  defaultOpen={wk <= weekKey(TODAY)}
                  drop={dropZone(`${d}|${wk}`, d, ps[0].devDeadline)}
                  head={<WeekHead wk={wk} items={ps} capacity={capacityOf(state, d)} />}
                >
                  {ps.map((p) => (
                    <Line key={p.id} p={p} showDesigner={false} {...lineProps} />
                  ))}
                </Group>
              ))}
            </DesignerBlock>
          ))}

      {tab === 'semaine' &&
        weeksOf(todo).map(([wk, items]) => (
          <Group
            key={wk}
            drop={dropZone(`wk-${wk}`, undefined, items[0].devDeadline)}
            defaultOpen={wk <= weekKey(TODAY)}
            head={<WeekHead wk={wk} items={items} capacity={designers.reduce((t, d) => t + (items.some((p) => p.pack.designer === d) ? capacityOf(state, d) : 0), 0)} />}
          >
            <div className="dev-week-designers">
              {designers
                .map((d) => [d, items.filter((p) => p.pack.designer === d).length] as const)
                .filter(([, n]) => n)
                .map(([d, n]) => (
                  <span key={d} className="dev-chip">
                    <span className="dev-avatar" style={{ background: colorOf(d) }}>
                      {initials(d)}
                    </span>
                    {d} <b>{n}</b>
                  </span>
                ))}
            </div>
            {items.map((p) => (
              <Line key={p.id} p={p} showDesigner {...lineProps} />
            ))}
          </Group>
        ))}

      {tab === 'urgent' && (
        <section className="pf-week open dev-urgent">
          <header className="pf-week-head">
            <Flame size={34} className="red" />
            <div className="pf-week-title">
              <h2>PUSH URGENT</h2>
              <span>Produits poussés en urgence par l’acheteur, à traiter en priorité</span>
            </div>
            <span className="pf-count red-count">{pushed.length} à pousser</span>
          </header>
          <div className="pf-body">
            {pushed.length === 0 && <div className="empty">Rien d’urgent 👍</div>}
            {pushed.map((p) => (
              <Line key={p.id} p={p} showDesigner {...lineProps} />
            ))}
          </div>
        </section>
      )}
      {tab === 'urgent' && lateNotPushed.length > 0 && (
        <Group
          defaultOpen={false}
          head={
            <>
              <AlertTriangle size={30} className="red" />
              <div className="pf-week-title">
                <h2>En retard (non poussés)</h2>
                <span>À pousser en urgent si besoin</span>
              </div>
              <span className="pf-count red-count">{lateNotPushed.length}</span>
            </>
          }
        >
          {lateNotPushed.map((p) => (
            <Line key={p.id} p={p} showDesigner {...lineProps} />
          ))}
        </Group>
      )}

      <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setShowDone(!showDone)}>
        {showDone ? 'Masquer' : 'Voir'} les produits développés ({done.length})
      </button>
      {showDone && (
        <div className="card">
          {done.map((p) => (
            <div key={p.id} className="dev-line done" onClick={() => navigate(`/produits/${p.id}`)}>
              <ProductThumb product={p} size={34} />
              <div className="dev-id">
                <b>{p.ref}</b>
                <small>{p.name}</small>
              </div>
              <span className="dev-sup">{byId(state.suppliers, p.supplierId).shortName}</span>
              <Pill color="green" icon={<Check size={12} />}>
                Développé
              </Pill>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function weeksOf(items: Product[]): [string, Product[]][] {
  const map = new Map<string, Product[]>();
  for (const p of items) map.set(weekKey(p.devDeadline), [...(map.get(weekKey(p.devDeadline)) ?? []), p]);
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function GroupStats({ items }: { items: Product[] }) {
  const late = items.filter(isLate).length;
  const urgent = items.filter((p) => p.urgent).length;
  return (
    <div className="dev-stats">
      {late > 0 && (
        <span className="pill red">
          <AlertTriangle size={13} /> {late} en retard
        </span>
      )}
      {urgent > 0 && (
        <span className="pill red-solid">
          <Flame size={13} /> {urgent} urgent{urgent > 1 ? 's' : ''}
        </span>
      )}
    </div>
  );
}

type Drop = { className?: string; onDragOver?: (e: React.DragEvent) => void; onDragLeave?: () => void; onDrop?: (e: React.DragEvent) => void };

function Group({ head, children, defaultOpen = true, drop = {} }: { head: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean; drop?: Drop }) {
  const [open, setOpen] = useState(defaultOpen);
  const { className: dropClass, ...dropHandlers } = drop;
  return (
    <section className={`pf-week ${open ? 'open' : ''}`}>
      <header className={`pf-week-head ${dropClass ?? ''}`} {...pressable(() => setOpen(!open))} aria-expanded={open} {...dropHandlers}>
        {head}
        <span className="pf-chevron">{open ? <ChevronUp size={24} /> : <ChevronDown size={24} />}</span>
      </header>
      {open && <div className="pf-body">{children}</div>}
    </section>
  );
}

interface LineProps {
  p: Product;
  state: State;
  showDesigner: boolean;
  canAct: boolean;
  colorOf: (d: string) => string;
  onOpen: (p: Product) => void;
  onUrgent: (p: Product) => void;
  onDone: (p: Product) => void;
  onRemind: (p: Product) => void;
  draggable: boolean;
}

function Line({ p, state, showDesigner, canAct, colorOf, onOpen, onUrgent, onDone, onRemind, draggable }: LineProps) {
  const late = isLate(p);
  const days = diffDays(p.devDeadline, TODAY);
  return (
    <div
      className={`dev-line ${p.urgent ? 'is-urgent' : ''} ${draggable ? 'draggable' : ''}`}
      {...pressable(() => onOpen(p), `Ouvrir ${p.ref}`)}
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', p.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
    >
      <ProductThumb product={p} size={44} />
      <div className="dev-id">
        <b>{p.ref}</b>
        <small>
          {p.name} · {p.collection} · {p.pack.type}
        </small>
      </div>
      <span className="dev-brand">
        <BrandLogo brand={brandOf(state.brands, p.brandId)} size={10} />
      </span>
      <span className="dev-sup">{byId(state.suppliers, p.supplierId).shortName}</span>
      <span className="dev-num">
        <small>PA</small>
        <PA product={p} />
      </span>
      <span className="dev-num">
        <small>Cible</small>
        {num(p.targetQty)}
      </span>
      {showDesigner && (
        <span className="dev-chip">
          <span className="dev-avatar" style={{ background: colorOf(p.pack.designer) }}>
            {initials(p.pack.designer)}
          </span>
          {p.pack.designer}
        </span>
      )}
      <PackTrackDots p={p} />
      <span className={`dev-due ${late ? 'late' : days <= 7 ? 'soon' : ''}`}>
        <b>{weekLabel(p.devDeadline)}</b>
        <small>{late ? `retard ${-days} j` : fshort(p.devDeadline)}</small>
      </span>
      <span className="dev-flags">
        {p.urgent ? (
          <span className="pill red-solid">
            <Flame size={12} /> URGENT
          </span>
        ) : p.pack.startedAt ? (
          <span className="pill violet" title={`Commencé le ${fstamp(p.pack.startedAt)}`}>
            Commencé
          </span>
        ) : null}
      </span>
      <span className="dev-actions" onClick={(e) => e.stopPropagation()}>
        {canAct && (
          <>
            <button className={`btn sm ${p.urgent ? 'danger' : ''}`} onClick={() => onUrgent(p)} title={p.urgent ? 'Retirer de PUSH URGENT' : 'Pousser en urgent'}>
              <Flame size={14} /> {p.urgent ? 'Retirer' : 'Push'}
            </button>
            {(isPushed(p) || isLate(p)) && (
              <button className="btn sm dev-remind" onClick={() => onRemind(p)}>
                Relancer
              </button>
            )}
            <button className="btn sm primary" onClick={() => onDone(p)} title="Marquer comme développé">
              <Check size={14} />
            </button>
          </>
        )}
      </span>
    </div>
  );
}


/** En-tête de semaine identique à la page Proformas */
function WeekHead({ wk, items, capacity }: { wk: string; items: Product[]; capacity: number }) {
  const late = items.filter(isLate).length;
  const urgent = items.filter((p) => p.urgent).length;
  return (
    <>
      <Calendar className="pf-week-cal" size={38} strokeWidth={1.8} />
      <div className="pf-week-title">
        <h2>
          Semaine {weekLabel(items[0].devDeadline).slice(1)}
          {wk === weekKey(TODAY) && <span className="dev-now">en cours</span>}
        </h2>
        <span>{weekRange(items[0].devDeadline)}</span>
      </div>
      <span className="pf-count">
        {items.length} produit{items.length > 1 ? 's' : ''}
      </span>
      <div className="pf-metrics">
        <div className="pf-metric">
          <small>En retard</small>
          <b className={late ? 'red' : ''}>{late}</b>
        </div>
        <div className="pf-metric">
          <small>Urgents</small>
          <b className={urgent ? 'red' : ''}>{urgent}</b>
        </div>
        <div className="pf-metric">
          <small>Capacité</small>
          <b className={items.length > capacity ? 'red' : ''}>
            {items.length}/{capacity}
          </b>
        </div>
      </div>
    </>
  );
}

/** Bloc d'un designer : en-tête (repliable) puis ses cartes semaine */
function DesignerBlock({
  name,
  title,
  color,
  items,
  drop = {},
  children,
}: {
  name: string;
  title: string;
  color: string;
  items: Product[];
  drop?: Drop;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const { className: dropClass, ...dropHandlers } = drop;
  return (
    <section className="dev-dblock">
      <header className={`dev-dhead ${dropClass ?? ''}`} {...pressable(() => setOpen(!open), `${name} : ${open ? 'replier' : 'déplier'}`)} aria-expanded={open} {...dropHandlers}>
        <span className="dev-avatar lg" style={{ background: color }}>
          {initials(name)}
        </span>
        <div className="dev-dname">
          <h2>{name}</h2>
          <span>{title}</span>
        </div>
        <span className="pf-count">{items.length} à développer</span>
        <GroupStats items={items} />
        <span className="pf-chevron">{open ? <ChevronUp size={24} /> : <ChevronDown size={24} />}</span>
      </header>
      {open && <div className="dev-dweeks">{children}</div>}
    </section>
  );
}
