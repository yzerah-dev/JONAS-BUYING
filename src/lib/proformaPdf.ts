// PDF des proformas : original déposé par le fournisseur, version signée (signature + tampon JONAS
// + date + date d'expédition demandée), version annulée (bandeau « ANNULÉE »).
// Les versions signées / annulées sont recalculées à la demande depuis l'original et les métadonnées :
// rien d'autre que le fichier du fournisseur n'est stocké.
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { Company, Proforma, ProformaDoc, Supplier, Product } from '../data/types';
import { getBlob } from './files';
import { isSheet, sheetTables } from './excelImport';

const BLUE = rgb(0.11, 0.25, 0.69);
const RED = rgb(0.78, 0.12, 0.12);
const INK = rgb(0.1, 0.1, 0.12);
const GREY = rgb(0.45, 0.45, 0.5);

const d2 = (n: number) => String(n).padStart(2, '0');
const fr = (iso?: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
function isoWeek(iso: string) {
  const d = new Date(`${iso}T12:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const first = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d.getTime() - first.getTime()) / 86400000 - 3 + ((first.getUTCDay() + 6) % 7)) / 7);
}
/** Les polices standard ne couvrent que WinAnsi : on remplace le reste */
const safe = (s: string) =>
  s
    .replace(/[→]/g, '->')
    .replace(/[   ]/g, ' ')
    .replace(/[^\x20-\x7e -ÿ€’‘“”–—…•·«»]/g, '?');

export interface PdfContext {
  supplier: Supplier;
  products: Product[];
  /** Société JONAS portée sur le tampon */
  company: Company;
}

/** Proforma « déposée » des données de démo : régénérée depuis la proforma (pas de fichier stocké) */
export async function demoProformaPdf(pf: Proforma, doc: ProformaDoc, ctx: PdfContext): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const s = ctx.supplier;
  const txt = (t: string, x: number, y: number, size = 10, f: PDFFont = font, color = INK) => page.drawText(safe(t), { x, y, size, font: f, color });
  txt(s.name.toUpperCase(), 40, 790, 16, bold);
  txt(`${s.city}, ${s.country} · ${s.contact.email}`, 40, 773, 9, font, GREY);
  txt('PROFORMA INVOICE', 380, 790, 16, bold, BLUE);
  txt(`No. ${pf.id}${doc.version > 1 ? `  (revision ${doc.version})` : ''}`, 380, 773, 10, bold);
  txt(`Date: ${fr(doc.uploadedAt.slice(0, 10))}`, 380, 759, 9);
  txt(`Buyer PO: ${pf.poNumber}`, 380, 745, 9);
  txt(`Buyer: ${ctx.company.name}${ctx.company.city ? ` - ${ctx.company.city}` : ''}, France`, 40, 740, 10, bold);
  txt(`Port of loading: ${s.port}  ·  Destination: Le Havre  ·  Incoterm: FOB`, 40, 724, 9, font, GREY);
  if (doc.reason) txt(`Revision reason: ${doc.reason}`, 40, 708, 9, font, RED);

  let y = 680;
  const cols = [40, 120, 330, 400, 470];
  page.drawRectangle({ x: 36, y: y - 6, width: 523, height: 20, color: rgb(0.93, 0.95, 0.99) });
  ['Ref.', 'Description', 'Qty', 'Unit price', 'Amount'].forEach((h, i) => txt(h, cols[i], y, 9, bold));
  y -= 22;
  let total = 0;
  for (const l of pf.lines) {
    const p = ctx.products.find((x) => x.id === l.productId);
    const amount = l.qty * l.price;
    total += amount;
    txt(p?.ref ?? l.productId, cols[0], y, 9);
    txt((p?.name ?? '').slice(0, 38), cols[1], y, 9);
    txt(l.qty.toLocaleString('en-US'), cols[2], y, 9);
    txt(l.price.toFixed(2), cols[3], y, 9);
    txt(amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), cols[4], y, 9);
    page.drawLine({ start: { x: 36, y: y - 6 }, end: { x: 559, y: y - 6 }, thickness: 0.4, color: rgb(0.85, 0.85, 0.88) });
    y -= 20;
  }
  y -= 6;
  txt(`TOTAL (${pf.currency ?? 'EUR'})`, cols[3], y, 10, bold);
  txt(total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), cols[4], y, 10, bold);
  y -= 30;
  txt(`Payment: ${pf.depositPct}% deposit by T/T, balance against copy of B/L.`, 40, y, 9);
  txt(`Requested shipment: week ${isoWeek(pf.etd)} (${fr(pf.etd)})`, 40, y - 14, 9);
  txt(`Seller signature: ${s.contact.name}`, 40, 120, 9, font, GREY);
  return pdf.save();
}

async function originalBytes(pf: Proforma, doc: ProformaDoc, ctx: PdfContext): Promise<{ bytes: Uint8Array; type: string }> {
  const blob = await getBlob(doc.fileId).catch(() => undefined);
  if (blob) return { bytes: new Uint8Array(await blob.arrayBuffer()), type: doc.type || blob.type };
  return { bytes: await demoProformaPdf(pf, doc, ctx), type: 'application/pdf' };
}

/** Proforma Excel / CSV mise en page en PDF (A4 paysage) : cellules telles qu'affichées dans Excel.
 *  La dernière page garde le bas libre pour la signature et le tampon JONAS. */
async function sheetPdf(bytes: Uint8Array, fileName: string): Promise<PDFDocument> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 842,
    H = 595,
    M = 24,
    SIGN = 200;
  const sheets = await sheetTables(bytes);
  let page = pdf.addPage([W, H]);
  let y = H - M;
  const title = (t: string) => {
    page.drawText(safe(t).slice(0, 140), { x: M, y: y - 10, size: 10, font: bold, color: INK });
    y -= 22;
  };
  title(`Proforma Excel : ${fileName}`);
  for (const s of sheets) {
    const ncol = Math.min(14, Math.max(...s.rows.map((r) => r.length)));
    // Largeur des colonnes selon le texte le plus long (bornée), ramenée à la largeur de la page
    const len = Array.from({ length: ncol }, (_, c) => Math.min(40, Math.max(3, ...s.rows.map((r) => String(r[c] ?? '').length))));
    const total = len.reduce((a, b) => a + b, 0);
    const widths = len.map((l) => ((W - 2 * M) * l) / total);
    const size = Math.max(6, Math.min(9, (W - 2 * M) / total / 0.5));
    if (sheets.length > 1) title(`Feuille ${s.name}`);
    for (const r of s.rows) {
      if (y < M + 14) {
        page = pdf.addPage([W, H]);
        y = H - M;
      }
      let x = M;
      for (let c = 0; c < ncol; c++) {
        let t = safe(
          String(r[c] ?? '')
            .replace(/\s+/g, ' ')
            .trim(),
        );
        while (t && font.widthOfTextAtSize(t, size) > widths[c] - 3) t = t.slice(0, -1);
        if (t) page.drawText(t, { x: x + 1.5, y: y - size, size, font, color: INK });
        x += widths[c];
      }
      page.drawLine({ start: { x: M, y: y - size - 3 }, end: { x: W - M, y: y - size - 3 }, thickness: 0.3, color: rgb(0.85, 0.85, 0.88) });
      y -= size + 6;
    }
    y -= 10;
  }
  // Place pour la signature et le tampon (coin bas droit)
  if (y < M + SIGN) pdf.addPage([W, H]);
  return pdf;
}

/** Ouvre l'original comme PDF (une image devient une page A4, un Excel un tableau) */
async function asPdf(bytes: Uint8Array, type: string, name = ''): Promise<PDFDocument> {
  if (isSheet({ type, name }) || (bytes[0] === 0x50 && bytes[1] === 0x4b) || (bytes[0] === 0xd0 && bytes[1] === 0xcf)) return sheetPdf(bytes, name || 'proforma.xlsx');
  if (type === 'application/pdf' || (bytes[0] === 0x25 && bytes[1] === 0x50)) return PDFDocument.load(bytes, { ignoreEncryption: true });
  const pdf = await PDFDocument.create();
  const isPng = type.includes('png') || bytes[0] === 0x89;
  const img = isPng ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
  const page = pdf.addPage([595, 842]);
  const scale = Math.min(555 / img.width, 802 / img.height, 1);
  page.drawImage(img, { x: (595 - img.width * scale) / 2, y: 842 - 20 - img.height * scale, width: img.width * scale, height: img.height * scale });
  return pdf;
}

/** Paraphe manuscrit stylisé, propre à chaque signataire */
function signaturePath(name: string) {
  let seed = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) % 1000) / 1000;
  let d = 'M 0 10';
  let x = 0;
  for (let i = 0; i < 7; i++) {
    const w = 10 + rnd() * 9;
    d += ` C ${x + w * 0.3} ${-6 - rnd() * 12} ${x + w * 0.7} ${22 + rnd() * 6} ${x + w} ${6 + rnd() * 8}`;
    x += w;
  }
  d += ` M ${x * 0.15} 18 L ${x * 0.95} 12`;
  return d;
}

/**
 * Tampon de la société (encre bleue, double cadre, légèrement incliné) + « Bon pour accord » daté,
 * signature et signataire, date d'expédition demandée. En bas à droite de la dernière page.
 */
function drawSignature(page: PDFPage, doc: ProformaDoc, prev: ProformaDoc | undefined, company: Company, font: PDFFont, bold: PDFFont) {
  const sig = doc.signature!;
  const { width } = page.getSize();
  const W = 300;
  const x0 = width - W - 24;
  const y0 = 24;
  page.drawRectangle({ x: x0 - 6, y: y0 - 6, width: W + 12, height: prev ? 182 : 166, color: rgb(1, 1, 1), opacity: 0.94 });
  if (prev?.signature) page.drawText(safe(`Annule et remplace la proforma v${prev.version} signée le ${fr(prev.signature.date)}`), { x: x0, y: y0 + 166, size: 8.5, font: bold, color: RED });

  // Tampon : cadre double, texte centré, rotation de -4° autour du coin bas gauche
  const lines: { t: string; size: number; f: PDFFont }[] = [
    { t: company.name || 'JONAS INTERNATIONAL', size: 14, f: bold },
    ...(company.address ? [{ t: company.address, size: 8.5, f: font }] : []),
    ...(company.city ? [{ t: company.city, size: 8.5, f: font }] : []),
    ...(company.vat ? [{ t: `N° TVA intracom. : ${company.vat}`, size: 8, f: bold }] : []),
  ];
  const sw = Math.max(150, ...lines.map((l) => l.f.widthOfTextAtSize(safe(l.t), l.size) + 26));
  const sh = 18 + lines.reduce((s, l) => s + l.size + 5, 0);
  const sx = x0;
  const sy = y0 + 84;
  const a = (-4 * Math.PI) / 180;
  const at = (dx: number, dy: number) => ({ x: sx + dx * Math.cos(a) - dy * Math.sin(a), y: sy + dx * Math.sin(a) + dy * Math.cos(a) });
  const rot = degrees(-4);
  page.drawRectangle({ ...at(0, 0), width: sw, height: sh, borderColor: BLUE, borderWidth: 2.2, rotate: rot, borderOpacity: 0.88 });
  page.drawRectangle({ ...at(4, 4), width: sw - 8, height: sh - 8, borderColor: BLUE, borderWidth: 0.8, rotate: rot, borderOpacity: 0.88 });
  let dy = sh - 12;
  for (const l of lines) {
    dy -= l.size;
    const tw = l.f.widthOfTextAtSize(safe(l.t), l.size);
    page.drawText(safe(l.t), { ...at((sw - tw) / 2, dy), size: l.size, font: l.f, color: BLUE, rotate: rot, opacity: 0.9 });
    dy -= 5;
  }

  // Bon pour accord, date, signature et signataire
  page.drawText(safe(`Bon pour accord, le ${fr(sig.date)}`), { x: x0, y: y0 + 40, size: 9, font: bold, color: INK });
  page.drawSvgPath(signaturePath(sig.by), { x: x0 + 205, y: y0 + 74, borderColor: rgb(0.05, 0.12, 0.45), borderWidth: 1.3, scale: 0.7 });
  page.drawText(safe(sig.by), { x: x0 + 205, y: y0 + 40, size: 9, font: bold, color: INK });
  page.drawText(safe(sig.role), { x: x0 + 205, y: y0 + 30, size: 7.5, font, color: GREY });

  // Date d'expédition demandée
  page.drawText(safe('Date d’expédition demandée :'), { x: x0, y: y0 + 16, size: 9, font, color: INK });
  page.drawText(safe(`${fr(sig.etdWanted)} (S${d2(isoWeek(sig.etdWanted))})`), { x: x0 + 132, y: y0 + 16, size: 10.5, font: bold, color: BLUE });
  page.drawText(safe(`Version ${doc.version} · ${doc.name}`.slice(0, 70)), { x: x0, y: y0 + 3, size: 7, font, color: GREY });
}

/** Bandeau « ANNULÉE » sur chaque page d'une version remplacée */
function drawCancelled(page: PDFPage, doc: ProformaDoc, by: ProformaDoc | undefined, bold: PDFFont) {
  const { width, height } = page.getSize();
  page.drawText('ANNULÉE', { x: width * 0.18, y: height * 0.38, size: 96, font: bold, color: RED, rotate: degrees(35), opacity: 0.28 });
  const t = safe(`ANNULÉE — remplacée par la proforma v${doc.cancelledBy!.version}${by?.signature ? ` signée le ${fr(by.signature.date)}` : ''}`);
  page.drawRectangle({ x: 20, y: height - 30, width: width - 40, height: 20, color: rgb(1, 0.93, 0.93), borderColor: RED, borderWidth: 1 });
  page.drawText(t, { x: 30, y: height - 23, size: 9.5, font: bold, color: RED });
}

/** PDF d'une version : original, + signature/tampon si signée, + bandeau si annulée */
export async function versionPdf(pf: Proforma, doc: ProformaDoc, ctx: PdfContext): Promise<Blob> {
  const { bytes, type } = await originalBytes(pf, doc, ctx);
  if (!doc.signature) {
    if (type === 'application/pdf') return new Blob([bytes as BlobPart], { type });
  }
  const pdf = await asPdf(bytes, type, doc.name);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pages = pdf.getPages();
  if (doc.signature) {
    const prev = pf.versions?.find((v) => v.version === doc.signature!.replaces);
    drawSignature(pages[pages.length - 1], doc, prev, ctx.company, font, bold);
  }
  if (doc.status === 'annulee' && doc.cancelledBy) {
    const by = pf.versions?.find((v) => v.version === doc.cancelledBy!.version);
    for (const p of pages) drawCancelled(p, doc, by, bold);
  }
  const out = await pdf.save();
  return new Blob([out as BlobPart], { type: 'application/pdf' });
}

/** Nom du fichier téléchargé selon l'état de la version */
export function versionFileName(pf: Proforma, doc: ProformaDoc) {
  const suffix = { a_signer: 'a-signer', signee: 'signee', annulee: 'ANNULEE', refusee: 'refusee', remplacee: 'remplacee' }[doc.status];
  return `${pf.id}_v${doc.version}_${suffix}.pdf`;
}

/** Bon de commande JONAS (articles saisis) : à télécharger par le fournisseur pour établir sa proforma */
export async function purchaseOrderPdf(pf: Proforma, ctx: PdfContext): Promise<Blob> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const c = ctx.company;
  const txt = (t: string, x: number, y: number, size = 9, f: PDFFont = font, color = INK) => page.drawText(safe(t), { x, y, size, font: f, color });
  txt(c.name || 'JONAS INTERNATIONAL', 40, 790, 16, bold, BLUE);
  txt([c.address, c.city].filter(Boolean).join(' · '), 40, 774, 9, font, GREY);
  if (c.vat) txt(`TVA / VAT : ${c.vat}`, 40, 762, 9, font, GREY);
  txt('BON DE COMMANDE / PURCHASE ORDER', 300, 790, 13, bold);
  txt(`No. ${pf.poNumber}  ·  ${pf.id}`, 300, 774, 10, bold);
  txt(`Date : ${fr(pf.order?.at.slice(0, 10) ?? pf.date)}`, 300, 760, 9);
  txt(`Fournisseur / Supplier : ${ctx.supplier.name}`, 40, 735, 10, bold);
  txt(`${ctx.supplier.city}, ${ctx.supplier.country} · ${ctx.supplier.contact.name} · ${ctx.supplier.contact.email}`, 40, 721, 9, font, GREY);
  txt(`Expédition demandée / Requested shipment : ${fr(pf.etd)} (S${d2(isoWeek(pf.etd))}) · FOB ${ctx.supplier.port} → Le Havre`, 40, 703, 9);
  let y = 675;
  const cols = [40, 115, 205, 380, 445, 505];
  page.drawRectangle({ x: 36, y: y - 6, width: 523, height: 20, color: rgb(0.93, 0.95, 0.99) });
  ['Réf. JONAS', 'EAN', 'Désignation / Description', 'Qté / Qty', 'PU / Price', 'Montant'].forEach((h, i) => txt(h, cols[i], y, 8.5, bold));
  y -= 22;
  let total = 0;
  for (const l of pf.lines) {
    const p = ctx.products.find((x) => x.id === l.productId);
    const amount = l.qty * l.price;
    total += amount;
    txt(p?.ref ?? l.productId, cols[0], y, 8.5);
    txt(p?.ean ?? '', cols[1], y, 8);
    txt((p?.name ?? '').slice(0, 34), cols[2], y, 8.5);
    txt(l.qty.toLocaleString('en-US'), cols[3], y, 8.5);
    txt(l.price.toFixed(2), cols[4], y, 8.5);
    txt(amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), cols[5], y, 8.5);
    page.drawLine({ start: { x: 36, y: y - 6 }, end: { x: 559, y: y - 6 }, thickness: 0.4, color: rgb(0.85, 0.85, 0.88) });
    y -= 18;
    if (y < 120) break;
  }
  y -= 6;
  txt(`TOTAL (${pf.currency ?? 'EUR'})`, cols[4] - 30, y, 10, bold);
  txt(total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), cols[5], y, 10, bold);
  y -= 26;
  txt(`Paiement / Payment : ${pf.depositPct} % d’acompte / deposit · solde / balance ${fr(pf.balanceDue)}`, 40, y, 9);
  txt('Merci de déposer votre proforma correspondante sur le portail JONAS. / Please upload your matching proforma on the JONAS portal.', 40, y - 16, 8.5, font, GREY);
  const out = await pdf.save();
  return new Blob([out as BlobPart], { type: 'application/pdf' });
}

/** Conditions d'achat JONAS pour une proforma : société, fournisseur, devise, acompte, solde, livraison */
export async function conditionsPdf(pf: Proforma, ctx: PdfContext): Promise<Blob> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const c = ctx.company;
  const txt = (t: string, x: number, y: number, size = 10, f: PDFFont = font, color = INK) => page.drawText(safe(t), { x, y, size, font: f, color });
  txt(c.name || 'JONAS INTERNATIONAL', 40, 790, 16, bold, BLUE);
  txt([c.address, c.city].filter(Boolean).join(' · '), 40, 774, 9, font, GREY);
  if (c.vat) txt(`TVA / VAT : ${c.vat}`, 40, 762, 9, font, GREY);
  txt("CONDITIONS D'ACHAT / PURCHASE CONDITIONS", 40, 725, 14, bold);
  txt(`${pf.id}${pf.poNumber ? `  ·  PO ${pf.poNumber}` : ''}  ·  ${pf.title}`, 40, 707, 10, bold);
  txt(`Fournisseur / Supplier : ${ctx.supplier.name} (${ctx.supplier.city}, ${ctx.supplier.country})`, 40, 690, 10);
  const total = pf.lines.reduce((t, l) => t + l.qty * l.price, 0);
  const cur = pf.currency ?? 'EUR';
  const rows: [string, string][] = [
    ['Devise / Currency', cur],
    ['Montant / Amount', `${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur}`],
    ['Acompte / Deposit', `${pf.depositPct} % à la commande / with order`],
    ['Solde / Balance', `le / on ${fr(pf.balanceDue)} (après départ, contre copie du BL / after departure, against B/L copy)`],
    ['Incoterm', `FOB ${ctx.supplier.port}`],
    ['Destination', 'Le Havre (France)'],
    ['Expédition / Shipment', `${fr(pf.etd)} (S${d2(isoWeek(pf.etd))})`],
    ['Arrivée prévue / ETA', `${fr(pf.eta)} (S${d2(isoWeek(pf.eta))})`],
  ];
  let y = 655;
  for (const [k, v] of rows) {
    txt(k, 40, y, 10, bold);
    txt(v, 200, y, 10);
    page.drawLine({ start: { x: 40, y: y - 7 }, end: { x: 555, y: y - 7 }, thickness: 0.4, color: rgb(0.85, 0.85, 0.88) });
    y -= 24;
  }
  y -= 10;
  const notes = [
    'Packs, étiquettes et codes-barres : uniquement selon les fichiers validés par JONAS (Direction, Moinard, fournisseur).',
    'Packs, labels and barcodes: only as per the files approved by JONAS (Direction, Moinard, supplier).',
    'Documents à fournir au départ / Documents due at departure : BL, Invoice, Packing List (portail JONAS / JONAS portal).',
    'Tolérance / Tolerance : +/- 5 % sur quantités et montant / on quantities and amount.',
  ];
  for (const n of notes) {
    txt(n, 40, y, 8.8, font, GREY);
    y -= 15;
  }
  const out = await pdf.save();
  return new Blob([out as BlobPart], { type: 'application/pdf' });
}

/** Meilleur PDF de la proforma : dernière version signée, sinon dernière déposée, sinon le bon de commande JONAS */
export async function proformaBestPdf(pf: Proforma, ctx: PdfContext): Promise<{ blob: Blob; name: string }> {
  const vs = [...(pf.versions ?? [])].sort((a, b) => b.version - a.version);
  const v = vs.find((x) => x.status === 'signee') ?? vs.find((x) => x.status === 'a_signer') ?? vs[0];
  if (v) return { blob: await versionPdf(pf, v, ctx), name: versionFileName(pf, v) };
  return { blob: await purchaseOrderPdf(pf, ctx), name: `${pf.id}_bon-de-commande.pdf` };
}

/** Document listé sur la proforma (ex. « Conditions d'achat.pdf ») : généré à la demande */
export async function proformaDocPdf(pf: Proforma, doc: string, ctx: PdfContext): Promise<{ blob: Blob; name: string } | null> {
  if (/^conditions/i.test(doc)) return { blob: await conditionsPdf(pf, ctx), name: `${pf.id}_conditions-achat.pdf` };
  return null;
}
