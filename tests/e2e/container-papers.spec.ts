// Conteneur : n° de conteneur + plomb, et BL / Packing List / Facture à déposer (3 ronds)
import { expect, go, resetApp, test, toast } from './fixtures';

test('détail du conteneur : saisir le n° de conteneur et déposer BL, Packing List et Facture', async ({ page }) => {
  await resetApp(page);
  await go(page, 'conteneurs?c=PLAN-031');
  const num = page.getByLabel('N° de conteneur');
  await num.fill('mscu12');
  await expect(page.locator('.ctp')).toContainText('4 lettres + 7 chiffres');
  await num.fill('MSCU1234567');
  await page.getByLabel('Plomb (scellé)').fill('sl400999');
  await page.locator('.ctp').getByRole('button', { name: 'Enregistrer' }).click();
  await expect(toast(page)).toContainText('Conteneur MSCU1234567 enregistré');
  await expect(
    page
      .locator('.card')
      .filter({ has: page.locator('.ctp') })
      .first(),
  ).toContainText('MSCU1234567');

  for (const [doc, name] of [
    ['BL', 'BL.pdf'],
    ['Packing List', 'Packing List.xlsx'],
    ['Facture', 'Invoice.pdf'],
  ]) {
    await page
      .locator('.ctp-round', { hasText: doc })
      .locator('input[type=file]')
      .setInputFiles({ name: `${name}`, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') });
    await expect(toast(page)).toContainText(`${doc} déposé`);
  }
  await expect(page.locator('.ctp-round.done')).toHaveCount(3);
  await expect(page.locator('.ctp-round', { hasText: 'Facture' }).getByRole('button', { name: 'Télécharger Facture' })).toBeVisible();
});
