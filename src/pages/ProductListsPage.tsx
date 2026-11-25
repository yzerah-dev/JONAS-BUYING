import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ListChecks, Lock, Pencil, Plus, Search, X } from 'lucide-react';
import { canEditProduct, currentUser, LIST_LABELS, listUsage, listValues, useStore } from '../data/store';
import type { ListKey, Product } from '../data/types';
import { brandFor } from '../lib/productSheet';
import { Pill } from '../components/ui';
import { toast } from '../components/ui-shared';

const KEYS: ListKey[] = ['rayon', 'collection', 'gender', 'material', 'sizes', 'packType'];
const FIELD: Record<ListKey, (p: Product) => string | undefined> = {
  rayon: (p) => p.rayon,
  collection: (p) => p.collection,
  gender: (p) => p.gender,
  material: (p) => p.material,
  sizes: (p) => p.sizes,
  packType: (p) => p.pack.type,
};

interface Row {
  id: string;
  label: string;
  sub?: string;
  products: Product[];
}

/** Une liste : valeurs, nombre de produits (dépliable), renommer / fusionner, retirer, ajouter */
function ListBox({
  title,
  rows,
  q,
  edit,
  onAdd,
  onRename,
  onRemove,
  withSub,
}: {
  title: string;
  rows: Row[];
  q: string;
  edit: boolean;
  onAdd: (v: string, sub: string) => void;
  onRename: (r: Row, v: string, sub: string) => void;
  onRemove: (r: Row) => void;
  withSub?: string;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; v: string; sub: string } | null>(null);
  const [v, setV] = useState('');
  const [sub, setSub] = useState('');
  const shown = rows.filter((r) => !q || `${r.label} ${r.sub ?? ''}`.toLowerCase().includes(q.toLowerCase()));
  const used = rows.filter((r) => r.products.length).length;
  return (
    <section className="card pad lp-box" aria-label={title}>
      <div className="card-title">
        {title}
        <div className="grow" />
        <span className="pill grey">
          {rows.length} valeur(s) · {used} utilisée(s)
        </span>
      </div>
      <div className="lp-rows">
        {shown.length === 0 && <p className="muted small">{q ? 'Aucune valeur ne correspond.' : 'Liste vide.'}</p>}
        {shown.map((r) => (
          <div key={r.id} className="lp-row">
            {editing?.id === r.id ? (
              <form
                className="row grow"
                style={{ gap: 4 }}
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!editing.v.trim()) return;
                  onRename(r, editing.v, editing.sub);
                  setEditing(null);
                }}
              >
                <input className="input" autoFocus aria-label={`Nouveau nom pour ${r.label}`} value={editing.v} onChange={(e) => setEditing({ ...editing, v: e.target.value })} />
                {withSub && <input className="input" style={{ maxWidth: 110 }} aria-label={withSub} value={editing.sub} onChange={(e) => setEditing({ ...editing, sub: e.target.value })} />}
                <button type="submit" className="icon-btn" aria-label="Valider">
                  <Check size={15} />
                </button>
                <button type="button" className="icon-btn" aria-label="Annuler" onClick={() => setEditing(null)}>
                  <X size={15} />
                </button>
              </form>
            ) : (
              <>
                <span className="grow lp-label">
                  {r.label}
                  {r.sub && <small className="muted"> {r.sub}</small>}
                </span>
                <button type="button" className={`lp-count ${r.products.length ? '' : 'zero'}`} aria-expanded={open === r.id} onClick={() => setOpen(open === r.id ? null : r.id)} disabled={!r.products.length}>
                  {r.products.length} produit(s)
                </button>
                {edit && (
                  <>
                    <button type="button" className="icon-btn" aria-label={`Renommer ${r.label}`} title="Renommer (s'applique aux produits) — vers une valeur existante : fusion" onClick={() => setEditing({ id: r.id, v: r.label, sub: r.sub ?? '' })}>
                      <Pencil size={14} />
                    </button>
                    <button type="button" className="icon-btn" aria-label={`Retirer ${r.label}`} disabled={r.products.length > 0} title={r.products.length ? 'Utilisée par des produits : renommez-la ou fusionnez-la' : 'Retirer'} onClick={() => onRemove(r)}>
                      <X size={14} />
                    </button>
                  </>
                )}
              </>
            )}
            {open === r.id && (
              <div className="lp-products">
                {r.products.slice(0, 30).map((p) => (
                  <Link key={p.id} to={`/produits/${p.id}`} className="ref-tag">
                    {p.ref}
                  </Link>
                ))}
                {r.products.length > 30 && <span className="muted small">+ {r.products.length - 30}</span>}
              </div>
            )}
          </div>
        ))}
      </div>
      {edit && (
        <form
          className="row lp-add"
          style={{ gap: 6, marginTop: 10 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (!v.trim()) return;
            onAdd(v, sub);
            setV('');
            setSub('');
          }}
        >
          <input className="input" aria-label={`Ajouter : ${title}`} placeholder="Nouvelle valeur" value={v} onChange={(e) => setV(e.target.value)} />
          {withSub && <input className="input" style={{ maxWidth: 120 }} aria-label={withSub} placeholder={withSub} value={sub} onChange={(e) => setSub(e.target.value)} />}
          <button type="submit" className="btn sm">
            <Plus size={14} /> Ajouter
          </button>
        </form>
      )}
    </section>
  );
}

/** Page « Listes produit » : toutes les listes déroulantes de la fiche, en grand */
export default function ProductListsPage() {
  const { state, dispatch } = useStore();
  const edit = canEditProduct(currentUser(state));
  const [q, setQ] = useState('');

  const brandRows: Row[] = [
    ...(state.brands.some((b) => b.id === 'jonas') ? [] : [{ id: 'jonas', label: 'JONAS', sub: '(par défaut)', products: state.products.filter((p) => p.brandId === 'jonas') }]),
    ...state.brands.map((b) => ({ id: b.id, label: b.name, sub: b.tagline, products: state.products.filter((p) => p.brandId === b.id) })),
  ];

  return (
    <>
      <div className="page-head">
        <h1>
          <ListChecks size={22} className="green" /> Listes produit
        </h1>
        <div className="grow" />
        {!edit && (
          <Pill color="grey" icon={<Lock size={12} />}>
            Lecture seule – Pilote, Direction, acheteurs
          </Pill>
        )}
        <div className="search-box" style={{ minWidth: 260 }}>
          <Search size={16} />
          <input className="input" aria-label="Chercher une valeur" placeholder="Chercher une valeur…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      <p className="muted small mb">
        Valeurs proposées dans les listes déroulantes de la fiche produit et de l'import Excel. Renommer une valeur la change sur tous les produits qui l'utilisent ; la renommer comme une valeur existante fusionne les deux. Une valeur utilisée ne peut pas être retirée.
      </p>
      <div className="lp-grid">
        <ListBox
          title="Marques"
          rows={brandRows}
          q={q}
          edit={edit}
          withSub="Signature"
          onAdd={(name, tagline) => {
            const b = brandFor(state.brands, name);
            if (state.brands.some((x) => x.id === b.id)) return toast(`La marque ${b.name} existe déjà`);
            dispatch({ type: 'setBrands', brands: [...state.brands, { ...b, tagline: tagline.trim().toUpperCase() }] });
            toast(`Marque ${b.name} ajoutée`);
          }}
          onRename={(r, name, tagline) => {
            const exists = state.brands.some((b) => b.id === r.id);
            const nb = { id: r.id, name: name.trim().toUpperCase(), tagline: tagline.trim().toUpperCase() };
            dispatch({ type: 'setBrands', brands: exists ? state.brands.map((b) => (b.id === r.id ? nb : b)) : [...state.brands, nb] });
            toast(`Marque ${nb.name} enregistrée`);
          }}
          onRemove={(r) => dispatch({ type: 'setBrands', brands: state.brands.filter((b) => b.id !== r.id) })}
        />
        {KEYS.map((k) => (
          <ListBox
            key={k}
            title={LIST_LABELS[k]}
            rows={listValues(state, k).map((v) => ({ id: v, label: v, products: state.products.filter((p) => FIELD[k](p)?.toLowerCase() === v.toLowerCase()) }))}
            q={q}
            edit={edit}
            onAdd={(v) => {
              const cur = listValues(state, k);
              if (cur.some((x) => x.toLowerCase() === v.trim().toLowerCase())) return toast(`« ${v.trim()} » est déjà dans la liste`);
              dispatch({ type: 'setList', key: k, values: [...cur, v.trim()] });
              toast(`« ${v.trim()} » ajouté : ${LIST_LABELS[k]}`);
            }}
            onRename={(r, v) => {
              if (v.trim() === r.label) return;
              const n = listUsage(state, k, r.label);
              dispatch({ type: 'renameListValue', key: k, from: r.label, to: v.trim() });
              toast(`« ${r.label} » → « ${v.trim()} »${n ? ` sur ${n} produit(s)` : ''}`);
            }}
            onRemove={(r) => dispatch({ type: 'setList', key: k, values: listValues(state, k).filter((x) => x !== r.label) })}
          />
        ))}
      </div>
    </>
  );
}
