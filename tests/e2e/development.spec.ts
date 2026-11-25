import { expect, go, lastInt, loginAs, resetApp, sidebarItems, test, toast } from './fixtures';

test.describe('Développement', () => {
  test.beforeEach(async ({ page }) => {
    await resetApp(page, 'developpement');
    await expect(page.locator('.dev-line').first()).toBeVisible();
  });

  test('vue par semaine et PUSH URGENT', async ({ page }) => {
    const urgentTab = page.getByRole('button', { name: /PUSH URGENT/ });
    await urgentTab.click();
    const before = await page.locator('.dev-urgent .dev-line').count();

    await page.getByRole('button', { name: 'Par semaine' }).click();
    await page.locator('.dev-line', { hasText: 'YD-S020' }).getByRole('button', { name: /Push/ }).click();
    await urgentTab.click();
    await expect(page.locator('.dev-urgent .dev-line')).toHaveCount(before + 1);
    await expect(page.locator('.dev-urgent .dev-line', { hasText: 'YD-S020' })).toHaveCount(1);
  });

  test('l’administrateur glisse un produit sur un designer', async ({ page }) => {
    const line = page.locator('.dev-line.draggable').first();
    const ref = (await line.locator('.dev-id b').innerText()).trim();
    const hugo = page.locator('.dev-designers .pf-chip', { hasText: 'ROLAND' });
    const h0 = lastInt(await hugo.innerText());

    await line.dragTo(hugo);
    await expect(toast(page)).toHaveText(`${ref} → ROLAND`);
    await expect.poll(async () => lastInt(await hugo.innerText())).toBe(h0 + 1);
  });

  test('tri par collection', async ({ page }) => {
    await page.locator('#dev-sort').selectOption('collection');
    await expect(page.locator('#dev-sort')).toHaveValue('collection');
    await expect(page.locator('.dev-line').first()).toBeVisible();
  });

  test('le designer voit ses produits par défaut, sans actions', async ({ page }) => {
    await loginAs(page, 'ABIR');
    expect(await sidebarItems(page)).toContain('Développement');
    await go(page, 'developpement');
    await expect(page.locator('.dev-designers .pf-chip.active')).toContainText('ABIR');
    await expect(page.locator('.dev-line').first()).toBeVisible();
    await expect(page.locator('.dev-actions button')).toHaveCount(0);
    await expect(page.locator('.dev-line.draggable')).toHaveCount(0);
  });
});
