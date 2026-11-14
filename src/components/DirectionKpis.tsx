import { Link } from 'react-router-dom';
import { BarChart3 } from 'lucide-react';
import { capacityOf, containerEta, packDone, packLate, proformaTotals, useStore } from '../data/store';
import { TODAY, dec, diffDays, eur, num, weekKey, weekLabel } from '../lib/format';
import { SupplierLogo } from './ui';
import { designerColor } from './ui-shared';
import { initials } from '../lib/format';

/** Indicateurs de pilotage Direction (calculés sur les données de l'application) */
export default function DirectionKpis() {
  const { state } = useStore();

  // Respect des ETA : conteneurs partis (transit + arrivés)
  const shipped = state.containers.filter((c) => c.status === 'en_transit' || c.status === 'arrive');
  const delays = shipped.map((c) => Math.max(0, diffDays(containerEta(c), c.etaPlanned)));
  const onTime = delays.filter((d) => d === 0).length;
  const lateAvg = delays.filter((d) => d > 0);

  // Réceptions contrôlées
  const received = state.containers.filter((c) => c.reception);
  const conform = received.filter((c) => c.reception!.lines.every((l) => l.received === l.expected));
  const missing = received.reduce((t, c) => t + c.reception!.lines.reduce((x, l) => x + Math.max(0, l.expected - l.received), 0), 0);

  // Packs : échus à date
  const due = state.products.filter((p) => p.pack.artworkDeadline < TODAY);
  const dueOk = due.filter(packDone).length;
  const late = state.products.filter(packLate);

  // Valeur engagée au m³
  const open = state.proformas.filter((p) => p.status !== 'arrive');
  const tot = open.map((p) => proformaTotals(state, p));
  const value = tot.reduce((t, x) => t + x.amount, 0);
  const cbm = tot.reduce((t, x) => t + x.cbm, 0);

  // Charge designers semaine en cours
  const wk = weekKey(TODAY);
  const designers = [...new Set(state.products.map((p) => p.pack.designer))].sort();
  const load = designers.map((d) => {
    const items = state.products.filter((p) => p.pack.designer === d && weekKey(p.pack.artworkDeadline) === wk);
    return { d, n: items.length, done: items.filter(packDone).length, cap: capacityOf(state, d) };
  });

  // Fournisseurs
  const suppliers = state.suppliers
    .map((s) => {
      const cs = state.containers.filter((c) => c.supplierId === s.id);
      const revised = cs.filter((c) => c.etaRevised || (c.etaReal && c.etaReal > c.etaPlanned)).length;
      const prods = state.products.filter((p) => p.supplierId === s.id);
      const lateP = prods.filter(packLate).length;
      const pfs = state.proformas.filter((p) => p.supplierId === s.id);
      const amount = pfs.reduce((t, p) => t + proformaTotals(state, p).amount, 0);
      const gaps = cs.filter((c) => c.reception && c.reception.lines.some((l) => l.received !== l.expected)).length;
      return { s, pfs: pfs.length, amount, cs: cs.length, revised, lateP, gaps };
    })
    .filter((x) => x.pfs || x.cs)
    .sort((a, b) => b.amount - a.amount);

  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)} %` : '—');

  return (
    <section className="card pad mb">
      <div className="card-title">
        <BarChart3 size={18} className="green" /> Indicateurs de pilotage
      </div>
      <div className="kpi-grid">
        <div className="kpi-box">
          <small>Conteneurs à l’heure (ETA)</small>
          <b>{pct(onTime, shipped.length)}</b>
          <span>{lateAvg.length ? `${lateAvg.length} en retard · ${dec(lateAvg.reduce((a, b) => a + b, 0) / lateAvg.length, 1)} j en moyenne` : 'Aucun retard'}</span>
        </div>
        <div className="kpi-box">
          <small>Réceptions conformes</small>
          <b>{pct(conform.length, received.length)}</b>
          <span>{received.length ? `${received.length} contrôlée(s) · ${num(missing)} pcs manquantes` : 'Aucune réception contrôlée'}</span>
        </div>
        <div className="kpi-box">
          <small>Packs rendus à temps</small>
          <b>{pct(dueOk, due.length)}</b>
          <span className={late.length ? 'red' : ''}>{late.length} pack(s) en retard</span>
        </div>
        <div className="kpi-box">
          <small>Valeur engagée au m³</small>
          <b>{cbm ? eur(value / cbm) : '—'}</b>
          <span>
            {eur(value)} · {dec(cbm, 0)} m³
          </span>
        </div>
      </div>

      <div className="grid2 mt">
        <div>
          <div className="bold small mb">Charge des designers · semaine {weekLabel(TODAY)}</div>
          {load.map((l) => (
            <div key={l.d} className="load-row">
              <span className="dev-avatar" style={{ background: designerColor(l.d) }}>
                {initials(l.d)}
              </span>
              <span className="load-name">{l.d}</span>
              <span className="load-bar">
                <span className="cap" style={{ width: `${Math.min(100, (l.n / Math.max(l.cap, l.n)) * 100)}%` }} />
                <span className="done" style={{ width: `${Math.min(100, (l.done / Math.max(l.cap, l.n)) * 100)}%` }} />
              </span>
              <span className={`load-num ${l.n > l.cap ? 'red' : ''}`}>
                {l.done}/{l.n} <small>cap. {l.cap}</small>
              </span>
            </div>
          ))}
          <Link to="/design" className="small green bold">
            Voir le planning de charge →
          </Link>
        </div>
        <div className="tbl-wrap">
          <div className="bold small mb">Fournisseurs</div>
          <table className="tbl">
            <thead>
              <tr>
                <th>Fournisseur</th>
                <th className="num">Montant</th>
                <th className="num">ETA révisées</th>
                <th className="num">Packs en retard</th>
                <th className="num">Réceptions avec écart</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((x) => (
                <tr key={x.s.id}>
                  <td>
                    <Link to={`/fournisseurs/${x.s.id}`} className="row" style={{ gap: 6 }}>
                      <SupplierLogo supplier={x.s} size={22} /> {x.s.shortName}
                    </Link>
                  </td>
                  <td className="num">{eur(x.amount)}</td>
                  <td className={`num ${x.revised ? 'red bold' : ''}`}>
                    {x.revised}/{x.cs}
                  </td>
                  <td className={`num ${x.lateP ? 'orange bold' : ''}`}>{x.lateP}</td>
                  <td className={`num ${x.gaps ? 'red bold' : ''}`}>{x.gaps}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
