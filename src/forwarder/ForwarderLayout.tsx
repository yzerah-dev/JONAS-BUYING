import { Navigate, NavLink, Outlet } from 'react-router-dom';
import { Bell, Container as Ctn } from 'lucide-react';
import { currentUser, useStore } from '../data/store';
import { isForwarder } from '../data/permissions';
import { Toaster } from '../components/ui';
import UserSwitcher from '../components/UserSwitcher';
import { I18nProvider } from '../i18n';
import '../i18n/i18n.css';
import { fwdTodo } from './fwd';

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
  if (!isForwarder(user)) return <Navigate to="/" replace />;
  const todo = fwdTodo(state, user);
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
        <NavLink to="/transitaire" end>
          <Ctn size={19} /> <span className="grow">Mes conteneurs</span>
          {todo > 0 && <span className="pill red">{todo}</span>}
        </NavLink>
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
