// Photos incrustées dans une proforma Excel, avec la ligne du tableau où chacune est posée.
//  - .xls (Excel 97-2003, WPS) : images du groupe de dessins (OfficeArt) et ancrage de chaque image sur la feuille ;
//  - .xlsx : dessins de la feuille (xl/drawings, ancrage « from row ») et images dans les cellules de WPS (DISPIMG).
// Les formats vectoriels (EMF/WMF) ne sont pas repris : ils ne s'affichent pas dans un navigateur.
import CFB from 'cfb';

export interface SheetImage {
  /** Ligne de la feuille (0 = première ligne) où l'image est ancrée ; -1 si inconnue */
  row: number;
  blob: Blob;
}

type Bytes = Uint8Array;
const u16 = (b: Bytes, o: number) => b[o] | (b[o + 1] << 8);
const u32 = (b: Bytes, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const text = (b?: Bytes | number[] | null) => (b ? new TextDecoder().decode(b instanceof Uint8Array ? b : new Uint8Array(b)) : '');

const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp', tif: 'image/tiff', tiff: 'image/tiff' };
/** Type d'image d'après son contenu */
function sniff(b: Bytes): string | null {
  if (b[0] === 0x89 && b[1] === 0x50) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b[0] === 0x47 && b[1] === 0x49) return 'image/gif';
  if (b[0] === 0x42 && b[1] === 0x4d) return 'image/bmp';
  if (b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return null;
}
const blobOf = (b: Bytes, type: string) => new Blob([b.slice() as BlobPart], { type });

export async function sheetImages(data: Bytes): Promise<SheetImage[]> {
  try {
    const cfb = CFB.read(data, { type: 'buffer' });
    const wbk = CFB.find(cfb, 'Workbook') ?? CFB.find(cfb, 'Book');
    if (wbk?.content) return xlsImages(new Uint8Array(wbk.content as ArrayLike<number>));
    return xlsxImages(cfb);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// .xls : enregistrements BIFF → flux OfficeArt

interface ArtRec {
  inst: number;
  type: number;
  start: number; // début des données
  len: number;
}
function* records(b: Bytes, from: number, to: number): Generator<ArtRec> {
  let o = from;
  while (o + 8 <= to) {
    const vi = u16(b, o);
    const r = { inst: vi >> 4, type: u16(b, o + 2), start: o + 8, len: u32(b, o + 4) };
    if (r.start + r.len > to + 8) return;
    yield r;
    o = r.start + (((vi & 0xf) === 0xf) ? 0 : r.len);
    // Conteneur (version 0xF) : on parcourt ses enregistrements à la suite
  }
}

/** Images du magasin (BStore), dans l'ordre : l'index + 1 est le « pib » des formes */
function blipStore(dgg: Bytes): (Blob | null)[] {
  const out: (Blob | null)[] = [];
  for (const r of records(dgg, 0, dgg.length)) {
    if (r.type !== 0xf007) continue; // FBSE
    const cbName = dgg[r.start + 33];
    const blipAt = r.start + 36 + cbName;
    if (blipAt + 8 > r.start + r.len) {
      out.push(null);
      continue;
    }
    const inst = u16(dgg, blipAt) >> 4;
    const type = u16(dgg, blipAt + 2);
    const len = u32(dgg, blipAt + 4);
    const body = blipAt + 8;
    // Deux identifiants pour certaines instances (JPEG 0x46B/0x6E3, PNG 0x6E1, DIB 0x7A9, TIFF 0x6E5)
    const twoUid = [0x46b, 0x6e3, 0x6e1, 0x7a9, 0x6e5].includes(inst);
    const raster = [0xf01d, 0xf02a, 0xf01e, 0xf01f, 0xf029].includes(type);
    if (!raster) {
      out.push(null); // EMF / WMF / PICT
      continue;
    }
    const dataAt = body + 16 + (twoUid ? 16 : 0) + 1;
    const img = dgg.subarray(dataAt, body + len);
    if (type === 0xf01f) out.push(blobOf(dibToBmp(img), 'image/bmp'));
    else out.push(blobOf(img, sniff(img) ?? (type === 0xf01e ? 'image/png' : type === 0xf029 ? 'image/tiff' : 'image/jpeg')));
  }
  return out;
}

/** Bitmap DIB (sans en-tête de fichier) → fichier BMP */
function dibToBmp(dib: Bytes): Bytes {
  const hdr = u32(dib, 0);
  const bits = u16(dib, 14);
  const comp = u32(dib, 16);
  const used = hdr >= 40 ? u32(dib, 32) : 0;
  const palette = (used || (bits <= 8 ? 1 << bits : 0)) * (hdr === 12 ? 3 : 4);
  const masks = hdr === 40 && comp === 3 ? 12 : 0;
  const out = new Uint8Array(14 + dib.length);
  const size = out.length;
  out.set([0x42, 0x4d, size & 255, (size >> 8) & 255, (size >> 16) & 255, size >>> 24, 0, 0, 0, 0]);
  const off = 14 + hdr + masks + palette;
  out.set([off & 255, (off >> 8) & 255, (off >> 16) & 255, off >>> 24], 10);
  out.set(dib, 14);
  return out;
}

/** Formes de la feuille : image (pib) et ligne d'ancrage */
function shapes(dg: Bytes): { pib: number; row: number }[] {
  const out: { pib: number; row: number }[] = [];
  let cur: { pib: number; row: number } | null = null;
  let spEnd = -1;
  for (const r of records(dg, 0, dg.length)) {
    if (cur && r.start - 8 >= spEnd) {
      if (cur.pib > 0) out.push(cur);
      cur = null;
    }
    if (r.type === 0xf004) {
      // SpContainer : une forme
      if (cur?.pib) out.push(cur);
      cur = { pib: 0, row: -1 };
      spEnd = r.start + r.len;
    } else if (cur && r.type === 0xf00b) {
      // FOPT : propriétés ; 0x0104 = pib (image)
      for (let i = 0; i < r.inst; i++) {
        const opid = u16(dg, r.start + i * 6);
        if ((opid & 0x3fff) === 0x0104) cur.pib = u32(dg, r.start + i * 6 + 2);
      }
    } else if (cur && r.type === 0xf010 && r.len >= 18) {
      // ClientAnchor : col1, dx1, rw1…
      cur.row = u16(dg, r.start + 6);
    }
  }
  if (cur?.pib) out.push(cur);
  return out;
}

function xlsImages(wb: Bytes): SheetImage[] {
  const dgg: Bytes[] = [];
  const dg: Bytes[] = [];
  let bofs = 0;
  let last = 0;
  for (let o = 0; o + 4 <= wb.length; ) {
    const type = u16(wb, o);
    const len = u16(wb, o + 2);
    const body = wb.subarray(o + 4, o + 4 + len);
    if (type === 0x0809) bofs++; // BOF : 1 = classeur, 2 = première feuille
    // MsoDrawingGroup (+ suites) dans le classeur ; MsoDrawing (+ suites) dans la première feuille
    if (type === 0x00eb || (type === 0x003c && last === 0x00eb)) dgg.push(body);
    else if (bofs === 2 && (type === 0x00ec || (type === 0x003c && last === 0x00ec))) dg.push(body);
    if (type !== 0x003c) last = type;
    o += 4 + len;
  }
  if (!dgg.length) return [];
  const cat = (parts: Bytes[]) => {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let i = 0;
    for (const p of parts) out.set(p, (i += p.length) - p.length);
    return out;
  };
  const store = blipStore(cat(dgg));
  const placed = dg.length ? shapes(cat(dg)) : [];
  if (placed.length) return placed.flatMap((s) => (store[s.pib - 1] ? [{ row: s.row, blob: store[s.pib - 1]! }] : []));
  return store.flatMap((b) => (b ? [{ row: -1, blob: b }] : []));
}

// ---------------------------------------------------------------------------
// .xlsx

type Cfb = ReturnType<typeof CFB.read>;
function entry(cfb: Cfb, path: string) {
  const e = CFB.find(cfb, path) ?? CFB.find(cfb, `/${path}`);
  return e?.content ? new Uint8Array(e.content as ArrayLike<number>) : null;
}
/** Cibles d'un fichier de relations : Id → chemin dans l'archive */
function rels(cfb: Cfb, relsPath: string, baseDir: string): Map<string, string> {
  const m = new Map<string, string>();
  const xml = text(entry(cfb, relsPath));
  for (const r of xml.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = r[0].match(/\bId="([^"]+)"/)?.[1];
    const target = r[0].match(/\bTarget="([^"]+)"/)?.[1];
    if (!id || !target) continue;
    const parts = (target.startsWith('/') ? target.slice(1) : `${baseDir}/${target}`).split('/');
    const path: string[] = [];
    for (const p of parts) {
      if (p === '..') path.pop();
      else if (p && p !== '.') path.push(p);
    }
    m.set(id, path.join('/'));
  }
  return m;
}
const imageAt = (cfb: Cfb, path?: string): Blob | null => {
  const b = path ? entry(cfb, path) : null;
  if (!b) return null;
  const type = sniff(b) ?? MIME[path!.split('.').pop()!.toLowerCase()];
  return type ? blobOf(b, type) : null;
};

function xlsxImages(cfb: Cfb): SheetImage[] {
  const out: SheetImage[] = [];
  // Première feuille et son dessin
  const sheetRels = rels(cfb, 'xl/worksheets/_rels/sheet1.xml.rels', 'xl/worksheets');
  const drawing = [...sheetRels.values()].find((p) => p.includes('drawings/drawing')) ?? 'xl/drawings/drawing1.xml';
  const xml = text(entry(cfb, drawing));
  if (xml) {
    const name = drawing.split('/').pop()!;
    const dr = rels(cfb, `xl/drawings/_rels/${name}.rels`, 'xl/drawings');
    for (const a of xml.split(/<xdr:(?:twoCellAnchor|oneCellAnchor|absoluteAnchor)\b/).slice(1)) {
      const row = Number(a.match(/<xdr:from>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/)?.[1] ?? -1);
      const blob = imageAt(cfb, dr.get(a.match(/r:embed="([^"]+)"/)?.[1] ?? ''));
      if (blob) out.push({ row, blob });
    }
  }
  // WPS : images dans les cellules (=DISPIMG("ID_…";1)), décrites dans xl/cellimages.xml
  const cells = text(entry(cfb, 'xl/cellimages.xml'));
  if (cells) {
    const cr = rels(cfb, 'xl/_rels/cellimages.xml.rels', 'xl');
    const byName = new Map<string, Blob>();
    for (const c of cells.split(/<etc:cellImage\b/).slice(1)) {
      const name = c.match(/<xdr:cNvPr\b[^>]*\bname="([^"]+)"/)?.[1];
      const blob = imageAt(cfb, cr.get(c.match(/r:embed="([^"]+)"/)?.[1] ?? ''));
      if (name && blob) byName.set(name, blob);
    }
    const sheet = text(entry(cfb, 'xl/worksheets/sheet1.xml'));
    for (const c of sheet.matchAll(/<c\b[^>]*\br="[A-Z]+(\d+)"[^>]*>([\s\S]*?)<\/c>/g)) {
      const id = c[2].match(/DISPIMG\(\s*(?:&quot;|")([^"&]+)(?:&quot;|")/)?.[1];
      const blob = id ? byName.get(id) : undefined;
      if (blob) out.push({ row: Number(c[1]) - 1, blob });
    }
  }
  return out;
}
