import { useMemo, useState, type ReactNode } from 'react';
import { Check, Handshake, Send, X } from 'lucide-react';
import { currentUser, newQuoteId, nextJonasCodes, sameSupplierSource, supplierTerms, useStore } from '../data/store';
import type { Product, ProductPhoto, Quotation } from '../data/types';
import { setCartQty } from '../lib/cart';
import { dec, money, num } from '../lib/format';
import { supplierScope } from '../lib/files';
import { copyPhotosTo, parsePrice } from '../lib/quotes';
import { QuotePhotosInput } from './Quotations';
import { ProductThumb, SupplierLogo } from './ui';
import { toast } from './ui-shared';

export function Dialog({ title, sub, onClose, children, foot }: { title: string; sub?: string; onClose: () => void; children: ReactNode; foot: ReactNode }) {
  return (
    <div className="palette-back" onMouseDown={onClose} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
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

/**
 * Demande de prix (quotation) : photos, désignation, quantité, prix cible facultatif, puis choix des fournisseurs
 * (recherche, rayon, tout cocher). Ouverte depuis la page Offres de prix, ou depuis une fiche produit (pré-remplie).
 */
export function RfqDialog({ product: one, products, onClose }: { product?: Product; products?: Product[]; onClose: (sent?: boolean) => void }) {
  // Plusieurs produits sélectionnés dans le catalogue : une demande par produit, mêmes fournisseurs pour tous
  const items = products?.length ? products : one ? [one] : [];
  const multi = items.length > 1;
  const product = items.length === 1 ? items[0] : undefined;
  const { state, dispatch } = useStore();
  const me = currentUser(state);
  const [name, setName] = useState(product?.name ?? '');
  const [photos, setPhotos] = useState<ProductPhoto[]>(() => (product ? [product.photo, ...(product.photos ?? [])].filter((x): x is ProductPhoto => !!x) : []));
  const [qty, setQty] = useState(product?.targetQty ? String(product.targetQty) : '');
  const [target, setTarget] = useState('');
  const [note, setNote] = useState('');
  const [to, setTo] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [rayon, setRayon] = useState(() => (items.length && items.every((p) => p.rayon === items[0].rayon) ? items[0].rayon : ''));
  // Multi-produits : quantité et prix cible par produit
  const [lines, setLines] = useState<Record<string, { qty: string; target: string }>>(() => Object.fromEntries(items.map((p) => [p.id, { qty: p.targetQty ? String(p.targetQty) : '', target: '' }])));
  const setLine = (id: string, k: 'qty' | 'target', v: string) => setLines({ ...lines, [id]: { ...lines[id], [k]: v } });
  const current = new Set(items.map((p) => p.supplierId));
  const suppliers = state.suppliers.filter((s) => s.active !== false);
  // Rayons travaillés par chaque fournisseur (d'après ses produits au catalogue)
  const rayonsOf = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const p of state.products) m.set(p.supplierId, (m.get(p.supplierId) ?? new Set()).add(p.rayon));
    return m;
  }, [state.products]);
  const rayons = [...new Set(state.products.map((p) => p.rayon))].sort((a, b) => a.localeCompare(b, 'fr'));
  const q = search.trim().toLowerCase();
  const visible = suppliers.filter((s) => (!rayon || rayonsOf.get(s.id)?.has(rayon)) && (!q || `${s.name} ${s.shortName} ${s.city} ${s.country}`.toLowerCase().includes(q)));
  const allOn = visible.length > 0 && visible.every((s) => to.includes(s.id));

  const send = async () => {
    setBusy(true);
    try {
      const now = new Date().toISOString();
      const stamp = Date.now().toString(36).toUpperCase();
      const quotations: Quotation[] = [];
      // Une demande par produit (une seule, saisie à la main, sans produit du catalogue)
      const reqs = multi
        ? items.map((p) => ({ p, name: p.name, photos: [p.photo, ...(p.photos ?? [])].filter((x): x is ProductPhoto => !!x), qty: lines[p.id]?.qty ?? '', target: lines[p.id]?.target ?? '' }))
        : [{ p: product, name: name.trim(), photos, qty, target }];
      for (const [j, r] of reqs.entries()) {
        const group = to.length > 1 ? `G-${stamp}${reqs.length > 1 ? `-${j}` : ''}` : undefined;
        const n = Number(r.qty.replace(/\D/g, '')) || 0;
        for (const sid of to) {
          quotations.push({
            id: newQuoteId(quotations.length),
            kind: 'quotation',
            supplierId: sid,
            origin: 'rfq',
            ...(group ? { group } : {}),
            name: r.name,
            photos: await copyPhotosTo(supplierScope(sid), r.photos),
            ...(r.p ? { emoji: r.p.emoji, sourceProductId: r.p.id } : {}),
            ...(n ? { qty: n } : {}),
            currency: supplierTerms(state, sid).currency,
            ...(parsePrice(r.target) ? { targetPrice: parsePrice(r.target) } : {}),
            ...(note.trim() ? { note: note.trim() } : {}),
            status: 'demande',
            createdAt: now,
            createdBy: me.name,
          });
        }
      }
      dispatch({ type: 'requestQuotes', quotations });
      toast(multi ? `Demande de prix envoyée : ${reqs.length} produits à ${to.length} fournisseur(s)` : `Demande de prix envoyée à ${to.length} fournisseur(s)`);
      onClose(true);
    } catch {
      toast('Envoi impossible : réessayez');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      title="Demande de prix"
      sub={
        multi
          ? `${items.length} produits : chaque fournisseur coché reçoit une demande par produit et répond avec ses prix (négociation possible).`
          : product
            ? `${product.ref} · ${product.name} : chaque fournisseur coché reçoit la demande et répond avec son prix (négociation possible).`
            : 'Chaque fournisseur coché reçoit la demande dans son portail (et par e-mail), et répond avec son prix.'
      }
      onClose={() => onClose()}
      foot={
        <>
          <span>{to.length ? `${to.length} fournisseur(s) sélectionné(s)` : 'Choisissez au moins un fournisseur'}</span>
          <button type="button" className="btn ghost" onClick={() => onClose()}>
            Annuler
          </button>
          <button type="button" className="btn primary" disabled={busy || (!multi && !name.trim()) || !to.length} onClick={send}>
            <Send size={16} /> Envoyer la demande
          </button>
        </>
      }
    >
      {multi ? (
        <div className="bk-wide qt-multi" role="table" aria-label="Produits demandés">
          <div className="qt-multi-row qt-multi-th" role="row">
            <span role="columnheader">Produit</span>
            <span role="columnheader">Quantité (pcs)</span>
            <span role="columnheader">Prix cible</span>
          </div>
          {items.map((p) => (
            <div key={p.id} className="qt-multi-row" role="row">
              <span className="qt-multi-p" role="cell">
                <ProductThumb product={p} size={36} />
                <span>
                  <span className="ref-tag">{p.ref}</span> {p.name}
                </span>
              </span>
              <input className="input" role="cell" inputMode="numeric" aria-label={`Quantité ${p.ref}`} value={lines[p.id]?.qty ?? ''} onChange={(e) => setLine(p.id, 'qty', e.target.value)} />
              <input
                className="input"
                role="cell"
                inputMode="decimal"
                aria-label={`Prix cible ${p.ref}`}
                placeholder="facultatif"
                value={lines[p.id]?.target ?? ''}
                onChange={(e) => setLine(p.id, 'target', e.target.value)}
              />
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="bk-wide">
            <div className="lbl">Photos</div>
            <QuotePhotosInput scope="jonas/demandes-prix" photos={photos} onChange={setPhotos} />
          </div>
          <label className="bk-wide">
            <span>Désignation</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="ex. Coussin extérieur déperlant 45 × 45" />
          </label>
          <label>
            <span>Quantité envisagée (pièces)</span>
            <input className="input" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />
          </label>
          <label>
            <span>Prix cible (facultatif, devise du fournisseur)</span>
            <input className="input" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} />
          </label>
        </>
      )}
      <label className="bk-wide">
        <span>Remarque (matière, conditionnement, délai…)</span>
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <div className="bk-wide">
        <div className="lbl">Fournisseurs qui reçoivent la demande</div>
        <div className="qt-sup-tools">
          <input className="input" placeholder="Rechercher un fournisseur, une ville…" aria-label="Rechercher un fournisseur" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="input" style={{ flex: '0 1 200px' }} aria-label="Rayon" value={rayon} onChange={(e) => setRayon(e.target.value)}>
            <option value="">Tous les rayons</option>
            {rayons.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn ghost"
            disabled={!visible.length}
            onClick={() => setTo(allOn ? to.filter((id) => !visible.some((s) => s.id === id)) : [...new Set([...to, ...visible.map((s) => s.id)])])}
          >
            {allOn ? 'Tout décocher' : `Tout cocher (${visible.length})`}
          </button>
        </div>
        <div className="qt-sups">
          {visible.map((s) => {
            const on = to.includes(s.id);
            return (
              <button key={s.id} type="button" aria-pressed={on} className={`qt-sup-pick ${on ? 'on' : ''}`} onClick={() => setTo(on ? to.filter((x) => x !== s.id) : [...to, s.id])}>
                <SupplierLogo supplier={s} size={26} /> {s.shortName} <small>{supplierTerms(state, s.id).currency}</small>
                {current.has(s.id) && <small className="qt-why">· fournisseur actuel</small>}
              </button>
            );
          })}
          {!visible.length && <span className="muted small">Aucun fournisseur pour ce filtre.</span>}
        </div>
      </div>
    </Dialog>
  );
}

/**
 * Contre-offre en ligne : on tape le prix dans le cadre, puis « Contre-offre » (Entrée marche aussi).
 * L'écart avec le prix du fournisseur s'affiche pendant la saisie ; en négociation, la dernière contre-offre est remplacée.
 */
export function CounterInline({ q, compact }: { q: Quotation; compact?: boolean }) {
  const { dispatch } = useStore();
  const [price, setPrice] = useState('');
  const p = parsePrice(price);
  const gap = p && q.price ? (p / q.price - 1) * 100 : undefined;
  const send = () => {
    if (!p) return;
    dispatch({ type: 'counterQuote', id: q.id, price: p });
    toast(`Contre-offre envoyée : ${money(p, q.currency)}`);
    setPrice('');
  };
  return (
    <span className={`qt-counter-in ${compact ? 'compact' : ''}`}>
      <span className="qt-counter-field">
        <input
          className="qt-price-in"
          inputMode="decimal"
          placeholder={`Prix ${q.currency}`}
          aria-label={`Contre-offre ${q.name}`}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
        />
        {gap !== undefined && (
          <small className={gap < 0 ? 'qtt-down' : 'qtt-up'}>
            {gap < 0 ? '−' : '+'}
            {dec(Math.abs(gap), 1)} %
          </small>
        )}
      </span>
      <button type="button" className={`btn ${compact ? 'sm' : ''}`} disabled={!p} onClick={send}>
        <Handshake size={compact ? 14 : 16} /> Contre-offre
      </button>
    </span>
  );
}

/** Accepter : quantité (et colisage) ; nouveau produit en développement, ou nouveau prix du produit existant ; ajout au panier */
export function AcceptDialog({ q, onClose }: { q: Quotation; onClose: () => void }) {
  const { state, dispatch } = useStore();
  const me = currentUser(state);
  const existing = sameSupplierSource(state, q);
  const [qty, setQty] = useState(String(q.qty ?? 1000));
  const [pcb, setPcb] = useState('');
  const n = Number(qty.replace(/\D/g, '')) || 0;
  const accept = () => {
    const code = existing ? { ref: existing.id, ean: existing.ean } : nextJonasCodes(state, q.supplierId, 1)[0];
    dispatch({ type: 'acceptQuote', id: q.id, ref: code.ref, ean: code.ean, qty: n, pcb: Number(pcb.replace(/\D/g, '')) || undefined });
    setCartQty(me.id, code.ref, n);
    toast(existing ? `Offre acceptée : nouveau prix pour ${code.ref}, ajouté au panier (${num(n)} pcs)` : `Offre acceptée : produit ${code.ref} créé et ajouté au panier (${num(n)} pcs)`);
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
      <p className="small muted bk-wide">
        {existing
          ? `Le produit ${existing.ref} est déjà chez ce fournisseur : son prix d’achat passe à ${money(q.price ?? 0, q.currency)}. La commande se passe ensuite depuis le panier.`
          : 'Le produit est créé au catalogue (en développement) avec ce prix d’achat. La commande se passe ensuite depuis le panier.'}
      </p>
      <label>
        <span>Quantité (pièces)</span>
        <input className="input" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus />
      </label>
      {!existing && (
        <label>
          <span>Colisage (pièces / carton, facultatif)</span>
          <input className="input" inputMode="numeric" value={pcb} onChange={(e) => setPcb(e.target.value)} />
        </label>
      )}
    </Dialog>
  );
}

export function RefuseDialog({ q, onClose }: { q: Quotation; onClose: () => void }) {
  const { dispatch } = useStore();
  const [reason, setReason] = useState('');
  const isRequest = q.status === 'demande' || q.status === 'negociation';
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
