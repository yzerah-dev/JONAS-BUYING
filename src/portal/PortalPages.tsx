import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Boxes, Calendar, Check, Container as Ctn, Download, Euro, FileText, Package, Scissors, Truck, Upload, X } from 'lucide-react';
import {
  allocatedQty,
  byId,
  containerCbm,
  containerEta,
  containerEtd,
  containerProformas,
  containerQty,
  lineCbm,
  packDone,
  payments,
  proformaTotals,
} from '../data/store';
import { BrandLogo, ContainerStatusPill, Kpi, PackPill, Pill, ProductThumb, ProformaStatusPill, Ring, Seg, ValidationCircuit } from '../components/ui';
import { toast } from '../components/ui-shared';
import type { Container } from '../data/types';
import { LogisticsTab } from '../pages/ProformaDetail';
import { TODAY } from '../lib/format';
import { useT } from '../i18n';
import { usePortal } from './usePortal';

// ---------------------------------------------------------------------------
export function PortalHome() {
  const { state, supplier, user, products, proformas, containers, packsToValidate, dieCutsRequested, plansRequested, datesToConfirm, docsMissing } = usePortal();
  const pays = payments(state).filter((p) => p.supplierId === supplier!.id);
  const nextPay = pays.find((p) => !p.paid);
  const amount = proformas.reduce((s, p) => s + proformaTotals(state, p).amount, 0);
  const ok = products.filter(packDone).length;
  const { t: tr, td, fmt } = useT();
  const { eur, fdate, fshort, weekLabel } = fmt;

  const todo: { to: string; icon: React.ReactNode; text: string; n: number }[] = [
    { to: '/portail/packs', icon: <Package size={16} className="orange" />, text: tr('home.todo.packs'), n: packsToValidate.length },
    { to: '/portail/packs?vue=diecut', icon: <Scissors size={16} className="orange" />, text: tr('home.todo.diecuts'), n: dieCutsRequested.length },
    { to: '/portail/chargement', icon: <Calendar size={16} className="orange" />, text: tr('home.todo.dates'), n: datesToConfirm.length },
    { to: '/portail/chargement', icon: <Truck size={16} className="orange" />, text: tr('home.todo.plans'), n: plansRequested.length },
    { to: '/portail/conteneurs', icon: <FileText size={16} className="red" />, text: tr('home.todo.docs'), n: docsMissing.length },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{tr('home.welcome', { name: user.name })}</h1>
          <div className="page-sub">
            {tr('home.sub', { supplier: supplier!.name, date: fdate(TODAY), week: weekLabel(TODAY) })}
          </div>
        </div>
      </div>
      <div className="kpis mb">
        <Kpi icon={<Boxes size={18} />} value={products.length} label={tr('home.kpi.products')} />
        <Kpi icon={<FileText size={18} />} value={proformas.length} label={tr('home.kpi.proformas')} />
        <Kpi icon={<Ctn size={18} />} value={containers.length} label={tr('home.kpi.containers')} />
        <Kpi icon={<Package size={18} />} value={`${ok}/${products.length}`} label={tr('home.kpi.packs')} />
        <Kpi icon={<Euro size={18} />} value={eur(amount)} label={tr('home.kpi.amount')} />
      </div>
      <div className="grid2">
        <div className="card pad">
          <div className="card-title">
            <AlertTriangle size={18} className="orange" /> {tr('home.todo.title')}
          </div>
          {todo.map((t) => (
            <Link key={t.to} to={t.to} className="alert-line" style={{ opacity: t.n ? 1 : 0.45 }}>
              {t.icon}
              <span className="bold" style={{ minWidth: 22 }}>
                {t.n}
              </span>
              {t.text}
              <span className="grow" />›
            </Link>
          ))}
        </div>
        <div className="card pad">
          <div className="card-title">
            <Calendar size={18} className="green" /> {tr('home.departures')}
          </div>
          {proformas
            .filter((p) => !['en_transit', 'arrive'].includes(p.status))
            .sort((a, b) => a.etd.localeCompare(b.etd))
            .map((p) => (
              <Link key={p.id} to={`/portail/proformas?pf=${p.id}`} className="alert-line">
                <span className="bold" style={{ width: 40 }}>
                  {weekLabel(p.etd)}
                </span>
                <span className="small">{fshort(p.etd)}</span>
                <span className="bold small">{p.id}</span>
                <span className="grow" />
                <ProformaStatusPill status={p.status} />
              </Link>
            ))}
          {nextPay && (
            <div className="pill green mt" style={{ width: '100%', justifyContent: 'space-between', padding: 10, borderRadius: 10 }}>
              <span>
                {tr('home.nextPay', { kind: td(nextPay.kind), pf: nextPay.proformaId, date: fdate(nextPay.due) })}
              </span>
              <span>{eur(nextPay.amount)}</span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
export function PortalProducts() {
  const { state, products } = usePortal();
  const [tab, setTab] = useState<'dev' | 'todo'>('dev');
  const developed = products.filter((p) => p.developed);
  const todo = products.filter((p) => !p.developed);
  const { t, td, fmt } = useT();
  const { dec, eur2 } = fmt;
  return (
    <>
      <div className="page-head">
        <h1>{t('products.title', { n: products.length })}</h1>
      </div>
      <div className="grid2 mb">
        <div className="card pad row gap-lg">
          <div className="grow">
            <div className="bold">{t('products.developed')}</div>
            <div style={{ fontSize: 28, fontWeight: 800 }}>{developed.length}</div>
          </div>
          <Ring value={products.length ? developed.length / products.length : 0} size={70} stroke={8} />
        </div>
        <div className="card pad row gap-lg">
          <div className="grow">
            <div className="bold">{t('products.todo')}</div>
            <div style={{ fontSize: 28, fontWeight: 800 }}>{todo.length}</div>
          </div>
          <Ring value={products.length ? todo.length / products.length : 0} size={70} stroke={8} />
        </div>
      </div>
      <div className="mb">
        <Seg
          value={tab}
          onChange={setTab}
          options={[
            { id: 'dev', label: t('products.developedN', { n: developed.length }) },
            { id: 'todo', label: t('products.todoN', { n: todo.length }) },
          ]}
        />
      </div>
      <div className="card tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>{t('col.ref')}</th>
              <th>{t('col.visual')}</th>
              <th>{t('col.designation')}</th>
              <th>{t('col.brand')}</th>
              <th className="num">{t('col.pa')}</th>
              <th className="num">{t('col.pcb')}</th>
              <th className="num">{t('col.cbmCtn')}</th>
              <th>{t('col.ean')}</th>
              <th>{tab === 'dev' ? t('col.packState') : t('col.nextAction')}</th>
            </tr>
          </thead>
          <tbody>
            {(tab === 'dev' ? developed : todo).map((p) => (
              <tr key={p.id}>
                <td className="bold">{p.ref}</td>
                <td>
                  <ProductThumb product={p} size={40} />
                </td>
                <td>{p.name}</td>
                <td>
                  <BrandLogo brand={byId(state.brands, p.brandId)} size={9} />
                </td>
                <td className="num">{eur2(p.pa)}</td>
                <td className="num">{p.pcb}</td>
                <td className="num">{dec(p.cbmCarton, 3)}</td>
                <td className="small">{p.ean}</td>
                <td>{tab === 'dev' ? <PackPill product={p} /> : <Pill color="violet">{td(p.nextAction)}</Pill>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
export function PortalProformas() {
  const { state, proformas } = usePortal();
  const [params, setParams] = useSearchParams();
  const openId = params.get('pf');
  const { t: tr, fmt } = useT();
  const { dec, eur, eur2, fdate, fshort, num, weekLabel } = fmt;
  return (
    <>
      <div className="page-head">
        <h1>{tr('proformas.title', { n: proformas.length })}</h1>
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
                    {eur(t.amount)}
                  </div>
                </div>
              </div>
              {open && (
                <div style={{ padding: 16 }}>
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
                              <td className="num">{eur2(l.price)}</td>
                              <td className="num">{num(l.qty)}</td>
                              <td className="num">{dec(lineCbm(p, l.qty), 2)}</td>
                              <td className="num">{eur(l.qty * l.price)}</td>
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
  const { state, dispatch, products, packsToValidate, dieCutsRequested } = usePortal();
  const [params, setParams] = useSearchParams();
  const view = (params.get('vue') as 'valider' | 'diecut' | 'tous' | null) ?? 'valider';
  const list = (view === 'valider' ? packsToValidate : view === 'diecut' ? dieCutsRequested : products)
    .slice()
    .sort((a, b) => a.pack.artworkDeadline.localeCompare(b.pack.artworkDeadline));
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
          const canValidate = p.pack.sentToSupplier && p.pack.validations.fournisseur.state === 'pending' && !packDone(p);
          return (
            <div key={p.id} className="card pad col" style={{ gap: 10 }}>
              <div className="row">
                <ProductThumb product={p} size={56} />
                <div className="grow">
                  <span className="ref-tag">{p.ref}</span>
                  <div className="bold">{p.name}</div>
                  <div className="xs muted">
                    {t('packs.deadline', { type: td(p.pack.type), date: fdate(p.pack.artworkDeadline) })}
                  </div>
                </div>
                <BrandLogo brand={byId(state.brands, p.brandId)} size={10} />
              </div>
              <ValidationCircuit product={p} />
              <div className="row wrap">
                <span className="small">{t('packs.dieCut')}</span>
                {p.pack.dieCut === 'received' ? <Pill color="green">{t('packs.dieCut.sent')}</Pill> : p.pack.dieCut === 'requested' ? <Pill color="orange">{t('packs.dieCut.requested')}</Pill> : <Pill color="grey">{t('packs.dieCut.none')}</Pill>}
                <span className="small">{t('packs.pack')}</span>
                {p.pack.sentToSupplier ? <Pill color="blue">{t('packs.received', { v: p.pack.artworkVersions })}</Pill> : <Pill color="grey">{t('packs.preparing')}</Pill>}
              </div>
              <div className="row wrap">
                {p.pack.sentToSupplier && (
                  <button className="btn sm" onClick={() => toast(t('packs.downloadToast'))}>
                    <Download size={13} /> {t('packs.download')}
                  </button>
                )}
                {p.pack.dieCut === 'requested' && (
                  <button
                    className="btn sm primary"
                    onClick={() => {
                      dispatch({ type: 'receiveDieCut', productId: p.id });
                      toast(t('packs.dieCutToast'));
                    }}
                  >
                    <Upload size={13} /> {t('packs.sendDieCut')}
                  </button>
                )}
                <div className="grow" />
                {canValidate && (
                  <>
                    <button
                      className="btn sm danger"
                      onClick={() => {
                        dispatch({ type: 'rejectPack', productId: p.id });
                        toast(t('packs.rejectToast'));
                      }}
                    >
                      <X size={13} /> {t('packs.reject')}
                    </button>
                    <button
                      className="btn sm primary"
                      onClick={() => {
                        dispatch({ type: 'validatePack', productId: p.id });
                        toast(t('packs.validateToast'));
                      }}
                    >
                      <Check size={13} /> {t('packs.validate')}
                    </button>
                  </>
                )}
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
  const { proformas, plansRequested, datesToConfirm } = usePortal();
  const open = proformas.filter((p) => !['en_transit', 'arrive'].includes(p.status));
  const [params, setParams] = useSearchParams();
  const requestedPf = plansRequested.flatMap((c) => containerProformas(c))[0];
  // Proforma affichée par défaut figée à l'ouverture (ne saute pas après l'envoi du plan)
  const [initialPf] = useState(requestedPf ?? open[0]?.id);
  const pfId = params.get('pf') ?? initialPf;
  const pf = open.find((p) => p.id === pfId);
  const { t, fmt } = useT();
  const { weekLabel } = fmt;
  return (
    <>
      <div className="page-head">
        <h1>{t('loading.title')}</h1>
        <span className="page-sub">{t('loading.sub')}</span>
      </div>
      {datesToConfirm.length > 0 && (
        <div className="card pad mb ld-card">
          <div className="card-title">
            <Calendar size={18} className="orange" /> {t('loading.dates')}
          </div>
          <p className="small muted" style={{ marginTop: 0 }}>
            {t('loading.datesSub')}
          </p>
          {datesToConfirm.map((c) => (
            <LoadingDateRow key={c.id} c={c} />
          ))}
        </div>
      )}
      {plansRequested.length > 0 && (
        <div className="card pad mb row wrap" style={{ borderColor: 'var(--orange)' }}>
          <AlertTriangle className="orange" />
          <b>{t('loading.requested')}</b>
          {plansRequested.map((c) => (
            <Pill key={c.id} color="orange">
              {c.id} · {t('col.etd')} {weekLabel(c.etdPlanned)}
            </Pill>
          ))}
        </div>
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
  const paid = pays.filter((p) => p.paid).reduce((s, p) => s + p.amount, 0);
  const open = pays.filter((p) => !p.paid).reduce((s, p) => s + p.amount, 0);
  const { t, td, fmt } = useT();
  const { eur, fdate } = fmt;
  return (
    <>
      <div className="page-head">
        <h1>{t('finance.title')}</h1>
      </div>
      <div className="kpis mb">
        <Kpi icon={<Check size={18} />} value={eur(paid)} label={t('finance.received')} />
        <Kpi icon={<Euro size={18} />} value={eur(open)} label={t('finance.open')} color="orange" />
      </div>
      <div className="card tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>{t('col.proforma')}</th>
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
                <td className="num">{eur(p.amount)}</td>
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

/** Le fournisseur confirme la date de chargement proposée par JONAS, ou en donne une autre */
function LoadingDateRow({ c }: { c: Container }) {
  const { state, dispatch } = usePortal();
  const { t, td, fmt } = useT();
  const { fdate, weekLabel, num } = fmt;
  const [other, setOther] = useState(false);
  const [date, setDate] = useState(c.loading!.date);
  const main = [...c.allocations].sort((a, b) => b.qty - a.qty)[0];
  const p = main ? byId(state.products, main.productId) : undefined;
  const answer = (d: string) => {
    dispatch({ type: 'answerLoadingDate', containerId: c.id, date: d });
    toast(d === c.loading!.date ? t('loading.dateOk') : t('loading.dateChanged', { date: fdate(d) }));
  };
  return (
    <div className="ld-row">
      <div className="ld-ctn">
        {p && <ProductThumb product={p} size={40} />}
        <div>
          <b>{c.id}</b>
          <small>
            {p ? td(p.name) : '—'} · {num(containerQty(c))} pcs · {containerProformas(c).join(', ')}
          </small>
        </div>
      </div>
      <div className="ld-date">
        <small>{t('loading.proposed')}</small>
        <b>{fdate(c.loading!.date)}</b>
        <span>
          {t('col.etd')} {weekLabel(c.etdPlanned)}
        </span>
      </div>
      <div className="ld-actions">
        {other ? (
          <>
            <input className="input" type="date" aria-label={t('loading.otherDate')} value={date} onChange={(e) => setDate(e.target.value)} />
            <button className="btn sm primary" disabled={!date} onClick={() => answer(date)}>
              <Check size={14} /> {t('loading.send')}
            </button>
            <button className="btn sm ghost" onClick={() => setOther(false)} aria-label={t('loading.cancel')}>
              <X size={14} />
            </button>
          </>
        ) : (
          <>
            <button className="btn sm" onClick={() => setOther(true)}>
              <Calendar size={14} /> {t('loading.other')}
            </button>
            <button className="btn sm primary" onClick={() => answer(c.loading!.date)}>
              <Check size={14} /> {t('loading.confirm')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
