import { expect, expectNoHorizontalOverflow, go, loginAs, resetApp, setUser, sidebarItems, test, toast } from './fixtures';

test.describe('Portail transitaire', () => {
  test.beforeEach(async ({ page }) => {
    await resetApp(page);
  });

  test('connexion transitaire : onglets séparés et données isolées', async ({ page }) => {
    await loginAs(page, 'Anna Weber');
    await expect(page).toHaveURL(/#\/transitaire\/a-confirmer$/);
    const nav = await sidebarItems(page);
    for (const tab of ['Bookings à confirmer', 'Prêts au départ', 'En mer', 'Au port', 'Livrés']) expect(nav.join(' | ')).toContain(tab);
    await expect(page.locator('main')).toContainText('Tide Living');
    // Kuehne + Nagel ne voit pas les conteneurs Logfret (Jinfa)
    await go(page, 'transitaire/en-mer');
    await expect(page.locator('main')).not.toContainText('Jinfa');
    // Pas d'accès à l'application JONAS
    await setUser(page, 'fwd-kn', 'proformas');
    await expect(page).toHaveURL(/#\/transitaire\/a-confirmer$/);
  });

  test('à confirmer → prêt au départ → en mer → au port (douane, livraison), remonté à JONAS', async ({ page }) => {
    await go(page, 'booking');
    await expect(page.locator('.bk-stage.bk-green .bk-row', { hasText: 'PF-2026-0141' })).toContainText('En attente de confirmation Kuehne + Nagel');

    await loginAs(page, 'Anna Weber');
    const nav = page.locator('nav.sidebar');
    // 1. Bookings à confirmer
    await page.locator('.bk-actions').getByRole('button', { name: 'Confirmer' }).first().click();
    await page.locator('#fw-num').fill('CMAU7654321');
    await page.locator('#fw-vessel').fill('CMA CGM Trocadero');
    await page.getByRole('button', { name: 'Confirmer le booking' }).click();
    await expect(toast(page)).toContainText('CMAU7654321');
    await expect(page.locator('main')).toContainText('Aucun booking à confirmer');
    // 2. Prêts au départ
    await nav.getByRole('link', { name: /Prêts au départ/ }).click();
    const row = page.locator('.bk-row', { hasText: 'CMAU7654321' });
    await expect(row).toContainText('CMA CGM TROCADERO');
    await row.getByRole('button', { name: 'Départ effectué' }).click();
    // 3. En mer
    await nav.getByRole('link', { name: /En mer/ }).click();
    await row.getByRole('button', { name: 'Nouvelle ETA' }).click();
    await page.locator('#fw-date').fill('2027-01-12');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(toast(page)).toContainText('ETA mise à jour');
    await row.getByRole('button', { name: 'Arrivé au port' }).click();
    await expect(row).toHaveCount(0);
    // 4. Au port : douane puis livraison
    await nav.getByRole('link', { name: /Au port/ }).click();
    await row.getByRole('button', { name: 'Lancer la douane' }).click();
    await row.getByRole('button', { name: 'Dédouané' }).click();
    await row.getByRole('button', { name: 'Planifier la livraison' }).click();
    await page.locator('#fw-date').fill('2026-11-18');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(row).toContainText('Livraison 18 nov.');

    // Côté JONAS
    await loginAs(page, 'Logistique');
    await go(page, 'conteneurs');
    await page.getByRole('button', { name: 'Tout' }).click();
    const card = page.locator('.ct-card', { hasText: 'CMAU7654321' });
    await expect(card).toContainText('Dédouané');
    await expect(card).toContainText('Livraison 18 nov.');
  });

  test('téléphone : pas de débordement', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setUser(page, 'fwd-logfret', 'transitaire/en-mer');
    await expect(page.locator('.fw-head')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('l’équipe JONAS et les fournisseurs n’ont pas accès au portail transitaire', async ({ page }) => {
    await go(page, 'transitaire');
    await expect(page).not.toHaveURL(/transitaire/);
    await setUser(page, 'sup-tide', 'transitaire');
    await expect(page).not.toHaveURL(/transitaire/);
  });
});
