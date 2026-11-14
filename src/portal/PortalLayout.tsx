import { useRef } from 'react';
import { Navigate, NavLink, Outlet } from 'react-router-dom';
import { Bell, Boxes, Container as Ctn, Euro, FileText, Home, Package, Truck } from 'lucide-react';
import { isSupplier } from '../data/permissions';
import { useTableLabels } from '../components/useTableLabels';
import { Toaster } from '../components/ui';
import UserSwitcher from '../components/UserSwitcher';
import { usePortal } from './usePortal';

export default function PortalLayout() {
  const { user, supplier, packsToValidate, dieCutsRequested, plansRequested, docsMissing } = usePortal();
  const mainRef = useRef<HTMLElement>(null);
  useTableLabels(mainRef);
  if (!isSupplier(user) || !supplier) return <Navigate to="/" replace />;
  const todo = packsToValidate.length + dieCutsRequested.length + plansRequested.length + docsMissing.length;

  const NAV = [
    { to: '/portail', label: 'Tableau de bord', icon: Home, end: true },
    { to: '/portail/produits', label: 'Mes produits', icon: Boxes },
    { to: '/portail/proformas', label: 'Mes proformas', icon: FileText },
    { to: '/portail/packs', label: 'Packs & die cuts', icon: Package, badge: packsToValidate.length + dieCutsRequested.length },
    { to: '/portail/chargement', label: 'Plans de chargement', icon: Truck, badge: plansRequested.length },
    { to: '/portail/conteneurs', label: 'Conteneurs & documents', icon: Ctn, badge: docsMissing.length },
    { to: '/portail/finance', label: 'Factures & paiements', icon: Euro },
  ];

  return (
    <div className="app portal">
      <header className="topbar">
        <div className="logo">
          <span className="logo-mark">J</span> JONAS BUYING
        </div>
        <span className="portal-badge">PORTAIL FOURNISSEUR</span>
        <span className="bold">{supplier.name}</span>
        <span className="muted small">
          {supplier.flag} {supplier.city}
        </span>
        <div className="grow" />
        <div className="top-actions">
          <span className="icon-btn" title={`${todo} action(s) en attente`}>
            <Bell size={22} />
            {todo > 0 && <span className="dot" />}
          </span>
          <UserSwitcher />
        </div>
      </header>
      <nav className="sidebar">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end}>
            <n.icon size={19} /> <span className="grow">{n.label}</span>
            {!!n.badge && <span className="pill red">{n.badge}</span>}
          </NavLink>
        ))}
        <div className="spacer" />
        <div className="xs muted" style={{ padding: '8px 12px' }}>
          Vous ne voyez que les données de {supplier.shortName}.
        </div>
      </nav>
      <main className="main" ref={mainRef}>
        <Outlet />
      </main>
      <Toaster />
    </div>
  );
}
