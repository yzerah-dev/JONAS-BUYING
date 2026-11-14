import { useMemo, useRef, useState } from 'react';
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
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
import { currentUser, packLate, useStore } from '../data/store';
import { canSee, isSupplier, type Module } from '../data/permissions';
import { useTableLabels } from './useTableLabels';
import { Toaster } from './ui';
import UserSwitcher from './UserSwitcher';
import { Forbidden } from './Guard';

const NAV: { to: string; label: string; icon: typeof Home; module: Module; end?: boolean }[] = [
  { to: '/', label: 'Mon espace', icon: Home, module: 'home', end: true },
  { to: '/proformas', label: 'Proformas', icon: FileText, module: 'proformas' },
  { to: '/produits', label: 'Total – Produits', icon: Boxes, module: 'produits' },
  { to: '/developpement', label: 'Développement', icon: FlaskConical, module: 'developpement' },
  { to: '/design', label: 'Design', icon: Palette, module: 'design' },
  { to: '/conteneurs', label: 'Conteneurs', icon: ContainerIcon, module: 'conteneurs' },
  { to: '/fournisseurs', label: 'Fournisseurs', icon: Truck, module: 'fournisseurs' },
  { to: '/finance', label: 'Factures & Finance', icon: Euro, module: 'finance' },
];

/** Module correspondant à une URL interne */
function moduleOf(path: string): Module {
  const seg = path.split('/')[1] ?? '';
  const map: Record<string, Module> = {
    '': 'home',
    proformas: 'proformas',
    produits: 'produits',
    developpement: 'developpement',
    design: 'design',
    conteneurs: 'conteneurs',
    fournisseurs: 'fournisseurs',
    finance: 'finance',
    parametres: 'parametres',
  };
  return map[seg] ?? 'home';
}

export default function Layout() {
  const { state } = useStore();
  const user = currentUser(state);
  const [q, setQ] = useState('');
  const mainRef = useRef<HTMLElement>(null);
  useTableLabels(mainRef);
  const navigate = useNavigate();
  const location = useLocation();
  const alerts = state.products.filter(packLate).length + state.proformas.filter((p) => p.status === 'a_signer').length;

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 2) return [];
    const out: { label: string; sub: string; to: string; module: Module }[] = [];
    for (const p of state.products)
      if (`${p.ref} ${p.name} ${p.ean}`.toLowerCase().includes(s)) out.push({ label: `${p.ref} – ${p.name}`, sub: 'Produit', to: `/produits/${p.id}`, module: 'produits' });
    for (const p of state.proformas)
      if (`${p.id} ${p.poNumber}`.toLowerCase().includes(s)) out.push({ label: p.id, sub: `Proforma · ${p.poNumber}`, to: `/proformas/${p.id}`, module: 'proformas' });
    for (const sup of state.suppliers)
      if (sup.name.toLowerCase().includes(s)) out.push({ label: sup.name, sub: 'Fournisseur', to: `/fournisseurs/${sup.id}`, module: 'fournisseurs' });
    for (const c of state.containers)
      if (`${c.id} ${c.number ?? ''} ${c.bookingNo ?? ''}`.toLowerCase().includes(s))
        out.push({ label: c.number ?? c.id, sub: `Conteneur · ${c.bookingNo ?? c.id}`, to: `/conteneurs?c=${c.id}`, module: 'conteneurs' });
    return out.filter((r) => canSee(user, r.module)).slice(0, 8);
  }, [q, state, user]);

  // Les comptes fournisseurs n'accèdent qu'au portail
  if (isSupplier(user)) return <Navigate to="/portail" replace />;
  const allowedHere = canSee(user, moduleOf(location.pathname));

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
          <button className="icon-btn" title={`${alerts} alertes`} onClick={() => navigate('/')}>
            <Bell size={22} />
            {alerts > 0 && <span className="dot" />}
          </button>
          <UserSwitcher />
        </div>
      </header>
      <nav className="sidebar">
        {NAV.filter((n) => canSee(user, n.module)).map((n) => (
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
      <main className="main" ref={mainRef}>
        {allowedHere ? <Outlet /> : <Forbidden />}
      </main>
      <Toaster />
    </div>
  );
}
