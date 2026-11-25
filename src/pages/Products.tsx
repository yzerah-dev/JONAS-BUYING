import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutGrid, List, Search } from 'lucide-react';
import { brandOf, byId, packState, productQuantities, useStore } from '../data/store';
import { BrandLogo, ProductPic, PackPill, Pill, ProductThumb, Seg, PA } from '../components/ui';
import { num, weekLabel } from '../lib/format';
import Combobox from '../components/Combobox';
import PhotoImport from '../components/PhotoImport';

export default function Products() {
  const { state } = useStore();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'galerie' | 'liste'>('galerie');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(60);
  const [f, setF] = useState({ brand: 'all', rayon: 'all', supplier: 'all', collection: 'all', pack: 'all', dev: 'all', flow: 'all' });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return state.products
      .map((p) => ({ p, qty: productQuantities(state, p.id) }))
      .filter(({ p }) => !s || `${p.ref} ${p.name} ${p.ean} ${p.supplierRef ?? ''}`.toLowerCase().includes(s))
      .filter(({ p }) => f.brand === 'all' || p.brandId === f.brand)
      .filter(({ p }) => f.rayon === 'all' || p.rayon === f.rayon)
      .filter(({ p }) => f.supplier === 'all' || p.supplierId === f.supplier)
      .filter(({ p }) => f.collection === 'all' || p.collection === f.collection)
      .filter(({ p }) => f.pack === 'all' || packState(p) === f.pack)
      .filter(({ p }) => f.dev === 'all' || (f.dev === 'dev' ? p.developed : !p.developed))
      .filter(({ qty }) =>
        f.flow === 'all' ? true : f.flow === 'commande' ? qty.open - qty.inTransit > 0 : f.flow === 'transit' ? qty.inTransit > 0 : qty.stock > 0,
      );
  }, [state, q, f]);

  const rayons = [...new Set(state.products.map((p) => p.rayon))];
  const collections = [...new Set(state.products.map((p) => p.collection))];

  return (
    <>
      <div className="page-head">
        <h1>Total – Tous les produits</h1>
        <span className="pill green">{state.products.length} références</span>
        <div className="grow" />
        <PhotoImport products={state.products} />
        <Seg
          value={mode}
          onChange={setMode}
          options={[
            { id: 'galerie', label: 'Galerie', icon: <LayoutGrid size={16} /> },
            { id: 'liste', label: 'Liste', icon: <List size={16} /> },
          ]}
        />
      </div>
      <div className="row wrap mb">
        <div className="search">
          <Search size={16} className="muted" />
          <input placeholder="Réf., désignation, EAN…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="input" value={f.brand} onChange={set('brand')}>
          <option value="all">Marque</option>
          {state.brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <select className="input" value={f.collection} onChange={set('collection')}>
          <option value="all">Collection</option>
          {collections.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select className="input" value={f.rayon} onChange={set('rayon')}>
          <option value="all">Rayon</option>
          {rayons.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
        <div className="combo-filter">
          <Combobox
            value={f.supplier}
            onChange={(v) => setF({ ...f, supplier: v })}
            placeholder="Fournisseur…"
            options={[{ id: 'all', label: 'Tous les fournisseurs' }, ...state.suppliers.map((s) => ({ id: s.id, label: s.shortName, sub: `${s.flag} ${s.city}`, keywords: s.name }))]}
          />
        </div>
        <select className="input" value={f.pack} onChange={set('pack')}>
          <option value="all">État de pack</option>
          <option value="ok">OK</option>
          <option value="en_cours">En cours</option>
          <option value="a_faire">À faire</option>
        </select>
        <select className="input" value={f.dev} onChange={set('dev')}>
          <option value="all">Développé / en dév.</option>
          <option value="dev">Développé</option>
          <option value="todo">En développement</option>
        </select>
        <select className="input" value={f.flow} onChange={set('flow')}>
          <option value="all">Commande / transit / stock</option>
          <option value="commande">En commande</option>
          <option value="transit">En transit</option>
          <option value="stock">En stock</option>
        </select>
      </div>

      {rows.length === 0 && <div className="card empty">Aucun produit.</div>}

      {mode === 'galerie' ? (
        <div className="gallery">
          {rows.slice(0, limit).map(({ p, qty }) => (
            <div key={p.id} className="pcard" onClick={() => navigate(`/produits/${p.id}`)}>
              <div className="photo" style={{ background: p.tint }}>
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
                  <div className="v"><PA product={p} /></div>
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
                <PackPill product={p} prefix />
                <div className="grow" />
                <span className="small muted">Prochain chgt</span>
                <span className="bold">{qty.nextArrival ? weekLabel(qty.nextArrival) : '—'}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Produit</th>
                <th>Marque</th>
                <th>Fournisseur</th>
                <th className="num">PA</th>
                <th className="num">PCB</th>
                <th>État pack</th>
                <th className="num">Commandé</th>
                <th className="num">En transit</th>
                <th className="num">En stock</th>
                <th>Prochaine arrivée</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, limit).map(({ p, qty }) => (
                <tr key={p.id} className="clickable" onClick={() => navigate(`/produits/${p.id}`)}>
                  <td>
                    <div className="row">
                      <ProductThumb product={p} size={38} />
                      <div>
                        <span className="ref-tag">{p.ref}</span>
                        <div className="small">{p.name}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <BrandLogo brand={brandOf(state.brands, p.brandId)} size={10} />
                  </td>
                  <td>{byId(state.suppliers, p.supplierId).shortName}</td>
                  <td className="num"><PA product={p} /></td>
                  <td className="num">{p.pcb}</td>
                  <td>
                    <PackPill product={p} />
                  </td>
                  <td className="num">{num(qty.ordered)}</td>
                  <td className="num">{num(qty.inTransit)}</td>
                  <td className="num">{num(qty.stock)}</td>
                  <td className="bold">{qty.nextArrival ? weekLabel(qty.nextArrival) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > limit && (
        <button className="btn mt" style={{ alignSelf: 'center', margin: '16px auto 0', display: 'flex' }} onClick={() => setLimit(limit + 60)}>
          Afficher plus ({rows.length - limit} restants)
        </button>
      )}
    </>
  );
}
