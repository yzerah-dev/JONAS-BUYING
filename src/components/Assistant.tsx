import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, Loader2, Package, Send, Sparkles, Square, Undo2, X } from 'lucide-react';
import { byId, currentUser, lastPricePaid, nextProformaId, supplierTerms, useAuth, useStore, type State } from '../data/store';
import type { Proforma } from '../data/types';
import { parseOrderCommand } from '../lib/orderCommand';
import { TODAY, addDays, fdate, num } from '../lib/format';
import { toast } from './ui-shared';

// Claude (capacité « sample » de l'Artifact), pour les demandes formulées librement
type Sample = (input: unknown, opts?: object) => Promise<{ text: string }>;
type ClaudeWin = { claude?: { use?: (n: string) => Promise<unknown> } };
const capability = async <T,>(name: string): Promise<T | null> => {
  const host = (window as unknown as ClaudeWin).claude;
  if (!host?.use) return null;
  try {
    return ((await host.use(name)) as T | null) ?? null;
  } catch {
    return null;
  }
};

interface Turn {
  role: 'user' | 'assistant';
  content: string;
  /** Commandes créées pendant ce tour */
  orders?: string[];
}

const EXAMPLES = ['Passe la commande de 10 000 JO-R301', 'Commande 5 000 CP-T001 et 3 000 PF-P014, départ le 15/01/2027'];

/** Date d'expédition dictée : « départ le 15/01/2027 », « pour le 2027-01-15 » ; sinon dans 10 semaines */
function etdOf(text: string) {
  const fr = text.match(/(\d{1,2})[/.](\d{1,2})[/.](\d{4})/);
  if (fr) return `${fr[3]}-${fr[2].padStart(2, '0')}-${fr[1].padStart(2, '0')}`;
  const iso = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  return iso?.[1] ?? addDays(TODAY, 70);
}

/** Lignes regroupées par fournisseur, au dernier prix payé (dans la devise du fournisseur) */
function plan(s: State, items: { productId: string; qty: number }[]) {
  const bySup = new Map<string, { productId: string; qty: number; price: number; from?: string }[]>();
  for (const it of items) {
    const p = byId(s.products, it.productId);
    const cur = supplierTerms(s, p.supplierId).currency;
    const last = lastPricePaid(s, p.id, cur);
    const lines = bySup.get(p.supplierId) ?? [];
    const ex = lines.find((l) => l.productId === p.id);
    if (ex) ex.qty += it.qty;
    else lines.push({ productId: p.id, qty: it.qty, price: last.price, from: last.from });
    bySup.set(p.supplierId, lines);
  }
  return bySup;
}

/**
 * Assistant de commande : « passe la commande de 10 000 KF032 » → commande JONAS chez le fournisseur
 * de l'article, au dernier prix payé, avec demande de proforma. Uniquement sur instruction de l'utilisateur.
 */
export default function Assistant() {
  const { state, dispatch } = useStore();
  const auth = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState('');
  const [cancelled, setCancelled] = useState<string[]>([]);
  const abort = useRef<AbortController | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const me = currentUser(state);
  const canOrder = auth.can('proforma.edit') || auth.can('proforma.sign');

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [turns, live]);
  if (!canOrder) return null;

  /** Crée une commande par fournisseur ; renvoie les numéros créés */
  const placeOrders = (items: { productId: string; qty: number }[], etd: string, title?: string) => {
    let s = state;
    const ids: string[] = [];
    for (const [supplierId, lines] of plan(s, items)) {
      const id = nextProformaId(s);
      const refs = lines.map((l) => byId(s.products, l.productId).ref).join(', ');
      dispatch({
        type: 'createProforma',
        id,
        supplierId,
        title: title?.trim() || `Commande ${refs}`.slice(0, 80),
        etd,
        eta: addDays(etd, 35),
        lines: lines.map(({ productId, qty, price }) => ({ productId, qty, price })),
        order: { source: 'ia' },
      });
      ids.push(id);
      // numéro suivant : on tient compte de la commande qu'on vient d'ajouter
      s = { ...s, proformas: [...s.proformas, { id } as Proforma] };
    }
    return ids;
  };

  const say = (history: Turn[], content: string, orders?: string[]) => setTurns([...history, { role: 'assistant', content, orders }]);

  const ask = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    const history: Turn[] = [...turns, { role: 'user', content: q }];
    setTurns(history);
    setInput('');

    // 1. Commande dictée : quantités + références → commande directe
    const items = parseOrderCommand(q, state.products);
    if (items.length) {
      const unknown = items.filter((i) => !i.product);
      if (unknown.length)
        return say(history, `Je ne trouve pas ${unknown.map((u) => u.ref).join(', ')} dans le catalogue JONAS (ni comme référence JONAS, ni comme référence fournisseur). Aucune commande passée : vérifiez la référence.`);
      const ids = placeOrders(
        items.map((i) => ({ productId: i.product!.id, qty: i.qty })),
        etdOf(q),
      );
      toast(ids.length > 1 ? `${ids.length} commandes passées` : `Commande ${ids[0]} passée`);
      return say(
        history,
        ids.length > 1
          ? `C’est fait : ${ids.length} commandes passées (une par fournisseur), au dernier prix payé. Chaque fournisseur reçoit la demande de proforma.`
          : `C’est fait : commande ${ids[0]} passée au dernier prix payé. Le fournisseur reçoit la demande de proforma.`,
        ids,
      );
    }

    // 2. Demande formulée librement : Claude, avec le catalogue
    const sample = await capability<Sample>('sample');
    if (!sample)
      return say(history, 'Dites-moi la quantité et la référence, par exemple « passe la commande de 10 000 JO-R301 ». Pour les demandes en langage libre, utilisez l’application publiée sur claude.ai.');
    setBusy(true);
    setLive('');
    abort.current = new AbortController();
    const created: string[] = [];
    const tools = [
      {
        name: 'find_products',
        description: 'Cherche dans le catalogue JONAS (référence JONAS ou fournisseur, mots de la désignation, marque). Renvoie {productId, ref, supplierRef, name, supplier}. Plusieurs mots = tous requis.',
        inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
        execute: (i: Record<string, unknown>) => {
          const norm = (x: string) => x.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
          const words = norm(String(i.query ?? '')).split(/\s+/).filter(Boolean);
          return state.products
            .filter((p) => words.every((w) => norm(`${p.ref} ${p.supplierRef ?? ''} ${p.name} ${state.brands.find((b) => b.id === p.brandId)?.name ?? ''}`).includes(w)))
            .slice(0, 25)
            .map((p) => ({ productId: p.id, ref: p.ref, supplierRef: p.supplierRef, name: p.name, supplier: byId(state.suppliers, p.supplierId).name }));
        },
      },
      {
        name: 'place_order',
        description:
          'Passe la commande JONAS que l’utilisateur a explicitement demandée : chaque article part chez SON fournisseur, au dernier prix payé, avec demande de proforma. lines : [{productId, qty}] ; etd = date d’expédition AAAA-MM-JJ si l’utilisateur l’a donnée. Renvoie les numéros de commande.',
        inputSchema: {
          type: 'object',
          properties: {
            lines: { type: 'array', items: { type: 'object', properties: { productId: { type: 'string' }, qty: { type: 'number' } }, required: ['productId', 'qty'] } },
            etd: { type: 'string' },
            title: { type: 'string' },
          },
          required: ['lines'],
        },
        execute: (i: Record<string, unknown>, ctx: { signal: AbortSignal }) => {
          if (ctx.signal.aborted) throw new Error('Arrêté');
          const lines = (Array.isArray(i.lines) ? (i.lines as Record<string, unknown>[]) : []).map((l) => {
            const p = state.products.find((x) => x.id === String(l.productId));
            if (!p) throw new Error(`Produit inconnu : ${String(l.productId)} (utilise find_products)`);
            const qty = Math.round(Number(l.qty));
            if (!(qty > 0)) throw new Error(`Quantité invalide pour ${p.ref}`);
            return { productId: p.id, qty };
          });
          if (!lines.length) throw new Error('Aucune ligne');
          const etd = /^\d{4}-\d{2}-\d{2}$/.test(String(i.etd ?? '')) ? String(i.etd) : addDays(TODAY, 70);
          const ids = placeOrders(lines, etd, i.title ? String(i.title) : undefined);
          created.push(...ids);
          return { orders: ids };
        },
      },
    ];
    const RULES = `Tu es l'assistant commandes de JONAS (importateur). Nous sommes le ${TODAY}. Utilisateur : ${me.name}.
Tu passes UNIQUEMENT les commandes que l'utilisateur te demande explicitement dans ce message (quantité + article). Ne déduis jamais une commande d'autre chose.
1. Trouve chaque article avec find_products. N'invente aucun produit. Si un article est introuvable ou ambigu (plusieurs résultats possibles), ne passe rien et demande de préciser.
2. Appelle place_order une fois avec toutes les lignes : chaque article part chez son fournisseur, au dernier prix payé.
3. Réponds en français, en une ou deux phrases : numéros de commande passés, ou la question à poser.`;
    try {
      const r = await sample([{ role: 'user', content: RULES }, ...history.map((t) => ({ role: t.role, content: t.content }))], {
        tools,
        modelTier: 'default',
        signal: abort.current.signal,
        onText: ({ text }: { text: string }) => setLive(text),
      });
      if (created.length) toast(created.length > 1 ? `${created.length} commandes passées` : `Commande ${created[0]} passée`);
      say(history, r.text, created);
    } catch (e) {
      const code = (e as { code?: string })?.code;
      say(
        history,
        code === 'not_granted'
          ? 'L’accès à Claude n’a pas été autorisé pour cette page.'
          : code === 'cancelled'
            ? 'Arrêté.'
            : code === 'rate_limited'
              ? 'Trop de demandes, réessayez dans un instant.'
              : `Je n’ai pas pu terminer (${(e as { message?: string })?.message ?? code ?? 'erreur'}).`,
        created,
      );
    } finally {
      setBusy(false);
      setLive('');
      abort.current = null;
    }
  };

  const OrderCard = ({ id }: { id: string }) => {
    const pf = state.proformas.find((p) => p.id === id);
    if (!pf) return <div className="as-draft cancelled">{cancelled.includes(id) ? `Commande ${id} annulée` : `Commande ${id}`}</div>;
    const sup = byId(state.suppliers, pf.supplierId);
    const cur = pf.currency ?? 'EUR';
    const total = pf.lines.reduce((s, l) => s + l.qty * l.price, 0);
    const canCancel = auth.allowed({ type: 'cancelOrder', id });
    return (
      <div className="as-draft" aria-label={`Commande ${id}`}>
        <div className="as-draft-head">
          <Package size={16} />
          <b className="grow">
            {id} · {sup.shortName}
          </b>
          <small>départ {fdate(pf.etd)}</small>
        </div>
        <table className="tbl as-tbl">
          <tbody>
            {pf.lines.map((l) => {
              const p = byId(state.products, l.productId);
              const last = lastPricePaid({ ...state, proformas: state.proformas.filter((x) => x.id !== id) }, p.id, cur);
              return (
                <tr key={l.productId}>
                  <td>
                    <span className="ref-tag">{p.ref}</span> {p.name}
                    <div className="xs muted">{last.from ? `dernier prix payé : ${last.from} du ${fdate(last.date)}` : 'prix d’achat de la fiche produit'}</div>
                  </td>
                  <td className="num">{num(l.qty)}</td>
                  <td className="num">
                    {Number.isInteger(Math.round(l.price * 10000) / 100) ? l.price.toFixed(2) : String(Number(l.price.toFixed(4)))} {cur}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
          <b className="small">
            {num(pf.lines.reduce((s, l) => s + l.qty, 0))} pcs · {num(total)} {cur}
          </b>
          <span className="row" style={{ gap: 6 }}>
            {canCancel && (
              <button
                className="btn sm ghost"
                onClick={() => {
                  dispatch({ type: 'cancelOrder', id });
                  setCancelled([...cancelled, id]);
                  toast(`Commande ${id} annulée`);
                }}
              >
                <Undo2 size={14} /> Annuler
              </button>
            )}
            <button className="btn sm" onClick={() => navigate(`/proformas/${id}`)}>
              Voir
            </button>
          </span>
        </div>
      </div>
    );
  };

  return (
    <>
      {!open && (
        <button className="as-fab" onClick={() => setOpen(true)} aria-label="Assistant commandes">
          <Sparkles size={20} /> Assistant
        </button>
      )}
      {open && (
        <aside className="as-panel card" role="dialog" aria-label="Assistant commandes">
          <header className="as-head">
            <Bot size={20} />
            <div className="grow">
              <b>Assistant commandes</b>
              <small>« Passe la commande de 10 000 KF032 » : chez son fournisseur, au dernier prix payé</small>
            </div>
            <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Fermer l’assistant">
              <X size={18} />
            </button>
          </header>
          <div className="as-list" ref={list}>
            {turns.length === 0 && (
              <div className="as-empty">
                <p className="small muted">Donnez la quantité et la référence (JONAS ou fournisseur). La commande part chez le fournisseur de l’article avec demande de proforma ; vous pouvez l’annuler tant qu’il n’a rien déposé.</p>
                {EXAMPLES.map((e) => (
                  <button key={e} className="as-example" onClick={() => setInput(e)}>
                    {e}
                  </button>
                ))}
              </div>
            )}
            {turns.map((t, i) => (
              <div key={i} className={`as-msg ${t.role}`}>
                <div className="as-text">{t.content}</div>
                {t.orders?.map((id) => <OrderCard key={id} id={id} />)}
              </div>
            ))}
            {busy && (
              <div className="as-msg assistant">
                <div className="as-text">{live || <Loader2 size={14} className="spin" />}</div>
              </div>
            )}
          </div>
          <form
            className="as-input"
            onSubmit={(e) => {
              e.preventDefault();
              ask(input);
            }}
          >
            <textarea
              aria-label="Votre demande"
              rows={2}
              placeholder="Ex. Passe la commande de 10 000 KF032"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  ask(input);
                }
              }}
            />
            {busy ? (
              <button type="button" className="btn" onClick={() => abort.current?.abort()} aria-label="Arrêter">
                <Square size={14} />
              </button>
            ) : (
              <button type="submit" className="btn primary" aria-label="Envoyer" disabled={!input.trim()}>
                <Send size={16} />
              </button>
            )}
          </form>
        </aside>
      )}
    </>
  );
}
