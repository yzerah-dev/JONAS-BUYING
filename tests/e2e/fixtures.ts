import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test as base, expect, type Locator, type Page } from '@playwright/test';

/**
 * Clé localStorage de l'app, lue dans la source (elle change à chaque migration du schéma).
 * Cherchée dans src/data (store.ts / store.tsx selon l'état du refactoring), sinon dans tout src/.
 */
export const STORAGE_KEY = (() => {
  const root = fileURLToPath(new URL('../../src/', import.meta.url));
  const files = readdirSync(root, { recursive: true, encoding: 'utf8' })
    .filter((f) => /\.tsx?$/.test(f))
    .sort((a, b) => Number(!a.startsWith('data')) - Number(!b.startsWith('data')));
  for (const f of files) {
    const m = readFileSync(join(root, f), 'utf8').match(/\bSTORAGE_KEY\s*=\s*['"]([^'"]+)['"]/);
    if (m) return m[1];
  }
  throw new Error('STORAGE_KEY introuvable dans src/');
})();

/**
 * Clé localStorage de la langue du portail fournisseur (absente si l'i18n n'existe pas).
 * Les scénarios sont écrits en français : on fige le portail en FR.
 */
export const LANG_STORAGE_KEY = (() => {
  const root = fileURLToPath(new URL('../../src/', import.meta.url));
  for (const f of readdirSync(root, { recursive: true, encoding: 'utf8' }).filter((x) => /\.tsx?$/.test(x))) {
    const m = readFileSync(join(root, f), 'utf8').match(/\bLANG_STORAGE_KEY\s*=\s*['"]([^'"]+)['"]/);
    if (m) return m[1];
  }
  return null;
})();

/** Navigation HashRouter : go(page, 'design') -> /#/design */
export async function go(page: Page, route = '') {
  const r = route.replace(/^\/+/, '');
  await page.goto('/#/' + r);
  if (!r) return;
  // Une redirection encore en cours (connexion, page d'accueil du rôle) peut écraser la navigation : on vérifie la route
  const want = '#/' + r.split('?')[0];
  // … y compris juste après : on revérifie que la page reste sur la route demandée
  for (let i = 0; i < 4; i++) {
    await expect(async () => {
      if (!page.url().includes(want)) await page.goto('/#/' + r);
      expect(page.url()).toContain(want);
    }).toPass({ timeout: 10_000 });
    await page.waitForTimeout(150);
    if (page.url().includes(want)) return;
  }
}

/** État propre : vide le localStorage (sauf langue FR) puis recharge (données réinitialisées depuis le seed). */
export async function resetApp(page: Page, route = '') {
  await go(page);
  await page.evaluate((langKey) => {
    localStorage.clear();
    if (langKey) localStorage.setItem(langKey, 'fr');
  }, LANG_STORAGE_KEY);
  await page.reload();
  await expect(page.locator('main')).toBeVisible();
  if (route) await go(page, route);
  await expect(page.locator('main')).toBeVisible();
}

/** Connexion via le sélecteur d'utilisateur du header. */
export async function loginAs(page: Page, name: string) {
  await page.locator('.role-btn').click();
  await page.locator('.menu-row', { hasText: name }).first().click();
  await expect(page.locator('.menu-row')).toHaveCount(0);
}

/**
 * Connexion en écrivant currentUserId dans l'état persistant, puis chargement complet de `route`
 * (évite qu'une redirection de la page précédente n'écrase la navigation suivante).
 */
export async function setUser(page: Page, userId: string, route = '') {
  await page.evaluate(
    ([key, id]) => {
      const s = JSON.parse(localStorage.getItem(key) || 'null');
      if (!s) throw new Error('état absent du localStorage');
      s.currentUserId = id;
      localStorage.setItem(key, JSON.stringify(s));
    },
    [STORAGE_KEY, userId] as const,
  );
  // Chargement complet (la query change le document) directement sur la route cible :
  // une simple navigation par hash laisserait l'app, encore connectée avec l'ancien
  // utilisateur, rediriger ailleurs avant le rechargement.
  await page.goto(`/?as=${encodeURIComponent(userId)}#/${route.replace(/^\/+/, '')}`);
  await expect(page.locator('main')).toBeVisible();
}

export const toast = (page: Page) => page.locator('.toast');

/** Texte de la barre latérale, une entrée par ligne non vide. */
export async function sidebarItems(page: Page) {
  const txt = await page.locator('.sidebar').innerText();
  return txt
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Dernier entier d'un texte (« Validés\n78 » -> 78, « 3 120 » non géré volontairement). */
export function lastInt(text: string) {
  const m = text.match(/(\d+)\D*$/);
  if (!m) throw new Error(`aucun nombre dans « ${text} »`);
  return Number(m[1]);
}

/** Compteur d'un filtre-puce (.pk-chip) de l'Espace Designer. */
export async function chipCount(page: Page, label: string) {
  return lastInt(await page.locator('.pk-chip', { hasText: label }).first().innerText());
}

/** Case du planning designers × semaines de l'Espace Designer. */
export async function planCell(page: Page, designer: string, week: string): Promise<Locator> {
  // Le planning de charge est replié par défaut : on l'ouvre
  if (!(await page.locator('.pk-plan').isVisible())) await page.getByRole('button', { name: 'Planning de charge' }).click();
  await page.locator('.pk-plan thead th').nth(1).waitFor();
  const heads = await page.locator('.pk-plan thead th').allInnerTexts();
  const idx = heads.findIndex((t) => t.includes(week));
  if (idx < 1) throw new Error(`semaine ${week} absente du planning (${heads.join(' | ')})`);
  return page
    .locator('.pk-plan tbody tr', { hasText: designer })
    .locator('td')
    .nth(idx - 1)
    .locator('.pk-cell');
}

/** Nombre total de packs d'une case du planning (« 5/47 » -> 47). */
export async function planTotal(cell: Locator) {
  const t = (await cell.locator('.pk-cell-n').innerText()).replace(/\s/g, '');
  const m = t.match(/\/(\d+)/);
  if (!m) throw new Error(`case illisible : ${t}`);
  return Number(m[1]);
}

/** Référence (ex. TR-N492) d'une ligne de pack. */
export async function packRef(row: Locator) {
  return (await row.locator('.pk-id b').innerText()).trim();
}

/** Aucun débordement horizontal : la page ne doit pas défiler latéralement. */
export async function expectNoHorizontalOverflow(page: Page) {
  const width = page.viewportSize()!.width;
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth), {
      message: `scrollWidth doit valoir ${width} (${page.url()})`,
    })
    .toBe(width);
}

/** Test étendu : échoue si la page lève une exception JS non capturée. */
export const test = base.extend<{ pageErrors: string[] }>({
  pageErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await use(errors);
      expect(errors, 'erreurs JS non capturées').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** JONAS (Direction) signe la proforma : réf. et EAN JONAS attribués aux produits créés depuis le portail */
export async function signAsDirection(page: Page, pfId: string) {
  await loginAs(page, 'Rudy Zerah');
  await go(page, `proformas/${pfId}`);
  await page.locator('.page-head').getByRole('button', { name: 'Signer' }).click();
  await page.getByRole('button', { name: 'Signer et tamponner' }).click();
  await expect(toast(page)).toContainText(`${pfId} signée et tamponnée`);
}
