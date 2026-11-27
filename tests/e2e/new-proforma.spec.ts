import { PDFDocument, StandardFonts } from 'pdf-lib';
import { expect, go, loginAs, resetApp, signAsDirection, test, toast } from './fixtures';

async function pdf() {
  const d = await PDFDocument.create();
  d.addPage([595, 842]).drawText('PI', { x: 50, y: 780, size: 18, font: await d.embedFont(StandardFonts.Helvetica) });
  return Buffer.from(await d.save());
}

test.describe('Nouvelle proforma', () => {
  test.beforeEach(async ({ page }) => {
    await resetApp(page);
  });

  test('le fournisseur crée et dépose sa proforma : JONAS la reçoit à signer, aux conditions du fournisseur', async ({ page }) => {
    // Devise et paiement paramétrés sur le fournisseur
    await loginAs(page, 'Finance');
    await go(page, 'fournisseurs/horizon');
    await page.locator('#tm-cur').selectOption('USD');
    await page.locator('#tm-dep').fill('40');
    await page.locator('#tm-days').fill('10');
    await page.locator('.terms-card').getByRole('button', { name: 'Enregistrer' }).click();
    await expect(toast(page)).toContainText('Conditions du fournisseur enregistrées');

    await loginAs(page, 'Wang Lei');
    await go(page, 'portail/proformas');
    await page.getByRole('button', { name: 'Nouvelle proforma' }).click();
    const dlg = page.getByRole('dialog');
    await expect(dlg).toContainText('Nouvelle proforma PF-2026-HORIZO-01');
    await page.locator('#np-title').fill('Coussins outdoor');
    await page.locator('#ln-prod-0').click();
    await page.getByRole('option').nth(1).click();
    await dlg.getByLabel('Quantité 1').fill('2000');
    await dlg.getByLabel('Prix unitaire 1').fill('4,5');
    await dlg.getByRole('button', { name: 'Ajouter une ligne' }).click();
    await page.locator('#ln-prod-1').click();
    await page.getByRole('option').nth(2).click();
    await dlg.getByLabel('Quantité 2').fill('1000');
    await dlg.getByLabel('Prix unitaire 2').fill('10');
    await expect(dlg).toContainText('Devise USD · 40 % d’acompte · solde à J+10 du départ');
    await expect(dlg).toContainText(/Total : 19[\s\u202f]000 USD/);
    // Proforma jointe obligatoire côté fournisseur
    await dlg.getByRole('button', { name: 'Envoyer à JONAS' }).click();
    await expect(toast(page)).toContainText('Joignez votre proforma');
    await dlg.getByLabel(/Proforma du fournisseur/).setInputFiles({ name: 'PI-HORIZON-0154.pdf', mimeType: 'application/pdf', buffer: await pdf() });
    await dlg.getByRole('button', { name: 'Envoyer à JONAS' }).click();
    await expect(toast(page)).toContainText('PF-2026-HORIZO-01 envoyée à JONAS');
    await expect(page.locator('.pv-row')).toContainText('PI-HORIZON-0154.pdf');

    // JONAS la reçoit : notification et signature
    await loginAs(page, 'Rudy Zerah');
    await go(page, 'proformas/PF-2026-HORIZO-01');
    await expect(page.locator('.page-head')).toContainText('À signer');
    await page.locator('.page-head').getByRole('button', { name: 'Signer' }).click();
    await page.getByRole('button', { name: 'Signer et tamponner' }).click();
    await expect(toast(page)).toContainText('PF-2026-HORIZO-01 signée et tamponnée');
    const pf = await page.evaluate(() => {
      const k = Object.keys(localStorage).find((x) => x.startsWith('jonas-buying-state'))!;
      return JSON.parse(localStorage.getItem(k)!).proformas.find((p: { id: string }) => p.id === 'PF-2026-HORIZO-01');
    });
    expect(pf.currency).toBe('USD');
    expect(pf.depositPct).toBe(40);
  });

  test('JONAS crée une proforma : le fournisseur la voit et dépose son document', async ({ page }) => {
    await loginAs(page, 'David');
    await go(page, 'proformas');
    await page.getByRole('button', { name: 'Nouvelle commande' }).click();
    const dlg = page.getByRole('dialog');
    await page.locator('#np-sup').fill('tide');
    await page.getByRole('option', { name: /Xiamen Tide Living/ }).click();
    await expect(page.locator('#np-sup')).toHaveValue('Xiamen Tide Living');
    await page.locator('#np-title').fill('Sabots enfant');
    await page.locator('#ln-prod-0').click();
    await page.getByRole('option').nth(1).click();
    await dlg.getByLabel('Quantité 1').fill('5000');
    await dlg.getByLabel('Prix unitaire 1').fill('2');
    await dlg.getByRole('button', { name: 'Passer la commande' }).click();
    await expect(toast(page)).toContainText('Commande PF-2026-0154 passée');
    await expect(page).toHaveURL(/proformas\/PF-2026-0154$/);
    await expect(page.locator('.page-head')).toContainText('À signer');

    await loginAs(page, 'Tide');
    await expect(page.locator('main')).toContainText('proforma(s) à déposer');
    await go(page, 'portail/proformas?pf=PF-2026-0154');
    await expect(page.locator('main')).toContainText('PF-2026-0154');
    await page.getByLabel('Déposer la proforma').setInputFiles({ name: 'PI-TIDE.pdf', mimeType: 'application/pdf', buffer: await pdf() });
    await expect(toast(page)).toContainText('Proforma v1 déposée');
  });
});

test('produit créé par une proforma : pack « À faire », puis « En cours » quand le designer commence', async ({ page }) => {
  await resetApp(page);
  await loginAs(page, 'David');
  await go(page, 'proformas');
  await page.getByRole('button', { name: 'Nouvelle commande' }).click();
  const dlg = page.getByRole('dialog');
  await page.locator('#np-sup').fill('tide');
  await page.getByRole('option', { name: /Xiamen Tide Living/ }).click();
  await page.locator('#np-title').fill('Tasses');
  await page.locator('#ln-prod-0').click();
  await page.getByRole('option', { name: /Nouveau produit/ }).click();
  await dlg.getByLabel('Désignation 1').fill('Mug léopard 350 ml');
  await dlg.getByLabel('Pcs/carton 1').fill('24');
  await dlg.getByLabel('m³/carton 1').fill('0.03');
  await dlg.getByLabel('Quantité 1').fill('7200');
  await dlg.getByLabel('Prix unitaire 1').fill('0.5');
  await dlg.getByRole('button', { name: 'Passer la commande' }).click();
  await expect(page).toHaveURL(/proformas\/PF-2026-0154$/);
  const created = () =>
    page.evaluate(() => {
      const k = Object.keys(localStorage).find((x) => x.startsWith('jonas-buying-state'))!;
      const st = JSON.parse(localStorage.getItem(k)!);
      const id = st.proformas.find((p: { id: string }) => p.id === 'PF-2026-0154').lines[0].productId;
      return st.products.find((p: { id: string }) => p.id === id);
    });
  const p = await created();
  expect(p.pack.validations.direction.state).toBe('todo');
  // Pas de marque ni de designer par défaut : à définir / à attribuer
  expect(p.brandId).toBe('');
  expect(p.pack.designer).toBe('À attribuer');
  await expect(page.locator('main')).toContainText('Pack à faire');
  // Le designer du produit appuie sur « Je commence maintenant »
  await page.evaluate((id) => {
    const k = Object.keys(localStorage).find((x) => x.startsWith('jonas-buying-state'))!;
    const st = JSON.parse(localStorage.getItem(k)!);
    st.products.find((x: { id: string }) => x.id === id).pack.startedAt = '2026-11-26T10:00';
    localStorage.setItem(k, JSON.stringify(st));
  }, p.id);
  await page.reload();
  await expect(page.locator('main')).toContainText('Pack en cours');
});

test('proforma signée par JONAS : les die cuts manquants passent en « Die cuts demandés » chez le fournisseur', async ({ page }) => {
  await resetApp(page);
  // PF-2026-0146 (Nova, à signer) : on retire le die cut de son produit puis le fournisseur dépose sa proforma
  const pid = await page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.startsWith('jonas-buying-state'))!;
    const st = JSON.parse(localStorage.getItem(k)!);
    const pf = st.proformas.find((x: { id: string }) => x.id === 'PF-2026-0146');
    const p = st.products.find((x: { id: string }) => x.id === pf.lines[0].productId);
    p.pack.dieCut = 'none';
    p.pack.files = (p.pack.files ?? []).filter((f: { kind: string }) => f.kind !== 'diecut');
    pf.versions = [{ version: 1, fileId: 'demo', name: 'PI-NOVA.pdf', size: 1000, type: 'application/pdf', uploadedAt: '2026-11-20T10:00', uploadedBy: 'Ms. Lin Yu', status: 'a_signer' }];
    localStorage.setItem(k, JSON.stringify(st));
    return p.id as string;
  });
  await page.reload();
  await signAsDirection(page, 'PF-2026-0146');
  const dieCut = await page.evaluate((id) => {
    const k = Object.keys(localStorage).find((x) => x.startsWith('jonas-buying-state'))!;
    return JSON.parse(localStorage.getItem(k)!).products.find((x: { id: string }) => x.id === id).pack.dieCut;
  }, pid);
  expect(dieCut).toBe('requested');
  await loginAs(page, 'Ms. Lin Yu');
  await go(page, 'portail/packs?vue=diecut');
  await expect(page.locator('.gallery')).toContainText(pid);
});

test('nouvelle commande : marque et designer du pack choisis pour les nouveaux produits', async ({ page }) => {
  await resetApp(page);
  await loginAs(page, 'David');
  await go(page, 'proformas');
  await page.getByRole('button', { name: 'Nouvelle commande' }).click();
  const dlg = page.getByRole('dialog');
  await page.locator('#np-sup').fill('tide');
  await page.getByRole('option', { name: /Xiamen Tide Living/ }).click();
  await page.locator('#np-title').fill('Tasses');
  await page.locator('#ln-prod-0').click();
  await page.getByRole('option', { name: /Nouveau produit/ }).click();
  await dlg.getByLabel('Désignation 1').fill('Mug léopard 350 ml');
  await dlg.getByLabel('Pcs/carton 1').fill('24');
  await dlg.getByLabel('m³/carton 1').fill('0.03');
  await dlg.getByLabel('Quantité 1').fill('7200');
  await dlg.getByLabel('Prix unitaire 1').fill('0.5');
  await page.locator('#np-brand').selectOption({ label: 'CAMILLE PARIS' });
  await page.locator('#np-designer').selectOption('ROLAND');
  await dlg.getByRole('button', { name: 'Passer la commande' }).click();
  await expect(page).toHaveURL(/proformas\/PF-2026-0154$/);
  const p = await page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.startsWith('jonas-buying-state'))!;
    const st = JSON.parse(localStorage.getItem(k)!);
    const id = st.proformas.find((x: { id: string }) => x.id === 'PF-2026-0154').lines[0].productId;
    return st.products.find((x: { id: string }) => x.id === id);
  });
  expect(p.brandId).toBe('camille');
  expect(p.pack.designer).toBe('ROLAND');
});
