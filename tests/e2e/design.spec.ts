import { chipCount, expect, go, loginAs, packRef, planCell, planTotal, resetApp, test, toast } from './fixtures';

test.describe('Espace Designer – planning et validation', () => {
  test.beforeEach(async ({ page }) => {
    await resetApp(page, 'design');
    await page.getByRole('button', { name: 'Planning de charge' }).click();
    await expect(page.locator('.pk-plan')).toBeVisible();
  });

  test('le planning affiche designers × semaines', async ({ page }) => {
    const heads = await page.locator('.pk-plan thead th').allInnerTexts();
    expect(heads[0]).toContain('Designer');
    expect(heads.some((h) => h.includes('S47'))).toBe(true);
    for (const who of ['ABIR', 'ALEX PANDA', 'ROLAND']) {
      await expect(page.locator('.pk-plan tbody tr', { hasText: who })).toHaveCount(1);
    }
    await expect(page.locator('.pk-plan tbody tr.total')).toContainText('Équipe');
  });

  test('validation groupée des packs « À valider » (Direction)', async ({ page }) => {
    await loginAs(page, 'Rudy Zerah');
    await go(page, 'design');
    await (await planCell(page, 'ABIR', 'S47')).click();
    await page.locator('.pk-chip', { hasText: 'À valider' }).click();
    const n = await page.locator('.pk-row').count();
    expect(n).toBeGreaterThan(0);

    await page.locator('.pk-head input').check();
    const btn = page.getByRole('button', { name: /Valider mon étape/ });
    await expect(btn).toContainText(String(n));
    await btn.click();
    await expect(toast(page)).toContainText(String(n));
    // Plus rien à valider pour la Direction sur cette case
    await expect(page.locator('.pk-chip', { hasText: 'À valider' })).toHaveCount(0);
  });
});

test.describe('Espace Designer – réaffectation (administrateur)', () => {
  test.beforeEach(async ({ page }) => {
    await resetApp(page, 'design');
    await page.getByRole('button', { name: 'Planning de charge' }).click();
    await expect(page.locator('.pk-plan')).toBeVisible();
  });

  test('glisser un pack sur une case du planning change designer et semaine', async ({ page }) => {
    const lea47 = await planCell(page, 'ABIR', 'S47');
    const hugo48 = await planCell(page, 'ROLAND', 'S48');
    await lea47.click();
    const [l0, h0] = [await planTotal(lea47), await planTotal(hugo48)];
    const row = page.locator('.pk-row').first();
    const ref = await packRef(row);

    await hugo48.scrollIntoViewIfNeeded();
    await row.dragTo(hugo48);
    await expect(toast(page)).toHaveText('1 pack déplacé → ROLAND · semaine S48');
    await expect.poll(() => planTotal(lea47)).toBe(l0 - 1);
    await expect.poll(() => planTotal(hugo48)).toBe(h0 + 1);
    await expect(page.locator('.pk-row', { hasText: ref })).toHaveCount(0);
  });

  test('glisser une sélection sur un nom de designer ne change que le designer', async ({ page }) => {
    const lea47 = await planCell(page, 'ABIR', 'S47');
    const sarah47 = await planCell(page, 'ALEX PANDA', 'S47');
    await lea47.click();
    const [l0, s0] = [await planTotal(lea47), await planTotal(sarah47)];
    for (let i = 0; i < 3; i++) await page.locator('.pk-row input').nth(i).check();

    // La barre d'actions groupées (sticky) recouvre le planning une fois la page défilée :
    // on agrandit la fenêtre et on remonte en haut pour que source et cible soient visibles.
    await page.setViewportSize({ width: 1540, height: 1600 });
    await page.evaluate(() => window.scrollTo(0, 0));
    const sarahName = page.locator('.pk-plan tbody tr', { hasText: 'ALEX PANDA' }).locator('th');
    await page.locator('.pk-row').nth(1).dragTo(sarahName);
    await expect(toast(page)).toHaveText('3 packs déplacés → ALEX PANDA');
    await expect.poll(() => planTotal(lea47)).toBe(l0 - 3);
    await expect.poll(() => planTotal(sarah47)).toBe(s0 + 3);
  });

  test('« Déplacer vers » une autre semaine', async ({ page }) => {
    await (await planCell(page, 'ABIR', 'S47')).click();
    await page.locator('.pk-row input').first().check();
    await page.getByLabel('Semaine cible').selectOption({ label: 'S49' });
    await page.locator('.pk-move').getByRole('button', { name: 'Déplacer' }).click();
    await expect(toast(page)).toHaveText(/^1 pack déplacé → .*semaine S49$/);
  });

  test('push urgent en un clic', async ({ page }) => {
    await (await planCell(page, 'ABIR', 'S47')).click();
    const row = page.locator('.pk-row').first();
    const ref = await packRef(row);
    await row.locator('.pk-urgent').click();
    await expect(toast(page)).toHaveText(`${ref} poussé en urgent`);
    await expect(page.locator('.pk-row', { hasText: ref }).locator('.pk-urgent.on')).toHaveCount(1);
  });

  test('tri et regroupement par marque', async ({ page }) => {
    await (await planCell(page, 'ABIR', 'S47')).click();
    await page.getByRole('button', { name: 'Trier', exact: true }).click();
    await page.getByRole('option', { name: 'Tri : marque' }).click();
    await page.getByRole('button', { name: 'Grouper', exact: true }).click();
    await page.getByRole('option', { name: 'Par marque' }).click();
    const groups = (await page.locator('.pk-group-head').allInnerTexts()).map((t) => t.split('\n')[0].trim());
    expect(groups.length).toBeGreaterThan(1);
    expect(groups).toEqual([...groups].sort((a, b) => a.localeCompare(b, 'fr')));
  });

  test('le designer peut trier mais ni glisser ni pousser en urgent', async ({ page }) => {
    await loginAs(page, 'ABIR');
    await go(page, 'design');
    await page.getByRole('button', { name: 'Planning de charge' }).click();
    await expect(page.locator('.pk-plan')).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: 'Trier', exact: true }).click();
    await expect(page.getByRole('option')).toContainText(['Tri : priorité', 'Tri : marque', 'Tri : collection', 'Tri : type de pack', 'Tri : échéance']);
    await page.keyboard.press('Escape');
    await expect(page.locator('.pk-row').first()).toBeVisible();
    await expect(page.locator('.pk-row.draggable')).toHaveCount(0);
    await expect(page.locator('.pk-urgent')).toHaveCount(0);
  });
});

test.describe('Espace Designer – démarrage des packs', () => {
  test.beforeEach(async ({ page }) => {
    await resetApp(page);
    await loginAs(page, 'ABIR');
    await go(page, 'design');
    await page.getByRole('button', { name: 'Planning de charge' }).click();
    await expect(page.locator('.pk-plan')).toBeVisible();
  });

  test('« Commencer » un pack puis démarrage groupé', async ({ page }) => {
    await (await planCell(page, 'ABIR', 'S47')).click();
    const notStarted = await chipCount(page, 'Pas commencés');
    const inCreation = await chipCount(page, 'En création');
    expect(notStarted).toBeGreaterThan(1);

    const row = page.locator('.pk-row:has(.pk-start)').first();
    const ref = await packRef(row);
    await row.locator('.pk-start').click();
    await expect(toast(page)).toHaveText(`${ref} : pack commencé`);
    await expect.poll(() => chipCount(page, 'Pas commencés')).toBe(notStarted - 1);
    await expect.poll(() => chipCount(page, 'En création')).toBe(inCreation + 1);
    await expect(page.locator('.pk-row', { hasText: ref }).locator('.pk-c-st')).toContainText(/En création\s*depuis/);

    await page.locator('.pk-chip', { hasText: 'Pas commencés' }).click();
    await page.locator('.pk-head input').check();
    await page.getByRole('button', { name: /Je commence \(/ }).click();
    await expect(toast(page)).toHaveText(`${notStarted - 1} pack(s) commencé(s)`);
    await expect.poll(() => chipCount(page, 'En création')).toBe(inCreation + notStarted);

    // Un autre designer ne peut pas commencer les packs de ABIR
    await loginAs(page, 'ALEX PANDA');
    await go(page, 'design');
    await (await planCell(page, 'ABIR', 'S47')).click();
    await expect(page.locator('.pk-row').first()).toBeVisible();
    await expect(page.locator('.pk-start')).toHaveCount(0);

    // Le pilote voit qui a commencé
    await loginAs(page, 'Yoni Zerah');
    await go(page, 'design');
    await (await planCell(page, 'ABIR', 'S47')).click();
    await page.locator('.pk-row', { hasText: ref }).click();
    await expect(page.locator('.pk-startbox')).toContainText('Commencé par ABIR');
  });

  test('date de début prévue depuis le panneau', async ({ page }) => {
    await (await planCell(page, 'ABIR', 'S48')).click();
    await page.locator('.pk-chip', { hasText: 'Pas commencés' }).click();
    const row = page.locator('.pk-row').first();
    const ref = await packRef(row);
    await row.click();
    await page.locator('.pk-startrow input[type=date]').fill('2026-11-17');
    await expect(toast(page)).toHaveText('Début prévu le 17/11/2026');
    await expect(page.locator('.pk-row', { hasText: ref }).locator('.pk-c-st')).toContainText('prévu 17 nov.');
  });
});

test('Développement = une seule page : ancienne adresse redirigée, PUSH URGENT, marquer développé', async ({ page }) => {
  await resetApp(page);
  await loginAs(page, 'David');
  await go(page, 'developpement');
  await expect(page).toHaveURL(/#\/design$/);
  await expect(page.locator('h1').first()).toHaveText('Développement');
  // Filtre PUSH URGENT
  await page.locator('.pk-row').first().click();
  const ref = (await page.locator('.pk-row.active b').first().innerText()).trim();
  await page.getByRole('button', { name: 'Push urgent', exact: true }).last().click();
  await expect(toast(page)).toContainText(`${ref} poussé en urgent`);
  await page.locator('.pk-chip', { hasText: 'PUSH URGENT' }).click();
  await expect(page.locator('.pk-row', { hasText: ref })).toHaveCount(1);
  // Marquer développé depuis le panneau
  await page.locator('.pk-row', { hasText: ref }).click();
  await page.getByRole('button', { name: 'Marquer développé' }).click();
  await expect(toast(page)).toContainText(`${ref} marqué comme développé`);
});

test('vues claires : par semaine de deadline, par designer, par fournisseur', async ({ page }) => {
  await resetApp(page);
  await loginAs(page, 'David');
  await go(page, 'design');
  const views = page.getByRole('tablist', { name: 'Vue' });
  // Par semaine (par défaut) : cartes semaine, la semaine en cours ouverte
  await expect(views.getByRole('tab', { name: 'Par semaine' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.pk-week').first()).toContainText('Semaine');
  await expect(page.locator('.pk-week', { hasText: 'en cours' })).toHaveClass(/open/);
  const closed = page.locator('.pk-week:not(.open)').first();
  await closed.locator('.pf-week-head').click();
  // Par designer : une carte par designer (dont ALEX PANDA)
  await views.getByRole('tab', { name: 'Par designer' }).click();
  for (const d of ['ABIR', 'ALEX PANDA', 'ROLAND']) await expect(page.locator('.pk-week .pf-week-title h2', { hasText: d })).toHaveCount(1);
  // Filtre designer : une seule carte
  await page.getByRole('group', { name: 'Designer' }).getByRole('button', { name: /ABIR/ }).click();
  await expect(page.locator('.pk-week')).toHaveCount(1);
  // Par fournisseur : une carte par fournisseur
  await views.getByRole('tab', { name: 'Par fournisseur' }).click();
  expect(await page.locator('.pk-week').count()).toBeGreaterThan(1);
  await expect(page.locator('.pk-week').first().locator('.pf-week-head')).toContainText('packs');
  // Designer × semaine : en cliquant une case du planning
  await (await planCell(page, 'ABIR', 'S47')).click();
  await expect(views.getByRole('tab', { name: 'Designer × semaine' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.pk-week')).toHaveCount(0);
});
