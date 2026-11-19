import { expect, go, loginAs, resetApp, test, toast } from './fixtures';
import type { Page } from '@playwright/test';

type Pf = { id: string; supplierId: string; status: string; date: string; currency?: string; order?: { source: string }; lines: { productId: string; qty: number; price: number }[] };
const proformas = (page: Page) =>
  page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.startsWith('jonas-buying-state'))!;
    return JSON.parse(localStorage.getItem(k)!).proformas as Pf[];
  });
/** Dernière ligne signée d'un produit (même règle que l'application, devises identiques en démo) */
const lastPrice = (pfs: Pf[], productId: string) =>
  pfs
    .filter((p) => p.status !== 'a_signer' && p.lines.some((l) => l.productId === productId))
    .sort((a, b) => b.date.localeCompare(a.date))[0]
    .lines.find((l) => l.productId === productId)!.price;

async function openAssistant(page: Page) {
  await loginAs(page, 'David');
  await go(page, 'proformas');
  await page.getByRole('button', { name: 'Assistant commandes' }).click();
  return page.getByRole('dialog', { name: 'Assistant commandes' });
}
async function say(panel: ReturnType<Page['getByRole']>, text: string) {
  await panel.getByLabel('Votre demande').fill(text);
  await panel.getByRole('button', { name: 'Envoyer' }).click();
}

test.describe('Assistant commandes', () => {
  test.beforeEach(async ({ page }) => {
    await resetApp(page);
  });

  test('« passe la commande de 10 000 JO-R301 » → commande chez son fournisseur au dernier prix payé', async ({ page }) => {
    const before = await proformas(page);
    const panel = await openAssistant(page);
    await say(panel, 'Passe la commande de 10 000 JO-R301');
    await expect(panel).toContainText('commande PF-2026-0154 passée au dernier prix payé');
    await expect(toast(page)).toContainText('Commande PF-2026-0154 passée');
    const card = panel.locator('.as-draft');
    await expect(card).toContainText('Northbay');
    await expect(card).toContainText('dernier prix payé : PF-2026-0145');
    const pf = (await proformas(page)).find((p) => p.id === 'PF-2026-0154')!;
    expect(pf).toMatchObject({ supplierId: 'northbay', status: 'a_signer', order: { source: 'ia' } });
    expect(pf.lines).toHaveLength(1);
    expect(pf.lines[0]).toMatchObject({ productId: 'JO-R301', qty: 10000 });
    expect(pf.lines[0].price).toBeCloseTo(lastPrice(before, 'JO-R301'), 4);

    // Annulable tant que le fournisseur n'a rien déposé
    await card.getByRole('button', { name: 'Annuler' }).click();
    await expect(toast(page)).toContainText('Commande PF-2026-0154 annulée');
    expect((await proformas(page)).some((p) => p.id === 'PF-2026-0154')).toBe(false);
  });

  test('plusieurs articles de fournisseurs différents : une commande par fournisseur, avec date de départ', async ({ page }) => {
    const panel = await openAssistant(page);
    await say(panel, 'Commande 5 000 CP-T001 et 3k PF-P014, départ le 15/01/2027');
    await expect(panel).toContainText('2 commandes passées');
    const pfs = await proformas(page);
    const a = pfs.find((p) => p.id === 'PF-2026-0154')!;
    const b = pfs.find((p) => p.id === 'PF-2026-0155')!;
    expect([a.supplierId, b.supplierId].sort()).toEqual(['nova', 'tide']);
    expect([...a.lines, ...b.lines].map((l) => [l.productId, l.qty]).sort()).toEqual([
      ['CP-T001', 5000],
      ['PF-P014', 3000],
    ]);
    expect(pfs.find((p) => p.id === 'PF-2026-0154')).toMatchObject({ etd: '2027-01-15' });
  });

  test('référence inconnue : rien n’est commandé', async ({ page }) => {
    const n = (await proformas(page)).length;
    const panel = await openAssistant(page);
    await say(panel, 'Passe la commande de 10 000 KF032');
    await expect(panel).toContainText('Je ne trouve pas KF032');
    expect((await proformas(page)).length).toBe(n);
  });

  test('stock bas d’un fournisseur et commandes en cours (Claude simulé)', async ({ page }) => {
    await page.addInitScript(() => {
      type Tool = { name: string; execute: (i: Record<string, unknown>, c: { signal: AbortSignal }) => unknown };
      const sample = async (_input: unknown, opts: { tools: Tool[] }) => {
        const low = (await opts.tools.find((x) => x.name === 'low_stock')!.execute({ supplier: 'horizon', threshold: 1000 }, { signal: new AbortController().signal })) as {
          supplier: string;
          products: { ref: string; stock: number; source: string; openOrders: { order: string }[] }[];
        };
        (window as unknown as { __low: unknown }).__low = low;
        const text = `${low.supplier} : ${low.products.length} produit(s) sous 1 000 pcs\n` + low.products.map((p) => `- ${p.ref} : ${p.stock} pcs (${p.source}) · ${p.openOrders.length ? p.openOrders.map((o) => o.order).join(', ') : 'aucune commande en cours'}`).join('\n');
        return { text };
      };
      (window as unknown as { claude: unknown }).claude = { use: async (n: string) => (n === 'sample' ? sample : null) };
    });
    await resetApp(page);
    const panel = await openAssistant(page);
    await say(panel, 'Dis-moi les produits de chez Horizon où il me reste moins de 1000 pcs, et regarde s’il y a des commandes en cours');
    await expect(panel).toContainText('Ningbo Horizon Home');
    const low = (await page.evaluate(() => (window as unknown as { __low: unknown }).__low)) as { products: { ref: string; stock: number; source: string; openOrders: { order: string }[] }[] };
    expect(low.products.length).toBeGreaterThan(0);
    expect(low.products.every((p) => p.stock < 1000 && p.source === 'plateforme')).toBe(true);
    // JO-J201 est sur PF-2026-0148 (en développement) : commande en cours repérée
    const j201 = low.products.find((p) => p.ref === 'JO-J201');
    if (j201) expect(j201.openOrders.map((o) => o.order)).toContain('PF-2026-0148');
    await expect(panel).toContainText('pcs (plateforme)');
  });
});
