import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Minus, Plus, ShoppingCart, Trash2, X } from 'lucide-react';
import { byId, currentUser, nextProformaId, purchasePrice, supplierTerms, useStore } from '../data/store';
import type { Product } from '../data/types';
import { setCart, setCartQty, useCart } from '../lib/cart';
import { TODAY, addDays, dec, fdate, money, num } from '../lib/format';
import { ProductThumb } from './ui';
import { toast } from './ui-shared';

/** Commande directe en cartons : gros bouton « + 1 carton », puis − [cartons] + ; pièces et volume affichés */
export function CartQty({ p }: { p: Product }) {
  const { state } = useStore();
  const me = currentUser(state);
  const cart = useCart(me.id);
  const pcb = Math.max(1, p.pcb || 1);
  const pcs = cart[p.id] ?? 0;
  const ctn = Math.ceil(pcs / pcb);
  const setCtn = (n: number) => setCartQty(me.id, p.id, Math.max(0, n) * pcb);
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  if (!ctn)
    return (
      <div className="cart-qty" onClick={stop} onKeyDown={stop}>
        <button type="button" className="cq-add" aria-label={`Ajouter un carton ${p.ref}`} onClick={() => setCtn(1)}>
          <Plus size={18} strokeWidth={3} /> 1 carton
        </button>
        <div className="cq-info muted">
          {num(pcb)} pcs · {dec(p.cbmCarton, 3)} m³ / ctn
        </div>
      </div>
    );
  return (
    <div className="cart-qty on" onClick={stop} onKeyDown={stop}>
      <div className="cq-row">
        <button type="button" className="cq-btn" aria-label={`Retirer un carton ${p.ref}`} onClick={() => setCtn(ctn - 1)}>
          <Minus size={18} strokeWidth={3} />
        </button>
        <label className="cq-field">
          <input className="cq-input" inputMode="numeric" aria-label={`Cartons au panier ${p.ref}`} value={ctn} onChange={(e) => setCtn(Number(e.target.value.replace(/\D/g, '')) || 0)} />
          <span>ctn</span>
        </label>
        <button type="button" className="cq-btn plus" aria-label={`Ajouter un carton ${p.ref}`} onClick={() => setCtn(ctn + 1)}>
          <Plus size={18} strokeWidth={3} />
        </button>
      </div>
      <div className="cq-info">
        {num(ctn * pcb)} pcs · <b>{dec(ctn * p.cbmCarton, 2)} m³</b>
      </div>
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
  let ctn = 0;
  let cbm = 0;
  for (const [id, pcs] of Object.entries(cart)) {
    const p = state.products.find((x) => x.id === id);
    if (!p) continue;
    const c = Math.ceil(pcs / Math.max(1, p.pcb || 1));
    ctn += c;
    cbm += c * p.cbmCarton;
  }
  return (
    <>
      <button type="button" className={`btn ${n ? 'primary' : ''} cart-btn`} onClick={() => setOpen(true)} aria-label={`Panier (${n})`}>
        <ShoppingCart size={16} /> Panier {n > 0 && <b className="cart-count">{n}</b>}
        {n > 0 && (
          <span className="cart-sum">
            {num(ctn)} ctn · {dec(cbm, 1)} m³
          </span>
        )}
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
  // Vider : 1er clic arme le bouton, 2e clic confirme (panier entier « all », ou un fournisseur)
  const [armed, setArmed] = useState<string | null>(null);
  const clear = (supplierId?: string) => {
    const key = supplierId ?? 'all';
    if (armed !== key) return setArmed(key);
    setArmed(null);
    if (!supplierId) {
      setCart(me.id, {});
      toast('Panier vidé');
      return;
    }
    const rest = { ...cart };
    for (const { p } of bySupplier.get(supplierId) ?? []) delete rest[p.id];
    setCart(me.id, rest);
    toast(`${byId(state.suppliers, supplierId).shortName} retiré du panier`);
  };

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
          <div className="row" style={{ gap: 8 }}>
            {items.length > 0 && (
              <button type="button" className={`btn ${armed === 'all' ? 'danger' : 'ghost'}`} onClick={() => clear()} onBlur={() => armed === 'all' && setArmed(null)}>
                <Trash2 size={16} /> {armed === 'all' ? 'Confirmer : tout vider' : 'Vider le panier'}
              </button>
            )}
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Fermer">
              <X size={20} />
            </button>
          </div>
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
                  <button
                    type="button"
                    className={`btn sm ${armed === sid ? 'danger' : 'ghost'}`}
                    aria-label={`Vider ${sup.shortName}`}
                    onClick={() => clear(sid)}
                    onBlur={() => armed === sid && setArmed(null)}
                  >
                    <Trash2 size={14} /> {armed === sid ? 'Confirmer' : 'Vider'}
                  </button>
                </div>
                <table className="tbl mt">
                  <thead>
                    <tr>
                      <th>Produit</th>
                      <th className="num">Cartons</th>
                      <th className="num">Pièces</th>
                      <th className="num">CBM</th>
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
                              aria-label={`Cartons ${p.ref}`}
                              value={Math.ceil(qty / Math.max(1, p.pcb || 1))}
                              onChange={(e) => setCartQty(me.id, p.id, (Number(e.target.value.replace(/\D/g, '')) || 0) * Math.max(1, p.pcb || 1))}
                            />
                          </td>
                          <td className="num">
                            {num(qty)}
                            <div className="xs muted">{p.pcb || 1} pcs/ctn</div>
                          </td>
                          <td className="num">{dec(Math.ceil(qty / Math.max(1, p.pcb || 1)) * p.cbmCarton, 2)}</td>
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
