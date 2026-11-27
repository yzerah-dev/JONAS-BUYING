import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Check, FileQuestion, Send, Trash2, X } from 'lucide-react';
import { canQuote, currentUser, newQuoteId, nextJonasCodes, supplierTerms, useStore } from '../data/store';
import type { ProductPhoto, Quotation } from '../data/types';
import { setCartQty } from '../lib/cart';
import { money, num } from '../lib/format';
import { supplierScope } from '../lib/files';
import { CartButton } from '../components/Cart';
import { QuoteCard, QuotePhotosInput } from '../components/Quotations';
import { copyPhotosTo, parsePrice } from '../lib/quotes';
import FilterChip from '../components/FilterChip';
import { SupplierLogo } from '../components/ui';
import { toast } from '../components/ui-shared';

type Tab = Quotation['status'];
const TABS: { id: Tab; label: string }[] = [
  { id: 'en_attente', label: 'Offres en attente' },
  { id: 'demande', label: 'Prix attendus' },
  { id: 'acceptee', label: 'Acceptées' },
  { id: 'refusee', label: 'Refusées' },
];

/** Quotations : demandes de prix aux fournisseurs et offres reçues (à accepter → produit créé et mis au panier) */
export default function Quotations() {
  const { state, dispatch } = useStore();
  const me = currentUser(state);
  const allowed = canQuote(me);
  const [params, setParams] = useSearchParams();
  const tab = (params.get('vue') as Tab | null) ?? 'en_attente';
  const [supplier, setSupplier] = useState('all');
  const [rfq, setRfq] = useState(false);
  const [accepting, setAccepting] = useState<Quotation | null>(null);
  const [refusing, setRefusing] = useState<Quotation | null>(null);
  const [pricing, setPricing] = useState<Record<string, string>>({});

  const count = (st: Tab) => state.quotations.filter((q) => q.status === st).length;
  const list = state.quotations
    .filter((q) => q.status === tab && (supplier === 'all' || q.supplierId === supplier))
    .sort((a, b) => (b.answeredAt ?? b.createdAt).localeCompare(a.answeredAt ?? a.createdAt));
  // Même demande envoyée à plusieurs fournisseurs : meilleur prix parmi les réponses (même devise)
  const best = new Set<string>();
  const groups = new Map<string, Quotation[]>();
  for (const q of state.quotations) if (q.group && q.price && q.status === 'en_attente') groups.set(`${q.group}~${q.currency}`, [...(groups.get(`${q.group}~${q.currency}`) ?? []), q]);
  for (const g of groups.values()) if (g.length > 1) best.add(g.reduce((m, q) => (q.price! < m.price! ? q : m)).id);
  const suppliersUsed = [...new Set(state.quotations.map((q) => q.supplierId))];

  return (
    <>
      <div className="page-head">
        <h1>Offres de prix</h1>
        <span className="page-sub">Demandes de prix aux fournisseurs et offres reçues : acceptée, l’offre devient un produit en développement, ajouté au panier.</span>
        <div className="grow" />
        {allowed && <CartButton />}
        {allowed && (
          <button type="button" className="btn primary" onClick={() => setRfq(true)}>
            <FileQuestion size={16} /> Demande de prix
          </button>
        )}
      </div>
      <div className="row wrap mb" style={{ gap: 8 }}>
        <span className="pfx-seg" role="group" aria-label="Statut">
          {TABS.map((t) => (
            <button key={t.id} type="button" aria-pressed={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => setParams({ vue: t.id })}>
              {t.label} <b className="qt-count">{count(t.id)}</b>
            </button>
          ))}
        </span>
        {suppliersUsed.length > 1 && (
          <FilterChip label="Fournisseur" value={supplier} onChange={setSupplier} options={suppliersUsed.map((id) => ({ id, label: state.suppliers.find((s) => s.id === id)?.shortName ?? id }))} />
        )}
      </div>
      {list.length === 0 && <div className="card empty">{tab === 'en_attente' ? 'Aucune offre en attente.' : tab === 'demande' ? 'Aucune demande de prix en cours.' : 'Rien ici pour le moment.'}</div>}
      <div className="qt-grid">
        {list.map((q) => (
          <QuoteCard key={q.id} q={q} best={best.has(q.id)}>
            {allowed && q.status === 'en_attente' && (
              <>
                <button type="button" className="btn primary" onClick={() => setAccepting(q)}>
                  <Check size={16} /> Accepter
                </button>
                <button type="button" className="btn ghost" onClick={() => setRefusing(q)}>
                  <X size={16} /> Refuser
                </button>
              </>
            )}
            {allowed && q.status === 'demande' && (
              <>
                <input
                  className="qt-price-in"
                  inputMode="decimal"
                  placeholder={`Prix reçu (${q.currency})`}
                  aria-label={`Prix reçu ${q.name}`}
                  value={pricing[q.id] ?? ''}
                  onChange={(e) => setPricing({ ...pricing, [q.id]: e.target.value })}
                />
                <button
                  type="button"
                  className="btn"
                  disabled={!parsePrice(pricing[q.id] ?? '')}
                  onClick={() => {
                    dispatch({ type: 'answerQuote', id: q.id, price: parsePrice(pricing[q.id] ?? '') });
                    toast('Prix enregistré : offre en attente');
                  }}
                >
                  OK
                </button>
                <button type="button" className="btn ghost" onClick={() => setRefusing(q)}>
                  Annuler la demande
                </button>
              </>
            )}
            {q.status === 'acceptee' && q.productId && (
              <Link className="btn" to={`/produits/${q.productId}`} state={{ back: '/offres?vue=acceptee', backLabel: 'Offres de prix' }}>
                Voir le produit
              </Link>
            )}
            {allowed && q.status === 'refusee' && (
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  dispatch({ type: 'deleteQuote', id: q.id });
                  toast('Offre supprimée');
                }}
              >
                <Trash2 size={16} /> Supprimer
              </button>
            )}
          </QuoteCard>
        ))}
      </div>
      {rfq && <RfqDialog onClose={() => setRfq(false)} />}
      {accepting && <AcceptDialog q={accepting} onClose={() => setAccepting(null)} />}
      {refusing && <RefuseDialog q={refusing} onClose={() => setRefusing(null)} />}
    </>
  );
}

function Dialog({ title, sub, onClose, children, foot }: { title: string; sub?: string; onClose: () => void; children: React.ReactNode; foot: React.ReactNode }) {
  return (
    <div className="palette-back" onMouseDown={onClose}>
      <div className="card rc-dialog bk-dialog" role="dialog" aria-label={title} onMouseDown={(e) => e.stopPropagation()}>
        <header className="rc-head">
          <div>
            <h2>{title}</h2>
            {sub && <span className="muted small">{sub}</span>}
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fermer">
            <X size={20} />
          </button>
        </header>
        <div className="bk-form" style={{ display: 'grid', gap: 14 }}>
          {children}
        </div>
        <footer className="rc-foot">{foot}</footer>
      </div>
    </div>
  );
}

/** Demande de prix : photos, désignation, prix cible facultatif, un ou plusieurs fournisseurs */
function RfqDialog({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useStore();
  const me = currentUser(state);
  const [name, setName] = useState('');
  const [photos, setPhotos] = useState<ProductPhoto[]>([]);
  const [target, setTarget] = useState('');
  const [note, setNote] = useState('');
  const [to, setTo] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const suppliers = state.suppliers.filter((s) => s.active !== false);
  const send = async () => {
    setBusy(true);
    try {
      const group = to.length > 1 ? `G-${Date.now().toString(36).toUpperCase()}` : undefined;
      const now = new Date().toISOString();
      const quotations: Quotation[] = [];
      for (const [i, sid] of to.entries()) {
        quotations.push({
          id: newQuoteId(i),
          kind: 'quotation',
          supplierId: sid,
          origin: 'rfq',
          ...(group ? { group } : {}),
          name: name.trim(),
          photos: await copyPhotosTo(supplierScope(sid), photos),
          currency: supplierTerms(state, sid).currency,
          ...(parsePrice(target) ? { targetPrice: parsePrice(target) } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
          status: 'demande',
          createdAt: now,
          createdBy: me.name,
        });
      }
      dispatch({ type: 'requestQuotes', quotations });
      toast(`Demande de prix envoyée à ${to.length} fournisseur(s)`);
      onClose();
    } catch {
      toast('Envoi impossible : réessayez');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      title="Demande de prix"
      sub="Chaque fournisseur choisi reçoit la demande dans son portail (et par e-mail), et répond avec son prix."
      onClose={onClose}
      foot={
        <>
          <span>{to.length ? `${to.length} fournisseur(s)` : 'Choisissez au moins un fournisseur'}</span>
          <button type="button" className="btn ghost" onClick={onClose}>
            Annuler
          </button>
          <button type="button" className="btn primary" disabled={busy || !name.trim() || !to.length} onClick={send}>
            <Send size={16} /> Envoyer la demande
          </button>
        </>
      }
    >
      <div className="bk-wide">
        <div className="lbl">Photos</div>
        <QuotePhotosInput scope="jonas/demandes-prix" photos={photos} onChange={setPhotos} />
      </div>
      <label className="bk-wide">
        <span>Désignation</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="ex. Coussin extérieur déperlant 45 × 45" />
      </label>
      <label>
        <span>Prix cible (facultatif, devise du fournisseur)</span>
        <input className="input" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} />
      </label>
      <label>
        <span>Remarque (quantité, matière…)</span>
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <div className="bk-wide">
        <div className="lbl">Fournisseurs</div>
        <div className="qt-sups">
          {suppliers.map((s) => {
            const on = to.includes(s.id);
            return (
              <button key={s.id} type="button" aria-pressed={on} className={`qt-sup-pick ${on ? 'on' : ''}`} onClick={() => setTo(on ? to.filter((x) => x !== s.id) : [...to, s.id])}>
                <SupplierLogo supplier={s} size={26} /> {s.shortName} <small>{supplierTerms(state, s.id).currency}</small>
              </button>
            );
          })}
        </div>
      </div>
    </Dialog>
  );
}

/** Accepter : quantité à commander (et colisage), produit créé en développement et ajouté au panier */
function AcceptDialog({ q, onClose }: { q: Quotation; onClose: () => void }) {
  const { state, dispatch } = useStore();
  const me = currentUser(state);
  const [qty, setQty] = useState('1000');
  const [pcb, setPcb] = useState('');
  const n = Number(qty.replace(/\D/g, '')) || 0;
  const accept = () => {
    const code = nextJonasCodes(state, q.supplierId, 1)[0];
    dispatch({ type: 'acceptQuote', id: q.id, ref: code.ref, ean: code.ean, qty: n, pcb: Number(pcb.replace(/\D/g, '')) || undefined });
    setCartQty(me.id, code.ref, n);
    toast(`Offre acceptée : produit ${code.ref} créé et ajouté au panier (${num(n)} pcs)`);
    onClose();
  };
  return (
    <Dialog
      title="Accepter l’offre"
      sub={`${q.name} · ${money(q.price ?? 0, q.currency)} / pièce`}
      onClose={onClose}
      foot={
        <>
          <span>Total : {money((q.price ?? 0) * n, q.currency)}</span>
          <button type="button" className="btn ghost" onClick={onClose}>
            Annuler
          </button>
          <button type="button" className="btn primary" disabled={!n} onClick={accept}>
            <Check size={16} /> Accepter et ajouter au panier
          </button>
        </>
      }
    >
      <p className="small muted bk-wide">Le produit est créé au catalogue (en développement, marque et designer à définir) avec ce prix d’achat. La commande se passe ensuite depuis le panier.</p>
      <label>
        <span>Quantité (pièces)</span>
        <input className="input" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus />
      </label>
      <label>
        <span>Colisage (pièces / carton, facultatif)</span>
        <input className="input" inputMode="numeric" value={pcb} onChange={(e) => setPcb(e.target.value)} />
      </label>
    </Dialog>
  );
}

function RefuseDialog({ q, onClose }: { q: Quotation; onClose: () => void }) {
  const { dispatch } = useStore();
  const [reason, setReason] = useState('');
  const isRequest = q.status === 'demande';
  return (
    <Dialog
      title={isRequest ? 'Annuler la demande de prix' : 'Refuser l’offre'}
      sub={q.name}
      onClose={onClose}
      foot={
        <>
          <span />
          <button type="button" className="btn ghost" onClick={onClose}>
            Retour
          </button>
          <button
            type="button"
            className="btn danger"
            onClick={() => {
              dispatch({ type: 'refuseQuote', id: q.id, reason });
              toast(isRequest ? 'Demande annulée' : 'Offre refusée');
              onClose();
            }}
          >
            {isRequest ? 'Annuler la demande' : 'Refuser'}
          </button>
        </>
      }
    >
      <label className="bk-wide">
        <span>Motif (facultatif, visible par le fournisseur)</span>
        <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="ex. prix trop élevé" autoFocus />
      </label>
    </Dialog>
  );
}
