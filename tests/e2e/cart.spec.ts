// Panier : commander depuis Total – Produits (+ par carton), une commande par fournisseur, demande de proforma au fournisseur
import { expect, go, loginAs, resetApp, test, toast } from './fixtures';

test('panier : + par carton, validation par fournisseur, le fournisseur reçoit la demande de proforma', async ({ page }) => {
  await resetApp(page);
  await loginAs(page, 'David');
  await go(page, 'produits');
  await page.getByPlaceholder('Réf., désignation, EAN…').fill('CP-T001');
  // Un clic sur + = un carton ajouté directement (pièces et volume affichés)
  await page.getByRole('button', { name: 'Ajouter un carton CP-T001' }).click();
  await expect(page.getByLabel('Cartons au panier CP-T001')).toHaveValue('1');
  await page.getByRole('button', { name: 'Ajouter un carton CP-T001' }).click();
  await expect(page.getByLabel('Cartons au panier CP-T001')).toHaveValue('2');
  await expect(page.locator('.cart-qty', { has: page.getByLabel('Cartons au panier CP-T001') })).toContainText('48 pcs');
  await expect(page.locator('.cart-qty', { has: page.getByLabel('Cartons au panier CP-T001') })).toContainText('m³');
  await page.getByPlaceholder('Réf., désignation, EAN…').fill('JO-J205');
  await page.getByRole('button', { name: 'Ajouter un carton JO-J205' }).click();
  // Panier : une section par fournisseur
  await page.getByRole('button', { name: 'Panier (2)' }).click();
  const dlg = page.getByRole('dialog', { name: 'Panier' });
  await expect(dlg.getByRole('region')).toHaveCount(2);
  const tide = dlg.getByRole('region', { name: /Commande Tide Living/ });
  await tide.getByLabel('Cartons CP-T001').fill('21');
  await expect(tide).toContainText('504');
  await tide.getByRole('button', { name: 'Valider la commande · demander la proforma' }).click();
  await expect(toast(page)).toContainText('Commande PF-2026-0154 passée');
  await expect(dlg.getByRole('region')).toHaveCount(1);
  const pf = await page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.startsWith('jonas-buying-state'))!;
    return JSON.parse(localStorage.getItem(k)!).proformas.find((p: { id: string }) => p.id === 'PF-2026-0154');
  });
  expect(pf).toMatchObject({ supplierId: 'tide', status: 'a_signer', order: { source: 'panier' }, lines: [{ productId: 'CP-T001', qty: 504 }] });
  // Le reste du panier (autre fournisseur) est gardé
  await dlg.getByRole('button', { name: 'Fermer' }).click();
  await expect(page.getByRole('button', { name: 'Panier (1)' })).toBeVisible();
  // Le fournisseur : proforma à déposer
  await loginAs(page, 'Mr. Chen');
  await go(page, 'portail/proformas');
  await expect(page.locator('.week-head', { hasText: 'PF-2026-0154' })).toContainText('À vous : déposer la proforma');
});

test('panier : vider un fournisseur, puis tout le panier (avec confirmation)', async ({ page }) => {
  await resetApp(page);
  await loginAs(page, 'David');
  await go(page, 'produits');
  const search = page.getByPlaceholder('Réf., désignation, EAN…');
  for (const ref of ['CP-T001', 'JO-J205']) {
    await search.fill(ref);
    await page.getByRole('button', { name: `Ajouter un carton ${ref}` }).click();
  }
  await search.fill('');
  await page.getByRole('button', { name: 'Panier (2)' }).click();
  const dlg = page.getByRole('dialog', { name: 'Panier' });
  await expect(dlg.getByRole('region')).toHaveCount(2);
  // Un fournisseur : 1er clic arme, 2e confirme
  await dlg.getByRole('button', { name: 'Vider Tide Living' }).click();
  await expect(dlg.getByRole('region')).toHaveCount(2);
  await dlg.getByRole('button', { name: 'Vider Tide Living' }).click();
  await expect(toast(page)).toContainText('Tide Living retiré du panier');
  await expect(dlg.getByRole('region')).toHaveCount(1);
  // Tout le panier
  await dlg.getByRole('button', { name: 'Vider le panier' }).click();
  await dlg.getByRole('button', { name: 'Confirmer : tout vider' }).click();
  await expect(toast(page)).toContainText('Panier vidé');
  await expect(dlg).toContainText('Panier vide');
  await dlg.getByRole('button', { name: 'Fermer' }).click();
  await expect(page.getByRole('button', { name: 'Panier (0)' })).toBeVisible();
});
