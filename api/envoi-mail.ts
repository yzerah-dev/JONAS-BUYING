// Fonction serveur Vercel : envoi des e-mails automatiques aux fournisseurs (commande, signature, die cut, acompte, pack).
// Réservée à l'équipe JONAS connectée (jeton Supabase vérifié, rôle lu dans la base).
// Les destinataires ne viennent PAS du navigateur : ils sont relus sur la fiche du fournisseur dans la base.
// Service d'envoi : Resend (https://resend.com). Variables du projet Vercel :
//   RESEND_API_KEY  clé de l'API Resend (jamais dans le navigateur)
//   MAIL_FROM       expéditeur, ex. « JONAS INTERNATIONAL <achats@jonas-france.com> » (domaine vérifié chez Resend)
//   MAIL_BCC        (facultatif) copie cachée de chaque e-mail, ex. achats@jonas-france.com
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? 'https://ulwsixiywyikyjanbidk.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? 'sb_publishable_b0v4s7AH4nQ31AmeigQ6hA_NaHA3ZHC';
const MAX_BYTES = 4_000_000;
const EMAIL = /^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/;

interface Contact {
  name?: string;
  email?: string;
  mail?: boolean;
}

const rest = (path: string, token: string) => fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } });

export async function POST(request: Request): Promise<Response> {
  if (!process.env.RESEND_API_KEY || !process.env.MAIL_FROM) return Response.json({ error: 'not_configured' }, { status: 503 });
  const token = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const u = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } });
  const user = u.ok ? ((await u.json()) as { id?: string }) : null;
  if (!user?.id) return Response.json({ error: 'unauthorized' }, { status: 401 });

  // Équipe JONAS uniquement (pas les fournisseurs ni les transitaires)
  const m = await rest(`members?select=role&user_id=eq.${encodeURIComponent(user.id)}`, token);
  const role = m.ok ? ((await m.json()) as { role?: string }[])[0]?.role : undefined;
  if (!role || role === 'fournisseur' || role === 'transitaire') return Response.json({ error: 'forbidden' }, { status: 403 });

  const raw = await request.text();
  if (raw.length > MAX_BYTES * 1.4) return Response.json({ error: 'too_large' }, { status: 413 });
  const body = JSON.parse(raw || '{}') as { supplierId?: string; subject?: string; html?: string; replyTo?: string; attachments?: { filename?: string; content?: string }[] };
  const supplierId = String(body.supplierId ?? '');
  const subject = String(body.subject ?? '').slice(0, 300);
  const html = String(body.html ?? '');
  if (!supplierId || !subject || !html) return Response.json({ error: 'bad_request' }, { status: 400 });

  // Destinataires : contacts de la fiche fournisseur dans la base
  const d = await rest(`docs?select=data&collection=eq.suppliers&id=eq.${encodeURIComponent(supplierId)}`, token);
  const sup = d.ok ? ((await d.json()) as { data?: { name?: string; contact?: Contact; contacts?: Contact[] } }[])[0]?.data : undefined;
  if (!sup) return Response.json({ error: 'supplier_not_found' }, { status: 404 });
  const list = sup.contacts?.length ? sup.contacts : sup.contact ? [sup.contact] : [];
  const to = [...new Set(list.filter((c) => c.mail !== false && EMAIL.test((c.email ?? '').trim())).map((c) => c.email!.trim()))];
  if (!to.length) return Response.json({ error: 'no_contact' }, { status: 422 });

  const attachments = (body.attachments ?? []).filter((a) => a.filename && a.content).map((a) => ({ filename: String(a.filename).slice(0, 180), content: String(a.content) }));
  const replyTo = body.replyTo && EMAIL.test(body.replyTo) ? body.replyTo : undefined;
  const bcc = process.env.MAIL_BCC && EMAIL.test(process.env.MAIL_BCC) ? [process.env.MAIL_BCC] : undefined;

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.MAIL_FROM, to, bcc, reply_to: replyTo, subject, html, attachments }),
  });
  if (!r.ok) {
    const e = (await r.json().catch(() => ({}))) as { message?: string };
    return Response.json({ error: e.message ?? `send_failed_${r.status}` }, { status: 502 });
  }
  const j = (await r.json().catch(() => ({}))) as { id?: string };
  return Response.json({ ok: true, id: j.id, to });
}
