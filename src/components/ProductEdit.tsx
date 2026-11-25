import { useState } from 'react';
import { Pencil, Save, X } from 'lucide-react';
import { canEditProduct, currentUser, productPatchErrors, purchasePrice, useStore } from '../data/store';
import type { Brand, Currency, Product, ProductPatch } from '../data/types';
import { toast } from './ui-shared';
import { brandFor, distinct } from '../lib/productSheet';

type Form = Record<'ref' | 'ean' | 'supplierRef' | 'name' | 'brand' | 'supplierId' | 'rayon' | 'collection' | 'gender' | 'material' | 'sizes' | 'pa' | 'currency' | 'pcb' | 'weight' | 'cbmCarton', string>;

const num = (v: string) => Number(v.replace(',', '.').replace(/\s/g, ''));
/** PA à 4 décimales au plus (les petits articles se négocient au dixième de centime) */
const r4 = (n: number) => Math.round(n * 10000) / 10000;

/** Bouton « Modifier la fiche » et formulaire : Pilote, Direction et acheteurs */
export default function ProductEdit({ product: p }: { product: Product }) {
  const { state, dispatch } = useStore();
  const [f, setF] = useState<Form | null>(null);
  if (!canEditProduct(currentUser(state))) return null;
  const brandName = (id: string) => state.brands.find((b) => b.id === id)?.name ?? (id === 'jonas' ? 'JONAS' : id.toUpperCase());
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
    });
  };
  const save = () => {
    if (!f) return;
    const patch: ProductPatch = {};
    const txt = (k: 'ref' | 'ean' | 'supplierRef' | 'name' | 'rayon' | 'collection' | 'gender' | 'material' | 'sizes', v: string, cur: string | undefined) => {
      if (v.trim() !== (cur ?? '')) patch[k] = k === 'ref' || k === 'supplierRef' ? v.trim().toUpperCase() : v.trim();
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
    if (!Object.keys(patch).length) return setF(null);
    const items = [{ productId: p.id, patch }];
    const errs = productPatchErrors(state, items, brands);
    if (errs.length) return toast(errs[0]);
    dispatch({ type: 'updateProducts', items, brands, source: 'fiche' });
    toast(`Fiche ${patch.ref ?? p.ref} enregistrée`);
    setF(null);
  };
  const field = (k: keyof Form, label: string, opts: { list?: string[]; type?: string; wide?: boolean } = {}) => (
    <label htmlFor={`pe-${k}`} className={opts.wide ? 'bk-wide' : ''}>
      {label}
      <input id={`pe-${k}`} className="input" inputMode={opts.type === 'num' ? 'decimal' : undefined} list={opts.list ? `pe-${k}-list` : undefined} value={f![k]} onChange={(e) => setF({ ...f!, [k]: e.target.value })} />
      {opts.list && (
        <datalist id={`pe-${k}-list`}>
          {opts.list.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
      )}
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
                <span className="muted small">Le PA est saisi dans la devise du fournisseur, tel que sur sa proforma.</span>
              </div>
              <button type="button" className="icon-btn" onClick={() => setF(null)} aria-label="Fermer">
                <X size={20} />
              </button>
            </header>
            <div className="bk-form">
              {field('name', 'Désignation', { wide: true })}
              {field('ref', 'Réf. interne')}
              {field('ean', 'EAN')}
              {field('supplierRef', 'Réf. fournisseur')}
              {field('brand', 'Marque (choisir ou saisir une nouvelle)', { list: [...state.brands.map((b) => b.name), 'JONAS'].filter((v, i, a) => a.indexOf(v) === i) })}
              <label htmlFor="pe-supplierId">
                Fournisseur
                <select id="pe-supplierId" className="input" value={f.supplierId} onChange={(e) => setF({ ...f, supplierId: e.target.value })}>
                  {state.suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              {field('rayon', 'Rayon', { list: distinct(state.products.map((x) => x.rayon)) })}
              {field('collection', 'Collection', { list: distinct(state.products.map((x) => x.collection)) })}
              {field('gender', 'Genre', { list: distinct(['Femme', 'Homme', 'Mixte', 'Enfant', ...state.products.map((x) => x.gender)]) })}
              {field('material', 'Matière', { list: distinct(state.products.map((x) => x.material)) })}
              {field('sizes', 'Tailles')}
              <div className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
                {field('pa', 'PA unitaire', { type: 'num' })}
                <label htmlFor="pe-currency">
                  Devise
                  <select id="pe-currency" className="input" value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })}>
                    {['EUR', 'USD', 'CNY'].map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
              </div>
              {field('pcb', 'PCB (pièces / carton)', { type: 'num' })}
              {field('weight', 'Poids unitaire (kg)', { type: 'num' })}
              {field('cbmCarton', 'CBM carton (m³)', { type: 'num' })}
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
