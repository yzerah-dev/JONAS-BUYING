import { useNavigate } from 'react-router-dom';
import { NewSupplierButton } from '../components/NewSupplier';
import { Check, Mail, User } from 'lucide-react';
import { supplierStats, useStore } from '../data/store';
import { Pill, SupplierLogo } from '../components/ui';
import { num } from '../lib/format';
import { curSumLabel } from '../lib/curr';

export default function Suppliers() {
  const { state } = useStore();
  const navigate = useNavigate();
  return (
    <>
      <div className="page-head">
        <h1>Fournisseurs</h1>
        <span className="pill green">{state.suppliers.length} fournisseurs</span>
        <div className="grow" />
        <NewSupplierButton onCreated={(id) => navigate(`/fournisseurs/${id}`)} />
      </div>
      <div className="gallery" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
        {state.suppliers.map((s) => {
          const st = supplierStats(state, s.id);
          return (
            <div key={s.id} className="pcard" onClick={() => navigate(`/fournisseurs/${s.id}`)}>
              <div className="row">
                <SupplierLogo supplier={s} size={54} />
                <div className="grow">
                  <div className="bold" style={{ fontSize: 16 }}>
                    {s.name}
                  </div>
                  <div className="small">
                    {s.flag} {s.country} – {s.city}
                  </div>
                </div>
                {s.active && (
                  <Pill color="green" icon={<Check size={12} />}>
                    Actif
                  </Pill>
                )}
              </div>
              <div className="small muted row" style={{ gap: 6 }}>
                <User size={13} /> {s.contact.name} · {s.contact.role}
              </div>
              <div className="small muted row" style={{ gap: 6 }}>
                <Mail size={13} /> {s.contact.email}
              </div>
              <div className="mini-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                <div>
                  <div className="l">Produits</div>
                  <div className="v">{st.prods.length}</div>
                </div>
                <div>
                  <div className="l">Proformas</div>
                  <div className="v">{st.pfs.length}</div>
                </div>
                <div>
                  <div className="l">Conteneurs</div>
                  <div className="v">{st.cs.length}</div>
                </div>
                <div>
                  <div className="l">CBM</div>
                  <div className="v">{num(st.cbm)}</div>
                </div>
              </div>
              <div className="row small">
                <span className="muted">Montant commandes</span>
                <div className="grow" />
                <b>{curSumLabel(st.amountCur)}</b>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
