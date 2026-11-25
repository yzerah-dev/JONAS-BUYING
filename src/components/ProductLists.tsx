import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ListChecks, Lock, Plus, X } from 'lucide-react';
import { canEditProduct, currentUser, LIST_LABELS, listUsage, listValues, useStore } from '../data/store';
import type { ListKey } from '../data/types';
import { brandFor } from '../lib/productSheet';
import { Pill } from './ui';
import { toast } from './ui-shared';

const KEYS: ListKey[] = ['rayon', 'collection', 'gender', 'material', 'sizes', 'packType'];

/** Paramètres : listes déroulantes de la fiche produit (marques, rayons, collections, genres, matières, tailles, types de pack) */
export default function ProductLists() {
  const { state, dispatch } = useStore();
  const edit = canEditProduct(currentUser(state));
  const [tab, setTab] = useState<'brands' | ListKey>('brands');
  const [value, setValue] = useState('');
  const [tagline, setTagline] = useState('');

  const add = () => {
    const v = value.trim();
    if (!v) return;
    if (tab === 'brands') {
      const b = brandFor(state.brands, v);
      if (state.brands.some((x) => x.id === b.id)) return toast(`La marque ${b.name} existe déjà`);
      dispatch({ type: 'setBrands', brands: [...state.brands, { ...b, tagline: tagline.trim().toUpperCase() }] });
      toast(`Marque ${b.name} ajoutée`);
    } else {
      const cur = listValues(state, tab);
      if (cur.some((x) => x.toLowerCase() === v.toLowerCase())) return toast(`« ${v} » est déjà dans la liste`);
      dispatch({ type: 'setList', key: tab, values: [...cur, v] });
      toast(`« ${v} » ajouté à la liste ${LIST_LABELS[tab]}`);
    }
    setValue('');
    setTagline('');
  };

  const brandUse = (id: string) => state.products.filter((p) => p.brandId === id).length;
  return (
    <div className="card pad mb">
      <div className="card-title">
        <ListChecks size={18} className="green" /> Listes de la fiche produit
        <div className="grow" />
        {!edit && (
          <Pill color="grey" icon={<Lock size={12} />}>
            Lecture seule – Pilote, Direction, acheteurs
          </Pill>
        )}
      </div>
      <p className="muted small">
        Valeurs proposées dans les listes déroulantes de la fiche produit. Une valeur utilisée par un produit ne peut pas être retirée.{' '}
        <Link to="/listes" className="green bold">
          Voir toutes les listes en grand (renommer, fusionner, produits concernés) →
        </Link>
      </p>
      <div className="seg-tabs row wrap" style={{ gap: 6, margin: '8px 0 12px' }} role="tablist">
        {(['brands', ...KEYS] as const).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`btn sm ${tab === k ? 'primary' : ''}`} onClick={() => setTab(k)}>
            {k === 'brands' ? 'Marques' : LIST_LABELS[k]}
          </button>
        ))}
      </div>
      {tab === 'brands' ? (
        <div className="lists-chips">
          {state.brands.length === 0 && <span className="muted small">Aucune marque : les produits sont en « JONAS ».</span>}
          {state.brands.map((b) => {
            const n = brandUse(b.id);
            return (
              <span key={b.id} className="list-chip">
                <b>{b.name}</b>
                {b.tagline && <small> {b.tagline}</small>}
                <small className="muted"> · {n} produit(s)</small>
                {edit && (
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Retirer la marque ${b.name}`}
                    disabled={n > 0}
                    title={n > 0 ? 'Utilisée par des produits' : 'Retirer'}
                    onClick={() => dispatch({ type: 'setBrands', brands: state.brands.filter((x) => x.id !== b.id) })}
                  >
                    <X size={13} />
                  </button>
                )}
              </span>
            );
          })}
        </div>
      ) : (
        <div className="lists-chips">
          {listValues(state, tab).map((v) => {
            const n = listUsage(state, tab, v);
            return (
              <span key={v} className="list-chip">
                {v}
                <small className="muted"> · {n}</small>
                {edit && (
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Retirer ${v}`}
                    disabled={n > 0}
                    title={n > 0 ? 'Utilisée par des produits' : 'Retirer'}
                    onClick={() => dispatch({ type: 'setList', key: tab, values: listValues(state, tab).filter((x) => x !== v) })}
                  >
                    <X size={13} />
                  </button>
                )}
              </span>
            );
          })}
        </div>
      )}
      {edit && (
        <form
          className="row wrap"
          style={{ gap: 8, marginTop: 12 }}
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <input
            className="input"
            style={{ maxWidth: 260 }}
            aria-label={tab === 'brands' ? 'Nouvelle marque' : `Nouvelle valeur : ${LIST_LABELS[tab]}`}
            placeholder={tab === 'brands' ? 'Nom de la marque' : 'Nouvelle valeur'}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          {tab === 'brands' && <input className="input" style={{ maxWidth: 180 }} aria-label="Signature de la marque" placeholder="Signature (ex. PARIS)" value={tagline} onChange={(e) => setTagline(e.target.value)} />}
          <button type="submit" className="btn">
            <Plus size={14} /> Ajouter
          </button>
        </form>
      )}
    </div>
  );
}
