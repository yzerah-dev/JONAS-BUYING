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
    await toRequest.locator('.bk-actions').getByRole('button', { name: 'Demander le container' }).first().click();
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

  test('deux circuits : date validée par le fournisseur, plan validé tel quel', async ({ page }) => {
    await loginAs(page, 'Logistique');
    await go(page, 'booking');
    const row = page.locator('.bk-stage.bk-orange .bk-row', { hasText: 'Horizon' }).filter({ hasText: 'À proposer au fournisseur' }).first();
    const id = (await row.locator('.bk-num strong').innerText()).trim();
    const rowById = page.locator('.bk-stage.bk-orange .bk-row', { hasText: id });
    const request = rowById.getByRole('button', { name: 'Demander le container' });

    // 1. JONAS propose une date de chargement : la demande de container reste bloquée
    await rowById.getByRole('button', { name: 'Proposer une date' }).click();
    await page.locator('#bk-load').fill('2026-11-24');
    await page.getByRole('button', { name: 'Envoyer au fournisseur' }).click();
    await expect(toast(page)).toContainText('Date de chargement proposée');
    await expect(rowById).toContainText('attente fournisseur');
    await expect(request).toBeDisabled();
    // 2. JONAS envoie le plan de chargement
    await rowById.getByRole('button', { name: 'Envoyer le plan' }).click();
    await expect(rowById.locator('.bk-track').nth(1)).toContainText('Envoyé · attente fournisseur');

    // Le fournisseur change la date et valide le plan tel quel
    await loginAs(page, 'Wang Lei');
    await go(page, 'portail/chargement');
    const ld = page.locator('.ld-row', { hasText: id });
    await ld.getByRole('button', { name: 'Proposer une autre date' }).click();
    await ld.locator('input[type="date"]').fill('2026-11-26');
    await ld.getByRole('button', { name: 'Envoyer' }).click();
    await expect(toast(page)).toContainText('Nouvelle date envoyée');
    await expect(page.locator('.ld-row', { hasText: id })).toHaveCount(0);
    await page.locator('.ccard', { hasText: id }).click();
    await page.getByRole('button', { name: 'Valider le plan tel quel' }).click();
    await expect(toast(page)).toContainText('Plan de chargement validé');

    // Retour logistique : date validée (changée), plan accepté, container demandable
    await loginAs(page, 'Logistique');
    await go(page, 'booking');
    await expect(rowById.locator('.bk-track').first()).toContainText('Changée par le fournisseur');
    await expect(rowById.locator('.bk-track').nth(1)).toContainText('Accepté tel quel');
    await expect(request).toBeEnabled();
    await request.click();
    await expect(page.locator('.bk-ok')).toContainText('26/11');
  });

  test('plan modifié par le fournisseur : JONAS valide les modifications', async ({ page }) => {
    await loginAs(page, 'Ms. Park');
    await go(page, 'portail/chargement');
    await page.locator('tr[draggable="true"]').first().dragTo(page.locator('.ccard').first());
    await expect(page.getByRole('button', { name: 'Valider le plan tel quel' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Envoyer mes modifications à JONAS' }).click();

    await loginAs(page, 'Logistique');
    await go(page, 'booking');
    const row = page.locator('.bk-stage.bk-orange .bk-row', { hasText: 'Modifié par le fournisseur' }).first();
    await row.getByRole('button', { name: 'Valider les modifications' }).click();
    await expect(toast(page)).toContainText('Modifications du fournisseur validées');
    await expect(page.locator('.bk-stage.bk-orange .bk-row', { hasText: 'Modifié par le fournisseur' })).toHaveCount(0);
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
