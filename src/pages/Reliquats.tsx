import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { bookingStage, byId, openReliquats, proformaTotals, reliquatDelay, shipmentLabel, useAuth, useStore } from '../data/store';
import type { Proforma } from '../data/types';
import { ProductThumb, ProformaStatusPill, Seg, SupplierLogo } from '../components/ui';
import { dec, eur, fshort, num, weekLabel } from '../lib/format';

type Sort = 'retard' | 'date' | 'fournisseur';

const STAGE_TXT: Record<string, string> = {
  fournisseur: 'Booking demandé · attente fournisseur',
  transitaire: 'Booking demandé · attente transitaire',
  validation: 'Proposition de booking à valider',
  booke: 'Booké',
};

/** Suivi des reliquats : ce qui reste à expédier après une expédition partielle, et avec quel retard */
export default function Reliquats() {
  const { state } = useStore();
  const auth = useAuth();
  const showMoney = auth.can('finance.view');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('retard');

  const all = openReliquats(state);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return all
      .filter((pf) => {
        if (!s) return true;
        const sup = byId(state.suppliers, pf.supplierId);
        const refs = pf.lines.map((l) => byId(state.products, l.productId).ref).join(' ');
        return `${pf.id} ${pf.split?.root} ${sup.name} ${refs} ${pf.split?.reason ?? ''}`.toLowerCase().includes(s);
      })
      .sort((a, b) =>
        sort === 'retard'
          ? reliquatDelay(b) - reliquatDelay(a)
          : sort === 'date'
            ? a.etd.localeCompare(b.etd)
            : byId(state.suppliers, a.supplierId).name.localeCompare(byId(state.suppliers, b.supplierId).name),
      );
  }, [all, q, sort, state.suppliers, state.products]);

  const qty = (pf: Proforma) => pf.lines.reduce((s, l) => s + l.qty, 0);
  const totalQty = all.reduce((s, pf) => s + qty(pf), 0);
  const totalAmount = all.reduce((s, pf) => s + proformaTotals(state, pf).amount, 0);
  const avg = all.length ? all.reduce((s, pf) => s + reliquatDelay(pf), 0) / all.length : 0;
  const suppliers = new Set(all.map((pf) => pf.supplierId)).size;

  return (
    <>
      <div className="bk-kpis">
        <div className="kpi-box">
          <small>Reliquats ouverts</small>
          <b>{all.length}</b>
          <span>{suppliers} fournisseur(s)</span>
        </div>
        <div className="kpi-box">
          <small>Pièces en attente</small>
          <b>{num(totalQty)}</b>
          <span>{dec(all.reduce((s, pf) => s + proformaTotals(state, pf).cbm, 0), 1)} m³</span>
        </div>
        {showMoney && (
          <div className="kpi-box">
            <small>Montant en attente</small>
            <b>{eur(totalAmount)}</b>
            <span>au prorata des proformas</span>
          </div>
        )}
        <div className="kpi-box">
          <small>Retard moyen</small>
          <b className={avg > 14 ? 'red' : ''}>{all.length ? `${Math.round(avg)} j` : '—'}</b>
          <span>par rapport à la date initiale</span>
        </div>
      </div>

      <div className="pf-toolbar">
        <label className="pf-search">
          <Search size={20} />
          <input placeholder="Reliquat, proforma d’origine, fournisseur, référence, motif…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <Seg
          value={sort}
          onChange={setSort}
          options={[
            { id: 'retard', label: 'Retard' },
            { id: 'date', label: 'Date' },
            { id: 'fournisseur', label: 'Fournisseur' },
          ]}
        />
      </div>

      <div className="card bk-body rl-list">
        {list.length === 0 && <div className="empty small">{q ? 'Aucun résultat.' : 'Aucun reliquat en attente.'}</div>}
        {list.map((pf) => {
          const sup = byId(state.suppliers, pf.supplierId);
          const top = [...pf.lines].sort((a, b) => b.qty - a.qty)[0];
          const p = top ? byId(state.products, top.productId) : undefined;
          const delay = reliquatDelay(pf);
          const stage = bookingStage(pf);
          return (
            <div key={pf.id} className="bk-row rl-row">
              <div className="bk-ctn">
                {p && <ProductThumb product={p} size={44} />}
                <div>
                  <span className="bk-num">
                    <Link to={`/proformas/${pf.id}`}>
                      <strong>{pf.id}</strong>
                    </Link>
                    <span className="ct-type">{shipmentLabel(state, pf)}</span>
                  </span>
                  <small>
                    Reliquat de <Link to={`/proformas/${pf.split!.root}`}>{pf.split!.root}</Link> · {pf.title}
                  </small>
                </div>
              </div>
              <div className="bk-sup">
                <SupplierLogo supplier={sup} size={32} />
                <span>
                  <b>{sup.shortName}</b>
                  <small>
                    {sup.port} → Le Havre
                  </small>
                </span>
              </div>
              <div className="bk-who">
                <ProformaStatusPill status={pf.status} />
              </div>
              <div className="bk-info">
                <small>
                  {pf.lines.map((l) => `${byId(state.products, l.productId).ref} × ${num(l.qty)}`).join(' · ')}
                  {showMoney ? ` · ${eur(proformaTotals(state, pf).amount)}` : ''}
                </small>
                <b className={delay > 14 ? 'red' : delay > 0 ? 'orange' : ''}>
                  {pf.split?.etdInitial ? `${fshort(pf.split.etdInitial)} → ` : ''}
                  {fshort(pf.etd)} ({weekLabel(pf.etd)}) · {delay > 0 ? `retard ${delay} j` : 'à l’heure'}
                </b>
                {pf.split?.reason && <span className="muted">« {pf.split.reason} »</span>}
                <span>{stage ? STAGE_TXT[stage] : pf.status === 'en_transit' ? 'En mer' : 'Booking à demander'}</span>
              </div>
              <div className="bk-actions">
                <Link className="btn sm ghost" to={`/proformas/${pf.id}`}>
                  Voir
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
