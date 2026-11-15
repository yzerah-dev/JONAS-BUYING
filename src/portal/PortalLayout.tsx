import { useEffect, useRef } from 'react';
import { Navigate, NavLink, Outlet } from 'react-router-dom';
import { Bell, Boxes, CalendarCheck, Container as Ctn, Euro, FileText, Home, Package, Truck } from 'lucide-react';
import { isSupplier } from '../data/permissions';
import { useTableLabels } from '../components/useTableLabels';
import { Toaster } from '../components/ui';
import UserSwitcher from '../components/UserSwitcher';
import { I18nProvider, LangToggle, useT } from '../i18n';
import '../i18n/i18n.css';
import { usePortal } from './usePortal';

/** Le portail fournisseur est bilingue (anglais par défaut) ; le reste de l'application reste en français. */
export default function PortalLayout() {
  return (
    <I18nProvider defaultLang="en">
      <PortalShell />
    </I18nProvider>
  );
}

function PortalShell() {
  const { user, supplier, packsToValidate, dieCutsRequested, bookingsToDo, bookingsToAccept, docsMissing } = usePortal();
  const { t, td, lang } = useT();
  const mainRef = useRef<HTMLElement>(null);
  useTableLabels(mainRef);
  // Les libellés de colonnes (data-label, vue téléphone) sont recalculés sur mutation du DOM :
  // un changement de langue ne modifie que des nœuds texte, on provoque donc une mutation.
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const n = document.createComment('');
    el.appendChild(n);
    n.remove();
  }, [lang]);
  if (!isSupplier(user) || !supplier) return <Navigate to="/" replace />;
  const todo = packsToValidate.length + dieCutsRequested.length + bookingsToDo.length + bookingsToAccept.length + docsMissing.length;

  const NAV = [
    { to: '/portail', label: t('nav.home'), icon: Home, end: true },
    { to: '/portail/produits', label: t('nav.products'), icon: Boxes },
    { to: '/portail/proformas', label: t('nav.proformas'), icon: FileText },
    { to: '/portail/packs', label: t('nav.packs'), icon: Package, badge: packsToValidate.length + dieCutsRequested.length },
    { to: '/portail/booking', label: t('nav.booking'), icon: CalendarCheck, badge: bookingsToDo.length + bookingsToAccept.length },
    { to: '/portail/chargement', label: t('nav.loading'), icon: Truck },
    { to: '/portail/conteneurs', label: t('nav.containers'), icon: Ctn, badge: docsMissing.length },
    { to: '/portail/finance', label: t('nav.finance'), icon: Euro },
  ];

  return (
    <div className="app portal">
      <header className="topbar">
        <div className="logo">
          <span className="logo-mark">J</span> JONAS BUYING
        </div>
        <span className="portal-badge">{t('layout.badge')}</span>
        <span className="bold">{supplier.name}</span>
        <span className="muted small">
          {supplier.flag} {td(supplier.city)}
        </span>
        <div className="grow" />
        <div className="top-actions">
          <LangToggle />
          <span className="icon-btn" title={t('layout.pending', { n: todo })}>
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
          {t('layout.scope', { name: supplier.shortName })}
        </div>
      </nav>
      <main className="main" ref={mainRef}>
        <Outlet />
      </main>
      <Toaster />
    </div>
  );
}
