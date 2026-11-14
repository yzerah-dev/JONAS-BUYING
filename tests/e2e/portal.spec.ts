import { expect, go, loginAs, resetApp, setUser, sidebarItems, test, toast } from './fixtures';

test.describe('Portail fournisseur', () => {
  test.beforeEach(async ({ page }) => {
    await resetApp(page);
  });

  test('connexion fournisseur : redirection vers le portail, données isolées', async ({ page }) => {
    await loginAs(page, 'Mr. Chen');
    await expect(page).toHaveURL(/#\/portail$/);
    const nav = await sidebarItems(page);
    expect(nav).toEqual(expect.arrayContaining(['Mes produits', 'Mes proformas', 'Plans de chargement']));
    expect(nav.join(' ')).toContain('Vous ne voyez que les données de Tide Living');

    // Isolation : pas de produits d'un autre fournisseur (AB-M026 = Jinfa)
    await go(page, 'portail/produits');
    await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('main')).not.toContainText('AB-M026');
  });

  for (const route of ['proformas', 'finance', 'conteneurs?c=PLAN-031', 'design', 'parametres']) {
    test(`le fournisseur est renvoyé vers le portail depuis /${route}`, async ({ page }) => {
      await setUser(page, 'sup-tide', route);
      await expect(page).toHaveURL(/#\/portail$/);
      await expect(page.locator('main h1').first()).toContainText('Bienvenue');
    });
  }

  test('le fournisseur propose un plan de chargement par glisser-déposer', async ({ page }) => {
    await loginAs(page, 'Ms. Park');
    await go(page, 'portail/chargement');
    await page.locator('tr[draggable="true"]').first().dragTo(page.locator('.ccard').first());
    await expect(toast(page)).toContainText('→ PLAN-');
    await page.getByRole('button', { name: 'Proposer ce plan à JONAS' }).click();
    // Le booking reste à l'initiative de la logistique JONAS
    await expect(page.getByRole('button', { name: 'Demande de booking' })).toHaveCount(0);
  });
});
