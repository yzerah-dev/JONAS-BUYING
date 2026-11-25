// Synchronisation avec la base partagée : on n'envoie que ce qui change, et on applique les changements reçus.
import { expect, test } from '@playwright/test';
import { load, reducer } from '../../src/data/store';
import { applyRemoteChange, diffState, fromDocs, toDocs } from '../../src/data/remote';

test('aller-retour état ↔ documents sans perte', () => {
  const s = load();
  const back = fromDocs(toDocs(s), { ...s, products: [], proformas: [], containers: [] });
  expect(back.products).toEqual(s.products);
  expect(back.proformas).toEqual(s.proformas);
  expect(back.containers).toEqual(s.containers);
  expect(back.settings).toEqual(s.settings);
});

test('une action n’envoie que les objets modifiés (et l’entrée de journal)', () => {
  const s = { ...load(), currentUserId: 'direction' };
  const next = reducer(s, { type: 'signProforma', id: 'PF-2026-0146', etdWanted: '2026-12-09' });
  const { upserts, deletes } = diffState(s, next);
  expect(deletes).toEqual([]);
  expect(upserts.map((d) => `${d.collection}:${d.collection === 'journal' ? 'entrée' : d.id}`).sort()).toEqual(['journal:entrée', 'proformas:PF-2026-0146']);
});

test('suppression et changements reçus d’un autre utilisateur', () => {
  const s = { ...load(), currentUserId: 'david' };
  const pf = s.proformas.find((p) => p.id === 'PF-2026-0148')!;
  const changed = applyRemoteChange(s, { collection: 'proformas', id: pf.id, data: { ...pf, title: 'Modifié ailleurs' } });
  expect(changed.proformas.find((p) => p.id === pf.id)!.title).toBe('Modifié ailleurs');
  expect(changed.products).toBe(s.products);
  const removed = applyRemoteChange(changed, { collection: 'proformas', id: pf.id, data: null });
  expect(removed.proformas.some((p) => p.id === pf.id)).toBe(false);
  expect(diffState(changed, removed).deletes).toEqual([{ collection: 'proformas', id: pf.id }]);
});

test('journal en ajout seul : jamais de suppression envoyée', () => {
  const s = { ...load(), currentUserId: 'direction' };
  const trimmed = { ...s, journal: s.journal.slice(1) };
  expect(diffState(s, trimmed).deletes).toEqual([]);
});

test('retour du lien e-mail : code lu, adresse nettoyée sans casser le HashRouter, messages clairs', async () => {
  const { authMessage, cleanAuthUrl, readAuthReturn, UNKNOWN_ADDRESS } = await import('../../src/lib/authReturn');
  expect(readAuthReturn('https://jonas-buying.vercel.app/?code=abc#/')).toEqual({ hadCode: true, error: '' });
  expect(cleanAuthUrl('https://jonas-buying.vercel.app/?code=abc#/proformas')).toBe('/#/proformas');
  expect(cleanAuthUrl('https://jonas-buying.vercel.app/?code=abc')).toBe('/');
  const expired = 'https://jonas-buying.vercel.app/?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired';
  expect(readAuthReturn(expired).error).toBe('Email link is invalid or has expired');
  expect(cleanAuthUrl(expired)).toBe('/');
  expect(readAuthReturn('https://jonas-buying.vercel.app/#error=access_denied&error_description=expired').error).toBe('expired');
  expect(readAuthReturn('https://jonas-buying.vercel.app/#/proformas')).toEqual({ hadCode: false, error: '' });
  expect(authMessage({ code: 'otp_disabled', message: 'Signups not allowed for otp' }, false)).toBe(UNKNOWN_ADDRESS);
  expect(authMessage({ code: 'invalid_credentials', message: 'Invalid login credentials' }, true)).toMatch(/mot de passe incorrect/);
  expect(authMessage({ message: 'For security purposes, you can only request this after 42 seconds.', status: 429 }, false)).toMatch(/patientez/);
});
