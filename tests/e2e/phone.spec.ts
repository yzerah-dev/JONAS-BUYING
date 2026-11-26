import { devices } from '@playwright/test';
import { expect, expectNoHorizontalOverflow, go, resetApp, setUser, test, toast } from './fixtures';

// Émulation iPhone 13 (390 px, tactile) dans Chromium.
const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices['iPhone 13'];
test.use({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch });

const ROUTES = [
  'performance',
  'proformas',
  'proformas/PF-2026-0143',
  'produits',
  'produits/AB-M026',
  'developpement',
  'design',
  'conteneurs?c=PLAN-031',
  'fournisseurs',
  'fournisseurs/jinfa',
  'finance',
  'parametres',
];

const PORTAL_ROUTES = ['portail', 'portail/produits', 'portail/proformas?pf=PF-2026-0143', 'portail/packs?vue=tous', 'portail/chargement', 'portail/conteneurs', 'portail/finance'];

test.describe('Téléphone : pas de défilement horizontal', () => {
  for (const route of ROUTES) {
    test(`/${route}`, async ({ page }) => {
      await resetApp(page, route);
      await expect(page.locator('main h1, main .pf-title').first()).toBeVisible();
      await expectNoHorizontalOverflow(page);
    });
  }

  test('/proformas/PF-2026-0143 – onglet Suivi & Logistique', async ({ page }) => {
    await resetApp(page, 'proformas/PF-2026-0143');
    await page.getByRole('button', { name: 'Suivi & Logistique' }).tap();
    await expect(page.locator('.ccard').first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('/design – designer connecté', async ({ page }) => {
    await resetApp(page);
    await setUser(page, 'lea', 'design');
    await page.getByRole('button', { name: 'Planning de charge' }).click();
    await expect(page.locator('.pk-plan')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  for (const route of PORTAL_ROUTES) {
    test(`portail fournisseur /${route}`, async ({ page }) => {
      await resetApp(page);
      await setUser(page, 'sup-tide', route);
      await expect(page).toHaveURL(new RegExp('#/' + route.split('?')[0].replace(/\//g, '\\/')));
      await expect(page.locator('main h1').first()).toBeVisible();
      await expectNoHorizontalOverflow(page);
    });
  }
});

test.describe('Téléphone : interactions tactiles', () => {
  test.beforeEach(async ({ page }) => {
    await resetApp(page);
  });

  test('lignes de proforma fines et dépliables', async ({ page }) => {
    await go(page, 'proformas');
    const first = page.locator('.pf-line-main').first();
    await expect(first).toBeVisible();
    const open = page.getByRole('button', { name: /Ouvrir la proforma/ });
    await expect(open).toHaveCount(0);

    await first.tap();
    await expect(open).toHaveCount(1);
    await open.tap();
    await expect(page).toHaveURL(/#\/proformas\/PF-\d{4}-\d{4}$/);
    await expect(page.locator('h1').first()).toContainText('Proforma PF-');
    await expectNoHorizontalOverflow(page);
  });

  test('toucher une ligne puis un conteneur pour l’affecter', async ({ page }) => {
    await go(page, 'proformas/PF-2026-0143');
    await page.getByRole('button', { name: 'Suivi & Logistique' }).tap();
    await page.locator('tr.clickable', { hasText: 'JB-K001' }).first().tap();
    await expect(page.locator('.pill.orange.mb')).toContainText('JB-K001 sélectionné : touchez un conteneur');
    await page.locator('.ccard').first().tap();
    await expect(toast(page)).toHaveText(/pcs JB-K001 → PLAN-\d+/);
  });
});

// Grand téléphone (iPhone Pro Max, 430 px) : l'en-tête de proforma ne doit pas écraser la carte d'infos
test.describe('Grand téléphone (430 px)', () => {
  test.use({ viewport: { width: 430, height: 932 } });
  for (const route of ['proformas/PF-2026-0148', 'proformas/PF-2026-0145', 'booking']) {
    test(`/${route}`, async ({ page }) => {
      await resetApp(page, route);
      await expect(page.locator('main h1, main .pf-title').first()).toBeVisible();
      await expectNoHorizontalOverflow(page);
    });
  }
});
