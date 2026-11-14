import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Calendar, Check, Euro, Wallet } from 'lucide-react';
import { byId, payments, useStore } from '../data/store';
import { Kpi, Pill, Seg, SupplierLogo, toast } from '../components/ui';
import { TODAY, addDays, eur, fdate, weekLabel } from '../lib/format';

export default function Finance() {
  const { state, dispatch } = useStore();
  const [f, setF] = useState<'open' | 'late' | 'paid' | 'all'>('open');
  const all = payments(state);
  const open = all.filter((p) => !p.paid);
  const late = open.filter((p) => p.due < TODAY);
  const next30 = open.filter((p) => p.due >= TODAY && p.due <= addDays(TODAY, 30));
  const list = f === 'open' ? open : f === 'late' ? late : f === 'paid' ? all.filter((p) => p.paid) : all;
  const sum = (l: typeof all) => l.reduce((s, p) => s + p.amount, 0);

  return (
    <>
      <div className="page-head">
        <h1>Factures & Finance</h1>
        <span className="page-sub">Acomptes, soldes et échéances reliés aux proformas et fournisseurs</span>
      </div>
      <div className="kpis mb">
        <Kpi icon={<Wallet size={18} />} value={eur(sum(all.filter((p) => p.paid)))} label="Déjà payé" />
        <Kpi icon={<Euro size={18} />} value={eur(sum(open))} label="Reste à payer" color="orange" />
        <Kpi icon={<AlertTriangle size={18} />} value={eur(sum(late))} label={`En retard (${late.length})`} color="red" onClick={() => setF('late')} />
        <Kpi icon={<Calendar size={18} />} value={eur(sum(next30))} label="Échéances à 30 jours" />
        <Kpi icon={<Check size={18} />} value={open.filter((p) => p.kind === 'Acompte').length} label="Acomptes à faire" color="red" />
      </div>
      <div className="mb">
        <Seg
          value={f}
          onChange={setF}
          options={[
            { id: 'open', label: `À payer (${open.length})` },
            { id: 'late', label: `En retard (${late.length})` },
            { id: 'paid', label: 'Payés' },
            { id: 'all', label: 'Tous' },
          ]}
        />
      </div>
      <div className="card tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Échéance</th>
              <th>Fournisseur</th>
              <th>Proforma</th>
              <th>Type</th>
              <th className="num">Montant</th>
              <th>Statut</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map((p) => {
              const sup = byId(state.suppliers, p.supplierId);
              const isLate = !p.paid && p.due < TODAY;
              const pf = byId(state.proformas, p.proformaId);
              const blocked = p.kind === 'Solde' && !pf.depositPaid;
              return (
                <tr key={p.proformaId + p.kind}>
                  <td className={isLate ? 'red bold' : ''}>
                    {fdate(p.due)} <span className="muted xs">{weekLabel(p.due)}</span>
                  </td>
                  <td>
                    <div className="row">
                      <SupplierLogo supplier={sup} size={26} /> {sup.shortName}
                    </div>
                  </td>
                  <td>
                    <Link to={`/proformas/${p.proformaId}`} className="bold green">
                      {p.proformaId}
                    </Link>
                  </td>
                  <td>{p.kind}</td>
                  <td className="num bold">{eur(p.amount)}</td>
                  <td>{p.paid ? <Pill color="green">Payé</Pill> : isLate ? <Pill color="red">En retard</Pill> : <Pill color="orange">À payer</Pill>}</td>
                  <td>
                    {!p.paid && (
                      <button
                        className="btn sm primary"
                        disabled={blocked}
                        title={blocked ? 'Acompte à régler d’abord' : ''}
                        onClick={() => {
                          dispatch({ type: p.kind === 'Acompte' ? 'payDeposit' : 'payBalance', id: p.proformaId });
                          toast(`${p.kind} ${p.proformaId} marqué payé`);
                        }}
                      >
                        <Check size={12} /> Marquer payé
                      </button>
                    )}
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
