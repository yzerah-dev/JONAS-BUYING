// Photo produit : lue dans une proforma Excel (.xls et .xlsx), ou ajoutée à la main.
import CFB from 'cfb';
import { deflateSync } from 'node:zlib';
import * as XLSX from 'xlsx';
import { expect, go, loginAs, resetApp, signAsDirection, test, toast } from './fixtures';
import { sheetImages } from '../../src/lib/sheetImages';

/** PNG 2×2 d'une couleur */
function png(r: number, g: number, b: number) {
  const crcT = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const x of buf) c = crcT[(c ^ x) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const t = Buffer.concat([Buffer.from(type), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(t));
    return Buffer.concat([len, t, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(2, 0);
  ihdr.writeUInt32BE(2, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const row = Buffer.from([0, r, g, b, r, g, b]);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat([row, row]))), chunk('IEND', Buffer.alloc(0))]);
}

const rows = (photoRow: string) => [
  ['NINGBO HOME SOURCING IMP. & EXP. CO., LTD'],
  ['PROFORMA INVOICE', '', '', '', '', '', 'P/I No.:', 'PRIX99002'],
  [],
  ['Barcode', 'Item No.', '', 'Description', 'Quantity', '', 'CBM', 'Unit Price', 'Quantity', 'Image'],
  ['', 'buyer', 'ours', '', 'Inner', 'Outer', '', 'USD', 'PCS', ''],
  ['', 'LTM101', 77001, 'VANITY CASE PINK', 0, 6, 0.05, 4.2, 600, photoRow],
  ['', '', 77002, 'TRAVEL PILLOW GREY', 0, 24, 0.08, 1.1, 2400, photoRow],
];

/** .xls (BIFF8) avec deux images incrustées, posées sur les lignes 6 et 7 (index 5 et 6) */
function xlsWithImages(images: Buffer[], anchorRows: number[]) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows('')), 'Sheet1');
  const xls = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'biff8' }));
  const rec = (ver: number, inst: number, type: number, body: Buffer) => {
    const h = Buffer.alloc(8);
    h.writeUInt16LE((inst << 4) | ver, 0);
    h.writeUInt16LE(type, 2);
    h.writeUInt32LE(body.length, 4);
    return Buffer.concat([h, body]);
  };
  const fbse = images.map((img) => {
    const blip = rec(0, 0x6e0, 0xf01e, Buffer.concat([Buffer.alloc(16, 7), Buffer.from([0xff]), img]));
    const head = Buffer.alloc(36);
    head[0] = 6;
    head[1] = 6;
    head.writeUInt32LE(blip.length, 20);
    head.writeUInt32LE(1, 24);
    return rec(2, 6, 0xf007, Buffer.concat([head, blip]));
  });
  const dgg = rec(0xf, 0, 0xf000, rec(0xf, images.length, 0xf001, Buffer.concat(fbse)));
  const shapes = anchorRows.map((row, i) => {
    const opt = Buffer.alloc(6);
    opt.writeUInt16LE(0x4104, 0);
    opt.writeUInt32LE(i + 1, 2);
    const anchor = Buffer.alloc(18);
    anchor.writeUInt16LE(9, 2);
    anchor.writeUInt16LE(row, 6);
    anchor.writeUInt16LE(10, 10);
    anchor.writeUInt16LE(row + 1, 14);
    return rec(0xf, 0, 0xf004, Buffer.concat([rec(3, 1, 0xf00b, opt), rec(0, 0, 0xf010, anchor)]));
  });
  const dg = rec(0xf, 0, 0xf002, rec(0xf, 0, 0xf003, Buffer.concat(shapes)));
  const biff = (type: number, body: Buffer) => {
    const h = Buffer.alloc(4);
    h.writeUInt16LE(type, 0);
    h.writeUInt16LE(body.length, 2);
    return Buffer.concat([h, body]);
  };
  const cfb = CFB.read(xls, { type: 'buffer' });
  const entry = CFB.find(cfb, 'Workbook')!;
  const w = Buffer.from(entry.content as Uint8Array);
  // Groupe de dessins avant la fin du classeur, dessin de la feuille juste après son début
  const out: Buffer[] = [];
  let bofs = 0;
  const group = biff(0x00eb, dgg);
  for (let o = 0; o < w.length; ) {
    const type = w.readUInt16LE(o);
    const len = w.readUInt16LE(o + 2);
    const r = Buffer.from(w.subarray(o, o + 4 + len));
    // Position des feuilles (BoundSheet8) décalée du groupe de dessins inséré
    if (type === 0x0085) r.writeUInt32LE(r.readUInt32LE(4) + group.length, 4);
    if (type === 0x000a && bofs === 1) out.push(group);
    out.push(r);
    if (type === 0x0809 && ++bofs === 2) out.push(biff(0x00ec, dg));
    o += 4 + len;
  }
  entry.content = Buffer.concat(out);
  entry.size = entry.content.length;
  return Buffer.from(CFB.write(cfb, { type: 'buffer' }) as Uint8Array);
}

/** .xlsx avec une image dessinée (ancrée ligne 6) et une image dans une cellule WPS (DISPIMG, ligne 7) */
function xlsxWithImages(a: Buffer, b: Buffer) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows('')), 'Sheet1');
  const zip = CFB.read(Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })), { type: 'buffer' });
  const add = (path: string, content: string | Buffer) => CFB.utils.cfb_add(zip, path, typeof content === 'string' ? Buffer.from(content) : content);
  const R = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  add('xl/media/image1.png', a);
  add('xl/media/image2.png', b);
  add(
    'xl/drawings/drawing1.xml',
    `<xdr:wsDr xmlns:xdr="x" xmlns:a="a" ${R}><xdr:twoCellAnchor><xdr:from><xdr:col>9</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>5</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:pic><xdr:blipFill><a:blip r:embed="rId1"/></xdr:blipFill></xdr:pic></xdr:twoCellAnchor></xdr:wsDr>`,
  );
  add('xl/drawings/_rels/drawing1.xml.rels', `<Relationships><Relationship Id="rId1" Target="../media/image1.png"/></Relationships>`);
  add(
    'xl/cellimages.xml',
    `<etc:cellImages xmlns:etc="e" xmlns:xdr="x" xmlns:a="a" ${R}><etc:cellImage><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="2" name="ID_PILLOW"/></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId1"/></xdr:blipFill></xdr:pic></etc:cellImage></etc:cellImages>`,
  );
  add('xl/_rels/cellimages.xml.rels', `<Relationships><Relationship Id="rId1" Target="media/image2.png"/></Relationships>`);
  // Cellule J7 : =DISPIMG("ID_PILLOW",1)
  const sheetEntry = CFB.find(zip, '/xl/worksheets/sheet1.xml')!;
  const sheet = Buffer.from(sheetEntry.content as Uint8Array)
    .toString()
    .replace(/(<row r="7"[^>]*>)/, '$1<c r="J7" t="str"><f>_xlfn.DISPIMG(&quot;ID_PILLOW&quot;,1)</f><v>=DISPIMG("ID_PILLOW",1)</v></c>');
  sheetEntry.content = Buffer.from(sheet);
  sheetEntry.size = sheetEntry.content.length;
  return Buffer.from(CFB.write(zip, { type: 'buffer', fileType: 'zip' }) as Uint8Array);
}

const PINK = png(240, 120, 160);
const GREY = png(120, 120, 120);

test('images incrustées : .xls (OfficeArt) et .xlsx (dessin + image dans la cellule WPS), avec leur ligne', async () => {
  const xls = await sheetImages(new Uint8Array(xlsWithImages([PINK, GREY], [5, 6])));
  expect(xls.map((i) => [i.row, i.blob.type, i.blob.size])).toEqual([
    [5, 'image/png', PINK.length],
    [6, 'image/png', GREY.length],
  ]);
  const xlsx = await sheetImages(new Uint8Array(xlsxWithImages(PINK, GREY)));
  expect(xlsx.map((i) => [i.row, i.blob.type, i.blob.size])).toEqual([
    [5, 'image/png', PINK.length],
    [6, 'image/png', GREY.length],
  ]);
});

for (const kind of ['xls', 'xlsx'] as const) {
  test(`proforma .${kind} avec photos : chaque produit créé reçoit la photo de sa ligne`, async ({ page }) => {
    await resetApp(page);
    await loginAs(page, 'PEARL');
    await go(page, 'portail/proformas');
    await page.getByRole('button', { name: 'Nouvelle proforma' }).click();
    const dlg = page.getByRole('dialog');
    await page.locator('#np-title').fill('Accessoires voyage');
    const buffer = kind === 'xls' ? xlsWithImages([PINK, GREY], [5, 6]) : xlsxWithImages(PINK, GREY);
    await dlg.getByLabel(/Proforma du fournisseur/).setInputFiles({ name: `PRIX99002.${kind}`, mimeType: '', buffer });
    await expect(toast(page)).toContainText('2 ligne(s) lue(s)');
    await expect(dlg.locator('.np-line-wrap').nth(0).locator('.np-pic img')).toBeVisible();
    await expect(dlg.locator('.np-line-wrap').nth(1).locator('.np-pic img')).toBeVisible();
    await dlg.getByRole('button', { name: 'Envoyer à JONAS' }).click();
    await expect(toast(page)).toContainText('envoyée à JONAS');
    await signAsDirection(page, 'PF-2026-NINGBO-01');

    const size = async (ref: string) =>
      page.evaluate(async (ref) => {
        const k = Object.keys(localStorage).find((x) => x.startsWith('jonas-buying-state'))!;
        const p = (JSON.parse(localStorage.getItem(k)!).products as { ref: string; supplierRef?: string; photo?: { fileId: string } }[]).find((x) => x.ref === ref || x.supplierRef === ref);
        if (!p?.photo) return -1;
        const db = await new Promise<IDBDatabase>((ok) => {
          const r = indexedDB.open('jonas-buying-files');
          r.onsuccess = () => ok(r.result);
        });
        const blob = await new Promise<Blob | undefined>((ok) => {
          const r = db.transaction(db.objectStoreNames[0]).objectStore(db.objectStoreNames[0]).get(p.photo!.fileId);
          r.onsuccess = () => ok(r.result as Blob | undefined);
        });
        return blob?.size ?? -2;
      }, ref);
    expect(await size('LTM101')).toBe(PINK.length);
    expect(await size('77002')).toBe(GREY.length);

    // Fiche produit : la photo remplace le pictogramme
    await loginAs(page, 'David');
    await go(page, 'produits/LTM101');
    await expect(page.locator('main .thumb img.product-pic').first()).toBeVisible();
  });
}

test('noms de fichiers → produits : réf. JONAS, suffixes, EAN, réf. fournisseur, inconnus et formats refusés', async () => {
  const { matchPhotoFiles } = await import('../../src/lib/productPhotos');
  const P = (ref: string, ean: string, supplierRef?: string) => ({ id: ref, ref, ean, supplierRef }) as never;
  const products = [P('LTM007', '3701571431633', '71726'), P('CP-T001', '3700000000017', 'T-88')];
  const f = (name: string, type = 'image/jpeg') => new File([new Uint8Array(10)], name, { type });
  const m = matchPhotoFiles(
    [f('LTM007-2.jpg'), f('LTM007.jpg'), f('ltm007_dos.png'), f('CP-T001 (3).webp'), f('3700000000017.jpg'), f('71726.jpg'), f('inconnu.jpg'), f('CP-T001.pdf', 'application/pdf')],
    products,
  );
  const got = m.map((x) => [x.file.name, (x.product as { ref?: string } | undefined)?.ref ?? null, x.by ?? null, x.problem ?? null]);
  // Photo sans suffixe d'abord : elle devient la principale
  const names = got.map((g) => g[0]);
  expect(names.indexOf('LTM007.jpg')).toBeLessThan(names.indexOf('LTM007-2.jpg'));
  expect([...got].sort((a, b) => String(a[0]).localeCompare(String(b[0])))).toEqual(
    [
      ['3700000000017.jpg', 'CP-T001', 'ean', null],
      ['71726.jpg', 'LTM007', 'refFournisseur', null],
      ['CP-T001 (3).webp', 'CP-T001', 'ref', null],
      ['CP-T001.pdf', 'CP-T001', 'ref', 'type'],
      ['inconnu.jpg', null, null, null],
      ['LTM007.jpg', 'LTM007', 'ref', null],
      ['LTM007-2.jpg', 'LTM007', 'ref', null],
      ['ltm007_dos.png', 'LTM007', 'ref', null],
    ].sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  );
});

const photoCount = (page: import('@playwright/test').Page, ref: string) =>
  page.evaluate((ref) => {
    const k = Object.keys(localStorage).find((x) => x.startsWith('jonas-buying-state'))!;
    const p = (JSON.parse(localStorage.getItem(k)!).products as { ref: string; photo?: { fileId: string }; photos?: unknown[] }[]).find((x) => x.ref === ref)!;
    return { total: (p.photo ? 1 : 0) + (p.photos?.length ?? 0), main: p.photo?.fileId ?? '' };
  }, ref);

test('galerie de la fiche produit : plusieurs photos, glisser-déposer, photo principale, suppression', async ({ page }) => {
  await resetApp(page);
  await loginAs(page, 'David');
  await go(page, 'produits/CP-T001');
  await expect(page.locator('main .gal-main img')).toHaveCount(0);
  // Plusieurs photos d'un coup (bouton +)
  await page.getByLabel('Ajouter des photos CP-T001').setInputFiles([
    { name: 'face.png', mimeType: 'image/png', buffer: PINK },
    { name: 'dos.png', mimeType: 'image/png', buffer: GREY },
  ]);
  await expect(toast(page)).toContainText('2 photo(s) ajoutée(s) pour CP-T001');
  await expect(page.locator('main .gal-thumb img')).toHaveCount(2);
  await expect(page.locator('main .gal-main img.product-pic')).toBeVisible();
  const first = await photoCount(page, 'CP-T001');
  expect(first.total).toBe(2);

  // Glisser-déposer une photo sur le grand cadre
  const dt = await page.evaluateHandle((b64) => {
    const d = new DataTransfer();
    d.items.add(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], 'detail.png', { type: 'image/png' }));
    return d;
  }, PINK.toString('base64'));
  await page.locator('main .gal-main').dispatchEvent('dragover', { dataTransfer: dt });
  await expect(page.locator('main .gal-over')).toBeVisible();
  await page.locator('main .gal-main').dispatchEvent('drop', { dataTransfer: dt });
  await expect(toast(page)).toContainText('1 photo(s) ajoutée(s) pour CP-T001');
  await expect(page.locator('main .gal-thumb img')).toHaveCount(3);

  // La 2e photo devient la principale
  await page.getByRole('button', { name: 'Photo 2' }).click();
  await page.getByRole('button', { name: 'Photo principale' }).click();
  await expect(toast(page)).toContainText('Photo principale changée pour CP-T001');
  const after = await photoCount(page, 'CP-T001');
  expect(after.main).not.toBe(first.main);
  expect(after.total).toBe(3);
  // Format refusé
  await page.getByLabel('Ajouter des photos CP-T001').setInputFiles({ name: 'fiche.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF') });
  await expect(toast(page)).toContainText('Photo : JPG, PNG, WEBP ou GIF');
  // Suppression de la photo affichée
  await page.getByLabel('Retirer la photo CP-T001').click();
  await expect(toast(page)).toContainText('Photo retirée pour CP-T001');
  expect((await photoCount(page, 'CP-T001')).total).toBe(2);

  // Liste des produits : la photo principale
  await go(page, 'produits');
  await expect(page.locator('main img.product-pic').first()).toBeVisible();
});

test('import de photos en lot : JONAS (tout le catalogue) et fournisseur (ses produits seulement)', async ({ page }) => {
  await resetApp(page);
  const ean = await page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.startsWith('jonas-buying-state'))!;
    return (JSON.parse(localStorage.getItem(k)!).products as { ref: string; ean: string }[]).find((x) => x.ref === 'AB-M026')!.ean;
  });
  await loginAs(page, 'David');
  await go(page, 'produits');
  await page.getByRole('button', { name: 'Importer des photos' }).click();
  const dlg = page.getByRole('dialog', { name: 'Importer des photos en lot' });
  await dlg.getByLabel('Importer des photos en lot').setInputFiles([
    { name: 'CP-T001.png', mimeType: 'image/png', buffer: PINK },
    { name: 'CP-T001-2.png', mimeType: 'image/png', buffer: GREY },
    { name: `${ean}.png`, mimeType: 'image/png', buffer: PINK },
    { name: 'photo-vacances.jpg', mimeType: 'image/jpeg', buffer: GREY },
  ]);
  await expect(dlg).toContainText('3 photo(s) reconnue(s) pour 2 produit(s) · 1 non reconnue(s)');
  await expect(dlg.locator('tr', { hasText: `${ean}.png` })).toContainText('AB-M026');
  await expect(dlg.locator('tr', { hasText: 'photo-vacances.jpg' })).toContainText('Non reconnu');
  await dlg.getByRole('button', { name: 'Importer 3 photo(s)' }).click();
  await expect(toast(page)).toContainText('3 photo(s) importée(s) pour 2 produit(s)');
  expect((await photoCount(page, 'CP-T001')).total).toBe(2);
  expect((await photoCount(page, 'AB-M026')).total).toBe(1);

  // Fournisseur Tide : un produit d'un autre fournisseur n'est pas reconnu
  await loginAs(page, 'Tide');
  await go(page, 'portail/produits');
  await page.getByRole('button', { name: 'Importer des photos' }).click();
  const d2 = page.getByRole('dialog', { name: 'Importer des photos en lot' });
  await d2.getByLabel('Importer des photos en lot').setInputFiles([
    { name: 'CP-C042.png', mimeType: 'image/png', buffer: PINK },
    { name: 'AB-M026.png', mimeType: 'image/png', buffer: GREY },
  ]);
  await expect(d2).toContainText('1 photo(s) reconnue(s) pour 1 produit(s) · 1 non reconnue(s)');
  await d2.getByRole('button', { name: 'Importer 1 photo(s)' }).click();
  await expect(toast(page)).toContainText('1 photo(s) importée(s) pour 1 produit(s)');
  await expect(page.locator('main tr', { hasText: 'CP-C042' }).locator('img.product-pic')).toBeVisible();
  expect((await photoCount(page, 'AB-M026')).total).toBe(1);
});
