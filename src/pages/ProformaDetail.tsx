import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CancelledProforma, ProformaCancelButtons } from '../components/ProformaCancel';
import { proformaBestPdf, proformaDocPdf } from '../lib/proformaPdf';
import { PaymentProofUpload } from '../components/PaymentProof';
import { downloadPaymentProof } from '../lib/paymentProof';
import { saveBlob } from '../lib/files';
import {
  ArrowLeft,
  Boxes,
  Calendar,
  Check,
  ClipboardList,
  Container as Ctn,
  Download,
  Euro,
  FileText,
  GripVertical,
  History,
  LayoutGrid,
  List,
  Lock,
  Mail,
  MessageCircle,
  PenLine,
  Phone,
  Plus,
  Share2,
  Ship,
  Trash2,
  Truck,
  User,
  Upload,
} from 'lucide-react';
import {
  allocatedQty,
  maxAllocQty,
  packDone,
  packLate,
  packState,
  hasDeposit,
  balanceDaysOf,
  realDeparture,
  byId,
  containerCapacity,
  containerCbm,
  containerQty,
  lineCbm,
  pendingRevision,
  shipmentLabel,
  pendingVersion,
  proformaTotals,
  useAuth,
  useStore,
  UNASSIGNED,
  type State,
  brandOf,
} from '../data/store';
import type { Container, Product, Proforma, ProformaStatus } from '../data/types';
import { BrandLogo, ProductPic, ContainerStatusPill, PackPill, Pill, ProductThumb, ProformaStatusPill, Progress, Ring, Seg, SupplierLogo, Tabs } from '../components/ui';
import { designerColor, toast } from '../components/ui-shared';
import AssignDesigner from '../components/AssignDesigner';
import { BookingRequestButton } from '../components/BookingDialog';
import BookingReview, { LastRejection } from '../components/BookingReview';
import ProformaVersions, { SignDialog } from '../components/ProformaVersions';
import ShipmentsPanel from '../components/Shipments';
import { TODAY, addDays, dec, diffDays, fdate, initials, m3, money, num, weekLabel, weekStart } from '../lib/format';
import { useT, type I18n } from '../i18n/context';
import type { Key } from '../i18n/dict';

type Tab = 'produits' | 'details' | 'documents' | 'logistique' | 'historique';

export default function ProformaDetail() {
  const { id } = useParams();
  const { state } = useStore();
  const auth = useAuth();
  const navigate = useNavigate();
  const pf = state.proformas.find((p) => p.id === id);
  const [tab, setTab] = useState<Tab>('produits');
  const [mode, setMode] = useState<'galerie' | 'liste'>('galerie');
  const cancelled = state.archived?.find((p) => p.id === id);
  if (!pf && cancelled) return <CancelledProforma pf={cancelled} />;
  if (!pf) return <div className="card empty">Proforma introuvable (supprimée ?).</div>;
  const sup = byId(state.suppliers, pf.supplierId);
  const t = proformaTotals(state, pf);
  const showMoney = auth.can('finance.view');

  return (
    <>
      <div className="page-head">
        <button className="btn ghost" onClick={() => navigate(-1)}>
          <ArrowLeft size={20} />
        </button>
        <h1>Proforma {pf.id}</h1>
        {shipmentLabel(state, pf) && <span className="pill violet">{shipmentLabel(state, pf)}</span>}
        <ProformaStatusPill status={pf.status} />
        <div className="grow" />
        <button
          className="btn"
          onClick={async () => {
            const r = await proformaBestPdf(pf, { supplier: sup, products: state.products, company: state.settings.company });
            await saveBlob(r.blob, r.name);
          }}
        >
          <Download size={16} /> PDF
        </button>
        <button
          className="btn"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(location.href);
              toast('Lien de la proforma copié (accessible aux personnes connectées)');
            } catch {
              toast(`Lien : ${location.href}`);
            }
          }}
        >
          <Share2 size={16} /> Partager
        </button>
        <BookingRequestButton pf={pf} />
        {pf.booking && <BookingState pf={pf} />}
        <SignButton pf={pf} />
        <ProformaCancelButtons pf={pf} />
      </div>

      <div className="row wrap gap-lg" style={{ alignItems: 'stretch' }}>
        <div className="card pad row pfd-sup" style={{ gap: 14 }}>
          <SupplierLogo supplier={sup} size={56} />
          <div className="col">
            <Link to={`/fournisseurs/${sup.id}`} style={{ fontSize: 18, fontWeight: 800 }}>
              {sup.name}
            </Link>
            <span className="small row" style={{ gap: 6 }}>
              <User size={13} /> {sup.contact.name}
            </span>
            <span className="small row" style={{ gap: 6 }}>
              <Phone size={13} /> {sup.contact.phone}
            </span>
            <span className="small row" style={{ gap: 6 }}>
              <Mail size={13} /> {sup.contact.email}
            </span>
          </div>
          {sup.contact.wechat && (
            <span
              title={`WeChat : ${sup.contact.wechat}`}
              className="kpi-icon"
              style={{ background: '#2dc100', color: '#fff', width: 36, height: 36, borderRadius: 10, display: 'grid', placeItems: 'center' }}
            >
              <MessageCircle size={20} />
            </span>
          )}
        </div>
        <div className="card pad pfd-info">
          <div className="kpis" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(170px, 100%), 1fr))' }}>
            <Info icon={<ClipboardList size={18} />} label="N° commande Jonas" value={pf.poNumber} />
            <Info icon={<Calendar size={18} />} label="Date de la proforma" value={fdate(pf.date)} />
            <EtdWeek pf={pf} />
            <Info icon={<Ship size={18} />} label="ETA" value={weekLabel(pf.eta)} sub={`du ${fdate(pf.eta)}`} />
            <Info icon={<Ctn size={18} />} label="Conteneurs" value={dec(t.eq40)} sub="(40HC)" />
            <Info icon={<Boxes size={18} />} label="CBM total" value={m3(t.cbm)} />
            {showMoney && <Info icon={<Euro size={18} />} label="Montant total" value={money(t.amountCur, t.currency)} />}
          </div>
        </div>
      </div>

      <div className="mt">
        <ShipmentsPanel pf={pf} />
      </div>

      <div className="row wrap">
        <Tabs<Tab>
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'produits', label: `Produits (${pf.lines.length})`, icon: <Boxes size={16} /> },
            { id: 'details', label: 'Détails', icon: <ClipboardList size={16} /> },
            { id: 'documents', label: `Documents (${pf.documents.length + (pf.versions?.length ?? 0)})`, icon: <FileText size={16} /> },
            { id: 'logistique', label: 'Suivi & Logistique', icon: <Truck size={16} /> },
            { id: 'historique', label: 'Historique', icon: <History size={16} /> },
          ]}
        />
        <div className="grow" />
        {tab === 'produits' && (
          <Seg
            value={mode}
            onChange={setMode}
            options={[
              { id: 'liste', label: 'Liste', icon: <List size={16} /> },
              { id: 'galerie', label: 'Galerie', icon: <LayoutGrid size={16} /> },
            ]}
          />
        )}
      </div>

      {tab === 'produits' && <ProductsTab pf={pf} state={state} mode={mode} />}
      {tab === 'details' && <DetailsTab pf={pf} state={state} />}
      {tab === 'documents' && <DocumentsTab pf={pf} />}
      {tab === 'logistique' && <LogisticsTab pf={pf} />}
      {tab === 'historique' && (
        <div className="card pad">
          {[...pf.history].reverse().map((h, i) => (
            <div key={i} className="alert-line">
              <History size={15} className="muted" />
              <span className="bold">{fdate(h.date)}</span>
              <span>{h.text}</span>
              <span className="grow" />
              <span className="muted small">{h.user}</span>
            </div>
          ))}
        </div>
      )}

      <div className="card summary-bar">
        <div className="btn primary lg" style={{ cursor: 'default' }}>
          <Boxes size={18} /> Récapitulatif · {pf.lines.length} produits
        </div>
        <Metric l="Qté totale" v={`${num(t.qty)} pcs`} />
        <Metric l="CBM total" v={m3(t.cbm)} />
        <Metric l="Conteneurs" v={`${dec(t.eq40)} (40HC)`} />
        {showMoney && <Metric l="Montant total" v={money(t.amountCur, t.currency)} />}
        <Metric l="Packs validés" v={`${t.packsOk}/${t.packsTotal}`} />
        <div className="grow" />
        <Pill color="green">
          <Calendar size={14} /> {weekLabel(pf.etd)} Expédition
        </Pill>
        <Pill color="green">
          <Calendar size={14} /> {weekLabel(pf.eta)} Arrivée
        </Pill>
      </div>
    </>
  );
}

/** ETD : la semaine d'expédition se change ici (même jour de la semaine, ETA et échéance du solde suivent) */
function EtdWeek({ pf }: { pf: Proforma }) {
  const { dispatch } = useStore();
  const auth = useAuth();
  const canMove = auth.allowed({ type: 'setProformaEtd', id: pf.id, etd: addDays(pf.etd, 7) });
  if (!canMove) return <Info icon={<Ship size={18} />} label="ETD" value={weekLabel(pf.etd)} sub={`du ${fdate(pf.etd)}`} />;
  const offset = diffDays(pf.etd, weekStart(pf.etd));
  const first = weekStart(addDays(TODAY, -28));
  const weeks = Array.from({ length: 40 }, (_, i) => addDays(first, i * 7));
  if (!weeks.includes(weekStart(pf.etd))) weeks.unshift(weekStart(pf.etd));
  return (
    <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
      <span className="muted" style={{ marginTop: 2 }}>
        <Ship size={18} />
      </span>
      <div>
        <label className="muted xs" htmlFor={`etd-${pf.id}`}>
          ETD · semaine d’expédition
        </label>
        <select
          id={`etd-${pf.id}`}
          className="input etd-select"
          value={weekStart(pf.etd)}
          onChange={(e) => {
            const etd = addDays(e.target.value, offset);
            dispatch({ type: 'setProformaEtd', id: pf.id, etd });
            toast(`${pf.id} déplacée en ${weekLabel(etd)} (départ ${fdate(etd)})`);
          }}
        >
          {weeks.map((w) => (
            <option key={w} value={w}>
              {weekLabel(w)} · {fdate(addDays(w, offset))}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function Info({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
      <span className="muted" style={{ marginTop: 2 }}>
        {icon}
      </span>
      <div>
        <div className="muted xs">{label}</div>
        <div className="bold" style={{ fontSize: 17 }}>
          {value}
        </div>
        {sub && <div className="muted xs">{sub}</div>}
      </div>
    </div>
  );
}

function Metric({ l, v }: { l: string; v: string }) {
  return (
    <div className="metric">
      <div className="l">{l}</div>
      <div className="v">{v}</div>
    </div>
  );
}

type PackFilter = 'all' | 'missing' | 'late' | 'ok';
/** Couleur d'une carte / ligne produit : pack validé (vert) ou en retard (rouge) */
const packTone = (p: Product) => (packDone(p) ? 'pk-ok' : packLate(p) ? 'pk-late' : '');

function ProductsTab({ pf, state, mode }: { pf: Proforma; state: State; mode: 'galerie' | 'liste' }) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<PackFilter>('all');
  // Sélection de plusieurs produits pour les affecter à un designer
  const canAssign = useAuth().can('pack.assign');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setSel((x) => {
      const n = new Set(x);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const cur = pf.currency ?? 'EUR';
  const all = pf.lines.map((l) => ({ l, p: byId(state.products, l.productId) }));
  const match = (f: PackFilter, p: Product) => (f === 'all' ? true : f === 'missing' ? !packDone(p) : f === 'late' ? packLate(p) : packDone(p));
  const rows = all.filter(({ p }) => match(filter, p));
  const lines = rows.map((r) => r.l);
  const bar = (
    <div className="row wrap mb" style={{ gap: 8 }}>
      <Seg
        value={filter}
        onChange={setFilter}
        options={[
          { id: 'all', label: `Tous (${all.length})` },
          { id: 'missing', label: `Pack manquant (${all.filter(({ p }) => match('missing', p)).length})` },
          { id: 'late', label: `En retard (${all.filter(({ p }) => match('late', p)).length})` },
          { id: 'ok', label: `Pack OK (${all.filter(({ p }) => match('ok', p)).length})` },
        ]}
      />
      {canAssign && rows.length > 0 && (
        <label className="row small" style={{ gap: 6, marginLeft: 'auto', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={rows.every((r) => sel.has(r.p.id))}
            onChange={(e) => setSel(e.target.checked ? new Set(rows.map((r) => r.p.id)) : new Set())}
            aria-label="Tout sélectionner"
          />{' '}
          Tout sélectionner
        </label>
      )}
    </div>
  );
  const bulk = sel.size > 0 && (
    <div className="pfp-bulk">
      <b>
        {sel.size} produit{sel.size > 1 ? 's' : ''} sélectionné{sel.size > 1 ? 's' : ''}
      </b>
      <button type="button" className="btn sm ghost" onClick={() => setSel(new Set())}>
        Désélectionner
      </button>
      <AssignDesigner ids={[...sel]} onDone={() => setSel(new Set())} dark />
    </div>
  );
  const Who = ({ p }: { p: Product }) => (
    <span className="pfp-who" title="Designer du pack">
      <span className="dev-avatar" style={{ background: designerColor(p.pack.designer) }}>
        {p.pack.designer === UNASSIGNED ? '?' : initials(p.pack.designer)}
      </span>
      {p.pack.designer}
    </span>
  );
  if (!rows.length)
    return (
      <>
        {bar}
        <div className="card empty">Aucun produit dans cette sélection.</div>
      </>
    );
  if (mode === 'liste')
    return (
      <>
        {bar}
        {bulk}
        <div className="card tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                {canAssign && <th />}
                <th>Produit</th>
                <th>Marque</th>
                <th className="num">PA</th>
                <th className="num">PCB</th>
                <th className="num">Qté</th>
                <th className="num">CBM/carton</th>
                <th className="num">CBM total</th>
                <th className="num">Montant</th>
                <th>Date max artwork</th>
                <th>Designer</th>
                <th>État pack</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const p = byId(state.products, l.productId);
                return (
                  <tr key={p.id} className={`clickable ${packTone(p)}`} onClick={() => navigate(`/produits/${p.id}`)}>
                    {canAssign && (
                      <td onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={sel.has(p.id)} onChange={() => toggle(p.id)} aria-label={`Sélectionner ${p.ref}`} />
                      </td>
                    )}
                    <td>
                      <div className="row">
                        <ProductThumb product={p} size={40} />
                        <div>
                          <span className="ref-tag">{p.ref}</span>
                          <div className="small">{p.name}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <BrandLogo brand={brandOf(state.brands, p.brandId)} size={10} />
                    </td>
                    <td className="num">{money(l.price, cur)}</td>
                    <td className="num">{p.pcb}</td>
                    <td className="num">{num(l.qty)}</td>
                    <td className="num">{dec(p.cbmCarton, 3)}</td>
                    <td className="num bold">{dec(lineCbm(p, l.qty), 2)} m³</td>
                    <td className="num">{money(l.qty * l.price, cur)}</td>
                    <td>{fdate(p.pack.artworkDeadline)}</td>
                    <td>
                      <Who p={p} />
                    </td>
                    <td>
                      <PackPill product={p} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </>
    );
  return (
    <>
      {bar}
      {bulk}
      <div className="gallery">
        {lines.map((l) => {
          const p = byId(state.products, l.productId);
          return (
            <div key={p.id} className={`pcard pfp-card ${packTone(p)} ${sel.has(p.id) ? 'checked' : ''}`} onClick={() => navigate(`/produits/${p.id}`)}>
              {canAssign && (
                <input type="checkbox" className="pfp-check" checked={sel.has(p.id)} onClick={(e) => e.stopPropagation()} onChange={() => toggle(p.id)} aria-label={`Sélectionner ${p.ref}`} />
              )}
              <div className="photo" style={{ background: p.tint }}>
                <ProductPic product={p} />
              </div>
              <div>
                <span className="ref-tag">{p.ref}</span>
                <div className="pfp-name">{p.name}</div>
                <Who p={p} />
              </div>
              <div className="pfp-figs">
                <div>
                  <b>{num(l.qty)}</b>
                  <small>pcs</small>
                </div>
                <div>
                  <b>{dec(lineCbm(p, l.qty), 1)}</b>
                  <small>m³</small>
                </div>
                <div>
                  <b title={money(l.price, cur)}>
                    {new Intl.NumberFormat('fr-FR', {
                      style: 'currency',
                      currency: cur,
                      currencyDisplay: cur === 'EUR' ? 'symbol' : 'code',
                      maximumFractionDigits: 2,
                      minimumFractionDigits: 2,
                    }).format(l.price)}
                  </b>
                  <small>PA</small>
                </div>
              </div>
              <div className={`pfp-pack ${packDone(p) ? 'ok' : packLate(p) ? 'late' : 'todo'}`}>
                {packDone(p)
                  ? 'Pack OK'
                  : packLate(p)
                    ? `Pack en retard · ${fdate(p.pack.artworkDeadline)}`
                    : `Pack ${packState(p) === 'en_cours' ? 'en cours' : 'à faire'} · avant le ${fdate(p.pack.artworkDeadline)}`}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function DetailsTab({ pf, state }: { pf: Proforma; state: State }) {
  const { dispatch } = useStore();
  const auth = useAuth();
  const t = proformaTotals(state, pf);
  return (
    <div className="grid2">
      <div className="card pad">
        <div className="card-title">Conditions d’achat</div>
        <dl className="kv">
          <dt>Incoterm</dt>
          <dd>FOB {byId(state.suppliers, pf.supplierId).port}</dd>
          <dt>Devise</dt>
          <dd>
            {pf.currency ?? 'EUR'} <span className="xs muted">· paramètre du fournisseur</span>
          </dd>
          <dt>Paiement</dt>
          <dd>
            {pf.depositPct} % d’acompte · solde le {fdate(pf.balanceDue)}{' '}
            <Link className="xs" to={`/fournisseurs/${pf.supplierId}`}>
              conditions du fournisseur
            </Link>
          </dd>
          <dt>Port de départ</dt>
          <dd>{byId(state.suppliers, pf.supplierId).port}</dd>
          <dt>Port d’arrivée</dt>
          <dd>Le Havre</dd>
          <dt>ETD</dt>
          <dd>
            {weekLabel(pf.etd)} – {fdate(pf.etd)}
          </dd>
          <dt>ETA</dt>
          <dd>
            {weekLabel(pf.eta)} – {fdate(pf.eta)}
          </dd>
        </dl>
        <div className="mt">
          <div className="muted small mb">Changer le statut</div>
          <select
            className="input"
            disabled={!auth.can('proforma.edit')}
            value={pf.status}
            onChange={(e) => dispatch({ type: 'setProformaStatus', id: pf.id, status: e.target.value as ProformaStatus })}
          >
            <option value="a_signer">À signer</option>
            <option value="en_dev">En dev</option>
            <option value="en_production">En production</option>
            <option value="booke">Booké</option>
            <option value="en_transit">En transit</option>
            <option value="arrive">Arrivé</option>
          </select>
        </div>
      </div>
      {auth.can('finance.view') && (
        <div className="card pad">
          <div className="card-title">Finance</div>
          <dl className="kv">
            <dt>Montant total</dt>
            <dd>
              {money(t.amountCur, t.currency)}
              {t.currency !== 'EUR' && (
                <div className="small muted">
                  Devise du fournisseur · 1 {t.currency} = {state.settings.fx[t.currency]} €
                </div>
              )}
            </dd>
            <dt>Acompte ({pf.depositPct} %)</dt>
            <dd>
              {hasDeposit(pf) ? (
                <PayLine pf={pf} kind="deposit" amountCur={t.depositCur} currency={t.currency} paid={pf.depositPaid} due={addDays(pf.date, 7)} />
              ) : (
                <span className="muted">Pas d’acompte : rien à payer à la commande</span>
              )}
            </dd>
            <dt>Solde</dt>
            <dd>
              <PayLine pf={pf} kind="balance" amountCur={t.balanceCur} currency={t.currency} paid={pf.balancePaid} due={pf.balanceDue} />
              <div className="xs muted">
                {realDeparture(state, pf)
                  ? `Échéance : départ réel du ${fdate(realDeparture(state, pf))} + ${balanceDaysOf(state, pf)} j`
                  : `Échéance : départ prévu du ${fdate(pf.etd)} + ${balanceDaysOf(state, pf)} j (recalculée au départ réel)`}
              </div>
            </dd>
          </dl>
          <div className="row mt wrap">
            {hasDeposit(pf) && !pf.depositPaid && auth.can('finance.pay') && (
              <button className="btn" onClick={() => dispatch({ type: 'payDeposit', id: pf.id })}>
                <Check size={16} /> Marquer l’acompte payé
              </button>
            )}
            {(pf.depositPaid || !hasDeposit(pf)) && !pf.balancePaid && auth.can('finance.pay') && (
              <button className="btn" onClick={() => dispatch({ type: 'payBalance', id: pf.id })}>
                <Check size={16} /> Marquer le solde payé
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Une échéance (acompte ou solde) : montant dans la devise du fournisseur, état, copie du virement à déposer / télécharger */
function PayLine({ pf, kind, amountCur, currency, paid, due }: { pf: Proforma; kind: 'deposit' | 'balance'; amountCur: number; currency: string; paid: boolean; due: string }) {
  const auth = useAuth();
  const proof = kind === 'deposit' ? pf.depositProof : pf.balanceProof;
  return (
    <div className="pay-line">
      <b>{money(amountCur, currency)}</b>
      {paid ? <Pill color="green">Payé</Pill> : <Pill color={kind === 'deposit' ? 'red' : 'orange'}>Échéance {fdate(due)}</Pill>}
      {proof && (
        <button
          type="button"
          className="btn sm"
          onClick={async () => {
            if (!(await downloadPaymentProof(pf, kind))) toast('Fichier introuvable');
          }}
        >
          <Download size={13} /> {proof.name}
        </button>
      )}
      {auth.allowed({ type: 'setPaymentProof', id: pf.id, kind, file: { fileId: '', name: '', size: 0, type: '' } }) && (
        <PaymentProofUpload pf={pf} kind={kind} className="btn sm primary">
          <Upload size={13} /> {proof ? 'Remplacer la copie du virement' : 'Déposer la copie du virement'}
        </PaymentProofUpload>
      )}
    </div>
  );
}

/** Signer : la version déposée par le fournisseur (ou la demande de modification), sinon attente du fournisseur */
function SignButton({ pf }: { pf: Proforma }) {
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  if (!auth.can('proforma.sign')) return null;
  const pending = pendingVersion(pf);
  const revision = pendingRevision(pf);
  if (!pending) {
    if (pf.status !== 'a_signer') return null;
    return (
      <button className="btn locked" onClick={() => toast('En attente de la proforma du fournisseur : il doit la déposer dans son portail')}>
        <Lock size={16} /> Signer
      </button>
    );
  }
  return (
    <>
      <button className="btn primary" onClick={() => setOpen(true)}>
        <PenLine size={16} /> {revision ? `Signer la modification v${revision.version}` : 'Signer'}
      </button>
      {open && <SignDialog pf={pf} doc={pending} onClose={() => setOpen(false)} />}
    </>
  );
}

function DocumentsTab({ pf }: { pf: Proforma }) {
  const { state } = useStore();
  const download = async (d: string) => {
    const r = await proformaDocPdf(pf, d, { supplier: byId(state.suppliers, pf.supplierId), products: state.products, company: state.settings.company });
    if (!r) return toast(`${d} : pas de fichier joint`);
    await saveBlob(r.blob, r.name);
  };
  return (
    <>
      <ProformaVersions pf={pf} />
      <div className="card pad mt">
        {pf.documents.map((d) => (
          <div key={d} className="alert-line">
            <FileText size={16} className="green" />
            <span className="bold">{d}</span>
            <span className="grow" />
            <button className="btn sm" onClick={() => download(d)}>
              <Download size={13} /> Télécharger
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Suivi d'expédition + plan de chargement (drag & drop)

const TRACK_STEPS: { label: string; reached: (pf: Proforma) => boolean; date: (pf: Proforma, i: I18n) => string }[] = [
  { label: 'Proforma validée', reached: (p) => p.status !== 'a_signer', date: (p, { fmt }) => fmt.fshort(addDays(p.date, 2)) },
  { label: 'Développement produit', reached: (p) => !['a_signer', 'en_dev'].includes(p.status), date: (p, { fmt }) => fmt.fshort(addDays(p.date, 5)) },
  { label: 'Production en cours', reached: (p) => !['a_signer', 'en_dev'].includes(p.status), date: (p, { fmt }) => fmt.fshort(addDays(p.date, 9)) },
  { label: 'Booking conteneur', reached: (p) => ['booke', 'en_transit', 'arrive'].includes(p.status), date: (p, { fmt }) => fmt.fshort(addDays(p.etd, -14)) },
  { label: 'Prêt à charger', reached: (p) => ['en_transit', 'arrive'].includes(p.status), date: (p, { fmt }) => fmt.fshort(addDays(p.etd, -3)) },
  { label: 'En transit', reached: (p) => ['en_transit', 'arrive'].includes(p.status), date: (p, { fmt, t }) => t('track.since', { date: fmt.fshort(p.etd) }) },
  { label: 'Arrivée port', reached: (p) => p.status === 'arrive', date: (p, { fmt }) => fmt.fshort(p.eta) },
  { label: 'Réception', reached: (p) => p.status === 'arrive', date: (p, { fmt }) => fmt.weekLabel(addDays(p.eta, 3)) },
];

export function LogisticsTab({ pf, portal }: { pf: Proforma; portal?: boolean }) {
  const { state, dispatch } = useStore();
  const auth = useAuth();
  const [scope, setScope] = useState<'pf' | 'others' | 'all'>('pf');
  const [selected, setSelected] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  // Alternative tactile au glisser-déposer : toucher une ligne, puis un conteneur
  const [picked, setPicked] = useState<string | null>(null);
  const i18n = useT(); // français hors portail
  const { t, fmt } = i18n;
  const { dec, m3, num } = fmt;

  const lastReached = TRACK_STEPS.map((s) => s.reached(pf)).lastIndexOf(true);

  // Conteneurs du fournisseur encore modifiables, ou liés à cette proforma
  const containers = useMemo(
    () => state.containers.filter((c) => c.allocations.some((a) => a.proformaId === pf.id) || (c.supplierId === pf.supplierId && ['a_booker', 'booking_demande'].includes(c.status))),
    [state.containers, pf],
  );
  const sel = containers.find((c) => c.id === selected) ?? containers[0];

  const otherPfs = state.proformas.filter((p) => p.supplierId === pf.supplierId && p.id !== pf.id && !['arrive', 'en_transit'].includes(p.status));
  const sourcePfs = scope === 'pf' ? [pf] : scope === 'others' ? otherPfs : [pf, ...otherPfs];
  const lines = sourcePfs.flatMap((p) => p.lines.map((l) => ({ pf: p, line: l })));

  const totalQty = pf.lines.reduce((s, l) => s + l.qty, 0);
  const totalCbm = proformaTotals(state, pf).cbm;
  const loadedQty = pf.lines.reduce((s, l) => s + Math.min(l.qty, allocatedQty(state, pf.id, l.productId)), 0);
  const loadedCbm = pf.lines.reduce((s, l) => s + lineCbm(byId(state.products, l.productId), Math.min(l.qty, allocatedQty(state, pf.id, l.productId))), 0);

  function drop(c: Container, payload: string) {
    const [proformaId, productId] = payload.split('|');
    const src = state.proformas.find((p) => p.id === proformaId)!;
    const line = src.lines.find((l) => l.productId === productId)!;
    const p = byId(state.products, productId);
    const remaining = line.qty - allocatedQty(state, proformaId, productId);
    if (remaining <= 0) return toast(t('log.toast.full'));
    if (!auth.allowed({ type: 'allocate', containerId: c.id, proformaId, productId, qty: 1 })) return toast(t('log.toast.locked'));
    if (['en_transit', 'arrive'].includes(c.status)) return toast(t('log.toast.gone'));
    const free = containerCapacity(c) - containerCbm(state, c);
    const maxCartons = Math.floor(free / p.cbmCarton);
    const qty = Math.min(remaining, maxCartons * p.pcb);
    if (qty <= 0) return toast(t('log.toast.capacity', { c: c.id }));
    dispatch({ type: 'allocate', containerId: c.id, proformaId, productId, qty });
    toast(`${num(qty)} pcs ${p.ref} → ${c.number ?? c.id}${qty < remaining ? t('log.toast.limited') : ''}`);
    setSelected(c.id);
  }

  return (
    <>
      {!portal && <BookingBanner pf={pf} />}
      <div className="card pad mb">
        <div className="row mb">
          <Truck className="green" />
          <span className="bold" style={{ fontSize: 16 }}>
            {t('log.tracking')}
          </span>
        </div>
        <div className="stepper">
          {TRACK_STEPS.map((s, i) => (
            <div key={s.label} className={`step ${i < lastReached ? 'done' : i === lastReached ? 'current done' : ''}`}>
              <div className="bullet">{i <= lastReached ? <Check size={15} strokeWidth={3} /> : null}</div>
              <div className="lbl">{t(`track.${i}` as Key)}</div>
              <div className="muted xs">{s.date(pf, i18n)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="split3">
        <div className="card pad">
          <div className="card-title">
            <Boxes size={18} className="green" /> {t('log.toConsolidate')}
          </div>
          <div className="mb">
            <Seg
              value={scope}
              onChange={setScope}
              options={[
                { id: 'pf', label: `${pf.id.slice(-4)} (${pf.lines.length})` },
                { id: 'others', label: t('log.otherPfs', { n: otherPfs.length }) },
                { id: 'all', label: t('log.all') },
              ]}
            />
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th />
                  <th>{t('col.refShort')}</th>
                  <th className="num">{t('col.qty')}</th>
                  <th className="num">{t('col.allocated')}</th>
                  <th className="num">{t('col.remaining')}</th>
                  <th className="num">{t('col.cbm')}</th>
                </tr>
              </thead>
              <tbody>
                {lines.map(({ pf: src, line }) => {
                  const p = byId(state.products, line.productId);
                  const alloc = allocatedQty(state, src.id, p.id);
                  const rest = Math.max(0, line.qty - alloc);
                  return (
                    <tr
                      key={src.id + p.id}
                      draggable={rest > 0}
                      className={`${rest > 0 ? 'clickable' : ''} ${picked === `${src.id}|${p.id}` ? 'selected' : ''}`}
                      onClick={() => rest > 0 && setPicked(picked === `${src.id}|${p.id}` ? null : `${src.id}|${p.id}`)}
                      onDragStart={(e) => e.dataTransfer.setData('text/plain', `${src.id}|${p.id}`)}
                      title={rest > 0 ? t('log.dragTitle') : t('log.fullyAllocated')}
                    >
                      <td>
                        <GripVertical size={14} className="drag-handle" />
                      </td>
                      <td>
                        <div className="row" style={{ gap: 6 }}>
                          <ProductThumb product={p} size={30} />
                          <div>
                            <div className="bold small">{p.ref}</div>
                            <div className="xs muted">{src.id === pf.id ? p.name : src.id}</div>
                          </div>
                        </div>
                      </td>
                      <td className="num">{num(line.qty)}</td>
                      <td className="num green bold">{num(alloc)}</td>
                      <td className="num">{rest > 0 ? <Pill color="orange">{num(rest)}</Pill> : <span className="muted">0</span>}</td>
                      <td className="num">{dec(lineCbm(p, line.qty), 2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="xs muted mt">{t('log.help')}</div>
        </div>

        <div className="card pad">
          <div className="card-title">
            <Ctn size={18} className="green" /> {t('log.planTitle', { n: containers.length, s: containers.length > 1 ? 's' : '' })}
            <div className="grow" />
            <span className="pill grey">{t('log.capacity', { v: m3(containers.reduce((s, c) => s + containerCapacity(c), 0)) })}</span>
          </div>
          {picked && (
            <div className="pill orange mb" style={{ whiteSpace: 'normal' }}>
              {t('log.picked', { ref: byId(state.products, picked.split('|')[1]).ref })}
            </div>
          )}
          <div className="cgrid">
            {containers.map((c, i) => {
              const cbm = containerCbm(state, c);
              const ratio = cbm / containerCapacity(c);
              return (
                <div
                  key={c.id}
                  className={`ccard ${sel?.id === c.id ? 'selected' : ''} ${dragOver === c.id ? 'drop' : ''}`}
                  onClick={() => {
                    if (picked) {
                      drop(c, picked);
                      setPicked(null);
                    } else setSelected(c.id);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(c.id);
                  }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(null);
                    drop(c, e.dataTransfer.getData('text/plain'));
                  }}
                >
                  <div className="row">
                    <span className={`ctag ${ratio < 0.6 ? 'orange' : ''}`}>C{i + 1}</span>
                    <span className="bold small">{c.type}</span>
                    <div className="grow" />
                    {c.planValidated && <Check size={16} className="green" />}
                    {auth.allowed({ type: 'deleteContainer', containerId: c.id }) && (
                      <button
                        type="button"
                        className="icon-btn danger-ico ccard-del"
                        title={t('cp.delete')}
                        aria-label={`${t('cp.delete')} ${c.number ?? c.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          const n = containerQty(c);
                          if (n > 0 && !window.confirm(t('cp.deleteConfirm', { id: c.number ?? c.id, n: num(n) }))) return;
                          dispatch({ type: 'deleteContainer', containerId: c.id });
                          toast(t('cp.deleted', { id: c.number ?? c.id }));
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  <div className="xs muted">{c.number ?? c.id}</div>
                  <div className="row">
                    <span className="bold" style={{ fontSize: 18 }}>
                      {Math.round(ratio * 100)} %
                    </span>
                    <div className="grow" />
                    <ContainerStatusPill status={c.status} />
                  </div>
                  <Progress value={ratio} warnAt={0.98} />
                  <div className="xs muted">
                    {dec(cbm, 2)} / {dec(containerCapacity(c), 2)} m³
                  </div>
                  <div className="bold">{num(containerQty(c))} pcs</div>
                </div>
              );
            })}
            {auth.allowed({ type: 'createContainer', supplierId: pf.supplierId, etd: pf.etd, eta: pf.eta }) && (
              <div
                className="ccard center"
                style={{ justifyContent: 'center', alignItems: 'center', borderStyle: 'dashed', minHeight: 150 }}
                onClick={() => {
                  dispatch({ type: 'createContainer', supplierId: pf.supplierId, etd: pf.etd, eta: pf.eta });
                  toast(t('log.toast.created'));
                }}
              >
                <Plus className="green" />
                <span className="bold small">{t('log.newContainer')}</span>
              </div>
            )}
          </div>
        </div>

        <div className="card pad">{sel ? <ContainerPanel c={sel} index={containers.indexOf(sel) + 1} portal={portal} /> : <div className="empty">{t('log.noContainer')}</div>}</div>
      </div>

      <div className="card summary-bar">
        <Ring value={totalQty ? loadedQty / totalQty : 0} size={78} stroke={9} />
        <div className="col">
          <div className="bold" style={{ fontSize: 16 }}>
            {t('log.consolidation', { pf: pf.id })}
          </div>
          <span className="small">
            <Check size={13} className="green" /> {t('log.loaded', { qty: num(loadedQty), cbm: m3(loadedCbm) })}
          </span>
          <span className="small orange">{t('log.remaining', { qty: num(totalQty - loadedQty), cbm: m3(totalCbm - loadedCbm) })}</span>
        </div>
        <div className="grow" />
        <Metric l={t('log.m.containers')} v={`${containers.length} × 40HC`} />
        <Metric l={t('log.m.totalQty')} v={`${num(totalQty)} pcs`} />
        <Metric l={t('log.m.totalCbm')} v={m3(totalCbm)} />
      </div>
    </>
  );
}

/** Champ modifiable du plan : quantité ou nombre de cartons d'une ligne du conteneur (validé à la sortie du champ ou par Entrée) */
function AllocInput({ c, a, value, label, toQty }: { c: Container; a: Container['allocations'][number]; value: number; step: number; label: string; toQty: (v: number) => number }) {
  const { state, dispatch } = useStore();
  const { t, fmt } = useT();
  const shown = Number.isInteger(value) ? String(value) : value.toFixed(1);
  const [v, setV] = useState(shown);
  const [prev, setPrev] = useState(shown);
  if (prev !== shown) {
    setPrev(shown);
    setV(shown);
  }
  const commit = () => {
    const n = Number(v.replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) return setV(shown);
    const qty = Math.round(toQty(n));
    if (qty === a.qty) return setV(shown);
    const max = maxAllocQty(state, c.id, a.proformaId, a.productId);
    const ref = byId(state.products, a.productId).ref;
    if (qty > max) {
      toast(t('cp.max', { n: fmt.num(max), ref }));
      return setV(shown);
    }
    dispatch({ type: 'setAllocationQty', containerId: c.id, proformaId: a.proformaId, productId: a.productId, qty });
    toast(t('cp.qtySet', { ref, n: fmt.num(qty) }));
  };
  return (
    <input
      className="input alloc-input"
      inputMode="decimal"
      aria-label={label}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') setV(shown);
      }}
    />
  );
}

function ContainerPanel({ c, index, portal }: { c: Container; index: number; portal?: boolean }) {
  const { state, dispatch } = useStore();
  const auth = useAuth();
  const cbm = containerCbm(state, c);
  const ratio = cbm / containerCapacity(c);
  const { t, fmt } = useT(); // français hors portail
  const { dec, num } = fmt;
  const editable = auth.allowed({ type: 'deallocate', containerId: c.id, proformaId: '', productId: '' }) && ['a_booker', 'booking_demande'].includes(c.status);
  return (
    <>
      <div className="card-title">
        <Ctn size={18} className="green" /> {t('cp.title', { n: index })}
      </div>
      <div className="row mb">
        <div className="grow">
          <div className="small">
            {dec(cbm, 2)} / {dec(containerCapacity(c), 2)} m³
          </div>
          <Progress value={ratio} warnAt={0.98} />
        </div>
        <span className="bold">{Math.round(ratio * 100)} %</span>
        <span className="bold">{num(containerQty(c))} pcs</span>
      </div>
      {ratio > 1 && <div className="pill red mb">{t('cp.over')}</div>}
      <div className="row wrap mb">{c.loading?.status === 'validated' && <Pill color="green">{t('cp.loadingOk', { date: fmt.fshort(c.loading.date) })}</Pill>}</div>
      <table className="tbl">
        <thead>
          <tr>
            <th>{t('col.refShort')}</th>
            <th className="num">{t('cp.pcb')}</th>
            <th className="num">{t('col.qty')}</th>
            <th className="num">{t('col.cartons')}</th>
            <th className="num">{t('col.cbm')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {c.allocations.map((a) => {
            const p = byId(state.products, a.productId);
            return (
              <tr key={a.proformaId + a.productId}>
                <td>
                  <div className="row" style={{ gap: 6 }}>
                    <ProductThumb product={p} size={26} />
                    <div>
                      <div className="bold small">{p.ref}</div>
                      <div className="xs muted">{a.proformaId}</div>
                    </div>
                  </div>
                </td>
                <td className="num small muted">{t('cp.pcbUnit', { n: num(p.pcb) })}</td>
                <td className="num">{editable ? <AllocInput c={c} a={a} value={a.qty} step={1} label={t('cp.qtyOf', { ref: p.ref })} toQty={(v) => v} /> : num(a.qty)}</td>
                <td className="num">
                  {editable && p.pcb > 0 ? <AllocInput c={c} a={a} value={a.qty / p.pcb} step={1} label={t('cp.ctnOf', { ref: p.ref })} toQty={(v) => v * p.pcb} /> : num(a.qty / p.pcb)}
                  {p.pcb > 1 && a.qty % p.pcb !== 0 && (
                    <div className="xs" style={{ color: '#b45309' }}>
                      {t('cp.partial', { n: num(a.qty % p.pcb) })}
                    </div>
                  )}
                </td>
                <td className="num">{dec(lineCbm(p, a.qty), 2)}</td>
                <td>
                  {editable && (
                    <button
                      className="btn ghost sm danger"
                      title={t('cp.remove')}
                      onClick={() => dispatch({ type: 'deallocate', containerId: c.id, proformaId: a.proformaId, productId: a.productId })}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
          {c.allocations.length === 0 && (
            <tr>
              <td colSpan={6} className="empty">
                {t('cp.dropHere')}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <div className="col mt" style={{ gap: 8 }}>
        {!portal && auth.canSee('conteneurs') && (
          <Link to={`/conteneurs?c=${c.id}`} className="btn ghost sm">
            {t('cp.seeContainers')}
          </Link>
        )}
      </div>
    </>
  );
}

/** État du booking dans l'en-tête de la proforma */
function BookingState({ pf }: { pf: Proforma }) {
  const b = pf.booking!;
  if (!b.answeredAt)
    return (
      <Link to="/booking" className="pill orange pf-bk-state" title={`Demandé le ${fdate(b.requestedAt.slice(0, 10))}`}>
        <Ship size={14} /> Booking demandé · {b.containers} × 40HC · {b.proposal ? 'proposition à valider' : b.ackAt ? `attente ${b.forwarder}` : 'attente fournisseur'}
      </Link>
    );
  return (
    <Link to="/booking" className="pill green pf-bk-state">
      <Check size={14} /> Booké · chargement {fdate(b.loadingDate)} · départ {fdate(b.etd)}
    </Link>
  );
}

/** Onglet Suivi & Logistique : demande de booking et son état, au-dessus du plan de chargement */
function BookingBanner({ pf }: { pf: Proforma }) {
  const b = pf.booking;
  if (!b && ['booke', 'en_transit', 'arrive'].includes(pf.status)) return null;
  return (
    <div className={`card pad mb pf-bk-banner ${b?.answeredAt ? 'done' : b ? 'wait' : ''}`}>
      <Ship size={22} />
      <div className="grow">
        {!b && (
          <>
            <b>{pf.status === 'a_signer' ? 'Booking : proforma à signer d’abord' : 'Booking à demander'}</b>
            <span>JONAS choisit le transitaire ; le fournisseur prend en compte, le transitaire propose, le fournisseur et JONAS acceptent.</span>
          </>
        )}
        {b && !b.answeredAt && (
          <>
            <b>
              Booking demandé · {b.containers} × 40HC · chargement souhaité {fdate(b.dateWanted)} · {b.forwarder}
            </b>
            <span>
              {b.proposal
                ? `Proposition de ${b.forwarder} à valider par le fournisseur et JONAS`
                : b.ackAt
                  ? `Pris en compte par le fournisseur le ${fdate(b.ackAt.slice(0, 10))} · marchandise prête le ${fdate(b.readyDate)} · en attente de la proposition de ${b.forwarder}`
                  : `Envoyé le ${fdate(b.requestedAt.slice(0, 10))} · en attente de la prise en compte du fournisseur`}
              {b.reminders.length ? ` · ${b.reminders.length} relance(s)` : ''}
            </span>
            {b.proposal && <BookingReview pf={pf} />}
            <LastRejection pf={pf} />
          </>
        )}
        {b?.answeredAt && (
          <>
            <b>
              Booké · chargement {fdate(b.loadingDate)} · départ {fdate(b.etd)} · arrivée {fdate(b.eta)}
            </b>
            <span>
              {b.bookedBy === 'transitaire' ? `Proposé par ${b.forwarder}` : `Saisi par le fournisseur pour ${b.forwarder ?? 'le transitaire'}`}, accepté le {fdate(b.answeredAt.slice(0, 10))}
              {b.carrier ? ` · ${b.carrier}` : ''}
              {b.bookingNo ? ` · ${b.bookingNo}` : ''}
            </span>
          </>
        )}
      </div>
      <BookingRequestButton pf={pf} />
    </div>
  );
}
