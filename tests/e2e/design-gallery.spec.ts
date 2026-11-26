// Espace Design : grande photo dans la liste, et présentation en galerie par semaine
import { expect, go, resetApp, test } from './fixtures';

test('Développement : galerie par semaine (grandes photos), clic sur une carte = détail du pack, choix gardé', async ({ page }) => {
  await resetApp(page);
  await go(page, 'design');
  await expect(page.locator('.pk-row').first()).toBeVisible();
  await page.getByRole('button', { name: 'Galerie' }).click();
  const card = page.locator('.pk-week.open .pk-gal .pk-card').first();
  await expect(card).toBeVisible();
  await expect(page.locator('.pk-row')).toHaveCount(0);
  const ref = (await card.locator('.pk-card-body b').innerText()).trim();
  await card.click();
  await expect(page.locator('main')).toContainText(ref);
  // Le choix est gardé au retour sur la page
  await page.reload();
  await expect(page.getByRole('button', { name: 'Galerie' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Liste' }).click();
  await expect(page.locator('.pk-row').first()).toBeVisible();
});
