// Espace Design : l'acheteur, la Direction et le Pilote déplacent les packs (semaine, date de rendu)
import { expect, go, loginAs, resetApp, test, toast } from './fixtures';

const deadlineOf = (page: import('@playwright/test').Page, ref: string) =>
  page.evaluate((ref) => {
    const k = Object.keys(localStorage).find((x) => x.startsWith('jonas-buying-state'))!;
    return JSON.parse(localStorage.getItem(k)!).products.find((p: { ref: string }) => p.ref === ref).pack.artworkDeadline as string;
  }, ref);

test('acheteur : glisser un pack sur une autre semaine', async ({ page }) => {
  await resetApp(page);
  await loginAs(page, 'David');
  await go(page, 'design');
  const row = page.locator('.pk-week.open .pk-row').first();
  const ref = (await row.locator('.pk-id b').innerText()).split('\n')[0].trim();
  const before = await deadlineOf(page, ref);
  const other = page.locator('.pk-week:not(.open)').first();
  await row.dragTo(other.locator('.pf-week-head'));
  await expect(toast(page)).toContainText('1 pack déplacé → semaine');
  expect(await deadlineOf(page, ref)).not.toBe(before);
});

test('Direction : ⇅ sur un pack puis choisir la semaine ; lot de packs avec une date de rendu exacte', async ({ page }) => {
  await resetApp(page);
  await loginAs(page, 'Rudy Zerah');
  await go(page, 'design');
  const row = page.locator('.pk-week.open .pk-row').first();
  const ref = (await row.locator('.pk-id b').innerText()).split('\n')[0].trim();
  await row.getByRole('button', { name: `Déplacer ${ref}` }).click();
  const bar = page.getByRole('group', { name: 'Déplacer vers la semaine' });
  await bar.locator('.pk-wk').nth(5).click();
  await expect(toast(page)).toContainText('1 pack déplacé → semaine');

  // Lot : 2 packs, date exacte
  const rows = page.locator('.pk-week.open .pk-row');
  const refs = [];
  for (let i = 0; i < 2; i++) {
    await rows.nth(i).locator('input[type=checkbox]').check();
    refs.push((await rows.nth(i).locator('.pk-id b').innerText()).split('\n')[0].trim());
  }
  await page.getByLabel('Date de rendu artwork (lot)').fill('2027-01-13');
  await page.getByRole('button', { name: 'Appliquer la date' }).click();
  await expect(toast(page)).toContainText('2 packs : rendu artwork le 13/01/2027');
  for (const r of refs) expect(await deadlineOf(page, r)).toBe('2027-01-13');
});

test('galerie : cocher des cartes et les déplacer ; date exacte depuis le détail du pack', async ({ page }) => {
  await resetApp(page);
  await loginAs(page, 'David');
  await go(page, 'design');
  await page.getByRole('button', { name: 'Galerie' }).click();
  const cards = page.locator('.pk-week.open .pk-card');
  await cards.nth(0).locator('.pk-card-check').check();
  await cards.nth(1).locator('.pk-card-check').check();
  await page.getByRole('group', { name: 'Déplacer vers la semaine' }).locator('.pk-wk').nth(8).click();
  await expect(toast(page)).toContainText('2 packs déplacés → semaine');

  const card = page.locator('.pk-week.open .pk-card').first();
  const ref = (await card.locator('.pk-card-body b').innerText()).trim();
  await card.click();
  await page.getByLabel('Date de rendu artwork', { exact: true }).fill('2026-12-02');
  await expect(toast(page)).toContainText(`${ref} : rendu artwork le 02/12/2026`);
  expect(await deadlineOf(page, ref)).toBe('2026-12-02');
});
