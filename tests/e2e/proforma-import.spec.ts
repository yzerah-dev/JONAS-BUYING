import { PDFDocument, StandardFonts } from 'pdf-lib';
import { expect, go, loginAs, resetApp, test, toast } from './fixtures';
import type { Page } from '@playwright/test';
import * as XLSX from 'xlsx';

/** Proforma fournisseur en PDF : un tableau Réf. | Désignation | Qté | Prix | Montant */
async function proformaPdf(rows: [string, string, number, number][]) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText('PROFORMA INVOICE No. 2026-118', { x: 40, y: 790, size: 14, font });
  const xs = [40, 120, 330, 400, 470];
  ['Ref.', 'Description', 'Qty', 'Unit price', 'Amount'].forEach((h, i) => page.drawText(h, { x: xs[i], y: 700, size: 9, font }));
  rows.forEach(([ref, name, qty, price], r) => {
    const y = 680 - r * 20;
    [ref, name, String(qty), price.toFixed(2), (qty * price).toFixed(2)].forEach((v, i) => page.drawText(v, { x: xs[i], y, size: 9, font }));
  });
  page.drawText('TOTAL', { x: 400, y: 560, size: 10, font });
  return Buffer.from(await pdf.save());
}

/** EAN-13 valide (chiffre de contrôle) */
const eanOk = (e: string) => /^\d{13}$/.test(e) && [...e.slice(0, 12)].reduce((t, c, i) => t + Number(c) * (i % 2 ? 3 : 1), 0) % 10 === (10 - Number(e[12])) % 10;

const state = (page: Page) =>
  page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.startsWith('jonas-buying-state'))!;
    return JSON.parse(localStorage.getItem(k)!) as {
      products: { id: string; ref: string; ean: string; supplierRef?: string; name: string; supplierId: string; pcb: number }[];
      proformas: { id: string; lines: { productId: string; qty: number; price: number }[] }[];
    };
  });

test.describe('Proforma déposée : lignes lues, produits reconnus ou créés', () => {
  test.beforeEach(async ({ page }) => {
    await resetApp(page);
  });

  test('nouvelle proforma du fournisseur : produit existant reconnu, nouveau produit créé', async ({ page }) => {
    await loginAs(page, 'Tide');
    await go(page, 'portail/proformas');
    await page.getByRole('button', { name: 'Nouvelle proforma' }).click();
    const dlg = page.getByRole('dialog');
    await page.locator('#np-title').fill('Tongs été 2027');
    await dlg.getByLabel(/Proforma du fournisseur/).setInputFiles({
      name: 'PI-TIDE-118.pdf',
      mimeType: 'application/pdf',
      buffer: await proformaPdf([
        ['CP-T001', 'Tong femme paillettes', 6000, 6.83],
        ['CP-T999', 'Tong enfant arc-en-ciel', 3000, 2.1],
      ]),
    });
    await expect(toast(page)).toContainText('2 ligne(s) lue(s)');
    await expect(dlg.locator('.np-line-wrap').nth(0)).toContainText('Reconnu (réf.)');
    await expect(dlg.getByLabel('Quantité 1')).toHaveValue('6000');
    await expect(dlg.locator('.np-line-wrap').nth(1)).toContainText('Nouveau produit');
    // La référence lue est celle du fournisseur ; JONAS attribue sa référence et son EAN
    await expect(dlg.getByLabel('Réf. fournisseur 2')).toHaveValue('CP-T999');
    const codes = (await dlg.locator('.np-codes').innerText()).match(/Réf\. JONAS (\S+) · EAN JONAS (\d{13})/)!;
    await expect(dlg.getByLabel('Désignation 2')).toHaveValue('Tong enfant arc-en-ciel');
    // Incomplet tant que le colisage du nouveau produit manque
    await dlg.getByRole('button', { name: 'Envoyer à JONAS' }).click();
    await expect(toast(page)).toContainText('Lignes incomplètes');
    await dlg.getByLabel('Pcs/carton 2').fill('48');
    await dlg.getByLabel('m³/carton 2').fill('0,06');
    await dlg.getByRole('button', { name: 'Envoyer à JONAS' }).click();
    await expect(toast(page)).toContainText('PF-2026-0154 envoyée à JONAS');

    const s = await state(page);
    const created = s.products.find((p) => p.supplierRef === 'CP-T999')!;
    expect(created).toMatchObject({ ref: codes[1], ean: codes[2], name: 'Tong enfant arc-en-ciel', supplierId: 'tide', pcb: 48 });
    expect(created.ref).not.toBe('CP-T999');
    expect(eanOk(created.ean)).toBe(true);
    expect(s.products.filter((p) => p.ean === created.ean)).toHaveLength(1);
    expect(s.proformas.find((p) => p.id === 'PF-2026-0154')!.lines).toEqual([
      { productId: 'CP-T001', qty: 6000, price: 6.83 },
      { productId: created.id, qty: 3000, price: 2.1 },
    ]);
    // Le produit existe dans le catalogue JONAS, avec sa référence fournisseur
    await loginAs(page, 'David');
    await go(page, `produits/${created.id}`);
    await expect(page.locator('main')).toContainText('Tong enfant arc-en-ciel');
    await expect(page.locator('main')).toContainText('Réf. fournisseur : CP-T999');
  });

  test('dépôt sur une proforma existante : vérification des lignes puis mise à jour', async ({ page }) => {
    await loginAs(page, 'Li Qiang');
    await go(page, 'portail/proformas?pf=PF-2026-0150');
    const s0 = await state(page);
    const ref = s0.products.find((p) => p.supplierId === 'wenzhoutex')!;
    await page.getByLabel('Déposer la proforma').setInputFiles({
      name: 'PI-WZ.pdf',
      mimeType: 'application/pdf',
      buffer: await proformaPdf([
        [ref.id, ref.name, 1200, 3.5],
        ['WZ-NEW01', 'Drap de plage rayé XXL', 800, 5.25],
      ]),
    });
    const dlg = page.getByRole('dialog', { name: /Lignes lues sur PI-WZ.pdf/ });
    await expect(dlg).toContainText('Les lignes remplacent celles de la proforma');
    await dlg.getByLabel('Pcs/carton 2').fill('24');
    await dlg.getByLabel('m³/carton 2').fill('0.08');
    await dlg.getByRole('button', { name: 'Déposer avec ces lignes' }).click();
    await expect(toast(page)).toContainText('1 nouveau(x) produit(s) créé(s)');
    const s1 = await state(page);
    const created = s1.products.find((p) => p.supplierRef === 'WZ-NEW01')!;
    expect(eanOk(created.ean)).toBe(true);
    expect(s1.proformas.find((p) => p.id === 'PF-2026-0150')!.lines).toEqual([
      { productId: ref.id, qty: 1200, price: 3.5 },
      { productId: created.id, qty: 800, price: 5.25 },
    ]);
    // Une nouvelle proforma avec la même référence fournisseur reconnaît le produit
    await page.getByRole('button', { name: 'Nouvelle proforma' }).click();
    const dlg2 = page.getByRole('dialog');
    await dlg2.getByLabel(/Proforma du fournisseur/).setInputFiles({ name: 'PI-WZ-2.pdf', mimeType: 'application/pdf', buffer: await proformaPdf([['WZ-NEW01', 'Drap de plage rayé XXL', 500, 5.25]]) });
    await expect(dlg2.locator('.np-line-wrap').first()).toContainText('Reconnu (réf.)');
  });

  test('demande de modification : les lignes lues ne s’appliquent qu’à la signature de la Direction', async ({ page }) => {
    const before = (await state(page)).proformas.find((p) => p.id === 'PF-2026-0141')!.lines;
    await loginAs(page, 'Tide');
    await go(page, 'portail/proformas?pf=PF-2026-0141');
    await page.getByRole('button', { name: 'Demander une modification' }).click();
    await page.locator('#pv-reason-PF-2026-0141').fill('Quantité de claquettes augmentée');
    await page.getByLabel('Demander une modification').setInputFiles({
      name: 'PI-TIDE-rev2.pdf',
      mimeType: 'application/pdf',
      buffer: await proformaPdf([[before[0].productId, 'Claquette', 9000, 2.5]]),
    });
    const dlg = page.getByRole('dialog', { name: /Lignes lues sur PI-TIDE-rev2.pdf/ });
    await expect(dlg).toContainText('appliquées à la signature');
    await dlg.getByRole('button', { name: 'Déposer avec ces lignes' }).click();
    await expect(toast(page)).toContainText('Proforma v2 déposée');
    expect((await state(page)).proformas.find((p) => p.id === 'PF-2026-0141')!.lines).toEqual(before);

    await loginAs(page, 'Rudy Zerah');
    await go(page, 'proformas/PF-2026-0141');
    await page.locator('.page-head').getByRole('button', { name: 'Signer la modification v2' }).click();
    await page.getByRole('button', { name: 'Signer et tamponner' }).click();
    expect((await state(page)).proformas.find((p) => p.id === 'PF-2026-0141')!.lines).toEqual([{ productId: before[0].productId, qty: 9000, price: 2.5 }]);
  });

  test('une référence JONAS existante (même d’un autre fournisseur) est ce produit : rien à créer', async ({ page }) => {
    const n0 = (await state(page)).products.length;
    await loginAs(page, 'David');
    await go(page, 'proformas');
    await page.getByRole('button', { name: 'Nouvelle commande' }).click();
    const dlg = page.getByRole('dialog');
    await page.locator('#np-sup').fill('tide');
    await page.getByRole('option', { name: /Tide/ }).click();
    await page.locator('#np-title').fill('Rangement (2e source)');
    await dlg.getByLabel(/Proforma du fournisseur/).setInputFiles({
      name: 'PI.pdf',
      mimeType: 'application/pdf',
      buffer: await proformaPdf([['JO-R301', 'Storage box 30L', 2000, 1.9]]),
    });
    const line = dlg.locator('.np-line-wrap').first();
    await expect(line).toContainText('Reconnu (réf.) · autre fournisseur');
    await expect(page.locator('#ln-prod-0')).toHaveValue(/JO-R301/);
    // Forcer un « nouveau produit » avec cette référence est refusé
    await page.locator('#ln-prod-0').click();
    await page.getByRole('option', { name: '+ Nouveau produit' }).click();
    await dlg.getByLabel('Réf. fournisseur 1').fill('JO-R301');
    await expect(line).toContainText('JO-R301 est déjà une référence JONAS');
    await line.getByRole('button', { name: 'Utiliser ce produit' }).click();
    await expect(line).toContainText('Reconnu (réf.) · autre fournisseur');
    await dlg.getByRole('button', { name: 'Créer la proforma' }).click();
    await expect(toast(page)).toContainText('PF-2026-0154 créée');
    const s = await state(page);
    expect(s.products.length).toBe(n0);
    expect(s.proformas.find((p) => p.id === 'PF-2026-0154')!.lines).toEqual([{ productId: 'JO-R301', qty: 2000, price: 1.9 }]);
  });
});

/** Proforma Excel (.xls) d'un fournisseur chinois : bloc société, conditions, en-tête sur deux lignes
 *  (Item No. buyer / ours, Quantity Inner / Outer), code-barres JONAS, CBM par carton et total */
function luggageXls() {
  const ws = XLSX.utils.aoa_to_sheet([
    ['', 'NINGBO HOME SOURCING IMP. & EXP. CO., LTD'],
    ['', 'RM 1711, NINGBO CHINA'],
    ['', '', '', 'Tel: 86 574 0000000', 'Fax: 86 574 0000000', '', 'Email: sales@example.com'],
    ['', '', '', '', 'PROFORMA INVOICE', '', '', '', '', '', '', 'P/I No.:', 'PRIX99001'],
    ['TO:', 'JONAS FRANCE', '', '', '', '', '', '', '', '', '', 'Date: ', 'NOV.20,2026'],
    ['', '', '', '', '', '', '', '', '', '', '', 'Order No.:', 'PRIX99001'],
    ['', '', '', '', '', '', '', '', '', '', '', 'Price Term:', 'FOB NINGBO,CHINA'],
    [],
    ['', 'Barcode', 'Item No.', '', 'Description', 'Item Packing', 'Quantity', '', 'CBM', 'CTN', 'Unit Price', 'Quantity', 'Amount ', 'Total', 'Image'],
    ['', '', 'buyer', 'ours ', '', '', 'Inner', 'Outer', '', '', 'USD ', 'PCS', 'USD', 'CBM'],
    [1, 3701571431633, 'LTM007', 71726, 'LUGGAGE SET OF 4 PIECE,16/20/24/28INCH, colors: pink,green,blue', 'SWING TAG', 0, 1, 0.10878, 3200, 30.5, 3200, 97600, 348.096],
    [2, '', '', 71727, 'TROLLEY 20INCH ABS, colors: black,silver', 'POLYBAG', 0, 2, 0.15, 500, 12.8, 1000, 12800, 75],
    ['', '', '', '', '', '', '', '', 'Total:', 3700, '', 4200, 110400, 423.096],
    ['1.More or less With 5% Both in Amount & Quantity Allowed.'],
    ['4. Term of Payment: ', '', '100% T/T 90 DAYS AFTER B/L DATE'],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'biff8' }));
}

test('proforma Excel .xls (en-tête sur deux lignes) : produits créés avec la réf. et le code-barres JONAS de la proforma', async ({ page }) => {
  await resetApp(page);
  await loginAs(page, 'PEARL');
  await go(page, 'portail/proformas');
  await page.getByRole('button', { name: 'Nouvelle proforma' }).click();
  const dlg = page.getByRole('dialog');
  await page.locator('#np-title').fill('Bagagerie Little Marcel');
  await dlg.getByLabel(/Proforma du fournisseur/).setInputFiles({ name: 'PRIX99001 - luggage set of 4.xls', mimeType: 'application/vnd.ms-excel', buffer: luggageXls() });
  await expect(toast(page)).toContainText('2 ligne(s) lue(s)');
  // Ligne 1 : réf. acheteur et code-barres JONAS repris ; réf. « ours » = réf. fournisseur ; colisage et volume lus
  await expect(dlg.locator('.np-line-wrap').nth(0)).toContainText('Nouveau produit');
  await expect(dlg.getByLabel('Quantité 1')).toHaveValue('3200');
  await expect(dlg.getByLabel('Prix unitaire 1')).toHaveValue('30.5');
  await expect(dlg.getByLabel('Réf. fournisseur 1')).toHaveValue('71726');
  await expect(dlg.getByLabel('Pcs/carton 1')).toHaveValue('1');
  await expect(dlg.getByLabel('m³/carton 1')).toHaveValue('0.10878');
  await expect(dlg.locator('.np-codes').nth(0)).toContainText('Réf. JONAS LTM007 · EAN JONAS 3701571431633');
  // Ligne 2 : sans réf. ni code-barres JONAS → attribués par JONAS
  await expect(dlg.getByLabel('Quantité 2')).toHaveValue('1000');
  await expect(dlg.getByLabel('Pcs/carton 2')).toHaveValue('2');
  await dlg.getByRole('button', { name: 'Envoyer à JONAS' }).click();
  await expect(toast(page)).toContainText('envoyée à JONAS');

  const s = await state(page);
  const lug = s.products.find((p) => p.supplierRef === '71726')!;
  expect(lug).toMatchObject({ ref: 'LTM007', ean: '3701571431633', supplierId: 'ningbohome', pcb: 1 });
  const trolley = s.products.find((p) => p.supplierRef === '71727')!;
  expect(trolley.ref).not.toBe('71727');
  expect(eanOk(trolley.ean)).toBe(true);
  expect(trolley.ean).not.toBe(lug.ean);

  // PA affiché dans la devise du fournisseur, tel que sur la proforma (jamais converti en euros)
  await loginAs(page, 'David');
  await go(page, 'produits/LTM007');
  await expect(page.locator('.kpis').first()).toContainText('30,50 USD');
  await expect(page.locator('dl.kv').filter({ hasText: 'PA unitaire' })).toContainText('30,50 USD');
  await go(page, 'produits');
  await page.getByPlaceholder(/Réf\., désignation/).fill('LTM007');
  await expect(page.locator('.pcard', { hasText: 'LTM007' })).toContainText('30,50 USD');
  // Produit d'un fournisseur en euros : inchangé
  await page.getByPlaceholder(/Réf\., désignation/).fill('CP-T001');
  await expect(page.locator('.pcard', { hasText: 'CP-T001' })).toContainText('€');
});
