// Espace pack simplifié : brief marketing, die cut, ancien pack, pack, dossier pack, fiches qualité.
import { expect, go, loginAs, resetApp, test, toast } from './fixtures';

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201a5f1d9f30000000049454e44ae426082', 'hex');
const file = (name: string, mimeType = 'application/octet-stream') => ({ name, mimeType, buffer: name.endsWith('.png') ? PNG : Buffer.from(`contenu ${name}`) });

test('espace pack : chacun dépose sa partie, le designer retrouve tout au même endroit', async ({ page }) => {
  await resetApp(page);
  // Acheteur : brief écrit + photos d'inspiration, die cut, ancien pack, fiche qualité
  await loginAs(page, 'David');
  await go(page, 'produits/CP-T001');
  await page.getByRole('button', { name: 'Design & Pack' }).click();
  const space = page.locator('.pack-space');
  await expect(space.locator('.ps-tile')).toHaveCount(6);
  await space.getByLabel('Texte du brief marketing').fill('Cible femme 25-40 ans, univers plage chic, doré + blanc. Prix de vente 9,99 €.');
  await space.getByLabel('Texte du brief marketing').blur();
  await expect(toast(page)).toContainText('Brief marketing enregistré');
  await space.getByLabel('Déposer : Brief marketing').setInputFiles([file('inspi-1.png', 'image/png'), file('inspi-2.png', 'image/png')]);
  await expect(space.locator('.ps-inspi')).toHaveCount(2);
  await space.getByLabel('Déposer : Die cut').setInputFiles([file('diecut.pdf', 'application/pdf'), file('diecut.dxf')]);
  await expect(toast(page)).toContainText('2 fichier(s) ajouté(s) : Die cut');
  await space.getByLabel('Déposer : Ancien pack').setInputFiles(file('pack-2025.ai'));
  await space.getByLabel('Type de fiche qualité').selectOption('Fiche composition');
  await space.getByLabel('Déposer : Fiches qualité').setInputFiles(file('composition.pdf', 'application/pdf'));
  await space.getByLabel('Type de fiche qualité').selectOption('MSDS (fiche de sécurité)');
  await space.getByLabel('Déposer : Fiches qualité').setInputFiles(file('msds.pdf', 'application/pdf'));
  await expect(space.getByRole('region', { name: 'Fiches qualité' })).toContainText('Fiche composition');
  await expect(space.getByRole('region', { name: 'Fiches qualité' })).toContainText('MSDS (fiche de sécurité)');
  // L'acheteur ne dépose pas le pack du designer
  await expect(space.getByLabel('Déposer : Pack', { exact: true })).toHaveCount(0);
  // Le die cut déposé passe le pack en « die cut reçu »
  const dieCut = await page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.startsWith('jonas-buying-state'))!;
    return JSON.parse(localStorage.getItem(k)!).products.find((p: { id: string }) => p.id === 'CP-T001').pack.dieCut;
  });
  expect(dieCut).toBe('received');

  // Designer du produit : voit tout, dépose son pack et son dossier ; ne touche pas au brief
  const designer = await page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.startsWith('jonas-buying-state'))!;
    return JSON.parse(localStorage.getItem(k)!).products.find((p: { id: string }) => p.id === 'CP-T001').pack.designer as string;
  });
  await loginAs(page, designer);
  await go(page, 'produits/CP-T001');
  await page.getByRole('button', { name: 'Design & Pack' }).click();
  await expect(space).toContainText('Cible femme 25-40 ans');
  await expect(space.getByLabel('Texte du brief marketing')).toHaveCount(0);
  await expect(space.locator('.ps-inspi')).toHaveCount(2);
  await expect(space.getByRole('region', { name: 'Die cut' })).toContainText('diecut.dxf');
  await expect(space.getByLabel('Déposer : Die cut')).toHaveCount(0);
  await space.getByLabel('Déposer : Pack', { exact: true }).setInputFiles(file('pack-v1.ai'));
  await expect(toast(page)).toContainText('Pack V1 envoyé en validation');
  await space.getByLabel('Déposer : Dossier pack').setInputFiles([file('rendu.png', 'image/png'), file('source.psd')]);
  await expect(space.locator('.ps-tile.ok')).toHaveCount(6);
  // Tout télécharger : rangé par rubrique
  const [zip] = await Promise.all([page.waitForEvent('download'), space.getByRole('button', { name: /Tout télécharger/ }).click()]);
  expect(zip.suggestedFilename()).toBe('CP-T001_dossier_pack.zip');
});

test('portail fournisseur : dépôt du die cut et des fiches qualité, téléchargement du pack (traduit)', async ({ page }) => {
  await resetApp(page);
  await loginAs(page, 'Tide');
  await go(page, 'portail/packs');
  await page.getByRole('button', { name: /Tous mes packs/ }).click();
  const card = page.locator('.gallery > .card').first();
  const ref = (await card.locator('.ref-tag').first().innerText()).trim();
  await card.getByRole('button', { name: /Fichiers|Envoyer le die cut/ }).click();
  const dlg = page.getByRole('dialog', { name: `Fichiers du pack — ${ref}` });
  await dlg.getByLabel('Déposer : Die cut').setInputFiles(file(`diecut-${ref}.pdf`, 'application/pdf'));
  await expect(toast(page)).toContainText('1 fichier(s) ajouté(s)');
  await dlg.getByLabel('Type de document').selectOption('Fiche composition');
  await dlg.getByLabel('Déposer : Fiches qualité').setInputFiles(file('composition.pdf', 'application/pdf'));
  await expect(dlg.getByRole('region', { name: 'Fiches qualité' })).toContainText('Fiche composition');
  // En anglais
  await page.getByRole('dialog').getByLabel('Fermer').click();
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await page.getByRole('button', { name: /All my packs/ }).click();
  await page.locator('.gallery > .card', { hasText: ref }).getByRole('button', { name: /Files|Send die cut/ }).click();
  await expect(page.getByRole('dialog', { name: `Pack files — ${ref}` })).toContainText('Quality documents');
  await expect(page.getByRole('dialog')).toContainText('Composition sheet');

  // JONAS les retrouve dans l'espace pack
  await page.getByRole('dialog').getByLabel('Close').click();
  await page.getByRole('button', { name: 'FR', exact: true }).click();
  await loginAs(page, 'David');
  const id = await page.evaluate((ref) => {
    const k = Object.keys(localStorage).find((x) => x.startsWith('jonas-buying-state'))!;
    return JSON.parse(localStorage.getItem(k)!).products.find((p: { ref: string }) => p.ref === ref).id as string;
  }, ref);
  await go(page, `produits/${id}`);
  await page.getByRole('button', { name: 'Design & Pack' }).click();
  await expect(page.getByRole('region', { name: 'Die cut' })).toContainText(`diecut-${ref}.pdf`);
  await expect(page.getByRole('region', { name: 'Fiches qualité' })).toContainText('composition.pdf');
});
