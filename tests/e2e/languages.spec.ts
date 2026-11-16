import { expect, go, resetApp, setUser, test } from './fixtures';

test.describe('Portails en français, anglais et chinois', () => {
  test.beforeEach(async ({ page }) => {
    await resetApp(page);
  });

  test('portail fournisseur : bascule FR / EN / 中文', async ({ page }) => {
    await setUser(page, 'sup-tide', 'portail');
    const nav = page.locator('nav.sidebar');
    await expect(nav).toContainText('Mes proformas');
    await page.getByRole('button', { name: 'EN', exact: true }).click();
    await expect(nav).toContainText('My proformas');
    await page.getByRole('button', { name: '中文', exact: true }).click();
    await expect(nav).toContainText('我的形式发票');
    await expect(page.locator('main')).toContainText('需要您处理的事项');
    // Le choix est mémorisé
    await go(page, 'portail/booking');
    await expect(page.locator('main h1')).toContainText('订舱');
  });

  test('portail transitaire : bascule FR / EN / 中文', async ({ page }) => {
    await setUser(page, 'fwd-kn', 'transitaire/a-booker');
    const nav = page.locator('nav.sidebar');
    await expect(nav).toContainText('Bookings à faire');
    await page.getByRole('button', { name: 'EN', exact: true }).click();
    await expect(nav).toContainText('Bookings to make');
    await expect(page.locator('.fw-head')).toContainText('JONAS has chosen you');
    await page.getByRole('button', { name: '中文', exact: true }).click();
    await expect(nav).toContainText('待订舱');
    await expect(nav).toContainText('海运中');
    await expect(page.locator('main')).toContainText('提交订舱方案');
  });

  test('langue par défaut : chinois pour un fournisseur en Chine, anglais pour Kuehne + Nagel', async ({ page }) => {
    await page.evaluate(() => localStorage.removeItem('jonas-buying-lang'));
    await setUser(page, 'sup-tide', 'portail');
    await expect(page.locator('nav.sidebar')).toContainText('我的形式发票');
    await page.evaluate(() => localStorage.removeItem('jonas-buying-lang'));
    await setUser(page, 'fwd-kn', 'transitaire/a-booker');
    await expect(page.locator('nav.sidebar')).toContainText('Bookings to make');
  });
});
