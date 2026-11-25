// Fiche produit modifiable (Pilote, Direction, acheteurs) : formulaire de la fiche et import Excel.
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import type { Page } from '@playwright/test';
import { expect, go, loginAs, resetApp, test, toast } from './fixtures';

const product = (page: Page, id: string) =>
  page.evaluate((id) => {
    const k = Object.keys(localStorage).find((x) => x.startsWith('jonas-buying-state'))!;
    const s = JSON.parse(localStorage.getItem(k)!);
    return { p: s.products.find((x: { id: string }) => x.id === id), brands: s.brands as { id: string; name: string }[] };
  }, id);

test('fiche produit : tous les champs modifiables par l’acheteur, contrôles, droits', async ({ page }) => {
  await resetApp(page);
  await loginAs(page, 'David');
  await go(page, 'produits/CP-T001');
  await page.getByRole('button', { name: 'Modifier la fiche' }).first().click();
  const dlg = page.getByRole('dialog', { name: 'Modifier la fiche CP-T001' });
  await dlg.locator('#pe-name').fill('Tong femme paillettes or');
  await dlg.locator('#pe-ean').fill('1234567890123');
  await dlg.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(toast(page)).toContainText('EAN 1234567890123 invalide');
  await dlg.locator('#pe-ean').fill('3700000000013');
  await dlg.locator('#pe-ref').fill('CP-T001B');
  await dlg.locator('#pe-supplierRef').fill('tx-501');
  // Listes déroulantes ; « Autre… » pour une nouvelle valeur (marque, rayon, collection)
  await dlg.locator('#pe-brand').selectOption({ label: '➕ Autre… (nouvelle valeur)' });
  await dlg.locator('#pe-brand').fill('Little Marcel');
  await dlg.locator('#pe-rayon').selectOption({ label: '➕ Autre… (nouvelle valeur)' });
  await dlg.locator('#pe-rayon').fill('Plage');
  await dlg.locator('#pe-collection').selectOption({ label: '➕ Autre… (nouvelle valeur)' });
  await dlg.locator('#pe-collection').fill('Été 2027');
  await dlg.locator('#pe-gender').selectOption('Femme');
  await dlg.locator('#pe-material').selectOption('EVA');
  await dlg.locator('#pe-pa').fill('2,15');
  await dlg.locator('#pe-currency').selectOption('USD');
  // Développement & pack
  await dlg.locator('#pe-devStage').selectOption({ label: '3. Échantillon' });
  await dlg.locator('#pe-devDeadline').fill('2027-01-15');
  await dlg.locator('#pe-nextAction').fill('Recevoir l’échantillon');
  await dlg.locator('#pe-targetQty').fill('12000');
  await dlg.locator('#pe-packType').selectOption('Polybag');
  await dlg.locator('#pe-designer').selectOption('ROLAND');
  await dlg.locator('#pe-artworkDeadline').fill('2026-12-20');
  await dlg.locator('#pe-pcb').fill('48');
  await dlg.locator('#pe-weight').fill('0,18');
  await dlg.locator('#pe-cbmCarton').fill('0.075');
  await dlg.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(toast(page)).toContainText('Fiche CP-T001B enregistrée');

  const { p, brands } = await product(page, 'CP-T001');
  expect(p).toMatchObject({ ref: 'CP-T001B', ean: '3700000000013', supplierRef: 'TX-501', name: 'Tong femme paillettes or', rayon: 'Plage', collection: 'Été 2027', gender: 'Femme', material: 'EVA', pcb: 48, weight: 0.18, cbmCarton: 0.075, paSupplier: { price: 2.15, currency: 'USD' } });
  expect(p).toMatchObject({ devStage: 2, devDeadline: '2027-01-15', nextAction: 'Recevoir l’échantillon', targetQty: 12000 });
  expect(p.pack).toMatchObject({ type: 'Polybag', designer: 'ROLAND', artworkDeadline: '2026-12-20' });
  expect(brands.find((b) => b.id === p.brandId)?.name).toBe('LITTLE MARCEL');
  await expect(page.locator('dl.kv').filter({ hasText: 'PA unitaire' })).toContainText('2,15 USD');
  await expect(page.locator('dl.kv').filter({ hasText: 'Marque' })).toContainText('LITTLE MARCEL');

  // Les nouvelles valeurs rejoignent les listes : proposées sur une autre fiche, et visibles dans Paramètres
  await go(page, 'produits/CP-C042');
  await page.getByRole('button', { name: 'Modifier la fiche' }).first().click();
  await expect(page.locator('#pe-rayon option', { hasText: 'Plage' })).toHaveCount(1);
  await expect(page.locator('#pe-brand option', { hasText: 'LITTLE MARCEL' })).toHaveCount(1);
  await page.getByRole('dialog').getByRole('button', { name: 'Annuler' }).click();
  await go(page, 'produits/CP-T001');

  // Réf. déjà prise par un autre produit : refusée
  await page.getByRole('button', { name: 'Modifier la fiche' }).first().click();
  await page.locator('#pe-ref').fill('CP-C042');
  await page.getByRole('dialog').getByRole('button', { name: 'Enregistrer' }).click();
  await expect(toast(page)).toContainText('Réf. CP-C042 : déjà utilisée');
  await page.getByRole('dialog').getByRole('button', { name: 'Annuler' }).click();

  // Designer, logistique : pas de modification
  for (const who of ['ABIR', 'Logistique']) {
    await loginAs(page, who);
    await go(page, 'produits/CP-T001');
    await expect(page.getByRole('button', { name: 'Modifier la fiche' })).toHaveCount(0);
  }
  // Direction : oui
  await loginAs(page, 'Rudy Zerah');
  await go(page, 'produits/CP-T001');
  await expect(page.getByRole('button', { name: 'Modifier la fiche' }).first()).toBeVisible();
});

test('fiches en Excel : export, modification dans Excel, import avec aperçu puis application', async ({ page }) => {
  await resetApp(page);
  await loginAs(page, 'David');
  await go(page, 'produits');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exporter les fiches' }).click()]);
  const wb = XLSX.read(readFileSync(await dl.path()), { type: 'buffer' });
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
  const head = rows[0] as string[];
  expect(head.slice(0, 6)).toEqual(['Réf. JONAS', 'EAN', 'Réf. fournisseur', 'Désignation', 'Marque', 'Fournisseur']);
  const c = (label: string) => head.indexOf(label);
  const row = rows.find((r) => r[0] === 'CP-T001')!;
  expect(String(row[c('EAN')])).toMatch(/^\d{13}$/);
  // Dans « Excel » : désignation, PA en USD, PCB, description française ; une réf. inconnue ; un produit inchangé
  row[c('Désignation')] = 'Tong paillettes femme';
  row[c('PA')] = 2.4;
  row[c('Devise')] = 'USD';
  row[c('PCB')] = 36;
  row[c('Description FR')] = 'Tong à paillettes, semelle EVA.';
  const other = rows.find((r) => r[0] === 'CP-C042')!;
  const unknown = [...other];
  unknown[0] = 'XX-999';
  unknown[1] = '';
  const out = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(out, XLSX.utils.aoa_to_sheet([head, row, other, unknown]), 'Fiches');
  const buffer = Buffer.from(XLSX.write(out, { type: 'buffer', bookType: 'xlsx' }));

  await page.getByRole('button', { name: 'Importer les fiches' }).click();
  const dlg = page.getByRole('dialog', { name: 'Importer les fiches produit' });
  await dlg.getByLabel('Fichier des fiches produit').setInputFiles({ name: 'fiches.xlsx', mimeType: '', buffer });
  await expect(dlg).toContainText('1 fiche(s) à modifier · 1 inchangée(s) · 1 réf. inconnue(s)');
  await expect(dlg).toContainText('Produit introuvable — Ligne 4 : XX-999');
  const t = dlg.locator('table');
  await expect(t).toContainText('Tong paillettes femme');
  await expect(t).toContainText('2,40 USD');
  await expect(t.locator('tr', { hasText: 'PCB' })).toContainText('36');
  await dlg.getByRole('button', { name: 'Appliquer 1 fiche(s)' }).click();
  await expect(toast(page)).toContainText('1 fiche(s) produit mise(s) à jour');
  const { p } = await product(page, 'CP-T001');
  expect(p).toMatchObject({ name: 'Tong paillettes femme', pcb: 36, paSupplier: { price: 2.4, currency: 'USD' }, description: { fr: 'Tong à paillettes, semelle EVA.' } });

  // Devise inconnue : signalée, rien d'appliqué pour cette ligne
  row[c('Devise')] = 'GBP';
  const bad = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(bad, XLSX.utils.aoa_to_sheet([head, row]), 'Fiches');
  await page.getByRole('button', { name: 'Importer les fiches' }).click();
  await page.getByRole('dialog').getByLabel('Fichier des fiches produit').setInputFiles({ name: 'fiches2.xlsx', mimeType: '', buffer: Buffer.from(XLSX.write(bad, { type: 'buffer', bookType: 'xlsx' })) });
  await expect(page.getByRole('dialog')).toContainText('devise « GBP » inconnue');
});

test('Paramètres : listes de la fiche produit (marques, rayons…) ajoutées, retirées si inutilisées', async ({ page }) => {
  await resetApp(page);
  await loginAs(page, 'David');
  await go(page, 'parametres');
  const card = page.locator('.card', { hasText: 'Listes de la fiche produit' });
  // Marque nouvelle
  await card.getByLabel('Nouvelle marque').fill('Little Marcel');
  await card.getByLabel('Signature de la marque').fill('Paris');
  await card.getByRole('button', { name: 'Ajouter' }).click();
  await expect(toast(page)).toContainText('Marque LITTLE MARCEL ajoutée');
  await expect(card).toContainText('LITTLE MARCEL PARIS');
  // Une marque utilisée ne se retire pas
  await expect(card.getByLabel('Retirer la marque CAMILLE')).toBeDisabled();
  // Matières : ajout, puis retrait (inutilisée)
  await card.getByRole('tab', { name: 'Matières' }).click();
  await card.getByLabel('Nouvelle valeur : Matières').fill('Paille');
  await card.getByRole('button', { name: 'Ajouter' }).click();
  await expect(card).toContainText('Paille');
  await card.getByLabel('Retirer Paille').click();
  await expect(card.locator('.list-chip', { hasText: 'Paille' })).toHaveCount(0);
  // Proposée dans la fiche
  await card.getByRole('tab', { name: 'Types de pack' }).click();
  await card.getByLabel('Nouvelle valeur : Types de pack').fill('Filet');
  await card.getByRole('button', { name: 'Ajouter' }).click();
  await go(page, 'produits/CP-T001');
  await page.getByRole('button', { name: 'Modifier la fiche' }).first().click();
  await expect(page.locator('#pe-packType option', { hasText: 'Filet' })).toHaveCount(1);
  await expect(page.locator('#pe-brand option', { hasText: 'LITTLE MARCEL' })).toHaveCount(1);
});

test('page « Listes produit » : vision d’ensemble, produits concernés, renommer partout, fusionner', async ({ page }) => {
  await resetApp(page);
  await loginAs(page, 'David');
  await page.getByRole('link', { name: 'Listes produit' }).click();
  await expect(page.locator('h1')).toContainText('Listes produit');
  for (const t of ['Marques', 'Rayons', 'Collections', 'Genres', 'Matières', 'Tailles', 'Types de pack']) await expect(page.getByRole('region', { name: t })).toBeVisible();

  const count = (rayon: string) =>
    page.evaluate((r) => {
      const k = Object.keys(localStorage).find((x) => x.startsWith('jonas-buying-state'))!;
      return (JSON.parse(localStorage.getItem(k)!).products as { rayon: string }[]).filter((p) => p.rayon === r).length;
    }, rayon);
  const beaute = await count('Beauté');
  const parfum = await count('Parfumerie');
  expect(beaute).toBeGreaterThan(0);

  const rayons = page.getByRole('region', { name: 'Rayons' });
  // Produits concernés : dépliables, avec lien vers la fiche
  await rayons.locator('.lp-row', { hasText: 'Beauté' }).locator('.lp-count').click();
  await expect(rayons.locator('.lp-products .ref-tag')).toHaveCount(Math.min(beaute, 30));
  // Renommer partout
  await rayons.getByLabel('Renommer Beauté').click();
  await rayons.getByLabel('Nouveau nom pour Beauté').fill('Beauté & soins');
  await rayons.getByLabel('Valider').click();
  await expect(toast(page)).toContainText(`« Beauté » → « Beauté & soins » sur ${beaute} produit(s)`);
  expect(await count('Beauté & soins')).toBe(beaute);
  expect(await count('Beauté')).toBe(0);
  // Fusion avec une valeur existante
  await rayons.getByLabel('Renommer Beauté & soins').click();
  await rayons.getByLabel('Nouveau nom pour Beauté & soins').fill('Parfumerie');
  await rayons.getByLabel('Valider').click();
  expect(await count('Parfumerie')).toBe(beaute + parfum);
  await expect(rayons.locator('.lp-row', { hasText: 'Beauté' })).toHaveCount(0);
  // Recherche sur toutes les listes
  await page.getByLabel('Chercher une valeur').fill('EVA');
  await expect(page.getByRole('region', { name: 'Matières' }).locator('.lp-row')).toHaveCount(1);
  // Une valeur utilisée ne se retire pas ; une valeur ajoutée oui
  await page.getByLabel('Chercher une valeur').fill('');
  await expect(rayons.getByLabel('Retirer Parfumerie')).toBeDisabled();
  await rayons.getByLabel('Ajouter : Rayons').fill('Plein air');
  await rayons.getByRole('button', { name: 'Ajouter' }).click();
  await rayons.getByLabel('Retirer Plein air').click();
  await expect(rayons.locator('.lp-row', { hasText: 'Plein air' })).toHaveCount(0);

  // Designer : lecture seule
  await loginAs(page, 'ABIR');
  await go(page, 'listes');
  await expect(page.getByRole('region', { name: 'Rayons' })).toBeVisible();
  await expect(page.getByLabel('Renommer Parfumerie')).toHaveCount(0);
});
