import { expect, go, loginAs, resetApp, sidebarItems, test, toast } from './fixtures';

test.describe('Rôles et visibilité des modules', () => {
  test.beforeEach(async ({ page }) => {
    await resetApp(page);
  });

  test('le designer ne voit que ses modules et est bloqué hors périmètre', async ({ page }) => {
    await loginAs(page, 'ABIR');
    const nav = await sidebarItems(page);
    expect(nav).toEqual(expect.arrayContaining(['Développement', 'Performance', 'Paramètres']));
    // Une seule page : plus d'entrée « Design » séparée
    expect(nav).not.toContain('Design');
    expect(nav).not.toContain('Proformas');
    expect(nav).not.toContain('Factures & Finance');

    await go(page, 'proformas');
    await expect(page.locator('main')).toContainText('Accès non autorisé');
  });

  test('logistique : pas de finance ni de montants, mais accès conteneurs', async ({ page }) => {
    await loginAs(page, 'Logistique');
    const nav = await sidebarItems(page);
    expect(nav).toEqual(expect.arrayContaining(['Proformas', 'Conteneurs', 'Fournisseurs']));
    expect(nav).not.toContain('Factures & Finance');
    expect(nav).not.toContain('Développement');

    await go(page, 'proformas/PF-2026-0143');
    await expect(page.getByRole('button', { name: 'Suivi & Logistique' })).toBeVisible();
    await expect(page.locator('main')).not.toContainText('Montant total');

    await go(page, 'finance');
    await expect(page.locator('main')).toContainText('Accès non autorisé');
  });

  test('finance : module Factures & Finance avec paiements', async ({ page }) => {
    await loginAs(page, 'Finance');
    const nav = await sidebarItems(page);
    expect(nav).toEqual(expect.arrayContaining(['Proformas', 'Factures & Finance']));
    expect(nav).not.toContain('Conteneurs');
    expect(nav).not.toContain('Développement');

    await go(page, 'finance');
    await expect(page.getByRole('button', { name: /Marquer payé/ }).first()).toBeVisible();
  });

  test('circuit de validation du pack : chaque rôle ne valide que son étape', async ({ page }) => {
    const validateButton = () => page.getByRole('region', { name: 'Prochaine action' }).getByRole('button', { name: 'Valider le pack' });
    const openPack = async (who: string) => {
      await loginAs(page, who);
      await go(page, 'produits/CP-C042');
      await page.getByRole('button', { name: 'Design & Pack' }).click();
    };

    // Plus d'étape David : le pack uploadé est chez la Direction ; Moinard attend son tour
    for (const who of ['David', 'Moinard']) {
      await openPack(who);
      await expect(validateButton()).toHaveCount(0);
    }

    for (const who of ['Direction', 'Moinard']) {
      await openPack(who);
      await expect(validateButton(), `${who} doit pouvoir valider son étape`).toHaveCount(1);
      await validateButton().click();
      await expect(validateButton()).toHaveCount(0);
    }

    await openPack('Logistique');
    await expect(validateButton()).toHaveCount(0);
    // La validation se voit : 3 étapes validées, au tour du fournisseur, historique des décisions
    const valid = page.getByRole('region', { name: 'Validation du pack' });
    await expect(valid).toContainText('2 / 3 validé(s)');
    await expect(valid.locator('.pk-vlist li.done')).toHaveCount(2);
    await expect(valid.locator('.pk-vlist li.pending')).toContainText('Fournisseur');
    await expect(valid.locator('.pk-vh')).toHaveCount(2);
  });

  test('le pilote accède aux paramètres', async ({ page }) => {
    await loginAs(page, 'Yoni Zerah');
    await go(page, 'parametres');
    await expect(page.locator('main')).not.toContainText('Accès non autorisé');
    await expect(page.locator('main h1').first()).toBeVisible();
  });
});

test('fournisseur : le pack validé par Moinard arrive tout seul dans le portail', async ({ page }) => {
  await resetApp(page);
  // Circuit interne complet sur CP-C042
  for (const who of ['Direction', 'Moinard']) {
    await loginAs(page, who);
    await go(page, 'produits/CP-C042');
    await page.getByRole('button', { name: 'Design & Pack' }).click();
    await page.getByRole('region', { name: 'Prochaine action' }).getByRole('button', { name: 'Valider le pack' }).click();
  }
  // Validé par Moinard : le pack part tout seul chez le fournisseur (plus de « Forwarder » à faire)
  // Le fournisseur Tide valide le pack
  await loginAs(page, 'Mr. Chen');
  await expect(page).toHaveURL(/#\/portail$/);
  await go(page, 'portail/packs');
  await page.locator('.card', { hasText: 'CP-C042' }).getByRole('button', { name: 'Valider le pack' }).click();
  await expect(toast(page)).toHaveText('Pack validé – prêt pour la production');
});
