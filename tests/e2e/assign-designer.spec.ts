// Sélectionner plusieurs produits et les affecter à un designer : Développement et onglet Produits de la proforma
import { expect, go, loginAs, resetApp, test, toast } from './fixtures';

const designerOf = (page: import('@playwright/test').Page, ref: string) =>
  page.evaluate((ref) => {
    const k = Object.keys(localStorage).find((x) => x.startsWith('jonas-buying-state'))!;
    return JSON.parse(localStorage.getItem(k)!).products.find((p: { ref: string }) => p.ref === ref).pack.designer as string;
  }, ref);

test('Développement : 2 packs cochés affectés à ROLAND en un clic', async ({ page }) => {
  await resetApp(page);
  await loginAs(page, 'David');
  await go(page, 'design');
  const rows = page.locator('.pk-week.open .pk-row');
  const refs: string[] = [];
  for (let i = 0; i < 2; i++) {
    await rows.nth(i).locator('input[type=checkbox]').check();
    refs.push((await rows.nth(i).locator('.pk-id b').innerText()).split('\n')[0].trim());
  }
  await page.getByRole('group', { name: 'Affecter au designer' }).getByRole('button', { name: 'Affecter à ROLAND' }).click();
  await expect(toast(page)).toContainText('2 packs affectés à ROLAND');
  for (const r of refs) expect(await designerOf(page, r)).toBe('ROLAND');
});

test('proforma, onglet Produits : tout sélectionner puis affecter à ALEX PANDA', async ({ page }) => {
  await resetApp(page);
  await loginAs(page, 'David');
  await go(page, 'proformas/PF-2026-0148');
  await page
    .getByRole('button', { name: /^Produits/ })
    .first()
    .click();
  await page.getByLabel('Tout sélectionner').check();
  const bulk = page.locator('.pfp-bulk');
  await expect(bulk).toContainText('sélectionné');
  await bulk.getByRole('button', { name: 'Affecter à ALEX PANDA' }).click();
  await expect(toast(page)).toContainText('affecté');
  await expect(page.locator('.pfp-who').first()).toContainText('ALEX PANDA');
});
