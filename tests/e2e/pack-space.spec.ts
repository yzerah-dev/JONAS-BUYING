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
  await card.getByRole('button', { name: 'Tous les fichiers' }).click();
  const dlg = page.getByRole('dialog', { name: `Fichiers du pack — ${ref}` });
  await dlg.getByLabel('Déposer : Die cut').setInputFiles(file(`diecut-${ref}.pdf`, 'application/pdf'));
  await expect(toast(page)).toContainText('1 fichier(s) ajouté(s)');
  await dlg.getByLabel('Type de document').selectOption('Fiche composition');
  await dlg.getByLabel('Déposer : Fiches qualité').setInputFiles(file('composition.pdf', 'application/pdf'));
  await expect(dlg.getByRole('region', { name: 'Fiches qualité' })).toContainText('Fiche composition');
  // En anglais
  await page.getByRole('dialog').getByLabel('Fermer').click();
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await page.locator('.gallery > .card', { hasText: ref }).getByRole('button', { name: 'All files' }).click();
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

/** Modifie l'état enregistré puis recharge (raccourci pour préparer un cas) */
async function patchProduct(page: import('@playwright/test').Page, id: string, fn: string) {
  await page.evaluate(
    ([id, fn]) => {
      const k = Object.keys(localStorage).find((x) => x.startsWith('jonas-buying-state'))!;
      const s = JSON.parse(localStorage.getItem(k)!);
      const p = s.products.find((x: { id: string }) => x.id === id);
      new Function('p', fn)(p);
      localStorage.setItem(k, JSON.stringify(s));
    },
    [id, fn],
  );
  await page.reload();
}

test('pack validé par tout le monde : pack, die cut et documents ne se suppriment plus', async ({ page }) => {
  await resetApp(page);
  await loginAs(page, 'David');
  await go(page, 'produits/CP-T001');
  await page.getByRole('button', { name: 'Design & Pack' }).click();
  const space = page.locator('.pack-space');
  await space.getByRole('tab', { name: /^Die cut :/ }).click();
  await space.getByLabel('Déposer : Die cut').setInputFiles(file('diecut.pdf', 'application/pdf'));
  await space.getByRole('tab', { name: /^Documents :/ }).click();
  await space.getByLabel('Déposer : Fiches qualité').setInputFiles(file('msds.pdf', 'application/pdf'));
  // Avant validation complète : suppression possible
  await expect(space.getByRole('region', { name: 'Fiches qualité' }).getByTitle('Supprimer')).toHaveCount(1);
  // Toutes les validations faites
  await patchProduct(page, 'CP-T001', "for (const k of ['direction','moinard','fournisseur']) p.pack.validations[k] = { state: 'done', date: '2026-11-20' };");
  await page.getByRole('button', { name: 'Design & Pack' }).click();
  await space.getByRole('tab', { name: /^Documents :/ }).click();
  await expect(space.getByRole('region', { name: 'Fiches qualité' }).getByTitle('Supprimer')).toHaveCount(0);
  await expect(space.getByRole('region', { name: 'Fiches qualité' }).getByLabel('Verrouillé')).toHaveCount(1);
  await space.getByRole('tab', { name: /^Die cut :/ }).click();
  await expect(space.getByRole('region', { name: 'Die cut' }).getByTitle('Supprimer')).toHaveCount(0);
});

test('demander un nouveau pack (Direction, acheteur) : l’ancien pack est gardé, le designer refait', async ({ page }) => {
  await resetApp(page);
  // Pack V1 déposé et validé
  const designer = await page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.startsWith('jonas-buying-state'))!;
    return JSON.parse(localStorage.getItem(k)!).products.find((p: { id: string }) => p.id === 'CP-T001').pack.designer as string;
  });
  await loginAs(page, designer);
  await go(page, 'produits/CP-T001');
  await page.getByRole('button', { name: 'Design & Pack' }).click();
  await page.locator('.pack-space').getByLabel('Déposer : Pack', { exact: true }).setInputFiles(file('pack-ete.ai'));
  const next = page.getByRole('region', { name: 'Prochaine action' });
  // Designer et Moinard : pas de demande de nouveau pack
  await expect(next.getByRole('button', { name: 'Demander un nouveau pack' })).toHaveCount(0);
  await loginAs(page, 'Moinard');
  await go(page, 'produits/CP-T001');
  await page.getByRole('button', { name: 'Design & Pack' }).click();
  await expect(next.getByRole('button', { name: 'Demander un nouveau pack' })).toHaveCount(0);
  // Direction : demande avec le motif
  await loginAs(page, 'Rudy Zerah');
  await go(page, 'produits/CP-T001');
  await page.getByRole('button', { name: 'Design & Pack' }).click();
  await next.getByRole('button', { name: 'Demander un nouveau pack' }).click();
  await next.getByLabel('Demande de nouveau pack').fill('Nouvelle charte Camille Paris 2027.');
  await next.getByRole('button', { name: 'Envoyer la demande au designer' }).click();
  await expect(toast(page)).toContainText('Nouveau pack demandé au designer');
  await expect(page.getByRole('region', { name: 'Validation du pack' }).locator('.pk-newreq')).toContainText('Nouvelle charte Camille Paris 2027.');
  // Le designer : « Nouveau pack demandé », l'ancien pack est rangé dans « Ancien pack »
  await loginAs(page, designer);
  await go(page, 'produits/CP-T001');
  await page.getByRole('button', { name: 'Design & Pack' }).click();
  await expect(next).toContainText('Nouveau pack demandé');
  await expect(next).toContainText('Nouvelle charte Camille Paris 2027.');
  await expect(page.getByRole('region', { name: 'Ancien pack' })).toContainText('pack-ete.ai');
  await expect(page.getByRole('tab', { name: 'Pack : à uploader' })).toBeVisible();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), next.getByRole('button', { name: 'Déposer et passer en validation' }).click()]);
  await chooser.setFiles(file('pack-2027.ai'));
  await expect(page.getByRole('region', { name: 'Validation du pack' }).locator('.pk-newreq')).toHaveCount(0);
});

test('Espace Designer (ABIR) : suivi pack visible sur chaque ligne, filtre et tri', async ({ page }) => {
  await resetApp(page);
  await loginAs(page, 'ABIR');
  await go(page, 'design');
  const bar = page.getByRole('group', { name: 'Suivi pack' });
  await expect(bar).toBeVisible();
  for (const l of ['Die cut manquant', 'Pack en attente de validation', 'Pack à refaire', 'Pack validé']) await expect(bar).toContainText(l);
  await expect(page.locator('.pk-row').first().locator('.trk-list .trk-label').first()).toBeVisible();
  // Filtre « Pack validé » : chaque ligne a le rond vert
  await bar.getByRole('button', { name: /Pack validé/ }).click();
  const n = await page.locator('.pk-row').count();
  expect(n).toBeGreaterThan(0);
  await expect(page.locator('.pk-row .trk[data-k="valide"]')).toHaveCount(n);
  await expect(page.locator('.pk-row').first()).toContainText('Pack validé');
  // Tri par statut du pack
  await bar.getByRole('button', { name: /^Tous/ }).click();
  await page.getByRole('button', { name: 'Trier', exact: true }).click();
  await page.getByRole('option', { name: 'Tri : statut du pack' }).click();
  await expect(page.getByRole('button', { name: 'Trier', exact: true })).toContainText('Tri : statut du pack');
});

test('Total – Produits : filtrer et trier par statut du pack', async ({ page }) => {
  await resetApp(page);
  await loginAs(page, 'David');
  await go(page, 'produits');
  await page.getByRole('button', { name: 'Statut du pack', exact: true }).click();
  await page.getByRole('option', { name: 'Pack validé' }).click();
  const cards = page.locator('.pcard');
  await expect(cards.first()).toBeVisible();
  const n = await cards.count();
  await expect(page.locator('.pcard .trk[data-k="valide"]')).toHaveCount(n);
  await page.getByRole('button', { name: 'Statut du pack', exact: true }).click();
  await page.getByRole('option', { name: 'Die cut manquant' }).click();
  await expect(page.locator('.pcard').first().locator('.trk[data-k="diecut"]')).toBeVisible();
  // Tri : les packs à refaire / en attente d'abord, les validés à la fin
  await page.getByRole('button', { name: 'Retirer le filtre Statut du pack' }).click();
  await page.getByRole('button', { name: 'Trier', exact: true }).click();
  await page.getByRole('option', { name: 'Tri : statut du pack' }).click();
  await expect(page.locator('.pcard').first().locator('.trk[data-k="valide"]')).toHaveCount(0);
});

test('bouton Télécharger sous chaque rond : die cut, pack (dernière version), documents', async ({ page }) => {
  await resetApp(page);
  await loginAs(page, 'David');
  await go(page, 'produits/CP-T001');
  await page.getByRole('button', { name: 'Design & Pack' }).click();
  const space = page.locator('.pack-space');
  // Rien d'uploadé : pas de bouton
  await expect(space.getByRole('button', { name: /^Télécharger : / })).toHaveCount(0);
  await space.getByRole('tab', { name: /^Die cut :/ }).click();
  await space.getByLabel('Déposer : Die cut').setInputFiles([file('diecut.pdf', 'application/pdf'), file('diecut.dxf')]);
  await space.getByRole('tab', { name: /^Documents :/ }).click();
  await space.getByLabel('Déposer : Fiches qualité').setInputFiles(file('msds.pdf', 'application/pdf'));
  // Die cut (2 fichiers) : .zip
  const [z] = await Promise.all([page.waitForEvent('download'), space.getByRole('button', { name: 'Télécharger : Die cut' }).click()]);
  expect(z.suggestedFilename()).toBe('CP-T001_die-cut.zip');
  // Documents (1 fichier) : le fichier lui-même
  const [d] = await Promise.all([page.waitForEvent('download'), space.getByRole('button', { name: 'Télécharger : Documents' }).click()]);
  expect(d.suggestedFilename()).toBe('msds.pdf');
  // Pack : la dernière version déposée par le designer
  const designer = await page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.startsWith('jonas-buying-state'))!;
    return JSON.parse(localStorage.getItem(k)!).products.find((p: { id: string }) => p.id === 'CP-T001').pack.designer as string;
  });
  await loginAs(page, designer);
  await go(page, 'produits/CP-T001');
  await page.getByRole('button', { name: 'Design & Pack' }).click();
  await space.getByLabel('Déposer : Pack', { exact: true }).setInputFiles(file('pack-v1.ai'));
  await space.getByLabel('Déposer : Pack', { exact: true }).setInputFiles(file('pack-v2.ai'));
  const [pk] = await Promise.all([page.waitForEvent('download'), space.getByRole('button', { name: 'Télécharger : Pack' }).click()]);
  expect(pk.suggestedFilename()).toBe('pack-v2.ai');
});

test('glisser-déposer un fichier directement sur un rond (die cut, documents, pack)', async ({ page }) => {
  await resetApp(page);
  await loginAs(page, 'David');
  await go(page, 'produits/CP-T001');
  await page.getByRole('button', { name: 'Design & Pack' }).click();
  const space = page.locator('.pack-space');
  const dropOn = async (name: RegExp, fileName: string) => {
    const dt = await page.evaluateHandle((n) => {
      const d = new DataTransfer();
      d.items.add(new File(['contenu'], n, { type: 'application/pdf' }));
      return d;
    }, fileName);
    const round = space.getByRole('tab', { name });
    await round.dispatchEvent('dragover', { dataTransfer: dt });
    await expect(round).toHaveClass(/over/);
    await round.dispatchEvent('drop', { dataTransfer: dt });
  };
  await dropOn(/^Die cut :/, 'diecut-glisse.pdf');
  await expect(toast(page)).toContainText('1 fichier(s) ajouté(s) : Die cut');
  await expect(space.getByRole('tab', { name: 'Die cut : uploadé' })).toBeVisible();
  await expect(space.getByRole('region', { name: 'Die cut' })).toContainText('diecut-glisse.pdf');
  await dropOn(/^Documents :/, 'msds-glisse.pdf');
  await expect(space.getByRole('tab', { name: 'Documents : uploadé' })).toBeVisible();
  // Le pack : réservé au designer
  await dropOn(/^Pack :/, 'pack.ai');
  await expect(toast(page)).toContainText('Seul le designer du produit dépose le pack');
  await expect(space.getByRole('tab', { name: 'Pack : à uploader' })).toBeVisible();
});

test('lien pack → proforma : dernier pack validé = « En production », nouveau pack demandé = retour « En dev »', async ({ page }) => {
  await resetApp(page);
  // PF-2026-0148 (En dev) : JO-J205 déjà validé partout, JO-J201 n'attend plus que le fournisseur
  await page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.startsWith('jonas-buying-state'))!;
    const st = JSON.parse(localStorage.getItem(k)!);
    const done = { state: 'done', date: '2026-11-20' };
    for (const p of st.products) {
      if (p.id === 'JO-J205') p.pack.validations = { direction: done, moinard: done, fournisseur: done };
      if (p.id === 'JO-J201') p.pack.validations = { direction: done, moinard: done, fournisseur: { state: 'pending' } };
    }
    localStorage.setItem(k, JSON.stringify(st));
  });
  await page.reload();
  await go(page, 'proformas/PF-2026-0148');
  await expect(page.locator('main')).toContainText('En dev');
  await loginAs(page, 'Yoni Zerah');
  await go(page, 'produits/JO-J201');
  await page.getByRole('button', { name: 'Design & Pack' }).click();
  const next = page.getByRole('region', { name: 'Prochaine action' });
  await next.getByRole('button', { name: 'Valider le pack' }).click();
  await go(page, 'proformas/PF-2026-0148');
  await expect(page.locator('main .pill, main [class*="status"]').first()).toContainText('En production');
  await page.getByRole('button', { name: 'Historique' }).click();
  await expect(page.locator('main')).toContainText('Tous les packs validés (2/2) : statut → En production');
  // Un nouveau pack est demandé avant le booking : la proforma revient en dev
  await go(page, 'produits/JO-J201');
  await page.getByRole('button', { name: 'Design & Pack' }).click();
  await next.getByRole('button', { name: 'Demander un nouveau pack' }).click();
  await next.getByLabel('Demande de nouveau pack').fill('Nouvelle photo produit.');
  await next.getByRole('button', { name: 'Envoyer la demande au designer' }).click();
  await go(page, 'proformas/PF-2026-0148');
  await expect(page.locator('main .pill, main [class*="status"]').first()).toContainText('En dev');
  await page.getByRole('button', { name: 'Historique' }).click();
  await expect(page.locator('main')).toContainText('Pack rouvert (JO-J201) : statut → En dev');
});
