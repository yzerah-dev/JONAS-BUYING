// Proformas en galerie : cartes par semaine (photos, fournisseur, statut, montant), choix gardé
import { expect, go, resetApp, test } from './fixtures';

test('proformas en galerie : cartes par semaine, ouverture, signature depuis la carte, choix gardé', async ({ page }) => {
  await resetApp(page);
  await go(page, 'proformas');
  await page.getByRole('button', { name: 'Galerie' }).click();
  const card = page.locator('.pf-week.open .pfg-card', { hasText: 'PF-2026-0146' });
  await expect(card).toBeVisible();
  await expect(card).toContainText(
    'SHENZHEN NOVA BEAUTY'.toLowerCase().replace(/\b./g, (c) => c),
    { ignoreCase: true },
  );
  await expect(card.getByRole('button', { name: 'Signer' })).toBeVisible();
  await expect(page.locator('.pfx')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Galerie' })).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.pfg-card', { hasText: 'PF-2026-0148' }).click();
  await expect(page).toHaveURL(/proformas\/PF-2026-0148/);
  await go(page, 'proformas');
  await page.getByRole('button', { name: 'Liste' }).click();
  await expect(page.locator('.pfx').first()).toBeVisible();
});
