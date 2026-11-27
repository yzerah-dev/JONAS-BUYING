// Plan de chargement : export Excel et envoi au fournisseur (démo : e-mail préparé avec l'Excel joint)
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { expect, go, loginAs, resetApp, test, toast } from './fixtures';

test('plan de chargement : télécharger l’Excel et l’envoyer au fournisseur', async ({ page }) => {
  await resetApp(page);
  await loginAs(page, 'David');
  await go(page, 'proformas/PF-2026-0143');
  await page.getByRole('button', { name: 'Suivi & Logistique' }).click();
  const panel = page
    .locator('.card')
    .filter({ has: page.getByRole('button', { name: 'Télécharger le plan (Excel)' }) })
    .first();
  const dl = page.waitForEvent('download');
  await panel.getByRole('button', { name: 'Télécharger le plan (Excel)' }).click();
  const file = await dl;
  expect(file.suggestedFilename()).toMatch(/^Plan de chargement .+\.xlsx$/);
  const wb = XLSX.read(readFileSync((await file.path())!));
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1 });
  expect(String(rows[0][0])).toContain('PLAN DE CHARGEMENT');
  expect(rows.some((r) => r[0] === 'TOTAL')).toBe(true);

  await panel.getByRole('button', { name: 'Envoyer le plan au fournisseur' }).click();
  await expect(toast(page)).toContainText('Plan de chargement envoyé');
  const card = page.locator('.mo-card').first();
  await expect(card).toContainText('E-mail préparé');
  await card.getByRole('button', { name: /Voir l’e-mail/ }).click();
  const dlg = page.getByRole('dialog', { name: 'Aperçu de l’e-mail' });
  await expect(dlg.locator('h2')).toContainText('Loading plan');
  await expect(dlg.locator('.mo-file')).toContainText('Plan de chargement');
});
