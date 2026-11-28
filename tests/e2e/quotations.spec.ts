// Offres de prix : demande de prix JONAS → réponse du fournisseur → acceptée (produit créé + panier) ; offre spontanée du portail
import { expect, go, loginAs, resetApp, test, toast } from './fixtures';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYPgPAAEDAQAIicLsAAAAAElFTkSuQmCC', 'base64');

test('demande de prix à deux fournisseurs, réponse dans le portail, offre acceptée : produit créé et ajouté au panier', async ({ page }) => {
  await resetApp(page);
  await loginAs(page, 'David');
  await go(page, 'offres?mode=cartes');
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
  await expect(page.locator('a[href*="/portail/quotations"] .pill.red')).toHaveText('2');
  await go(page, 'portail/quotations');
  const card = page.locator('.qt-card', { hasText: 'Lampe solaire jardin LED' });
  await expect(card.locator('.qt-hero img')).toHaveCount(1);
  await card.locator('input.qt-price-in').fill('1,15');
  await card.locator('.qt-actions .btn.primary').click();
  await expect(page.locator('a[href*="/portail/quotations"] .pill.red')).toHaveText('1');

  // JONAS : offre en attente, acceptée → produit créé, panier
  await loginAs(page, 'David');
  await go(page, 'offres?mode=cartes');
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
  await go(page, 'offres?mode=cartes');
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
  await go(page, 'portail/quotations');
  const card = page.locator('.qt-card', { hasText: 'Tong femme paillettes' });
  await expect(card).toContainText('5');
  await card.locator('input.qt-price-in').fill('2,80');
  await card.locator('.qt-actions .btn.primary').click();

  // JONAS négocie à 2,50
  await loginAs(page, 'David');
  await go(page, 'offres?mode=cartes');
  const offer = page.locator('.qt-card', { hasText: 'Tong femme paillettes' });
  // Contre-offre directement sur la carte : prix tapé dans le cadre (écart affiché), puis « Contre-offre »
  await expect(offer.getByRole('button', { name: 'Contre-offre' })).toBeDisabled();
  await offer.getByLabel(/^Contre-offre /).fill('2,50');
  await expect(offer.locator('.qt-counter-field')).toContainText('−10,7 %');
  await offer.getByRole('button', { name: 'Contre-offre' }).click();
  await toast(page, /Contre-offre envoyée/);
  await page.getByRole('button', { name: /Chez le fournisseur/ }).click();
  await expect(page.locator('.qt-card', { hasText: 'Tong femme paillettes' }).first()).toBeVisible();

  // Tide voit la contre-offre (badge) et l'accepte
  await loginAs(page, 'Mr. Chen');
  await go(page, 'portail/quotations?vue=nego');
  const c2 = page.locator('.qt-card', { hasText: 'Tong femme paillettes' });
  await expect(c2.locator('.qt-counter')).toContainText('2,50');
  await c2.locator('.qt-accept-counter').click();
  await expect(c2).toHaveCount(0);

  // JONAS : offre à 2,50 (historique visible), acceptée → nouveau prix du produit existant, panier
  await loginAs(page, 'David');
  await go(page, 'offres?mode=cartes');
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

test('suivi des prix reçus : tableau par demande, contre-offre depuis le tableau ; rubriques du portail', async ({ page }) => {
  await resetApp(page);
  await loginAs(page, 'David');
  await go(page, 'offres?mode=suivi');
  // Vue par défaut : suivi des prix ; la demande « Coussin » envoyée à 2 fournisseurs, 1 réponse
  const req = page.getByRole('region', { name: /Suivi des prix Coussin extérieur/ });
  await expect(req).toContainText('1 / 2 réponse(s)');
  await expect(req.getByTestId('track-Q-DEMO-2')).toContainText('2,35');
  await expect(req.getByTestId('track-Q-DEMO-2')).toContainText('+6,8 %');
  await expect(req.getByTestId('track-Q-DEMO-3')).toContainText('En attente de réponse');
  // Contre-offre sur l'offre spontanée Tide, depuis le tableau
  const spont = page.getByTestId('track-Q-DEMO-1');
  await spont.getByLabel(/^Contre-offre /).fill('1,60');
  await spont.getByRole('button', { name: 'Contre-offre' }).click();
  await expect(spont).toContainText('Contre-offre envoyée');
  await expect(spont.locator('.qt-round')).toHaveCount(2);
  // Nouvelle contre-offre possible pendant la négociation
  await spont.getByLabel(/^Contre-offre /).fill('1,70');
  await spont.getByLabel(/^Contre-offre /).press('Enter');
  await expect(spont.locator('.qt-round')).toHaveCount(3);

  // Portail : « Demandes de quotation » (demandes JONAS) et « Mes offres » (contre-offre sur son offre spontanée)
  await loginAs(page, 'Mr. Chen');
  await expect(page.locator('a[href*="/portail/quotations"]')).toContainText('Demandes de quotation');
  await expect(page.locator('a[href*="/portail/quotations"] .pill.red')).toHaveText('1');
  await expect(page.locator('a[href*="/portail/offres"] .pill.red')).toHaveText('1');
  await go(page, 'portail/quotations');
  await expect(page.locator('.qt-card')).toHaveCount(1);
  await expect(page.locator('.qt-card')).toContainText('Coussin extérieur');
  await go(page, 'portail/offres');
  const mine = page.locator('.qt-card', { hasText: 'Bougie parfumée' });
  await expect(mine.locator('.qt-counter')).toContainText('1,70');
  await mine.locator('input.qt-price-in').fill('1,78');
  await mine.locator('.qt-actions .btn:has-text("Proposer")').click();
  await expect(page.locator('a[href*="/portail/offres"] .pill.red')).toHaveCount(0);
});

test('galerie des demandes : une carte par produit, ouverture pour voir et traiter les offres de chaque fournisseur', async ({ page }) => {
  await resetApp(page);
  await loginAs(page, 'David');
  await go(page, 'offres');
  // Galerie par défaut : 2 demandes (Coussin envoyé à 2 fournisseurs, Bougie offre spontanée)
  await expect(page.locator('.qtg-card')).toHaveCount(2);
  const coussin = page.getByRole('link', { name: /Offres Coussin extérieur/ });
  await expect(coussin).toContainText('1 / 2 réponse(s)');
  await expect(coussin).toContainText('1 à décider');
  await expect(coussin.locator('.qtg-price')).toContainText('2,35');
  await coussin.click();

  // Fiche de la demande : comparatif + une carte par fournisseur
  await expect(page.locator('h1')).toHaveText('Offres reçues');
  await expect(page.locator('.qtd-name')).toHaveText('Coussin extérieur déperlant 45 × 45');
  await expect(page.getByTestId('track-Q-DEMO-2')).toBeVisible();
  await expect(page.locator('.qt-card')).toHaveCount(2);
  await page.locator('.qt-card', { hasText: 'Horizon Home' }).getByRole('button', { name: 'Accepter' }).click();
  const acc = page.getByRole('dialog', { name: 'Accepter l’offre' });
  await acc.getByRole('button', { name: 'Accepter et ajouter au panier' }).click();
  await toast(page, /Offre acceptée/);
  await expect(page.getByTestId('track-Q-DEMO-2')).toContainText('Acceptée');

  await page.getByRole('button', { name: 'Retour aux offres' }).click();
  await expect(page.getByRole('link', { name: /Offres Coussin extérieur/ })).toContainText('Acceptée · Horizon Home');
});

test('catalogue : plusieurs produits sélectionnés, une demande de prix groupée (une demande par produit, un e-mail par fournisseur)', async ({ page }) => {
  await resetApp(page);
  await loginAs(page, 'David');
  await go(page, 'produits');
  const search = page.getByPlaceholder('Réf., désignation, EAN…');
  await search.fill('CP-T001');
  await page.getByLabel('Sélectionner CP-T001').check();
  await search.fill('CP-C042');
  await page.getByLabel('Sélectionner CP-C042').check();
  const bar = page.getByRole('region', { name: 'Produits sélectionnés' });
  await expect(bar).toContainText('2 produit(s) sélectionné(s)');
  await bar.getByRole('button', { name: 'Demander un prix (2)' }).click();

  const dlg = page.getByRole('dialog', { name: 'Demande de prix' });
  await expect(dlg.getByRole('row')).toHaveCount(3);
  await dlg.getByLabel('Quantité CP-T001').fill('3000');
  await dlg.getByLabel('Prix cible CP-C042').fill('1,90');
  await dlg.getByRole('button', { name: /Tide Living/ }).click();
  await dlg.getByLabel('Rayon').selectOption('');
  await dlg.getByLabel('Rechercher un fournisseur').fill('jinfa');
  await dlg.getByRole('button', { name: /Jinfa Shoes/ }).click();
  await dlg.getByRole('button', { name: 'Envoyer la demande' }).click();
  await toast(page, 'Demande de prix envoyée : 2 produits à 2 fournisseur(s)');
  await expect(bar).toHaveCount(0);

  // Un seul e-mail par fournisseur, avec les 2 articles
  const mail = page.locator('.mo-card', { hasText: 'Tide Living' });
  await expect(mail).toHaveCount(1);
  await mail.getByRole('button', { name: /Voir l’e-mail/ }).click();
  await expect(page.getByRole('dialog', { name: 'Aperçu de l’e-mail' }).locator('h2')).toContainText('2 items');
  await page.keyboard.press('Escape');

  // Galerie des offres : une carte par produit, envoyée à 2 fournisseurs
  await go(page, 'offres');
  await expect(page.locator('.qtg-card')).toHaveCount(4);
  await expect(page.getByRole('link', { name: /Offres Tong femme paillettes/ })).toContainText('0 / 2 réponse(s)');
});

test('même produit demandé plusieurs fois (fournisseurs différents) : une seule carte et une seule fiche', async ({ page }) => {
  await resetApp(page);
  await loginAs(page, 'David');
  // 1re demande depuis la fiche produit : Tide + Jinfa
  await go(page, 'produits/CP-T001');
  await page.getByRole('button', { name: 'Demander un prix' }).click();
  let dlg = page.getByRole('dialog', { name: 'Demande de prix' });
  await dlg.getByRole('button', { name: /Tide Living/ }).click();
  await dlg.getByRole('button', { name: /Jinfa Shoes/ }).click();
  await dlg.getByRole('button', { name: 'Envoyer la demande' }).click();
  await toast(page, /envoyée à 2 fournisseur/);
  // 2e demande plus tard : Wenzhou Tex seul
  await page.getByRole('button', { name: 'Demander un prix' }).click();
  dlg = page.getByRole('dialog', { name: 'Demande de prix' });
  await dlg.getByRole('button', { name: /Wenzhou Tex/ }).click();
  await dlg.getByRole('button', { name: 'Envoyer la demande' }).click();
  await toast(page, /envoyée à 1 fournisseur/);
  // Saisie manuelle avec la même désignation qu'une demande existante : même carte
  await go(page, 'offres');
  await page.getByRole('button', { name: 'Demande de prix' }).click();
  dlg = page.getByRole('dialog', { name: 'Demande de prix' });
  await dlg.getByLabel('Désignation').fill('Coussin extérieur déperlant 45 × 45');
  await dlg.getByLabel('Rayon').selectOption('');
  await dlg.getByRole('button', { name: /Northbay/ }).click();
  await dlg.getByRole('button', { name: 'Envoyer la demande' }).click();

  await expect(page.locator('.qtg-card')).toHaveCount(3);
  await expect(page.getByRole('link', { name: /Offres Tong femme paillettes/ })).toContainText('0 / 3 réponse(s)');
  await expect(page.getByRole('link', { name: /Offres Coussin extérieur/ })).toContainText('1 / 3 réponse(s)');
  await page.getByRole('link', { name: /Offres Tong femme paillettes/ }).click();
  await expect(page.locator('.qt-card')).toHaveCount(3);
  await expect(page.locator('.qtt-row:not(.qtt-th)')).toHaveCount(3);
  // Suivi des prix : une seule ligne-produit
  await go(page, 'offres?mode=suivi');
  await expect(page.getByRole('region', { name: /Suivi des prix Tong femme paillettes/ })).toHaveCount(1);
});
