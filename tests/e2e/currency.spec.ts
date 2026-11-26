// Tous les montants s'affichent dans la devise du fournisseur (jamais convertis en euros)
import { expect, go, resetApp, test } from './fixtures';

test('proforma en USD : montant en USD dans la liste, le détail et la finance', async ({ page }) => {
  await resetApp(page);
  await page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.startsWith('jonas-buying-state'))!;
    const s = JSON.parse(localStorage.getItem(k)!);
    s.proformas.find((p: { id: string }) => p.id === 'PF-2026-0146').currency = 'USD';
    localStorage.setItem(k, JSON.stringify(s));
  });
  await go(page, 'proformas');
  await page.reload();
  const row = page.locator('.pfx tr', { hasText: 'PF-2026-0146' });
  await expect(row).toContainText('100 000 USD');
  await expect(row).not.toContainText('€');
  // Semaine mixte : total par devise
  await expect(page.locator('.pf-week.open .pfx-metrics')).toContainText(/USD \+ .*€|€ \+ .*USD/);

  await go(page, 'proformas/PF-2026-0146');
  await expect(page.locator('main')).toContainText('USD');

  await go(page, 'finance');
  await expect(page.locator('tr', { hasText: 'PF-2026-0146' }).first()).toContainText('USD');
});
