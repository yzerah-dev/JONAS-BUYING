// Automatisation : un produit importé avec le texte anglais du fournisseur reçoit sa désignation
// et sa description longue en français (Claude simulé ici).
import { expect, go, loginAs, resetApp, test, toast } from './fixtures';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { claude: unknown; __frCalls: number };
    w.__frCalls = 0;
    w.claude = {
      use: async (name: string) =>
        name !== 'sample'
          ? null
          : {
              json: async (input: string) => {
                if (!input.includes('rédacteur produit')) return null; // lecture de proforma : non simulée
                w.__frCalls++;
                const items = JSON.parse(input.slice(input.lastIndexOf('Articles (JSON) :') + 'Articles (JSON) :'.length));
                return { items: items.map((i: { id: string }) => ({ id: i.id, name: 'Mug léopard 350 ml', fr: 'Mug en grès décoré léopard.\nContenance 350 ml, 2 modèles.' })) };
              },
            },
    };
  });
});

test('produit créé par une commande : désignation et description françaises posées automatiquement', async ({ page }) => {
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
  await dlg.getByLabel('Désignation 1').fill('350ml coffee mug with leopard decal, 2 designs MATERIAL: stoneware');
  await dlg.getByLabel('Pcs/carton 1').fill('24');
  await dlg.getByLabel('m³/carton 1').fill('0.03');
  await dlg.getByLabel('Quantité 1').fill('7200');
  await dlg.getByLabel('Prix unitaire 1').fill('0.52');
  await dlg.getByRole('button', { name: 'Passer la commande' }).click();
  await expect(page).toHaveURL(/proformas\/PF-2026-0154$/);
  const product = () =>
    page.evaluate(() => {
      const k = Object.keys(localStorage).find((x) => x.startsWith('jonas-buying-state'))!;
      const st = JSON.parse(localStorage.getItem(k)!);
      const id = st.proformas.find((p: { id: string }) => p.id === 'PF-2026-0154').lines[0].productId;
      return st.products.find((p: { id: string }) => p.id === id) as { id: string; name: string; description: { en: string; fr?: string } };
    });
  await expect.poll(async () => (await product()).description.fr).toBe('Mug en grès décoré léopard.\nContenance 350 ml, 2 modèles.');
  const p = await product();
  expect(p.name).toBe('Mug léopard 350 ml');
  // L'anglais du fournisseur est gardé tel quel
  expect(p.description.en).toBe('350ml coffee mug with leopard decal, 2 designs MATERIAL: stoneware');
  // Une seule demande : pas de boucle
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => (window as unknown as { __frCalls: number }).__frCalls)).toBe(1);
});

test('fiche produit : bouton « Générer le français »', async ({ page }) => {
  await resetApp(page);
  await loginAs(page, 'David');
  await go(page, 'produits/CP-T001');
  await page.getByRole('button', { name: 'Générer le français' }).first().click();
  await expect(toast(page)).toContainText('Français généré pour CP-T001');
  await expect(page.locator('main')).toContainText('Mug en grès décoré léopard.');
});
