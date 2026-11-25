// Fiches produit en Excel : export (tableau prêt à modifier) et import (mise à jour des fiches).
// Une ligne = un produit, retrouvé par sa réf. JONAS (ou, si la réf. change, par son EAN).
// Une cellule vide ne change rien.
import type { State } from '../data/store';
import type { Brand, Currency, Product, ProductPatch } from '../data/types';

export const distinct = (vs: (string | undefined)[]) => [...new Set(vs.map((v) => (v ?? '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Marque d'après son nom : existante (sans tenir compte de la casse), sinon nouvelle */
export function brandFor(brands: Brand[], name: string): Brand {
  const n = name.trim();
  const found = brands.find((b) => b.name.toLowerCase() === n.toLowerCase() || b.id === slug(n));
  if (found) return found;
  if (n.toLowerCase() === 'jonas') return { id: 'jonas', name: 'JONAS', tagline: '' };
  return { id: slug(n) || 'marque', name: n.toUpperCase(), tagline: '' };
}

/** Colonnes de l'Excel, dans l'ordre ; `aliases` : autres libellés acceptés à l'import */
const COLS = [
  { key: 'ref', label: 'Réf. JONAS', aliases: ['ref', 'reference', 'ref interne', 'ref jonas', 'reference jonas'] },
  { key: 'ean', label: 'EAN', aliases: ['ean', 'ean13', 'code barre', 'gencod', 'barcode'] },
  { key: 'supplierRef', label: 'Réf. fournisseur', aliases: ['ref fournisseur', 'reference fournisseur', 'supplier ref', 'item no'] },
  { key: 'name', label: 'Désignation', aliases: ['designation', 'libelle', 'nom'] },
  { key: 'brand', label: 'Marque', aliases: ['marque', 'brand'] },
  { key: 'supplier', label: 'Fournisseur', aliases: ['fournisseur', 'supplier'] },
  { key: 'rayon', label: 'Rayon', aliases: ['rayon'] },
  { key: 'collection', label: 'Collection', aliases: ['collection'] },
  { key: 'gender', label: 'Genre', aliases: ['genre'] },
  { key: 'material', label: 'Matière', aliases: ['matiere', 'material'] },
  { key: 'sizes', label: 'Tailles', aliases: ['tailles', 'taille', 'sizes'] },
  { key: 'pa', label: 'PA', aliases: ['pa', 'pa unitaire', 'prix achat', 'prix d achat', 'unit price'] },
  { key: 'currency', label: 'Devise', aliases: ['devise', 'currency'] },
  { key: 'pcb', label: 'PCB', aliases: ['pcb', 'colisage', 'pcs carton'] },
  { key: 'weight', label: 'Poids unitaire (kg)', aliases: ['poids', 'poids unitaire', 'poids unitaire kg', 'weight'] },
  { key: 'cbmCarton', label: 'CBM carton', aliases: ['cbm carton', 'cbm', 'm3 carton', 'volume carton'] },
  { key: 'packType', label: 'Type de pack', aliases: ['type de pack', 'pack', 'emballage', 'packing'] },
  { key: 'designer', label: 'Designer', aliases: ['designer'] },
  { key: 'targetQty', label: 'Quantité cible', aliases: ['quantite cible', 'qte cible', 'target qty'] },
  { key: 'nextAction', label: 'Prochaine action', aliases: ['prochaine action', 'next action'] },
  { key: 'descFr', label: 'Description FR', aliases: ['description fr', 'description francais', 'description'] },
  { key: 'descEn', label: 'Description EN', aliases: ['description en', 'description anglais'] },
] as const;
type Key = (typeof COLS)[number]['key'];

const norm = (s: unknown) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Tableau Excel des fiches (avec le PA dans la devise du fournisseur) */
export async function exportProducts(products: Product[], s: State, pa: (id: string) => { price: number; currency: Currency }): Promise<Blob> {
  const XLSX = await import('xlsx');
  const brand = (id: string) => s.brands.find((b) => b.id === id)?.name ?? (id === 'jonas' ? 'JONAS' : id.toUpperCase());
  const rows = products.map((p) => {
    const price = pa(p.id);
    const v: Record<Key, string | number> = {
      ref: p.ref,
      ean: p.ean,
      supplierRef: p.supplierRef ?? '',
      name: p.name,
      brand: brand(p.brandId),
      supplier: s.suppliers.find((x) => x.id === p.supplierId)?.name ?? p.supplierId,
      rayon: p.rayon,
      collection: p.collection,
      gender: p.gender,
      material: p.material,
      sizes: p.sizes ?? '',
      pa: Math.round(price.price * 10000) / 10000,
      currency: price.currency,
      pcb: p.pcb,
      weight: p.weight,
      cbmCarton: p.cbmCarton,
      packType: p.pack.type,
      designer: p.pack.designer,
      targetQty: p.targetQty,
      nextAction: p.nextAction,
      descFr: p.description?.fr ?? '',
      descEn: p.description?.en ?? '',
    };
    return COLS.map((c) => v[c.key]);
  });
  const ws = XLSX.utils.aoa_to_sheet([COLS.map((c) => c.label), ...rows]);
  // EAN en texte (sinon Excel l'affiche en notation scientifique)
  rows.forEach((_, i) => {
    const cell = ws[XLSX.utils.encode_cell({ r: i + 1, c: 1 })];
    if (cell) cell.t = 's';
  });
  ws['!cols'] = COLS.map((c) => ({ wch: c.key === 'name' || c.key.startsWith('desc') ? 50 : c.key === 'ean' ? 15 : 14 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Fiches produit');
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export interface SheetUpdate {
  items: { productId: string; patch: ProductPatch }[];
  brands: Brand[];
  /** Lignes sans produit correspondant */
  notFound: string[];
  /** Lignes illisibles (devise, fournisseur, nombre…) */
  problems: string[];
  /** Produits inchangés */
  unchanged: number;
}

const toNum = (v: unknown) => (typeof v === 'number' ? v : Number(String(v ?? '').replace(/\s/g, '').replace(',', '.')));
const cellText = (v: unknown) => (typeof v === 'number' ? String(v) : String(v ?? '')).trim();

/** Lit un Excel de fiches et calcule les modifications à appliquer (sans rien enregistrer) */
export async function readProductSheet(file: Blob, s: State, pa: (id: string) => { price: number; currency: Currency }): Promise<SheetUpdate> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' });
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' });
  const out: SheetUpdate = { items: [], brands: [], notFound: [], problems: [], unchanged: 0 };
  // Ligne d'en-têtes : celle où l'on trouve la réf. ou l'EAN
  const h = rows.findIndex((r) => r.some((c) => ['ref jonas', 'ref', 'reference', 'ean'].includes(norm(c))));
  if (h < 0) {
    out.problems.push('En-têtes introuvables : la première ligne doit contenir « Réf. JONAS » ou « EAN »');
    return out;
  }
  const col = new Map<Key, number>();
  rows[h].forEach((c, i) => {
    const n = norm(c);
    const def = COLS.find((d) => norm(d.label) === n) ?? COLS.find((d) => (d.aliases as readonly string[]).includes(n));
    if (def && !col.has(def.key)) col.set(def.key, i);
  });
  const brands: Brand[] = [...s.brands];
  for (const [i, r] of rows.slice(h + 1).entries()) {
    const get = (k: Key) => (col.has(k) ? r[col.get(k)!] : '');
    const ref = cellText(get('ref')).toUpperCase();
    const ean = cellText(get('ean')).replace(/\D/g, '');
    if (!ref && !ean) continue;
    const line = `Ligne ${h + i + 2}`;
    const key = (x: string) => x.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const p = s.products.find((x) => ref && key(x.ref) === key(ref)) ?? s.products.find((x) => ean && x.ean === ean);
    if (!p) {
      out.notFound.push(`${line} : ${ref || ean}`);
      continue;
    }
    const patch: ProductPatch = {};
    const text = (k: 'supplierRef' | 'name' | 'rayon' | 'collection' | 'gender' | 'material' | 'sizes', cur: string | undefined, upper = false) => {
      const v = cellText(get(k));
      if (v && (upper ? v.toUpperCase() : v) !== (cur ?? '')) patch[k] = upper ? v.toUpperCase() : v;
    };
    if (ref && key(ref) !== key(p.ref)) patch.ref = ref;
    if (ean && ean !== p.ean) patch.ean = ean;
    text('supplierRef', p.supplierRef, true);
    text('name', p.name);
    text('rayon', p.rayon);
    text('collection', p.collection);
    text('gender', p.gender);
    text('material', p.material);
    text('sizes', p.sizes);
    const bName = cellText(get('brand'));
    if (bName) {
      const b = brandFor(brands, bName);
      if (b.id !== p.brandId) {
        if (!brands.some((x) => x.id === b.id)) {
          brands.push(b);
          out.brands.push(b);
        }
        patch.brandId = b.id;
      }
    }
    const sup = cellText(get('supplier'));
    if (sup) {
      const found = s.suppliers.find((x) => [x.id, x.name, x.shortName].some((v) => norm(v) === norm(sup)));
      if (!found) out.problems.push(`${line} (${p.ref}) : fournisseur « ${sup} » inconnu`);
      else if (found.id !== p.supplierId) patch.supplierId = found.id;
    }
    const cur = pa(p.id);
    const paCell = cellText(get('pa'));
    const devCell = cellText(get('currency')).toUpperCase().replace('€', 'EUR').replace('$', 'USD').replace('RMB', 'CNY');
    if (devCell && !['EUR', 'USD', 'CNY'].includes(devCell)) out.problems.push(`${line} (${p.ref}) : devise « ${devCell} » inconnue (EUR, USD ou CNY)`);
    else if (paCell || devCell) {
      const price = paCell ? toNum(paCell) : cur.price;
      const currency = (devCell || cur.currency) as Currency;
      if (!(price >= 0)) out.problems.push(`${line} (${p.ref}) : PA « ${paCell} » illisible`);
      else if (price !== Math.round(cur.price * 10000) / 10000 || currency !== cur.currency) patch.paSupplier = { price, currency };
    }
    const packType = cellText(get('packType'));
    if (packType && packType !== p.pack.type) patch.packType = packType;
    const designer = cellText(get('designer'));
    if (designer) {
      const d = s.users.find((x) => x.role === 'designer' && x.designerName && norm(x.designerName) === norm(designer));
      if (!d) out.problems.push(`${line} (${p.ref}) : designer « ${designer} » inconnu`);
      else if (d.designerName !== p.pack.designer) patch.designer = d.designerName;
    }
    const next = cellText(get('nextAction'));
    if (next && next !== p.nextAction) patch.nextAction = next;
    const tq = cellText(get('targetQty'));
    if (tq) {
      const n = toNum(tq);
      if (!Number.isFinite(n)) out.problems.push(`${line} (${p.ref}) : quantité cible « ${tq} » illisible`);
      else if (n !== p.targetQty) patch.targetQty = Math.round(n);
    }
    for (const k of ['pcb', 'weight', 'cbmCarton'] as const) {
      const v = cellText(get(k));
      if (!v) continue;
      const n = toNum(v);
      if (!Number.isFinite(n)) out.problems.push(`${line} (${p.ref}) : ${k === 'pcb' ? 'PCB' : k === 'weight' ? 'poids' : 'CBM carton'} « ${v} » illisible`);
      else if (n !== p[k]) patch[k] = n;
    }
    const fr = cellText(get('descFr'));
    const en = cellText(get('descEn'));
    if ((fr && fr !== (p.description?.fr ?? '')) || (en && en !== (p.description?.en ?? ''))) patch.description = { fr: fr || p.description?.fr, en: en || p.description?.en };
    if (Object.keys(patch).length) out.items.push({ productId: p.id, patch });
    else out.unchanged++;
  }
  return out;
}
