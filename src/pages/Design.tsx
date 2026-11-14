import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Box, Check, Download, FileText, Flame, History, Layers, Scissors, Search, Send, Upload, X } from 'lucide-react';
import { byId, packDone, packLate, useAuth, useStore, type State } from '../data/store';
import type { Product } from '../data/types';
import { VALIDATION_LABELS, VALIDATION_STEPS } from '../data/types';
import { designerColor, BrandLogo, Pill, ProductThumb, Tabs, ValidationCircuit, ValidationDot, toast } from '../components/ui';
import { TODAY, addDays, fdate, fshort, initials, weekKey, weekLabel, weekRange } from '../lib/format';


function packStatus(p: Product): [string, string] {
  const v = p.pack.validations;
  if (packDone(p)) return ['Validé', 'green'];
  if (v.david.state === 'todo') return ['À traiter', 'grey'];
  if (v.david.state === 'pending') return ['À valider', 'orange'];
  if (v.fournisseur.state === 'pending') return p.pack.sentToSupplier ? ['Chez fournisseur', 'blue'] : ['À envoyer', 'blue'];
  return ['En validation', 'orange'];
}

function proformaOf(s: State, p: Product) {
  return s.proformas.filter((pf) => pf.status !== 'arrive' && pf.lines.some((l) => l.productId === p.id)).sort((a, b) => a.etd.localeCompare(b.etd))[0];
}

/** Capacité de référence d'un designer (packs par semaine) */
const CAPACITY = 40;

type StatusKey = 'all' | 'retard' | 'a_traiter' | 'a_valider' | 'en_validation' | 'a_envoyer' | 'fournisseur' | 'valide';
const STATUS_CHIPS: { id: StatusKey; label: string }[] = [
  { id: 'all', label: 'Tous' },
  { id: 'retard', label: 'En retard' },
  { id: 'a_traiter', label: 'À traiter' },
  { id: 'a_valider', label: 'À valider' },
  { id: 'en_validation', label: 'En validation' },
  { id: 'a_envoyer', label: 'À envoyer' },
  { id: 'fournisseur', label: 'Chez fournisseur' },
  { id: 'valide', label: 'Validés' },
];
const LABEL_TO_KEY: Record<string, StatusKey> = {
  Validé: 'valide',
  'À traiter': 'a_traiter',
  'À valider': 'a_valider',
  'En validation': 'en_validation',
  'À envoyer': 'a_envoyer',
  'Chez fournisseur': 'fournisseur',
};
const statusKey = (p: Product) => LABEL_TO_KEY[packStatus(p)[0]];
const matches = (p: Product, k: StatusKey) => k === 'all' || (k === 'retard' ? packLate(p) : statusKey(p) === k);
// Ordre de traitement : retards d'abord, puis par avancement, puis par date
const ORDER: StatusKey[] = ['a_traiter', 'a_valider', 'en_validation', 'a_envoyer', 'fournisseur', 'valide'];
const sortPacks = (a: Product, b: Product) =>
  Number(packLate(b)) - Number(packLate(a)) || ORDER.indexOf(statusKey(a)) - ORDER.indexOf(statusKey(b)) || a.pack.artworkDeadline.localeCompare(b.pack.artworkDeadline);

type GroupBy = 'none' | 'fournisseur' | 'statut' | 'jour';

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
  const [q, setQ] = useState('');
  const [groupBy, setGroupBy] = useState<GroupBy>('none');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selId, setSelId] = useState<string | null>(null);
  const [limit, setLimit] = useState(50);

  const cell = (d: string | 'all', wk: string) =>
    state.products.filter((p) => (d === 'all' || p.pack.designer === d) && weekKey(p.pack.artworkDeadline) === wk);

  const scope = cell(designer, week);
  const s = q.trim().toLowerCase();
  const list = scope
    .filter((p) => matches(p, status))
    .filter((p) => !s || `${p.ref} ${p.name} ${byId(state.suppliers, p.supplierId).name} ${byId(state.brands, p.brandId).name}`.toLowerCase().includes(s))
    .sort(sortPacks);
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
        groupBy === 'fournisseur' ? byId(state.suppliers, p.supplierId).name : groupBy === 'statut' ? (packLate(p) ? 'En retard' : packStatus(p)[0]) : fdate(p.pack.artworkDeadline);
      map.set(k, [...(map.get(k) ?? []), p]);
    }
    return [...map.entries()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, limit, groupBy, state.suppliers]);

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
        <span className="muted">Capacité de référence : {CAPACITY} packs / designer / semaine</span>
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
                <th>
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
                  const cap = d === 'all' ? CAPACITY * designers.length : CAPACITY;
                  const over = items.length > cap;
                  const active = designer === d && week === w.key;
                  return (
                    <td key={w.key}>
                      <button className={`pk-cell ${active ? 'active' : ''} ${over ? 'over' : ''}`} onClick={() => pick(d, w.key)} disabled={!items.length}>
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
              <span className={late ? 'red' : ''}>
                <b>{late}</b> en retard
              </span>
              {designer !== 'all' && (
                <span className={scope.length > CAPACITY ? 'red' : 'muted'}>
                  <b>{scope.length}</b>/{CAPACITY} capacité
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

          <div className="pk-toolbar">
            <label className="pf-search pk-search">
              <Search size={18} />
              <input placeholder="Réf., produit, fournisseur, marque…" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
            <label className="pk-group">
              <span className="xs muted">Grouper</span>
              <select className="input" value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)}>
                <option value="none">Aucun</option>
                <option value="jour">Par jour</option>
                <option value="fournisseur">Par fournisseur</option>
                <option value="statut">Par statut</option>
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
              {canForward.length > 0 && (
                <button className="btn sm" onClick={() => bulk(canForward, 'forwardPack', 'pack(s) envoyé(s) aux fournisseurs')}>
                  <Send size={14} /> Forwarder ({canForward.length})
                </button>
              )}
              {canValidate.length + canDieCut.length + canForward.length === 0 && <span className="small muted">Aucune action possible pour votre rôle sur cette sélection.</span>}
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
              <span className="pk-c-val">D · Dir · M · F</span>
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
  onCheck,
  onOpen,
}: {
  p: Product;
  state: State;
  checked: boolean;
  active: boolean;
  showDesigner: boolean;
  color: string;
  onCheck: () => void;
  onOpen: () => void;
}) {
  const [label, tone] = packStatus(p);
  const late = packLate(p);
  return (
    <div className={`pk-row ${active ? 'active' : ''} ${late ? 'late' : ''}`} onClick={onOpen}>
      <input type="checkbox" checked={checked} onClick={(e) => e.stopPropagation()} onChange={onCheck} aria-label={`Sélectionner ${p.ref}`} />
      <span className="pk-c-prod">
        <ProductThumb product={p} size={32} />
        <span className="pk-id">
          <b>
            {p.ref}
            {p.urgent && <Flame size={12} className="red" />}
          </b>
          <small>{p.name}</small>
        </span>
        {showDesigner && (
          <span className="dev-avatar" style={{ background: color }} title={p.pack.designer}>
            {initials(p.pack.designer)}
          </span>
        )}
      </span>
      <span className="pk-c-brand">
        <BrandLogo brand={byId(state.brands, p.brandId)} size={9} />
      </span>
      <span className="pk-c-sup">{byId(state.suppliers, p.supplierId).shortName}</span>
      <span className="pk-c-type">{p.pack.type}</span>
      <span className="pk-c-val">
        {VALIDATION_STEPS.map((st) => (
          <ValidationDot key={st} state={p.pack.validations[st].state} />
        ))}
      </span>
      <span className={`pk-c-due ${late ? 'red' : ''}`}>{fshort(p.pack.artworkDeadline)}</span>
      <span className="pk-c-st">
        <Pill color={late ? 'red' : tone}>{late ? 'En retard' : label}</Pill>
      </span>
    </div>
  );
}

function PackPanel({ p }: { p: Product }) {
  const { state, dispatch } = useStore();
  const auth = useAuth();
  const [sub, setSub] = useState<'pack' | 'diecut' | 'brief' | 'fichiers'>('pack');
  const sup = byId(state.suppliers, p.supplierId);
  const pf = proformaOf(state, p);
  const done = packDone(p);
  const pendingStep = VALIDATION_STEPS.find((s) => p.pack.validations[s].state !== 'done');

  return (
    <div className="card pad">
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div className="thumb" style={{ width: 140, height: 110, background: p.tint, fontSize: 70 }}>
          {p.emoji}
        </div>
        <div className="col grow" style={{ alignItems: 'flex-end' }}>
          <BrandLogo brand={byId(state.brands, p.brandId)} size={14} />
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
          { id: 'fichiers', label: 'Fichiers', icon: <Layers size={14} /> },
        ]}
      />
      {sub === 'pack' && (
        <div className="grid2">
          <div className="thumb" style={{ height: 100, background: '#efe6da', fontWeight: 800, fontSize: 12, textAlign: 'center' }}>
            {byId(state.brands, p.brandId).name}
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
          Pack {p.pack.type.toLowerCase()} pour la marque {byId(state.brands, p.brandId).name}, collection {p.collection}. Rendu attendu le {fdate(p.pack.artworkDeadline)} (designer : {p.pack.designer}).
        </div>
      )}
      {sub === 'fichiers' && (
        <div>
          {Array.from({ length: p.pack.artworkVersions }, (_, i) => (
            <div key={i} className="alert-line small">
              <FileText size={14} className="green" /> {p.ref}_pack_v{i + 1}.ai
            </div>
          ))}
        </div>
      )}

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
        {auth.can('pack.design') && <button
          className="btn"
          onClick={() => {
            dispatch({ type: 'uploadArtwork', productId: p.id });
            toast(`Version v${p.pack.artworkVersions + 1} déposée`);
          }}
        >
          <Upload size={15} /> Déposer une version
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
          <button className="btn danger" onClick={() => dispatch({ type: 'rejectPack', productId: p.id })}>
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
