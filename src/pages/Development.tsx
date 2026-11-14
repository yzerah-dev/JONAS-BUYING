import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Calendar, Check } from 'lucide-react';
import { byId, useStore } from '../data/store';
import { DEV_STAGES } from '../data/types';
import { Pill, ProductThumb, Ring, Seg, toast } from '../components/ui';
import { TODAY, eur2, fdate, num } from '../lib/format';

export default function Development() {
  const { state, dispatch } = useStore();
  const navigate = useNavigate();
  const [view, setView] = useState<'todo' | 'done'>('todo');
  const [supplier, setSupplier] = useState('all');
  const list = state.products.filter((p) => supplier === 'all' || p.supplierId === supplier);
  const todo = list.filter((p) => !p.developed);
  const done = list.filter((p) => p.developed);

  return (
    <>
      <div className="page-head">
        <h1>Développement produit</h1>
        <div className="grow" />
        <select className="input" value={supplier} onChange={(e) => setSupplier(e.target.value)}>
          <option value="all">Tous les fournisseurs</option>
          {state.suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid2 mb">
        <div className={`card pad row gap-lg ${view === 'done' ? '' : ''}`} style={{ cursor: 'pointer', borderColor: view === 'done' ? 'var(--green)' : undefined }} onClick={() => setView('done')}>
          <div className="grow">
            <div className="bold" style={{ fontSize: 16 }}>
              Produits développés
            </div>
            <div style={{ fontSize: 30, fontWeight: 800 }}>{done.length}</div>
          </div>
          <Ring value={list.length ? done.length / list.length : 0} size={74} stroke={8} />
        </div>
        <div className="card pad row gap-lg" style={{ cursor: 'pointer', borderColor: view === 'todo' ? 'var(--green)' : undefined }} onClick={() => setView('todo')}>
          <div className="grow">
            <div className="bold" style={{ fontSize: 16 }}>
              Produits à développer
            </div>
            <div style={{ fontSize: 30, fontWeight: 800 }}>{todo.length}</div>
          </div>
          <Ring value={list.length ? todo.length / list.length : 0} size={74} stroke={8} />
        </div>
      </div>
      <div className="mb">
        <Seg
          value={view}
          onChange={setView}
          options={[
            { id: 'todo', label: `À développer (${todo.length})` },
            { id: 'done', label: `Développés (${done.length})` },
          ]}
        />
      </div>

      {view === 'todo' ? (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${DEV_STAGES.length - 1}, minmax(190px, 1fr))`, gap: 12, overflowX: 'auto' }}>
          {DEV_STAGES.slice(0, -1).map((stage, i) => {
            const items = todo.filter((p) => p.devStage === i);
            return (
              <div key={stage} className="col" style={{ gap: 10 }}>
                <div className="row bold">
                  <span className="ctag">{i + 1}</span> {stage}
                  <span className="grow" />
                  <span className="muted">{items.length}</span>
                </div>
                {items.map((p) => (
                  <div key={p.id} className="card pad col" style={{ gap: 8, cursor: 'pointer' }} onClick={() => navigate(`/produits/${p.id}`)}>
                    <div className="row">
                      <ProductThumb product={p} size={42} />
                      <div>
                        <span className="ref-tag">{p.ref}</span>
                        <div className="small bold">{p.name}</div>
                      </div>
                    </div>
                    <div className="xs muted">{byId(state.suppliers, p.supplierId).shortName}</div>
                    <div className="row small">
                      <span>PA {eur2(p.pa)}</span>
                      <span>PCB {p.pcb}</span>
                      <span>Cible {num(p.targetQty)}</span>
                    </div>
                    <div className="row small">
                      <Calendar size={13} />
                      <span className={p.devDeadline < TODAY ? 'red bold' : ''}>{fdate(p.devDeadline)}</span>
                    </div>
                    <Pill color="violet">→ {p.nextAction}</Pill>
                    <button
                      className="btn sm soft"
                      onClick={(e) => {
                        e.stopPropagation();
                        dispatch({ type: 'advanceDev', productId: p.id });
                        toast(`${p.ref} → ${DEV_STAGES[p.devStage + 1]}`);
                      }}
                    >
                      Étape suivante <ArrowRight size={13} />
                    </button>
                  </div>
                ))}
                {items.length === 0 && <div className="card empty small">—</div>}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Référence</th>
                <th>Désignation</th>
                <th>Fournisseur</th>
                <th className="num">PA</th>
                <th className="num">PCB</th>
                <th>Étape</th>
                <th>Prochaine action</th>
              </tr>
            </thead>
            <tbody>
              {done.map((p) => (
                <tr key={p.id} className="clickable" onClick={() => navigate(`/produits/${p.id}`)}>
                  <td>
                    <div className="row">
                      <ProductThumb product={p} size={34} />
                      <span className="bold">{p.ref}</span>
                    </div>
                  </td>
                  <td>{p.name}</td>
                  <td>{byId(state.suppliers, p.supplierId).shortName}</td>
                  <td className="num">{eur2(p.pa)}</td>
                  <td className="num">{p.pcb}</td>
                  <td>
                    <Pill color="green" icon={<Check size={12} />}>
                      Référencé
                    </Pill>
                  </td>
                  <td className="muted">{p.nextAction}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
