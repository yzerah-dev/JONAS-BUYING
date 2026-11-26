import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Minus, Plus, ShoppingCart, Trash2, X } from 'lucide-react';
import { byId, currentUser, nextProformaId, purchasePrice, supplierTerms, useStore } from '../data/store';
import type { Product } from '../data/types';
import { setCart, setCartQty, useCart } from '../lib/cart';
import { TODAY, addDays, dec, fdate, money, num } from '../lib/format';
import { ProductThumb } from './ui';
import { toast } from './ui-shared';

/** − [quantité] + : ajoute au panier par carton (PCB) ; on peut aussi taper la quantité */
export function CartQty({ p }: { p: Product }) {
  const { state } = useStore();
  const me = currentUser(state);
  const cart = useCart(me.id);
  const q = cart[p.id] ?? 0;
  const step = Math.max(1, p.pcb || 1);
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return (
    <div className={`cart-qty ${q ? 'on' : ''}`} onClick={stop} onKeyDown={stop}>
      {q > 0 && (
        <button type="button" className="cq-btn" aria-label={`Retirer un carton ${p.ref}`} onClick={() => setCartQty(me.id, p.id, q - step)}>
          <Minus size={14} />
        </button>
      )}
      {q > 0 && (
        <input
          className="cq-input"
          inputMode="numeric"
          aria-label={`Quantité au panier ${p.ref}`}
          value={q}
          onChange={(e) => setCartQty(me.id, p.id, Number(e.target.value.replace(/\D/g, '')) || 0)}
        />
      )}
      <button
        type="button"
        className="cq-btn plus"
        aria-label={`Ajouter un carton ${p.ref}`}
        title={`+ 1 carton (${step} pcs)`}
        onClick={() => {
          setCartQty(me.id, p.id, q + step);
          if (!q) toast(`${p.ref} ajouté au panier (${step} pcs)`);
        }}
      >
        <Plus size={15} />
        {!q && <span>Commander</span>}
      </button>
    </div>
  );
}

/** Bouton « Panier (n) » et fenêtre de validation des commandes, une par fournisseur */
export function CartButton() {
  const { state } = useStore();
  const me = currentUser(state);
  const cart = useCart(me.id);
  const [open, setOpen] = useState(false);
  const n = Object.keys(cart).length;
  return (
    <>
      <button type="button" className={`btn ${n ? 'primary' : ''} cart-btn`} onClick={() => setOpen(true)} aria-label={`Panier (${n})`}>
        <ShoppingCart size={16} /> Panier {n > 0 && <b className="cart-count">{n}</b>}
      </button>
      {open && <CartDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function CartDialog({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useStore();
  const navigate = useNavigate();
  const me = currentUser(state);
  const cart = useCart(me.id);
  const items = Object.entries(cart)
    .map(([id, qty]) => ({ p: state.products.find((x) => x.id === id), qty }))
    .filter((x): x is { p: Product; qty: number } => !!x.p);
  const bySupplier = new Map<string, { p: Product; qty: number }[]>();
  for (const it of items) bySupplier.set(it.p.supplierId, [...(bySupplier.get(it.p.supplierId) ?? []), it]);
  const [etd, setEtd] = useState<Record<string, string>>({});
  const [title, setTitle] = useState<Record<string, string>>({});

  const order = (supplierId: string) => {
    const list = bySupplier.get(supplierId)!;
    const id = nextProformaId(state);
    const d = etd[supplierId] || addDays(TODAY, 70);
    const sup = byId(state.suppliers, supplierId);
    dispatch({
      type: 'createProforma',
      id,
      supplierId,
      title: (title[supplierId] || `Commande ${sup.shortName} ${fdate(TODAY)}`).trim(),
      etd: d,
      eta: addDays(d, 35),
      lines: list.map(({ p, qty }) => ({ productId: p.id, qty, price: purchasePrice(state, p.id).price })),
      order: { source: 'panier' },
    });
    const rest = { ...cart };
    for (const { p } of list) delete rest[p.id];
    setCart(me.id, rest);
    toast(`Commande ${id} passée : ${sup.shortName} reçoit la demande de proforma dans son portail`);
    if (!Object.keys(rest).length) {
      onClose();
      navigate(`/proformas/${id}`);
    }
  };

  return (
    <div className="palette-back" onMouseDown={onClose}>
      <div className="card rc-dialog bk-dialog np-dialog" role="dialog" aria-label="Panier" onMouseDown={(e) => e.stopPropagation()}>
        <header className="rc-head">
          <div>
            <h2>Panier</h2>
            <span className="muted small">Une commande par fournisseur : il reçoit la demande de proforma dans son portail.</span>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fermer">
            <X size={20} />
          </button>
        </header>
        <div className="bk-form" style={{ display: 'grid', gap: 14 }}>
          {!items.length && <p className="muted">Panier vide : utilisez « + Commander » sur les produits.</p>}
          {[...bySupplier.entries()].map(([sid, list]) => {
            const sup = byId(state.suppliers, sid);
            const cur = supplierTerms(state, sid).currency;
            const total = list.reduce((t, { p, qty }) => t + qty * purchasePrice(state, p.id).price, 0);
            const cbm = list.reduce((t, { p, qty }) => t + (p.pcb ? (qty / p.pcb) * p.cbmCarton : 0), 0);
            const fid = sid.replace(/\W/g, '');
            return (
              <section key={sid} className="card pad cart-sup bk-wide" aria-label={`Commande ${sup.shortName}`}>
                <div className="row wrap" style={{ gap: 8 }}>
                  <b style={{ fontSize: 16 }}>
                    {sup.flag} {sup.name}
                  </b>
                  <span className="pill grey">{list.length} produit(s)</span>
                  <div className="grow" />
                  <span className="small">
                    {dec(cbm, 1)} m³ · <b>{money(total, cur)}</b>
                  </span>
                </div>
                <table className="tbl mt">
                  <thead>
                    <tr>
                      <th>Produit</th>
                      <th className="num">Qté (pcs)</th>
                      <th className="num">Cartons</th>
                      <th className="num">PA</th>
                      <th className="num">Montant</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {list.map(({ p, qty }) => {
                      const pa = purchasePrice(state, p.id);
                      return (
                        <tr key={p.id}>
                          <td>
                            <div className="row" style={{ gap: 8 }}>
                              <ProductThumb product={p} size={34} />
                              <div>
                                <span className="ref-tag">{p.ref}</span>
                                <div className="xs">{p.name.slice(0, 60)}</div>
                              </div>
                            </div>
                          </td>
                          <td className="num">
                            <input
                              className="input alloc-input"
                              inputMode="numeric"
                              aria-label={`Quantité ${p.ref}`}
                              value={qty}
                              onChange={(e) => setCartQty(me.id, p.id, Number(e.target.value.replace(/\D/g, '')) || 0)}
                            />
                          </td>
                          <td className="num">
                            {p.pcb ? num(Math.ceil(qty / p.pcb)) : '—'}
                            {p.pcb > 1 && qty % p.pcb !== 0 && (
                              <div className="xs" style={{ color: '#b45309' }}>
                                carton entamé
                              </div>
                            )}
                          </td>
                          <td className="num">{money(pa.price, pa.currency)}</td>
                          <td className="num">{money(qty * pa.price, pa.currency)}</td>
                          <td>
                            <button type="button" className="icon-btn danger-ico" aria-label={`Retirer ${p.ref} du panier`} onClick={() => setCartQty(me.id, p.id, 0)}>
                              <Trash2 size={15} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="row wrap mt" style={{ gap: 10, alignItems: 'flex-end' }}>
                  <label htmlFor={`ct-t-${fid}`} className="grow">
                    Intitulé
                    <input
                      id={`ct-t-${fid}`}
                      className="input"
                      placeholder={`Commande ${sup.shortName} ${fdate(TODAY)}`}
                      value={title[sid] ?? ''}
                      onChange={(e) => setTitle({ ...title, [sid]: e.target.value })}
                    />
                  </label>
                  <label htmlFor={`ct-d-${fid}`}>
                    Chargement souhaité
                    <input id={`ct-d-${fid}`} className="input" type="date" value={etd[sid] ?? addDays(TODAY, 70)} onChange={(e) => setEtd({ ...etd, [sid]: e.target.value })} />
                  </label>
                  <button type="button" className="btn primary" onClick={() => order(sid)}>
                    Valider la commande · demander la proforma
                  </button>
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
