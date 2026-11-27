import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FileText, LayoutGrid, List, Package, Search } from 'lucide-react';
import { brandOf } from '../data/store';
import { BrandLogo, PA, PackPill, Pill, ProductPic, ProductThumb, ProformaStatusPill, Seg, ValidationCircuit } from '../components/ui';
import ProductPhotoEdit from '../components/ProductPhotoEdit';
import ProductGallery from '../components/ProductGallery';
import PhotoImport from '../components/PhotoImport';
import { money } from '../lib/format';
import { productSize } from '../lib/productSize';
import { useT } from '../i18n';
import { awaitsSupplier, usePortal } from './usePortal';
import SupplierPackRounds from './SupplierPackRounds';
import PackDecision, { LastPackRejection } from './PackDecision';
import ProductChat from '../components/ProductChat';

type Tab = 'all' | 'order' | 'pack' | 'dev';

/** Mes produits : recherche, filtres utiles au fournisseur, et chaque ligne ouvre la fiche */
export function PortalProducts() {
  const { state, products, proformas } = usePortal();
  const { t, fmt } = useT();
  const nav = useNavigate();
  const [tab, setTab] = useState<Tab>('all');
  const [q, setQ] = useState('');
  const [view, setView] = useState<'liste' | 'galerie'>(() => {
    try {
      return localStorage.getItem('jonas-portal-products-view') === 'galerie' ? 'galerie' : 'liste';
    } catch {
      return 'liste';
    }
  });
  const pickView = (v: 'liste' | 'galerie') => {
    setView(v);
    try {
      localStorage.setItem('jonas-portal-products-view', v);
    } catch {
      /* préférence non mémorisée */
    }
  };
  const onOrder = new Set(proformas.filter((p) => p.status !== 'arrive').flatMap((p) => p.lines.map((l) => l.productId)));
  const lists: Record<Tab, typeof products> = {
    all: products,
    order: products.filter((p) => onOrder.has(p.id)),
    pack: products.filter(awaitsSupplier),
    dev: products.filter((p) => !p.developed),
  };
  const needle = q.trim().toLowerCase();
  const list = lists[tab].filter((p) => !needle || [p.ref, p.ean, p.name, p.supplierRef ?? '', p.description?.en ?? ''].some((x) => x.toLowerCase().includes(needle)));
  return (
    <>
      <div className="page-head">
        <h1>{t('products.title', { n: products.length })}</h1>
        <div className="grow" />
        <PhotoImport products={products} />
      </div>
      <div className="row wrap mb" style={{ gap: 12 }}>
        <Seg
          value={tab}
          onChange={setTab}
          options={[
            { id: 'all', label: t('pp.tab.all', { n: lists.all.length }) },
            { id: 'order', label: t('pp.tab.order', { n: lists.order.length }) },
            { id: 'pack', label: t('pp.tab.pack', { n: lists.pack.length }) },
            { id: 'dev', label: t('pp.tab.dev', { n: lists.dev.length }) },
          ]}
        />
        <label className="pp-search">
          <Search size={16} />
          <input className="input" type="search" value={q} placeholder={t('pp.search')} aria-label={t('pp.search')} onChange={(e) => setQ(e.target.value)} />
        </label>
        <div className="grow" />
        <Seg
          value={view}
          onChange={pickView}
          options={[
            { id: 'liste', label: t('pp.view.list'), icon: <List size={15} /> },
            { id: 'galerie', label: t('pp.view.gallery'), icon: <LayoutGrid size={15} /> },
          ]}
        />
      </div>
      {list.length === 0 ? (
        <div className="card empty">{t('pp.empty')}</div>
      ) : view === 'galerie' ? (
        <div className="gallery pp-gallery">
          {list.map((p) => (
            <div
              key={p.id}
              className="pcard"
              role="link"
              tabIndex={0}
              aria-label={`${p.ref} · ${p.name}`}
              onClick={() => nav(`/portail/produits/${p.id}`)}
              onKeyDown={(e) => e.key === 'Enter' && nav(`/portail/produits/${p.id}`)}
            >
              <div className="photo" style={{ background: p.tint }}>
                <ProductPic product={p} />
              </div>
              <div className="row">
                <BrandLogo brand={brandOf(state.brands, p.brandId)} size={10} />
                <div className="grow" />
                {awaitsSupplier(p) ? <Pill color="orange">{t('flow.you')}</Pill> : <PackPill product={p} />}
              </div>
              <div>
                <span className="ref-tag">{p.ref}</span> <span className="bold pcard-name">{p.name}</span>
                {p.supplierRef && (
                  <div className="xs muted">
                    {t('pp.yourRef')} {p.supplierRef}
                  </div>
                )}
                {productSize(p) && (
                  <div className="xs">
                    {t('pp.size')} : <b>{productSize(p)!.text}</b>
                  </div>
                )}
              </div>
              <div className="mini-grid">
                <div>
                  <div className="l">{t('col.pa')}</div>
                  <div className="v">
                    <PA product={p} />
                  </div>
                </div>
                <div>
                  <div className="l">{t('col.pcb')}</div>
                  <div className="v">{p.pcb}</div>
                </div>
                <div>
                  <div className="l">{t('col.cbmCtn')}</div>
                  <div className="v">{fmt.dec(p.cbmCarton, 3)}</div>
                </div>
              </div>
              {!p.developed && <Pill color="violet">{t('pp.inDev')}</Pill>}
            </div>
          ))}
        </div>
      ) : (
        <div className="card tbl-wrap">
          <table className="tbl pp-tbl">
            <thead>
              <tr>
                <th>{t('col.visual')}</th>
                <th>{t('col.ref')}</th>
                <th>{t('col.designation')}</th>
                <th>{t('pp.size')}</th>
                <th>{t('col.brand')}</th>
                <th className="num">{t('col.pa')}</th>
                <th className="num">{t('col.pcb')}</th>
                <th className="num">{t('col.cbmCtn')}</th>
                <th>{t('col.ean')}</th>
                <th>{t('col.packState')}</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr
                  key={p.id}
                  className="clickable"
                  onClick={(e) => {
                    if (!(e.target as HTMLElement).closest('button, a, input, label')) nav(`/portail/produits/${p.id}`);
                  }}
                >
                  <td>
                    <div className="row" style={{ gap: 6 }}>
                      <ProductThumb product={p} size={40} />
                      <ProductPhotoEdit product={p} />
                    </div>
                  </td>
                  <td>
                    <Link to={`/portail/produits/${p.id}`} className="bold">
                      {p.ref}
                    </Link>
                    {p.supplierRef && (
                      <div className="xs muted">
                        {t('pp.yourRef')} {p.supplierRef}
                      </div>
                    )}
                  </td>
                  <td>
                    {p.name}
                    {!p.developed && (
                      <div>
                        <Pill color="violet">{t('pp.inDev')}</Pill>
                      </div>
                    )}
                  </td>
                  <td className="small pp-size">
                    {(() => {
                      const z = productSize(p);
                      return z ? <span title={z.fromSupplier ? t('pp.sizeFromSupplier') : undefined}>{z.text}</span> : <span className="muted">—</span>;
                    })()}
                  </td>
                  <td>
                    <BrandLogo brand={brandOf(state.brands, p.brandId)} size={9} />
                  </td>
                  <td className="num">
                    <PA product={p} />
                  </td>
                  <td className="num">{p.pcb}</td>
                  <td className="num">{fmt.dec(p.cbmCarton, 3)}</td>
                  <td className="small">{p.ean}</td>
                  <td>{awaitsSupplier(p) ? <Pill color="orange">{t('flow.you')}</Pill> : <PackPill product={p} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/** Fiche produit du fournisseur : photos, informations, pack à valider et commandes */
export function PortalProductDetail() {
  const { id } = useParams();
  const { state, products, proformas } = usePortal();
  const { t, td, fmt } = useT();
  const p = products.find((x) => x.id === id) ?? products.find((x) => x.ref === id);
  if (!p)
    return (
      <div className="card empty">
        {t('pp.notFound')}{' '}
        <Link to="/portail/produits" className="bold">
          {t('pp.back')}
        </Link>
      </div>
    );
  const orders = proformas.filter((pf) => pf.lines.some((l) => l.productId === p.id)).sort((a, b) => b.etd.localeCompare(a.etd));
  const info: [string, React.ReactNode][] = [
    [t('pp.refJonas'), <b key="r">{p.ref}</b>],
    [t('pp.yourRef'), p.supplierRef ?? '—'],
    [t('pp.ean'), p.ean],
    [t('pp.brand'), <BrandLogo key="b" brand={brandOf(state.brands, p.brandId)} size={10} />],
    [t('pp.pa'), <PA key="pa" product={p} />],
    [t('pp.pcb'), p.pcb],
    [t('pp.cbm'), fmt.dec(p.cbmCarton, 3)],
    [t('pp.weight'), p.weight ? `${fmt.dec(p.weight, 2)} kg` : '—'],
    [t('pp.material'), td(p.material)],
    ...(productSize(p) ? ([[t('pp.size'), productSize(p)!.text]] as [string, React.ReactNode][]) : []),
  ];
  return (
    <>
      <Link to="/portail/produits" className="small muted row" style={{ gap: 4, marginBottom: 8 }}>
        <ArrowLeft size={14} /> {t('pp.back')}
      </Link>
      <div className="page-head">
        <div>
          <h1>
            {p.ref} · {p.name}
          </h1>
          <div className="page-sub">{!p.developed ? <Pill color="violet">{t('pp.inDev')}</Pill> : <PackPill product={p} prefix />}</div>
        </div>
      </div>
      <div className="pp-detail">
        <div className="col" style={{ gap: 16 }}>
          <div className="card pad">
            <ProductGallery product={p} />
          </div>
          <ProductChat p={p} />
        </div>
        <div className="col" style={{ gap: 16 }}>
          <section className="card pad" aria-label={t('pp.info')}>
            <div className="card-title">{t('pp.info')}</div>
            <dl className="pp-info">
              {info.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            <div className="bold small mt">{t('pp.description')}</div>
            <p className="small pp-desc">{p.description?.en || p.description?.fr || <span className="muted">{t('pp.noDesc')}</span>}</p>
          </section>
          <section className={`card pad ${awaitsSupplier(p) ? 'pp-await' : ''}`} aria-label={t('pp.pack')}>
            <div className="card-title">
              <Package size={18} className="green" /> {t('pp.pack')}
            </div>
            <div className="xs muted mb">{t('pp.deadline', { date: fmt.fdate(p.pack.artworkDeadline) })}</div>
            <SupplierPackRounds product={p} />
            <div className="sr-valid">
              <ValidationCircuit product={p} />
              <LastPackRejection product={p} />
              <div className="row" style={{ justifyContent: 'flex-end' }}>
                <PackDecision product={p} />
              </div>
            </div>
          </section>
        </div>
      </div>
      <section className="card pad mt" aria-label={t('pp.orders')}>
        <div className="card-title">
          <FileText size={18} className="green" /> {t('pp.orders')}
        </div>
        {orders.length === 0 ? (
          <p className="small muted">{t('pp.noOrders')}</p>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>{t('col.proforma')}</th>
                  <th className="num">{t('col.qty')}</th>
                  <th className="num">{t('col.price')}</th>
                  <th>{t('col.etd')}</th>
                  <th>{t('col.status')}</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((pf) => {
                  const l = pf.lines.find((x) => x.productId === p.id)!;
                  return (
                    <tr key={pf.id}>
                      <td>
                        <Link to={`/portail/proformas?pf=${pf.id}`} className="bold">
                          {pf.id}
                        </Link>
                      </td>
                      <td className="num">{fmt.num(l.qty)}</td>
                      <td className="num">{money(l.price, pf.currency ?? 'EUR')}</td>
                      <td>
                        {fmt.weekLabel(pf.etd)} · {fmt.fshort(pf.etd)}
                      </td>
                      <td>
                        <ProformaStatusPill status={pf.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
