// Changer la semaine d'expédition d'une proforma : glisser-déposer, toucher puis choisir, ou depuis la proforma
import { expect, go, loginAs, resetApp, test, toast } from './fixtures';

const pfOf = (page: import('@playwright/test').Page, id: string) =>
  page.evaluate((id) => {
    const k = Object.keys(localStorage).find((x) => x.startsWith('jonas-buying-state'))!;
    return JSON.parse(localStorage.getItem(k)!).proformas.find((p: { id: string }) => p.id === id) as { etd: string; eta: string; history: { text: string }[] };
  }, id);
const plusDays = (d: string, n: number) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};

test('toucher ⇅ puis choisir la semaine : la proforma change de semaine (ETA suit)', async ({ page }) => {
  await resetApp(page);
  await loginAs(page, 'David');
  await go(page, 'proformas');
  const before = await pfOf(page, 'PF-2026-0146');
  await page.getByRole('button', { name: 'Déplacer PF-2026-0146', exact: true }).click();
  const bar = page.getByRole('region', { name: 'Déplacer vers la semaine' });
  await expect(bar).toContainText('PF-2026-0146');
  // Deux semaines plus tard
  const target = plusDays(before.etd, 14);
  const label = await page.evaluate((d) => {
    const x = new Date(`${d}T12:00:00Z`);
    const day = (x.getUTCDay() + 6) % 7;
    x.setUTCDate(x.getUTCDate() - day + 3);
    const first = new Date(Date.UTC(x.getUTCFullYear(), 0, 4));
    const w = 1 + Math.round(((x.getTime() - first.getTime()) / 86400000 - 3 + ((first.getUTCDay() + 6) % 7)) / 7);
    return `S${String(w).padStart(2, '0')}`;
  }, target);
  await bar.getByRole('button', { name: new RegExp(`^${label}`) }).click();
  await expect(toast(page)).toContainText(`PF-2026-0146 déplacée en ${label}`);
  const after = await pfOf(page, 'PF-2026-0146');
  expect(after.etd).toBe(target);
  expect(after.eta).toBe(plusDays(before.eta, 14));
  expect(after.history.at(-1)!.text).toContain(`→ ${label}`);
});

test('glisser-déposer une proforma sur une autre semaine', async ({ page }) => {
  await resetApp(page);
  await loginAs(page, 'David');
  await go(page, 'proformas');
  const before = await pfOf(page, 'PF-2026-0146');
  const row = page.locator('.pf-table tr', { hasText: 'PF-2026-0146' });
  const other = page
    .locator('.pf-week')
    .filter({ hasNot: page.locator('tr', { hasText: 'PF-2026-0146' }) })
    .first();
  await row.dragTo(other.locator('.pf-week-head'));
  await expect(toast(page)).toContainText('PF-2026-0146 déplacée en');
  expect((await pfOf(page, 'PF-2026-0146')).etd).not.toBe(before.etd);
});

test('dans la proforma : changer la semaine d’expédition', async ({ page }) => {
  await resetApp(page);
  await loginAs(page, 'David');
  await go(page, 'proformas/PF-2026-0146');
  const before = await pfOf(page, 'PF-2026-0146');
  const sel = page.getByLabel('ETD · semaine d’expédition');
  await expect(sel.locator('option').first()).toBeAttached();
  const options = await sel.locator('option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
  const idx = options.indexOf(await sel.inputValue());
  await sel.selectOption(options[idx + 1]);
  await expect(toast(page)).toContainText('PF-2026-0146 déplacée en');
  expect((await pfOf(page, 'PF-2026-0146')).etd).toBe(plusDays(before.etd, 7));
});
