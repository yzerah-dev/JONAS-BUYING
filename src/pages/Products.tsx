import { productSize } from '../lib/productSize';
import { CartButton, CartQty } from '../components/Cart';
import { useCanOrder } from '../lib/cart';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileQuestion, LayoutGrid, List, Search, X } from 'lucide-react';
import { brandOf, byId, canQuote, currentUser, matchTrack, packTrack, productQuantities, TRACK_ORDER, useStore, type TrackFilter } from '../data/store';
import PackTrackDots from '../components/PackTrack';
import { BrandLogo, ProductPic, Pill, ProductThumb, PA } from '../components/ui';
import { num, weekLabel } from '../lib/format';
import FilterChip from '../components/FilterChip';
import PhotoImport from '../components/PhotoImport';
import ProductSheetImport from '../components/ProductSheetImport';
import { RfqDialog } from '../components/QuoteDialogs';

const NO_FILTER = { brand: 'all', rayon: 'all', supplier: 'all', collection: 'all', pack: 'all', dev: 'all', flow: 'all' };

export default function Products() {
  const canOrder = useCanOrder();
  const { state } = useStore();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'galerie' | 'liste'>('galerie');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(60);
  const [f, setF] = useState(NO_FILTER);
  const [sortBy, setSortBy] = useState<'ref' | 'pack'>('ref');
  const pickF = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  // Sélection de produits pour une demande de prix groupée
  const canAsk = canQuote(currentUser(state));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rfq, setRfq] = useState(false);
  const toggle = (id: string) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const Pick = ({ id, label }: { id: string; label: string }) =>
    canAsk ? (
      <label className="pr-pick" onClick={(e) => e.stopPropagation()}>
        <input type="checkbox" checked={selected.has(id)} onChange={() => toggle(id)} aria-label={`Sélectionner ${label}`} />
      </label>
    ) : null;
  const activeFilters = Object.values(f).filter((v) => v !== 'all').length;

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return state.products
      .map((p) => ({ p, qty: productQuantities(state, p.id) }))
      .filter(({ p }) => !s || `${p.ref} ${p.name} ${p.ean} ${p.supplierRef ?? ''}`.toLowerCase().includes(s))
      .filter(({ p }) => f.brand === 'all' || p.brandId === f.brand)
      .filter(({ p }) => f.rayon === 'all' || p.rayon === f.rayon)
      .filter(({ p }) => f.supplier === 'all' || p.supplierId === f.supplier)
      .filter(({ p }) => f.collection === 'all' || p.collection === f.collection)
      .filter(({ p }) => matchTrack(p, f.pack as TrackFilter))
      .filter(({ p }) => f.dev === 'all' || (f.dev === 'dev' ? p.developed : !p.developed))
      .filter(({ qty }) => (f.flow === 'all' ? true : f.flow === 'commande' ? qty.open - qty.inTransit > 0 : f.flow === 'transit' ? qty.inTransit > 0 : qty.stock > 0))
      .sort((a, b) =>
        sortBy === 'pack'
          ? TRACK_ORDER[packTrack(a.p).status] - TRACK_ORDER[packTrack(b.p).status] || Number(packTrack(b.p).dieCutMissing) - Number(packTrack(a.p).dieCutMissing) || a.p.ref.localeCompare(b.p.ref)
          : 0,
      );
  }, [state, q, f, sortBy]);

  const rayons = [...new Set(state.products.map((p) => p.rayon))];
  const collections = [...new Set(state.products.map((p) => p.collection))];

  return (
    <>
      <div className="page-head">
        <h1>Total – Tous les produits</h1>
        <span className="pill green">{state.products.length} références</span>
        <div className="grow" />
        {canOrder && <CartButton />}
        <span className="pr-tools">
          <ProductSheetImport products={state.products} />
          <PhotoImport products={state.products} />
        </span>
        <span className="pfx-seg" role="group" aria-label="Présentation">
          <button type="button" aria-pressed={mode === 'galerie'} className={mode === 'galerie' ? 'on' : ''} onClick={() => setMode('galerie')}>
            <LayoutGrid size={16} /> Galerie
          </button>
          <button type="button" aria-pressed={mode === 'liste'} className={mode === 'liste' ? 'on' : ''} onClick={() => setMode('liste')}>
            <List size={16} /> Liste
          </button>
        </span>
      </div>
      <div className="pr-filters mb">
        <label className="pr-search">
          <Search size={18} />
          <input placeholder="Réf., désignation, EAN…" value={q} onChange={(e) => setQ(e.target.value)} />
          {q && (
            <button type="button" className="fchip-x" aria-label="Effacer la recherche" onClick={() => setQ('')}>
              <X size={14} />
            </button>
          )}
        </label>
        <div className="pr-chips">
          <FilterChip
            label="Fournisseur"
            allLabel="Tous les fournisseurs"
            value={f.supplier}
            onChange={pickF('supplier')}
            options={state.suppliers.map((x) => ({ id: x.id, label: x.shortName, sub: `${x.flag} ${x.city}` }))}
          />
          <FilterChip
            label="Marque"
            allLabel="Toutes les marques"
            value={f.brand}
            onChange={pickF('brand')}
            options={[{ id: '', label: 'À définir' }, ...state.brands.map((b) => ({ id: b.id, label: b.name }))]}
          />
          <FilterChip label="Collection" allLabel="Toutes" value={f.collection} onChange={pickF('collection')} options={collections.map((c) => ({ id: c, label: c }))} />
          <FilterChip label="Rayon" allLabel="Tous les rayons" value={f.rayon} onChange={pickF('rayon')} options={rayons.map((r) => ({ id: r, label: r }))} />
          <FilterChip
            label="Statut du pack"
            allLabel="Tous"
            value={f.pack}
            onChange={pickF('pack')}
            options={[
              { id: 'diecut', label: 'Die cut manquant' },
              { id: 'a_faire', label: 'Pack à faire' },
              { id: 'attente', label: 'Pack en attente de validation' },
              { id: 'a_refaire', label: 'Pack à refaire' },
              { id: 'valide', label: 'Pack validé' },
            ]}
          />
          <FilterChip
            label="Développement"
            allLabel="Tous"
            value={f.dev}
            onChange={pickF('dev')}
            options={[
              { id: 'dev', label: 'Développé' },
              { id: 'todo', label: 'En développement' },
            ]}
          />
          <FilterChip
            label="Commande / stock"
            allLabel="Tous"
            value={f.flow}
            onChange={pickF('flow')}
            options={[
              { id: 'commande', label: 'En commande' },
              { id: 'transit', label: 'En transit' },
              { id: 'stock', label: 'En stock' },
            ]}
          />
          {activeFilters > 0 && (
            <button type="button" className="pr-clear" onClick={() => setF(NO_FILTER)}>
              Effacer ({activeFilters})
            </button>
          )}
          <span className="grow" />
          <FilterChip
            label="Trier"
            clearable={false}
            allId="__"
            value={sortBy}
            onChange={(v) => setSortBy(v as 'ref' | 'pack')}
            options={[
              { id: 'ref', label: 'Tri : référence' },
              { id: 'pack', label: 'Tri : statut du pack' },
            ]}
          />
        </div>
      </div>

      {rows.length === 0 && <div className="card empty">Aucun produit.</div>}

      {mode === 'galerie' ? (
        <div className="gallery">
          {rows.slice(0, limit).map(({ p, qty }) => (
            <div key={p.id} className={`pcard ${selected.has(p.id) ? 'picked' : ''}`} onClick={() => navigate(`/produits/${p.id}`)}>
              <div className="photo" style={{ background: p.tint }}>
                <Pick id={p.id} label={p.ref} />
                <ProductPic product={p} />
              </div>
              <div className="row">
                <BrandLogo brand={brandOf(state.brands, p.brandId)} size={10} />
                <div className="grow" />
                {!p.developed && <Pill color="violet">En dév.</Pill>}
              </div>
              <div>
                <span className="ref-tag">{p.ref}</span> <span className="bold pcard-name">{p.name}</span>
                <div className="muted small">{byId(state.suppliers, p.supplierId).shortName}</div>
              </div>
              <div className="mini-grid">
                <div>
                  <div className="l">PA</div>
                  <div className="v">
                    <PA product={p} />
                  </div>
                </div>
                <div>
                  <div className="l">PCB</div>
                  <div className="v">{p.pcb}</div>
                </div>
                <div>
                  <div className="l">Cmdé</div>
                  <div className="v">{num(qty.ordered)}</div>
                </div>
                <div>
                  <div className="l">Transit</div>
                  <div className="v">{num(qty.inTransit)}</div>
                </div>
                <div>
                  <div className="l">Stock</div>
                  <div className="v">{num(qty.stock)}</div>
                </div>
              </div>
              <div className="row">
                <PackTrackDots p={p} />
                <div className="grow" />
                <span className="small muted">Prochain chgt</span>
                <span className="bold">{qty.nextArrival ? weekLabel(qty.nextArrival) : '—'}</span>
              </div>
              {canOrder && <CartQty p={p} />}
            </div>
          ))}
        </div>
      ) : (
        <div className="card tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                {canAsk && (
                  <th>
                    <input
                      type="checkbox"
                      aria-label="Sélectionner les produits affichés"
                      checked={rows.slice(0, limit).length > 0 && rows.slice(0, limit).every(({ p }) => selected.has(p.id))}
                      onChange={(e) => setSelected(e.target.checked ? new Set([...selected, ...rows.slice(0, limit).map(({ p }) => p.id)]) : new Set())}
                    />
                  </th>
                )}
                <th>Produit</th>
                <th>Taille</th>
                <th>Marque</th>
                <th>Fournisseur</th>
                <th className="num">PA</th>
                <th className="num">PCB</th>
                <th>Suivi pack</th>
                <th className="num">Commandé</th>
                <th className="num">En transit</th>
                <th className="num">En stock</th>
                <th>Prochaine arrivée</th>
                {canOrder && <th>Commander</th>}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, limit).map(({ p, qty }) => (
                <tr key={p.id} className={`clickable ${selected.has(p.id) ? 'picked' : ''}`} onClick={() => navigate(`/produits/${p.id}`)}>
                  {canAsk && (
                    <td>
                      <Pick id={p.id} label={p.ref} />
                    </td>
                  )}
                  <td>
                    <div className="row">
                      <ProductThumb product={p} size={38} />
                      <div>
                        <span className="ref-tag">{p.ref}</span>
                        <div className="small">{p.name}</div>
                      </div>
                    </div>
                  </td>
                  <td className="small pp-size" title={productSize(p)?.fromSupplier ? 'Lue dans le texte du fournisseur' : undefined}>
                    {productSize(p)?.text ?? <span className="muted">—</span>}
                  </td>
                  <td>
                    <BrandLogo brand={brandOf(state.brands, p.brandId)} size={10} />
                  </td>
                  <td>{byId(state.suppliers, p.supplierId).shortName}</td>
                  <td className="num">
                    <PA product={p} />
                  </td>
                  <td className="num">{p.pcb}</td>
                  <td>
                    <PackTrackDots p={p} />
                  </td>
                  <td className="num">{num(qty.ordered)}</td>
                  <td className="num">{num(qty.inTransit)}</td>
                  <td className="num">{num(qty.stock)}</td>
                  <td className="bold">{qty.nextArrival ? weekLabel(qty.nextArrival) : '—'}</td>
                  {canOrder && (
                    <td>
                      <CartQty p={p} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {canAsk && selected.size > 0 && (
        <div className="pr-selbar" role="region" aria-label="Produits sélectionnés">
          <b>{selected.size} produit(s) sélectionné(s)</b>
          <button type="button" className="btn ghost" onClick={() => setSelected(new Set([...selected, ...rows.slice(0, limit).map(({ p }) => p.id)]))}>
            Sélectionner les {Math.min(limit, rows.length)} affichés
          </button>
          <button type="button" className="btn ghost" onClick={() => setSelected(new Set())}>
            <X size={15} /> Vider
          </button>
          <span className="grow" />
          <button type="button" className="btn primary" onClick={() => setRfq(true)}>
            <FileQuestion size={16} /> Demander un prix ({selected.size})
          </button>
        </div>
      )}
      {rfq && (
        <RfqDialog
          products={state.products.filter((p) => selected.has(p.id))}
          onClose={(sent?: boolean) => {
            setRfq(false);
            if (sent) setSelected(new Set());
          }}
        />
      )}
      {rows.length > limit && (
        <button className="btn mt" style={{ alignSelf: 'center', margin: '16px auto 0', display: 'flex' }} onClick={() => setLimit(limit + 60)}>
          Afficher plus ({rows.length - limit} restants)
        </button>
      )}
    </>
  );
}
