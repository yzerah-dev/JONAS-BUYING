import { useState, type ReactNode } from 'react';
import { Boxes, FlaskConical, IdCard, Tags } from 'lucide-react';
import { brandOf, canEditProduct, currentUser, listValues, productPatchErrors, purchasePrice, useStore } from '../data/store';
import { DEV_STAGES, type Brand, type Currency, type Product, type ProductPatch } from '../data/types';
import { dec, fdate, money, num } from '../lib/format';
import { brandFor } from '../lib/productSheet';
import { PackPill } from './ui';
import { toast } from './ui-shared';

/** Valeur à compléter : vide, ou valeur d'attente posée à la création */
const missing = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && ['', 'à préciser', 'à définir'].includes(v.trim().toLowerCase()));
const NEW = '__autre__';
const toNum = (v: string) => Number(v.replace(',', '.').replace(/\s/g, ''));
const r4 = (n: number) => Math.round(n * 10000) / 10000;

interface Common {
  label: string;
  big?: boolean;
  wide?: boolean;
  optional?: boolean;
  hint?: ReactNode;
}

/** Champ en lecture seule */
function Field({ label, value, big, wide, optional, hint }: Common & { value: ReactNode }) {
  const empty = missing(value);
  return (
    <div className={`pi-field ${wide ? 'wide' : ''}`}>
      <div className="pi-label">{label}</div>
      <div className={`pi-value ${big ? 'big' : ''}`}>{empty ? optional ? <span className="muted">—</span> : <span className="pi-todo">À compléter</span> : value}</div>
      {hint && <div className="pi-hint">{hint}</div>}
    </div>
  );
}

/**
 * Champ modifiable sur place : texte, nombre ou date (enregistré en quittant le champ ou par Entrée, Échap annule),
 * liste déroulante (enregistrée au choix ; « Autre… » pour une nouvelle valeur).
 */
function Edit({
  id,
  label,
  value,
  kind = 'text',
  options = [],
  labels,
  allowNew = true,
  onSave,
  big,
  wide,
  optional,
  hint,
}: Common & {
  id: string;
  value: string;
  kind?: 'text' | 'num' | 'date' | 'list';
  options?: string[];
  /** Libellés affichés des options (sinon la valeur) */
  labels?: Record<string, string>;
  allowNew?: boolean;
  onSave: (v: string) => boolean;
}) {
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState(value);
  const [custom, setCustom] = useState(false);
  // Valeur changée ailleurs (autre utilisateur, import) : on la reprend
  if (value !== seen) {
    setSeen(value);
    setDraft(value);
  }
  const commit = (v: string) => {
    setCustom(false);
    if (v.trim() === value.trim()) return setDraft(value);
    if (!v.trim() && !optional) {
      toast(`${label} : valeur obligatoire`);
      return setDraft(value);
    }
    if (!onSave(v.trim())) setDraft(value);
  };
  const todo = missing(draft) && !optional;
  const cls = `input pi-input ${big ? 'big' : ''} ${todo ? 'todo' : ''}`;
  const keys = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
    if (e.key === 'Escape') {
      setDraft(value);
      setCustom(false);
    }
  };
  let control: ReactNode;
  if (kind === 'list' && !custom) {
    const opts = options.includes(draft) || !draft ? options : [draft, ...options];
    control = (
      <select
        id={id}
        className={cls}
        value={draft}
        onChange={(e) => {
          if (e.target.value === NEW) {
            setCustom(true);
            setDraft('');
          } else {
            setDraft(e.target.value);
            commit(e.target.value);
          }
        }}
      >
        {(!draft || optional) && <option value="">{optional ? '—' : 'À compléter'}</option>}
        {opts.map((o) => (
          <option key={o} value={o}>
            {labels?.[o] ?? o}
          </option>
        ))}
        {allowNew && <option value={NEW}>➕ Autre… (nouvelle valeur)</option>}
      </select>
    );
  } else {
    control = (
      <input
        id={id}
        className={cls}
        autoFocus={custom}
        type={kind === 'date' ? 'date' : 'text'}
        inputMode={kind === 'num' ? 'decimal' : undefined}
        placeholder={custom ? 'Nouvelle valeur' : optional ? '—' : 'À compléter'}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={keys}
      />
    );
  }
  return (
    <div className={`pi-field ${wide ? 'wide' : ''}`}>
      <label className="pi-label" htmlFor={id}>
        {label}
      </label>
      {control}
      {hint && <div className="pi-hint">{hint}</div>}
    </div>
  );
}

function Block({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="card pad pi-block" aria-label={title}>
      <h3 className="pi-title">
        {icon} {title}
      </h3>
      <div className="pi-grid">{children}</div>
    </section>
  );
}

/** Onglet « Informations produit » : toute la fiche en grand, modifiable directement (Pilote, Direction, acheteurs) */
export default function ProductInfoView({ product: p }: { product: Product }) {
  const { state, dispatch } = useStore();
  const edit = canEditProduct(currentUser(state));
  const pa = purchasePrice(state, p.id);
  const supplier = state.suppliers.find((s) => s.id === p.supplierId);
  const brand = brandOf(state.brands, p.brandId);
  const perCtn = Math.floor(69 / p.cbmCarton);
  const checks = [p.name, p.ref, p.ean, p.supplierRef, p.rayon, p.collection, p.gender, p.material, p.pack.type, p.pack.designer, p.nextAction];
  const todo = checks.filter(missing).length;
  const pct = Math.round(((checks.length - todo) / checks.length) * 100);
  const designers = state.users.filter((u) => u.role === 'designer' && u.designerName).map((u) => u.designerName!);

  /** Enregistre un champ ; refusé (réf. déjà prise, EAN invalide…) : message et valeur d'avant */
  const save = (label: string, patch: ProductPatch, brands: Brand[] = []) => {
    const items = [{ productId: p.id, patch }];
    const errs = productPatchErrors(state, items, brands);
    if (errs.length) {
      toast(errs[0]);
      return false;
    }
    dispatch({ type: 'updateProducts', items, brands, source: 'fiche' });
    toast(`${label} enregistré(e)`);
    return true;
  };
  const text = (k: 'name' | 'ref' | 'ean' | 'supplierRef' | 'nextAction' | 'devDeadline' | 'artworkDeadline', label: string) => (v: string) =>
    save(label, { [k]: k === 'ref' || k === 'supplierRef' ? v.toUpperCase() : k === 'ean' ? v.replace(/\s/g, '') : v });
  const list = (k: 'rayon' | 'collection' | 'gender' | 'material' | 'sizes' | 'packType' | 'designer', label: string) => (v: string) => save(label, { [k]: v });
  const number = (k: 'pcb' | 'weight' | 'cbmCarton' | 'targetQty', label: string) => (v: string) => {
    const n = toNum(v);
    if (!Number.isFinite(n)) {
      toast(`${label} : nombre illisible`);
      return false;
    }
    return save(label, { [k]: k === 'pcb' || k === 'targetQty' ? Math.round(n) : n });
  };

  const ro = !edit;
  return (
    <div className="pi-view">
      <div className="pi-head card pad">
        <div>
          <div className="pi-label">Fiche produit</div>
          <div className={`pi-complete ${todo ? 'warn' : 'ok'}`}>{todo ? `Fiche complète à ${pct} % — ${todo} champ(s) à compléter` : 'Fiche complète'}</div>
        </div>
        <div className="grow" />
        {edit && <span className="muted small">Cliquez sur un champ pour le modifier : il s'enregistre dès que vous le quittez.</span>}
      </div>

      <div className="pi-blocks">
        <Block title="Identification" icon={<IdCard size={20} />}>
          {ro ? <Field label="Désignation" value={p.name} big wide /> : <Edit id="pi-name" label="Désignation" value={p.name} onSave={text('name', 'Désignation')} big wide />}
          {ro ? <Field label="Réf. JONAS" value={p.ref} big /> : <Edit id="pi-ref" label="Réf. JONAS" value={p.ref} onSave={text('ref', 'Réf. JONAS')} big />}
          {ro ? <Field label="EAN" value={p.ean && <span className="mono">{p.ean}</span>} big /> : <Edit id="pi-ean" label="EAN" value={p.ean} onSave={text('ean', 'EAN')} big />}
          {ro ? <Field label="Réf. fournisseur" value={p.supplierRef} big /> : <Edit id="pi-supplierRef" label="Réf. fournisseur" value={p.supplierRef ?? ''} onSave={text('supplierRef', 'Réf. fournisseur')} big />}
          {ro ? (
            <Field label="Fournisseur" value={supplier?.name} />
          ) : (
            <Edit
              id="pi-supplier"
              label="Fournisseur"
              kind="list"
              allowNew={false}
              value={p.supplierId}
              options={state.suppliers.map((s) => s.id)}
              labels={Object.fromEntries(state.suppliers.map((s) => [s.id, s.name]))}
              onSave={(v) => save('Fournisseur', { supplierId: v })}
            />
          )}
          {ro ? (
            <Field label="Marque" value={brand.tagline ? `${brand.name} ${brand.tagline}` : brand.name} />
          ) : (
            <Edit
              id="pi-brand"
              label="Marque"
              kind="list"
              value={brand.name}
              options={[...new Set(['JONAS', ...state.brands.map((b) => b.name)])]}
              onSave={(v) => {
                const b = brandFor(state.brands, v);
                return save('Marque', { brandId: b.id }, state.brands.some((x) => x.id === b.id) || b.id === 'jonas' ? [] : [b]);
              }}
            />
          )}
        </Block>

        <Block title="Classement" icon={<Tags size={20} />}>
          {(
            [
              ['rayon', 'Rayon', p.rayon],
              ['collection', 'Collection', p.collection],
              ['gender', 'Genre', p.gender],
              ['material', 'Matière', p.material],
              ['sizes', 'Tailles', p.sizes ?? ''],
            ] as const
          ).map(([k, label, v]) =>
            ro ? (
              <Field key={k} label={label} value={v} big optional={k === 'sizes'} />
            ) : (
              <Edit key={k} id={`pi-${k}`} label={label} kind="list" value={v} options={listValues(state, k)} onSave={list(k, label)} big optional={k === 'sizes'} />
            ),
          )}
        </Block>

        <Block title="Achat & conditionnement" icon={<Boxes size={20} />}>
          {ro ? (
            <Field label="PA unitaire" value={money(pa.price, pa.currency)} big hint={pa.from ? `d'après la proforma ${pa.from}` : p.paSupplier ? 'saisi sur la fiche' : 'PA en euros de la fiche'} />
          ) : (
            <div className="pi-field">
              <div className="row" style={{ gap: 6, alignItems: 'flex-end' }}>
                <div className="grow">
                  <Edit
                    id="pi-pa"
                    label="PA unitaire"
                    kind="num"
                    value={String(r4(pa.price))}
                    onSave={(v) => {
                      const n = toNum(v);
                      if (!(n >= 0)) {
                        toast('PA : nombre illisible');
                        return false;
                      }
                      return save('PA', { paSupplier: { price: n, currency: pa.currency } });
                    }}
                    big
                  />
                </div>
                <div style={{ width: 92 }}>
                  <Edit id="pi-currency" label="Devise" kind="list" allowNew={false} value={pa.currency} options={['EUR', 'USD', 'CNY']} onSave={(v) => save('Devise', { paSupplier: { price: r4(pa.price), currency: v as Currency } })} big />
                </div>
              </div>
              <div className="pi-hint">{pa.from ? `d'après la proforma ${pa.from}` : p.paSupplier ? 'saisi sur la fiche' : 'PA en euros de la fiche'}</div>
            </div>
          )}
          {ro ? <Field label="PCB (pièces / carton)" value={num(p.pcb)} big /> : <Edit id="pi-pcb" label="PCB (pièces / carton)" kind="num" value={String(p.pcb)} onSave={number('pcb', 'PCB')} big />}
          {ro ? <Field label="Poids unitaire" value={`${dec(p.weight, 2)} kg`} big /> : <Edit id="pi-weight" label="Poids unitaire (kg)" kind="num" value={String(p.weight)} onSave={number('weight', 'Poids unitaire')} big />}
          {ro ? <Field label="CBM carton" value={`${dec(p.cbmCarton, 3)} m³`} big /> : <Edit id="pi-cbm" label="CBM carton (m³)" kind="num" value={String(p.cbmCarton)} onSave={number('cbmCarton', 'CBM carton')} big />}
          <Field label="Cartons / 40HC" value={num(perCtn)} hint="calculé" />
          <Field label="Pièces / 40HC" value={num(perCtn * p.pcb)} hint="calculé" />
        </Block>

        <Block title="Développement & pack" icon={<FlaskConical size={20} />}>
          {ro ? (
            <Field label="Étape de développement" value={`${p.devStage + 1} / ${DEV_STAGES.length} — ${DEV_STAGES[p.devStage]}`} big wide hint={p.developed ? 'Produit développé' : 'En développement'} />
          ) : (
            <Edit
              id="pi-devStage"
              label="Étape de développement"
              kind="list"
              allowNew={false}
              value={String(p.devStage)}
              options={DEV_STAGES.map((_, i) => String(i))}
              labels={Object.fromEntries(DEV_STAGES.map((st, i) => [String(i), `${i + 1} / ${DEV_STAGES.length} — ${st}`]))}
              onSave={(v) => save('Étape de développement', { devStage: Number(v) })}
              big
              wide
              hint={p.developed ? 'Produit développé' : 'En développement'}
            />
          )}
          {ro ? <Field label="Date limite développement" value={fdate(p.devDeadline)} big /> : <Edit id="pi-devDeadline" label="Date limite développement" kind="date" value={p.devDeadline} onSave={text('devDeadline', 'Date limite développement')} big />}
          {ro ? <Field label="Quantité cible" value={num(p.targetQty)} big /> : <Edit id="pi-targetQty" label="Quantité cible" kind="num" value={String(p.targetQty)} onSave={number('targetQty', 'Quantité cible')} big />}
          {ro ? <Field label="Prochaine action" value={p.nextAction} wide /> : <Edit id="pi-nextAction" label="Prochaine action" value={p.nextAction} onSave={text('nextAction', 'Prochaine action')} wide />}
          {ro ? <Field label="Type de pack" value={p.pack.type} big /> : <Edit id="pi-packType" label="Type de pack" kind="list" value={p.pack.type} options={listValues(state, 'packType')} onSave={list('packType', 'Type de pack')} big />}
          {ro ? <Field label="Designer" value={p.pack.designer} big /> : <Edit id="pi-designer" label="Designer" kind="list" allowNew={false} value={p.pack.designer} options={designers} onSave={list('designer', 'Designer')} big />}
          {ro ? <Field label="Date limite artwork" value={fdate(p.pack.artworkDeadline)} /> : <Edit id="pi-artworkDeadline" label="Date limite artwork" kind="date" value={p.pack.artworkDeadline} onSave={text('artworkDeadline', 'Date limite artwork')} />}
          <Field label="État du pack" value={<PackPill product={p} />} />
        </Block>
      </div>
    </div>
  );
}
