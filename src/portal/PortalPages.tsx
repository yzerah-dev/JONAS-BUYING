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
import { BrandLogo, ContainerStatusPill, Kpi, PackPill, Pill, ProductThumb, ProformaStatusPill, Ring, Seg, ValidationCircuit, toast } from '../components/ui';
import { LogisticsTab } from '../pages/ProformaDetail';
import { TODAY, dec, eur, eur2, fdate, fshort, m3, num, weekLabel } from '../lib/format';
import { usePortal } from './usePortal';

// ---------------------------------------------------------------------------
export function PortalHome() {
  const { state, supplier, user, products, proformas, containers, packsToValidate, dieCutsRequested, plansRequested, docsMissing } = usePortal();
  const pays = payments(state).filter((p) => p.supplierId === supplier!.id);
  const nextPay = pays.find((p) => !p.paid);
  const amount = proformas.reduce((s, p) => s + proformaTotals(state, p).amount, 0);
  const ok = products.filter(packDone).length;

  const todo: { to: string; icon: React.ReactNode; text: string; n: number }[] = [
    { to: '/portail/packs', icon: <Package size={16} className="orange" />, text: 'pack(s) à valider (étape Fournisseur)', n: packsToValidate.length },
    { to: '/portail/packs?vue=diecut', icon: <Scissors size={16} className="orange" />, text: 'die cut(s) demandé(s) par JONAS', n: dieCutsRequested.length },
    { to: '/portail/chargement', icon: <Truck size={16} className="orange" />, text: 'plan(s) de chargement à proposer', n: plansRequested.length },
    { to: '/portail/conteneurs', icon: <FileText size={16} className="red" />, text: 'conteneur(s) avec documents manquants (BL, Invoice, Packing List)', n: docsMissing.length },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Bienvenue {user.name}</h1>
          <div className="page-sub">
            {supplier!.name} · {fdate(TODAY)} · semaine {weekLabel(TODAY)}
          </div>
        </div>
      </div>
      <div className="kpis mb">
        <Kpi icon={<Boxes size={18} />} value={products.length} label="Produits référencés" />
        <Kpi icon={<FileText size={18} />} value={proformas.length} label="Proformas" />
        <Kpi icon={<Ctn size={18} />} value={containers.length} label="Conteneurs" />
        <Kpi icon={<Package size={18} />} value={`${ok}/${products.length}`} label="Packs validés" />
        <Kpi icon={<Euro size={18} />} value={eur(amount)} label="Montant commandes" />
      </div>
      <div className="grid2">
        <div className="card pad">
          <div className="card-title">
            <AlertTriangle size={18} className="orange" /> Actions attendues de votre part
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
            <Calendar size={18} className="green" /> Prochains départs
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
                Prochain paiement JONAS · {nextPay.kind} {nextPay.proformaId} · {fdate(nextPay.due)}
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
  return (
    <>
      <div className="page-head">
        <h1>Mes produits ({products.length})</h1>
      </div>
      <div className="grid2 mb">
        <div className="card pad row gap-lg">
          <div className="grow">
            <div className="bold">Produits développés</div>
            <div style={{ fontSize: 28, fontWeight: 800 }}>{developed.length}</div>
          </div>
          <Ring value={products.length ? developed.length / products.length : 0} size={70} stroke={8} />
        </div>
        <div className="card pad row gap-lg">
          <div className="grow">
            <div className="bold">Produits à développer</div>
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
            { id: 'dev', label: `Produits développés (${developed.length})` },
            { id: 'todo', label: `Produits à développer (${todo.length})` },
          ]}
        />
      </div>
      <div className="card tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Référence</th>
              <th>Visuel</th>
              <th>Désignation</th>
              <th>Marque</th>
              <th className="num">PA</th>
              <th className="num">PCB</th>
              <th className="num">CBM ctn</th>
              <th>EAN</th>
              <th>{tab === 'dev' ? 'État pack' : 'Prochaine action'}</th>
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
                <td>{tab === 'dev' ? <PackPill product={p} /> : <Pill color="violet">{p.nextAction}</Pill>}</td>
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
  return (
    <>
      <div className="page-head">
        <h1>Mes proformas ({proformas.length})</h1>
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
                  <div className="l">ETD</div>
                  <div className="v" style={{ fontSize: 16 }}>
                    {weekLabel(pf.etd)} · {fshort(pf.etd)}
                  </div>
                </div>
                <div className="metric">
                  <div className="l">ETA</div>
                  <div className="v" style={{ fontSize: 16 }}>
                    {weekLabel(pf.eta)} · {fshort(pf.eta)}
                  </div>
                </div>
                <div className="metric">
                  <div className="l">CBM</div>
                  <div className="v" style={{ fontSize: 16 }}>
                    {dec(t.cbm)}
                  </div>
                </div>
                <div className="metric">
                  <div className="l">Montant</div>
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
                          <th>Produit</th>
                          <th className="num">Prix</th>
                          <th className="num">Qté</th>
                          <th className="num">CBM</th>
                          <th className="num">Montant</th>
                          <th className="num">Chargé</th>
                          <th>Date max artwork</th>
                          <th>État pack</th>
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
                      <button key={d} className="btn sm" onClick={() => toast(`Téléchargement ${d} (démo)`)}>
                        <Download size={13} /> {d}
                      </button>
                    ))}
                    <div className="grow" />
                    {!['en_transit', 'arrive'].includes(pf.status) && (
                      <Link to={`/portail/chargement?pf=${pf.id}`} className="btn primary sm">
                        <Truck size={13} /> Plan de chargement
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
  return (
    <>
      <div className="page-head">
        <h1>Packs & die cuts</h1>
        <span className="page-sub">Circuit : David → Direction → Moinard → Fournisseur. Votre validation finalise le pack.</span>
      </div>
      <div className="mb">
        <Seg
          value={view}
          onChange={(v) => setParams({ vue: v })}
          options={[
            { id: 'valider', label: `À valider (${packsToValidate.length})` },
            { id: 'diecut', label: `Die cuts demandés (${dieCutsRequested.length})` },
            { id: 'tous', label: `Tous mes packs (${products.length})` },
          ]}
        />
      </div>
      {list.length === 0 && <div className="card empty">Rien en attente ici 👍</div>}
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
                    {p.pack.type} · limite artwork {fdate(p.pack.artworkDeadline)}
                  </div>
                </div>
                <BrandLogo brand={byId(state.brands, p.brandId)} size={10} />
              </div>
              <ValidationCircuit product={p} />
              <div className="row wrap">
                <span className="small">Die cut :</span>
                {p.pack.dieCut === 'received' ? <Pill color="green">Envoyé</Pill> : p.pack.dieCut === 'requested' ? <Pill color="orange">Demandé par JONAS</Pill> : <Pill color="grey">Non demandé</Pill>}
                <span className="small">Pack :</span>
                {p.pack.sentToSupplier ? <Pill color="blue">Reçu v{p.pack.artworkVersions}</Pill> : <Pill color="grey">En préparation chez JONAS</Pill>}
              </div>
              <div className="row wrap">
                {p.pack.sentToSupplier && (
                  <button className="btn sm" onClick={() => toast('Téléchargement du pack (démo)')}>
                    <Download size={13} /> Télécharger le pack
                  </button>
                )}
                {p.pack.dieCut === 'requested' && (
                  <button
                    className="btn sm primary"
                    onClick={() => {
                      dispatch({ type: 'receiveDieCut', productId: p.id });
                      toast('Die cut envoyé à JONAS');
                    }}
                  >
                    <Upload size={13} /> Envoyer le die cut
                  </button>
                )}
                <div className="grow" />
                {canValidate && (
                  <>
                    <button
                      className="btn sm danger"
                      onClick={() => {
                        dispatch({ type: 'rejectPack', productId: p.id });
                        toast('Pack refusé : retour au designer JONAS');
                      }}
                    >
                      <X size={13} /> Refuser
                    </button>
                    <button
                      className="btn sm primary"
                      onClick={() => {
                        dispatch({ type: 'validatePack', productId: p.id });
                        toast('Pack validé – prêt pour la production');
                      }}
                    >
                      <Check size={13} /> Valider le pack
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
          Afficher plus ({list.length - limit} restants)
        </button>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
export function PortalLoading() {
  const { proformas, plansRequested } = usePortal();
  const open = proformas.filter((p) => !['en_transit', 'arrive'].includes(p.status));
  const [params, setParams] = useSearchParams();
  const requestedPf = plansRequested.flatMap((c) => containerProformas(c))[0];
  // Proforma affichée par défaut figée à l'ouverture (ne saute pas après l'envoi du plan)
  const [initialPf] = useState(requestedPf ?? open[0]?.id);
  const pfId = params.get('pf') ?? initialPf;
  const pf = open.find((p) => p.id === pfId);
  return (
    <>
      <div className="page-head">
        <h1>Plans de chargement</h1>
        <span className="page-sub">Proposez la répartition de vos produits par conteneur ; JONAS la corrige si besoin puis la valide.</span>
      </div>
      {plansRequested.length > 0 && (
        <div className="card pad mb row wrap" style={{ borderColor: 'var(--orange)' }}>
          <AlertTriangle className="orange" />
          <b>JONAS vous demande un plan de chargement pour :</b>
          {plansRequested.map((c) => (
            <Pill key={c.id} color="orange">
              {c.id} · ETD {weekLabel(c.etdPlanned)}
            </Pill>
          ))}
        </div>
      )}
      <div className="row wrap mb">
        <span className="small muted">Proforma :</span>
        <Seg value={pfId ?? ''} onChange={(v) => setParams({ pf: v })} options={open.map((p) => ({ id: p.id, label: p.id }))} />
      </div>
      {pf ? <LogisticsTab pf={pf} portal /> : <div className="card empty">Aucune proforma en cours.</div>}
    </>
  );
}

// ---------------------------------------------------------------------------
export function PortalContainers() {
  const { state, dispatch, containers, REQUIRED_DOCS } = usePortal();
  return (
    <>
      <div className="page-head">
        <h1>Conteneurs & documents</h1>
        <span className="page-sub">Déposez BL, Invoice et Packing List dès le booking confirmé.</span>
      </div>
      <div className="card tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Conteneur</th>
              <th>Booking</th>
              <th>Proforma(s)</th>
              <th className="num">Qté</th>
              <th className="num">CBM</th>
              <th>ETD</th>
              <th>ETA</th>
              <th>Statut</th>
              <th>Documents</th>
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
                                toast(`${d} déposé`);
                              }}
                            >
                              <Upload size={12} /> {d.split('.')[0]}
                            </button>
                          ) : null,
                        )}
                        {!docsOpen && !REQUIRED_DOCS.some((d) => c.documents.includes(d)) && <span className="xs muted">Après booking</span>}
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
  return (
    <>
      <div className="page-head">
        <h1>Factures & paiements</h1>
      </div>
      <div className="kpis mb">
        <Kpi icon={<Check size={18} />} value={eur(paid)} label="Reçu de JONAS" />
        <Kpi icon={<Euro size={18} />} value={eur(open)} label="Reste à recevoir" color="orange" />
      </div>
      <div className="card tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Proforma</th>
              <th>Type</th>
              <th className="num">Montant</th>
              <th>Échéance</th>
              <th>Statut</th>
            </tr>
          </thead>
          <tbody>
            {pays.map((p) => (
              <tr key={p.proformaId + p.kind}>
                <td className="bold">{p.proformaId}</td>
                <td>{p.kind}</td>
                <td className="num">{eur(p.amount)}</td>
                <td>{fdate(p.due)}</td>
                <td>{p.paid ? <Pill color="green">Payé</Pill> : <Pill color="orange">À venir</Pill>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
