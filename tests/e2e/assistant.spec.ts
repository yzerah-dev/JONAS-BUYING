import { expect, go, loginAs, resetApp, test, toast } from './fixtures';
import type { Page } from '@playwright/test';

/**
 * Claude et Gmail simulés : le faux « sample » enchaîne les outils de la page comme le ferait Claude
 * (recherche Gmail → lecture → catalogue → brouillons par fournisseur), le faux « mcp » sert un e-mail B&M.
 */
async function fakeClaude(page: Page) {
  await page.addInitScript(() => {
    const email = {
      threads: [{ id: 't-bm-1', messages: [{ subject: 'Commande B&M gamme parfum', sender: 'buyer@bm.example', date: '2026-11-18T09:00:00Z', snippet: '10 000 de chaque' }] }],
    };
    const thread = {
      messages: [{ subject: 'Commande B&M gamme parfum', sender: 'buyer@bm.example', date: '2026-11-18T09:00:00Z', plaintextBody: 'Bonjour, merci de nous livrer la gamme parfum : 10 000 pièces de chaque référence. Cordialement, B&M' }],
    };
    const calls: string[] = [];
    (window as unknown as { __calls: string[] }).__calls = calls;
    const mcp = {
      callTool: async (server: string, tool: string) => {
        calls.push(`${server}:${tool}`);
        return { payload: tool === 'search_threads' ? email : thread };
      },
    };
    type Tool = { name: string; execute: (i: Record<string, unknown>, c: { signal: AbortSignal }) => unknown };
    const sample = async (_input: unknown, opts: { tools: Tool[]; onText?: (t: { text: string }) => void }) => {
      const tool = (n: string) => opts.tools.find((t) => t.name === n)!;
      const ctx = { signal: new AbortController().signal };
      const found = (await tool('gmail_search').execute({ query: 'B&M parfum newer_than:30d' }, ctx)) as { threadId: string }[];
      await tool('gmail_read').execute({ threadId: found[0].threadId }, ctx);
      const products = (await tool('find_products').execute({ query: 'parfum' }, ctx)) as { productId: string; supplierId: string }[];
      const bySup = new Map<string, string[]>();
      for (const p of products) bySup.set(p.supplierId, [...(bySup.get(p.supplierId) ?? []), p.productId]);
      for (const [supplierId, ids] of bySup)
        await tool('draft_order').execute({ supplierId, title: 'B&M – gamme parfum', lines: ids.map((productId) => ({ productId, qty: 20000 })) }, ctx);
      const text = `E-mail de B&M : gamme parfum, 10 000 de chaque. J'ai préparé ${bySup.size} brouillon(s) à 20 000 de chaque.`;
      opts.onText?.({ text });
      return { text };
    };
    (window as unknown as { claude: unknown }).claude = { use: async (n: string) => (n === 'sample' ? sample : n === 'mcp' ? mcp : null) };
  });
}

test('assistant : commande client B&M lue dans Gmail → commande fournisseur à 20 000 de chaque avec demande de proforma', async ({ page }) => {
  await fakeClaude(page);
  await resetApp(page);
  await loginAs(page, 'David');
  await go(page, 'proformas');
  await page.getByRole('button', { name: 'Assistant commandes' }).click();
  const panel = page.getByRole('dialog', { name: 'Assistant commandes' });
  await panel.getByLabel('Votre demande').fill('Regarde dans mes mails la commande B&M parfum, 10 000 de chaque, recommande 20 000 de chaque chez le fournisseur');
  await panel.getByRole('button', { name: 'Envoyer' }).click();
  await expect(panel).toContainText('brouillon(s) à 20 000 de chaque');
  await expect(panel).toContainText('Recherche dans Gmail : B&M parfum');
  await expect(panel).toContainText('Lecture de l’e-mail « Commande B&M gamme parfum »');
  expect(await page.evaluate(() => (window as unknown as { __calls: string[] }).__calls)).toEqual(['Gmail:search_threads', 'Gmail:get_thread']);

  const draft = panel.locator('.as-draft').first();
  await expect(draft).toContainText('B&M – gamme parfum');
  await expect(draft).toContainText('20');
  await draft.getByRole('button', { name: 'Créer la commande et demander la proforma' }).click();
  await expect(toast(page)).toContainText('Commande PF-2026-0154 créée : proforma demandée');
  await draft.getByRole('button', { name: /PF-2026-0154 créée — voir/ }).click();
  await expect(page).toHaveURL(/proformas\/PF-2026-0154$/);
  const pf = await page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.startsWith('jonas-buying-state'))!;
    return JSON.parse(localStorage.getItem(k)!).proformas.find((p: { id: string }) => p.id === 'PF-2026-0154');
  });
  expect(pf.order.source).toBe('ia');
  expect(pf.status).toBe('a_signer');
  expect(pf.lines.every((l: { qty: number }) => l.qty === 20000)).toBe(true);
});

test('assistant hors claude.ai : indique qu’il faut l’application publiée', async ({ page }) => {
  await resetApp(page);
  await loginAs(page, 'David');
  await page.getByRole('button', { name: 'Assistant commandes' }).click();
  const panel = page.getByRole('dialog', { name: 'Assistant commandes' });
  await panel.getByLabel('Votre demande').fill('Bonjour');
  await panel.getByRole('button', { name: 'Envoyer' }).click();
  await expect(panel).toContainText('fonctionne dans l’application publiée sur claude.ai');
});
