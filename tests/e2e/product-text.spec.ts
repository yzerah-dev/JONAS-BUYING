// Désignation française courte, description anglaise (fournisseur) et française (JONAS), affichage des fiches.
import { expect, go, loginAs, resetApp, test, toast } from './fixtures';

const LONG = 'LITTLE MARCEL LUGGAGE SET OF 4 PIECE,16/20/24/28INCH,4x2 WHEELS, colors: pink,green,blue,yellow,orange,black,silver, dark blue';

test('désignation et description : anglais du fournisseur tel quel, français retravaillé', async ({ page }) => {
  await resetApp(page);
  await loginAs(page, 'David');
  await go(page, 'produits/CP-T001');
  await expect(page.locator('.desc-card')).toContainText('À rédiger.');
  await page.locator('.desc-card').getByRole('button', { name: 'Modifier' }).click();
  await page.locator('#pd-name').fill('Set de 4 valises Little Marcel 16-20-24-28 pouces');
  await page.locator('#pd-en').fill(LONG);
  await page.locator('#pd-fr').fill('Set de 4 valises Little Marcel.\nTailles : 16, 20, 24 et 28 pouces.');
  await page.locator('.desc-card').getByRole('button', { name: 'Enregistrer' }).click();
  await expect(toast(page)).toContainText('Désignation et description enregistrées pour CP-T001');
  await expect(page.locator('main h2').first()).toHaveText('Set de 4 valises Little Marcel 16-20-24-28 pouces');
  await expect(page.locator('.desc-card')).toContainText('Tailles : 16, 20, 24 et 28 pouces.');
  await expect(page.locator('.desc-card')).toContainText(LONG);

  // Finance : lecture seule
  await loginAs(page, 'Finance');
  await go(page, 'produits/CP-T001');
  await expect(page.locator('.desc-card').getByRole('button', { name: 'Modifier' })).toHaveCount(0);
});

test('fiche de la galerie : une désignation longue sans espaces reste dans la carte', async ({ page }) => {
  await resetApp(page);
  await loginAs(page, 'David');
  await go(page, 'produits/CP-T001');
  await page.locator('.desc-card').getByRole('button', { name: 'Modifier' }).click();
  await page.locator('#pd-name').fill(LONG);
  await page.locator('.desc-card').getByRole('button', { name: 'Enregistrer' }).click();
  await go(page, 'produits');
  const card = page.locator('.pcard', { hasText: 'CP-T001' });
  const fits = await card.evaluate((el) => {
    const box = el.getBoundingClientRect();
    return [...el.querySelectorAll('*')].every((c) => c.getBoundingClientRect().right <= box.right + 1);
  });
  expect(fits).toBe(true);
});
