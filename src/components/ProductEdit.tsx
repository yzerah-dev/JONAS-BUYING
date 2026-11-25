import { useState } from 'react';
import { Pencil, Save, X } from 'lucide-react';
import { canEditProduct, currentUser, listValues, productPatchErrors, purchasePrice, useStore } from '../data/store';
import { DEV_STAGES, type Brand, type Currency, type Product, type ProductPatch } from '../data/types';
import { toast } from './ui-shared';
import { brandFor } from '../lib/productSheet';
import ListSelect from './ListSelect';

type Key =
  | 'ref'
  | 'ean'
  | 'supplierRef'
  | 'name'
  | 'brand'
  | 'supplierId'
  | 'rayon'
  | 'collection'
  | 'gender'
  | 'material'
  | 'sizes'
  | 'pa'
  | 'currency'
  | 'pcb'
  | 'weight'
  | 'cbmCarton'
  | 'packType'
  | 'designer'
  | 'artworkDeadline'
  | 'devStage'
  | 'devDeadline'
  | 'nextAction'
  | 'targetQty';
type Form = Record<Key, string>;

const num = (v: string) => Number(v.replace(',', '.').replace(/\s/g, ''));
/** PA à 4 décimales au plus (les petits articles se négocient au dixième de centime) */
const r4 = (n: number) => Math.round(n * 10000) / 10000;

/** Bouton « Modifier la fiche » et formulaire complet : Pilote, Direction et acheteurs */
export default function ProductEdit({ product: p }: { product: Product }) {
  const { state, dispatch } = useStore();
  const [f, setF] = useState<Form | null>(null);
  if (!canEditProduct(currentUser(state))) return null;
  const brandName = (id: string) => state.brands.find((b) => b.id === id)?.name ?? (id === 'jonas' ? 'JONAS' : id.toUpperCase());
  const designers = state.users.filter((u) => u.role === 'designer' && u.designerName).map((u) => u.designerName!);
  const open = () => {
    const pa = purchasePrice(state, p.id);
    setF({
      ref: p.ref,
      ean: p.ean,
      supplierRef: p.supplierRef ?? '',
      name: p.name,
      brand: brandName(p.brandId),
      supplierId: p.supplierId,
      rayon: p.rayon,
      collection: p.collection,
      gender: p.gender,
      material: p.material,
      sizes: p.sizes ?? '',
      pa: String(r4(pa.price)),
      currency: pa.currency,
      pcb: String(p.pcb),
      weight: String(p.weight),
      cbmCarton: String(p.cbmCarton),
      packType: p.pack.type,
      designer: p.pack.designer,
      artworkDeadline: p.pack.artworkDeadline,
      devStage: String(p.devStage),
      devDeadline: p.devDeadline,
      nextAction: p.nextAction,
      targetQty: String(p.targetQty),
    });
  };
  const save = () => {
    if (!f) return;
    const patch: ProductPatch = {};
    const txt = (k: 'ref' | 'ean' | 'supplierRef' | 'name' | 'rayon' | 'collection' | 'gender' | 'material' | 'sizes' | 'packType' | 'designer' | 'artworkDeadline' | 'devDeadline' | 'nextAction', v: string, cur: string | undefined) => {
      const x = k === 'ref' || k === 'supplierRef' ? v.trim().toUpperCase() : v.trim();
      if (x !== (cur ?? '')) patch[k] = x;
    };
    txt('ref', f.ref, p.ref);
    txt('ean', f.ean.replace(/\s/g, ''), p.ean);
    txt('supplierRef', f.supplierRef, p.supplierRef);
    txt('name', f.name, p.name);
    txt('rayon', f.rayon, p.rayon);
    txt('collection', f.collection, p.collection);
    txt('gender', f.gender, p.gender);
    txt('material', f.material, p.material);
    txt('sizes', f.sizes, p.sizes);
    txt('packType', f.packType, p.pack.type);
    txt('designer', f.designer, p.pack.designer);
    txt('artworkDeadline', f.artworkDeadline, p.pack.artworkDeadline);
    txt('devDeadline', f.devDeadline, p.devDeadline);
    txt('nextAction', f.nextAction, p.nextAction);
    if (f.supplierId !== p.supplierId) patch.supplierId = f.supplierId;
    const brands: Brand[] = [];
    if (f.brand.trim() && f.brand.trim().toLowerCase() !== brandName(p.brandId).toLowerCase()) {
      const b = brandFor(state.brands, f.brand);
      if (!state.brands.some((x) => x.id === b.id)) brands.push(b);
      patch.brandId = b.id;
    }
    const pa = purchasePrice(state, p.id);
    if (num(f.pa) !== r4(pa.price) || f.currency !== pa.currency) patch.paSupplier = { price: num(f.pa), currency: f.currency as Currency };
    if (num(f.pcb) !== p.pcb) patch.pcb = num(f.pcb);
    if (num(f.weight) !== p.weight) patch.weight = num(f.weight);
    if (num(f.cbmCarton) !== p.cbmCarton) patch.cbmCarton = num(f.cbmCarton);
    if (Number(f.devStage) !== p.devStage) patch.devStage = Number(f.devStage);
    if (num(f.targetQty) !== p.targetQty) patch.targetQty = num(f.targetQty);
    if (!Object.keys(patch).length) return setF(null);
    const items = [{ productId: p.id, patch }];
    const errs = productPatchErrors(state, items, brands);
    if (errs.length) return toast(errs[0]);
    dispatch({ type: 'updateProducts', items, brands, source: 'fiche' });
    toast(`Fiche ${patch.ref ?? p.ref} enregistrée`);
    setF(null);
  };
  const set = (k: Key) => (v: string) => setF({ ...f!, [k]: v });
  const input = (k: Key, label: string, opts: { type?: 'num' | 'date'; wide?: boolean } = {}) => (
    <label htmlFor={`pe-${k}`} className={opts.wide ? 'bk-wide' : ''}>
      {label}
      <input id={`pe-${k}`} className="input" type={opts.type === 'date' ? 'date' : 'text'} inputMode={opts.type === 'num' ? 'decimal' : undefined} value={f![k]} onChange={(e) => set(k)(e.target.value)} />
    </label>
  );
  const list = (k: Key, label: string, options: string[], extra: { allowNew?: boolean; empty?: string } = {}) => (
    <label htmlFor={`pe-${k}`}>
      {label}
      <ListSelect id={`pe-${k}`} value={f![k]} options={options} onChange={set(k)} {...extra} />
    </label>
  );
  return (
    <>
      <button type="button" className="btn sm" onClick={open}>
        <Pencil size={14} /> Modifier la fiche
      </button>
      {f && (
        <div className="palette-back" onMouseDown={() => setF(null)}>
          <form
            className="card rc-dialog bk-dialog np-dialog"
            role="dialog"
            aria-label={`Modifier la fiche ${p.ref}`}
            onMouseDown={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <header className="rc-head">
              <div>
                <h2>Modifier la fiche {p.ref}</h2>
                <span className="muted small">Listes : choisissez une valeur, ou « Autre… » pour en ajouter une. Les listes se gèrent aussi dans Paramètres.</span>
              </div>
              <button type="button" className="icon-btn" onClick={() => setF(null)} aria-label="Fermer">
                <X size={20} />
              </button>
            </header>
            <div className="bk-form">
              <h3 className="bk-wide pe-section">Produit</h3>
              {input('name', 'Désignation', { wide: true })}
              {input('ref', 'Réf. interne')}
              {input('ean', 'EAN')}
              {input('supplierRef', 'Réf. fournisseur')}
              {list('brand', 'Marque', [...new Set(['JONAS', ...state.brands.map((b) => b.name), f.brand].filter(Boolean))])}
              <label htmlFor="pe-supplierId">
                Fournisseur
                <select id="pe-supplierId" className="input" value={f.supplierId} onChange={(e) => set('supplierId')(e.target.value)}>
                  {state.suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              {list('rayon', 'Rayon', listValues(state, 'rayon'))}
              {list('collection', 'Collection', listValues(state, 'collection'))}
              {list('gender', 'Genre', listValues(state, 'gender'))}
              {list('material', 'Matière', listValues(state, 'material'))}
              {list('sizes', 'Tailles', listValues(state, 'sizes'), { empty: '— Sans taille —' })}

              <h3 className="bk-wide pe-section">Prix & conditionnement</h3>
              <div className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
                {input('pa', 'PA unitaire', { type: 'num' })}
                {list('currency', 'Devise', ['EUR', 'USD', 'CNY'], { allowNew: false })}
              </div>
              {input('pcb', 'PCB (pièces / carton)', { type: 'num' })}
              {input('weight', 'Poids unitaire (kg)', { type: 'num' })}
              {input('cbmCarton', 'CBM carton (m³)', { type: 'num' })}

              <h3 className="bk-wide pe-section">Développement & pack</h3>
              <label htmlFor="pe-devStage">
                Étape de développement
                <select id="pe-devStage" className="input" value={f.devStage} onChange={(e) => set('devStage')(e.target.value)}>
                  {DEV_STAGES.map((st, i) => (
                    <option key={st} value={i}>
                      {i + 1}. {st}
                    </option>
                  ))}
                </select>
              </label>
              {input('devDeadline', 'Date limite développement', { type: 'date' })}
              {input('nextAction', 'Prochaine action')}
              {input('targetQty', 'Quantité cible', { type: 'num' })}
              {list('packType', 'Type de pack', listValues(state, 'packType'))}
              {list('designer', 'Designer', [...new Set([...designers, f.designer].filter(Boolean))], { allowNew: false })}
              {input('artworkDeadline', 'Date limite artwork', { type: 'date' })}
            </div>
            <footer className="rc-foot">
              <span />
              <button type="button" className="btn" onClick={() => setF(null)}>
                Annuler
              </button>
              <button type="submit" className="btn primary">
                <Save size={16} /> Enregistrer
              </button>
            </footer>
          </form>
        </div>
      )}
    </>
  );
}
