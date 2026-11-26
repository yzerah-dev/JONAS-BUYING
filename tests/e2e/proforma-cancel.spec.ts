// Annuler (rétablissable) ou supprimer définitivement une proforma
import { expect, go, loginAs, resetApp, test, toast } from './fixtures';

const state = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.startsWith('jonas-buying-state'))!;
    return JSON.parse(localStorage.getItem(k)!) as {
      proformas: { id: string; cancelled?: { reason: string } }[];
      containers: { allocations: { proformaId: string }[] }[];
      journal: { text: string }[];
    };
  });

test('annuler une proforma (motif obligatoire), la retrouver dans « Annulées », la rétablir', async ({ page }) => {
  await resetApp(page);
  await loginAs(page, 'David');
  await go(page, 'proformas/PF-2026-0146');
  await page.getByRole('button', { name: 'Annuler', exact: true }).click();
  const dlg = page.getByRole('dialog', { name: 'Annuler PF-2026-0146' });
  await expect(dlg.getByRole('button', { name: 'Annuler la proforma' })).toBeDisabled();
  await dlg.getByLabel('Motif de l’annulation *').fill('Commande remplacée par une nouvelle proforma');
  await dlg.getByRole('button', { name: 'Annuler la proforma' }).click();
  await expect(toast(page)).toContainText('PF-2026-0146 annulée');
  await expect(page).toHaveURL(/#\/proformas$/);
  // Sortie des listes, rangée dans « Annulées »
  await expect(page.locator('main')).not.toContainText('PF-2026-0146');
  const st = await state(page);
  expect(st.proformas.find((p) => p.id === 'PF-2026-0146')!.cancelled!.reason).toBe('Commande remplacée par une nouvelle proforma');
  expect(st.containers.some((c) => c.allocations.some((a) => a.proformaId === 'PF-2026-0146'))).toBe(false);
  await page.getByRole('button', { name: /Annulées/ }).click();
  await page.locator('tr', { hasText: 'PF-2026-0146' }).click();
  await expect(page.locator('main')).toContainText('Motif : Commande remplacée par une nouvelle proforma');
  // L'acheteur ne supprime pas définitivement
  await expect(page.getByRole('button', { name: 'Supprimer la proforma' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Rétablir' }).click();
  await expect(toast(page)).toContainText('PF-2026-0146 rétablie');
  await expect(page.locator('.page-head')).not.toContainText('Annulée');
  await go(page, 'proformas');
  await expect(page.locator('main')).toContainText('PF-2026-0146');
});

test('supprimer définitivement une proforma (Direction), avec confirmation', async ({ page }) => {
  await resetApp(page);
  await loginAs(page, 'Rudy Zerah');
  await go(page, 'proformas/PF-2026-0146');
  await page.getByRole('button', { name: 'Supprimer la proforma' }).click();
  const dlg = page.getByRole('dialog', { name: 'Supprimer PF-2026-0146' });
  await expect(dlg.getByRole('button', { name: 'Supprimer définitivement' })).toBeDisabled();
  await dlg.getByLabel(/Je confirme la suppression/).check();
  await dlg.getByRole('button', { name: 'Supprimer définitivement' }).click();
  await expect(toast(page)).toContainText('PF-2026-0146 supprimée');
  const st = await state(page);
  expect(st.proformas.some((p) => p.id === 'PF-2026-0146')).toBe(false);
  expect(st.journal[0].text).toBe('Proforma supprimée définitivement');
  await go(page, 'proformas/PF-2026-0146');
  await expect(page.locator('main')).toContainText('Proforma introuvable');
});

test('une proforma en transit ne peut plus être annulée', async ({ page }) => {
  await resetApp(page);
  await loginAs(page, 'Rudy Zerah');
  await go(page, 'proformas/PF-2026-0139');
  await expect(page.getByRole('button', { name: 'Annuler', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Supprimer la proforma' })).toHaveCount(0);
});
