import { expect, expectNoHorizontalOverflow, go, loginAs, resetApp, sidebarItems, test, toast } from './fixtures';

const count = async (stage: ReturnType<import('@playwright/test').Page['locator']>) => parseInt((await stage.locator('.pf-count').innerText()).trim(), 10);

test.describe('Booking', () => {
  test.beforeEach(async ({ page }) => {
    await resetApp(page, 'booking');
    await expect(page.locator('.bk-kpis')).toBeVisible({ timeout: 15000 });
  });

  test('demande, relance, confirmation d’un booking', async ({ page }) => {
    const toRequest = page.locator('.bk-stage.bk-orange');
    const waiting = page.locator('.bk-stage.bk-violet');
    const confirmed = page.locator('.bk-stage.bk-green');
    const [r0, w0, c0] = [await count(toRequest), await count(waiting), await count(confirmed)];

    // Demande au transitaire choisi
    await toRequest.locator('.bk-actions').getByRole('button', { name: 'Demander le booking' }).first().click();
    await page.locator('#bk-fwd').selectOption('Kuehne + Nagel');
    await page.getByRole('button', { name: 'Envoyer la demande' }).click();
    await expect(toast(page)).toContainText('Kuehne + Nagel');
    expect(await count(toRequest)).toBe(r0 - 1);
    expect(await count(waiting)).toBe(w0 + 1);

    // Relance : compteur de relances incrémenté
    const row = waiting.locator('.bk-row').first();
    const before = await row.locator('.bk-info span').innerText();
    await row.getByRole('button', { name: 'Relancer' }).click();
    await expect(toast(page)).toContainText('Relance envoyée');
    await expect(row.locator('.bk-info span')).not.toHaveText(before);

    // Confirmation : n° obligatoire, puis passage en « confirmés »
    await row.getByRole('button', { name: 'Confirmer' }).click();
    const dialog = page.locator('.bk-dialog');
    await dialog.getByRole('button', { name: 'Confirmer le booking' }).click();
    await expect(toast(page)).toContainText('n° de booking');
    await page.locator('#bk-no').fill('BK-77001');
    await page.locator('#bk-vessel').fill('MSC TESSA');
    await dialog.getByRole('button', { name: 'Confirmer le booking' }).click();
    await expect(confirmed.locator('.bk-row', { hasText: 'BK-77001' })).toContainText('MSC TESSA');
    expect(await count(confirmed)).toBe(c0 + 1);
  });

  test('annuler une demande la remet « à demander »', async ({ page }) => {
    const toRequest = page.locator('.bk-stage.bk-orange');
    const r0 = await count(toRequest);
    await page.locator('.bk-stage.bk-violet .bk-row').first().getByRole('button', { name: 'Annuler la demande' }).click();
    await expect(toast(page)).toContainText('annulée');
    expect(await count(toRequest)).toBe(r0 + 1);
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

  test('téléphone : pas de débordement', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await go(page, 'booking');
    await expect(page.locator('.bk-kpis')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
