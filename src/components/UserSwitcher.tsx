import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronDown, LogIn } from 'lucide-react';
import { currentUser, useStore } from '../data/store';
import { homeOf, ROLE_DEFS } from '../data/permissions';
import { initials } from '../lib/format';
import { useT } from '../i18n/context';

/** Changement d'utilisateur (démo) — remplacé par une vraie authentification plus tard. */
export default function UserSwitcher() {
  const { state, dispatch } = useStore();
  const me = currentUser(state);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { t } = useT(); // français hors portail

  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const team = state.users.filter((u) => !ROLE_DEFS[u.role].portal && u.active);
  const suppliers = state.users.filter((u) => u.role === 'fournisseur' && u.active);
  const forwarders = state.users.filter((u) => u.role === 'transitaire' && u.active);

  const login = (id: string) => {
    const u = state.users.find((x) => x.id === id)!;
    dispatch({ type: 'login', userId: id });
    setOpen(false);
    navigate(homeOf(u));
  };

  const Row = ({ id }: { id: string }) => {
    const u = state.users.find((x) => x.id === id)!;
    const sup = u.supplierId ? state.suppliers.find((s) => s.id === u.supplierId) : undefined;
    return (
      <div className="menu-row" onClick={() => login(u.id)}>
        <div className="avatar sm" style={sup ? { background: sup.color } : undefined}>
          {initials(u.name)}
        </div>
        <div className="grow">
          <div className="bold small">{u.name}</div>
          <div className="xs muted">{sup ? sup.name : u.forwarder ? u.title : `${t(`role.${u.role}`)} · ${u.title}`}</div>
        </div>
        {u.id === me.id && <Check size={15} className="green" />}
      </div>
    );
  };

  return (
    <div ref={ref} className="user-switch">
      <div className="user-btns">
        <button className="role-btn" onClick={() => setOpen(!open)} title={t('us.change', { name: me.name })}>
          {t(`role.${me.role}`)} <ChevronDown size={18} />
        </button>
        <button className="avatar avatar-lg" onClick={() => setOpen(!open)} title={me.name}>
          {initials(me.name === 'Yzerah' ? 'Y Z' : me.name)}
        </button>
      </div>
      {open && (
        <div className="card menu">
          <div className="menu-title">
            <LogIn size={13} /> {t('us.loginAs')}
          </div>
          <div className="menu-group">{t('us.team')}</div>
          {team.map((u) => (
            <Row key={u.id} id={u.id} />
          ))}
          <div className="menu-group">{t('us.portal')}</div>
          {suppliers.map((u) => (
            <Row key={u.id} id={u.id} />
          ))}
          <div className="menu-group">{t('us.forwarders')}</div>
          {forwarders.map((u) => (
            <Row key={u.id} id={u.id} />
          ))}
        </div>
      )}
    </div>
  );
}
