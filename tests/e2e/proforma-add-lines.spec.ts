// Proforma pas encore signée : ajout de produits existants du fournisseur ou de nouveaux produits
import { expect, go, loginAs, resetApp, test, toast } from './fixtures';

test('ajout d’un produit existant et d’un nouveau produit sur une proforma à signer ; rien sur une proforma signée', async ({ page }) => {
  await resetApp(page);
  await loginAs(page, 'David');
  await go(page, 'proformas/PF-2026-0146');
  await expect(page.getByRole('button', { name: /^Tous \(1\)/ })).toBeVisible();
  await page.getByRole('button', { name: 'Ajouter des produits' }).click();
  const dlg = page.getByRole('dialog', { name: 'Ajouter des produits' });
  // Proforma déjà déposée par le fournisseur : avertissement
  await expect(dlg).toContainText('demandez-lui une version mise à jour');
  // Ligne 1 : produit du fournisseur (recherche par réf.)
  await page.locator('#ln-prod-0').fill('PF-P014');
  await page.getByRole('option', { name: /PF-P014/ }).click();
  await dlg.getByLabel('Quantité 1').fill('5000');
  await dlg.getByLabel('Prix unitaire 1').fill('1,2');
  // Ligne 2 : nouveau produit
  await dlg.getByRole('button', { name: 'Ajouter une ligne' }).click();
  await page.locator('#ln-prod-1').click();
  await page.getByRole('option', { name: /Nouveau produit/ }).click();
  await dlg.getByLabel('Désignation 2').fill('Gel douche 750 ml vanille');
  await dlg.getByLabel('Pcs/carton 2').fill('12');
  await dlg.getByLabel('m³/carton 2').fill('0,04');
  await dlg.getByLabel('Quantité 2').fill('2400');
  await dlg.getByLabel('Prix unitaire 2').fill('0,55');
  await expect(dlg.locator('.rc-foot')).toContainText('2 produit(s) prêt(s)');
  await dlg.getByRole('button', { name: 'Ajouter à la proforma' }).click();
  await toast(page, '2 produit(s) ajouté(s) à PF-2026-0146');

  await expect(page.getByRole('button', { name: /^Tous \(3\)/ })).toBeVisible();
  await expect(page.locator('main')).toContainText('PF-P014');
  await expect(page.locator('main')).toContainText('Gel douche 750 ml vanille');
  await page.getByRole('button', { name: /^Historique/ }).click();
  await expect(page.locator('main')).toContainText('Produit(s) ajouté(s) : PF-P014 (5000 pcs)');

  // Proforma signée : pas d'ajout
  await go(page, 'proformas/PF-2026-0148');
  await page.getByRole('button', { name: /^Produits/ }).first().click();
  await expect(page.getByRole('button', { name: /^Tous \(/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ajouter des produits' })).toHaveCount(0);
});
