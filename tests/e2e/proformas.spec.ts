import { chipCount, expect, go, loginAs, resetApp, test, toast } from './fixtures';

test.describe('Proformas et logistique', () => {
  test.beforeEach(async ({ page }) => {
    await resetApp(page);
  });

  test('plan de chargement : glisser une ligne dans un conteneur puis booker', async ({ page }) => {
    await go(page, 'proformas/PF-2026-0143');
    await page.getByRole('button', { name: 'Suivi & Logistique' }).click();

    const row = page.locator('tr[draggable="true"]').first();
    await row.dragTo(page.locator('.ccard').first());
    await expect(toast(page)).toHaveText(/pcs .+ → PLAN-\d+/);
    await expect(page.locator('.summary-bar').first()).toContainText('Reste à consolider : 0 pcs');

    await page.getByRole('button', { name: 'Demander le container' }).first().click();
    await page.getByRole('button', { name: 'Envoyer la demande' }).click();
    await expect(toast(page)).toContainText('Demande de container envoyée');
    await page.getByRole('button', { name: /Confirmer le booking/ }).click();
    await expect(page.getByRole('button', { name: /Confirmer le booking/ })).toHaveCount(0);
  });

  test('logistique valide le plan proposé et demande le booking', async ({ page }) => {
    // Le fournisseur propose d'abord un plan
    await loginAs(page, 'Ms. Park');
    await go(page, 'portail/chargement');
    await page.locator('tr[draggable="true"]').first().dragTo(page.locator('.ccard').first());
    await page.getByRole('button', { name: 'Envoyer mes modifications à JONAS' }).click();

    await loginAs(page, 'Logistique');
    await go(page, 'proformas/PF-2026-0143');
    await page.getByRole('button', { name: 'Suivi & Logistique' }).click();
    await page.getByRole('button', { name: /Valider les modifications/ }).click();
    await page.getByRole('button', { name: 'Demander le container' }).click();
    await page.getByRole('button', { name: 'Envoyer la demande' }).click();
    await expect(toast(page)).toContainText('Demande de container envoyée');
  });

  test('demander le booking depuis la proforma', async ({ page }) => {
    await loginAs(page, 'Logistique');
    // Proforma prête (date de chargement validée par le fournisseur)
    await go(page, 'proformas/PF-2026-0143');
    await page.getByRole('button', { name: /Demander le booking/ }).click();
    const dlg = page.getByRole('dialog', { name: 'Booking PF-2026-0143' });
    await expect(dlg).toContainText('Validée');
    await dlg.getByRole('button', { name: 'Demander le container' }).click();
    await page.locator('#bk-fwd').selectOption('Logfret');
    await page.getByRole('button', { name: 'Envoyer la demande' }).click();
    await expect(toast(page)).toContainText('Demande de container envoyée à Logfret');
    await expect(page.locator('.page-head .pf-book-n')).toHaveCount(0);

    // Proforma dont la date n'est pas encore validée : on propose la date depuis la proforma
    await go(page, 'proformas/PF-2026-0148');
    await page.getByRole('button', { name: /Demander le booking/ }).click();
    const dlg2 = page.getByRole('dialog', { name: 'Booking PF-2026-0148' });
    await expect(dlg2.locator('.pb-ctn')).toHaveCount(2);
    for (const b of await dlg2.getByRole('button', { name: 'Demander le container' }).all()) await expect(b).toBeDisabled();
    await dlg2.getByRole('button', { name: 'Proposer une date' }).click();
    await page.getByRole('button', { name: 'Envoyer au fournisseur' }).click();
    await expect(toast(page)).toContainText('Date de chargement proposée à Horizon Home');
  });

  test('booking depuis une proforma sans conteneur : préparer le chargement', async ({ page }) => {
    await loginAs(page, 'Logistique');
    await go(page, 'proformas/PF-2026-0151');
    await page.getByRole('button', { name: /Demander le booking/ }).click();
    const dlg = page.getByRole('dialog', { name: 'Booking PF-2026-0151' });
    await expect(dlg.locator('.pb-steps')).toBeVisible();
    await dlg.getByRole('button', { name: 'Préparer le chargement' }).click();
    await expect(toast(page)).toContainText('préparé');
    await expect(dlg.locator('.pb-ctn').first()).toBeVisible();
    await expect(dlg.locator('.pb-start')).toHaveCount(0);
    await dlg.getByRole('button', { name: 'Proposer une date' }).first().click();
    await page.getByRole('button', { name: 'Envoyer au fournisseur' }).click();
    await expect(toast(page)).toContainText('Date de chargement proposée');
  });

  test('signature des proformas à signer', async ({ page }) => {
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
