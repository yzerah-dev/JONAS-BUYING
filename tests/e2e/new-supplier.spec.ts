// Créer un fournisseur : depuis la page Fournisseurs et depuis « Nouvelle commande »
import { expect, go, loginAs, resetApp, test, toast } from './fixtures';

test('nouveau fournisseur depuis la page Fournisseurs', async ({ page }) => {
  await resetApp(page);
  await loginAs(page, 'David');
  await go(page, 'fournisseurs');
  await page.getByRole('button', { name: 'Nouveau fournisseur' }).click();
  const dlg = page.getByRole('dialog', { name: 'Nouveau fournisseur' });
  // Doublon refusé
  await dlg.getByLabel('Raison sociale *').fill('Xiamen Tide Living');
  await expect(dlg).toContainText('Ce fournisseur existe déjà.');
  await expect(dlg.getByRole('button', { name: 'Créer le fournisseur' })).toBeDisabled();
  await dlg.getByLabel('Raison sociale *').fill('Hanoi Bamboo Craft');
  await dlg.getByLabel('Pays').selectOption('Vietnam');
  await dlg.getByLabel('Ville').fill('Hanoï');
  await dlg.getByLabel('Port de départ').fill('Haiphong');
  await dlg.getByLabel('Nom', { exact: true }).fill('Linh');
  await dlg.getByLabel('E-mail').fill('linh@bamboo.example');
  await dlg.getByLabel('Devise').selectOption('USD');
  await dlg.getByLabel('Acompte (%)').fill('40');
  await dlg.getByRole('button', { name: 'Créer le fournisseur' }).click();
  await expect(toast(page)).toContainText('Fournisseur créé : Hanoi Bamboo Craft');
  await expect(page).toHaveURL(/fournisseurs\/hanoibamboocraft$/);
  await go(page, 'fournisseurs');
  await expect(page.locator('main')).toContainText('Hanoi Bamboo Craft');
  const sup = await page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.startsWith('jonas-buying-state'))!;
    return JSON.parse(localStorage.getItem(k)!).suppliers.find((s: { id: string }) => s.id === 'hanoibamboocraft');
  });
  expect(sup).toMatchObject({ country: 'Vietnam', flag: '🇻🇳', port: 'Haiphong', contact: { name: 'Linh' }, terms: { currency: 'USD', depositPct: 40 } });
});

test('nouveau fournisseur créé depuis « Nouvelle commande » : il est sélectionné', async ({ page }) => {
  await resetApp(page);
  await loginAs(page, 'David');
  await go(page, 'proformas');
  await page.getByRole('button', { name: 'Nouvelle commande' }).click();
  await page.getByRole('button', { name: 'Créer un nouveau fournisseur' }).click();
  const dlg = page.getByRole('dialog', { name: 'Nouveau fournisseur' });
  await dlg.getByLabel('Raison sociale *').fill('Dhaka Knit Ltd');
  await dlg.getByLabel('Pays').selectOption('Bangladesh');
  await dlg.getByRole('button', { name: 'Créer le fournisseur' }).click();
  await expect(dlg).toHaveCount(0);
  // La commande est toujours ouverte, avec le nouveau fournisseur choisi
  await expect(page.locator('#np-sup')).toHaveValue('Dhaka Knit Ltd');
});

test('un fournisseur ou un designer ne peut pas créer de fournisseur', async ({ page }) => {
  await resetApp(page);
  await loginAs(page, 'ABIR');
  await go(page, 'fournisseurs');
  await expect(page.getByRole('button', { name: 'Nouveau fournisseur' })).toHaveCount(0);
});
