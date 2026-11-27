// « Développé / En dév. » : calculé (pack validé par les 3 + proforma signée), ou forcé à la main
import { expect, test } from './fixtures';
import { resetApp } from './fixtures';

const productOf = (page: import('@playwright/test').Page, id: string) =>
  page.evaluate((id) => {
    const k = Object.keys(localStorage).find((x) => x.startsWith('jonas-buying-state'))!;
    return JSON.parse(localStorage.getItem(k)!).products.find((p: { id: string }) => p.id === id) as { developed: boolean; devForced?: boolean };
  }, id);

test('un produit en dév. passe « Développé » quand son pack est validé par les 3 et sa proforma signée', async ({ page }) => {
  await resetApp(page);
  // Produit nouvellement créé par une proforma signée, pack pas encore validé
  const id = await page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.startsWith('jonas-buying-state'))!;
    const s = JSON.parse(localStorage.getItem(k)!);
    const pf = s.proformas.find((p: { status: string }) => p.status === 'en_production');
    const p = s.products.find((x: { id: string }) => x.id === pf.lines[0].productId);
    p.developed = false;
    p.devForced = false;
    p.devStage = 2;
    for (const st of ['direction', 'moinard', 'fournisseur']) p.pack.validations[st] = { state: st === 'fournisseur' ? 'pending' : 'done' };
    p.pack.sentToSupplier = true;
    localStorage.setItem(k, JSON.stringify(s));
    return p.id as string;
  });
  await page.reload();
  expect((await productOf(page, id)).developed).toBe(false);
  // Le fournisseur valide le pack : 3 validations + proforma signée → développé
  await page.evaluate((id) => {
    const k = Object.keys(localStorage).find((x) => x.startsWith('jonas-buying-state'))!;
    const s = JSON.parse(localStorage.getItem(k)!);
    s.products.find((x: { id: string }) => x.id === id).pack.validations.fournisseur = { state: 'done' };
    localStorage.setItem(k, JSON.stringify(s));
  }, id);
  await page.reload();
  await expect.poll(async () => (await productOf(page, id)).developed).toBe(true);
});
