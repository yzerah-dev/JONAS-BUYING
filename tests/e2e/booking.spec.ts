import { expect, expectNoHorizontalOverflow, go, loginAs, resetApp, sidebarItems, test, toast } from './fixtures';

const count = async (stage: ReturnType<import('@playwright/test').Page['locator']>) => parseInt((await stage.locator('.pf-count').innerText()).trim(), 10);

test.describe('Booking', () => {
  test.beforeEach(async ({ page }) => {
    await resetApp(page, 'booking');
    await expect(page.locator('.bk-kpis')).toBeVisible({ timeout: 15000 });
  });

  test('JONAS demande et choisit le transitaire → le fournisseur prend en compte → le transitaire propose → fournisseur et JONAS acceptent', async ({ page }) => {
    await loginAs(page, 'Logistique');
    await go(page, 'booking');
    const toAsk = page.locator('.bk-stage.bk-orange');
    const stage = (name: string) => page.locator('.bk-stage', { has: page.getByRole('heading', { name, exact: true }) });
    const booked = page.locator('.bk-stage.bk-green');

    // 1. Demande : nombre de containers, date souhaitée et transitaire
    await toAsk.locator('.bk-row', { hasText: 'PF-2026-0148' }).getByRole('button', { name: 'Demande de booking' }).click();
    await page.locator('#bk-n').fill('2');
    await page.locator('#bk-date').fill('2026-11-26');
    await page.locator('#bk-fwd').selectOption('Logfret');
    await page.getByRole('button', { name: 'Envoyer au fournisseur' }).click();
    await expect(toast(page)).toContainText('Demande de booking envoyée à Horizon Home');
    await expect(stage('Attente fournisseur').locator('.bk-row', { hasText: 'PF-2026-0148' })).toContainText('2 × 40HC');

    // 2. Le fournisseur prend en compte : plan et marchandise prête (le transitaire est imposé par JONAS)
    await loginAs(page, 'Wang Lei');
    await expect(page.locator('main')).toContainText('à prendre en compte');
    await go(page, 'portail/booking');
    const form = page.getByRole('form', { name: 'Prenez en compte la demande de booking PF-2026-0148' });
    await expect(form).toContainText('Transitaire choisi par JONAS : Logfret');
    await form.getByRole('button', { name: 'Préparer le plan' }).click();
    await expect(form.locator('.pill.orange')).toHaveCount(0);
    await page.locator('#pb-ready-PF20260148').fill('2026-11-25');
    await form.getByRole('button', { name: 'Transmettre au transitaire' }).click();
    await expect(toast(page)).toContainText('Demande transmise à Logfret');
    await expect(page.locator('.pb-fwd', { hasText: 'PF-2026-0148' })).toContainText('en attente de la proposition de Logfret');

    // 3. Le transitaire fait sa proposition
    await loginAs(page, 'Julien Morel');
    await expect(page).toHaveURL(/#\/transitaire\/a-booker$/);
    const fwRow = page.locator('.bk-row', { hasText: 'PF-2026-0148' });
    await fwRow.getByRole('button', { name: 'Faire la proposition' }).click();
    await page.locator('#be-car-PF20260148').selectOption('MSC');
    await page.locator('#be-no-PF20260148').fill('MSC-55821');
    await page.locator('#be-ves-PF20260148').fill('MSC Arina');
    await page.locator('#be-load-PF20260148').fill('2026-11-27');
    await page.locator('#be-etd-PF20260148').fill('2026-12-02');
    await page.locator('#be-eta-PF20260148').fill('2026-12-30');
    await page.getByRole('button', { name: 'Envoyer la proposition' }).click();
    await expect(toast(page)).toContainText('Proposition PF-2026-0148 envoyée');
    await expect(fwRow).toContainText('Proposition envoyée');
    await expect(fwRow).toContainText('Fournisseur : à accepter');

    // 4a. Le fournisseur accepte
    await loginAs(page, 'Wang Lei');
    await go(page, 'portail/booking');
    const val = page.locator('.pb-val', { hasText: 'PF-2026-0148' });
    await expect(val).toContainText('MSC · MSC-55821 · MSC ARINA');
    await val.getByRole('button', { name: 'Accepter' }).click();
    await expect(toast(page)).toContainText('Proposition acceptée');
    await expect(val).toContainText('Fournisseur : accepté');
    await expect(val.getByRole('button', { name: 'Accepter' })).toHaveCount(0);

    // 4b. JONAS accepte : booké
    await loginAs(page, 'Logistique');
    await go(page, 'booking');
    const vrow = stage('À valider').locator('.bk-row', { hasText: 'PF-2026-0148' });
    await expect(vrow).toContainText('Fournisseur : accepté');
    await vrow.getByRole('button', { name: 'Accepter' }).click();
    await expect(toast(page)).toContainText('PF-2026-0148 booké');
    const row = booked.locator('.bk-row', { hasText: 'PF-2026-0148' });
    await expect(row).toContainText('Chargement 27 nov.');
    await expect(row).toContainText('MSC-55821');
    await expect(row).toContainText('Proposé par Logfret');
    await go(page, 'proformas/PF-2026-0148');
    await expect(page.locator('.page-head')).toContainText('Booké');

    // Le transitaire retrouve les conteneurs prêts au départ
    await loginAs(page, 'Julien Morel');
    await page.locator('nav.sidebar').getByRole('link', { name: /Prêts au départ/ }).click();
    await expect(page.locator('.bk-row', { hasText: 'MSC-55821' }).first()).toContainText('MSC ARINA');
  });

  test('JONAS refuse la proposition : elle repart au transitaire avec le motif', async ({ page }) => {
    await loginAs(page, 'Logistique');
    await go(page, 'booking');
    const vrow = page.locator('.bk-stage', { has: page.getByRole('heading', { name: 'À valider', exact: true }) }).locator('.bk-row', { hasText: 'PF-2026-0152' });
    await expect(vrow).toContainText('Fournisseur : accepté');
    await expect(vrow).toContainText('JONAS : à accepter');
    await vrow.getByRole('button', { name: 'Refuser' }).click();
    await page.locator('#pr-reason-PF20260152').fill('Départ trop tard, il faut le navire de la S50');
    await page.getByRole('button', { name: 'Renvoyer au transitaire' }).click();
    await expect(toast(page)).toContainText('renvoyée à Kuehne + Nagel');
    await expect(page.locator('.bk-stage', { has: page.getByRole('heading', { name: 'Attente transitaire', exact: true }) }).locator('.bk-row', { hasText: 'PF-2026-0152' })).toContainText(
      'refusée par JONAS',
    );

    await loginAs(page, 'Anna Weber');
    const row = page.locator('.bk-row', { hasText: 'PF-2026-0152' });
    await expect(row).toContainText('navire de la S50');
    await expect(row.getByRole('button', { name: 'Faire la proposition' })).toBeVisible();
  });

  test('le transitaire ne passe pas par l’appli : le fournisseur saisit la proposition, JONAS l’accepte', async ({ page }) => {
    await loginAs(page, 'Zhao Min');
    await go(page, 'portail/booking');
    const card = page.locator('.pb-fwd', { hasText: 'PF-2026-0145' });
    await card.getByRole('button', { name: 'Saisir la proposition pour Logfret' }).click();
    await page.locator('#be-car-PF20260145').selectOption('COSCO');
    await page.locator('#be-no-PF20260145').fill('COS-778120');
    await card.getByRole('button', { name: 'Envoyer la proposition' }).click();
    await expect(toast(page)).toContainText('Proposition PF-2026-0145 envoyée');
    // Saisie par le fournisseur : acceptée de son côté
    await expect(page.locator('.pb-val', { hasText: 'PF-2026-0145' })).toContainText('Fournisseur : accepté');

    await loginAs(page, 'Logistique');
    await go(page, 'booking');
    await page.locator('.bk-row', { hasText: 'PF-2026-0145' }).getByRole('button', { name: 'Accepter' }).click();
    const row = page.locator('.bk-stage.bk-green .bk-row', { hasText: 'PF-2026-0145' });
    await expect(row).toContainText('COS-778120');
    await expect(row).toContainText('Saisi par le fournisseur pour Logfret');

    await loginAs(page, 'Julien Morel');
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
