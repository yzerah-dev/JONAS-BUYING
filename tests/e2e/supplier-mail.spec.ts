// E-mails automatiques aux fournisseurs (démo : préparés et consultables, non envoyés)
import { expect, go, loginAs, resetApp, test, toast } from './fixtures';

test('commande depuis le panier : e-mail « nouvelle commande » en chinois + anglais, bon de commande joint, lien vers le portail', async ({ page }) => {
  await resetApp(page);
  await loginAs(page, 'David');
  await go(page, 'produits');
  await page.getByPlaceholder('Réf., désignation, EAN…').fill('CP-T001');
  await page.getByRole('button', { name: 'Ajouter un carton CP-T001' }).click();
  await page.getByRole('button', { name: /^Panier \(/ }).click();
  await page.getByRole('dialog', { name: 'Panier' }).getByRole('button', { name: 'Valider la commande · demander la proforma' }).click();
  await expect(toast(page)).toContainText('passée');

  const card = page.locator('.mo-card', { hasText: 'Tide Living' });
  await expect(card).toContainText('E-mail préparé (démo : non envoyé)');
  await expect(card).toContainText('chen@tideliving.com');
  await card.getByRole('button', { name: /Voir l’e-mail/ }).click();
  const dlg = page.getByRole('dialog', { name: 'Aperçu de l’e-mail' });
  await expect(dlg.locator('h2')).toContainText('新订单');
  await expect(dlg.locator('h2')).toContainText('New order');
  await expect(dlg.locator('.mo-file').first()).toContainText('bon-de-commande.pdf');
  const frame = dlg.frameLocator('iframe');
  await expect(frame.locator('body')).toContainText('JONAS INTERNATIONAL');
  await expect(frame.locator('body')).toContainText('请制作形式发票');
  await expect(frame.locator('body')).toContainText('Please prepare your proforma');
  await expect(frame.getByRole('link', { name: /Upload my proforma/ })).toHaveAttribute('href', /\/#\/portail\/proformas\?pf=PF-2026-/);
});

test('acompte payé : e-mail préparé, tracé dans l’historique de la proforma', async ({ page }) => {
  await resetApp(page);
  await go(page, 'finance');
  const row = page
    .locator('tr', { hasText: 'Acompte' })
    .filter({ has: page.getByRole('button', { name: /Marquer payé/ }) })
    .first();
  const pfId = (await row.locator('a').first().innerText()).trim();
  await row.getByRole('button', { name: /Marquer payé/ }).click();
  await expect(page.locator('.mo-card').first()).toContainText('E-mail préparé');
  await page
    .locator('.mo-card')
    .first()
    .getByRole('button', { name: /Voir l’e-mail/ })
    .click();
  await expect(page.getByRole('dialog', { name: 'Aperçu de l’e-mail' }).locator('h2')).toContainText(`Deposit paid – ${pfId}`);
  await page.keyboard.press('Escape');
  await page.getByRole('dialog', { name: 'Aperçu de l’e-mail' }).getByRole('button', { name: 'Fermer' }).click();
  await go(page, `proformas/${pfId}`);
  await page
    .getByRole('button', { name: /Historique/ })
    .click()
    .catch(() => {});
  await expect(page.locator('main')).toContainText('E-mail préparé (démo, non envoyé)');
});

test('plusieurs contacts sur la fiche fournisseur', async ({ page }) => {
  await resetApp(page);
  await go(page, 'fournisseurs/tide');
  await page.getByRole('button', { name: 'Modifier' }).click();
  const dlg = page.getByRole('dialog', { name: /Modifier/ });
  await dlg.getByRole('button', { name: 'Ajouter un contact' }).click();
  await dlg.getByLabel('Nom du contact 2').fill('Lily');
  await dlg.getByLabel('E-mail du contact 2').fill('lily@tideliving.example');
  await dlg.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.locator('.sd-contact')).toHaveCount(2);
  await expect(page.locator('main')).toContainText('lily@tideliving.example');
});
