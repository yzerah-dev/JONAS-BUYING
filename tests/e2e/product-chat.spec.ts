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

test('traduction : un message de JONAS déjà traduit s’affiche en chinois chez le fournisseur ; « Traduire » côté JONAS', async ({ page }) => {
  await resetApp(page);
  // Message JONAS avec sa traduction chinoise, réponse du fournisseur traduite en français
  await page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.startsWith('jonas-buying-state'))!;
    const s = JSON.parse(localStorage.getItem(k)!);
    const p = s.products.find((x: { id: string }) => x.id === 'CP-T001');
    p.chat = [
      { id: 'm1', at: '2026-11-27T09:00:00.000Z', by: 'David', side: 'jonas', text: 'Merci de confirmer le coloris doré.', tr: { zh: '请确认金色。' } },
      { id: 'm2', at: '2026-11-27T09:05:00.000Z', by: 'Mr. Chen', side: 'fournisseur', text: '确认，金色亮片。', tr: { fr: 'Confirmé, paillettes dorées.' } },
    ];
    localStorage.setItem(k, JSON.stringify(s));
  });
  await page.reload();
  await loginAs(page, 'David');
  await go(page, 'produits/CP-T001');
  await page.getByRole('button', { name: /^Discussion fournisseur/ }).click();
  const ch = page.locator('.ch');
  // JONAS : sa propre bulle montre aussi ce que le fournisseur a reçu ; la réponse est traduite en français
  await expect(ch.locator('.ch-bubble.mine .ch-tr-sent')).toContainText('请确认金色。');
  await expect(ch.locator('.ch-bubble:not(.mine) .ch-text')).toHaveText('Confirmé, paillettes dorées.');
  await ch.getByRole('button', { name: 'Voir l’original' }).click();
  await expect(ch.locator('.ch-bubble:not(.mine) .ch-text')).toHaveText('确认，金色亮片。');

  // Fournisseur, portail en chinois : le message de JONAS s'affiche en chinois
  await loginAs(page, 'Mr. Chen');
  await page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.includes('lang'));
    if (k) localStorage.setItem(k, 'zh');
  });
  await go(page, 'portail/produits/CP-T001');
  await page.reload();
  await expect(page.locator('.ch-bubble:not(.mine) .ch-text')).toHaveText('请确认金色。');
});
