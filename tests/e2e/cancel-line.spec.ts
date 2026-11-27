// Annuler un produit d'une proforma pas encore signée : sort des totaux, reste affiché « ANNULÉ », rétablissable ; plus possible après signature
import { expect, go, loginAs, resetApp, signAsDirection, test, toast } from './fixtures';

test('proforma non signée : annuler puis rétablir un produit, bouton absent une fois signée', async ({ page }) => {
  await resetApp(page);
  await loginAs(page, 'David');
  await go(page, 'proformas/PF-2026-0150');
  await expect(page.getByRole('button', { name: 'Produits (2)' })).toBeVisible();
  await page.getByRole('button', { name: 'Annuler le produit CP-PL03' }).click();
  const dlg = page.getByRole('dialog', { name: 'Annuler CP-PL03' });
  await dlg.getByLabel('Motif (facultatif)').fill('Prix trop élevé');
  await dlg.getByRole('button', { name: 'Annuler le produit' }).click();
  await expect(toast(page)).toContainText('CP-PL03 annulé sur PF-2026-0150');
  await expect(page.getByRole('button', { name: 'Produits (1)' })).toBeVisible();
  const cancelled = page.locator('.pfl-cancelled');
  await expect(cancelled).toHaveCount(1);
  await expect(cancelled).toContainText('ANNULÉ');
  await expect(cancelled).toContainText('Prix trop élevé');
  // Dernier produit : on annule la proforma, pas le produit
  await expect(page.getByRole('button', { name: 'Annuler le produit YD-C003' })).toBeDisabled();
  await page.getByRole('button', { name: 'Historique' }).click();
  await expect(page.locator('main')).toContainText('Produit CP-PL03 annulé');
  await page.getByRole('button', { name: /^Produits/ }).click();
  await cancelled.getByRole('button', { name: 'Rétablir' }).click();
  await expect(page.getByRole('button', { name: 'Produits (2)' })).toBeVisible();
  await expect(page.locator('.pfl-cancelled')).toHaveCount(0);
  // Annulé à nouveau puis proforma signée : le produit reste annulé, plus de bouton
  await page.getByRole('button', { name: 'Annuler le produit CP-PL03' }).click();
  await page.getByRole('dialog', { name: 'Annuler CP-PL03' }).getByRole('button', { name: 'Annuler le produit' }).click();
  await expect(page.getByRole('button', { name: 'Produits (1)' })).toBeVisible();
  // PDF de la proforma : le produit annulé y figure avec la mention ANNULÉ
  const dl = page.waitForEvent('download');
  await page.locator('.page-head').getByRole('button', { name: 'PDF' }).click();
  await (await dl).saveAs('test-results/cancel-line.pdf');
  // Le fournisseur dépose sa proforma, JONAS la signe
  await page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.startsWith('jonas-buying-state'))!;
    const st = JSON.parse(localStorage.getItem(k)!);
    const pf = st.proformas.find((x: { id: string }) => x.id === 'PF-2026-0150');
    pf.versions = [{ version: 1, fileId: 'demo', name: 'PI-WT.pdf', size: 1000, type: 'application/pdf', uploadedAt: '2026-11-20T10:00', uploadedBy: 'Mr. Li Qiang', status: 'a_signer' }];
    localStorage.setItem(k, JSON.stringify(st));
  });
  await page.reload();
  await signAsDirection(page, 'PF-2026-0150');
  await expect(page.locator('.pfl-cancelled')).toHaveCount(1);
  await expect(page.locator('.pfl-cancel')).toHaveCount(0);
  await expect(page.locator('.pfl-cancelled').getByRole('button', { name: 'Rétablir' })).toHaveCount(0);
  const dl2 = page.waitForEvent('download');
  await page.locator('.page-head').getByRole('button', { name: 'PDF' }).click();
  await (await dl2).saveAs('test-results/cancel-line-signed.pdf');
});
