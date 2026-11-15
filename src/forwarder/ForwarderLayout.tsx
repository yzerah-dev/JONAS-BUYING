import { useEffect } from 'react';
import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Anchor, Bell, CalendarCheck, ClipboardCheck, Ship, Warehouse, type LucideIcon } from 'lucide-react';
import { currentUser, useStore } from '../data/store';
import { isForwarder } from '../data/permissions';
import { Toaster } from '../components/ui';
import UserSwitcher from '../components/UserSwitcher';
import { I18nProvider } from '../i18n';
import '../i18n/i18n.css';
import { STAGES, STAGE_DEF, fwdActions, fwdStages, fwdTodo, type FwdStage } from './fwd';

const NAV_ICON: Record<FwdStage, LucideIcon> = { 'a-confirmer': ClipboardCheck, pret: CalendarCheck, 'en-mer': Ship, 'au-port': Anchor, livres: Warehouse };

/** Portail transitaire (Logfret, Kuehne + Nagel) : uniquement ses conteneurs bookés. */
export default function ForwarderLayout() {
  return (
    <I18nProvider defaultLang="fr">
      <ForwarderShell />
    </I18nProvider>
  );
}

function ForwarderShell() {
  const { state } = useStore();
  const user = currentUser(state);
  const { pathname } = useLocation();
  // Téléphone : le menu défile horizontalement, on garde l'onglet actif visible
  useEffect(() => {
    document.querySelector('.fwd-portal nav.sidebar a.active')?.scrollIntoView?.({ inline: 'center', block: 'nearest' });
  }, [pathname]);
  if (!isForwarder(user)) return <Navigate to="/" replace />;
  const todo = fwdTodo(state, user);
  const stages = fwdStages(state, user);
  const actions = fwdActions(state, user);
  return (
    <div className="app portal fwd-portal">
      <header className="topbar">
        <div className="logo">
          <span className="logo-mark">J</span> JONAS BUYING
        </div>
        <span className="portal-badge">Portail transitaire</span>
        <span className="bold">{user.forwarder}</span>
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
        {STAGES.map((st) => {
          const Icon = NAV_ICON[st];
          const n = stages[st].length;
          return (
            <NavLink key={st} to={`/transitaire/${st}`}>
              <Icon size={19} /> <span className="grow">{STAGE_DEF[st].title}</span>
              {actions[st] > 0 ? <span className="pill red">{actions[st]}</span> : n > 0 && st !== 'livres' ? <span className="pill grey">{n}</span> : null}
            </NavLink>
          );
        })}
        <div className="spacer" />
        <div className="xs muted" style={{ padding: '8px 12px' }}>
          Vous ne voyez que les conteneurs JONAS confiés à {user.forwarder}.
        </div>
      </nav>
      <main className="main">
        <Outlet />
      </main>
      <Toaster />
    </div>
  );
}
