import { getBlob, saveBlob, zipBlobs } from '../lib/files';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowUpDown,
  Box,
  Calendar,
  Users,
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  Flame,
  History,
  LayoutGrid,
  Layers,
  MessageCircle,
  Tag,
  List,
  Paperclip,
  Play,
  Scissors,
  Search,
  Send,
  X,
} from 'lucide-react';
import PackFiles from '../components/PackFiles';
import FilterChip from '../components/FilterChip';
import AssignDesigner from '../components/AssignDesigner';
import LabelAdviceCard from '../components/LabelAdviceCard';
import ProductChat from '../components/ProductChat';
import { unreadCount } from '../lib/chat';
import { pressable } from '../lib/a11y';
import { brandOf, byId, capacityOf, matchTrack, packDone, packLate, packTrack, TRACK_CHIPS, TRACK_ORDER, useAuth, useStore, type State, type TrackFilter } from '../data/store';
import PackTrackDots, { TrackRound } from '../components/PackTrack';
import type { Product } from '../data/types';
import { VALIDATION_LABELS, VALIDATION_STEPS } from '../data/types';
import { BrandLogo, ProductPic, Pill, ProductThumb, Tabs, ValidationCircuit } from '../components/ui';
import { designerColor, toast } from '../components/ui-shared';
import { TODAY, addDays, fdate, fshort, fstamp, initials, weekKey, weekLabel, weekRange, weekStart } from '../lib/format';

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

type StatusKey = 'all' | 'urgent' | 'retard' | 'a_traiter' | 'en_creation' | 'a_valider' | 'en_validation' | 'a_envoyer' | 'fournisseur' | 'valide';
const STATUS_CHIPS: { id: StatusKey; label: string }[] = [
  { id: 'all', label: 'Tous' },
  { id: 'urgent', label: 'PUSH URGENT' },
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
const matches = (p: Product, k: StatusKey) => k === 'all' || (k === 'urgent' ? !!p.urgent : k === 'retard' ? packLate(p) : statusKey(p) === k);
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
  // Designers : toute l'équipe (même sans produit attribué), plus ceux déjà sur des produits
  const designers = useMemo(
    () => [...new Set([...state.users.filter((u) => u.role === 'designer' && u.active && u.designerName).map((u) => u.designerName!), ...state.products.map((p) => p.pack.designer)])].sort(),
    [state.products, state.users],
  );
  const colorOf = designerColor;

  // Colonnes du planning : de la semaine précédente à la dernière échéance (défilement horizontal)
  const weeks = useMemo(() => {
    const from = weekKey(addDays(TODAY, -7));
    const keys = [...new Set(state.products.map((p) => weekKey(p.pack.artworkDeadline)))].filter((k) => k >= from).sort();
    return keys.map((k) => ({ key: k, sample: state.products.find((p) => weekKey(p.pack.artworkDeadline) === k)!.pack.artworkDeadline }));
  }, [state.products]);

  const [designer, setDesigner] = useState(auth.user.designerName ?? 'all');
  // Vues : par semaine de deadline, par designer, par fournisseur (+ case du planning)
  const [view, setView] = useState<'case' | 'semaine' | 'designer' | 'fournisseur'>('semaine');
  // Liste ou galerie (grandes photos) : choix gardé dans ce navigateur
  const [layout, setLayoutState] = useState<'liste' | 'galerie'>(() => {
    try {
      return localStorage.getItem('jonas-buying-design-layout') === 'galerie' ? 'galerie' : 'liste';
    } catch {
      return 'liste';
    }
  });
  const setLayout = (l: 'liste' | 'galerie') => {
    setLayoutState(l);
    try {
      localStorage.setItem('jonas-buying-design-layout', l);
    } catch {
      /* choix gardé le temps de la session */
    }
  };
  const [showPlan, setShowPlan] = useState(false);
  // Cartes semaine repliées / dépliées (par défaut : semaine en cours et suivante ouvertes)
  const [toggled, setToggled] = useState<Set<string>>(new Set());
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
  // Semaines proposées pour déplacer : de la semaine précédente à +20 semaines
  const targetWeeks = useMemo(() => Array.from({ length: 22 }, (_, i) => addDays(weekStart(TODAY), (i - 1) * 7)), []);
  const [moveDate, setMoveDate] = useState('');
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

  const cell = (d: string | 'all', wk: string) => state.products.filter((p) => (d === 'all' || p.pack.designer === d) && weekKey(p.pack.artworkDeadline) === wk);

  // Vue : un designer sur toutes les semaines, une semaine pour tous les designers, ou une case du planning
  const firstWeek = weeks[0]?.key ?? weekKey(TODAY);
  const scope = view === 'case' ? cell(designer, week) : state.products.filter((p) => (designer === 'all' || p.pack.designer === designer) && weekKey(p.pack.artworkDeadline) >= firstWeek);
  const s = q.trim().toLowerCase();
  const list = scope
    .filter((p) => matches(p, status))
    .filter((p) => matchTrack(p, track))
    .filter((p) => !s || `${p.ref} ${p.name} ${byId(state.suppliers, p.supplierId).name} ${brandOf(state.brands, p.brandId).name} ${p.collection} ${p.pack.type}`.toLowerCase().includes(s))
    .sort(sorters[sortBy]);
  const sel = list.find((p) => p.id === selId) ?? scope.find((p) => p.id === selId);

  const shown = list.slice(0, view !== 'case' ? Math.max(limit, 2000) : limit);
  const groups: [string, Product[]][] = useMemo(() => {
    // Cartes : une par semaine de deadline, par designer ou par fournisseur
    if (view !== 'case') {
      const keyOf = (p: Product) => (view === 'semaine' ? weekKey(p.pack.artworkDeadline) : view === 'designer' ? p.pack.designer : p.supplierId);
      const map = new Map<string, Product[]>();
      for (const p of shown) map.set(keyOf(p), [...(map.get(keyOf(p)) ?? []), p]);
      const nameOf = (k: string) => (view === 'fournisseur' ? (byId(state.suppliers, k)?.name ?? k) : k);
      return [...map.entries()].sort(([a], [b]) => nameOf(a).localeCompare(nameOf(b)));
    }
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
  }, [list, limit, groupBy, view, state.suppliers, state.brands]);

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
    setView('case');
    setDesigner(d);
    setWeek(wk);
    setSelected(new Set());
    setSelId(null);
    setStatus('all');
    setLimit(50);
  };
  // « Déplacer » sur un pack : il devient la sélection, la barre propose les semaines
  const pickToMove = (id: string) => {
    setSelected(new Set([id]));
    requestAnimationFrame(() => document.querySelector('.pk-bulk')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
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
      <div className="row wrap" style={{ gap: 12, alignItems: 'center' }}>
        <h1 className="pf-title">Développement</h1>
        <div className="grow" />
        <button type="button" className={`btn ${showPlan ? 'primary' : ''}`} aria-expanded={showPlan} onClick={() => setShowPlan(!showPlan)}>
          <Calendar size={16} /> Planning de charge
        </button>
      </div>

      {/* Planning de charge designers × semaines (replié par défaut) */}
      {showPlan && (
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
      )}

      <div className="split">
        <div className="col" style={{ gap: 12 }}>
          {/* Vue et designers */}
          <div className="pk-views" role="tablist" aria-label="Vue">
            {([['semaine', 'Par semaine'], ['designer', 'Par designer'], ['fournisseur', 'Par fournisseur'], ...(view === 'case' ? ([['case', 'Designer × semaine']] as const) : [])] as const).map(
              ([v, label]) => (
                <button
                  key={v}
                  type="button"
                  role="tab"
                  aria-selected={view === v}
                  className={`pk-view ${view === v ? 'active' : ''}`}
                  onClick={() => (setView(v), setSelected(new Set()), setStatus('all'), setLimit(50))}
                >
                  {label}
                </button>
              ),
            )}
            {view !== 'case' && (
              <span className="pk-layout" role="group" aria-label="Présentation">
                <button type="button" aria-pressed={layout === 'liste'} className={layout === 'liste' ? 'on' : ''} onClick={() => setLayout('liste')}>
                  <List size={16} /> Liste
                </button>
                <button type="button" aria-pressed={layout === 'galerie'} className={layout === 'galerie' ? 'on' : ''} onClick={() => setLayout('galerie')}>
                  <LayoutGrid size={16} /> Galerie
                </button>
              </span>
            )}
          </div>
          {view !== 'case' && (
            <div className="pk-designers" role="group" aria-label="Designer">
              {['all', ...designers].map((d) => {
                const n = state.products.filter((p) => (d === 'all' || p.pack.designer === d) && weekKey(p.pack.artworkDeadline) >= (weeks[0]?.key ?? weekKey(TODAY))).length;
                return (
                  <button key={d} type="button" className={`pk-dchip ${designer === d ? 'active' : ''}`} aria-pressed={designer === d} onClick={() => (setDesigner(d), setSelected(new Set()))}>
                    {d === 'all' ? (
                      <Users size={15} />
                    ) : (
                      <span className="dev-avatar" style={{ background: colorOf(d) }}>
                        {initials(d)}
                      </span>
                    )}
                    {d === 'all' ? 'Toute l’équipe' : d}
                    <b>{n}</b>
                  </button>
                );
              })}
            </div>
          )}

          <div className="pk-chips">
            {STATUS_CHIPS.map((c) => {
              const n = scope.filter((p) => matches(p, c.id)).length;
              return (
                (n > 0 || c.id === 'all' || status === c.id) && (
                  <button key={c.id} className={`pk-chip ${status === c.id ? 'active' : ''} ${c.id === 'retard' && n ? 'warn' : ''}`} onClick={() => setStatus(c.id)}>
                    {c.label} <b>{n}</b>
                  </button>
                )
              );
            })}
          </div>

          {/* Suivi pack : die cut manquant, en attente de validation, à refaire, validé */}
          <div className="dev-trackbar pk-trackbar" role="group" aria-label="Suivi pack">
            <span className="pk-trackbar-title">Suivi pack</span>
            {TRACK_CHIPS.map(([k, label]) => (
              <button
                key={k}
                type="button"
                className={`trk-tile ${track === k ? 'active' : ''}`}
                aria-pressed={track === k}
                aria-label={`${label} (${scope.filter((p) => matchTrack(p, k)).length})`}
                onClick={() => setTrack(k)}
              >
                {k === 'all' ? <span className="trk-round all">{scope.length}</span> : <TrackRound k={k} />}
                <span className="trk-tile-label">{label}</span>
                {k !== 'all' && <b>{scope.filter((p) => matchTrack(p, k)).length}</b>}
              </button>
            ))}
          </div>

          <div className="pk-toolbar">
            <label className="pr-search pk-search">
              <Search size={18} />
              <input placeholder="Réf., produit, fournisseur, marque…" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
            <FilterChip
              label="Trier"
              clearable={false}
              allId="__"
              value={sortBy}
              onChange={(v) => setSortBy(v as SortBy)}
              options={(Object.keys(SORT_LABELS) as SortBy[]).map((k) => ({ id: k, label: `Tri : ${SORT_LABELS[k].toLowerCase()}` }))}
            />
            {view === 'case' && (
              <FilterChip
                label="Grouper"
                allId="none"
                allLabel="Sans regroupement"
                value={groupBy}
                onChange={(v) => setGroupBy(v as GroupBy)}
                options={(Object.keys(GROUP_LABELS) as GroupBy[]).filter((k) => k !== 'none').map((k) => ({ id: k, label: GROUP_LABELS[k] }))}
              />
            )}
          </div>

          {selected.size > 0 && (
            <div className="pk-bulk">
              <b>
                {selected.size} sélectionné{selected.size > 1 ? 's' : ''}
              </b>
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
                    {targetWeeks.map((w) => (
                      <option key={w} value={w}>
                        {weekLabel(w)}
                      </option>
                    ))}
                  </select>
                  <button className="btn sm" disabled={!moveTo.designer && !moveTo.week} onClick={() => move([...selected], moveTo.designer || undefined, moveTo.week || undefined)}>
                    Déplacer
                  </button>
                </span>
              )}
              <AssignDesigner ids={[...selected]} onDone={() => setSelected(new Set())} dark />
              {canAssign && (
                <div className="pk-wkbar" role="group" aria-label="Déplacer vers la semaine">
                  <span>Déplacer vers :</span>
                  {targetWeeks.slice(0, 14).map((w) => {
                    const cur = chosen.length > 0 && chosen.every((p) => weekKey(p.pack.artworkDeadline) === weekKey(w));
                    return (
                      <button key={w} type="button" className={`pk-wk ${cur ? 'cur' : ''}`} onClick={() => move([...selected], undefined, w)} title={`Semaine du ${fdate(weekStart(w))}`}>
                        <b>{weekLabel(w)}</b>
                        <small>{fshort(weekStart(w))}</small>
                      </button>
                    );
                  })}
                  <label className="pk-date">
                    Date de rendu
                    <input type="date" className="input" value={moveDate} onChange={(e) => setMoveDate(e.target.value)} aria-label="Date de rendu artwork (lot)" />
                  </label>
                  <button
                    type="button"
                    className="btn sm primary"
                    disabled={!moveDate}
                    onClick={() => {
                      const ids = [...selected].filter((id) => auth.allowed({ type: 'reassignPack', productId: id, deadline: moveDate }));
                      ids.forEach((id) => dispatch({ type: 'reassignPack', productId: id, deadline: moveDate }));
                      toast(`${ids.length} pack${ids.length > 1 ? 's' : ''} : rendu artwork le ${fdate(moveDate)}`);
                      setSelected(new Set());
                      setMoveDate('');
                    }}
                  >
                    Appliquer la date
                  </button>
                </div>
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
            <div className={`pk-head ${layout === 'galerie' && view !== 'case' ? 'pk-head-gal' : ''}`}>
              <input type="checkbox" checked={allChecked} onChange={() => setSelected(allChecked ? new Set() : new Set(list.map((p) => p.id)))} aria-label="Tout sélectionner" />
              <span className="pk-c-prod">Produit · {list.length}</span>
              <span className="pk-c-brand">Marque</span>
              <span className="pk-c-sup">Fournisseur</span>
              <span className="pk-c-type">Type de pack</span>
              <span className="pk-c-val">Suivi pack</span>
              <span className="pk-c-due">Deadline</span>
              <span className="pk-c-st">Statut</span>
            </div>
            {list.length === 0 && <div className="empty">Aucun pack pour ce filtre.</div>}
            {groups.map(([g, items]) => {
              const gallery = layout === 'galerie' && view !== 'case';
              const nextWeek = weekKey(addDays(TODAY, 7));
              const isCard = view !== 'case';
              const tk = `${view}:${g}`;
              // Ouvertes par défaut : semaine en cours et suivante ; designers ; fournisseurs s'ils sont peu nombreux
              const byDefault = view === 'semaine' ? g >= weekKey(TODAY) && g <= nextWeek : view === 'designer' ? true : groups.length <= 3;
              const open = !isCard || byDefault !== toggled.has(tk);
              const onToggle = () =>
                setToggled((s) => {
                  const n = new Set(s);
                  if (n.has(tk)) n.delete(tk);
                  else n.add(tk);
                  return n;
                });
              const sup = view === 'fournisseur' ? byId(state.suppliers, g) : undefined;
              return (
                <div
                  key={g || 'all'}
                  className={isCard ? `pf-week pk-week ${open ? 'open' : ''} ${dropKey === `grp-${g}` ? 'pk-drop-over' : ''}` : undefined}
                  {...(view === 'semaine' ? dropZone(`grp-${g}`, undefined, items[0].pack.artworkDeadline) : view === 'designer' ? dropZone(`grp-${g}`, g) : {})}
                >
                  {isCard ? (
                    <WeekHead
                      items={items}
                      kind={view as 'semaine' | 'designer' | 'fournisseur'}
                      title={view === 'designer' ? g : sup?.name}
                      sub={view === 'designer' ? 'Designer' : sup ? `${sup.city ?? ''}${sup.country ? ` · ${sup.country}` : ''}` : undefined}
                      color={view === 'designer' ? colorOf(g) : sup?.color}
                      current={view === 'semaine' && g === weekKey(TODAY)}
                      open={open}
                      capacity={view === 'semaine' && designer !== 'all' ? capacityOf(state, designer) : undefined}
                      onToggle={onToggle}
                    />
                  ) : (
                    g && (
                      <div className="pk-group-head">
                        {g} <b>{items.length}</b>
                      </div>
                    )
                  )}
                  {open && gallery && (
                    <div className="pk-gal">
                      {items.map((p) => (
                        <PackCard
                          key={p.id}
                          p={p}
                          state={state}
                          checked={selected.has(p.id)}
                          onCheck={() => toggle(p.id)}
                          onMove={canAssign ? () => pickToMove(p.id) : undefined}
                          active={sel?.id === p.id}
                          showDesigner={designer === 'all'}
                          color={colorOf(p.pack.designer)}
                          draggable={canAssign}
                          onDragStart={(e) => {
                            e.dataTransfer.setData(DRAG_MIME, JSON.stringify(dragIds(p.id)));
                            e.dataTransfer.effectAllowed = 'move';
                          }}
                          onOpen={() => {
                            setSelId(p.id);
                            revealPanel();
                          }}
                        />
                      ))}
                    </div>
                  )}
                  {open &&
                    !gallery &&
                    items.map((p) => (
                      <PackRow
                        key={p.id}
                        p={p}
                        state={state}
                        onMove={canAssign ? () => pickToMove(p.id) : undefined}
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
              );
            })}
            {view === 'case' && list.length > limit && (
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

/** En-tête de semaine, comme la page Proformas : date, nombre de packs, retards, urgents, validés, capacité */
function WeekHead({
  items,
  kind = 'semaine',
  title: name,
  sub: subText,
  color,
  current,
  open,
  capacity,
  onToggle,
}: {
  items: Product[];
  kind?: 'semaine' | 'designer' | 'fournisseur';
  title?: string;
  sub?: string;
  color?: string;
  current: boolean;
  open: boolean;
  capacity?: number;
  onToggle: () => void;
}) {
  const sample = items[0].pack.artworkDeadline;
  const late = items.filter(packLate).length;
  const urgent = items.filter((p) => p.urgent).length;
  const validated = items.filter(packDone).length;
  const title = kind === 'semaine' ? `Semaine ${weekLabel(sample).slice(1)}` : (name ?? '');
  return (
    <header className="pf-week-head" {...pressable(onToggle, `${title} : ${open ? 'replier' : 'déplier'}`)} aria-expanded={open}>
      {kind === 'semaine' ? (
        <Calendar className="pf-week-cal" size={38} strokeWidth={1.8} />
      ) : (
        <span className="pk-card-avatar" style={{ background: color ?? 'var(--green)' }}>
          {initials(title)}
        </span>
      )}
      <div className="pf-week-title">
        <h2>
          {title} {current && <span className="dev-now">en cours</span>}
        </h2>
        <span>{kind === 'semaine' ? weekRange(sample) : subText}</span>
      </div>
      <span className="pf-count">
        {items.length} pack{items.length > 1 ? 's' : ''}
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
          <small>Validés</small>
          <b className="green">{validated}</b>
        </div>
        {capacity !== undefined && (
          <div className="pf-metric">
            <small>Capacité</small>
            <b className={items.length > capacity ? 'red' : ''}>
              {items.length}/{capacity}
            </b>
          </div>
        )}
      </div>
      <span className="pf-chevron">{open ? <ChevronUp size={24} /> : <ChevronDown size={24} />}</span>
    </header>
  );
}

/** Galerie : grande photo, référence, nom, état du pack et deadline (clic : ouvre le pack) */
function PackCard({
  p,
  state,
  checked,
  onCheck,
  onMove,
  active,
  showDesigner,
  color,
  draggable,
  onDragStart,
  onOpen,
}: {
  p: Product;
  state: State;
  checked: boolean;
  onCheck: () => void;
  onMove?: () => void;
  active: boolean;
  showDesigner: boolean;
  color: string;
  draggable: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onOpen: () => void;
}) {
  const [label, tone] = packStatus(p);
  const late = packLate(p);
  return (
    <div
      className={`pk-card ${active ? 'active' : ''} ${late ? 'late' : ''} ${checked ? 'checked' : ''}`}
      {...pressable(onOpen, `Ouvrir le pack ${p.ref}`)}
      draggable={draggable}
      onDragStart={onDragStart}
    >
      <div className="pk-card-pic" style={{ background: p.tint }}>
        <ProductPic product={p} />
        <input type="checkbox" className="pk-card-check" checked={checked} onClick={(e) => e.stopPropagation()} onChange={onCheck} aria-label={`Sélectionner ${p.ref}`} />
        {p.urgent && (
          <span className="pk-card-urgent" title="PUSH URGENT">
            <Flame size={16} />
          </span>
        )}
        {onMove && (
          <button
            type="button"
            className="pk-movebtn pk-card-move"
            title="Déplacer vers une autre semaine"
            aria-label={`Déplacer ${p.ref}`}
            onClick={(e) => {
              e.stopPropagation();
              onMove();
            }}
          >
            <ArrowUpDown size={15} />
          </button>
        )}
        {showDesigner && (
          <span className="dev-avatar pk-card-who" style={{ background: color }} title={p.pack.designer}>
            {initials(p.pack.designer)}
          </span>
        )}
      </div>
      <div className="pk-card-body">
        <b>{p.ref}</b>
        <span className="pk-card-name">{p.name}</span>
        <small className="muted">{byId(state.suppliers, p.supplierId).shortName}</small>
        <div className="pk-card-foot">
          <Pill color={late ? 'red' : tone}>{late ? 'En retard' : label}</Pill>
          <span className={late ? 'red bold' : 'muted'}>{fshort(p.pack.artworkDeadline)}</span>
        </div>
      </div>
    </div>
  );
}

function PackRow({
  p,
  state,
  onMove,
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
  onMove?: () => void;
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
        <span className="pk-thumb">
          <ProductThumb product={p} size={64} />
        </span>
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
      <span className={`pk-c-due ${late ? 'red' : ''}`}>
        {fshort(p.pack.artworkDeadline)}
        {onMove && (
          <button
            type="button"
            className="pk-movebtn"
            title="Déplacer vers une autre semaine / changer la date de rendu"
            aria-label={`Déplacer ${p.ref}`}
            onClick={(e) => {
              e.stopPropagation();
              onMove();
            }}
          >
            <ArrowUpDown size={13} />
          </button>
        )}
      </span>
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

/** Télécharge le dernier pack (ou tous les die cuts) déposés pour le produit */
async function downloadPackKind(p: Product, kind: 'pack' | 'diecut') {
  const files = (p.pack.files ?? []).filter((f) => f.kind === kind).sort((a, b) => (b.version ?? 0) - (a.version ?? 0));
  const list = kind === 'pack' ? files.slice(0, 1) : files;
  if (!list.length) return toast(kind === 'pack' ? 'Aucun fichier de pack déposé' : 'Aucun fichier de die cut déposé');
  const items = [];
  for (const f of list) {
    const blob = await getBlob(f.id);
    if (blob) items.push({ path: f.name, blob });
  }
  if (!items.length) return toast('Fichier introuvable sur cet appareil');
  if (items.length === 1) await saveBlob(items[0].blob, items[0].path);
  else await saveBlob(await zipBlobs(items), `${p.ref}_die-cut.zip`);
}

/** Planning du pack : semaine de réalisation (début prévu) et deadline de rendu de l'artwork */
function PackPlanning({ p }: { p: Product }) {
  const { dispatch } = useStore();
  const auth = useAuth();
  const canPlan = !p.pack.startedAt && auth.allowed({ type: 'planPack', productId: p.id, date: null });
  const canDeadline = auth.allowed({ type: 'reassignPack', productId: p.id, deadline: p.pack.artworkDeadline });
  const weeks = useMemo(() => Array.from({ length: 24 }, (_, i) => addDays(weekStart(TODAY), (i - 1) * 7)), []);
  const planned = p.pack.plannedStart;
  const plannedWeek = planned ? weekStart(planned) : '';
  const tooLate = !!planned && weekKey(planned) > weekKey(p.pack.artworkDeadline);
  if (!canPlan && !canDeadline && !planned) return null;
  return (
    <div className="pk-planbox mt" role="group" aria-label="Planning du pack">
      <div className="bold small">Planning du pack</div>
      <div className="pk-planrow">
        <label>
          <span className="xs muted">Semaine de réalisation</span>
          {canPlan ? (
            <select
              className="input"
              aria-label="Semaine de réalisation"
              value={plannedWeek}
              onChange={(e) => {
                const w = e.target.value;
                dispatch({ type: 'planPack', productId: p.id, date: w || null });
                toast(w ? `${p.ref} : réalisation planifiée en ${weekLabel(w)} (semaine du ${fdate(w)})` : `${p.ref} : semaine de réalisation retirée`);
              }}
            >
              <option value="">À planifier</option>
              {plannedWeek && !weeks.includes(plannedWeek) && <option value={plannedWeek}>{weekLabel(plannedWeek)}</option>}
              {weeks.map((w) => (
                <option key={w} value={w}>
                  {weekLabel(w)} · {weekRange(w).replace(/ \d{4}$/, '')}
                </option>
              ))}
            </select>
          ) : (
            <b>{p.pack.startedAt ? `Commencé le ${fdate(p.pack.startedAt.slice(0, 10))}` : planned ? `${weekLabel(planned)} · ${weekRange(planned)}` : 'À planifier'}</b>
          )}
        </label>
        <label>
          <span className="xs muted">Deadline rendu artwork</span>
          {canDeadline ? (
            <input
              className="input"
              type="date"
              aria-label="Deadline rendu artwork"
              value={p.pack.artworkDeadline}
              onChange={(e) => {
                if (!e.target.value) return;
                dispatch({ type: 'reassignPack', productId: p.id, deadline: e.target.value });
                toast(`${p.ref} : rendu artwork le ${fdate(e.target.value)} (${weekLabel(e.target.value)})`);
              }}
            />
          ) : (
            <b>
              {fdate(p.pack.artworkDeadline)} · {weekLabel(p.pack.artworkDeadline)}
            </b>
          )}
        </label>
      </div>
      {tooLate && (
        <div className="small red">
          <AlertTriangle size={13} /> La semaine de réalisation est après la deadline ({weekLabel(p.pack.artworkDeadline)}).
        </div>
      )}
    </div>
  );
}

function PackPanel({ p }: { p: Product }) {
  const { state, dispatch } = useStore();
  const auth = useAuth();
  const [sub, setSub] = useState<'pack' | 'diecut' | 'brief' | 'fichiers' | 'etiquetage' | 'discussion'>('fichiers');
  const sup = byId(state.suppliers, p.supplierId);
  const pf = proformaOf(state, p);
  const done = packDone(p);
  const pendingStep = VALIDATION_STEPS.find((s) => p.pack.validations[s].state !== 'done');

  return (
    <div className="card pad">
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div className="thumb pk-panel-pic" style={{ width: 190, height: 150, background: p.tint, fontSize: 80 }}>
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
          <span className="xs muted">Designer</span>
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
        </div>
      )}
      <PackPlanning p={p} />
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
          { id: 'etiquetage', label: p.labelAdvice ? 'Étiquetage ✓' : 'Étiquetage', icon: <Tag size={14} /> },
          { id: 'discussion', label: `Discussion${unreadCount(p, 'jonas') ? ` (${unreadCount(p, 'jonas')})` : ''}`, icon: <MessageCircle size={14} /> },
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
          <button className="btn sm" onClick={() => downloadPackKind(p, 'pack')}>
            <Download size={13} /> Pack (AI/PSD)
          </button>
          <button className="btn sm" disabled={p.pack.dieCut !== 'received'} onClick={() => downloadPackKind(p, 'diecut')}>
            <Download size={13} /> Die cut (AI/PDF)
          </button>
        </div>
      )}
      {sub === 'diecut' && (
        <div className="col">
          <div>
            État :{' '}
            {p.pack.dieCut === 'received' ? (
              <Pill color="green">Reçu</Pill>
            ) : p.pack.dieCut === 'requested' ? (
              <Pill color="orange">Demandé au fournisseur</Pill>
            ) : (
              <Pill color="grey">Non demandé</Pill>
            )}
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
          Pack {p.pack.type.toLowerCase()} pour la marque {brandOf(state.brands, p.brandId).name}, collection {p.collection}. Rendu attendu le {fdate(p.pack.artworkDeadline)} (designer :{' '}
          {p.pack.designer}).
        </div>
      )}
      {sub === 'fichiers' && <PackFiles p={p} />}
      {sub === 'etiquetage' && <LabelAdviceCard p={p} />}
      {sub === 'discussion' && <ProductChat p={p} />}

      <div className="pk-startbox mt">
        <div className="bold small">Démarrage du pack</div>
        {p.pack.startedAt ? (
          <div className="small">
            <Play size={13} className="violet-t" /> Commencé par <b>{p.pack.designer}</b> le <b>{fstamp(p.pack.startedAt)}</b>
          </div>
        ) : (
          <div className="small muted">Pas encore commencé{p.pack.plannedStart ? ` · début prévu le ${fdate(p.pack.plannedStart)}` : ''}</div>
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
        {auth.can('pack.design') && (
          <button
            className="btn"
            disabled={p.pack.dieCut !== 'none'}
            onClick={() => {
              dispatch({ type: 'requestDieCut', productId: p.id });
              toast('Die cut demandé au fournisseur');
            }}
          >
            <Scissors size={15} /> Demander le die cut
          </button>
        )}
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
        {auth.can('pack.design') && (
          <button
            className="btn primary"
            disabled={p.pack.validations.moinard.state !== 'done' || p.pack.sentToSupplier}
            onClick={() => {
              dispatch({ type: 'forwardPack', productId: p.id });
              toast(`Pack transmis à ${sup.shortName}`);
            }}
          >
            <Send size={15} /> Forwarder le pack
          </button>
        )}
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
        {auth.allowed({ type: 'markDeveloped', productId: p.id }) && !p.developed && (
          <button
            className="btn"
            onClick={() => {
              dispatch({ type: 'markDeveloped', productId: p.id });
              toast(`${p.ref} marqué comme développé`);
            }}
          >
            <Check size={15} /> Marquer développé
          </button>
        )}
        {p.developed && <span className="pill green">Produit développé{p.devForced ? ' (à la main)' : ''}</span>}
        {!p.developed && (
          <span className="small muted" style={{ flexBasis: '100%' }}>
            Passe « Développé » automatiquement quand le pack est validé (Direction, Moinard, fournisseur) et la proforma signée.
          </span>
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
