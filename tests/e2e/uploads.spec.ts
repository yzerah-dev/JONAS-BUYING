import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import JSZip from 'jszip';
import { expect, go, loginAs, packRef, planCell, resetApp, test, toast } from './fixtures';

/** PNG RGB valide (couleur unie) généré à la volée — aucun binaire versionné. */
function png(size: number, rgb: [number, number, number]) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // profondeur
  ihdr[9] = 2; // RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: size }, () => rgb).flat())]);
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function makeFixtures(root: string) {
  const folder = join(root, 'Dossier crea AB');
  mkdirSync(join(folder, 'Rendus'), { recursive: true });
  mkdirSync(join(folder, 'Sources'), { recursive: true });
  writeFileSync(join(root, 'pack_v1.ai'), Buffer.alloc(120_017, 1));
  writeFileSync(join(root, 'pack_v2.ai'), Buffer.alloc(150_020, 2));
  writeFileSync(join(folder, 'brief.txt'), 'brief du pack\n');
  writeFileSync(join(folder, 'Sources', 'pack_AB.psd'), 'faux fichier psd');
  writeFileSync(join(folder, 'Rendus', 'vue-face.png'), png(64, [200, 40, 40]));
  writeFileSync(join(folder, 'Rendus', 'vue-dos.png'), png(64, [40, 40, 200]));
  return { v1: join(root, 'pack_v1.ai'), v2: join(root, 'pack_v2.ai'), folder };
}

let tmp: string;
test.beforeAll(() => {
  // Chemin ASCII hors test-results : les accents du titre du test cassent setInputFiles.
  tmp = mkdtempSync(join(tmpdir(), 'jb-e2e-'));
});
test.afterAll(() => rmSync(tmp, { recursive: true, force: true }));

test('upload du pack (versions) et du dossier créa, téléchargements et persistance', async ({ page }) => {
  const files = makeFixtures(tmp);

  await resetApp(page);
  await loginAs(page, 'ABIR');
  await go(page, 'design');
  const cell = await planCell(page, 'ABIR', 'S48');
  await cell.click();
  const row = page.locator('.pk-row').first();
  const ref = await packRef(row);
  await row.click();

  const panel = page.locator('.pf-files');
  await panel.getByLabel('Déposer : Pack', { exact: true }).setInputFiles(files.v1);
  await expect(panel).toContainText('pack_v1.ai');
  await panel.getByLabel('Déposer : Pack', { exact: true }).setInputFiles(files.v2);
  await expect(panel.getByRole('region', { name: 'Pack', exact: true })).toContainText('V2');
  await panel.getByLabel('Déposer un dossier : Dossier pack').setInputFiles(files.folder);
  await expect(toast(page)).toHaveText('4 fichier(s) ajouté(s) : Dossier pack');

  await expect(panel).toContainText('pack_v2.ai');
  await expect(panel.getByRole('region', { name: 'Dossier pack' })).toContainText('4 fichier(s)');
  await expect(panel).toContainText('Dossier crea AB/Rendus');
  await expect(page.locator('.pf-file-thumb')).toHaveCount(2);
  // Le pack déposé passe en attente de validation
  await expect(page.locator('.pk-row', { hasText: ref }).locator('.pk-c-st')).toContainText('À valider');

  // Téléchargement de la version courante
  const [single] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('.pf-current .icon-btn[title=Télécharger]').click(),
  ]);
  expect(single.suggestedFilename()).toBe('pack_v2.ai');
  expect(statSync(await single.path()).size).toBe(statSync(files.v2).size);

  // Téléchargement de l'ensemble en zip
  const [zip] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Tout télécharger/ }).click()]);
  expect(zip.suggestedFilename()).toBe(`${ref}_dossier_pack.zip`);
  const z = await JSZip.loadAsync(readFileSync(await zip.path()));
  const entries = Object.keys(z.files).filter((k) => !k.endsWith('/'));
  expect(entries).toEqual(
    expect.arrayContaining([
      '4 - Pack/pack_v2.ai',
      '5 - Dossier pack/Dossier crea AB/brief.txt',
      '5 - Dossier pack/Dossier crea AB/Rendus/vue-face.png',
      '5 - Dossier pack/Dossier crea AB/Rendus/vue-dos.png',
      '5 - Dossier pack/Dossier crea AB/Sources/pack_AB.psd',
    ]),
  );

  // Persistance après rechargement
  await page.reload();
  await (await planCell(page, 'ABIR', 'S48')).click();
  await page.locator('.pk-row', { hasText: ref }).click();
  await expect(page.locator('.pf-file')).toHaveCount(6);
  await expect(page.locator('.pf-file-thumb')).toHaveCount(2);

  // Une autre designer : lecture seule (téléchargement possible)
  await loginAs(page, 'ALEX PANDA');
  await go(page, 'design');
  await (await planCell(page, 'ABIR', 'S48')).click();
  await page.locator('.pk-row', { hasText: ref }).click();
  await expect(panel.locator('[title=Télécharger]')).toHaveCount(6);
  await expect(panel.locator('.btn', { hasText: /Uploader|Nouvelle version|Ajouter/ })).toHaveCount(0);
  await expect(panel.locator('.danger-ico')).toHaveCount(0);
});
