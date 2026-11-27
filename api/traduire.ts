// Fonction serveur Vercel : traduction des messages de la discussion produit (JONAS ↔ fournisseur) par Claude.
// Réservée aux utilisateurs connectés (jeton Supabase vérifié). Clé : ANTHROPIC_API_KEY (projet Vercel).
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? 'https://ulwsixiywyikyjanbidk.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? 'sb_publishable_b0v4s7AH4nQ31AmeigQ6hA_NaHA3ZHC';
const LANGS: Record<string, string> = { fr: 'français', en: 'anglais', zh: 'chinois simplifié' };
const Out = z.object({ texts: z.array(z.string()) });

export async function POST(request: Request): Promise<Response> {
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: 'not_configured' }, { status: 503 });
  const token = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const u = token ? await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } }) : null;
  if (!u?.ok) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { texts?: unknown[]; to?: unknown } | null;
  const to = String(body?.to ?? '');
  const texts = (body?.texts ?? []).map((t) => String(t ?? '').slice(0, 4000)).slice(0, 30);
  if (!LANGS[to] || !texts.length) return Response.json({ error: 'bad_request' }, { status: 400 });
  const client = new Anthropic();
  try {
    const r = await client.messages.parse({
      model: 'claude-opus-5-5',
      max_tokens: 8000,
      output_config: { effort: 'low', format: zodOutputFormat(Out) },
      system: `Tu traduis des messages professionnels entre JONAS INTERNATIONAL (importateur français : achats, packaging, qualité) et ses fournisseurs d'Asie, à propos d'un produit.
Traduis chaque message en ${LANGS[to]}, fidèlement, ton courtois et naturel, sans rien ajouter ni retirer. Garde tels quels les références, codes, chiffres, unités, noms propres et e-mails.
Si un message est déjà en ${LANGS[to]}, renvoie-le tel quel. Renvoie {"texts": [...]} dans le même ordre.`,
      messages: [{ role: 'user', content: JSON.stringify(texts) }],
    });
    const out = r.parsed_output?.texts;
    if (!out || out.length !== texts.length) return Response.json({ error: 'no_result' }, { status: 502 });
    return Response.json({ texts: out });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return Response.json({ error: 'bad_key' }, { status: 503 });
    return Response.json({ error: 'failed' }, { status: 502 });
  }
}
