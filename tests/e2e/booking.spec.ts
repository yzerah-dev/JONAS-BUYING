import { expect, expectNoHorizontalOverflow, go, loginAs, resetApp, sidebarItems, test, toast } from './fixtures';

const count = async (stage: ReturnType<import('@playwright/test').Page['locator']>) => parseInt((await stage.locator('.pf-count').innerText()).trim(), 10);

test.describe('Booking', () => {
  test.beforeEach(async ({ page }) => {
    await resetApp(page, 'booking');
    await expect(page.locator('.bk-kpis')).toBeVisible({ timeout: 15000 });
  });

  test('JONAS demande → le fournisseur prend en compte et demande les boîtes → le transitaire booke', async ({ page }) => {
    await loginAs(page, 'Logistique');
    await go(page, 'booking');
    const toAsk = page.locator('.bk-stage.bk-orange');
    const atSupplier = page.locator('.bk-stage', { has: page.getByRole('heading', { name: 'Attente fournisseur', exact: true }) });
    const atForwarder = page.locator('.bk-stage', { has: page.getByRole('heading', { name: 'Attente transitaire', exact: true }) });
    const booked = page.locator('.bk-stage.bk-green');

    // 1. Demande : nombre de containers et date souhaitée
    await toAsk.locator('.bk-row', { hasText: 'PF-2026-0148' }).getByRole('button', { name: 'Demande de booking' }).click();
    await page.locator('#bk-n').fill('2');
    await page.locator('#bk-date').fill('2026-11-26');
    await page.getByRole('button', { name: 'Envoyer au fournisseur' }).click();
    await expect(toast(page)).toContainText('Demande de booking envoyée à Horizon Home');
    await expect(atSupplier.locator('.bk-row', { hasText: 'PF-2026-0148' })).toContainText('2 × 40HC');

    // 2. Le fournisseur prend en compte : plan, marchandise prête, boîtes demandées au transitaire
    await loginAs(page, 'Wang Lei');
    await expect(page.locator('main')).toContainText('à prendre en compte');
    await go(page, 'portail/booking');
    const form = page.getByRole('form', { name: 'Prenez en compte la demande de booking PF-2026-0148' });
    await expect(form).toContainText('2 × 40HC');
    await form.getByRole('button', { name: 'Préparer le plan' }).click();
    await expect(form.locator('.pill.orange')).toHaveCount(0);
    await page.locator('#pb-ready-PF20260148').fill('2026-11-25');
    await page.locator('#pb-fwd-PF20260148').selectOption('Logfret');
    await form.getByRole('button', { name: 'Demander les boîtes au transitaire' }).click();
    await expect(toast(page)).toContainText('Boîtes demandées à Logfret');
    await expect(page.locator('.pb-fwd', { hasText: 'PF-2026-0148' })).toContainText('en attente du booking de Logfret');

    // JONAS voit la demande chez le transitaire
    await loginAs(page, 'Logistique');
    await go(page, 'booking');
    await expect(atForwarder.locator('.bk-row', { hasText: 'PF-2026-0148' })).toContainText('Marchandise prête le 25 nov.');

    // 3. Le transitaire fait le booking
    await loginAs(page, 'Julien Morel');
    await expect(page).toHaveURL(/#\/transitaire\/a-booker$/);
    await page.locator('.bk-row', { hasText: 'PF-2026-0148' }).getByRole('button', { name: 'Faire le booking' }).click();
    await page.locator('#be-car-PF20260148').selectOption('MSC');
    await page.locator('#be-no-PF20260148').fill('MSC-55821');
    await page.locator('#be-ves-PF20260148').fill('MSC Arina');
    await page.locator('#be-load-PF20260148').fill('2026-11-27');
    await page.locator('#be-etd-PF20260148').fill('2026-12-02');
    await page.locator('#be-eta-PF20260148').fill('2026-12-30');
    await page.getByRole('button', { name: 'Enregistrer le booking' }).click();
    await expect(toast(page)).toContainText('Booking PF-2026-0148 enregistré');
    await expect(page.locator('main .bk-row', { hasText: 'PF-2026-0148' })).toHaveCount(0);
    await page.locator('nav.sidebar').getByRole('link', { name: /Prêts au départ/ }).click();
    await expect(page.locator('.bk-row', { hasText: 'MSC-55821' }).first()).toContainText('MSC ARINA');

    // 4. Côté JONAS : booké par le transitaire, dates réelles
    await loginAs(page, 'Logistique');
    await go(page, 'booking');
    const row = booked.locator('.bk-row', { hasText: 'PF-2026-0148' });
    await expect(row).toContainText('Chargement 27 nov.');
    await expect(row).toContainText('MSC-55821');
    await expect(row).toContainText('Booké par Logfret');
    await go(page, 'proformas/PF-2026-0148');
    await expect(page.locator('.page-head')).toContainText('Booké');
  });

  test('le transitaire ne passe pas par l’appli : le fournisseur saisit le booking pour lui', async ({ page }) => {
    await loginAs(page, 'Zhao Min');
    await go(page, 'portail/booking');
    const card = page.locator('.pb-fwd', { hasText: 'PF-2026-0145' });
    await card.getByRole('button', { name: 'Saisir le booking pour Logfret' }).click();
    await page.locator('#be-car-PF20260145').selectOption('COSCO');
    await page.locator('#be-no-PF20260145').fill('COS-778120');
    await card.getByRole('button', { name: 'Enregistrer le booking' }).click();
    await expect(toast(page)).toContainText('Booking PF-2026-0145 enregistré');
    await expect(page.locator('.pb-fwd')).toHaveCount(0);

    await loginAs(page, 'Logistique');
    await go(page, 'booking');
    const row = page.locator('.bk-stage.bk-green .bk-row', { hasText: 'PF-2026-0145' });
    await expect(row).toContainText('COS-778120');
    await expect(row).toContainText('Saisi par le fournisseur pour Logfret');

    // Le transitaire retrouve les conteneurs, prêts au départ
    await loginAs(page, 'Julien Morel');
    await expect(page.locator('main')).not.toContainText('PF-2026-0145');
    await page.locator('nav.sidebar').getByRole('link', { name: /Prêts au départ/ }).click();
    await expect(page.locator('main')).toContainText('COS-778120');
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
