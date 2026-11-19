// Import d'une commande depuis un fichier Excel ou CSV : on repère la ligne d'en-têtes
// (référence, EAN, désignation, quantité, prix, colisage, volume) puis on lit les lignes en dessous.
import type { ExtractedLine } from './proformaExtract';

const norm = (s: unknown) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();

type Col = 'ref' | 'ean' | 'name' | 'qty' | 'price' | 'pcb' | 'cbm';
const HEADERS: Record<Col, RegExp> = {
  ref: /^(ref|reference|réf|article|code article|code|sku|item|item no|art\.? ?no|code jonas)\b/,
  ean: /(ean|gencod|code ?barre|barcode|upc)/,
  name: /(designation|libelle|description|desc|produit|product|nom|name)/,
  qty: /^(qte|quantite|qty|quantity|pcs|pieces|nb|nombre|quant)/,
  price: /(prix|pu\b|p\.u|unit ?price|price|pa\b|cout|cost)/,
  pcb: /(pcb|colisage|pcs ?\/ ?ctn|pcs per|par carton|inner|outer|carton qty)/,
  cbm: /(cbm|m3|m³|volume)/,
};

const toNumber = (v: unknown) => {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').replace(/[\s  ]/g, '').replace(/[^\d.,-]/g, '');
  if (!s) return NaN;
  const last = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'));
  return last < 0 ? Number(s) : Number(s.slice(0, last).replace(/[.,]/g, '') + '.' + s.slice(last + 1));
};

/** Repère les colonnes d'après une ligne d'en-têtes (au moins une désignation ou une référence, et une quantité) */
function headerMap(row: unknown[]): Partial<Record<Col, number>> | null {
  const map: Partial<Record<Col, number>> = {};
  row.forEach((cell, i) => {
    const h = norm(cell);
    if (!h) return;
    for (const c of ['pcb', 'cbm', 'ean', 'qty', 'price', 'ref', 'name'] as Col[]) {
      if (map[c] === undefined && HEADERS[c].test(h)) {
        map[c] = i;
        break;
      }
    }
  });
  return map.qty !== undefined && (map.ref !== undefined || map.name !== undefined) ? map : null;
}

/** Lignes d'un tableau (première feuille d'un Excel, ou CSV) */
export function rowsToLines(rows: unknown[][]): ExtractedLine[] {
  const h = rows.findIndex((r) => headerMap(r));
  if (h < 0) return [];
  const map = headerMap(rows[h])!;
  const out: ExtractedLine[] = [];
  for (const r of rows.slice(h + 1)) {
    const get = (c: Col) => (map[c] !== undefined ? r[map[c]!] : undefined);
    const qty = Math.round(toNumber(get('qty')));
    const ref = String(get('ref') ?? '').trim();
    const name = String(get('name') ?? '').trim();
    if (!(qty > 0) || (!ref && !name) || /^total/i.test(ref || name)) continue;
    const price = toNumber(get('price'));
    const ean = String(get('ean') ?? '').replace(/\D/g, '');
    const pcb = Math.round(toNumber(get('pcb')));
    const cbm = toNumber(get('cbm'));
    out.push({
      ref: ref.toUpperCase(),
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

/** Lit un fichier Excel (.xlsx, .xls) ou CSV */
export async function readSheet(file: Blob): Promise<ExtractedLine[]> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' });
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: '' });
    const lines = rowsToLines(rows);
    if (lines.length) return lines;
  }
  return [];
}

export const SHEET_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
];
export const isSheet = (f: File) => SHEET_TYPES.includes(f.type) || /\.(xlsx|xls|csv)$/i.test(f.name);
