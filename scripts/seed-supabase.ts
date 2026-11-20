// Reprise des données dans la base partagée Supabase, et création des comptes.
//
//   npx tsx scripts/seed-supabase.ts --dump            → écrit les documents dans supabase/seed-docs.json (sans réseau)
//   npx tsx scripts/seed-supabase.ts --docs            → envoie les documents (produits, proformas, conteneurs…)
//   npx tsx scripts/seed-supabase.ts --members FICHIER → crée les comptes (e-mail ↔ utilisateur de l'application)
//
// Variables : SUPABASE_URL (défaut : projet JONAS BUYING), SUPABASE_SERVICE_KEY (clé secrète ; dans cet
// environnement le proxy peut l'ajouter lui-même à l'en-tête apikey).
import { readFileSync, writeFileSync } from 'node:fs';
import { load } from '../src/data/store';
import { toDocs } from '../src/data/remote';

const URL = process.env.SUPABASE_URL ?? 'https://szfopimewgercpkwtylu.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_KEY ?? 'injected-by-proxy';
const headers: Record<string, string> = { apikey: KEY, 'Content-Type': 'application/json' };
if (process.env.SUPABASE_SERVICE_KEY?.startsWith('eyJ')) headers.Authorization = `Bearer ${KEY}`;

async function call(path: string, init: RequestInit) {
  const r = await fetch(`${URL}${path}`, { ...init, headers: { ...headers, ...(init.headers as Record<string, string>) } });
  const text = await r.text();
  if (!r.ok) throw new Error(`${init.method} ${path} → ${r.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

const args = process.argv.slice(2);
const docs = toDocs(load());

if (args.includes('--dump')) {
  writeFileSync('supabase/seed-docs.json', JSON.stringify(docs, null, 1));
  const count: Record<string, number> = {};
  for (const d of docs) count[d.collection] = (count[d.collection] ?? 0) + 1;
  console.log('supabase/seed-docs.json', count);
}

if (args.includes('--docs')) {
  for (let i = 0; i < docs.length; i += 300) {
    await call('/rest/v1/docs?on_conflict=collection,id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(docs.slice(i, i + 300)) });
    console.log(`documents ${Math.min(i + 300, docs.length)}/${docs.length}`);
  }
}

const mi = args.indexOf('--members');
if (mi >= 0) {
  // [{ "email": "rudy@…", "app_user_id": "direction", "password": "facultatif" }]
  const list = JSON.parse(readFileSync(args[mi + 1], 'utf8')) as { email: string; app_user_id: string; password?: string }[];
  const users = load().users;
  for (const m of list) {
    const u = users.find((x) => x.id === m.app_user_id);
    if (!u) throw new Error(`Utilisateur inconnu : ${m.app_user_id}`);
    const created = await call('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify({ email: m.email, password: m.password, email_confirm: true }) }).catch(async (e) => {
      if (!String(e).includes('already')) throw e;
      const all = await call(`/auth/v1/admin/users?per_page=1000`, { method: 'GET' });
      return all.users.find((x: { email: string }) => x.email.toLowerCase() === m.email.toLowerCase());
    });
    await call('/rest/v1/members?on_conflict=user_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ user_id: created.id, app_user_id: u.id, role: u.role, supplier_id: u.supplierId ?? null, forwarder: u.forwarder ?? null, active: true }),
    });
    console.log(`compte ${m.email} → ${u.name} (${u.role})`);
  }
}
