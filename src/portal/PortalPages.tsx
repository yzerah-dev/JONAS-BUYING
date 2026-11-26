import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Boxes, Calendar, Check, Container as Ctn, Download, Euro, FileText, Package, Pencil, Scissors, Send, Ship, Truck, Upload } from 'lucide-react';
import {
  allocatedQty,
  byId,
  containerCbm,
  containerEta,
  containerEtd,
  containerProformas,
  containerQty,
  lineCbm,
  pfContainers,
  pendingVersion,
  shipmentsOf,
  signedVersion,
  containerCapacity,
  defaultForwarder,
  payments,
  proformaTotals,
  brandOf,
} from '../data/store';
import SupplierPackFiles from './SupplierPackFiles';
import { BrandLogo, ContainerStatusPill, Kpi, PackPill, Pill, ProductThumb, ProformaStatusPill, Seg, ValidationCircuit } from '../components/ui';
import { toast } from '../components/ui-shared';
import type { Proforma } from '../data/types';
import BookingEntry from '../components/BookingEntry';
import ProformaVersions from '../components/ProformaVersions';
import ShipmentsPanel from '../components/Shipments';
import { NewProformaButton } from '../components/NewProforma';
import BookingReview, { LastRejection } from '../components/BookingReview';
import { LogisticsTab } from '../pages/ProformaDetail';
import { TODAY } from '../lib/format';
import { useT } from '../i18n';
import { usePortal } from './usePortal';
import PortalFlow from './PortalFlow';
export { PortalProducts, PortalProductDetail } from './PortalProduct';
import PackDecision, { LastPackRejection } from './PackDecision';
import { money } from '../lib/format';
import { fxOf } from '../data/store';

/** Montants par devise (jamais convertis) : « 12 000,00 USD + 3 000,00 € » */
function sumByCurrency(items: { cur: string; v: number }[]) {
  const by = new Map<string, number>();
  for (const x of items) by.set(x.cur, (by.get(x.cur) ?? 0) + x.v);
  if (!by.size) return money(0, 'EUR');
  return [...by].map(([c, v]) => money(Math.round(v), c).replace(/,00(?=\s|$)/, '')).join(' + ');
}

/** Échéance JONAS exprimée dans la devise de la proforma */
function usePayCurrency() {
  const { state } = usePortal();
  return (p: { proformaId: string; amount: number }) => {
    const pf = state.proformas.find((x) => x.id === p.proformaId);
    const fx = pf ? fxOf(state, pf) : 1;
    return { cur: pf?.currency ?? 'EUR', v: p.amount / fx };
  };
}
function usePayMoney() {
  const cur = usePayCurrency();
  return (p: { proformaId: string; amount: number }) => {
    const c = cur(p);
    return money(c.v, c.cur);
  };
}

// ---------------------------------------------------------------------------
export function PortalHome() {
  const { state, supplier, user, products, proformas, containers, packsToValidate, dieCutsRequested, bookingsToDo, bookingsToAccept, proformasToUpload, splitsToAccept, docsMissing } = usePortal();
  const pays = payments(state).filter((p) => p.supplierId === supplier!.id);
  const nextPay = pays.find((p) => !p.paid);
  const payMoney = usePayMoney();
  const amount = sumByCurrency(proformas.map((p) => ({ cur: p.currency ?? 'EUR', v: proformaTotals(state, p).amountCur })));
  const { t: tr, td, fmt } = useT();
  const { fdate, weekLabel } = fmt;

  const todo: { to: string; icon: React.ReactNode; text: string; n: number }[] = [
    {
      to: proformasToUpload[0] ? `/portail/proformas?pf=${proformasToUpload[0].id}` : '/portail/proformas',
      icon: <FileText size={16} className="orange" />,
      text: tr('home.todo.pfUpload'),
      n: proformasToUpload.length,
    },
    {
      to: splitsToAccept[0] ? `/portail/proformas?pf=${splitsToAccept[0].id}` : '/portail/proformas',
      icon: <Truck size={16} className="orange" />,
      text: tr('home.todo.split'),
      n: splitsToAccept.length,
    },
    { to: '/portail/packs', icon: <Package size={16} className="orange" />, text: tr('home.todo.packs'), n: packsToValidate.length },
    { to: '/portail/packs?vue=diecut', icon: <Scissors size={16} className="orange" />, text: tr('home.todo.diecuts'), n: dieCutsRequested.length },
    { to: '/portail/booking', icon: <Calendar size={16} className="orange" />, text: tr('home.todo.booking'), n: bookingsToDo.length + bookingsToAccept.length },
    { to: '/portail/conteneurs', icon: <FileText size={16} className="red" />, text: tr('home.todo.docs'), n: docsMissing.length },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{tr('home.welcome', { name: user.name })}</h1>
          <div className="page-sub">{tr('home.sub', { supplier: supplier!.name, date: fdate(TODAY), week: weekLabel(TODAY) })}</div>
        </div>
      </div>
      <div className="kpis mb">
        <Kpi icon={<Boxes size={18} />} value={products.length} label={tr('home.kpi.products')} />
        <Kpi icon={<FileText size={18} />} value={proformas.length} label={tr('home.kpi.proformas')} />
        <Kpi icon={<Ctn size={18} />} value={containers.length} label={tr('home.kpi.containers')} />
        <Kpi icon={<AlertTriangle size={18} />} value={todo.reduce((n, x) => n + x.n, 0)} label={tr('home.kpi.todo')} color="orange" />
        <Kpi icon={<Euro size={18} />} value={amount} label={tr('home.kpi.amount')} />
      </div>
      <div className="card pad mb">
        <div className="card-title">
          <AlertTriangle size={18} className="orange" /> {tr('home.todo.title')}
        </div>
        {todo.every((t) => !t.n) && <p className="small muted">{tr('home.allDone')}</p>}
        {todo
          .filter((t) => t.n)
          .map((t) => (
            <Link key={t.to} to={t.to} className="alert-line">
              {t.icon}
              <span className="bold" style={{ minWidth: 22 }}>
                {t.n}
              </span>
              {t.text}
              <span className="grow" />›
            </Link>
          ))}
        {nextPay && (
          <div className="pill green mt" style={{ width: '100%', justifyContent: 'space-between', padding: 10, borderRadius: 10 }}>
            <span>{tr('home.nextPay', { kind: td(nextPay.kind), pf: nextPay.proformaId, date: fdate(nextPay.due) })}</span>
            <span>{payMoney(nextPay)}</span>
          </div>
        )}
      </div>
      <PortalFlow />
    </>
  );
}

// ---------------------------------------------------------------------------
export function PortalProformas() {
  const { state, proformas } = usePortal();
  const [params, setParams] = useSearchParams();
  const openId = params.get('pf');
  const { t: tr, fmt } = useT();
  const { dec, fdate, fshort, num, weekLabel } = fmt;
  return (
    <>
      <div className="page-head">
        <h1>{tr('proformas.title', { n: proformas.length })}</h1>
        <div className="grow" />
        <NewProformaButton className="btn primary" onCreated={(id) => setParams({ pf: id })} />
      </div>
      {[...proformas]
        .sort((a, b) => b.etd.localeCompare(a.etd))
        .map((pf) => {
          const t = proformaTotals(state, pf);
          const open = openId === pf.id;
          return (
            <div key={pf.id} className="card week">
              <div className={`week-head ${open ? 'open' : ''}`} onClick={() => setParams(open ? {} : { pf: pf.id })}>
                <div className="cal-icon">
                  <FileText size={22} />
                </div>
                <div style={{ minWidth: 170 }}>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{pf.id}</div>
                  <div className="muted small">
                    {pf.poNumber} · {fdate(pf.date)}
                  </div>
                </div>
                <ProformaStatusPill status={pf.status} />
                {shipmentsOf(state, pf).length > 1 && <Pill color="violet">{tr('sp.part', { n: pf.split?.part ?? 1, total: shipmentsOf(state, pf).length })}</Pill>}
                {pf.splitRequest && <Pill color="orange">{tr('sp.split')}</Pill>}
                {pf.status === 'a_signer' && !pendingVersion(pf) && <Pill color="orange">{tr('pv.toUpload')}</Pill>}
                {pendingVersion(pf) && <Pill color="violet">{signedVersion(pf) ? tr('pv.pendingRevision', { n: pendingVersion(pf)!.version }) : tr('pv.st.a_signer')}</Pill>}
                <div className="grow" />
                <div className="metric">
                  <div className="l">{tr('col.etd')}</div>
                  <div className="v" style={{ fontSize: 16 }}>
                    {weekLabel(pf.etd)} · {fshort(pf.etd)}
                  </div>
                </div>
                <div className="metric">
                  <div className="l">{tr('col.eta')}</div>
                  <div className="v" style={{ fontSize: 16 }}>
                    {weekLabel(pf.eta)} · {fshort(pf.eta)}
                  </div>
                </div>
                <div className="metric">
                  <div className="l">{tr('col.cbm')}</div>
                  <div className="v" style={{ fontSize: 16 }}>
                    {dec(t.cbm)}
                  </div>
                </div>
                <div className="metric">
                  <div className="l">{tr('col.amount')}</div>
                  <div className="v" style={{ fontSize: 16 }}>
                    {money(t.amountCur, t.currency)}
                  </div>
                </div>
              </div>
              {open && (
                <div style={{ padding: 16 }}>
                  <div className="mb">
                    <ProformaVersions pf={pf} />
                  </div>
                  <div className="mb">
                    <ShipmentsPanel pf={pf} />
                  </div>
                  <div className="tbl-wrap">
                    <table className="tbl">
                      <thead>
                        <tr>
                          <th>{tr('col.product')}</th>
                          <th className="num">{tr('col.price')}</th>
                          <th className="num">{tr('col.qty')}</th>
                          <th className="num">{tr('col.cbm')}</th>
                          <th className="num">{tr('col.amount')}</th>
                          <th className="num">{tr('col.loaded')}</th>
                          <th>{tr('col.artworkDeadline')}</th>
                          <th>{tr('col.packState')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pf.lines.map((l) => {
                          const p = byId(state.products, l.productId);
                          return (
                            <tr key={p.id}>
                              <td>
                                <div className="row">
                                  <ProductThumb product={p} size={34} />
                                  <div>
                                    <span className="ref-tag">{p.ref}</span>
                                    <div className="small">{p.name}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="num">{money(l.price, t.currency)}</td>
                              <td className="num">{num(l.qty)}</td>
                              <td className="num">{dec(lineCbm(p, l.qty), 2)}</td>
                              <td className="num">{money(l.qty * l.price, t.currency)}</td>
                              <td className="num">{num(allocatedQty(state, pf.id, p.id))}</td>
                              <td>{fdate(p.pack.artworkDeadline)}</td>
                              <td>
                                <PackPill product={p} />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="row wrap mt">
                    {pf.documents.map((d) => (
                      <button key={d} className="btn sm" onClick={() => toast(tr('proformas.download', { file: d }))}>
                        <Download size={13} /> {d}
                      </button>
                    ))}
                    <div className="grow" />
                    {!['en_transit', 'arrive'].includes(pf.status) && (
                      <Link to={`/portail/chargement?pf=${pf.id}`} className="btn primary sm">
                        <Truck size={13} /> {tr('proformas.loadingPlan')}
                      </Link>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
    </>
  );
}

// ---------------------------------------------------------------------------
export function PortalPacks() {
  const { state, products, packsToValidate, dieCutsRequested } = usePortal();
  const [params, setParams] = useSearchParams();
  const view = (params.get('vue') as 'valider' | 'diecut' | 'tous' | null) ?? 'valider';
  const list = (view === 'valider' ? packsToValidate : view === 'diecut' ? dieCutsRequested : products).slice().sort((a, b) => a.pack.artworkDeadline.localeCompare(b.pack.artworkDeadline));
  const [limit, setLimit] = useState(30);
  const { t, td, fmt } = useT();
  const { fdate } = fmt;
  return (
    <>
      <div className="page-head">
        <h1>{t('packs.title')}</h1>
        <span className="page-sub">{t('packs.sub')}</span>
      </div>
      <div className="mb">
        <Seg
          value={view}
          onChange={(v) => setParams({ vue: v })}
          options={[
            { id: 'valider', label: t('packs.tab.validate', { n: packsToValidate.length }) },
            { id: 'diecut', label: t('packs.tab.diecut', { n: dieCutsRequested.length }) },
            { id: 'tous', label: t('packs.tab.all', { n: products.length }) },
          ]}
        />
      </div>
      {list.length === 0 && <div className="card empty">{t('packs.empty')}</div>}
      <div className="gallery" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
        {list.slice(0, limit).map((p) => {
          return (
            <div key={p.id} className="card pad col" style={{ gap: 10 }}>
              <div className="row">
                <ProductThumb product={p} size={56} />
                <div className="grow">
                  <Link to={`/portail/produits/${p.id}`} className="ref-tag">
                    {p.ref}
                  </Link>
                  <div className="bold">{p.name}</div>
                  <div className="xs muted">{t('packs.deadline', { type: td(p.pack.type), date: fdate(p.pack.artworkDeadline) })}</div>
                </div>
                <BrandLogo brand={brandOf(state.brands, p.brandId)} size={10} />
              </div>
              <ValidationCircuit product={p} />
              <LastPackRejection product={p} />
              <div className="row wrap">
                <span className="small">{t('packs.dieCut')}</span>
                {p.pack.dieCut === 'received' ? (
                  <Pill color="green">{t('packs.dieCut.sent')}</Pill>
                ) : p.pack.dieCut === 'requested' ? (
                  <Pill color="orange">{t('packs.dieCut.requested')}</Pill>
                ) : (
                  <Pill color="grey">{t('packs.dieCut.none')}</Pill>
                )}
                <span className="small">{t('packs.pack')}</span>
                {p.pack.sentToSupplier ? <Pill color="blue">{t('packs.received', { v: p.pack.artworkVersions })}</Pill> : <Pill color="grey">{t('packs.preparing')}</Pill>}
              </div>
              <div className="row wrap">
                {/* Fichiers : télécharger le pack JONAS ; déposer die cut, ancien pack, fiches qualité */}
                <SupplierPackFiles product={p} label={p.pack.dieCut === 'requested' ? t('packs.sendDieCut') : undefined} />
                <div className="grow" />
                <PackDecision product={p} />
              </div>
            </div>
          );
        })}
      </div>
      {list.length > limit && (
        <button className="btn mt" style={{ margin: '16px auto 0', display: 'flex' }} onClick={() => setLimit(limit + 30)}>
          {t('packs.more', { n: list.length - limit })}
        </button>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
export function PortalLoading() {
  const { proformas, bookingsToDo } = usePortal();
  const open = proformas.filter((p) => !['en_transit', 'arrive'].includes(p.status));
  const [params, setParams] = useSearchParams();
  // Proforma affichée par défaut figée à l'ouverture
  const [initialPf] = useState(bookingsToDo[0]?.id ?? open[0]?.id);
  const pfId = params.get('pf') ?? initialPf;
  const pf = open.find((p) => p.id === pfId);
  const { t } = useT();
  return (
    <>
      <div className="page-head">
        <h1>{t('loading.title')}</h1>
        <span className="page-sub">{t('loading.sub')}</span>
      </div>
      {bookingsToDo.length > 0 && (
        <Link to="/portail/booking" className="card pad mb row wrap" style={{ borderColor: 'var(--orange)' }}>
          <AlertTriangle className="orange" />
          <b>{t('loading.bookingAlert')}</b>
          {bookingsToDo.map((p) => (
            <Pill key={p.id} color="orange">
              {p.id} · {p.booking!.containers} × 40HC
            </Pill>
          ))}
        </Link>
      )}
      <div className="row wrap mb">
        <span className="small muted">{t('loading.proforma')}</span>
        <Seg value={pfId ?? ''} onChange={(v) => setParams({ pf: v })} options={open.map((p) => ({ id: p.id, label: p.id }))} />
      </div>
      {pf ? <LogisticsTab pf={pf} portal /> : <div className="card empty">{t('loading.none')}</div>}
    </>
  );
}

// ---------------------------------------------------------------------------
export function PortalContainers() {
  const { state, dispatch, containers, REQUIRED_DOCS } = usePortal();
  const { t, fmt } = useT();
  const { fshort, m3, num, weekLabel } = fmt;
  return (
    <>
      <div className="page-head">
        <h1>{t('containers.title')}</h1>
        <span className="page-sub">{t('containers.sub')}</span>
      </div>
      <div className="card tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>{t('col.container')}</th>
              <th>{t('col.booking')}</th>
              <th>{t('col.proformas')}</th>
              <th className="num">{t('col.qty')}</th>
              <th className="num">{t('col.cbm')}</th>
              <th>{t('col.etd')}</th>
              <th>{t('col.eta')}</th>
              <th>{t('col.status')}</th>
              <th>{t('col.documents')}</th>
            </tr>
          </thead>
          <tbody>
            {[...containers]
              .sort((a, b) => containerEtd(b).localeCompare(containerEtd(a)))
              .map((c) => {
                const docsOpen = ['booke', 'en_transit'].includes(c.status);
                return (
                  <tr key={c.id}>
                    <td className="bold">{c.number ?? c.id}</td>
                    <td>{c.bookingNo ?? '—'}</td>
                    <td className="small">{containerProformas(c).join(', ')}</td>
                    <td className="num">{num(containerQty(c))}</td>
                    <td className="num">{m3(containerCbm(state, c))}</td>
                    <td className="small">
                      {weekLabel(containerEtd(c))} – {fshort(containerEtd(c))}
                    </td>
                    <td className="small">
                      {weekLabel(containerEta(c))} – {fshort(containerEta(c))}
                    </td>
                    <td>
                      <ContainerStatusPill status={c.status} />
                    </td>
                    <td>
                      <div className="row wrap" style={{ gap: 4 }}>
                        {REQUIRED_DOCS.map((d) =>
                          c.documents.includes(d) ? (
                            <Pill key={d} color="green" icon={<Check size={11} />}>
                              {d.split('.')[0]}
                            </Pill>
                          ) : docsOpen ? (
                            <button
                              key={d}
                              className="btn sm"
                              onClick={() => {
                                dispatch({ type: 'addContainerDoc', containerId: c.id, doc: d });
                                toast(t('containers.uploaded', { doc: d }));
                              }}
                            >
                              <Upload size={12} /> {d.split('.')[0]}
                            </button>
                          ) : null,
                        )}
                        {!docsOpen && !REQUIRED_DOCS.some((d) => c.documents.includes(d)) && <span className="xs muted">{t('containers.afterBooking')}</span>}
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
export function PortalFinance() {
  const { state, supplier } = usePortal();
  const pays = payments(state).filter((p) => p.supplierId === supplier!.id);
  const payMoney = usePayMoney();
  const cur = usePayCurrency();
  const paid = sumByCurrency(pays.filter((p) => p.paid).map((p) => cur(p)));
  const open = sumByCurrency(pays.filter((p) => !p.paid).map((p) => cur(p)));
  const { t, td, fmt } = useT();
  const { fdate } = fmt;
  return (
    <>
      <div className="page-head">
        <h1>{t('finance.title')}</h1>
      </div>
      <div className="kpis mb">
        <Kpi icon={<Check size={18} />} value={paid} label={t('finance.received')} />
        <Kpi icon={<Euro size={18} />} value={open} label={t('finance.open')} color="orange" />
      </div>
      <div className="card tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>{t('pb.proforma')}</th>
              <th>{t('col.type')}</th>
              <th className="num">{t('col.amount')}</th>
              <th>{t('col.due')}</th>
              <th>{t('col.status')}</th>
            </tr>
          </thead>
          <tbody>
            {pays.map((p) => (
              <tr key={p.proformaId + p.kind}>
                <td className="bold">{p.proformaId}</td>
                <td>{td(p.kind)}</td>
                <td className="num">{payMoney(p)}</td>
                <td>{fdate(p.due)}</td>
                <td>{p.paid ? <Pill color="green">{t('finance.paid')}</Pill> : <Pill color="orange">{t('finance.upcoming')}</Pill>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
/**
 * Demandes de booking : le fournisseur prend en compte (plan, marchandise prête, boîtes demandées au transitaire),
 * puis le transitaire fait le booking. S'il ne passe pas par l'application, le fournisseur le saisit pour lui.
 */
export function PortalBooking() {
  const { proformas, bookingsToDo, bookingsAtForwarder, bookingsInValidation } = usePortal();
  const { t, fmt } = useT();
  const { fshort } = fmt;
  const done = proformas.filter((p) => p.booking?.answeredAt).sort((a, b) => b.booking!.answeredAt!.localeCompare(a.booking!.answeredAt!));
  return (
    <>
      <div className="page-head">
        <h1>{t('pb.title')}</h1>
        <span className="page-sub">{t('pb.sub')}</span>
      </div>
      <h3 className="pb-group">
        {t('pb.toAck')} <span className="pill orange">{bookingsToDo.length}</span>
      </h3>
      {bookingsToDo.length ? bookingsToDo.map((pf) => <BookingAck key={pf.id} pf={pf} />) : <div className="card empty mb">{t('pb.none')}</div>}
      {bookingsInValidation.length > 0 && (
        <>
          <h3 className="pb-group">
            {t('pb.toValidate')} <span className="pill green">{bookingsInValidation.length}</span>
          </h3>
          {bookingsInValidation.map((pf) => (
            <div key={pf.id} className="card pad mb pb-answer pb-val">
              <div className="pb-answer-head">
                <span className="pb-alert green">
                  <Ship size={22} />
                </span>
                <div className="grow">
                  <h2>
                    {pf.id} · {pf.title}
                  </h2>
                  <small>
                    {t('be.ready', { date: fmt.fdate(pf.booking!.readyDate) })} · {pf.booking!.containers} × 40HC
                  </small>
                </div>
              </div>
              <BookingReview pf={pf} />
            </div>
          ))}
        </>
      )}
      {bookingsAtForwarder.length > 0 && (
        <>
          <h3 className="pb-group">
            {t('pb.atFwd')} <span className="pill violet">{bookingsAtForwarder.length}</span>
          </h3>
          {bookingsAtForwarder.map((pf) => (
            <AtForwarder key={pf.id} pf={pf} />
          ))}
        </>
      )}
      {done.length > 0 && (
        <div className="card pad">
          <div className="card-title">
            <Check size={18} className="green" /> {t('pb.history')}
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>{t('pb.proforma')}</th>
                  <th className="num">40HC</th>
                  <th>{t('pb.fwdCol')}</th>
                  <th>{t('pb.loading')}</th>
                  <th>{t('pb.etd')}</th>
                  <th>{t('pb.eta')}</th>
                  <th>{t('pb.bookingNo')}</th>
                  <th>{t('pb.byCol')}</th>
                </tr>
              </thead>
              <tbody>
                {done.map((p) => (
                  <tr key={p.id}>
                    <td className="bold">{p.id}</td>
                    <td className="num">{p.booking!.containers}</td>
                    <td>{p.booking!.forwarder ?? '—'}</td>
                    <td>{fshort(p.booking!.loadingDate)}</td>
                    <td>{fshort(p.booking!.etd)}</td>
                    <td>{fshort(p.booking!.eta)}</td>
                    <td>{p.booking!.bookingNo ?? '—'}</td>
                    <td>{p.booking!.bookedBy === 'fournisseur' ? t('pb.bySup') : t('pb.byFwd')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

/** Boîtes demandées au transitaire : attente de son booking, ou saisie par le fournisseur pour lui */
function AtForwarder({ pf }: { pf: Proforma }) {
  const { t, fmt } = useT();
  const [open, setOpen] = useState(false);
  const b = pf.booking!;
  const fwd = b.forwarder ?? '';
  return (
    <div className="card pad mb pb-answer pb-fwd">
      <div className="pb-answer-head">
        <span className="pb-alert violet">
          <Ship size={22} />
        </span>
        <div className="grow">
          <h2>{t('pb.waitFwd', { pf: pf.id, fwd, date: fmt.fdate(b.ackAt!.slice(0, 10)) })}</h2>
          <small>{t('pb.waitFwdSub', { ready: fmt.fdate(b.readyDate), n: b.containers, fwd })}</small>
          <LastRejection pf={pf} />
        </div>
        {!open && (
          <button type="button" className="btn" onClick={() => setOpen(true)}>
            <Pencil size={15} /> {t('pb.enterFor', { fwd })}
          </button>
        )}
      </div>
      {open && <BookingEntry pf={pf} onCancel={() => setOpen(false)} onDone={() => setOpen(false)} />}
    </div>
  );
}

function BookingAck({ pf }: { pf: Proforma }) {
  const { state, dispatch } = usePortal();
  const { t, fmt } = useT();
  const { fdate, num, dec } = fmt;
  const b = pf.booking!;
  const cs = pfContainers(state, pf.id);
  const remaining = pf.lines.reduce((sum, l) => sum + Math.max(0, l.qty - allocatedQty(state, pf.id, l.productId)), 0);
  const [ready, setReady] = useState(b.dateWanted);
  const fwd = b.forwarder ?? defaultForwarder(state, pf.supplierId);
  const [note, setNote] = useState('');
  const id = pf.id.replace(/\W/g, '');
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cs.length) return toast(t('pb.needPlan'));
    dispatch({ type: 'ackPfBooking', proformaId: pf.id, readyDate: ready, note: note.trim() || undefined });
    toast(t('pb.ackToast', { fwd }));
  };
  return (
    <form className="card pad mb pb-answer" onSubmit={submit} aria-label={t('pb.ask', { pf: pf.id })}>
      <div className="pb-answer-head">
        <span className="pb-alert">
          <Calendar size={22} />
        </span>
        <div>
          <h2>{t('pb.ask', { pf: pf.id })}</h2>
          <b className="orange">{t('pb.wanted', { n: b.containers, date: fdate(b.dateWanted) })}</b>
          <small>
            {pf.title} · {t('pb.sent', { date: fdate(b.requestedAt.slice(0, 10)) })}
            {b.reminders.length ? ` · ${t('pb.reminders', { n: b.reminders.length })}` : ''}
          </small>
          {b.note && <p className="pb-quote">« {b.note} »</p>}
        </div>
      </div>

      <h3 className="pb-sec">{t('pb.plan')}</h3>
      {cs.length ? (
        <div className="pb-plan">
          {cs.map((c) => {
            const fill = containerCbm(state, c) / containerCapacity(c);
            return (
              <div key={c.id} className="pb-c">
                <b>{c.id}</b>
                <span>
                  {num(containerQty(c))} pcs · {dec(containerCbm(state, c), 1)} m³
                </span>
                <span className={`ct-bar ${fill > 1 ? 'over' : ''}`}>
                  <span style={{ width: `${Math.min(100, fill * 100)}%` }} />
                </span>
                <small>{Math.round(fill * 100)} %</small>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="small muted">{t('pb.noPlan')}</p>
      )}
      <div className="row wrap" style={{ gap: 8 }}>
        {remaining > 0 && <span className="pill orange">{t('pb.remaining', { qty: num(remaining) })}</span>}
        {cs.length > 0 && cs.length !== b.containers && <span className="pill violet">{t('pb.mismatch', { x: cs.length, n: b.containers })}</span>}
        <div className="grow" />
        {remaining > 0 && (
          <button
            type="button"
            className="btn"
            onClick={() => {
              dispatch({ type: 'autoLoad', proformaId: pf.id });
              toast(t('pb.autoToast'));
            }}
          >
            <Package size={16} /> {t('pb.autoPlan')}
          </button>
        )}
        <Link className="btn ghost" to={`/portail/chargement?pf=${pf.id}`}>
          {t('pb.adjust')}
        </Link>
      </div>

      <h3 className="pb-sec">{t('pb.readySec')}</h3>
      <div className="pb-dates">
        <label htmlFor={`pb-ready-${id}`}>
          {t('pb.ready')}
          <input id={`pb-ready-${id}`} className="input" type="date" required value={ready} onChange={(e) => setReady(e.target.value)} />
        </label>
        <div className="pb-fwd-chosen">
          <span>{t('pb.forwarder')}</span>
          <b>{t('pb.fwdChosen', { fwd })}</b>
        </div>
        <label htmlFor={`pb-note-${id}`}>
          <span>
            {t('pb.note')} <em>({t('pb.optional')})</em>
          </span>
          <input id={`pb-note-${id}`} className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
        <button type="submit" className="btn primary" disabled={!cs.length} title={cs.length ? undefined : t('pb.needPlan')}>
          <Send size={16} /> {t('pb.ackSend')}
        </button>
      </div>
    </form>
  );
}
