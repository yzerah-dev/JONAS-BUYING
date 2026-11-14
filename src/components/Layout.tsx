import { useMemo, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Bell,
  Boxes,
  Container as ContainerIcon,
  Euro,
  FileText,
  FlaskConical,
  Home,
  Layers,
  Palette,
  Search,
  Settings,
  Truck,
} from 'lucide-react';
import { ROLES, packLate, useStore, type Role } from '../data/store';
import { Toaster } from './ui';
import { initials } from '../lib/format';

const NAV = [
  { to: '/', label: 'Mon espace', icon: Home, end: true },
  { to: '/proformas', label: 'Proformas', icon: FileText },
  { to: '/produits', label: 'Total – Produits', icon: Boxes },
  { to: '/developpement', label: 'Développement', icon: FlaskConical },
  { to: '/design', label: 'Design', icon: Palette },
  { to: '/conteneurs', label: 'Conteneurs', icon: ContainerIcon },
  { to: '/fournisseurs', label: 'Fournisseurs', icon: Truck },
  { to: '/finance', label: 'Factures & Finance', icon: Euro },
];

export default function Layout() {
  const { state, dispatch } = useStore();
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  const alerts = state.products.filter(packLate).length + state.proformas.filter((p) => p.status === 'a_signer').length;

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 2) return [];
    const out: { label: string; sub: string; to: string }[] = [];
    for (const p of state.products)
      if (`${p.ref} ${p.name} ${p.ean}`.toLowerCase().includes(s)) out.push({ label: `${p.ref} – ${p.name}`, sub: 'Produit', to: `/produits/${p.id}` });
    for (const p of state.proformas)
      if (`${p.id} ${p.poNumber}`.toLowerCase().includes(s)) out.push({ label: p.id, sub: `Proforma · ${p.poNumber}`, to: `/proformas/${p.id}` });
    for (const sup of state.suppliers)
      if (sup.name.toLowerCase().includes(s)) out.push({ label: sup.name, sub: 'Fournisseur', to: `/fournisseurs/${sup.id}` });
    for (const c of state.containers)
      if (`${c.id} ${c.number ?? ''} ${c.bookingNo ?? ''}`.toLowerCase().includes(s))
        out.push({ label: c.number ?? c.id, sub: `Conteneur · ${c.bookingNo ?? c.id}`, to: `/conteneurs?c=${c.id}` });
    return out.slice(0, 8);
  }, [q, state]);

  return (
    <div className="app">
      <header className="topbar">
        <NavLink to="/" className="logo">
          <span className="logo-mark">J</span> JONAS BUYING
        </NavLink>
        <div className="grow" style={{ position: 'relative', maxWidth: 520 }}>
          <div className="search">
            <Search size={16} className="muted" />
            <input placeholder="Rechercher une référence, proforma, fournisseur, conteneur…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {results.length > 0 && (
            <div className="card" style={{ position: 'absolute', top: 44, left: 0, right: 0, zIndex: 30, padding: 6 }}>
              {results.map((r) => (
                <div
                  key={r.to + r.label}
                  className="row"
                  style={{ padding: '8px 10px', borderRadius: 8, cursor: 'pointer' }}
                  onMouseDown={() => {
                    navigate(r.to);
                    setQ('');
                  }}
                >
                  <span className="bold">{r.label}</span>
                  <span className="grow" />
                  <span className="muted small">{r.sub}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="grow" />
        <div className="top-actions">
          <select className="role-select" value={state.role} onChange={(e) => dispatch({ type: 'setRole', role: e.target.value as Role })} title="Rôle">
            {ROLES.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
          <button className="icon-btn" title={`${alerts} alertes`} onClick={() => navigate('/')}>
            <Bell size={22} />
            {alerts > 0 && <span className="dot" />}
          </button>
          <div className="avatar">{initials(state.user === 'Yzerah' ? 'Y Z' : state.user)}</div>
        </div>
      </header>
      <nav className="sidebar">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end}>
            <n.icon size={19} /> {n.label}
          </NavLink>
        ))}
        <div className="spacer" />
        <NavLink to="/parametres">
          <Settings size={19} /> Paramètres
        </NavLink>
        <div className="xs muted" style={{ padding: '8px 12px' }}>
          <Layers size={11} /> Données de démonstration
        </div>
      </nav>
      <main className="main">
        <Outlet />
      </main>
      <Toaster />
    </div>
  );
}
