// Client Supabase de la plateforme : connexion, chargement, envoi des modifications, temps réel, fichiers.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { remoteConfig, type Collection, type Doc } from './remote';

let client: SupabaseClient | null = null;
export function supabase(): SupabaseClient {
  client ??= createClient(remoteConfig.url, remoteConfig.key, { auth: { persistSession: true, autoRefreshToken: true } });
  return client;
}

export interface Member {
  app_user_id: string;
  role: string;
  supplier_id: string | null;
  forwarder: string | null;
}

/** Compte connecté → utilisateur de l'application (table members) */
export async function currentMember(): Promise<Member | null> {
  const { data: u } = await supabase().auth.getUser();
  if (!u.user) return null;
  const { data } = await supabase().from('members').select('app_user_id, role, supplier_id, forwarder').eq('user_id', u.user.id).maybeSingle();
  return (data as Member | null) ?? null;
}

/** Tous les documents visibles par l'utilisateur (selon ses droits), par pages de 1 000 */
export async function loadDocs(): Promise<Doc[]> {
  const out: Doc[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase().from('docs').select('collection, id, data').range(from, from + 999);
    if (error) throw error;
    out.push(...((data ?? []) as Doc[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** Envoie les objets modifiés et supprimés */
export async function pushDocs(upserts: Doc[], deletes: { collection: Collection; id: string }[]) {
  // Journal : ajout seul (la base refuse toute modification d'une entrée existante)
  const journal = upserts.filter((d) => d.collection === 'journal');
  const others = upserts.filter((d) => d.collection !== 'journal');
  if (journal.length) {
    // Insert simple (pas d'upsert : la base n'autorise que l'ajout). Si une entrée est déjà en base
    // (nouvel essai après une coupure), on les reprend une par une en ignorant les doublons.
    const { error } = await supabase().from('docs').insert(journal);
    if (error?.code === '23505') {
      for (const d of journal) {
        const { error: e } = await supabase().from('docs').insert(d);
        if (e && e.code !== '23505') throw e;
      }
    } else if (error) throw error;
  }
  for (let i = 0; i < others.length; i += 500) {
    const { error } = await supabase().from('docs').upsert(others.slice(i, i + 500), { onConflict: 'collection,id' });
    if (error) throw error;
  }
  for (const d of deletes) {
    const { error } = await supabase().from('docs').delete().eq('collection', d.collection).eq('id', d.id);
    if (error) throw error;
  }
}

/** Modifications des autres utilisateurs, en temps réel */
export function subscribeDocs(onChange: (c: { collection: Collection; id: string; data: unknown | null }) => void) {
  const ch = supabase()
    .channel('docs')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'docs' }, (p) => {
      const row = (p.new && Object.keys(p.new).length ? p.new : p.old) as { collection: Collection; id: string; data?: unknown };
      onChange({ collection: row.collection, id: row.id, data: p.eventType === 'DELETE' ? null : (row.data ?? null) });
    })
    .subscribe();
  return () => {
    supabase().removeChannel(ch);
  };
}

/** Fichiers partagés (bucket privé « files ») */
export async function putRemoteFile(id: string, blob: Blob) {
  const { error } = await supabase().storage.from('files').upload(id, blob, { upsert: true, contentType: blob.type || 'application/octet-stream' });
  if (error) throw error;
}
export async function getRemoteFile(id: string): Promise<Blob | undefined> {
  const { data } = await supabase().storage.from('files').download(id);
  return data ?? undefined;
}
