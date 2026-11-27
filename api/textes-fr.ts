// Fonction serveur Vercel : désignation courte et description longue en français, à partir du texte anglais du fournisseur.
// Réservée aux utilisateurs connectés à JONAS BUYING (jeton Supabase vérifié).
// La clé Claude est lue dans la variable d'environnement ANTHROPIC_API_KEY du projet Vercel (jamais dans le navigateur).
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';

// Adresse et clé PUBLIQUE (publishable) de la base, les mêmes que dans .env.supabase : servent seulement à vérifier la connexion
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? 'https://ulwsixiywyikyjanbidk.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? 'sb_publishable_b0v4s7AH4nQ31AmeigQ6hA_NaHA3ZHC';
const MAX_ITEMS = 60;

const Result = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      fr: z.string(),
    }),
  ),
});

const SYSTEM = `Tu es rédacteur produit pour JONAS, importateur français (bazar, maison, bagagerie, accessoires) qui vend à la grande distribution.
Pour chaque article, à partir du texte anglais du fournisseur, écris :
- "name" : la désignation commerciale en français, courte et claire (2 à 6 mots, majuscule au premier mot seulement, sans référence, sans prix, sans quantité ni conditionnement). Exemples : « Mug léopard 350 ml », « Gourde léopard 500 ml », « Râpe 2 faces avec boîte », « Set de 4 valises ».
- "fr" : la description longue en français, retravaillée pour un catalogue : une phrase d'accroche puis les caractéristiques utiles (matière, dimensions, contenance, coloris ou nombre de modèles, entretien si indiqué). Reprends fidèlement les informations du texte anglais, n'invente rien. Texte simple, sans markdown, 2 à 5 lignes.
Une photo de l'article est souvent jointe (juste après son texte). Elle fait foi :
- contrôle le texte anglais par rapport à la photo : type d'objet, forme, nombre de pièces ou de modèles, couleurs, motif (ex. léopard, rayures), accessoires visibles ;
- si le texte et la photo ne concordent pas, ou si le texte est incomplet, corrige la désignation et la description d'après la photo ;
- n'ajoute que ce que l'on voit vraiment ; les caractéristiques invisibles (matière, dimensions, contenance) viennent uniquement du texte du fournisseur.
Renvoie chaque article avec son "id" inchangé.`;

async function userOf(token: string) {
  if (!token || !SUPABASE_ANON_KEY) return null;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } });
  return r.ok ? ((await r.json()) as { id?: string }) : null;
}

export async function POST(request: Request): Promise<Response> {
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: 'not_configured' }, { status: 503 });
  const token = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const user = await userOf(token);
  if (!user?.id) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { items?: { id?: unknown; en?: unknown; photo?: { data?: unknown; type?: unknown } }[] } | null;
  const IMG = /^image\/(jpeg|png|webp|gif)$/;
  const items = (body?.items ?? [])
    .map((i) => ({
      id: String(i.id ?? ''),
      en: String(i.en ?? '').slice(0, 4000),
      // Photo du produit (réduite par le navigateur) : base64 + type d'image
      photo: i.photo && typeof i.photo.data === 'string' && IMG.test(String(i.photo.type)) && i.photo.data.length < 1_500_000 ? { data: i.photo.data, type: String(i.photo.type) } : undefined,
    }))
    .filter((i) => i.id && i.en.trim())
    .slice(0, MAX_ITEMS);
  if (!items.length) return Response.json({ items: [] });

  const client = new Anthropic();
  try {
    const response = await client.messages.parse({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      output_config: { effort: 'low', format: zodOutputFormat(Result) },
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: items.flatMap((i) => [
            { type: 'text' as const, text: `Article ${JSON.stringify({ id: i.id, en: i.en })}${i.photo ? ' — photo ci-dessous :' : ' — pas de photo.'}` },
            ...(i.photo
              ? [{ type: 'image' as const, source: { type: 'base64' as const, media_type: i.photo.type as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif', data: i.photo.data } }]
              : []),
          ]),
        },
      ],
    });
    if (response.stop_reason === 'refusal' || !response.parsed_output) return Response.json({ error: 'no_result' }, { status: 502 });
    const known = new Set(items.map((i) => i.id));
    const out = response.parsed_output.items.filter((i) => known.has(i.id) && i.name.trim() && i.fr.trim());
    return Response.json({ items: out });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return Response.json({ error: 'rate_limited' }, { status: 429 });
    if (e instanceof Anthropic.AuthenticationError) return Response.json({ error: 'bad_key' }, { status: 503 });
    if (e instanceof Anthropic.APIError) return Response.json({ error: 'api_error', status: e.status }, { status: 502 });
    return Response.json({ error: 'failed' }, { status: 500 });
  }
}
