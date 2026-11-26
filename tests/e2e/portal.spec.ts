import { expect, go, loginAs, resetApp, setUser, sidebarItems, test, toast } from './fixtures';

test.describe('Portail fournisseur', () => {
  test.beforeEach(async ({ page }) => {
    await resetApp(page);
  });

  test('connexion fournisseur : redirection vers le portail, données isolées', async ({ page }) => {
    await loginAs(page, 'Mr. Chen');
    await expect(page).toHaveURL(/#\/portail$/);
    const nav = await sidebarItems(page);
    expect(nav).toEqual(expect.arrayContaining(['Mes produits', 'Mes proformas', 'Bookings', 'Plans de chargement']));
    expect(nav.join(' ')).toContain('Vous ne voyez que les données de Tide Living');

    // Isolation : pas de produits d'un autre fournisseur (AB-M026 = Jinfa)
    await go(page, 'portail/produits');
    await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('main')).not.toContainText('AB-M026');
  });

  for (const route of ['proformas', 'finance', 'conteneurs?c=PLAN-031', 'design', 'parametres']) {
    test(`le fournisseur est renvoyé vers le portail depuis /${route}`, async ({ page }) => {
      await setUser(page, 'sup-tide', route);
      await expect(page).toHaveURL(/#\/portail$/);
      await expect(page.locator('main h1').first()).toContainText('Bienvenue');
    });
  }

  test('le fournisseur propose un plan de chargement par glisser-déposer', async ({ page }) => {
    await loginAs(page, 'Ms. Park');
    await go(page, 'portail/chargement');
    await page.locator('tr[draggable="true"]').first().dragTo(page.locator('.ccard').first());
    await expect(toast(page)).toContainText('→ PLAN-');
    // La demande de booking reste à l'initiative de JONAS
    await expect(page.getByRole('button', { name: 'Demande de booking' })).toHaveCount(0);
  });
});

test('portail fournisseur : commandes en cours, fiche produit, refus du pack avec motif', async ({ page }) => {
  await resetApp(page);
  await loginAs(page, 'Mr. Chen');
  // Tableau de bord : chaque commande et ce que JONAS attend du fournisseur
  const flow = page.getByRole('region', { name: 'Mes commandes en cours' });
  await expect(flow.locator('[data-pf="PF-2026-0141"]')).toContainText('Déposer BL, Invoice et Packing List');
  await expect(flow.locator('[data-pf="PF-2026-0141"] li[aria-current="step"]')).toContainText('Départ');
  // Mes produits : recherche puis fiche
  await go(page, 'portail/produits');
  await page.getByRole('button', { name: /^Pack à valider \(\d+\)$/ }).click();
  await page.getByLabel('Rechercher : réf., EAN, nom…').fill('ORA-N452');
  await expect(page.locator('main tbody tr')).toHaveCount(1);
  await page.getByRole('link', { name: 'ORA-N452' }).click();
  await expect(page).toHaveURL(/portail\/produits\/ORA-N452$/);
  await expect(page.getByRole('region', { name: 'Informations' })).toContainText('3701571519661');
  // Refus : la modification demandée est obligatoire
  const pack = page.getByRole('region', { name: 'Pack & die cut' });
  await pack.getByRole('button', { name: 'Refuser' }).click();
  await expect(pack.getByRole('button', { name: 'Refuser et envoyer à JONAS' })).toBeDisabled();
  await pack.getByLabel('Modification demandée').fill('Le code-barres est trop petit.');
  await pack.getByRole('button', { name: 'Refuser et envoyer à JONAS' }).click();
  await expect(toast(page)).toContainText('Pack refusé');
  const rej = await page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.startsWith('jonas-buying-state'))!;
    return JSON.parse(localStorage.getItem(k)!).products.find((p: { id: string }) => p.id === 'ORA-N452').pack.rejection.reason;
  });
  expect(rej).toBe('Le code-barres est trop petit.');
});

test('portail fournisseur : pack en trois ronds, die cut demandé mis en avant, document typé', async ({ page }) => {
  await resetApp(page);
  await loginAs(page, 'Mr. Chen');
  await go(page, 'portail/packs?vue=diecut');
  const card = page.locator('.card', { has: page.locator('.sr') }).first();
  // Die cut demandé : rond orange « à envoyer » et bouton « Déposer le die cut »
  await expect(card.getByRole('button', { name: 'Die cut : à envoyer' })).toHaveClass(/ask/);
  await card.getByLabel(/^Déposer : Die cut/).setInputFiles({ name: 'diecut.pdf', mimeType: 'application/pdf', buffer: Buffer.from('dc') });
  await expect(toast(page)).toContainText('1 fichier(s) ajouté(s)');
  // Document : on choisit le type après avoir pris le fichier
  await go(page, 'portail/produits/ORA-N452');
  const pack = page.getByRole('region', { name: 'Pack & die cut' });
  await expect(pack.getByRole('button', { name: 'Télécharger le pack' })).toBeVisible();
  await pack.getByLabel(/^Déposer : Documents/).setInputFiles({ name: 'msds.pdf', mimeType: 'application/pdf', buffer: Buffer.from('m') });
  await pack.getByLabel('Type de document').selectOption('Fiche composition');
  await pack.getByRole('button', { name: 'Déposer', exact: true }).click();
  await expect(pack.getByRole('button', { name: 'Documents : envoyé' })).toContainText('1 fichier(s)');
});

test('portail fournisseur : Mes produits en liste ou en galerie (choix mémorisé)', async ({ page }) => {
  await resetApp(page);
  await loginAs(page, 'Mr. Chen');
  await go(page, 'portail/produits');
  await page.getByRole('button', { name: 'Galerie' }).click();
  await expect(page.locator('.pp-gallery .pcard').first()).toBeVisible();
  await page.getByLabel('Rechercher : réf., EAN, nom…').fill('ORA-N452');
  await expect(page.locator('.pp-gallery .pcard')).toHaveCount(1);
  await page.locator('.pp-gallery .pcard').click();
  await expect(page).toHaveURL(/portail\/produits\/ORA-N452$/);
  await go(page, 'portail/produits');
  await expect(page.locator('.pp-gallery')).toBeVisible();
});

test('conteneur créé par un fournisseur : numéro à son nom (jamais celui d’un autre fournisseur)', async ({ page }) => {
  await resetApp(page);
  await loginAs(page, 'Ms. Park');
  await go(page, 'portail/chargement');
  await page.locator('.ccard', { hasText: 'Nouveau conteneur' }).first().click();
  const ids = await page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.startsWith('jonas-buying-state'))!;
    return JSON.parse(localStorage.getItem(k)!).containers.map((c: { id: string }) => c.id) as string[];
  });
  expect(ids.filter((id) => /^PLAN-[A-Z]+-\d{3}$/.test(id))).toHaveLength(1);
  expect(new Set(ids).size).toBe(ids.length);
});

test('Mes produits en liste : colonne Taille (fiche, sinon « SIZE » du texte fournisseur)', async ({ page }) => {
  await resetApp(page);
  await page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.startsWith('jonas-buying-state'))!;
    const st = JSON.parse(localStorage.getItem(k)!);
    const p = st.products.find((x: { id: string }) => x.id === 'ORA-N452');
    p.sizes = undefined;
    p.description = { en: 'lunch box 3 design assortment MATERIAL :PP -SIZE :18*14*8cm' };
    localStorage.setItem(k, JSON.stringify(st));
  });
  await page.reload();
  await loginAs(page, 'Mr. Chen');
  await go(page, 'portail/produits');
  await page.getByRole('button', { name: 'Liste' }).click();
  await expect(page.locator('main thead')).toContainText('Taille');
  await page.getByLabel('Rechercher : réf., EAN, nom…').fill('ORA-N452');
  await expect(page.locator('main tbody tr').first().locator('.pp-size')).toHaveText('18 × 14 × 8 cm');
});

test('Mes proformas : lignes en liste ou en galerie (choix mémorisé)', async ({ page }) => {
  await resetApp(page);
  await loginAs(page, 'Mr. Chen');
  await go(page, 'portail/proformas?pf=PF-2026-0141');
  await expect(page.locator('main table').first()).toBeVisible();
  await page.getByRole('button', { name: 'Galerie' }).click();
  const cards = page.locator('.pf-lines-gallery .pcard');
  await expect(cards.first()).toBeVisible();
  await expect(cards.first()).toContainText('Chargé');
  await go(page, 'portail/proformas?pf=PF-2026-0141');
  await expect(page.locator('.pf-lines-gallery')).toBeVisible();
  await cards.first().click();
  await expect(page).toHaveURL(/portail\/produits\//);
});
