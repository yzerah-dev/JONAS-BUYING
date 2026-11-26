import { useState } from 'react';
import { Languages, Pencil, Save, Sparkles, X } from 'lucide-react';
import { frenchTexts } from '../lib/frTexts';
import { frenchPatch } from '../lib/frPatch';
import { useAuth, useStore } from '../data/store';
import type { Product } from '../data/types';
import { toast } from './ui-shared';

/**
 * Désignation et description du produit.
 * Anglais : texte du fournisseur, conservé tel quel. Français : description retravaillée par JONAS.
 */
export default function ProductDescription({ product: p }: { product: Product }) {
  const { dispatch } = useStore();
  const { allowed } = useAuth();
  const [edit, setEdit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(p.name);
  const [en, setEn] = useState(p.description?.en ?? '');
  const [fr, setFr] = useState(p.description?.fr ?? '');
  const canEdit = allowed({ type: 'setProductText', productId: p.id, name: p.name || 'x', description: {} });
  const start = () => {
    setName(p.name);
    setEn(p.description?.en ?? '');
    setFr(p.description?.fr ?? '');
    setEdit(true);
  };
  /** Claude rédige la désignation et la description françaises depuis le texte anglais */
  const generate = async () => {
    const source = p.description?.en?.trim() || p.name;
    setBusy(true);
    try {
      const res = await frenchTexts([{ id: p.id, en: source }]);
      if (res === 'not_configured') return toast('Traduction automatique pas encore activée : la clé Claude (ANTHROPIC_API_KEY) doit être ajoutée dans Vercel.');
      if (typeof res === 'string' || !res.length) return toast('Français non généré : réessayez dans un instant.');
      dispatch(frenchPatch({ ...p, description: { ...p.description, en: source } }, res[0]));
      toast(`Français généré pour ${p.ref}`);
    } finally {
      setBusy(false);
    }
  };
  const save = () => {
    if (!name.trim()) return toast('La désignation est obligatoire');
    dispatch({ type: 'setProductText', productId: p.id, name, description: { en, fr } });
    toast(`Désignation et description enregistrées pour ${p.ref}`);
    setEdit(false);
  };
  return (
    <section className="card pad desc-card">
      <div className="row" style={{ marginBottom: 10 }}>
        <Languages size={18} className="green" />
        <h3 style={{ margin: 0 }}>Description</h3>
        <div className="grow" />
        {canEdit && !edit && (p.description?.en || p.name) && (
          <button type="button" className="btn sm" onClick={generate} disabled={busy} title="Désignation courte et description longue en français, rédigées par Claude depuis le texte anglais">
            <Sparkles size={14} /> {busy ? 'Rédaction…' : p.description?.fr ? 'Refaire le français' : 'Générer le français'}
          </button>
        )}
        {canEdit && !edit && (
          <button type="button" className="btn sm" onClick={start}>
            <Pencil size={14} /> Modifier
          </button>
        )}
      </div>
      {edit ? (
        <div className="desc-form">
          <label htmlFor="pd-name">
            Désignation (français, courte)
            <input id="pd-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <div className="desc-cols">
            <label htmlFor="pd-fr">
              Français — description JONAS
              <textarea id="pd-fr" className="input" rows={6} value={fr} onChange={(e) => setFr(e.target.value)} />
            </label>
            <label htmlFor="pd-en">
              Anglais — texte du fournisseur (tel quel)
              <textarea id="pd-en" className="input" rows={6} value={en} onChange={(e) => setEn(e.target.value)} />
            </label>
          </div>
          <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="btn" onClick={() => setEdit(false)}>
              <X size={14} /> Annuler
            </button>
            <button type="button" className="btn primary" onClick={save}>
              <Save size={14} /> Enregistrer
            </button>
          </div>
        </div>
      ) : (
        <div className="desc-cols">
          <div>
            <div className="desc-lang">🇫🇷 Français</div>
            {p.description?.fr ? <p className="desc-text">{p.description.fr}</p> : <p className="muted small">À rédiger.</p>}
          </div>
          <div>
            <div className="desc-lang">🇬🇧 Anglais — fournisseur</div>
            {p.description?.en ? <p className="desc-text">{p.description.en}</p> : <p className="muted small">—</p>}
          </div>
        </div>
      )}
    </section>
  );
}
