// Produits d'une proforma : filtre « Pack manquant », carte verte (pack OK) ou rouge (en retard)
import { expect, go, loginAs, resetApp, test } from './fixtures';

test('produits de la proforma : filtres pack et couleur des cartes', async ({ page }) => {
  await resetApp(page);
  await loginAs(page, 'David');
  await go(page, 'proformas/PF-2026-0145');
  await page.getByRole('button', { name: 'Galerie' }).click();
  // Packs validés : cartes vertes
  const ok = await page.locator('.gallery .pcard.pk-ok').count();
  expect(ok).toBeGreaterThan(0);
  await page.getByRole('button', { name: /^Pack OK \(\d+\)$/ }).click();
  await expect(page.locator('.gallery .pcard')).toHaveCount(ok);
  await page.getByRole('button', { name: /^Pack manquant \(0\)$/ }).click();
  await expect(page.locator('main')).toContainText('Aucun produit dans cette sélection.');
  // Proforma avec packs en cours : le filtre ne garde que les packs manquants
  await go(page, 'proformas/PF-2026-0148');
  await page.getByRole('button', { name: /^Pack manquant \(2\)$/ }).click();
  await expect(page.locator('.pcard, main tbody tr')).toHaveCount(2);
  await expect(page.locator('.pcard.pk-ok, main tbody tr.pk-ok')).toHaveCount(0);
});

test('pack en retard : carte rouge', async ({ page }) => {
  await resetApp(page);
  await page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.startsWith('jonas-buying-state'))!;
    const st = JSON.parse(localStorage.getItem(k)!);
    st.products.find((x: { id: string }) => x.id === 'JO-J205').pack.artworkDeadline = '2026-01-01';
    localStorage.setItem(k, JSON.stringify(st));
  });
  await page.reload();
  await loginAs(page, 'David');
  await go(page, 'proformas/PF-2026-0148');
  await page.getByRole('button', { name: 'Galerie' }).click();
  await expect(page.locator('.pcard.pk-late', { hasText: 'JO-J205' })).toBeVisible();
  await page.getByRole('button', { name: /^En retard \(\d+\)$/ }).click();
  await expect(page.locator('.gallery .pcard', { hasText: 'JO-J205' })).toBeVisible();
});
