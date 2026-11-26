// Panier : commander depuis Total – Produits (+ par carton), une commande par fournisseur, demande de proforma au fournisseur
import { expect, go, loginAs, resetApp, test, toast } from './fixtures';

test('panier : + par carton, validation par fournisseur, le fournisseur reçoit la demande de proforma', async ({ page }) => {
  await resetApp(page);
  await loginAs(page, 'David');
  await go(page, 'produits');
  await page.getByPlaceholder('Réf., désignation, EAN…').fill('CP-T001');
  await page.getByRole('button', { name: 'Ajouter un carton CP-T001' }).click();
  await expect(toast(page)).toContainText('CP-T001 ajouté au panier (24 pcs)');
  await page.getByRole('button', { name: 'Ajouter un carton CP-T001' }).click();
  await expect(page.getByLabel('Quantité au panier CP-T001')).toHaveValue('48');
  await page.getByPlaceholder('Réf., désignation, EAN…').fill('JO-J205');
  await page.getByRole('button', { name: 'Ajouter un carton JO-J205' }).click();
  // Panier : une section par fournisseur
  await page.getByRole('button', { name: 'Panier (2)' }).click();
  const dlg = page.getByRole('dialog', { name: 'Panier' });
  await expect(dlg.getByRole('region')).toHaveCount(2);
  const tide = dlg.getByRole('region', { name: /Commande Tide Living/ });
  await tide.getByLabel('Quantité CP-T001').fill('500');
  await expect(tide).toContainText('carton entamé');
  await tide.getByRole('button', { name: 'Valider la commande · demander la proforma' }).click();
  await expect(toast(page)).toContainText('Commande PF-2026-0154 passée');
  await expect(dlg.getByRole('region')).toHaveCount(1);
  const pf = await page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.startsWith('jonas-buying-state'))!;
    return JSON.parse(localStorage.getItem(k)!).proformas.find((p: { id: string }) => p.id === 'PF-2026-0154');
  });
  expect(pf).toMatchObject({ supplierId: 'tide', status: 'a_signer', order: { source: 'panier' }, lines: [{ productId: 'CP-T001', qty: 500 }] });
  // Le reste du panier (autre fournisseur) est gardé
  await dlg.getByRole('button', { name: 'Fermer' }).click();
  await expect(page.getByRole('button', { name: 'Panier (1)' })).toBeVisible();
  // Le fournisseur : proforma à déposer
  await loginAs(page, 'Mr. Chen');
  await go(page, 'portail/proformas');
  await expect(page.locator('.week-head', { hasText: 'PF-2026-0154' })).toContainText('À vous : déposer la proforma');
});
