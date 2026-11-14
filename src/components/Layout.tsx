import { useRef } from 'react';
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { BarChart3, Bell, Box, Boxes, Euro, Layers, Palette, Settings, Truck } from 'lucide-react';
import { currentUser, packLate, useStore } from '../data/store';
import { canSee, isSupplier, type Module } from '../data/permissions';
import { useTableLabels } from './useTableLabels';
import { ContainerGlyph, Toaster } from './ui';
import UserSwitcher from './UserSwitcher';
import { Forbidden } from './Guard';

// Menu principal (maquette) puis modules complémentaires
const NAV: { to: string; label: string; icon: typeof Layers; module: Module }[] = [
  { to: '/proformas', label: 'Proformas', icon: Layers, module: 'proformas' },
  { to: '/developpement', label: 'Développement', icon: Box, module: 'developpement' },
  { to: '/conteneurs', label: 'Conteneurs', icon: ContainerGlyph as unknown as typeof Layers, module: 'conteneurs' },
  { to: '/performance', label: 'Performance', icon: BarChart3, module: 'home' },
];
const NAV_MORE: typeof NAV = [
  { to: '/produits', label: 'Total – Produits', icon: Boxes, module: 'produits' },
  { to: '/design', label: 'Design', icon: Palette, module: 'design' },
  { to: '/fournisseurs', label: 'Fournisseurs', icon: Truck, module: 'fournisseurs' },
  { to: '/finance', label: 'Factures & Finance', icon: Euro, module: 'finance' },
];

/** Module correspondant à une URL interne */
function moduleOf(path: string): Module {
  const seg = path.split('/')[1] ?? '';
  const map: Record<string, Module> = {
    '': 'home',
    performance: 'home',
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
  const mainRef = useRef<HTMLElement>(null);
  useTableLabels(mainRef);
  const navigate = useNavigate();
  const location = useLocation();
  const alerts = state.products.filter(packLate).length + state.proformas.filter((p) => p.status === 'a_signer').length;

  // Les comptes fournisseurs n'accèdent qu'au portail
  if (isSupplier(user)) return <Navigate to="/portail" replace />;
  const allowedHere = canSee(user, moduleOf(location.pathname));

  return (
    <div className="app">
      <header className="topbar">
        <NavLink to="/proformas" className="logo">
          <span className="logo-mark">J</span> JONAS BUYING
        </NavLink>
        <div className="grow" />
        <div className="top-actions">
          <button className="icon-btn" title={`${alerts} alertes`} onClick={() => navigate('/performance')}>
            <Bell size={26} />
            {alerts > 0 && <span className="dot" />}
          </button>
          <UserSwitcher />
        </div>
      </header>
      <nav className="sidebar">
        {NAV.filter((n) => canSee(user, n.module)).map((n) => (
          <NavLink key={n.to} to={n.to}>
            <n.icon size={22} strokeWidth={1.8} /> {n.label}
          </NavLink>
        ))}
        {NAV_MORE.some((n) => canSee(user, n.module)) && <div className="nav-sep" />}
        {NAV_MORE.filter((n) => canSee(user, n.module)).map((n) => (
          <NavLink key={n.to} to={n.to} className="nav-more">
            <n.icon size={20} strokeWidth={1.8} /> {n.label}
          </NavLink>
        ))}
        <div className="spacer" />
        <NavLink to="/parametres">
          <Settings size={22} strokeWidth={1.8} /> Paramètres
        </NavLink>
      </nav>
      <main className="main" ref={mainRef}>
        {allowedHere ? <Outlet /> : <Forbidden />}
      </main>
      <Toaster />
    </div>
  );
}
