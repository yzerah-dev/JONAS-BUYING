import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Box, Check, Download, FileText, Flame, History, Layers, Paperclip, Play, Scissors, Search, Send, X } from 'lucide-react';
import PackFiles from '../components/PackFiles';
import { pressable } from '../lib/a11y';
import { brandOf, byId, capacityOf, matchTrack, packDone, packLate, packTrack, TRACK_CHIPS, TRACK_ORDER, useAuth, useStore, type State, type TrackFilter } from '../data/store';
import PackTrackDots, { TrackRound } from '../components/PackTrack';
import type { Product } from '../data/types';
import { VALIDATION_LABELS, VALIDATION_STEPS } from '../data/types';
import { BrandLogo, ProductPic, Pill, ProductThumb, Tabs, ValidationCircuit } from '../components/ui';
import { designerColor, toast } from '../components/ui-shared';
import { TODAY, addDays, fdate, fshort, fstamp, initials, weekKey, weekLabel, weekRange } from '../lib/format';


function packStatus(p: Product): [string, string] {
  const v = p.pack.validations;
  if (packDone(p)) return ['Validé', 'green'];
  if (v.direction.state === 'todo') return p.pack.startedAt ? ['En création', 'violet'] : p.pack.plannedStart ? ['Début prévu', 'yellow'] : ['À traiter', 'grey'];
  if (v.direction.state === 'pending') return ['À valider', 'orange'];
  if (v.fournisseur.state === 'pending') return p.pack.sentToSupplier ? ['Chez fournisseur', 'blue'] : ['À envoyer', 'blue'];
  return ['En validation', 'orange'];
}

function proformaOf(s: State, p: Product) {
  return s.proformas.filter((pf) => pf.status !== 'arrive' && pf.lines.some((l) => l.productId === p.id)).sort((a, b) => a.etd.localeCompare(b.etd))[0];
}


type StatusKey = 'all' | 'retard' | 'a_traiter' | 'en_creation' | 'a_valider' | 'en_validation' | 'a_envoyer' | 'fournisseur' | 'valide';
const STATUS_CHIPS: { id: StatusKey; label: string }[] = [
  { id: 'all', label: 'Tous' },
  { id: 'retard', label: 'En retard' },
  { id: 'a_traiter', label: 'Pas commencés' },
  { id: 'en_creation', label: 'En création' },
  { id: 'a_valider', label: 'À valider' },
  { id: 'en_validation', label: 'En validation' },
  { id: 'a_envoyer', label: 'À envoyer' },
  { id: 'fournisseur', label: 'Chez fournisseur' },
  { id: 'valide', label: 'Validés' },
];
const LABEL_TO_KEY: Record<string, StatusKey> = {
  Validé: 'valide',
  'À traiter': 'a_traiter',
  'Début prévu': 'a_traiter',
  'En création': 'en_creation',
  'À valider': 'a_valider',
  'En validation': 'en_validation',
  'À envoyer': 'a_envoyer',
  'Chez fournisseur': 'fournisseur',
};
const statusKey = (p: Product) => LABEL_TO_KEY[packStatus(p)[0]];
const matches = (p: Product, k: StatusKey) => k === 'all' || (k === 'retard' ? packLate(p) : statusKey(p) === k);
// Ordre de traitement : retards d'abord, puis par avancement, puis par date
const ORDER: StatusKey[] = ['a_traiter', 'en_creation', 'a_valider', 'en_validation', 'a_envoyer', 'fournisseur', 'valide'];
const sortPacks = (a: Product, b: Product) =>
  Number(packLate(b)) - Number(packLate(a)) || ORDER.indexOf(statusKey(a)) - ORDER.indexOf(statusKey(b)) || a.pack.artworkDeadline.localeCompare(b.pack.artworkDeadline);

type GroupBy = 'none' | 'marque' | 'collection' | 'type' | 'fournisseur' | 'statut' | 'jour';
type SortBy = 'priorite' | 'pack' | 'marque' | 'collection' | 'type' | 'echeance';
const SORT_LABELS: Record<SortBy, string> = { priorite: 'Priorité', pack: 'Statut du pack', marque: 'Marque', collection: 'Collection', type: 'Type de pack', echeance: 'Échéance' };
const GROUP_LABELS: Record<GroupBy, string> = {
  none: 'Aucun',
  marque: 'Par marque',
  collection: 'Par collection',
  type: 'Par type de pack',
  fournisseur: 'Par fournisseur',
  statut: 'Par statut',
  jour: 'Par jour',
};
/** Données glissées : liste d'identifiants de produits */
const DRAG_MIME = 'text/plain';

/** Repart de zéro à chaque changement d'utilisateur (filtre designer par défaut). */
export default function Design() {
  const { user } = useAuth();
  return <DesignPage key={user.id} />;
}

function DesignPage() {
  const { state, dispatch } = useStore();
  const auth = useAuth();
  const designers = useMemo(() => [...new Set(state.products.map((p) => p.pack.designer))].sort(), [state.products]);
  const colorOf = designerColor;

  // Colonnes du planning : de la semaine précédente à la dernière échéance (défilement horizontal)
  const weeks = useMemo(() => {
    const from = weekKey(addDays(TODAY, -7));
    const keys = [...new Set(state.products.map((p) => weekKey(p.pack.artworkDeadline)))].filter((k) => k >= from).sort();
    return keys.map((k) => ({ key: k, sample: state.products.find((p) => weekKey(p.pack.artworkDeadline) === k)!.pack.artworkDeadline }));
  }, [state.products]);

  const [designer, setDesigner] = useState(auth.user.designerName ?? 'all');
  const [week, setWeek] = useState(weekKey(TODAY));
  const [status, setStatus] = useState<StatusKey>('all');
  const [track, setTrack] = useState<TrackFilter>('all');
  const [q, setQ] = useState('');
  const [groupBy, setGroupBy] = useState<GroupBy>('none');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selId, setSelId] = useState<string | null>(null);
  const [limit, setLimit] = useState(50);
  const [sortBy, setSortBy] = useState<SortBy>('priorite');
  const [dropKey, setDropKey] = useState<string | null>(null);
  const [moveTo, setMoveTo] = useState<{ designer: string; week: string }>({ designer: '', week: '' });
  const canAssign = auth.can('pack.assign');
  const canPush = auth.can('dev.advance');
  const brandName = (p: Product) => brandOf(state.brands, p.brandId).name;
  const sorters: Record<SortBy, (a: Product, b: Product) => number> = {
    priorite: sortPacks,
    pack: (a, b) => TRACK_ORDER[packTrack(a).status] - TRACK_ORDER[packTrack(b).status] || Number(packTrack(b).dieCutMissing) - Number(packTrack(a).dieCutMissing) || sortPacks(a, b),
    marque: (a, b) => brandName(a).localeCompare(brandName(b)) || sortPacks(a, b),
    collection: (a, b) => a.collection.localeCompare(b.collection) || sortPacks(a, b),
    type: (a, b) => a.pack.type.localeCompare(b.pack.type) || sortPacks(a, b),
    echeance: (a, b) => a.pack.artworkDeadline.localeCompare(b.pack.artworkDeadline) || sortPacks(a, b),
  };

  const cell = (d: string | 'all', wk: string) =>
    state.products.filter((p) => (d === 'all' || p.pack.designer === d) && weekKey(p.pack.artworkDeadline) === wk);

  const scope = cell(designer, week);
  const s = q.trim().toLowerCase();
  const list = scope
    .filter((p) => matches(p, status))
    .filter((p) => matchTrack(p, track))
    .filter((p) => !s || `${p.ref} ${p.name} ${byId(state.suppliers, p.supplierId).name} ${brandOf(state.brands, p.brandId).name} ${p.collection} ${p.pack.type}`.toLowerCase().includes(s))
    .sort(sorters[sortBy]);
  const sel = list.find((p) => p.id === selId) ?? scope.find((p) => p.id === selId);
  const done = scope.filter(packDone).length;
  const late = scope.filter(packLate).length;
  const weekSample = weeks.find((w) => w.key === week)?.sample ?? TODAY;

  const shown = list.slice(0, limit);
  const groups: [string, Product[]][] = useMemo(() => {
    if (groupBy === 'none') return [['', shown]];
    const map = new Map<string, Product[]>();
    for (const p of shown) {
      const k =
        groupBy === 'fournisseur'
          ? byId(state.suppliers, p.supplierId).name
          : groupBy === 'marque'
            ? brandName(p)
            : groupBy === 'collection'
              ? p.collection
              : groupBy === 'type'
                ? p.pack.type
                : groupBy === 'statut'
                  ? packLate(p)
                    ? 'En retard'
                    : packStatus(p)[0]
                  : fdate(p.pack.artworkDeadline);
      map.set(k, [...(map.get(k) ?? []), p]);
    }
    const entries = [...map.entries()];
    return groupBy === 'jour' || groupBy === 'statut' ? entries : entries.sort(([a], [b]) => a.localeCompare(b));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, limit, groupBy, state.suppliers, state.brands]);

  // Réaffectation (administrateur) : glisser-déposer ou « Déplacer vers »
  const move = (ids: string[], toDesigner?: string, toWeekOf?: string) => {
    const moved = ids.filter((id) => auth.allowed({ type: 'reassignPack', productId: id, designer: toDesigner, weekOf: toWeekOf }));
    moved.forEach((id) => dispatch({ type: 'reassignPack', productId: id, designer: toDesigner, weekOf: toWeekOf }));
    const where = [toDesigner, toWeekOf ? `semaine ${weekLabel(toWeekOf)}` : ''].filter(Boolean).join(' · ');
    toast(`${moved.length} pack${moved.length > 1 ? 's' : ''} déplacé${moved.length > 1 ? 's' : ''} → ${where}`);
    setSelected(new Set());
  };
  const dropZone = (key: string, toDesigner?: string, toWeekOf?: string) =>
    canAssign
      ? {
          onDragOver: (e: React.DragEvent) => {
            e.preventDefault();
            if (dropKey !== key) setDropKey(key);
          },
          onDragLeave: () => setDropKey(null),
          onDrop: (e: React.DragEvent) => {
            e.preventDefault();
            setDropKey(null);
            try {
              const ids = JSON.parse(e.dataTransfer.getData(DRAG_MIME)) as string[];
              if (Array.isArray(ids) && ids.length) move(ids, toDesigner, toWeekOf);
            } catch {
              /* contenu glissé étranger */
            }
          },
        }
      : {};
  const dragIds = (id: string) => (selected.has(id) ? [...selected] : [id]);

  const pick = (d: string | 'all', wk: string) => {
    setDesigner(d);
    setWeek(wk);
    setSelected(new Set());
    setSelId(null);
    setStatus('all');
    setLimit(50);
  };
  const toggle = (id: string) => {
    const n = new Set(selected);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setSelected(n);
  };
  const allChecked = list.length > 0 && list.every((p) => selected.has(p.id));

  // Actions groupées : chaque action passe par le contrôle des droits du store
  const chosen = list.filter((p) => selected.has(p.id));
  const canValidate = chosen.filter((p) => !packDone(p) && auth.allowed({ type: 'validatePack', productId: p.id }));
  const canDieCut = chosen.filter((p) => p.pack.dieCut === 'none' && auth.allowed({ type: 'requestDieCut', productId: p.id }));
  const canStart = chosen.filter((p) => !p.pack.startedAt && p.pack.validations.direction.state === 'todo' && auth.allowed({ type: 'startPack', productId: p.id }));
  const canForward = chosen.filter((p) => p.pack.validations.moinard.state === 'done' && !p.pack.sentToSupplier && auth.allowed({ type: 'forwardPack', productId: p.id }));
  const bulk = (items: Product[], type: 'validatePack' | 'requestDieCut' | 'forwardPack', msg: string) => {
    items.forEach((p) => dispatch({ type, productId: p.id }));
    toast(`${items.length} ${msg}`);
    setSelected(new Set());
    setStatus('all');
  };

  return (
    <div className="pf-page">
      <div className="row wrap" style={{ gap: 16 }}>
        <h1 className="pf-title">Espace Designer</h1>
        <span className="muted">
          Capacité par défaut : {state.settings.defaultCapacity} packs / designer / semaine{auth.can('users.manage') ? ' (réglable dans Paramètres)' : ''}
        </span>
      </div>

      {/* Planning de charge designers × semaines */}
      <div className="card pk-plan-wrap">
        <table className="pk-plan">
          <thead>
            <tr>
              <th>Designer</th>
              {weeks.map((w) => (
                <th key={w.key} className={w.key === weekKey(TODAY) ? 'now' : ''}>
                  <b>{weekLabel(w.sample)}</b>
                  <small>{weekRange(w.sample).replace(/ \d{4}$/, '')}</small>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...designers, 'all'].map((d) => (
              <tr key={d} className={d === 'all' ? 'total' : ''}>
                <th {...(d === 'all' ? {} : dropZone(`who-${d}`, d))} className={dropKey === `who-${d}` ? 'pk-drop' : ''}>
                  <button className="pk-who" onClick={() => pick(d, week)}>
                    {d === 'all' ? (
                      <b>Équipe</b>
                    ) : (
                      <>
                        <span className="dev-avatar" style={{ background: colorOf(d) }}>
                          {initials(d)}
                        </span>
                        <b>{d}</b>
                      </>
                    )}
                  </button>
                </th>
                {weeks.map((w) => {
                  const items = cell(d, w.key);
                  const ok = items.filter(packDone).length;
                  const lateN = items.filter(packLate).length;
                  const cap = d === 'all' ? designers.reduce((t, x) => t + capacityOf(state, x), 0) : capacityOf(state, d);
                  const over = items.length > cap;
                  const active = designer === d && week === w.key;
                  return (
                    <td key={w.key} {...dropZone(`${d}|${w.key}`, d === 'all' ? undefined : d, w.sample)}>
                      <button
                        className={`pk-cell ${active ? 'active' : ''} ${over ? 'over' : ''} ${!items.length ? 'empty' : ''} ${dropKey === `${d}|${w.key}` ? 'drop' : ''}`}
                        onClick={() => pick(d, w.key)}
                      >
                        <span className="pk-cell-n">
                          <b>{ok}</b>/{items.length}
                        </span>
                        <span className="pk-bar">
                          <span style={{ width: `${items.length ? (ok / items.length) * 100 : 0}%` }} />
                        </span>
                        <span className="pk-cell-flags">
                          {over && <em className="over">+{items.length - cap}</em>}
                          {lateN > 0 && <em className="late">{lateN} retard</em>}
                        </span>
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canAssign && <div className="pk-hint">Administrateur : glissez un pack (ou votre sélection) sur une case du planning pour changer de designer et/ou de semaine, ou sur un nom de designer pour ne changer que le designer.</div>}

      <div className="split">
        <div className="col" style={{ gap: 12 }}>
          <div className="pk-scope">
            {designer !== 'all' && (
              <span className="dev-avatar lg" style={{ background: colorOf(designer) }}>
                {initials(designer)}
              </span>
            )}
            <div>
              <h2>
                {designer === 'all' ? 'Toute l’équipe' : designer} · Semaine {weekLabel(weekSample).slice(1)}
              </h2>
              <span className="muted">{weekRange(weekSample)}</span>
            </div>
            <div className="pk-scope-stats">
              <span>
                <b>{scope.length}</b> packs
              </span>
              <span className="green">
                <b>{done}</b> validés
              </span>
              <span className="violet-t">
                <b>{scope.filter((p) => statusKey(p) === 'en_creation').length}</b> en création
              </span>
              <span className={late ? 'red' : ''}>
                <b>{late}</b> en retard
              </span>
              {designer !== 'all' && (
                <span className={scope.length > capacityOf(state, designer) ? 'red' : 'muted'}>
                  <b>{scope.length}</b>/{capacityOf(state, designer)} capacité
                </span>
              )}
            </div>
            <div className="pk-scope-bar">
              <span style={{ width: `${scope.length ? (done / scope.length) * 100 : 0}%` }} />
            </div>
          </div>

          <div className="pk-chips">
            {STATUS_CHIPS.map((c) => {
              const n = scope.filter((p) => matches(p, c.id)).length;
              return (
                <button key={c.id} className={`pk-chip ${status === c.id ? 'active' : ''} ${c.id === 'retard' && n ? 'warn' : ''}`} onClick={() => setStatus(c.id)} disabled={!n && c.id !== 'all'}>
                  {c.label} <b>{n}</b>
                </button>
              );
            })}
          </div>

          {/* Suivi pack : die cut manquant, en attente de validation, à refaire, validé */}
          <div className="dev-trackbar pk-trackbar" role="group" aria-label="Suivi pack">
            <span className="pk-trackbar-title">Suivi pack</span>
            {TRACK_CHIPS.map(([k, label]) => (
              <button key={k} type="button" className={`pf-chip ${track === k ? 'active' : ''}`} aria-pressed={track === k} onClick={() => setTrack(k)}>
                {k !== 'all' && <TrackRound k={k} />} {label} <b>{scope.filter((p) => matchTrack(p, k)).length}</b>
              </button>
            ))}
          </div>

          <div className="pk-toolbar">
            <label className="pf-search pk-search">
              <Search size={18} />
              <input placeholder="Réf., produit, fournisseur, marque…" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
            <label className="pk-group" htmlFor="pk-sort">
              <span className="xs muted">Trier</span>
              <select id="pk-sort" className="input" value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)}>
                {(Object.keys(SORT_LABELS) as SortBy[]).map((k) => (
                  <option key={k} value={k}>
                    {SORT_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className="pk-group" htmlFor="pk-group">
              <span className="xs muted">Grouper</span>
              <select id="pk-group" className="input" value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)}>
                {(Object.keys(GROUP_LABELS) as GroupBy[]).map((k) => (
                  <option key={k} value={k}>
                    {GROUP_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {selected.size > 0 && (
            <div className="pk-bulk">
              <b>{selected.size} sélectionné{selected.size > 1 ? 's' : ''}</b>
              {canValidate.length > 0 && (
                <button className="btn sm primary" onClick={() => bulk(canValidate, 'validatePack', 'validation(s) enregistrée(s)')}>
                  <Check size={14} /> Valider mon étape ({canValidate.length})
                </button>
              )}
              {canDieCut.length > 0 && (
                <button className="btn sm" onClick={() => bulk(canDieCut, 'requestDieCut', 'die cut(s) demandé(s)')}>
                  <Scissors size={14} /> Demander die cut ({canDieCut.length})
                </button>
              )}
              {canStart.length > 0 && (
                <button
                  className="btn sm primary"
                  onClick={() => {
                    canStart.forEach((p) => dispatch({ type: 'startPack', productId: p.id }));
                    toast(`${canStart.length} pack(s) commencé(s)`);
                    setSelected(new Set());
                  }}
                >
                  <Play size={14} /> Je commence ({canStart.length})
                </button>
              )}
              {canForward.length > 0 && (
                <button className="btn sm" onClick={() => bulk(canForward, 'forwardPack', 'pack(s) envoyé(s) aux fournisseurs')}>
                  <Send size={14} /> Forwarder ({canForward.length})
                </button>
              )}
              {canPush && (
                <button
                  className="btn sm danger"
                  onClick={() => {
                    const toPush = chosen.filter((p) => !p.urgent);
                    toPush.forEach((p) => dispatch({ type: 'toggleUrgent', productId: p.id }));
                    toast(`${toPush.length} pack(s) poussé(s) en urgent`);
                    setSelected(new Set());
                  }}
                >
                  <Flame size={14} /> Push urgent
                </button>
              )}
              {canAssign && (
                <span className="pk-move">
                  <select className="input" value={moveTo.designer} onChange={(e) => setMoveTo({ ...moveTo, designer: e.target.value })} aria-label="Designer cible">
                    <option value="">Même designer</option>
                    {designers.map((d) => (
                      <option key={d}>{d}</option>
                    ))}
                  </select>
                  <select className="input" value={moveTo.week} onChange={(e) => setMoveTo({ ...moveTo, week: e.target.value })} aria-label="Semaine cible">
                    <option value="">Même semaine</option>
                    {weeks.map((w) => (
                      <option key={w.key} value={w.sample}>
                        {weekLabel(w.sample)}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn sm"
                    disabled={!moveTo.designer && !moveTo.week}
                    onClick={() => move([...selected], moveTo.designer || undefined, moveTo.week || undefined)}
                  >
                    Déplacer
                  </button>
                </span>
              )}
              {canValidate.length + canDieCut.length + canForward.length + canStart.length === 0 && !canPush && !canAssign && (
                <span className="small muted">Aucune action possible pour votre rôle sur cette sélection.</span>
              )}
              <button className="btn sm ghost" onClick={() => setSelected(new Set())}>
                <X size={14} /> Désélectionner
              </button>
            </div>
          )}

          <div className="card pk-list">
            <div className="pk-head">
              <input type="checkbox" checked={allChecked} onChange={() => setSelected(allChecked ? new Set() : new Set(list.map((p) => p.id)))} aria-label="Tout sélectionner" />
              <span className="pk-c-prod">Produit · {list.length}</span>
              <span className="pk-c-brand">Marque</span>
              <span className="pk-c-sup">Fournisseur</span>
              <span className="pk-c-type">Type de pack</span>
              <span className="pk-c-val">Suivi pack</span>
              <span className="pk-c-due">Échéance</span>
              <span className="pk-c-st">Statut</span>
            </div>
            {list.length === 0 && <div className="empty">Aucun pack pour ce filtre.</div>}
            {groups.map(([g, items]) => (
              <div key={g || 'all'}>
                {g && (
                  <div className="pk-group-head">
                    {g} <b>{items.length}</b>
                  </div>
                )}
                {items.map((p) => (
                  <PackRow
                    key={p.id}
                    p={p}
                    state={state}
                    checked={selected.has(p.id)}
                    active={sel?.id === p.id}
                    showDesigner={designer === 'all'}
                    color={colorOf(p.pack.designer)}
                    draggable={canAssign}
                    onDragStart={(e) => {
                      e.dataTransfer.setData(DRAG_MIME, JSON.stringify(dragIds(p.id)));
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onUrgent={
                      canPush
                        ? () => {
                            dispatch({ type: 'toggleUrgent', productId: p.id });
                            toast(p.urgent ? `${p.ref} retiré de PUSH URGENT` : `${p.ref} poussé en urgent`);
                          }
                        : undefined
                    }
                    onStart={
                      !p.pack.startedAt && p.pack.validations.direction.state === 'todo' && auth.allowed({ type: 'startPack', productId: p.id })
                        ? () => {
                            dispatch({ type: 'startPack', productId: p.id });
                            toast(`${p.ref} : pack commencé`);
                          }
                        : undefined
                    }
                    onCheck={() => toggle(p.id)}
                    onOpen={() => {
                      setSelId(p.id);
                      revealPanel();
                    }}
                  />
                ))}
              </div>
            ))}
            {list.length > limit && (
              <button className="pk-more" onClick={() => setLimit(limit + 50)}>
                Afficher plus ({list.length - limit} restants)
              </button>
            )}
          </div>
        </div>
        <div className="sticky-panel">{sel ? <PackPanel p={sel} /> : <div className="card empty">Sélectionnez un pack pour voir son détail, ses fichiers et son circuit de validation.</div>}</div>
      </div>
    </div>
  );
}

function PackRow({
  p,
  state,
  checked,
  active,
  showDesigner,
  color,
  draggable,
  onDragStart,
  onUrgent,
  onStart,
  onCheck,
  onOpen,
}: {
  p: Product;
  state: State;
  checked: boolean;
  active: boolean;
  showDesigner: boolean;
  color: string;
  draggable: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onUrgent?: () => void;
  onStart?: () => void;
  onCheck: () => void;
  onOpen: () => void;
}) {
  const [label, tone] = packStatus(p);
  const late = packLate(p);
  return (
    <div
      className={`pk-row ${active ? 'active' : ''} ${late ? 'late' : ''} ${draggable ? 'draggable' : ''}`}
      {...pressable(onOpen, `Ouvrir le pack ${p.ref}`)}
      draggable={draggable}
      onDragStart={onDragStart}
    >
      <input type="checkbox" checked={checked} onClick={(e) => e.stopPropagation()} onChange={onCheck} aria-label={`Sélectionner ${p.ref}`} />
      <span className="pk-c-prod">
        <ProductThumb product={p} size={32} />
        <span className="pk-id">
          <b>
            {p.ref}
            {!!p.pack.files?.length && (
              <span className="pk-clip" title={`${p.pack.files.length} fichier(s)`}>
                <Paperclip size={11} /> {p.pack.files.length}
              </span>
            )}
          </b>
          <small>
            {p.name} · {p.collection}
          </small>
        </span>
        {showDesigner && (
          <span className="dev-avatar" style={{ background: color }} title={p.pack.designer}>
            {initials(p.pack.designer)}
          </span>
        )}
        {onUrgent ? (
          <button
            className={`pk-urgent ${p.urgent ? 'on' : ''}`}
            title={p.urgent ? 'Retirer de PUSH URGENT' : 'Pousser en urgent'}
            onClick={(e) => {
              e.stopPropagation();
              onUrgent();
            }}
          >
            <Flame size={15} />
          </button>
        ) : (
          p.urgent && <Flame size={15} className="red" />
        )}
      </span>
      <span className="pk-c-brand">
        <BrandLogo brand={brandOf(state.brands, p.brandId)} size={9} />
      </span>
      <span className="pk-c-sup">{byId(state.suppliers, p.supplierId).shortName}</span>
      <span className="pk-c-type">{p.pack.type}</span>
      <span className="pk-c-val">
        <PackTrackDots p={p} />
      </span>
      <span className={`pk-c-due ${late ? 'red' : ''}`}>{fshort(p.pack.artworkDeadline)}</span>
      <span className="pk-c-st">
        {onStart ? (
          <button
            className="pk-start"
            onClick={(e) => {
              e.stopPropagation();
              onStart();
            }}
            title="Indiquer que je commence ce pack"
          >
            <Play size={13} /> Commencer
          </button>
        ) : (
          <Pill color={late ? 'red' : tone}>{late ? 'En retard' : label}</Pill>
        )}
        {p.pack.startedAt && !packDone(p) && p.pack.validations.direction.state === 'todo' && <small className="pk-when">depuis {fstamp(p.pack.startedAt)}</small>}
        {!p.pack.startedAt && p.pack.plannedStart && <small className="pk-when">prévu {fshort(p.pack.plannedStart)}</small>}
      </span>
    </div>
  );
}

function PackPanel({ p }: { p: Product }) {
  const { state, dispatch } = useStore();
  const auth = useAuth();
  const [sub, setSub] = useState<'pack' | 'diecut' | 'brief' | 'fichiers'>('fichiers');
  const sup = byId(state.suppliers, p.supplierId);
  const pf = proformaOf(state, p);
  const done = packDone(p);
  const pendingStep = VALIDATION_STEPS.find((s) => p.pack.validations[s].state !== 'done');

  return (
    <div className="card pad">
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div className="thumb" style={{ width: 140, height: 110, background: p.tint, fontSize: 70 }}>
          <ProductPic product={p} />
        </div>
        <div className="col grow" style={{ alignItems: 'flex-end' }}>
          <BrandLogo brand={brandOf(state.brands, p.brandId)} size={14} />
          <span className="small">
            {sup.shortName} {sup.flag}
          </span>
          {pf && (
            <Link to={`/proformas/${pf.id}`} className="small green bold">
              {pf.id}
            </Link>
          )}
          <span className="small">Réf. {p.ref}</span>
        </div>
      </div>
      <h3 className="mt" style={{ fontSize: 20 }}>
        {p.name}
      </h3>
      <div className="row mt small">
        Type de pack <Pill color="violet">{p.pack.type}</Pill>
      </div>
      <div className="row mt small wrap">
        Collection <Pill color="grey">{p.collection}</Pill>
        {p.urgent && (
          <Pill color="red-solid" icon={<Flame size={12} />}>
            URGENT
          </Pill>
        )}
      </div>
      {auth.can('pack.assign') && (
        <div className="pk-assign mt">
          <span className="xs muted">Affectation</span>
          <select
            className="input"
            value={p.pack.designer}
            onChange={(e) => {
              dispatch({ type: 'reassignPack', productId: p.id, designer: e.target.value });
              toast(`${p.ref} → ${e.target.value}`);
            }}
            aria-label="Designer"
          >
            {[...new Set(state.products.map((x) => x.pack.designer))].sort().map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
          <input
            className="input"
            type="date"
            value={p.pack.artworkDeadline}
            onChange={(e) => {
              if (!e.target.value) return;
              dispatch({ type: 'reassignPack', productId: p.id, weekOf: e.target.value });
              toast(`${p.ref} → semaine ${weekLabel(e.target.value)}`);
            }}
            aria-label="Semaine"
          />
        </div>
      )}
      {packLate(p) && (
        <div className="pill red mt">
          <AlertTriangle size={13} /> Date limite artwork dépassée ({fdate(p.pack.artworkDeadline)})
        </div>
      )}
      <Tabs
        value={sub}
        onChange={setSub}
        tabs={[
          { id: 'pack', label: 'Pack', icon: <Box size={14} /> },
          { id: 'diecut', label: 'Die cut', icon: <Scissors size={14} /> },
          { id: 'brief', label: 'Brief', icon: <FileText size={14} /> },
          { id: 'fichiers', label: `Fichiers (${(p.pack.files ?? []).length})`, icon: <Layers size={14} /> },
        ]}
      />
      {sub === 'pack' && (
        <div className="grid2">
          <div className="thumb" style={{ height: 100, background: '#efe6da', fontWeight: 800, fontSize: 12, textAlign: 'center' }}>
            {brandOf(state.brands, p.brandId).name}
            <br />v{p.pack.artworkVersions}
          </div>
          <div className="thumb" style={{ height: 100, background: '#f5f7f6', fontSize: 34 }}>
            ✂️
          </div>
          <button className="btn sm" onClick={() => toast('Téléchargement pack (AI/PSD) – démo')}>
            <Download size={13} /> Pack (AI/PSD)
          </button>
          <button className="btn sm" disabled={p.pack.dieCut !== 'received'} onClick={() => toast('Téléchargement die cut – démo')}>
            <Download size={13} /> Die cut (AI/PDF)
          </button>
        </div>
      )}
      {sub === 'diecut' && (
        <div className="col">
          <div>
            État :{' '}
            {p.pack.dieCut === 'received' ? <Pill color="green">Reçu</Pill> : p.pack.dieCut === 'requested' ? <Pill color="orange">Demandé au fournisseur</Pill> : <Pill color="grey">Non demandé</Pill>}
          </div>
          {p.pack.dieCut === 'requested' && auth.allowed({ type: 'receiveDieCut', productId: p.id }) && (
            <button className="btn sm" onClick={() => dispatch({ type: 'receiveDieCut', productId: p.id })}>
              <Check size={13} /> Marquer comme reçu
            </button>
          )}
        </div>
      )}
      {sub === 'brief' && (
        <div className="small">
          Pack {p.pack.type.toLowerCase()} pour la marque {brandOf(state.brands, p.brandId).name}, collection {p.collection}. Rendu attendu le {fdate(p.pack.artworkDeadline)} (designer : {p.pack.designer}).
        </div>
      )}
      {sub === 'fichiers' && <PackFiles p={p} />}

      <div className="pk-startbox mt">
        <div className="bold small">Démarrage du pack</div>
        {p.pack.startedAt ? (
          <div className="small">
            <Play size={13} className="violet-t" /> Commencé par <b>{p.pack.designer}</b> le <b>{fstamp(p.pack.startedAt)}</b>
          </div>
        ) : (
          <div className="small muted">
            Pas encore commencé{p.pack.plannedStart ? ` · début prévu le ${fdate(p.pack.plannedStart)}` : ''}
          </div>
        )}
        {!p.pack.startedAt && auth.allowed({ type: 'startPack', productId: p.id }) && (
          <div className="pk-startrow">
            <button
              className="btn sm primary"
              onClick={() => {
                dispatch({ type: 'startPack', productId: p.id });
                toast(`${p.ref} : pack commencé`);
              }}
            >
              <Play size={14} /> Je commence maintenant
            </button>
            <label className="small row" style={{ gap: 6 }} htmlFor={`plan-${p.id}`}>
              ou début prévu le
              <input
                id={`plan-${p.id}`}
                className="input"
                type="date"
                value={p.pack.plannedStart ?? ''}
                onChange={(e) => {
                  dispatch({ type: 'planPack', productId: p.id, date: e.target.value || null });
                  if (e.target.value) toast(`Début prévu le ${fdate(e.target.value)}`);
                }}
              />
            </label>
          </div>
        )}
      </div>

      <div className="bold mt mb">Circuit de validation (4 étapes)</div>
      <ValidationCircuit product={p} />

      <div className="grid2 mt">
        {auth.can('pack.design') && <button
          className="btn"
          disabled={p.pack.dieCut !== 'none'}
          onClick={() => {
            dispatch({ type: 'requestDieCut', productId: p.id });
            toast('Die cut demandé au fournisseur');
          }}
        >
          <Scissors size={15} /> Demander le die cut
        </button>}
        {!done && pendingStep && auth.allowed({ type: 'validatePack', productId: p.id }) && (
          <button
            className="btn primary"
            onClick={() => {
              dispatch({ type: 'validatePack', productId: p.id });
              toast(`Validation ${VALIDATION_LABELS[pendingStep]} enregistrée`);
            }}
          >
            <Check size={15} /> Valider ({VALIDATION_LABELS[pendingStep]})
          </button>
        )}
        {!done && auth.allowed({ type: 'rejectPack', productId: p.id }) && (
          <button
            className="btn danger"
            onClick={() => {
              const reason = window.prompt('Demande de modification pour le designer (obligatoire) :');
              if (reason?.trim()) dispatch({ type: 'rejectPack', productId: p.id, reason });
            }}
          >
            <X size={15} /> Refuser
          </button>
        )}
        {auth.can('pack.design') && <button
          className="btn primary"
          disabled={p.pack.validations.moinard.state !== 'done' || p.pack.sentToSupplier}
          onClick={() => {
            dispatch({ type: 'forwardPack', productId: p.id });
            toast(`Pack transmis à ${sup.shortName}`);
          }}
        >
          <Send size={15} /> Forwarder le pack
        </button>}
        {auth.can('dev.advance') && (
          <button
            className={`btn ${p.urgent ? 'danger' : ''}`}
            onClick={() => {
              dispatch({ type: 'toggleUrgent', productId: p.id });
              toast(p.urgent ? `${p.ref} retiré de PUSH URGENT` : `${p.ref} poussé en urgent`);
            }}
          >
            <Flame size={15} /> {p.urgent ? 'Retirer de l’urgent' : 'Push urgent'}
          </button>
        )}
      </div>
      {!done && pendingStep && !auth.allowed({ type: 'validatePack', productId: p.id }) && (
        <div className="small muted mt">
          En attente de la validation <b>{VALIDATION_LABELS[pendingStep]}</b>
          {pendingStep === 'fournisseur' && !p.pack.sentToSupplier ? ' (pack pas encore transmis au fournisseur)' : ''}.
        </div>
      )}
      <div className="xs muted mt row" style={{ gap: 6 }}>
        <History size={12} /> Un pack n’est compté terminé qu’après les quatre validations.
      </div>
    </div>
  );
}

/** Sur téléphone, le panneau de détail est sous la liste : on le fait défiler à l'écran. */
function revealPanel() {
  if (window.innerWidth > 1100) return;
  requestAnimationFrame(() => document.querySelector('.sticky-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}
