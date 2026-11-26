import { expect, expectNoHorizontalOverflow, go, loginAs, resetApp, setUser, sidebarItems, test, toast } from './fixtures';

test.describe('Portail transitaire', () => {
  test.beforeEach(async ({ page }) => {
    await resetApp(page);
  });

  test('connexion transitaire : onglets séparés et données isolées', async ({ page }) => {
    await loginAs(page, 'Anna Weber');
    await expect(page).toHaveURL(/#\/transitaire\/a-booker$/);
    const nav = await sidebarItems(page);
    for (const tab of ['Bookings à faire', 'Prêts au départ', 'En mer', 'Au port', 'Livrés']) expect(nav.join(' | ')).toContain(tab);
    await go(page, 'transitaire/pret');
    await expect(page.locator('main')).toContainText('Tide Living');
    // Kuehne + Nagel ne voit pas les conteneurs Logfret (Jinfa)
    await go(page, 'transitaire/en-mer');
    await expect(page.locator('main')).not.toContainText('Jinfa');
    // Pas d'accès à l'application JONAS
    await setUser(page, 'fwd-kn', 'proformas');
    await expect(page).toHaveURL(/#\/transitaire\/a-booker$/);
  });

  test('booking à faire → prêt au départ → en mer → au port (douane, livraison), remonté à JONAS', async ({ page }) => {
    await loginAs(page, 'Julien Morel');
    const nav = page.locator('nav.sidebar');
    // 1. Bookings à faire : proposition pour Northbay
    await page.locator('.bk-row', { hasText: 'PF-2026-0145' }).getByRole('button', { name: 'Faire la proposition' }).click();
    await page.locator('#be-car-PF20260145').selectOption('CMA CGM');
    await page.locator('#be-no-PF20260145').fill('CMA-339911');
    await page.locator('#be-ves-PF20260145').fill('CMA CGM Trocadero');
    await page.getByRole('button', { name: 'Envoyer la proposition' }).click();
    await expect(toast(page)).toContainText('Proposition PF-2026-0145 envoyée');
    // Acceptée par le fournisseur et JONAS (le pilote accepte pour les deux)
    await setUser(page, 'yzerah', 'booking');
    await page.locator('.bk-row', { hasText: 'PF-2026-0145' }).getByRole('button', { name: 'Accepter' }).click();
    await expect(toast(page)).toContainText('PF-2026-0145 booké');
    await setUser(page, 'fwd-logfret', 'transitaire/a-booker');
    await expect(page.locator('main')).toContainText('Aucun booking à faire');
    // 2. Prêts au départ : n° de conteneur puis départ
    await nav.getByRole('link', { name: /Prêts au départ/ }).click();
    const first = page.locator('.bk-row', { hasText: 'CMA-339911' }).first();
    await expect(first).toContainText('CMA CGM TROCADERO');
    await expect(first.getByRole('button', { name: 'Départ effectué' })).toBeDisabled();
    await first.getByRole('button', { name: 'N° de conteneur' }).click();
    await page.locator('#fw-num').fill('CMAU7654321');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(toast(page)).toContainText('CMAU7654321');
    const row = page.locator('.bk-row', { hasText: 'CMAU7654321' });
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
    // Douane bloquée tant que BL, Invoice et Packing List ne sont pas déposés (vrais fichiers)
    await expect(row.getByRole('button', { name: 'Lancer la douane' })).toBeDisabled();
    for (let n = 3; n > 0; n--) {
      await expect(row.locator('.fw-doc.missing')).toHaveCount(n);
      await row.locator('input[type=file]').first().setInputFiles({ name: `doc-${n}.pdf`, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') });
    }
    await expect(row.locator('.fw-doc.missing')).toHaveCount(0);
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
