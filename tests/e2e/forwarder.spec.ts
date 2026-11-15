import { expect, expectNoHorizontalOverflow, go, loginAs, resetApp, setUser, sidebarItems, test, toast } from './fixtures';

const count = async (page: import('@playwright/test').Page, title: string) =>
  parseInt((await page.locator('.bk-stage', { hasText: title }).locator('.pf-count').innerText()).trim(), 10);

test.describe('Portail transitaire', () => {
  test.beforeEach(async ({ page }) => {
    await resetApp(page);
  });

  test('connexion transitaire : redirection et données isolées', async ({ page }) => {
    await loginAs(page, 'Anna Weber');
    await expect(page).toHaveURL(/#\/transitaire$/);
    expect(await sidebarItems(page)).toEqual(expect.arrayContaining(['Mes conteneurs']));
    // Kuehne + Nagel ne voit pas les conteneurs Logfret (Jinfa, Yiwu)
    await expect(page.locator('main')).toContainText('Tide Living');
    await expect(page.locator('main')).not.toContainText('Jinfa');
    // Pas d'accès à l'application JONAS
    await setUser(page, 'fwd-kn', 'proformas');
    await expect(page).toHaveURL(/#\/transitaire$/);
  });

  test('confirmation, départ, ETA, douane et livraison — remontés à JONAS', async ({ page }) => {
    await go(page, 'booking');
    const pfRow = page.locator('.bk-stage.bk-green .bk-row', { hasText: 'PF-2026-0141' });
    await expect(pfRow).toContainText('En attente de confirmation Kuehne + Nagel');

    await loginAs(page, 'Anna Weber');
    const atSea0 = await count(page, 'En mer');
    // 1. Confirmer le booking
    await page.locator('.bk-stage', { hasText: 'Bookings à confirmer' }).locator('.bk-actions').getByRole('button', { name: 'Confirmer' }).first().click();
    await page.locator('#fw-num').fill('CMAU7654321');
    await page.locator('#fw-vessel').fill('CMA CGM Trocadero');
    await page.getByRole('button', { name: 'Confirmer le booking' }).click();
    await expect(toast(page)).toContainText('CMAU7654321');
    const ready = page.locator('.bk-stage', { hasText: 'Prêts au départ' });
    await expect(ready).toContainText('CMA CGM TROCADERO');
    // 2. Départ
    await ready.locator('.bk-actions').getByRole('button', { name: 'Départ effectué' }).click();
    expect(await count(page, 'En mer')).toBe(atSea0 + 1);
    const row = page.locator('.bk-stage', { hasText: 'En mer' }).locator('.bk-row', { hasText: 'CMAU7654321' });
    // 3. ETA, douane, livraison
    await row.getByRole('button', { name: 'Nouvelle ETA' }).click();
    await page.locator('#fw-date').fill('2027-01-12');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(toast(page)).toContainText('ETA mise à jour');
    await row.getByRole('button', { name: 'Lancer la douane' }).click();
    await row.getByRole('button', { name: 'Dédouané' }).click();
    await row.getByRole('button', { name: 'Planifier la livraison' }).click();
    await page.locator('#fw-date').fill('2027-01-15');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(row).toContainText('Livraison 15 janv.');

    // Côté JONAS : conteneur parti, ETA révisée, dédouané, livraison planifiée
    await loginAs(page, 'Logistique');
    await go(page, 'conteneurs');
    await page.getByRole('button', { name: 'Tout' }).click();
    const card = page.locator('.ct-card', { hasText: 'CMAU7654321' });
    await expect(card).toContainText('Dédouané');
    await expect(card).toContainText('Livraison 15 janv.');
    await expect(card).toContainText('ETA révisée');
  });

  test('téléphone : pas de débordement', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setUser(page, 'fwd-logfret', 'transitaire');
    await expect(page.locator('.bk-kpis')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('l’équipe JONAS et les fournisseurs n’ont pas accès au portail transitaire', async ({ page }) => {
    await go(page, 'transitaire');
    await expect(page).not.toHaveURL(/transitaire/);
    await setUser(page, 'sup-tide', 'transitaire');
    await expect(page).not.toHaveURL(/transitaire/);
  });
});
