import { useEffect, useRef, useState } from 'react';
import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import { BarChart3, CalendarCheck, Box, Boxes, Euro, History, Layers, ListChecks, Search, Settings, Truck } from 'lucide-react';
import NotificationBell from './NotificationBell';
import SearchPalette from './SearchPalette';
import { currentUser, useStore } from '../data/store';
import { canSee, isSupplier, type Module } from '../data/permissions';
import { useTableLabels } from './useTableLabels';
import { ContainerGlyph, Toaster } from './ui';
import UserSwitcher from './UserSwitcher';
import { Forbidden } from './Guard';
import Assistant from './Assistant';
import AutoFrench from './AutoFrench';
import MailOutbox from './MailOutbox';

// Menu principal (maquette) puis modules complémentaires
const NAV: { to: string; label: string; icon: typeof Layers; module: Module }[] = [
  { to: '/proformas', label: 'Proformas', icon: Layers, module: 'proformas' },
  // Développement et packs : une seule page
  { to: '/design', label: 'Développement', icon: Box, module: 'design' },
  { to: '/conteneurs', label: 'Conteneurs', icon: ContainerGlyph as unknown as typeof Layers, module: 'conteneurs' },
  { to: '/booking', label: 'Booking', icon: CalendarCheck, module: 'booking' },
  { to: '/performance', label: 'Performance', icon: BarChart3, module: 'home' },
];
const NAV_MORE: typeof NAV = [
  { to: '/produits', label: 'Total – Produits', icon: Boxes, module: 'produits' },
  { to: '/listes', label: 'Listes produit', icon: ListChecks, module: 'produits' },
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
    listes: 'produits',
    developpement: 'design',
    design: 'design',
    conteneurs: 'conteneurs',
    fournisseurs: 'fournisseurs',
    finance: 'finance',
    parametres: 'parametres',
    journal: 'journal',
    booking: 'booking',
  };
  return map[seg] ?? 'home';
}

export default function Layout() {
  const { state } = useStore();
  const user = currentUser(state);
  const mainRef = useRef<HTMLElement>(null);
  useTableLabels(mainRef);
  const location = useLocation();
  const [searchOpen, setSearchOpen] = useState(false);
  // Recherche globale : Ctrl/Cmd + K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Les comptes fournisseurs n'accèdent qu'au portail
  if (isSupplier(user)) return <Navigate to="/portail" replace />;
  if (user.role === 'transitaire') return <Navigate to="/transitaire" replace />;
  const allowedHere = canSee(user, moduleOf(location.pathname));

  return (
    <div className="app">
      <header className="topbar">
        <NavLink to="/proformas" className="logo">
          <span className="logo-mark">J</span> JONAS BUYING
        </NavLink>
        <div className="grow" />
        <div className="top-actions">
          <NotificationBell key={user.id} />
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
        <button className="nav-search" onClick={() => setSearchOpen(true)}>
          <Search size={20} strokeWidth={1.8} /> Rechercher <kbd>Ctrl K</kbd>
        </button>
        {canSee(user, 'journal') && (
          <NavLink to="/journal" className="nav-more">
            <History size={20} strokeWidth={1.8} /> Journal
          </NavLink>
        )}
        <NavLink to="/parametres">
          <Settings size={22} strokeWidth={1.8} /> Paramètres
        </NavLink>
      </nav>
      <main className="main" ref={mainRef}>
        {allowedHere ? <Outlet /> : <Forbidden />}
        <AutoFrench />
      </main>
      <Assistant />
      <Toaster />
      <MailOutbox />
      {searchOpen && <SearchPalette onClose={() => setSearchOpen(false)} />}
    </div>
  );
}
