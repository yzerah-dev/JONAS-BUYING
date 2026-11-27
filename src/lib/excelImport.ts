// Import d'une commande depuis un fichier Excel ou CSV : on repère la ligne d'en-têtes
// (référence, EAN, désignation, quantité, prix, colisage, volume) puis on lit les lignes en dessous.
import type { ExtractedLine } from './proformaExtract';

const norm = (s: unknown) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();

type Col = 'ref' | 'jonasRef' | 'ean' | 'name' | 'qty' | 'price' | 'pcb' | 'cbm' | 'ctn';

const REF = /\b(ref|reference|article|code article|sku|item|art|model|style|code jonas)\b/;
const BUYER = /\b(buyer|customer|client|jonas|acheteur)\b/;
const OURS = /\b(ours?|supplier|factory|vendor|fournisseur|usine|seller)\b/;
const TOTAL = /\b(total|amount|montant|sum)\b/;

/** Rôle d'une colonne d'après son libellé (en-tête sur une ou deux lignes, ex. « Item No. buyer », « Quantity Outer ») */
function colOf(h: string): Col | null {
  if (!h) return null;
  if (/(ean|gencod|code ?barre|bar ?code|upc)/.test(h)) return 'ean';
  if (/(pcb|colisage|pcs ?\/ ?ctn|pcs ?\/ ?carton|qty ?\/ ?ctn|pcs per|par carton|per carton|carton qty|outer|case ?pack|pack ?qty|master ?pack)/.test(h)) return 'pcb';
  if (/\binner\b/.test(h)) return null;
  if (/(cbm|m3|m³|volume)/.test(h)) return TOTAL.test(h) ? null : 'cbm';
  // Dimensions du carton (« Ctn size », « Carton meas. ») : pas un nombre de cartons
  if (/(size|dim|meas|taille|l ?x ?w|lxwxh)/.test(h)) return null;
  if (/^(total ?)?(ctn|ctns|cartons?|colis)\b/.test(h)) return 'ctn';
  // Prix unitaire : « Price », « Prix », « FOB Ningbo », « EXW », « Unit cost »… (pas les montants totaux)
  if (/(prix|pu\b|p\.u|unit ?price|price|pa\b|cout|cost|\bfob\b|\bexw\b|\bfca\b|\bcif\b|\bcnf\b)/.test(h)) return TOTAL.test(h) ? null : 'price';
  // Quantité en pièces : « Qty », « Quantity PCS », et aussi « Total Quantity » / « Total pcs » (moins prioritaire)
  if (/^(total ?)?(qte|quantite|qty|quantity|pcs|pieces|nb|nombre|quant)/.test(h)) return 'qty';
  if (/(packing|packaging|emballage|conditionnement)/.test(h)) return null;
  if (REF.test(h) || /^code\b/.test(h)) return BUYER.test(h) ? 'jonasRef' : 'ref';
  if (/(designation|libelle|description|desc|produit|product|nom|name)/.test(h)) return 'name';
  return null;
}

/** Une ligne de libellés (aucun nombre) : sous-en-tête possible */
const isLabelRow = (r: unknown[]) => r.filter((c) => String(c ?? '').trim()).length >= 2 && !r.some((c) => typeof c === 'number' || /^\s*\d+([.,]\d+)?\s*$/.test(String(c ?? '')));

/** Libellés des colonnes : en-tête simple, ou sur deux lignes (le libellé du haut couvre les sous-colonnes fusionnées) */
function headerLabels(rows: unknown[][], h: number): { labels: string[]; height: number } {
  const top = rows[h].map(norm);
  const sub = rows[h + 1];
  if (!sub || !isLabelRow(sub)) return { labels: top, height: 1 };
  const n = Math.max(top.length, sub.length);
  const labels: string[] = [];
  let carry = '';
  for (let i = 0; i < n; i++) {
    const t = top[i] ?? '';
    const s = norm(sub[i]);
    if (t) carry = t;
    else if (!s) carry = '';
    labels.push(`${t || (s ? carry : '')} ${s}`.trim());
  }
  return { labels, height: 2 };
}

/** Colonnes reconnues (au moins une désignation ou une référence, et une quantité) */
function headerMap(labels: string[]): Partial<Record<Col, number>> | null {
  const map: Partial<Record<Col, number>> = {};
  const refs: number[] = [];
  labels.forEach((h, i) => {
    const c = colOf(h);
    if (!c) return;
    if (c === 'ref') return refs.push(i);
    // Quantité : la colonne en pièces l'emporte (« Quantity PCS »), puis une quantité simple, puis « Total quantity »
    if (c === 'qty' && map.qty !== undefined) {
      const rank = (l: string) => (/pcs|pieces/.test(l) ? 0 : TOTAL.test(l) ? 2 : 1);
      if (rank(h) >= rank(labels[map.qty])) return;
      map.qty = i;
      return;
    }
    if (c !== 'qty' && map[c] !== undefined) return;
    map[c] = i;
  });
  // Deux colonnes de référence : celle du fournisseur (« ours ») et celle de l'acheteur
  if (refs.length) {
    const ours = refs.find((i) => OURS.test(labels[i]));
    map.ref = ours ?? refs[0];
    if (map.jonasRef === undefined && refs.length > 1) map.jonasRef = refs.find((i) => i !== map.ref && !OURS.test(labels[i]));
  }
  return map.qty !== undefined && (map.ref !== undefined || map.jonasRef !== undefined || map.name !== undefined) ? map : null;
}

const toNumber = (v: unknown) => {
  if (typeof v === 'number') return v;
  const s = String(v ?? '')
    .replace(/[\s  ]/g, '')
    .replace(/[^\d.,-]/g, '');
  if (!s) return NaN;
  const last = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'));
  return last < 0 ? Number(s) : Number(s.slice(0, last).replace(/[.,]/g, '') + '.' + s.slice(last + 1));
};
const text = (v: unknown) =>
  String(v ?? '')
    .replace(/\s+/g, ' ')
    .trim();
const refText = (v: unknown) => (typeof v === 'number' ? String(v) : text(v)).toUpperCase();

/** Lignes d'un tableau (une feuille d'un Excel, ou CSV) */
export function rowsToLines(rows: unknown[][]): ExtractedLine[] {
  let h = -1;
  let head: { labels: string[]; height: number } | null = null;
  let map: Partial<Record<Col, number>> | null = null;
  // Ligne d'en-têtes : celle qui reconnaît le plus de colonnes (les lignes d'adresse ou de conditions
  // au-dessus du tableau peuvent ressembler à un en-tête : « Price Term », « Order No. »…)
  for (let i = 0; i < Math.min(rows.length, 60); i++) {
    for (const cand of [headerLabels(rows, i), { labels: rows[i].map(norm), height: 1 }]) {
      const m = headerMap(cand.labels);
      if (m && (!map || Object.keys(m).length > Object.keys(map).length)) {
        map = m;
        head = cand;
        h = i;
      }
    }
  }
  if (!map || !head) return [];
  const out: ExtractedLine[] = [];
  for (const r of rows.slice(h + head.height)) {
    const get = (c: Col) => (map![c] !== undefined ? r[map![c]!] : undefined);
    const qty = Math.round(toNumber(get('qty')));
    const ref = refText(get('ref'));
    const jonasRef = refText(get('jonasRef'));
    const name = text(get('name'));
    if (!(qty > 0) || (!ref && !jonasRef && !name) || /^total/i.test(ref || jonasRef || name)) continue;
    const price = toNumber(get('price'));
    const ean = refText(get('ean')).replace(/\D/g, '');
    let pcb = Math.round(toNumber(get('pcb')));
    // Pas de colisage : quantité / nombre de cartons
    const ctn = toNumber(get('ctn'));
    if (!(pcb > 0) && ctn > 0 && Number.isInteger(qty / ctn)) pcb = qty / ctn;
    const cbm = toNumber(get('cbm'));
    out.push({
      row: ROW.get(r),
      ref,
      jonasRef: jonasRef || undefined,
      name,
      ean: ean.length >= 8 ? ean : undefined,
      qty,
      price: Number.isFinite(price) && price >= 0 ? price : 0,
      pcb: pcb > 0 ? pcb : undefined,
      cbmCarton: cbm > 0 ? cbm : undefined,
    });
  }
  return out;
}

/** Feuilles d'un fichier Excel (.xlsx, .xls) ou CSV : lignes de cellules, lignes vides retirées */
/** raw : valeurs brutes (nombres) pour la lecture des lignes ; sinon texte tel qu'affiché dans Excel */
export async function sheetTables(file: Blob | Uint8Array, raw = false): Promise<{ name: string; rows: unknown[][] }[]> {
  const XLSX = await import('xlsx');
  const data = file instanceof Uint8Array ? file : new Uint8Array(await file.arrayBuffer());
  const wb = XLSX.read(data, { type: 'array', cellDates: true });
  return wb.SheetNames.filter((name) => wb.Sheets[name])
    .map((name) => {
      const ws = wb.Sheets[name];
      const first = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']).s.r : 0;
      const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw, defval: '', blankrows: true });
      rows.forEach((r, i) => ROW.set(r, first + i));
      return { name, rows: rows.filter((r) => r.some((c) => String(c ?? '').trim() !== '')) };
    })
    .filter((s) => s.rows.length);
}

/** Numéro de ligne dans la feuille (0 = première), pour placer les photos incrustées */
const ROW = new WeakMap<unknown[], number>();

/** Lit les lignes d'un fichier Excel (.xlsx, .xls) ou CSV : première feuille où l'on trouve un tableau d'articles */
export async function readSheet(file: Blob): Promise<ExtractedLine[]> {
  const data = new Uint8Array(await file.arrayBuffer());
  const sheets = await sheetTables(data, true);
  for (const [i, s] of sheets.entries()) {
    const lines = rowsToLines(s.rows);
    if (!lines.length) continue;
    // Photos incrustées (première feuille) : chacune va à la ligne sur laquelle elle est posée
    if (i === 0) {
      const { sheetImages } = await import('./sheetImages');
      const images = await sheetImages(data).catch(() => []);
      lines.forEach((l, k) => {
        // Image posée sur la ligne (ou juste en dessous, avant la ligne suivante) ; la plus proche d'abord.
        // Après la dernière ligne : 2 lignes au plus (plus bas, c'est le cachet ou le logo de la société)
        const next = lines[k + 1]?.row ?? l.row! + 3;
        const img = l.row !== undefined ? images.filter((im) => im.row >= l.row! && im.row < next).sort((a, b) => a.row - b.row)[0] : undefined;
        l.photo = img?.blob ?? (images.length === lines.length && images.every((im) => im.row < 0) ? images[k].blob : undefined);
      });
    }
    return lines;
  }
  return [];
}

/** Contenu d'un Excel en texte (cellules séparées par « | »), pour une lecture par Claude */
export async function sheetText(file: Blob, max = 30000): Promise<string> {
  const out: string[] = [];
  for (const s of await sheetTables(file)) {
    out.push(`# Feuille ${s.name}`);
    for (const r of s.rows) out.push(r.map((c) => String(c ?? '').trim()).join(' | '));
  }
  return out.join('\n').slice(0, max);
}

export const SHEET_TYPES = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'text/csv'];
export const SHEET_ACCEPT = '.xlsx,.xls,.csv';
/** Fichier Excel ou CSV (d'après le type, ou l'extension quand le navigateur ne donne pas de type) */
export const isSheet = (f: { type?: string; name?: string }) => SHEET_TYPES.includes(f.type ?? '') || /\.(xlsx|xls|csv)$/i.test(f.name ?? '');
/** Type d'un fichier Excel/CSV, même quand le navigateur n'en donne pas */
export const sheetMime = (f: { type?: string; name?: string }) => f.type || (/\.csv$/i.test(f.name ?? '') ? 'text/csv' : /\.xls$/i.test(f.name ?? '') ? 'application/vnd.ms-excel' : SHEET_TYPES[0]);
