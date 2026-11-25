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
  await dlg.locator('#pe-brand').fill('Little Marcel');
  await dlg.locator('#pe-rayon').fill('Plage');
  await dlg.locator('#pe-collection').fill('Été 2027');
  await dlg.locator('#pe-gender').fill('Femme');
  await dlg.locator('#pe-material').fill('EVA');
  await dlg.locator('#pe-pa').fill('2,15');
  await dlg.locator('#pe-currency').selectOption('USD');
  await dlg.locator('#pe-pcb').fill('48');
  await dlg.locator('#pe-weight').fill('0,18');
  await dlg.locator('#pe-cbmCarton').fill('0.075');
  await dlg.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(toast(page)).toContainText('Fiche CP-T001B enregistrée');

  const { p, brands } = await product(page, 'CP-T001');
  expect(p).toMatchObject({ ref: 'CP-T001B', ean: '3700000000013', supplierRef: 'TX-501', name: 'Tong femme paillettes or', rayon: 'Plage', collection: 'Été 2027', gender: 'Femme', material: 'EVA', pcb: 48, weight: 0.18, cbmCarton: 0.075, paSupplier: { price: 2.15, currency: 'USD' } });
  expect(brands.find((b) => b.id === p.brandId)?.name).toBe('LITTLE MARCEL');
  await expect(page.locator('dl.kv').filter({ hasText: 'PA unitaire' })).toContainText('2,15 USD');
  await expect(page.locator('dl.kv').filter({ hasText: 'Marque' })).toContainText('LITTLE MARCEL');

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
