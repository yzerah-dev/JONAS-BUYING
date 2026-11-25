import type { ReactNode } from 'react';
import { Boxes, FlaskConical, IdCard, Tags } from 'lucide-react';
import { brandOf, purchasePrice, useStore } from '../data/store';
import { DEV_STAGES, type Product } from '../data/types';
import { dec, fdate, money, num } from '../lib/format';
import { PackPill } from './ui';
import ProductEdit from './ProductEdit';

/** Valeur à compléter : vide, ou valeur d'attente posée à la création */
const missing = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && ['', 'à préciser', 'à définir'].includes(v.trim().toLowerCase()));

function Field({ label, value, big, wide, optional, hint }: { label: string; value: ReactNode; big?: boolean; wide?: boolean; optional?: boolean; hint?: ReactNode }) {
  const empty = missing(value);
  return (
    <div className={`pi-field ${wide ? 'wide' : ''}`}>
      <div className="pi-label">{label}</div>
      <div className={`pi-value ${big ? 'big' : ''}`}>{empty ? optional ? <span className="muted">—</span> : <span className="pi-todo">À compléter</span> : value}</div>
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

/** Onglet « Informations produit » : toute la fiche, en grand, avec ce qui reste à compléter */
export default function ProductInfoView({ product: p }: { product: Product }) {
  const { state } = useStore();
  const pa = purchasePrice(state, p.id);
  const supplier = state.suppliers.find((s) => s.id === p.supplierId);
  const brand = brandOf(state.brands, p.brandId);
  const perCtn = Math.floor(69 / p.cbmCarton);
  // Champs attendus (les tailles sont facultatives)
  const checks = [p.name, p.ref, p.ean, p.supplierRef, p.rayon, p.collection, p.gender, p.material, p.pack.type, p.pack.designer, p.nextAction];
  const todo = checks.filter(missing).length;
  const pct = Math.round(((checks.length - todo) / checks.length) * 100);

  return (
    <div className="pi-view">
      <div className="pi-head card pad">
        <div>
          <div className="pi-label">Fiche produit</div>
          <div className={`pi-complete ${todo ? 'warn' : 'ok'}`}>{todo ? `Fiche complète à ${pct} % — ${todo} champ(s) à compléter` : 'Fiche complète'}</div>
        </div>
        <div className="grow" />
        <ProductEdit product={p} />
      </div>

      <div className="pi-blocks">
        <Block title="Identification" icon={<IdCard size={20} />}>
          <Field label="Désignation" value={p.name} big wide />
          <Field label="Réf. JONAS" value={p.ref} big />
          <Field label="EAN" value={p.ean && <span className="mono">{p.ean}</span>} big />
          <Field label="Réf. fournisseur" value={p.supplierRef} big />
          <Field label="Fournisseur" value={supplier?.name} />
          <Field label="Marque" value={brand.tagline ? `${brand.name} ${brand.tagline}` : brand.name} />
        </Block>

        <Block title="Classement" icon={<Tags size={20} />}>
          <Field label="Rayon" value={p.rayon} big />
          <Field label="Collection" value={p.collection} big />
          <Field label="Genre" value={p.gender} big />
          <Field label="Matière" value={p.material} big />
          <Field label="Tailles" value={p.sizes} big optional />
        </Block>

        <Block title="Achat & conditionnement" icon={<Boxes size={20} />}>
          <Field label="PA unitaire" value={money(pa.price, pa.currency)} big hint={pa.from ? `d'après la proforma ${pa.from}` : p.paSupplier ? 'saisi sur la fiche' : 'PA en euros de la fiche'} />
          <Field label="PCB (pièces / carton)" value={num(p.pcb)} big />
          <Field label="Poids unitaire" value={`${dec(p.weight, 2)} kg`} big />
          <Field label="CBM carton" value={`${dec(p.cbmCarton, 3)} m³`} big />
          <Field label="Cartons / 40HC" value={num(perCtn)} />
          <Field label="Pièces / 40HC" value={num(perCtn * p.pcb)} />
        </Block>

        <Block title="Développement & pack" icon={<FlaskConical size={20} />}>
          <Field label="Étape de développement" value={`${p.devStage + 1} / ${DEV_STAGES.length} — ${DEV_STAGES[p.devStage]}`} big wide hint={p.developed ? 'Produit développé' : 'En développement'} />
          <Field label="Date limite développement" value={fdate(p.devDeadline)} big />
          <Field label="Quantité cible" value={num(p.targetQty)} big />
          <Field label="Prochaine action" value={p.nextAction} wide />
          <Field label="Type de pack" value={p.pack.type} big />
          <Field label="Designer" value={p.pack.designer} big />
          <Field label="Date limite artwork" value={fdate(p.pack.artworkDeadline)} />
          <Field label="État du pack" value={<PackPill product={p} />} />
        </Block>
      </div>
    </div>
  );
}
