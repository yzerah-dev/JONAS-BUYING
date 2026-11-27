// Discussion produit JONAS ↔ fournisseur (comme WhatsApp), à la place des échanges WeChat
import { expect, go, loginAs, resetApp, test } from './fixtures';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYPgPAAEDAQAIicLsAAAAAElFTkSuQmCC', 'base64');

test('JONAS écrit sur un produit, le fournisseur le voit dans son portail, répond avec une photo ; « lu » des deux côtés', async ({ page }) => {
  await resetApp(page);
  await loginAs(page, 'David');
  await go(page, 'produits/CP-T001');
  await page.getByRole('button', { name: /^Discussion fournisseur/ }).click();
  const box = page.getByPlaceholder('Écrire un message…');
  await box.fill('Bonjour, pouvez-vous confirmer le coloris doré des paillettes ?');
  await box.press('Enter');
  await expect(page.locator('.ch-bubble.mine')).toContainText('coloris doré');

  // Fournisseur (Tide Living) : badge sur « Mes produits », message reçu, réponse avec photo
  await loginAs(page, 'Mr. Chen');
  await expect(page.locator('a[href*="/portail/produits"] .pill.red')).toHaveText('1');
  await go(page, 'portail/produits/CP-T001');
  const ch = page.locator('.ch');
  await expect(ch.locator('.ch-bubble').first()).toContainText('coloris doré');
  await expect(page.locator('a[href*="/portail/produits"] .pill.red')).toHaveCount(0);
  await ch.locator('textarea').fill('Yes, gold glitter. See photo.');
  await ch.locator('textarea').press('Enter');
  await ch.locator('input[type=file]').setInputFiles({ name: 'gold.png', mimeType: 'image/png', buffer: PNG });
  await expect(ch.locator('.ch-bubble.mine')).toHaveCount(2);
  await expect(ch.locator('.ch-bubble.mine img')).toHaveCount(1);

  // JONAS : notification, réponse visible, message vu par le fournisseur (double coche)
  await loginAs(page, 'David');
  await go(page, 'produits/CP-T001');
  await expect(page.getByRole('button', { name: /^Discussion fournisseur \(2 nouveaux\)/ })).toBeVisible();
  await page.getByRole('button', { name: /^Discussion fournisseur/ }).click();
  await expect(page.locator('.ch')).toContainText('Yes, gold glitter.');
  await expect(page.locator('.ch-bubble.mine .ch-read')).toHaveCount(1);
});
