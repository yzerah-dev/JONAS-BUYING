// E-mails automatiques aux fournisseurs : on compare l'état avant / après une action locale de JONAS et on
// prépare un e-mail par événement (commande, signature, die cut, acompte, pack validé), avec ses pièces jointes.
// En base partagée : envoi par la fonction serveur /api/envoi-mail. En démo : e-mail préparé, consultable, non envoyé.
import { byId, containerCapacity, containerCbm, currentUser, proformaTotals, type State } from '../../data/store';
import type { Product, Proforma, Supplier } from '../../data/types';
import { getBlob } from '../files';
import { conditionsPdf, purchaseOrderPdf, versionFileName, versionPdf } from '../proformaPdf';
import { money, weekLabel } from '../format';
import { mailHtml, mailSubject, type MailData, type MailKind, type MailLang } from './templates';

export const APP_URL = 'https://jonas-buying.vercel.app';
/** Limite des pièces jointes par e-mail (la fonction serveur accepte ~4,5 Mo) : au-delà, le document reste sur la plateforme */
const ATTACH_MAX = 3_200_000;

export interface Recipient {
  name: string;
  email: string;
}

/** Contacts qui reçoivent les e-mails : tous ceux qui ont une adresse valide (sauf décochés) */
export function mailRecipients(sup: Supplier): Recipient[] {
  const list = sup.contacts?.length ? sup.contacts : [sup.contact];
  const seen = new Set<string>();
  return list
    .filter((c) => c && c.mail !== false && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test((c.email ?? '').trim()))
    .map((c) => ({ name: c.name, email: c.email.trim() }))
    .filter((c) => !seen.has(c.email.toLowerCase()) && !!seen.add(c.email.toLowerCase()));
}

/** Langue des e-mails : choisie sur la fiche, sinon d'après le pays */
export const supplierLang = (sup: Supplier): MailLang => sup.lang ?? (/chin|ta[iï]wan|hong/i.test(sup.country) ? 'zh' : /france/i.test(sup.country) ? 'fr' : 'en');

export interface MailEvent {
  kind: MailKind;
  supplierId: string;
  proformaId?: string;
  productIds?: string[];
  /** Plan de chargement : conteneur concerné */
  containerId?: string;
  /** Demande de prix : offre concernée */
  quoteId?: string;
}

/** Événements à notifier entre deux états (action locale) */
export function detectMailEvents(prev: State, next: State): MailEvent[] {
  const me = currentUser(next);
  if (!me || me.role === 'fournisseur' || me.role === 'transitaire') return [];
  const out: MailEvent[] = [];
  const before = new Map(prev.proformas.map((p) => [p.id, p]));
  for (const pf of next.proformas) {
    const old = before.get(pf.id);
    // Commande JONAS : demande de proforma au fournisseur
    if (!old && pf.order && !pf.versions?.length) out.push({ kind: 'order', supplierId: pf.supplierId, proformaId: pf.id });
    if (!old) continue;
    // Signature d'une version déposée par le fournisseur
    const signedNow = (pf.versions ?? []).some((v) => v.status === 'signee' && old.versions?.find((o) => o.version === v.version)?.status !== 'signee');
    if (signedNow) out.push({ kind: 'signed', supplierId: pf.supplierId, proformaId: pf.id });
    if (pf.depositPaid && !old.depositPaid) out.push({ kind: 'deposit', supplierId: pf.supplierId, proformaId: pf.id });
  }
  // Die cuts demandés et packs envoyés au fournisseur : un e-mail par fournisseur
  const prevP = new Map(prev.products.map((p) => [p.id, p]));
  const group = (kind: 'diecut' | 'pack', test: (p: Product, o: Product) => boolean) => {
    const by = new Map<string, string[]>();
    for (const p of next.products) {
      const o = prevP.get(p.id);
      if (o && test(p, o)) by.set(p.supplierId, [...(by.get(p.supplierId) ?? []), p.id]);
    }
    for (const [supplierId, productIds] of by) out.push({ kind, supplierId, productIds });
  };
  group('diecut', (p, o) => p.pack.dieCut === 'requested' && o.pack.dieCut !== 'requested');
  group('pack', (p, o) => p.pack.sentToSupplier && !o.pack.sentToSupplier);
  // Demandes de prix : un e-mail par fournisseur interrogé
  const prevQ = new Set((prev.quotations ?? []).map((q) => q.id));
  for (const q of next.quotations ?? []) if (!prevQ.has(q.id) && q.origin === 'rfq') out.push({ kind: 'quote', supplierId: q.supplierId, quoteId: q.id });
  return out;
}

export interface PreparedMail {
  id: string;
  event: MailEvent;
  supplier: Supplier;
  to: Recipient[];
  subject: string;
  html: string;
  attachments: { filename: string; blob: Blob }[];
  status: 'sending' | 'sent' | 'demo' | 'failed' | 'no_contact';
  error?: string;
}

function quoteItems(s: State, id?: string) {
  const q = s.quotations.find((x) => x.id === id);
  if (!q) return [];
  return [{ ref: 'RFQ', name: q.name, sub: [q.targetPrice ? `Target ${money(q.targetPrice, q.currency)}` : '', q.note ?? ''].filter(Boolean).join(' · ') || undefined }];
}

const proformaOf = (s: State, productIds: string[]) => s.proformas.find((pf) => pf.lines.some((l) => productIds.includes(l.productId)));

/** Prépare l'e-mail (texte, HTML, pièces jointes) d'un événement */
export async function prepareMail(s: State, ev: MailEvent): Promise<PreparedMail> {
  const sup = byId(s.suppliers, ev.supplierId);
  const to = mailRecipients(sup);
  const lang = supplierLang(sup);
  const pf: Proforma | undefined = ev.proformaId ? s.proformas.find((p) => p.id === ev.proformaId) : ev.productIds ? proformaOf(s, ev.productIds) : undefined;
  const ctx = { supplier: sup, products: s.products, company: s.settings.company };
  const files: { filename: string; blob: Blob | null | undefined | Promise<Blob | null | undefined> }[] = [];
  const t = pf ? proformaTotals(s, pf) : undefined;
  const ctnOf = ev.containerId ? s.containers.find((x) => x.id === ev.containerId) : undefined;
  const prods = (ev.productIds ?? (ctnOf ? ctnOf.allocations.map((a) => a.productId) : undefined) ?? pf?.lines.map((l) => l.productId) ?? [])
    .map((id) => s.products.find((p) => p.id === id))
    .filter((p): p is Product => !!p);
  const items = prods.map((p) => {
    const a = ctnOf?.allocations.find((x) => x.productId === p.id);
    return { ref: p.supplierRef ? `${p.supplierRef} · ${p.ref}` : p.ref, name: p.name, sub: a ? `${a.qty} pcs · ${p.pcb ? Math.round((a.qty / p.pcb) * 100) / 100 : 0} ctn` : undefined };
  });
  let link = `${APP_URL}/#/portail`;

  if (ev.kind === 'order' && pf) {
    link = `${APP_URL}/#/portail/proformas?pf=${encodeURIComponent(pf.id)}`;
    files.push({ filename: `${pf.id}_bon-de-commande.pdf`, blob: purchaseOrderPdf(pf, ctx) });
    files.push({ filename: `${pf.id}_conditions-achat.pdf`, blob: conditionsPdf(pf, ctx) });
  } else if (ev.kind === 'signed' && pf) {
    link = `${APP_URL}/#/portail/proformas?pf=${encodeURIComponent(pf.id)}`;
    const v = [...(pf.versions ?? [])].filter((x) => x.status === 'signee').sort((a, b) => b.version - a.version)[0];
    if (v) files.push({ filename: versionFileName(pf, v), blob: versionPdf(pf, v, ctx) });
    files.push({ filename: `${pf.id}_conditions-achat.pdf`, blob: conditionsPdf(pf, ctx) });
  } else if (ev.kind === 'deposit' && pf) {
    link = `${APP_URL}/#/portail/finance`;
    if (pf.depositProof) files.push({ filename: pf.depositProof.name, blob: getBlob(pf.depositProof.fileId) });
  } else if (ev.kind === 'diecut') {
    link = `${APP_URL}/#/portail/packs?vue=diecut`;
  } else if (ev.kind === 'loading' && ev.containerId) {
    link = `${APP_URL}/#/portail/chargement`;
    const c = s.containers.find((x) => x.id === ev.containerId);
    if (c) {
      const { loadingPlanXlsx, loadingPlanFileName } = await import('../loadingPlan');
      files.push({ filename: loadingPlanFileName(c), blob: loadingPlanXlsx(s, c) });
    }
  } else if (ev.kind === 'quote') {
    link = `${APP_URL}/#/portail/offres`;
    const q = s.quotations.find((x) => x.id === ev.quoteId);
    q?.photos.forEach((ph, i) => files.push({ filename: `photo-${i + 1}.${ph.mime.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg'}`, blob: getBlob(ph.fileId) }));
  } else if (ev.kind === 'pack') {
    link = `${APP_URL}/#/portail/packs`;
    for (const p of prods) {
      const packs = (p.pack.files ?? []).filter((f) => f.kind === 'pack');
      const last = Math.max(0, ...packs.map((f) => f.version ?? 1));
      for (const f of packs.filter((x) => (x.version ?? 1) === last)) files.push({ filename: `${p.ref}_${f.name}`, blob: getBlob(f.id) });
    }
  }

  // Pièces jointes dans la limite de taille ; les autres restent sur la plateforme
  const attachments: PreparedMail['attachments'] = [];
  const onPlatform: string[] = [];
  let total = 0;
  for (const f of files) {
    const blob = await Promise.resolve(f.blob).catch(() => null);
    if (!blob) {
      onPlatform.push(f.filename);
      continue;
    }
    if (total + blob.size > ATTACH_MAX) {
      onPlatform.push(f.filename);
      continue;
    }
    total += blob.size;
    attachments.push({ filename: f.filename, blob });
  }

  const me = currentUser(s);
  const ctn = ev.containerId ? s.containers.find((x) => x.id === ev.containerId) : undefined;
  const data: MailData = {
    kind: ev.kind,
    supplierName: sup.name,
    contactName: to[0]?.name || undefined,
    pfId: pf?.id,
    pfTitle: pf?.title,
    amount: t && ev.kind !== 'loading' ? (ev.kind === 'deposit' ? money(Math.round(t.depositCur), t.currency) : money(Math.round(t.amountCur), t.currency)) : undefined,
    loading: pf && (ev.kind === 'order' || ev.kind === 'signed') ? `${weekLabel(pf.etd)} · ${pf.etd}` : undefined,
    items: ev.kind === 'deposit' ? undefined : ev.kind === 'quote' ? quoteItems(s, ev.quoteId) : items,
    container: ctn ? `${ctn.type} · ${ctn.number ?? ctn.id} · ${containerCbm(s, ctn).toFixed(1).replace('.', ',')} / ${containerCapacity(ctn)} m³` : undefined,
    attached: attachments.map((a) => a.filename),
    onPlatform,
    link,
    company: { name: s.settings.company.name, address: s.settings.company.address, city: s.settings.company.city },
    sender: me?.name,
  };
  return {
    id: `${ev.kind}-${ev.proformaId ?? ev.quoteId ?? ev.productIds?.join('.') ?? ''}-${Date.now()}`,
    event: ev,
    supplier: sup,
    to,
    subject: mailSubject(data, lang),
    html: mailHtml(data, lang),
    attachments,
    status: to.length ? 'sending' : 'no_contact',
  };
}

// ---------------------------------------------------------------------------
// Boîte d'envoi (affichée en bas de l'écran : envoyé / démo / échec, aperçu de l'e-mail)

type Listener = (list: PreparedMail[]) => void;
let outbox: PreparedMail[] = [];
const listeners = new Set<Listener>();
const emit = () => listeners.forEach((l) => l(outbox));
export function subscribeOutbox(l: Listener) {
  listeners.add(l);
  l(outbox);
  return () => {
    listeners.delete(l);
  };
}
export const dismissMail = (id: string) => {
  outbox = outbox.filter((m) => m.id !== id);
  emit();
};
const upsert = (m: PreparedMail) => {
  outbox = [m, ...outbox.filter((x) => x.id !== m.id)].slice(0, 6);
  emit();
};

async function b64(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Envoi réel (base partagée) : la fonction serveur relit les contacts du fournisseur et envoie */
async function send(m: PreparedMail, replyTo?: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const { supabase } = await import('../../data/supabaseSync');
    const token = (await supabase().auth.getSession()).data.session?.access_token;
    if (!token) return { ok: false, error: 'Session expirée' };
    const r = await fetch('/api/envoi-mail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        supplierId: m.supplier.id,
        subject: m.subject,
        html: m.html,
        replyTo,
        attachments: await Promise.all(m.attachments.map(async (a) => ({ filename: a.filename, content: await b64(a.blob) }))),
      }),
    });
    if (r.ok) return { ok: true };
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: j.error === 'not_configured' ? 'Envoi d’e-mails pas encore configuré (clé RESEND_API_KEY)' : (j.error ?? `Erreur ${r.status}`) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

type LogFn = (a: { supplierId: string; proformaId?: string; subject: string; to: string[]; ok: boolean; demo?: boolean }) => void;

// Regroupement : les actions en lot (validation de 10 packs…) donnent un seul e-mail par fournisseur et par sujet
let queue: MailEvent[] = [];
let latest: State | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

function merge(events: MailEvent[]): MailEvent[] {
  const out = new Map<string, MailEvent>();
  for (const e of events) {
    const key = e.productIds ? `${e.kind}|${e.supplierId}` : `${e.kind}|${e.supplierId}|${e.proformaId}`;
    const cur = out.get(key);
    if (cur && e.productIds) cur.productIds = [...new Set([...(cur.productIds ?? []), ...e.productIds])];
    else if (!cur) out.set(key, { ...e, productIds: e.productIds ? [...e.productIds] : undefined });
  }
  return [...out.values()];
}

async function deliver(s: State, ev: MailEvent, opts: { remote: boolean; log: LogFn }) {
  let m: PreparedMail;
  try {
    m = await prepareMail(s, ev);
  } catch {
    return;
  }
  if (m.status === 'no_contact') {
    upsert(m);
    return;
  }
  const pfId = ev.proformaId ?? (ev.productIds ? proformaOf(s, ev.productIds)?.id : undefined);
  if (!opts.remote) {
    upsert({ ...m, status: 'demo' });
    opts.log({ supplierId: m.supplier.id, proformaId: pfId, subject: m.subject, to: m.to.map((x) => x.email), ok: true, demo: true });
    return;
  }
  upsert(m);
  const me = currentUser(s);
  const r = await send(m, me?.email);
  upsert({ ...m, status: r.ok ? 'sent' : 'failed', error: r.error });
  opts.log({ supplierId: m.supplier.id, proformaId: pfId, subject: m.subject, to: m.to.map((x) => x.email), ok: r.ok });
}

/** À appeler après chaque action locale (état avant / après) : prépare puis envoie (ou démo) les e-mails */
export function processMailEvents(prev: State, next: State, opts: { remote: boolean; log: LogFn }) {
  const events = detectMailEvents(prev, next);
  latest = next;
  if (!events.length) return;
  queue.push(...events);
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    const batch = merge(queue);
    const s = latest!;
    queue = [];
    timer = null;
    for (const ev of batch) void deliver(s, ev, opts);
  }, 500);
}

/** Envoi demandé à la main (ex. « Envoyer le plan de chargement ») : même circuit que les e-mails automatiques */
export function sendMailNow(s: State, ev: MailEvent, opts: { remote: boolean; log: LogFn }) {
  void deliver(s, ev, opts);
}
