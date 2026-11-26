import { expect, loginAs, resetApp, setUser, test, toast } from './fixtures';

// PNG 1×1 bleu
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYPgPAAEDAQAIicLsAAAAAElFTkSuQmCC', 'base64');

test('le fournisseur dépose son logo dans le portail, JONAS le voit sur la ligne de ses proformas', async ({ page }) => {
  await resetApp(page);
  await loginAs(page, 'Mr. Chen');
  await expect(page.getByText('Logo de votre société')).toBeVisible();
  await page.getByLabel('Logo de votre société').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG });
  await expect(toast(page)).toContainText('Logo enregistré');
  await expect(page.getByRole('img', { name: 'Logo Xiamen Tide Living' }).first()).toBeVisible();

  await setUser(page, 'yzerah', 'proformas');
  await expect(page.locator('.pf-table, main').getByRole('img', { name: 'Logo Xiamen Tide Living' }).first()).toBeVisible();

  // Retrait du logo par le fournisseur : retour au monogramme
  await setUser(page, 'sup-tide', 'portail');
  await page.getByRole('button', { name: 'Retirer' }).click();
  await expect(toast(page)).toContainText('Logo retiré');
  await expect(page.getByRole('img', { name: 'Logo Xiamen Tide Living' })).toHaveCount(0);
});
