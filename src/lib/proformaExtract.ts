// Lecture d'une proforma déposée : on en tire les lignes (référence, désignation, quantité, prix),
// puis on les rapproche des produits existants du fournisseur. Les lignes inconnues deviennent
// des produits à créer. Deux moteurs :
//  - Claude (capacité « sample » de l'Artifact) : PDF (texte) et photos, n'importe quelle mise en page ;
//  - lecture du texte du PDF ligne à ligne (repli, sans IA) : tableaux simples.
import type { Product } from '../data/types';

export interface ExtractedLine {
  ref: string;
  name: string;
  ean?: string;
  qty: number;
  price: number;
  pcb?: number;
  cbmCarton?: number;
}

export interface Extraction {
  lines: ExtractedLine[];
  engine: 'claude' | 'texte' | 'aucun';
  currency?: string;
}

// ---------------------------------------------------------------------------
// Texte d'un PDF (pdf.js, chargé à la demande, sans worker séparé)

type PdfJs = typeof import('pdfjs-dist');
let pdfjs: Promise<PdfJs> | null = null;
function loadPdfJs(): Promise<PdfJs> {
  pdfjs ??= (async () => {
    // Worker exécuté dans la page : un seul fichier, compatible Artifact
    const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs');
    (globalThis as unknown as { pdfjsWorker: unknown }).pdfjsWorker = worker;
    return import('pdfjs-dist');
  })();
  return pdfjs;
}

/** Lignes de texte d'un PDF, dans l'ordre de lecture (cellules séparées par « | ») */
export async function pdfLines(data: ArrayBuffer, maxPages = 6): Promise<string[]> {
  const lib = await loadPdfJs();
  const doc = await lib.getDocument({ data: new Uint8Array(data), isEvalSupported: false }).promise;
  const out: string[] = [];
  for (let p = 1; p <= Math.min(doc.numPages, maxPages); p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const rows = new Map<number, { x: number; s: string; w: number }[]>();
    for (const it of content.items) {
      if (!('str' in it) || !it.str.trim()) continue;
      const y = Math.round(it.transform[5] / 3) * 3;
      const row = rows.get(y) ?? [];
      row.push({ x: it.transform[4], s: it.str.trim(), w: it.width });
      rows.set(y, row);
    }
    for (const y of [...rows.keys()].sort((a, b) => b - a)) {
      const cells = rows.get(y)!.sort((a, b) => a.x - b.x);
      let line = '';
      let end = -Infinity;
      for (const c of cells) {
        line += line ? (c.x - end > 12 ? ' | ' : ' ') + c.s : c.s;
        end = c.x + c.w;
      }
      out.push(line);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Repli sans IA : une ligne de tableau = référence | désignation | quantité | prix unitaire | montant

const num = (s: string) => {
  // Une cellule avec des lettres (hors devise) n'est pas un nombre : « Storage box 30L » est une désignation
  if (/[a-z]/i.test(s.replace(/\b(USD|EUR|CNY|RMB|US)\b|[$€¥]/gi, ''))) return NaN;
  const t = s.replace(/[\s  ]/g, '').replace(/[^\d.,-]/g, '');
  if (!t) return NaN;
  // « 1,234.50 » / « 1.234,50 » / « 4,5 »
  const lastSep = Math.max(t.lastIndexOf(','), t.lastIndexOf('.'));
  if (lastSep < 0) return Number(t);
  const decimals = t.length - lastSep - 1;
  if (decimals === 3 && !/[.,].*[.,]/.test(t)) return Number(t.replace(/[.,]/g, '')); // séparateur de milliers seul
  return Number(t.slice(0, lastSep).replace(/[.,]/g, '') + '.' + t.slice(lastSep + 1));
};
const REF = /^[A-Z0-9][A-Z0-9-]{2,15}$/i;

export function parseTextLines(lines: string[]): ExtractedLine[] {
  const out: ExtractedLine[] = [];
  for (const raw of lines) {
    const cells = raw.split(' | ').map((c) => c.trim()).filter(Boolean);
    if (cells.length < 4) continue;
    const [ref, ...rest] = cells;
    if (!REF.test(ref) || !/\d/.test(ref) || /^(total|subtotal|amount|qty)/i.test(ref)) continue;
    const nums = rest.map(num);
    // désignation : premières cellules non numériques
    const nameCells: string[] = [];
    let i = 0;
    while (i < rest.length && Number.isNaN(nums[i])) nameCells.push(rest[i++]);
    const values = nums.slice(i).filter((n) => !Number.isNaN(n));
    if (!nameCells.length || values.length < 2) continue;
    const [qty, price] = values;
    if (!(qty > 0) || !(price >= 0)) continue;
    const ean = rest.find((c) => /^\d{12,14}$/.test(c));
    out.push({ ref: ref.toUpperCase(), name: nameCells.join(' '), qty: Math.round(qty), price: Math.round(price * 10000) / 10000, ean });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Claude (Artifact, capacité « sample »)

type Sample = ((input: string, opts?: object) => Promise<{ text: string }>) & {
  json: (input: string, opts?: object) => Promise<unknown>;
  limits?: () => Promise<{ images?: boolean }>;
};
type ClaudeWin = { claude?: { use?: (n: string) => Promise<unknown> } };

async function sampleCap(): Promise<Sample | null> {
  const host = (window as unknown as ClaudeWin).claude;
  if (!host?.use) return null;
  try {
    return ((await host.use('sample')) as Sample | null) ?? null;
  } catch {
    return null;
  }
}

const PROMPT = `Tu lis une proforma d'un fournisseur (Asie) pour l'importateur JONAS.
Renvoie UNIQUEMENT un objet JSON : {"currency": "USD|EUR|CNY|…", "lines": [{"ref": "référence article du fournisseur ou de JONAS", "name": "désignation", "ean": "code EAN si présent", "qty": nombre de pièces, "price": prix unitaire par pièce, "pcb": pièces par carton si indiqué, "cbmCarton": m³ par carton si indiqué}]}.
Une ligne par article commandé ; ignore totaux, frais, acomptes. Nombres sans séparateur de milliers (point décimal).`;

function clean(v: unknown): Extraction | null {
  const o = v as { currency?: string; lines?: Partial<ExtractedLine>[] } | null;
  if (!o || !Array.isArray(o.lines)) return null;
  const lines = o.lines
    .map((l) => ({
      ref: String(l.ref ?? '').trim().toUpperCase(),
      name: String(l.name ?? '').trim(),
      ean: l.ean ? String(l.ean).replace(/\D/g, '') || undefined : undefined,
      qty: Math.round(Number(l.qty)),
      price: Number(l.price),
      pcb: l.pcb ? Math.round(Number(l.pcb)) || undefined : undefined,
      cbmCarton: l.cbmCarton ? Number(l.cbmCarton) || undefined : undefined,
    }))
    .filter((l) => (l.ref || l.name) && l.qty > 0 && l.price >= 0);
  return { lines, engine: 'claude', currency: o.currency };
}

/** Lit les lignes d'une proforma (PDF ou photo) */
export async function extractProforma(file: Blob, type: string): Promise<Extraction> {
  const isPdf = type === 'application/pdf';
  let text: string[] = [];
  if (isPdf) {
    try {
      text = await pdfLines(await file.arrayBuffer());
    } catch {
      text = [];
    }
  }
  const sample = await sampleCap();
  if (sample) {
    try {
      if (isPdf && text.length) {
        const r = clean(await sample.json(`${PROMPT}\n\nTexte de la proforma (cellules séparées par « | ») :\n${text.join('\n').slice(0, 30000)}`, { modelTier: 'default' }));
        if (r?.lines.length) return r;
      } else if (!isPdf && (await sample.limits?.())?.images) {
        const r = clean(await sample.json(PROMPT, { images: [file], modelTier: 'default' }));
        if (r?.lines.length) return r;
      }
    } catch {
      /* Claude indisponible ou refusé : lecture du texte */
    }
  }
  const lines = parseTextLines(text);
  return { lines, engine: lines.length ? 'texte' : 'aucun' };
}

// ---------------------------------------------------------------------------
// Rapprochement avec les produits existants du fournisseur

const key = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
const words = (s: string) =>
  new Set(
    s
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2),
  );

export interface Match {
  product?: Product;
  /** ref / ean : sûr ; nom : à confirmer */
  by?: 'ref' | 'ean' | 'nom';
}

/**
 * Produit correspondant à une ligne lue.
 * `catalog` : tout le catalogue JONAS — une référence ou un EAN JONAS existant, c'est ce produit, quel que soit son fournisseur.
 * `products` : produits du fournisseur — sa référence fournisseur connue, ou une désignation quasi identique.
 */
export function matchProduct(l: ExtractedLine, products: Product[], catalog: Product[] = products): Match {
  if (l.ref) {
    const jonas = catalog.find((x) => key(x.ref) === key(l.ref));
    if (jonas) return { product: jonas, by: 'ref' };
    const p = products.find((x) => x.supplierRef && key(x.supplierRef) === key(l.ref));
    if (p) return { product: p, by: 'ref' };
  }
  if (l.ean) {
    const p = catalog.find((x) => x.ean === l.ean);
    if (p) return { product: p, by: 'ean' };
  }
  if (l.name) {
    const w = words(l.name);
    let best: Product | undefined;
    let score = 0;
    for (const p of products) {
      const pw = words(p.name);
      const inter = [...w].filter((x) => pw.has(x)).length;
      // proportion de mots communs, rapportée à la désignation la plus longue
      const s = inter / Math.max(1, w.size, pw.size);
      if (s > score) {
        score = s;
        best = p;
      }
    }
    // Une référence inconnue sur le document : il faut des désignations quasi identiques
    if (best && score >= (l.ref ? 0.9 : 0.75)) return { product: best, by: 'nom' };
  }
  return {};
}
