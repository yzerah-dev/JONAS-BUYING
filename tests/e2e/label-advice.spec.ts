// Avis d'étiquetage (Claude) : onglet « Étiquetage » du pack et fiche produit
import { expect, go, loginAs, resetApp, test } from './fixtures';

const ADVICE = {
  at: '2026-11-27T10:00:00Z',
  by: 'David',
  withPhoto: true,
  product: 'Gourde isotherme 500 ml, motif léopard, bouchon à vis.',
  category: 'Matériau au contact des denrées alimentaires',
  summary: 'Article au contact alimentaire : symbole verre-fourchette, identification de l’importateur et consignes d’utilisation en français.',
  regulations: [{ name: 'Règlement (CE) 1935/2004', why: 'Matériaux au contact des denrées alimentaires' }],
  mentions: [{ text: 'Importé par JONAS INTERNATIONAL, 189 rue d’Aubervilliers, 75018 Paris', detail: 'Sur le pack', required: true }],
  pictos: [{ name: 'Verre-fourchette', detail: 'Sur le pack ou le produit', required: true }],
  warnings: ['Ne pas passer au micro-ondes.'],
  checks: ['Déclaration de conformité contact alimentaire du fournisseur'],
};

test('pack : onglet Étiquetage avec l’avis de Claude (mentions, pictos, avertissements)', async ({ page }) => {
  await resetApp(page);
  await loginAs(page, 'David');
  await page.evaluate((advice) => {
    const k = Object.keys(localStorage).find((x) => x.startsWith('jonas-buying-state'))!;
    const s = JSON.parse(localStorage.getItem(k)!);
    s.products.find((p: { ref: string }) => p.ref === 'JO-N370').labelAdvice = advice;
    localStorage.setItem(k, JSON.stringify(s));
  }, ADVICE);
  await go(page, 'design');
  await page.reload();
  await page.locator('.pk-row', { hasText: 'JO-N370' }).first().click();
  await page.getByRole('button', { name: /^Étiquetage/ }).click();
  const la = page.locator('.la:not(.pc)');
  await expect(la).toContainText('Matériau au contact des denrées alimentaires');
  await expect(la).toContainText('Verre-fourchette');
  await expect(la).toContainText('Ne pas passer au micro-ondes.');
  await expect(la.getByRole('button', { name: 'Refaire l’analyse' })).toBeVisible();

  // Fiche produit, onglet Design & Pack : même avis
  await go(page, 'produits/JO-N370');
  await page.getByRole('button', { name: 'Design & Pack' }).click();
  await expect(page.locator('.la:not(.pc)')).toContainText('Verre-fourchette');
});

test('contrôle du pack par Claude : verdict et points affichés sous l’avis d’étiquetage', async ({ page }) => {
  await resetApp(page);
  await loginAs(page, 'David');
  await page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.startsWith('jonas-buying-state'))!;
    const s = JSON.parse(localStorage.getItem(k)!);
    const p = s.products.find((x: { ref: string }) => x.ref === 'JO-N370');
    p.pack.files = [{ id: 'f1', kind: 'pack', name: 'pack-v1.pdf', path: 'pack-v1.pdf', size: 1000, type: 'application/pdf', version: 1, uploadedAt: '2026-11-27' }];
    p.packCheck = {
      at: '2026-11-27T10:00:00Z',
      by: 'David',
      version: 1,
      files: ['pack-v1.pdf'],
      verdict: 'a_corriger',
      summary: 'Triman absent et adresse de l’importateur incomplète.',
      checks: [
        { item: 'Triman + Info-tri', status: 'manquant', detail: 'À ajouter au dos' },
        { item: 'Textes en français', status: 'ok', detail: 'Présents' },
      ],
      texts: [{ found: 'Importe par JONAS', fix: 'Importé par JONAS INTERNATIONAL, 189 rue d’Aubervilliers, 75018 Paris' }],
    };
    localStorage.setItem(k, JSON.stringify(s));
  });
  await go(page, 'produits/JO-N370');
  await page.reload();
  await page.getByRole('button', { name: 'Design & Pack' }).click();
  const pc = page.locator('.pc');
  await expect(pc.locator('.pc-verdict')).toContainText('À corriger');
  await expect(pc).toContainText('Triman + Info-tri');
  await expect(pc).toContainText('Manquant');
  await expect(pc).toContainText('Importé par JONAS INTERNATIONAL');
  await expect(pc.getByRole('button', { name: 'Contrôler le pack v1 avec Claude' })).toBeVisible();
});
