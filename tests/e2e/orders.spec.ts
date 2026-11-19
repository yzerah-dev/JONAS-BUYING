import { readFileSync } from 'node:fs';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import * as XLSX from 'xlsx';
import { expect, go, loginAs, resetApp, test, toast } from './fixtures';
import type { Page } from '@playwright/test';

const state = (page: Page) =>
  page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.startsWith('jonas-buying-state'))!;
    return JSON.parse(localStorage.getItem(k)!) as {
      products: { id: string; supplierRef?: string; supplierId: string }[];
      proformas: { id: string; status: string; order?: { source: string; file?: { name: string } }; versions?: unknown[]; lines: { productId: string; qty: number; price: number }[] }[];
    };
  });

/** Export Excel type (ERP) : en-têtes puis lignes */
function excel(rows: (string | number)[][]) {
  const ws = XLSX.utils.aoa_to_sheet([['Commande JONAS'], [], ['Code article', 'Libellé', 'Gencod', 'Quantité', 'Prix unitaire', 'PCB'], ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Commande');
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

/** Bon de commande TCI en PDF (tableau Réf. | Désignation | Qté | PU | Montant) */
async function bcPdf(rows: [string, string, number, number][]) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText('BON DE COMMANDE TCI', { x: 40, y: 790, size: 14, font });
  const xs = [40, 120, 330, 400, 470];
  rows.forEach(([ref, name, qty, price], r) => [ref, name, String(qty), price.toFixed(2), (qty * price).toFixed(2)].forEach((v, i) => page.drawText(v, { x: xs[i], y: 680 - r * 20, size: 9, font })));
  return Buffer.from(await pdf.save());
}

async function openOrder(page: Page, supplier: string) {
  await loginAs(page, 'David');
  await go(page, 'proformas');
  await page.getByRole('button', { name: 'Nouvelle commande' }).click();
  await page.locator('#np-sup').fill(supplier);
  await page.getByRole('option').first().click();
  await page.locator('#np-title').fill('Commande test');
  return page.getByRole('dialog');
}

test.describe('Commande JONAS en attente de proforma', () => {
  test.beforeEach(async ({ page }) => {
    await resetApp(page);
  });

  test('import Excel → commande → le fournisseur télécharge le bon de commande et dépose sa proforma', async ({ page }) => {
    const dlg = await openOrder(page, 'tide');
    await dlg.getByRole('button', { name: 'Importer un Excel' }).click();
    await dlg.getByLabel('Importer un Excel').setInputFiles({
      name: 'commande-tide.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: excel([
        ['CP-T001', 'Tong femme paillettes', '', 4000, 6.5, 24],
        ['', 'Tong enfant licorne', '', 1500, 2.2, 48],
      ]),
    });
    await expect(toast(page)).toContainText('2 article(s) importé(s)');
    await expect(dlg.locator('.np-line-wrap').nth(0)).toContainText('Reconnu (réf.)');
    await expect(dlg.locator('.np-line-wrap').nth(1)).toContainText('Nouveau produit');
    await expect(dlg.getByLabel('Pcs/carton 2')).toHaveValue('48');
    await dlg.getByLabel('m³/carton 2').fill('0.05');
    await dlg.getByRole('button', { name: 'Passer la commande' }).click();
    await expect(toast(page)).toContainText('Commande PF-2026-0154 passée');
    await expect(page.locator('.page-head')).toContainText('À signer');
    const pf = (await state(page)).proformas.find((p) => p.id === 'PF-2026-0154')!;
    expect(pf.order).toMatchObject({ source: 'excel', file: { name: 'commande-tide.xlsx' } });
    expect(pf.versions ?? []).toHaveLength(0);

    // Le fournisseur la voit, télécharge le bon de commande et dépose sa proforma
    await loginAs(page, 'Tide');
    await expect(page.locator('main')).toContainText('proforma(s) à déposer');
    await go(page, 'portail/proformas?pf=PF-2026-0154');
    const box = page.locator('.po-box');
    await expect(box).toContainText('JONAS vous a passé cette commande');
    const [po] = await Promise.all([page.waitForEvent('download'), box.getByRole('button', { name: 'Télécharger le bon de commande' }).click()]);
    expect(po.suggestedFilename()).toMatch(/_bon-de-commande\.pdf$/);
    expect(readFileSync(await po.path()).subarray(0, 4).toString()).toBe('%PDF');
    await page.getByLabel('Déposer la proforma').setInputFiles({ name: 'PI-TIDE.pdf', mimeType: 'application/pdf', buffer: await bcPdf([['CP-T001', 'Tong femme paillettes', 4000, 6.5]]) });
    await page.getByRole('dialog').getByRole('button', { name: 'Déposer sans les lignes' }).click();
    await expect(toast(page)).toContainText('Proforma v1 déposée');
    await expect(page.locator('.pv-row')).toContainText('PI-TIDE.pdf');
  });

  test('bon de commande TCI (PDF) importé', async ({ page }) => {
    const dlg = await openOrder(page, 'northbay');
    await dlg.getByRole('button', { name: 'Bon de commande TCI (PDF)' }).click();
    await dlg.getByLabel('Bon de commande TCI (PDF)').setInputFiles({ name: 'BC-TCI-4471.pdf', mimeType: 'application/pdf', buffer: await bcPdf([['JO-R301', 'Boîte de rangement 30 L', 3000, 2.1]]) });
    await expect(toast(page)).toContainText('1 article(s) importé(s)');
    await dlg.getByRole('button', { name: 'Passer la commande' }).click();
    await expect(toast(page)).toContainText('Commande PF-2026-0154 passée');
    const pf = (await state(page)).proformas.find((p) => p.id === 'PF-2026-0154')!;
    expect(pf.order).toMatchObject({ source: 'bc', file: { name: 'BC-TCI-4471.pdf' } });
    expect(pf.lines).toEqual([{ productId: 'JO-R301', qty: 3000, price: 2.1 }]);
    await page.getByRole('button', { name: /^Documents/ }).click();
    await expect(page.locator('.po-box')).toContainText('bon de commande TCI');
    await expect(page.locator('.po-box')).toContainText('En attente de la proforma du fournisseur');
  });
});
