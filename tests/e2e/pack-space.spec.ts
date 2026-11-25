// Espace pack simplifié : brief marketing, die cut, ancien pack, pack, dossier pack, fiches qualité.
import { expect, go, loginAs, resetApp, test, toast } from './fixtures';

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201a5f1d9f30000000049454e44ae426082', 'hex');
const file = (name: string, mimeType = 'application/octet-stream') => ({ name, mimeType, buffer: name.endsWith('.png') ? PNG : Buffer.from(`contenu ${name}`) });

test('Design & Pack : trois ronds (die cut, pack, documents) puis la validation', async ({ page }) => {
  await resetApp(page);
  await loginAs(page, 'David');
  await go(page, 'produits/CP-T001');
  await page.getByRole('button', { name: 'Design & Pack' }).click();
  const space = page.locator('.pack-space');
  const round = (name: string) => space.getByRole('tab', { name: new RegExp(`^${name} :`) });
  await expect(space.locator('.ps-round')).toHaveCount(3);
  await expect(round('Die cut')).toHaveAccessibleName('Die cut : à uploader');
  await expect(round('Pack')).toHaveAccessibleName('Pack : à uploader');
  await expect(round('Documents')).toHaveAccessibleName('Documents : à uploader');
  // La validation est en dessous des ronds
  // La validation est visible : chaque valideur et son état
  const valid = page.getByRole('region', { name: 'Validation du pack' });
  // Circuit : Direction → Moinard → Fournisseur (plus d'étape David)
  await expect(valid.locator('.pk-vlist li')).toHaveCount(3);
  for (const who of ['Direction', 'Moinard', 'Fournisseur']) await expect(valid.locator('.pk-vlist')).toContainText(who);
  await expect(valid.locator('.pk-vlist')).not.toContainText('David');

  // Die cut : déposé → rond vert
  await round('Die cut').click();
  await space.getByLabel('Déposer : Die cut').setInputFiles([file('diecut.pdf', 'application/pdf'), file('diecut.dxf')]);
  await expect(toast(page)).toContainText('2 fichier(s) ajouté(s) : Die cut');
  await expect(round('Die cut')).toHaveAccessibleName('Die cut : uploadé');
  // Documents : fiches qualité par type
  await round('Documents').click();
  await space.getByLabel('Type de fiche qualité').selectOption('Fiche composition');
  await space.getByLabel('Déposer : Fiches qualité').setInputFiles(file('composition.pdf', 'application/pdf'));
  await space.getByLabel('Type de fiche qualité').selectOption('MSDS (fiche de sécurité)');
  await space.getByLabel('Déposer : Fiches qualité').setInputFiles(file('msds.pdf', 'application/pdf'));
  await expect(space.getByRole('region', { name: 'Fiches qualité' })).toContainText('Fiche composition');
  await expect(round('Documents')).toHaveAccessibleName('Documents : uploadé');
  // Pack : brief pour le designer + ancien pack (l'acheteur ne dépose pas le pack lui-même)
  await round('Pack').click();
  await space.getByLabel('Texte du brief marketing').fill('Cible femme 25-40 ans, univers plage chic, doré + blanc.');
  await space.getByLabel('Texte du brief marketing').blur();
  await expect(toast(page)).toContainText('Brief marketing enregistré');
  await space.getByLabel('Déposer : Brief marketing').setInputFiles([file('inspi-1.png', 'image/png'), file('inspi-2.png', 'image/png')]);
  await expect(space.locator('.ps-inspi')).toHaveCount(2);
  await space.getByLabel('Déposer : Ancien pack').setInputFiles(file('pack-2025.ai'));
  await expect(space.getByLabel('Déposer : Pack', { exact: true })).toHaveCount(0);

  // Designer du produit : arrive sur le rond Pack, voit le brief, dépose son pack et son dossier
  const designer = await page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.startsWith('jonas-buying-state'))!;
    return JSON.parse(localStorage.getItem(k)!).products.find((p: { id: string }) => p.id === 'CP-T001').pack.designer as string;
  });
  await loginAs(page, designer);
  await go(page, 'produits/CP-T001');
  await page.getByRole('button', { name: 'Design & Pack' }).click();
  await expect(round('Pack')).toHaveAttribute('aria-selected', 'true');
  await expect(space).toContainText('Cible femme 25-40 ans');
  await expect(space.locator('.ps-inspi')).toHaveCount(2);
  // Prochaine action du designer : un gros bouton « Déposer et passer en validation »
  const next = page.getByRole('region', { name: 'Prochaine action' });
  await expect(next).toContainText('Déposer le pack');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), next.getByRole('button', { name: 'Déposer et passer en validation' }).click()]);
  await chooser.setFiles(file('pack-v1.ai'));
  await expect(toast(page)).toContainText(/Pack V\d+ envoyé en validation/);
  await expect(page.locator('.pk-steps li.done')).toHaveCount(2);
  await expect(next).toContainText(/Pack V\d+ en validation/);
  await space.getByLabel('Déposer : Dossier pack').setInputFiles([file('rendu.png', 'image/png'), file('source.psd')]);
  await expect(round('Pack')).toHaveAccessibleName('Pack : uploadé');
  await expect(space.locator('.ps-round.ok')).toHaveCount(3);
  // Le designer télécharge le die cut, sans pouvoir le modifier
  await round('Die cut').click();
  await expect(space.getByRole('region', { name: 'Die cut' })).toContainText('diecut.dxf');
  await expect(space.getByLabel('Déposer : Die cut')).toHaveCount(0);
  // Tout télécharger : rangé par rubrique
  const [zip] = await Promise.all([page.waitForEvent('download'), space.getByRole('button', { name: /Tout télécharger/ }).click()]);
  expect(zip.suggestedFilename()).toBe('CP-T001_dossier_pack.zip');

  // Le valideur en cours voit « Valider le pack » en prochaine action
  const step = await page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.startsWith('jonas-buying-state'))!;
    const v = JSON.parse(localStorage.getItem(k)!).products.find((p: { id: string }) => p.id === 'CP-T001').pack.validations;
    return ['direction', 'moinard', 'fournisseur'].find((s) => v[s].state !== 'done');
  });
  // Le pack uploadé part directement chez la Direction
  expect(step).toBe('direction');
  {
    await loginAs(page, 'Rudy Zerah');
    await go(page, 'produits/CP-T001');
    await page.getByRole('button', { name: 'Design & Pack' }).click();
    await expect(next).toContainText(/Valider le pack V\d+/);
    await next.getByRole('button', { name: 'Valider le pack' }).click();
    await expect(toast(page)).toContainText('Pack validé');
  }
});

test('portail fournisseur : dépôt du die cut et des fiches qualité, téléchargement du pack (traduit)', async ({ page }) => {
  await resetApp(page);
  await loginAs(page, 'Tide');
  await go(page, 'portail/packs');
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
  await expect(page.getByRole('tab', { name: 'Die cut : uploadé' })).toBeVisible();
  await page.getByRole('tab', { name: 'Die cut : uploadé' }).click();
  await expect(page.getByRole('region', { name: 'Die cut' })).toContainText(`diecut-${ref}.pdf`);
  await page.getByRole('tab', { name: 'Documents : uploadé' }).click();
  await expect(page.getByRole('region', { name: 'Fiches qualité' })).toContainText('composition.pdf');
});

test('refuser le pack avec une demande de modification écrite : le designer la voit et redépose', async ({ page }) => {
  await resetApp(page);
  await loginAs(page, 'Rudy Zerah');
  await go(page, 'produits/CP-C042');
  await page.getByRole('button', { name: 'Design & Pack' }).click();
  const next = page.getByRole('region', { name: 'Prochaine action' });
  await next.getByRole('button', { name: 'Refuser et demander une modification' }).click();
  const send = next.getByRole('button', { name: 'Envoyer la demande de modification' });
  await expect(send).toBeDisabled();
  await next.getByLabel('Demande de modification').fill('Logo plus grand, fond blanc, ajouter « 100 % EVA ».');
  await send.click();
  await expect(toast(page)).toContainText('demande de modification envoyée au designer');
  const valid = page.getByRole('region', { name: 'Validation du pack' });
  await expect(valid.locator('.pk-rejection')).toContainText('Logo plus grand, fond blanc');
  await expect(valid.locator('.pk-vh').first()).toContainText('modifications demandées : Logo plus grand');
  // La Direction n'a plus à valider tant que le designer n'a pas redéposé
  await expect(next.getByRole('button', { name: 'Valider le pack' })).toHaveCount(0);
  await expect(valid.locator('.pk-vlist li.pending')).toContainText('Attend la nouvelle version du designer');

  // Le designer voit la demande en prochaine action et dépose une nouvelle version
  const designer = await page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.startsWith('jonas-buying-state'))!;
    return JSON.parse(localStorage.getItem(k)!).products.find((p: { id: string }) => p.id === 'CP-C042').pack.designer as string;
  });
  await loginAs(page, designer);
  await go(page, 'produits/CP-C042');
  await page.getByRole('button', { name: 'Design & Pack' }).click();
  await expect(next).toContainText('Modifications demandées');
  await expect(next).toContainText('Logo plus grand, fond blanc');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), next.getByRole('button', { name: 'Déposer la nouvelle version' }).click()]);
  await chooser.setFiles(file('pack-v2.ai'));
  await expect(toast(page)).toContainText('envoyé en validation');
  await expect(next).not.toContainText('Modifications demandées');
  await expect(valid.locator('.pk-rejection')).toBeVisible(); // la demande reste visible pendant la nouvelle validation
  await expect(valid.locator('.pk-vlist li.pending')).toContainText('À valider — c’est son tour');
  // La Direction peut de nouveau valider
  await loginAs(page, 'Rudy Zerah');
  await go(page, 'produits/CP-C042');
  await page.getByRole('button', { name: 'Design & Pack' }).click();
  await expect(next.getByRole('button', { name: 'Valider le pack' })).toBeVisible();
});
