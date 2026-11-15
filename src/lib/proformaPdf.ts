// PDF des proformas : original déposé par le fournisseur, version signée (signature + tampon JONAS
// + date + date d'expédition demandée), version annulée (bandeau « ANNULÉE »).
// Les versions signées / annulées sont recalculées à la demande depuis l'original et les métadonnées :
// rien d'autre que le fichier du fournisseur n'est stocké.
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { Proforma, ProformaDoc, Supplier, Product } from '../data/types';
import { getBlob } from './files';

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
  txt('Buyer: JONAS FRANCE - Paris, France', 40, 740, 10, bold);
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

/** Ouvre l'original comme PDF (une image devient une page A4) */
async function asPdf(bytes: Uint8Array, type: string): Promise<PDFDocument> {
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

/** Signature + tampon JONAS + date + date d'expédition demandée, en bas à droite de la dernière page */
function drawSignature(page: PDFPage, doc: ProformaDoc, prev: ProformaDoc | undefined, font: PDFFont, bold: PDFFont) {
  const sig = doc.signature!;
  const { width } = page.getSize();
  const w = 250;
  const h = 132;
  const x = width - w - 28;
  const y = 28;
  page.drawRectangle({ x: x - 6, y: y - 6, width: w + 12, height: h + (prev ? 30 : 12), color: rgb(1, 1, 1), opacity: 0.92 });
  // Tampon : double cadre bleu, légèrement incliné
  const rot = degrees(-3);
  page.drawRectangle({ x, y: y + 40, width: 138, height: h - 44, borderColor: BLUE, borderWidth: 2, rotate: rot, borderOpacity: 0.9 });
  page.drawRectangle({ x: x + 4, y: y + 44, width: 130, height: h - 52, borderColor: BLUE, borderWidth: 0.7, rotate: rot, borderOpacity: 0.9 });
  const sx = x + 10;
  let sy = y + h - 26;
  const line = (t: string, size: number, f = bold, color = BLUE) => {
    page.drawText(safe(t), { x: sx, y: sy, size, font: f, color, rotate: rot, opacity: 0.92 });
    sy -= size + 4;
  };
  line('JONAS FRANCE', 13);
  line('Importateur · Paris', 7.5, font);
  line('BON POUR ACCORD', 10);
  line(`Signé le ${fr(sig.date)}`, 8.5, bold);
  // Signature manuscrite + signataire
  page.drawSvgPath(signaturePath(sig.by), { x: x + 150, y: y + h - 40, borderColor: rgb(0.05, 0.12, 0.45), borderWidth: 1.4, scale: 0.75 });
  page.drawText(safe(sig.by), { x: x + 150, y: y + h - 70, size: 8.5, font: bold, color: INK });
  page.drawText(safe(sig.role), { x: x + 150, y: y + h - 81, size: 7.5, font, color: GREY });
  // Date d'expédition demandée
  page.drawText(safe('Date d’expédition demandée :'), { x, y: y + 22, size: 8.5, font, color: INK });
  page.drawText(safe(`${fr(sig.etdWanted)} (S${d2(isoWeek(sig.etdWanted))})`), { x: x + 128, y: y + 22, size: 10, font: bold, color: BLUE });
  page.drawText(safe(`Version ${doc.version} · ${doc.name}`.slice(0, 60)), { x, y: y + 8, size: 7, font, color: GREY });
  if (prev?.signature)
    page.drawText(safe(`Annule et remplace la proforma v${prev.version} signée le ${fr(prev.signature.date)}`), { x, y: y + h + 10, size: 8, font: bold, color: RED });
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
  const pdf = await asPdf(bytes, type);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pages = pdf.getPages();
  if (doc.signature) {
    const prev = pf.versions?.find((v) => v.version === doc.signature!.replaces);
    drawSignature(pages[pages.length - 1], doc, prev, font, bold);
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
