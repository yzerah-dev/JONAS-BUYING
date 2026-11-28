// Offres de prix : demande de prix JONAS → réponse du fournisseur → acceptée (produit créé + panier) ; offre spontanée du portail
import { expect, go, loginAs, resetApp, test, toast } from './fixtures';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYPgPAAEDAQAIicLsAAAAAElFTkSuQmCC', 'base64');

test('demande de prix à deux fournisseurs, réponse dans le portail, offre acceptée : produit créé et ajouté au panier', async ({ page }) => {
  await resetApp(page);
  await loginAs(page, 'David');
  await go(page, 'offres');
  // Démo : 2 offres en attente (spontanée Tide + réponse Horizon), badge dans le menu
  await expect(page.locator('a[href*="/offres"] .nav-badge')).toHaveText('2');
  await expect(page.locator('.qt-card')).toHaveCount(2);

  await page.getByRole('button', { name: 'Demande de prix' }).click();
  const dlg = page.getByRole('dialog', { name: 'Demande de prix' });
  await dlg.locator('input[type=file]').setInputFiles({ name: 'lampe.png', mimeType: 'image/png', buffer: PNG });
  await expect(dlg.locator('.qt-photos .qt-thumb')).toHaveCount(1);
  await dlg.getByLabel('Désignation').fill('Lampe solaire jardin LED');
  await dlg.getByLabel(/Prix cible/).fill('1,20');
  await dlg.getByRole('button', { name: /Tide Living/ }).click();
  await dlg.getByRole('button', { name: /Horizon Home/ }).click();
  await dlg.getByRole('button', { name: 'Envoyer la demande' }).click();
  await toast(page, /Demande de prix envoyée à 2 fournisseur/);
  await page.getByRole('button', { name: /Chez le fournisseur/ }).click();
  await expect(page.locator('.qt-card', { hasText: 'Lampe solaire jardin LED' })).toHaveCount(2);

  // Fournisseur Tide : badge, demande à chiffrer (photo recopiée dans son espace), prix envoyé
  await loginAs(page, 'Mr. Chen');
  await expect(page.locator('a[href*="/portail/offres"] .pill.red')).toHaveText('2');
  await go(page, 'portail/offres');
  const card = page.locator('.qt-card', { hasText: 'Lampe solaire jardin LED' });
  await expect(card.locator('.qt-hero img')).toHaveCount(1);
  await card.locator('input.qt-price-in').fill('1,15');
  await card.locator('.qt-actions .btn.primary').click();
  await expect(page.locator('a[href*="/portail/offres"] .pill.red')).toHaveText('1');

  // JONAS : offre en attente, acceptée → produit créé, panier
  await loginAs(page, 'David');
  await go(page, 'offres');
  const offer = page.locator('.qt-card', { hasText: 'Lampe solaire jardin LED' });
  await expect(offer).toContainText('1,15');
  await offer.getByRole('button', { name: 'Accepter' }).click();
  const acc = page.getByRole('dialog', { name: 'Accepter l’offre' });
  await acc.getByLabel('Quantité (pièces)').fill('2400');
  await acc.getByLabel(/Colisage/).fill('24');
  await acc.getByRole('button', { name: 'Accepter et ajouter au panier' }).click();
  await toast(page, /Offre acceptée : produit .+ créé et ajouté au panier/);
  await expect(page.getByRole('button', { name: /Panier \(1\)/ })).toBeVisible();
  await page.getByRole('button', { name: /Acceptées/ }).click();
  await page.locator('.qt-card', { hasText: 'Lampe solaire jardin LED' }).getByRole('link', { name: 'Voir le produit' }).click();
  await expect(page.locator('main')).toContainText('Lampe solaire jardin LED');
  await expect(page.locator('main')).toContainText('1,15');
});

test('offre spontanée du fournisseur, refusée par JONAS avec un motif visible dans le portail', async ({ page }) => {
  await resetApp(page);
  await loginAs(page, 'Mr. Chen');
  await go(page, 'portail/offres');
  await page.locator('.page-head .btn.primary').click();
  const dlg = page.getByRole('dialog');
  await dlg.locator('input[type=file]').setInputFiles({ name: 'vase.png', mimeType: 'image/png', buffer: PNG });
  await expect(dlg.locator('.qt-thumb')).toHaveCount(1);
  await dlg.locator('.bk-form input:not([type=file])').nth(0).fill('Ceramic vase 30 cm');
  await dlg.locator('.bk-form input:not([type=file])').nth(1).fill('3.4');
  await dlg.locator('.rc-foot .btn.primary').click();
  await expect(page.locator('.qt-card', { hasText: 'Ceramic vase 30 cm' })).toBeVisible();

  await loginAs(page, 'David');
  await go(page, 'offres');
  const offer = page.locator('.qt-card', { hasText: 'Ceramic vase 30 cm' });
  await expect(offer).toContainText('Offre spontanée');
  await offer.getByRole('button', { name: 'Refuser' }).click();
  const r = page.getByRole('dialog', { name: 'Refuser l’offre' });
  await r.getByRole('textbox').fill('Prix trop élevé');
  await r.getByRole('button', { name: 'Refuser' }).click();
  await toast(page, 'Offre refusée');

  await loginAs(page, 'Mr. Chen');
  await go(page, 'portail/offres?vue=closes');
  await expect(page.locator('.qt-card', { hasText: 'Ceramic vase 30 cm' })).toContainText('Prix trop élevé');
});

test('demande de prix depuis une fiche produit, négociation (contre-offre acceptée par le fournisseur), nouveau prix et panier', async ({ page }) => {
  await resetApp(page);
  await loginAs(page, 'David');
  await go(page, 'produits/CP-T001');
  await page.getByRole('button', { name: 'Demander un prix' }).click();
  const dlg = page.getByRole('dialog', { name: 'Demande de prix' });
  // Pré-rempli depuis la fiche ; fournisseurs filtrés sur le rayon du produit, fournisseur actuel signalé
  await expect(dlg.getByLabel('Désignation')).toHaveValue('Tong femme paillettes');
  await expect(dlg.getByLabel('Rayon')).toHaveValue('Chaussures');
  await expect(dlg.getByRole('button', { name: /Tide Living.*fournisseur actuel/ })).toBeVisible();
  await dlg.getByLabel('Quantité envisagée (pièces)').fill('5000');
  await dlg.getByRole('button', { name: /Tide Living/ }).click();
  await dlg.getByLabel('Rayon').selectOption('');
  await dlg.getByLabel('Rechercher un fournisseur').fill('jinfa');
  await expect(dlg.locator('.qt-sup-pick')).toHaveCount(1);
  await dlg.getByRole('button', { name: /Tout cocher \(1\)/ }).click();
  await expect(dlg.locator('.rc-foot')).toContainText('2 fournisseur(s) sélectionné(s)');
  await dlg.getByRole('button', { name: 'Envoyer la demande' }).click();
  await toast(page, /envoyée à 2 fournisseur/);

  // Tide répond 2,80
  await loginAs(page, 'Mr. Chen');
  await go(page, 'portail/offres');
  const card = page.locator('.qt-card', { hasText: 'Tong femme paillettes' });
  await expect(card).toContainText('5');
  await card.locator('input.qt-price-in').fill('2,80');
  await card.locator('.qt-actions .btn.primary').click();

  // JONAS négocie à 2,50
  await loginAs(page, 'David');
  await go(page, 'offres');
  const offer = page.locator('.qt-card', { hasText: 'Tong femme paillettes' });
  await offer.getByRole('button', { name: 'Négocier' }).click();
  const nego = page.getByRole('dialog', { name: 'Négocier le prix' });
  await nego.getByLabel(/Votre prix/).fill('2,50');
  await expect(nego.locator('.rc-foot')).toContainText('−10,7 %');
  await nego.getByRole('button', { name: 'Envoyer la contre-offre' }).click();
  await toast(page, /Contre-offre envoyée/);
  await page.getByRole('button', { name: /Chez le fournisseur/ }).click();
  await expect(page.locator('.qt-card', { hasText: 'Tong femme paillettes' }).first()).toBeVisible();

  // Tide voit la contre-offre (badge) et l'accepte
  await loginAs(page, 'Mr. Chen');
  await go(page, 'portail/offres');
  const c2 = page.locator('.qt-card', { hasText: 'Tong femme paillettes' });
  await expect(c2.locator('.qt-counter')).toContainText('2,50');
  await c2.locator('.qt-accept-counter').click();
  await expect(c2).toHaveCount(0);

  // JONAS : offre à 2,50 (historique visible), acceptée → nouveau prix du produit existant, panier
  await loginAs(page, 'David');
  await go(page, 'offres');
  const o2 = page.locator('.qt-card', { hasText: 'Tong femme paillettes' });
  await expect(o2.locator('.qt-price')).toContainText('2,50');
  await expect(o2.locator('.qt-round')).toHaveCount(3);
  await o2.getByRole('button', { name: 'Accepter' }).click();
  const acc = page.getByRole('dialog', { name: 'Accepter l’offre' });
  await expect(acc.getByLabel('Quantité (pièces)')).toHaveValue('5000');
  await expect(acc).toContainText('CP-T001 est déjà chez ce fournisseur');
  await acc.getByRole('button', { name: 'Accepter et ajouter au panier' }).click();
  await toast(page, /nouveau prix pour CP-T001/);
  await expect(page.getByRole('button', { name: /Panier \(1\)/ })).toBeVisible();
});
