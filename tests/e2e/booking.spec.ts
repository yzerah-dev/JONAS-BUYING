import { expect, expectNoHorizontalOverflow, go, loginAs, resetApp, sidebarItems, test, toast } from './fixtures';

const count = async (stage: ReturnType<import('@playwright/test').Page['locator']>) => parseInt((await stage.locator('.pf-count').innerText()).trim(), 10);

test.describe('Booking', () => {
  test.beforeEach(async ({ page }) => {
    await resetApp(page, 'booking');
    await expect(page.locator('.bk-kpis')).toBeVisible({ timeout: 15000 });
  });

  test('JONAS demande le booking, le fournisseur répond avec le plan et les dates réelles', async ({ page }) => {
    await loginAs(page, 'Logistique');
    await go(page, 'booking');
    const toAsk = page.locator('.bk-stage.bk-orange');
    const waiting = page.locator('.bk-stage.bk-violet');
    const booked = page.locator('.bk-stage.bk-green');

    // 1. Demande : nombre de containers et date souhaitée
    await toAsk.locator('.bk-row', { hasText: 'PF-2026-0148' }).getByRole('button', { name: 'Demande de booking' }).click();
    await page.locator('#bk-n').fill('2');
    await page.locator('#bk-date').fill('2026-11-26');
    await page.getByRole('button', { name: 'Envoyer au fournisseur' }).click();
    await expect(toast(page)).toContainText('Demande de booking envoyée à Horizon Home');
    await expect(waiting.locator('.bk-row', { hasText: 'PF-2026-0148' })).toContainText('2 × 40HC');

    // 2. Le fournisseur reçoit l'alerte et répond : plan de chargement + dates réelles
    await loginAs(page, 'Wang Lei');
    await expect(page.locator('main')).toContainText('booking(s) à effectuer');
    await go(page, 'portail/booking');
    const form = page.getByRole('form', { name: 'Effectuez le booking de PF-2026-0148' });
    await expect(form).toContainText('2 × 40HC');
    await form.getByRole('button', { name: 'Préparer le plan' }).click();
    await expect(form.locator('.pill.orange')).toHaveCount(0);
    await page.locator('#pb-load-PF20260148').fill('2026-11-27');
    await page.locator('#pb-etd-PF20260148').fill('2026-12-02');
    await page.locator('#pb-eta-PF20260148').fill('2026-12-30');
    await page.locator('#pb-car-PF20260148').selectOption('MSC');
    await page.locator('#pb-no-PF20260148').fill('MSC-55821');
    await form.getByRole('button', { name: 'Envoyer à JONAS' }).click();
    await expect(toast(page)).toContainText('Booking envoyé à JONAS');
    await expect(page.locator('.pb-answer')).toHaveCount(0);

    // 3. Côté JONAS : proforma bookée avec les dates réelles
    await loginAs(page, 'Logistique');
    await go(page, 'booking');
    const row = booked.locator('.bk-row', { hasText: 'PF-2026-0148' });
    await expect(row).toContainText('Chargement 27 nov.');
    await expect(row).toContainText('MSC-55821');
    await go(page, 'proformas/PF-2026-0148');
    await expect(page.locator('.page-head')).toContainText('Booké');
  });

  test('relancer puis annuler une demande', async ({ page }) => {
    await loginAs(page, 'Logistique');
    await go(page, 'booking');
    const toAsk = page.locator('.bk-stage.bk-orange');
    const r0 = await count(toAsk);
    const row = page.locator('.bk-stage.bk-violet .bk-row', { hasText: 'PF-2026-0145' });
    await expect(row.locator('.bk-info b')).toHaveClass(/red/);
    await row.getByRole('button', { name: 'Relancer' }).click();
    await expect(toast(page)).toContainText('Relance envoyée');
    await expect(row).toContainText('2 relance(s)');
    await row.getByRole('button', { name: 'Annuler la demande' }).click();
    await expect(toast(page)).toContainText('annulée');
    expect(await count(toAsk)).toBe(r0 + 1);
  });

  test('visible pour la logistique, pas pour la finance ni les designers', async ({ page }) => {
    for (const [who, visible] of [
      ['Logistique', true],
      ['Finance', false],
      ['Léa', false],
    ] as const) {
      await loginAs(page, who);
      expect((await sidebarItems(page)).includes('Booking')).toBe(visible);
    }
  });

  test('téléphone : pas de débordement (JONAS et portail)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await go(page, 'booking');
    await expect(page.locator('.bk-kpis')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await loginAs(page, 'Ms. Park');
    await go(page, 'portail/booking');
    await expect(page.locator('.pb-answer')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
