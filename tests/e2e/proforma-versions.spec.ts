import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { expect, go, loginAs, resetApp, test, toast } from './fixtures';
import type { Page } from '@playwright/test';

/** PDF minimal « déposé par le fournisseur » */
async function supplierPdf(title: string) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  page.drawText(title, { x: 50, y: 780, size: 18, font: await pdf.embedFont(StandardFonts.Helvetica) });
  return Buffer.from(await pdf.save());
}

/** Les textes des polices standard sont écrits en hexadécimal dans le PDF */
const hex = (s: string) => Buffer.from(s, 'latin1').toString('hex').toUpperCase();

async function downloadVersion(page: Page, v: number) {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: `Télécharger v${v}` }).click()]);
  const raw = readFileSync(await dl.path());
  // Flux de contenu compressés : on les décompresse pour lire les textes dessinés
  const parts = [raw.toString('latin1')];
  let i = 0;
  for (;;) {
    const s = raw.indexOf('stream', i);
    if (s < 0) break;
    const start = s + (raw[s + 6] === 0x0d ? 8 : 7);
    const e = raw.indexOf('endstream', start);
    if (e < 0) break;
    try {
      parts.push(inflateSync(raw.subarray(start, e)).toString('latin1'));
    } catch {
      /* flux non compressé */
    }
    i = e + 9;
  }
  return { name: dl.suggestedFilename(), text: parts.join('\n') };
}

test.describe('Proforma déposée par le fournisseur', () => {
  test.beforeEach(async ({ page }) => {
    await resetApp(page);
  });

  test('le fournisseur dépose, JONAS signe : signature, tampon, date et date d’expédition demandée', async ({ page }) => {
    // Avant dépôt : signature impossible côté JONAS
    await go(page, 'proformas/PF-2026-0150');
    await page.locator('.page-head').getByRole('button', { name: 'Signer' }).click();
    await expect(toast(page)).toContainText('En attente de la proforma du fournisseur');

    // Le fournisseur dépose sa proforma
    await loginAs(page, 'Li Qiang');
    await expect(page.locator('main')).toContainText('proforma(s) à déposer');
    await go(page, 'portail/proformas?pf=PF-2026-0150');
    await page.getByLabel('Déposer la proforma').setInputFiles({ name: 'PI-WZ-2026-118.pdf', mimeType: 'application/pdf', buffer: await supplierPdf('PROFORMA WENZHOU TEX') });
    await expect(toast(page)).toContainText('Proforma v1 déposée');
    await expect(page.locator('.pv-row')).toContainText('PI-WZ-2026-118.pdf');

    // JONAS signe avec la date d'expédition demandée
    await loginAs(page, 'Direction');
    await go(page, 'proformas/PF-2026-0150');
    await page.locator('.page-head').getByRole('button', { name: 'Signer' }).click();
    await page.locator('#sg-etd').fill('2026-12-16');
    await page.getByRole('button', { name: 'Signer et tamponner' }).click();
    await expect(toast(page)).toContainText('PF-2026-0150 signée et tamponnée');
    await expect(page.locator('.page-head')).toContainText('En dev');

    await page.getByRole('button', { name: /^Documents/ }).click();
    const row = page.locator('.pv-row', { hasText: 'v1' });
    await expect(row).toContainText('Signée le');
    await expect(row).toContainText('Expédition demandée le 16/12/2026');
    const pdf = await downloadVersion(page, 1);
    expect(pdf.name).toBe('PF-2026-0150_v1_signee.pdf');
    expect(pdf.text.startsWith('%PDF')).toBe(true);
    for (const s of ['JONAS FRANCE', 'BON POUR ACCORD', 'Direction', '16/12/2026 (S51)']) expect(pdf.text).toContain(hex(s));
    expect(pdf.text).toMatch(new RegExp(hex('Signé le ') + '[0-9A-F]{20}'));
  });

  test('demande de modification : la Direction signe la nouvelle version, qui annule l’ancienne', async ({ page }) => {
    await loginAs(page, 'Direction');
    await go(page, 'proformas/PF-2026-0151');
    await page.locator('.page-head').getByRole('button', { name: 'Signer la modification v2' }).click();
    await expect(page.getByRole('dialog')).toContainText('Annule et remplace la proforma v1');
    await page.locator('#sg-etd').fill('2026-12-16');
    await page.getByRole('button', { name: 'Signer et tamponner' }).click();
    await expect(toast(page)).toContainText('annule et remplace la v1');

    await page.getByRole('button', { name: /^Documents/ }).click();
    await expect(page.locator('.pv-row.signee')).toContainText('v2');
    await expect(page.locator('.pv-row.annulee')).toContainText('Annulée par la v2');
    const v2 = await downloadVersion(page, 2);
    expect(v2.text).toContain(hex('Annule et remplace la proforma v1'));
    const v1 = await downloadVersion(page, 1);
    expect(v1.name).toBe('PF-2026-0151_v1_ANNULEE.pdf');
    expect(v1.text).toContain(hex('ANNULÉE'));
  });

  test('le fournisseur demande une modification avec motif, la Direction peut la refuser', async ({ page }) => {
    await loginAs(page, 'Tide');
    await go(page, 'portail/proformas?pf=PF-2026-0141');
    await page.getByRole('button', { name: 'Demander une modification' }).click();
    // Motif obligatoire
    await page.getByLabel('Demander une modification').setInputFiles({ name: 'rev.pdf', mimeType: 'application/pdf', buffer: await supplierPdf('REV') });
    await expect(toast(page)).toContainText('Indiquez le motif');
    await page.locator('#pv-reason-PF-2026-0141').fill('Couleur des tongs changée');
    await page.getByLabel('Demander une modification').setInputFiles({ name: 'PI-TIDE-rev2.pdf', mimeType: 'application/pdf', buffer: await supplierPdf('REV 2') });
    await expect(toast(page)).toContainText('Proforma v2 déposée');
    await expect(page.locator('.pv-row', { hasText: 'v2' })).toContainText('Couleur des tongs changée');

    await loginAs(page, 'Direction');
    await go(page, 'proformas/PF-2026-0141');
    await page.getByRole('button', { name: /^Documents/ }).click();
    await page.locator('.pv-alert').getByRole('button', { name: 'Refuser' }).click();
    await page.locator('#pv-refuse-PF-2026-0141').fill('Couleur non validée par le design');
    await page.getByRole('button', { name: 'Refuser la modification' }).click();
    await expect(toast(page)).toContainText('Modification refusée');
    await expect(page.locator('.pv-row.refusee')).toContainText('Couleur non validée');
    // La v1 reste la version signée en vigueur
    await expect(page.locator('.pv-row.signee')).toContainText('v1');
  });
});
