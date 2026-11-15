import { chipCount, expect, go, loginAs, resetApp, test, toast } from './fixtures';

test.describe('Proformas et logistique', () => {
  test.beforeEach(async ({ page }) => {
    await resetApp(page);
  });

  test('plan de chargement : glisser une ligne dans un conteneur', async ({ page }) => {
    await go(page, 'proformas/PF-2026-0143');
    await page.getByRole('button', { name: 'Suivi & Logistique' }).click();
    const row = page.locator('tr[draggable="true"]').first();
    await row.dragTo(page.locator('.ccard').first());
    await expect(toast(page)).toHaveText(/pcs .+ → PLAN-\d+/);
    await expect(page.locator('.summary-bar').first()).toContainText('Reste à consolider : 0 pcs');
  });

  test('demande de booking depuis la proforma', async ({ page }) => {
    await loginAs(page, 'Logistique');
    await go(page, 'proformas/PF-2026-0151');
    await page.getByRole('button', { name: 'Demande de booking' }).click();
    await page.locator('#bk-n').fill('2');
    await page.locator('#bk-date').fill('2026-12-03');
    await page.getByRole('button', { name: 'Envoyer au fournisseur' }).click();
    await expect(toast(page)).toContainText('Demande de booking envoyée à Nova Beauty');
    await expect(page.locator('.page-head')).toContainText('Booking demandé · 2 × 40HC · attente fournisseur');
    await expect(page.getByRole('button', { name: 'Demande de booking' })).toHaveCount(0);
  });

  test('demande de booking depuis la liste des proformas et depuis l’onglet Suivi & Logistique', async ({ page }) => {
    await loginAs(page, 'Logistique');
    await go(page, 'proformas');
    await page.getByRole('button', { name: 'Vue liste' }).click();
    await page.getByPlaceholder(/Rechercher une proforma/).fill('PF-2026-0151');
    await page.locator('tr', { hasText: 'PF-2026-0151' }).locator('.pf-bk-btn').click();
    await page.getByRole('button', { name: 'Envoyer au fournisseur' }).click();
    await expect(toast(page)).toContainText('Demande de booking envoyée à Nova Beauty');
    await expect(page).toHaveURL(/#\/proformas$/);
    await expect(page.locator('.pf-bk-wait').first()).toBeVisible();

    await go(page, 'proformas/PF-2026-0148');
    await page.getByRole('button', { name: 'Suivi & Logistique' }).click();
    const banner = page.locator('.pf-bk-banner');
    await expect(banner).toContainText('Booking à demander');
    await banner.getByRole('button', { name: 'Demande de booking' }).click();
    await page.getByRole('button', { name: 'Envoyer au fournisseur' }).click();
    await expect(banner).toContainText('Booking demandé');
  });

  test('bouton de booking toujours visible : proforma à signer expliquée, acheteur autorisé', async ({ page }) => {
    await go(page, 'proformas/PF-2026-0146');
    await page.locator('.page-head').getByRole('button', { name: 'Demande de booking' }).click();
    await expect(toast(page)).toContainText('Signez d’abord la proforma');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await loginAs(page, 'David');
    await go(page, 'proformas/PF-2026-0151');
    await page.locator('.page-head').getByRole('button', { name: 'Demande de booking' }).click();
    await page.getByRole('button', { name: 'Envoyer au fournisseur' }).click();
    await expect(toast(page)).toContainText('Demande de booking envoyée');
  });

  test('signature des proformas à signer : la proforma déposée par le fournisseur', async ({ page }) => {
    await go(page, 'proformas');
    const chips = page.locator('.pf-chips');
    const count = async (label: string) => {
      const txt = (await chips.innerText()).replace(/\n/g, ' ');
      const m = txt.match(new RegExp(label + ' (\\d+)'));
      return m ? Number(m[1]) : 0;
    };
    const toSign = await count('À signer');
    expect(toSign).toBeGreaterThan(0);

    await page.getByRole('button', { name: /^Signer \(/ }).click();
    await page.getByRole('button', { name: 'Signer maintenant' }).first().click();
    await page.locator('#sg-etd').fill('2026-12-09');
    await page.getByRole('button', { name: 'Signer et tamponner' }).click();
    await expect(toast(page)).toContainText('signée et tamponnée');
    await expect.poll(() => count('À signer')).toBe(toSign - 1);
  });

  test('validation complète d’un pack en validation (Espace Designer)', async ({ page }) => {
    await go(page, 'design');
    const validated = await chipCount(page, 'Validés');
    await page.locator('.pk-chip', { hasText: 'En validation' }).click();
    await page.locator('.pk-row').first().click();
    const validate = page.getByRole('button', { name: /^Valider \(/ });
    for (let i = 0; i < 4 && (await validate.count()); i++) await validate.click();
    await expect.poll(() => chipCount(page, 'Validés')).toBe(validated + 1);
  });
});
