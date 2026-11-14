import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Calendar, Check, ChevronDown, ChevronUp, Flame, Users } from 'lucide-react';
import { byId, useAuth, useStore, type State } from '../data/store';
import type { Product } from '../data/types';
import { BrandLogo, Pill, ProductThumb, toast } from '../components/ui';
import { TODAY, diffDays, eur2, fshort, initials, num, weekKey, weekLabel, weekRange } from '../lib/format';

type Tab = 'designer' | 'semaine' | 'urgent';

const DESIGNER_COLORS = ['#d6336c', '#7048e8', '#1c7ed6', '#e8590c', '#0ca678', '#ae3ec9'];

const isLate = (p: Product) => p.devDeadline < TODAY;
const isPushed = (p: Product) => !!p.urgent || isLate(p);

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

  const designers = useMemo(() => {
    const names = new Set<string>();
    state.users.filter((u) => u.designerName && u.active).forEach((u) => names.add(u.designerName!));
    state.products.forEach((p) => names.add(p.pack.designer));
    return [...names];
  }, [state.users, state.products]);
  const colorOf = (d: string) => DESIGNER_COLORS[Math.max(0, designers.indexOf(d)) % DESIGNER_COLORS.length];

  const [tab, setTab] = useState<Tab>('designer');
  // Un designer voit d'abord ses propres produits
  const [designer, setDesigner] = useState(auth.user.designerName ?? 'all');
  const [showDone, setShowDone] = useState(false);

  const todo = state.products
    .filter((p) => !p.developed)
    .filter((p) => designer === 'all' || p.pack.designer === designer)
    .sort((a, b) => a.devDeadline.localeCompare(b.devDeadline));
  const done = state.products.filter((p) => p.developed && (designer === 'all' || p.pack.designer === designer));
  const pushed = todo.filter(isPushed).sort((a, b) => Number(isLate(b)) - Number(isLate(a)) || a.devDeadline.localeCompare(b.devDeadline));
  const late = todo.filter(isLate);
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
            <button key={d} className={`pf-chip ${designer === d ? 'active' : ''}`} onClick={() => setDesigner(d)}>
              <span className="dev-avatar" style={{ background: colorOf(d) }}>
                {initials(d)}
              </span>
              {d} <b>{state.products.filter((p) => !p.developed && p.pack.designer === d).length}</b>
            </button>
          ))}
        </div>
      </div>

      {todo.length === 0 && <div className="card empty">Aucun produit à développer{designer !== 'all' ? ` pour ${designer}` : ''}.</div>}

      {tab === 'designer' &&
        (designer === 'all' ? designers : [designer])
          .map((d) => ({ d, items: todo.filter((p) => p.pack.designer === d) }))
          .filter((g) => g.items.length)
          .map(({ d, items }) => (
            <Group
              key={d}
              head={
                <>
                  <span className="dev-avatar lg" style={{ background: colorOf(d) }}>
                    {initials(d)}
                  </span>
                  <div className="pf-week-title">
                    <h2>{d}</h2>
                    <span>{state.users.find((u) => u.designerName === d)?.title ?? 'Designer'}</span>
                  </div>
                  <span className="pf-count">
                    {items.length} à développer
                  </span>
                  <GroupStats items={items} />
                </>
              }
            >
              {weeksOf(items).map(([wk, ps]) => (
                <div key={wk} className="dev-sub">
                  <div className="dev-sub-head">
                    <Calendar size={15} /> Semaine {weekLabel(ps[0].devDeadline).slice(1)} <span>{weekRange(ps[0].devDeadline)}</span>
                    <b>{ps.length}</b>
                  </div>
                  {ps.map((p) => (
                    <Line key={p.id} p={p} showDesigner={false} {...lineProps} />
                  ))}
                </div>
              ))}
            </Group>
          ))}

      {tab === 'semaine' &&
        weeksOf(todo).map(([wk, items], i) => (
          <Group
            key={wk}
            defaultOpen={i < 2}
            head={
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
                <GroupStats items={items} />
              </>
            }
          >
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
              <span>Produits poussés en urgence et développements en retard</span>
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

function Group({ head, children, defaultOpen = true }: { head: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`pf-week ${open ? 'open' : ''}`}>
      <header className="pf-week-head" onClick={() => setOpen(!open)}>
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
}

function Line({ p, state, showDesigner, canAct, colorOf, onOpen, onUrgent, onDone, onRemind }: LineProps) {
  const late = isLate(p);
  const days = diffDays(p.devDeadline, TODAY);
  return (
    <div className={`dev-line ${p.urgent ? 'is-urgent' : ''}`} onClick={() => onOpen(p)}>
      <ProductThumb product={p} size={44} />
      <div className="dev-id">
        <b>{p.ref}</b>
        <small>{p.name}</small>
      </div>
      <span className="dev-brand">
        <BrandLogo brand={byId(state.brands, p.brandId)} size={10} />
      </span>
      <span className="dev-sup">{byId(state.suppliers, p.supplierId).shortName}</span>
      <span className="dev-num">
        <small>PA</small>
        {eur2(p.pa)}
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
      <span className={`dev-due ${late ? 'late' : days <= 7 ? 'soon' : ''}`}>
        <b>{weekLabel(p.devDeadline)}</b>
        <small>{late ? `retard ${-days} j` : fshort(p.devDeadline)}</small>
      </span>
      <span className="dev-flags">{p.urgent && <span className="pill red-solid"><Flame size={12} /> URGENT</span>}</span>
      <span className="dev-actions" onClick={(e) => e.stopPropagation()}>
        {canAct && (
          <>
            <button className={`btn sm ${p.urgent ? 'danger' : ''}`} onClick={() => onUrgent(p)} title={p.urgent ? 'Retirer de PUSH URGENT' : 'Pousser en urgent'}>
              <Flame size={14} /> {p.urgent ? 'Retirer' : 'Push'}
            </button>
            {isPushed(p) && (
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
