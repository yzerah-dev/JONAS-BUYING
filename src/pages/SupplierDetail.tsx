import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BarChart3, Boxes, Calendar, Check, ChevronLeft, Container as Ctn, Euro, FileText, Home, Hourglass, Mail, MessageCircle, Phone, ShoppingCart, Truck, User } from 'lucide-react';
import { byId, containerCbm, containerEta, containerEtd, containerProformas, containerQty, payments, proformaTotals, supplierStats, supplierTerms, termsLabel, useAuth, useStore } from '../data/store';
import { toast } from '../components/ui-shared';
import { EditSupplierButton } from '../components/NewSupplier';
import { CONTAINER_STATUSES, type Currency, type SupplierTerms } from '../data/types';
import { ContainerStatusPill, Kpi, Pill, ProductThumb, ProformaStatusPill, Ring, Seg, SupplierLogo, Tabs } from '../components/ui';
import { TODAY, dec, eur, fdate, fshort, num, weekLabel } from '../lib/format';

type Tab = 'dashboard' | 'produits' | 'proformas' | 'bookings' | 'conteneurs' | 'finance';

export default function SupplierDetail() {
  const { id } = useParams();
  const { state } = useStore();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('dashboard');
  const [devTab, setDevTab] = useState<'dev' | 'todo'>('dev');
  const sup = state.suppliers.find((s) => s.id === id);
  if (!sup) return <div className="card empty">Fournisseur introuvable.</div>;
  const st = supplierStats(state, sup.id);
  const developed = st.prods.filter((p) => p.developed);
  const todo = st.prods.filter((p) => !p.developed);
  const inProd = st.pfs.filter((p) => p.status === 'en_production').length;
  const waiting = st.pfs.filter((p) => ['a_signer', 'en_dev'].includes(p.status)).length;
  const finished = st.pfs.filter((p) => ['booke', 'en_transit', 'arrive'].includes(p.status)).length;
  const prodRate = st.pfs.length ? (finished + inProd * 0.6) / st.pfs.length : 0;
  const pays = payments(state).filter((p) => p.supplierId === sup.id);
  const nextDue = pays.find((p) => !p.paid);
  const bookings = st.cs.filter((c) => c.bookingNo);

  return (
    <>
      <div className="page-head">
        <button className="btn" onClick={() => navigate('/fournisseurs')}>
          <ChevronLeft size={16} /> Fournisseurs
        </button>
        <span className="muted">›</span>
        <span className="bold">{sup.name}</span>
        <div className="grow" />
        <EditSupplierButton supplier={sup} />
      </div>
      <div className="card pad row wrap gap-lg mb">
        <SupplierLogo supplier={sup} size={76} />
        <div>
          <h1 style={{ fontSize: 26 }}>{sup.name}</h1>
          <div className="row mt">
            <span>
              {sup.flag} {sup.country} – {sup.city}
            </span>
            <Pill color="green" icon={<Check size={12} />}>
              Actif
            </Pill>
          </div>
        </div>
        <div className="grow" />
        <div className="col small">
          <span className="row" style={{ gap: 6 }}>
            <User size={14} /> <b>{sup.contact.name}</b> ({sup.contact.role})
          </span>
          <span className="row" style={{ gap: 6 }}>
            <Phone size={14} /> {sup.contact.phone}
          </span>
          <span className="row" style={{ gap: 6 }}>
            <Mail size={14} /> {sup.contact.email}
          </span>
          {sup.contact.wechat && (
            <span className="row" style={{ gap: 6 }}>
              <MessageCircle size={14} className="green" /> {sup.contact.wechat}
            </span>
          )}
        </div>
      </div>

      <TermsCard supplierId={sup.id} />

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'dashboard', label: 'Tableau de bord', icon: <BarChart3 size={16} /> },
          { id: 'produits', label: `Mes produits (${st.prods.length})`, icon: <Boxes size={16} /> },
          { id: 'proformas', label: `Mes proformas (${st.pfs.length})`, icon: <FileText size={16} /> },
          { id: 'bookings', label: `Mes bookings (${bookings.length})`, icon: <ShoppingCart size={16} /> },
          { id: 'conteneurs', label: `Mes conteneurs (${st.cs.length})`, icon: <Ctn size={16} /> },
          { id: 'finance', label: 'Mes factures & finance', icon: <Euro size={16} /> },
        ]}
      />

      {tab === 'dashboard' && (
        <>
          <div className="kpis mb">
            <Kpi icon={<Boxes size={18} />} value={st.prods.length} label="Produits référencés" />
            <Kpi icon={<FileText size={18} />} value={st.pfs.length} label="Proformas" />
            <Kpi icon={<ShoppingCart size={18} />} value={bookings.length} label="Bookings" />
            <Kpi icon={<Ctn size={18} />} value={st.cs.length} label="Conteneurs" />
            <Kpi icon={<Boxes size={18} />} value={`${num(st.cbm)} m³`} label="Total CBM" />
            <Kpi icon={<BarChart3 size={18} />} value={`${Math.round(prodRate * 100)} %`} label="Production" />
            <Kpi icon={<Euro size={18} />} value={eur(st.amount)} label="Montant commandes" />
          </div>
          <div className="grid3 mb">
            <div className="card pad">
              <div className="card-title">Production</div>
              <div className="row gap-lg">
                <Ring value={prodRate} size={110} stroke={12} />
                <div className="col small" style={{ gap: 8 }}>
                  <span>
                    ● En production : <b>{inProd}</b>
                  </span>
                  <span className="orange">
                    ● En attente : <b>{waiting}</b>
                  </span>
                  <span className="muted">
                    ● Terminée : <b>{finished}</b>
                  </span>
                </div>
              </div>
            </div>
            <div className="card pad">
              <div className="card-title">Conteneurs</div>
              <div className="center" style={{ fontSize: 34, fontWeight: 800 }}>
                {st.cs.length}
              </div>
              <div className="grid2" style={{ gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>
                {[
                  ['arrive', 'Arrivé', <Home size={16} key="h" />],
                  ['en_transit', 'En transit', <Truck size={16} key="t" />],
                  ['booke', 'Bookés', <Calendar size={16} key="c" />],
                  ['a_booker', 'À booker', <Hourglass size={16} key="g" />],
                ].map(([k, l, icon]) => (
                  <div key={k as string} className="card center" style={{ padding: 8, boxShadow: 'none', background: 'var(--green-softer)' }}>
                    {icon}
                    <div className="bold">{st.cs.filter((c) => c.status === k).length}</div>
                    <div className="xs">{l}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="card pad">
              <div className="card-title">Finances</div>
              <div className="row gap-lg">
                <Ring value={st.amount ? st.depositPaid / st.amount : 0} size={100} stroke={11} />
                <div className="col small">
                  <span className="muted">Acompte versé</span>
                  <b style={{ fontSize: 18 }}>{eur(st.depositPaid)}</b>
                  <span className="muted">Solde restant</span>
                  <b style={{ fontSize: 18 }}>{eur(st.balanceOpen)}</b>
                </div>
              </div>
              {nextDue && (
                <div className="pill green mt" style={{ width: '100%', justifyContent: 'space-between', padding: 10, borderRadius: 10 }}>
                  <span>
                    Prochaine échéance · {fdate(nextDue.due)} ({nextDue.kind})
                  </span>
                  <span>{eur(nextDue.amount)}</span>
                </div>
              )}
            </div>
          </div>
          <div className="card pad">
            <div className="card-title">Commandes récentes</div>
            <PfTable
              ids={st.pfs
                .slice(-5)
                .reverse()
                .map((p) => p.id)}
            />
          </div>
        </>
      )}

      {tab === 'produits' && (
        <>
          <div className="grid2 mb">
            <div className="card pad row gap-lg" style={{ borderColor: devTab === 'dev' ? 'var(--green)' : undefined, cursor: 'pointer' }} onClick={() => setDevTab('dev')}>
              <div className="grow">
                <div className="bold">Produits développés</div>
                <div style={{ fontSize: 28, fontWeight: 800 }}>{developed.length}</div>
              </div>
              <Ring value={st.prods.length ? developed.length / st.prods.length : 0} size={70} stroke={8} />
            </div>
            <div className="card pad row gap-lg" style={{ borderColor: devTab === 'todo' ? 'var(--green)' : undefined, cursor: 'pointer' }} onClick={() => setDevTab('todo')}>
              <div className="grow">
                <div className="bold">Produits à développer</div>
                <div style={{ fontSize: 28, fontWeight: 800 }}>{todo.length}</div>
              </div>
              <Ring value={st.prods.length ? todo.length / st.prods.length : 0} size={70} stroke={8} />
            </div>
          </div>
          <div className="mb">
            <Seg
              value={devTab}
              onChange={setDevTab}
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
                  <th>Catégorie</th>
                  <th className="num">PCB</th>
                  <th className="num">CBM ctn</th>
                  <th>Statut</th>
                  <th>Proforma</th>
                  <th>Commande</th>
                </tr>
              </thead>
              <tbody>
                {(devTab === 'dev' ? developed : todo).map((p) => {
                  const pf = state.proformas.filter((x) => x.lines.some((l) => l.productId === p.id)).at(-1);
                  return (
                    <tr key={p.id} className="clickable" onClick={() => navigate(`/produits/${p.id}`)}>
                      <td className="bold">{p.ref}</td>
                      <td>
                        <ProductThumb product={p} size={40} />
                      </td>
                      <td>{p.name}</td>
                      <td>
                        {p.rayon} {p.gender !== 'Mixte' ? p.gender.toLowerCase() : ''}
                      </td>
                      <td className="num">{p.pcb}</td>
                      <td className="num">{dec(p.cbmCarton, 3)}</td>
                      <td>
                        {p.developed ? (
                          <Pill color="green" icon={<Check size={12} />}>
                            Référencé
                          </Pill>
                        ) : (
                          <Pill color="violet">En dév.</Pill>
                        )}
                      </td>
                      <td>{pf?.id ?? '—'}</td>
                      <td>{pf?.poNumber ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'proformas' && (
        <div className="card pad">
          <PfTable ids={st.pfs.map((p) => p.id)} />
        </div>
      )}

      {(tab === 'bookings' || tab === 'conteneurs') && (
        <div className="card tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>{tab === 'bookings' ? 'Booking' : 'Conteneur'}</th>
                <th>Proforma(s)</th>
                <th className="num">Qté</th>
                <th className="num">CBM</th>
                <th>ETD</th>
                <th>ETA</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {(tab === 'bookings' ? bookings : [...st.cs].sort((a, b) => CONTAINER_STATUSES.indexOf(a.status) - CONTAINER_STATUSES.indexOf(b.status))).map((c) => (
                <tr key={c.id} className="clickable" onClick={() => navigate(`/conteneurs?c=${c.id}`)}>
                  <td className="bold">{tab === 'bookings' ? c.bookingNo : (c.number ?? c.id)}</td>
                  <td>{containerProformas(c).join(', ')}</td>
                  <td className="num">{num(containerQty(c))}</td>
                  <td className="num">{dec(containerCbm(state, c))}</td>
                  <td>
                    {weekLabel(containerEtd(c))} – {fshort(containerEtd(c))}
                  </td>
                  <td>
                    {weekLabel(containerEta(c))} – {fshort(containerEta(c))}
                  </td>
                  <td>
                    <ContainerStatusPill status={c.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'finance' && (
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
                  <td>
                    <Link to={`/proformas/${p.proformaId}`} className="bold green">
                      {p.proformaId}
                    </Link>
                  </td>
                  <td>{p.kind}</td>
                  <td className="num">{eur(p.amount)}</td>
                  <td className={!p.paid && p.due < TODAY ? 'red bold' : ''}>{fdate(p.due)}</td>
                  <td>{p.paid ? <Pill color="green">Payé</Pill> : p.due < TODAY ? <Pill color="red">En retard</Pill> : <Pill color="orange">À payer</Pill>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function PfTable({ ids }: { ids: string[] }) {
  const { state } = useStore();
  const navigate = useNavigate();
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead>
          <tr>
            <th>N° commande</th>
            <th>Proforma</th>
            <th>Date</th>
            <th>Produits</th>
            <th className="num">Qté</th>
            <th className="num">Montant</th>
            <th>Statut</th>
          </tr>
        </thead>
        <tbody>
          {ids.map((id) => {
            const pf = byId(state.proformas, id);
            const t = proformaTotals(state, pf);
            return (
              <tr key={id} className="clickable" onClick={() => navigate(`/proformas/${id}`)}>
                <td className="bold">{pf.poNumber}</td>
                <td>{pf.id}</td>
                <td>{fdate(pf.date)}</td>
                <td>
                  {byId(state.products, pf.lines[0].productId).name}
                  {pf.lines.length > 1 ? ` + ${pf.lines.length - 1}` : ''}
                </td>
                <td className="num">{num(t.qty)}</td>
                <td className="num">{eur(t.amount)}</td>
                <td>
                  <ProformaStatusPill status={pf.status} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Devise et conditions de paiement du fournisseur : reprises par chaque nouvelle proforma (Finance, Direction, Pilote) */
function TermsCard({ supplierId }: { supplierId: string }) {
  const { state, dispatch } = useStore();
  const auth = useAuth();
  const saved = supplierTerms(state, supplierId);
  const [t, setT] = useState<SupplierTerms>(saved);
  const edit = auth.can('finance.pay') || auth.can('proforma.sign');
  const dirty = JSON.stringify(t) !== JSON.stringify(saved);
  return (
    <div className="card pad mb terms-card">
      <div className="card-title">Devise et conditions de paiement</div>
      <p className="small muted" style={{ marginTop: 0 }}>
        Reprises automatiquement par chaque nouvelle proforma de ce fournisseur (les proformas existantes gardent leurs conditions). Actuellement : {saved.currency} · {termsLabel(saved)}.
      </p>
      <div className="terms-grid">
        <label htmlFor="tm-cur">
          Devise
          <select id="tm-cur" className="input" disabled={!edit} value={t.currency} onChange={(e) => setT({ ...t, currency: e.target.value as Currency })}>
            <option value="EUR">EUR €</option>
            <option value="USD">USD $</option>
            <option value="CNY">CNY ¥</option>
          </select>
        </label>
        <label htmlFor="tm-dep">
          Acompte à la commande (%)
          <input
            id="tm-dep"
            className="input"
            type="number"
            min={0}
            max={100}
            disabled={!edit}
            value={t.depositPct}
            onChange={(e) => setT({ ...t, depositPct: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
          />
        </label>
        <label htmlFor="tm-days">
          Solde : jours après le départ
          <input
            id="tm-days"
            className="input"
            type="number"
            min={0}
            max={180}
            disabled={!edit}
            value={t.balanceDays}
            onChange={(e) => setT({ ...t, balanceDays: Math.max(0, Number(e.target.value) || 0) })}
          />
        </label>
        {edit && (
          <button
            className="btn primary"
            disabled={!dirty}
            onClick={() => {
              dispatch({ type: 'setSupplierTerms', supplierId, terms: t });
              toast('Conditions du fournisseur enregistrées');
            }}
          >
            Enregistrer
          </button>
        )}
      </div>
    </div>
  );
}
