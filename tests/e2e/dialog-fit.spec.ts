import { go, loginAs, resetApp, test, expect } from './fixtures';
// Beaucoup de lignes, petit écran : le bouton de validation doit rester visible
for (const [w, h] of [
  [1440, 760],
  [1920, 1000],
  [390, 700],
] as const) {
  test('nouvelle commande avec beaucoup de lignes : le bouton de validation reste à l’écran (' + w + 'px)', async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await resetApp(page);
    await loginAs(page, 'David');
    await go(page, 'proformas');
    await page.getByRole('button', { name: 'Nouvelle commande' }).click();
    const dlg = page.getByRole('dialog');
    for (let i = 0; i < 9; i++) await dlg.getByRole('button', { name: 'Ajouter une ligne' }).click();
    const btn = dlg.getByRole('button', { name: 'Passer la commande' });
    await expect(btn).toBeInViewport();
  });
}
