import { expect, go, loginAs, resetApp, test, toast } from './fixtures';
import type { Page } from '@playwright/test';

type Pf = { id: string; lines: { productId: string; qty: number }[]; depositAmount?: number; split?: { root: string; part: number } };
const proformas = (page: Page) =>
  page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.startsWith('jonas-buying-state'))!;
    return JSON.parse(localStorage.getItem(k)!).proformas as Pf[];
  });

test.describe('Expéditions partielles', () => {
  test.beforeEach(async ({ page }) => {
    await resetApp(page);
  });

  test('le fournisseur demande (problème usine), JONAS accepte : reliquat créé, acompte au prorata', async ({ page }) => {
    const before = (await proformas(page)).find((p) => p.id === 'PF-2026-0152')!;
    const qty = before.lines[0].qty;

    await loginAs(page, 'Tide');
    await go(page, 'portail/proformas?pf=PF-2026-0152');
    await page.getByRole('button', { name: 'Expédition partielle' }).click();
    await page.locator('#sp-qty-CP-T001').fill('3000');
    await page.locator('#sp-date').fill('2027-01-06');
    await page.locator('#sp-reason').fill('Panne de la machine de moulage');
    await page.getByRole('button', { name: 'Envoyer la demande' }).click();
    await expect(toast(page)).toContainText('à accepter par JONAS');
    await expect(page.locator('.sp-request')).toContainText('Panne de la machine de moulage');

    await loginAs(page, 'Logistique');
    await go(page, 'proformas/PF-2026-0152');
    const panel = page.locator('.sp-card');
    await expect(panel).toContainText(`reliquat ${(qty - 3000).toLocaleString('fr-FR').replace(/\s/g, ' ')}`);
    await panel.getByRole('button', { name: 'Accepter' }).click();
    await expect(toast(page)).toContainText('reliquat PF-2026-0152-2 créé');
    await expect(panel.locator('.sp-row')).toHaveCount(2);
    await expect(page.locator('.page-head')).toContainText('Exp. 1/2');

    const after = await proformas(page);
    const e1 = after.find((p) => p.id === 'PF-2026-0152')!;
    const e2 = after.find((p) => p.id === 'PF-2026-0152-2')!;
    expect(e1.lines[0].qty).toBe(3000);
    expect(e2.lines[0].qty).toBe(qty - 3000);
    expect(e2.split).toMatchObject({ root: 'PF-2026-0152', part: 2, reason: 'Panne de la machine de moulage' });
    // Acompte de 12 000 € réparti au prorata des quantités
    expect(Math.round(e1.depositAmount! + e2.depositAmount!)).toBe(12000);
    expect(Math.round(e2.depositAmount!)).toBe(Math.round((12000 * (qty - 3000)) / qty));

    // Le reliquat a son propre booking à demander
    await panel.locator('.sp-row', { hasText: 'PF-2026-0152-2' }).click();
    await expect(page.locator('.page-head')).toContainText('Exp. 2/2');
    await go(page, 'booking');
    await expect(page.locator('.bk-stage.bk-orange .bk-row', { hasText: 'PF-2026-0152-2' })).toContainText('Exp. 2/2');
  });

  test('JONAS demande (priorité), le fournisseur accepte', async ({ page }) => {
    await loginAs(page, 'Logistique');
    await go(page, 'proformas/PF-2026-0148');
    await page.locator('.sp-card').getByRole('button', { name: 'Expédition partielle' }).click();
    await page.locator('#sp-qty-JO-J205').fill('0');
    await page.locator('#sp-reason').fill('Mobilier prioritaire pour le catalogue');
    await page.getByRole('button', { name: 'Envoyer la demande' }).click();
    await expect(toast(page)).toContainText('à accepter par le fournisseur');
    await expect(page.locator('.sp-request')).toContainText('En attente du fournisseur');

    await loginAs(page, 'Wang Lei');
    await expect(page.locator('main')).toContainText('expédition partielle à accepter');
    await go(page, 'portail/proformas?pf=PF-2026-0148');
    await page.locator('.sp-card').getByRole('button', { name: 'Accepter' }).click();
    await expect(toast(page)).toContainText('PF-2026-0148-2');
    const e2 = (await proformas(page)).find((p) => p.id === 'PF-2026-0148-2')!;
    expect(e2.lines.map((l) => l.productId)).toEqual(['JO-J205']);
  });

  test('JONAS peut refuser la demande du fournisseur', async ({ page }) => {
    await loginAs(page, 'Logistique');
    await go(page, 'proformas/PF-2026-0145');
    const panel = page.locator('.sp-card');
    await expect(panel).toContainText('Problème de séchage');
    await panel.getByRole('button', { name: 'Refuser' }).click();
    await expect(toast(page)).toContainText('Demande refusée');
    await expect(panel.locator('.sp-request')).toHaveCount(0);
  });
});

test.describe('Suivi des reliquats', () => {
  test.beforeEach(async ({ page }) => {
    await resetApp(page);
  });

  test('onglet Reliquats de la page Booking : retard, motif, tri', async ({ page }) => {
    await loginAs(page, 'Logistique');
    await go(page, 'booking');
    await page.getByRole('button', { name: /Reliquats \(2\)/ }).click();
    const rows = page.locator('.rl-row');
    await expect(rows).toHaveCount(2);
    // Tri par retard : Yiwu (28 j) avant Jinfa (14 j)
    await expect(rows.nth(0)).toContainText('PF-2026-0136-2');
    await expect(rows.nth(0)).toContainText('retard 28 j');
    await expect(rows.nth(0)).toContainText('Rupture de tissu imprimé');
    await expect(rows.nth(1)).toContainText('retard 14 j');
    await page.getByRole('button', { name: 'Date', exact: true }).click();
    await expect(rows.nth(0)).toContainText('PF-2026-0139-2');
    await page.getByPlaceholder(/Reliquat, proforma d’origine/).fill('Jinfa');
    await expect(rows).toHaveCount(1);
  });

  test('un reliquat accepté apparaît dans le suivi et dans le filtre de la liste', async ({ page }) => {
    await loginAs(page, 'Logistique');
    await go(page, 'proformas/PF-2026-0145');
    await page.locator('.sp-card').getByRole('button', { name: 'Accepter' }).click();
    await go(page, 'booking?vue=reliquats');
    const row = page.locator('.rl-row', { hasText: 'PF-2026-0145-2' });
    await expect(row).toContainText('retard 21 j');
    await expect(row).toContainText('Problème de séchage');

    await go(page, 'proformas');
    await page
      .locator('.pf-chips')
      .getByRole('button', { name: /Reliquats/ })
      .click();
    await expect(page).toHaveURL(/reliquats=1/);
    await page.getByRole('button', { name: 'Vue liste' }).click();
    const main = page.locator('main');
    for (const id of ['PF-2026-0136-2', 'PF-2026-0139-2', 'PF-2026-0145-2']) await expect(main).toContainText(id);
    await expect(main).not.toContainText('PF-2026-0148');
  });
});
