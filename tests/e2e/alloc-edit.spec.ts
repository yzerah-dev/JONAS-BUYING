// Plan de chargement : modifier la quantité ou le nombre de cartons d'une ligne du conteneur
import { expect, go, loginAs, resetApp, test, toast } from './fixtures';

const alloc = (page: import('@playwright/test').Page, pf: string, ref: string) =>
  page.evaluate(
    ([pf, ref]) => {
      const k = Object.keys(localStorage).find((x) => x.startsWith('jonas-buying-state'))!;
      const st = JSON.parse(localStorage.getItem(k)!);
      const id = st.products.find((p: { ref: string }) => p.ref === ref).id;
      return st.containers
        .flatMap((c: { allocations: { proformaId: string; productId: string; qty: number }[] }) => c.allocations)
        .filter((a: { proformaId: string; productId: string }) => a.proformaId === pf && a.productId === id);
    },
    [pf, ref],
  );

test('conteneur : colisage affiché, quantité ou cartons modifiables, plafonnés à la proforma', async ({ page }) => {
  await resetApp(page);
  await loginAs(page, 'David');
  await go(page, 'proformas/PF-2026-0148');
  await page.getByRole('button', { name: /Suivi & Logistique/ }).click();
  await page.locator('.ccard', { hasText: 'PLAN-043' }).click();
  const ctn = page.getByLabel('Cartons JO-J205').first();
  await expect(ctn).toBeVisible();
  await expect(page.locator('main')).toContainText('2 pcs/ctn');
  // 100 cartons de 2 = 200 pcs
  await ctn.fill('100');
  await ctn.press('Enter');
  await expect(toast(page)).toContainText('JO-J205 : 200 pcs dans le conteneur');
  expect((await alloc(page, 'PF-2026-0148', 'JO-J205'))[0].qty).toBe(200);
  await expect(page.getByLabel('Quantité JO-J205').first()).toHaveValue('200');
  // Quantité libre : carton entamé signalé
  const qty = page.getByLabel('Quantité JO-J205').first();
  await qty.fill('201');
  await qty.press('Enter');
  await expect(page.locator('main')).toContainText('Carton entamé : 1 pcs');
  // Au-delà de la proforma : refusé
  await qty.fill('99999999');
  await qty.press('Enter');
  await expect(toast(page)).toContainText('Maximum');
  expect((await alloc(page, 'PF-2026-0148', 'JO-J205'))[0].qty).toBe(201);
});
