import { Link } from 'react-router-dom';
import { AlertTriangle, Box, Calendar, Container as Ctn, Euro, FileText, PenLine, Ship, Truck } from 'lucide-react';
import {
  byId,
  containerCbm,
  containerEta,
  containerValue,
  packDone,
  packLate,
  payments,
  proformaTotals,
  currentValidator,
  useAuth,
  useStore,
  currentUser,
} from '../data/store';
import { PROFORMA_STATUSES } from '../data/types';
import { Kpi, Pill, ProductThumb, PROFORMA_COLOR } from '../components/ui';
import type { Module } from '../data/permissions';
import { PROFORMA_STATUS_LABEL } from '../data/store';
import { TODAY, addDays, diffDays, eur, fdate, fshort, num, weekLabel } from '../lib/format';

export default function Home() {
  const { state } = useStore();
  const auth = useAuth();
  const me = auth.user;
  const money = auth.can('finance.view');
  // Packs qui attendent MA validation, et packs du designer connecté
  const myValidations = state.products.filter((p) => {
    const st = currentValidator(p);
    return st && st !== 'fournisseur' && me.validationStep === st;
  });
  const myPacks = me.designerName
    ? state.products.filter((p) => p.pack.designer === me.designerName && !packDone(p)).sort((a, b) => a.pack.artworkDeadline.localeCompare(b.pack.artworkDeadline))
    : [];
  const toSign = state.proformas.filter((p) => p.status === 'a_signer');
  const latePacks = state.products.filter(packLate);
  const pays = payments(state);
  const latePays = pays.filter((p) => !p.paid && p.due < TODAY);
  const urgentBooking = state.containers.filter((c) => c.status === 'a_booker' && diffDays(c.etdPlanned, TODAY) < 21);
  const delayed = state.containers.filter((c) => c.etaRevised && c.status !== 'arrive');
  const transit = state.containers.filter((c) => c.status === 'en_transit');
  const engaged = state.proformas.filter((p) => p.status !== 'arrive').reduce((s, p) => s + proformaTotals(state, p).amount, 0);
  const packsOk = state.products.filter(packDone).length;
  const arrivals = state.containers
    .filter((c) => c.status !== 'arrive' && containerEta(c) <= addDays(TODAY, 42))
    .sort((a, b) => containerEta(a).localeCompare(containerEta(b)));

  const statusTotals = PROFORMA_STATUSES.map((s) => {
    const l = state.proformas.filter((p) => p.status === s);
    return { s, n: l.length, amount: l.reduce((x, p) => x + proformaTotals(state, p).amount, 0) };
  });
  const maxAmount = Math.max(...statusTotals.map((x) => x.amount), 1);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Bonjour {currentUser(state).name} 👋</h1>
          <div className="page-sub">
            Cockpit achats internationaux · {fdate(TODAY)} · semaine {weekLabel(TODAY)}
          </div>
        </div>
      </div>

      {(myValidations.length > 0 || myPacks.length > 0) && (
        <div className="card pad mb" style={{ borderColor: 'var(--green)' }}>
          <div className="card-title">
            <Box size={18} className="green" /> Mes actions
          </div>
          {myValidations.slice(0, 6).map((p) => (
            <Link key={p.id} to="/design" className="alert-line">
              <ProductThumb product={p} size={30} />
              <span className="bold small">{p.ref}</span>
              <span className="small">{p.name}</span>
              <span className="grow" />
              <Pill color="orange">Validation {me.name} attendue</Pill>
            </Link>
          ))}
          {myPacks.slice(0, 6).map((p) => (
            <Link key={p.id} to="/design" className="alert-line">
              <ProductThumb product={p} size={30} />
              <span className="bold small">{p.ref}</span>
              <span className="small">{p.name}</span>
              <span className="grow" />
              <span className={`small ${packLate(p) ? 'red bold' : 'muted'}`}>limite {fshort(p.pack.artworkDeadline)}</span>
            </Link>
          ))}
          {myValidations.length + myPacks.length > 12 && (
            <Link to="/design" className="alert-line green bold">
              Voir les {myValidations.length + myPacks.length} packs dans l’Espace Designer →
            </Link>
          )}
        </div>
      )}

      <div className="kpis mb">
        {money && <Kpi icon={<Euro size={18} />} value={eur(engaged)} label="Achats engagés (non arrivés)" />}
        <Kpi icon={<Truck size={18} />} value={transit.length} label={money ? `Conteneurs en transit · ${eur(transit.reduce((s, c) => s + containerValue(state, c), 0))}` : 'Conteneurs en transit'} color="blue" />
        <Kpi icon={<Box size={18} />} value={`${packsOk}/${state.products.length}`} label="Packs validés (4/4)" />
        <Kpi icon={<Ctn size={18} />} value={`${num(state.containers.reduce((s, c) => s + containerCbm(state, c), 0))} m³`} label="Volume planifié" />
      </div>

      <div className="grid2 mb">
        <div className="card pad">
          <div className="card-title">
            <AlertTriangle size={18} className="red" /> Alertes & actions
          </div>
          <Alert m="proformas" to="/proformas?statut=a_signer" icon={<PenLine size={16} className="red" />} n={toSign.length} text="proforma(s) à signer" />
          <Alert m="design" to="/design" icon={<Box size={16} className="red" />} n={latePacks.length} text="pack(s) en retard sur la date limite artwork" />
          <Alert m="conteneurs" to="/conteneurs" icon={<Calendar size={16} className="orange" />} n={urgentBooking.length} text="conteneur(s) à booker avec départ < 3 semaines" />
          <Alert m="conteneurs" to="/conteneurs" icon={<Ship size={16} className="orange" />} n={delayed.length} text="conteneur(s) avec ETA révisée (retard)" />
          <Alert m="finance" to="/finance" icon={<Euro size={16} className="red" />} n={latePays.length} text={`échéance(s) en retard · ${eur(latePays.reduce((s, p) => s + p.amount, 0))}`} />
          <Alert
            m="finance"
            to="/finance"
            icon={<FileText size={16} className="orange" />}
            n={state.proformas.filter((p) => !p.depositPaid).length}
            text="acompte(s) à faire"
          />
        </div>
        {auth.canSee('proformas') && <div className="card pad">
          <div className="card-title">
            <FileText size={18} className="green" /> Proformas par statut
          </div>
          {statusTotals.map(({ s, n, amount }) => (
            <Link key={s} to={`/proformas?statut=${s}`} className="row" style={{ padding: '6px 0' }}>
              <span style={{ width: 120 }}>
                <Pill color={PROFORMA_COLOR[s]}>{PROFORMA_STATUS_LABEL[s]}</Pill>
              </span>
              <span className="bold" style={{ width: 24 }}>
                {n}
              </span>
              <div className="grow progress" style={{ height: 10 }}>
                <div style={{ width: `${(amount / maxAmount) * 100}%` }} />
              </div>
              <span className="small bold right" style={{ width: 100 }}>
                {money ? eur(amount) : ''}
              </span>
            </Link>
          ))}
        </div>}
      </div>

      <div className="grid2">
        {auth.canSee('conteneurs') && <div className="card pad">
          <div className="card-title">
            <Ship size={18} className="green" /> Arrivages des 6 prochaines semaines
          </div>
          {arrivals.map((c) => (
            <Link key={c.id} to={`/conteneurs?c=${c.id}`} className="alert-line">
              <span className="bold" style={{ width: 44 }}>
                {weekLabel(containerEta(c))}
              </span>
              <span className="small">{fshort(containerEta(c))}</span>
              <span className="small bold">{c.number ?? c.id}</span>
              <span className="small muted">{byId(state.suppliers, c.supplierId).shortName}</span>
              <span className="grow" />
              <Pill color={c.status === 'en_transit' ? 'blue' : c.status === 'booke' ? 'green' : 'orange'}>{c.status === 'en_transit' ? 'En transit' : c.status === 'booke' ? 'Booké' : 'Non booké'}</Pill>
            </Link>
          ))}
        </div>}
        <div className="card pad">
          <div className="card-title">
            <Box size={18} className="red" /> Packs en retard
          </div>
          {latePacks.length === 0 && <div className="empty">Aucun pack en retard 🎉</div>}
          {latePacks.length > 8 && (
            <Link to="/design" className="alert-line green bold">
              + {latePacks.length - 8} autres packs en retard → Espace Designer
            </Link>
          )}
          {latePacks.slice(0, 8).map((p) => (
            <Link key={p.id} to={`/produits/${p.id}`} className="alert-line">
              <ProductThumb product={p} size={30} />
              <span className="bold small">{p.ref}</span>
              <span className="small">{p.name}</span>
              <span className="grow" />
              <span className="small red">limite {fshort(p.pack.artworkDeadline)}</span>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}

function Alert({ to, icon, n, text, m }: { to: string; icon: React.ReactNode; n: number; text: string; m: Module }) {
  const { canSee } = useAuth();
  if (!canSee(m)) return null;
  return (
    <Link to={to} className="alert-line" style={{ opacity: n ? 1 : 0.5 }}>
      {icon}
      <span className="bold" style={{ minWidth: 22 }}>
        {n}
      </span>
      <span>{text}</span>
      <span className="grow" />
      <span className="muted">›</span>
    </Link>
  );
}
