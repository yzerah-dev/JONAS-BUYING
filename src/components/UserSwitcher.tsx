import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, LogIn } from 'lucide-react';
import { currentUser, useStore } from '../data/store';
import { ROLE_DEFS } from '../data/permissions';
import { initials } from '../lib/format';

/** Changement d'utilisateur (démo) — remplacé par une vraie authentification plus tard. */
export default function UserSwitcher() {
  const { state, dispatch } = useStore();
  const me = currentUser(state);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const team = state.users.filter((u) => u.role !== 'fournisseur' && u.active);
  const suppliers = state.users.filter((u) => u.role === 'fournisseur' && u.active);

  const login = (id: string) => {
    const u = state.users.find((x) => x.id === id)!;
    dispatch({ type: 'login', userId: id });
    setOpen(false);
    navigate(u.role === 'fournisseur' ? '/portail' : '/');
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
          <div className="xs muted">{sup ? sup.name : `${ROLE_DEFS[u.role].label} · ${u.title}`}</div>
        </div>
        {u.id === me.id && <Check size={15} className="green" />}
      </div>
    );
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="user-btn" onClick={() => setOpen(!open)} title="Changer d’utilisateur">
        <div className="col" style={{ alignItems: 'flex-end', gap: 0 }}>
          <span className="bold small">{me.name}</span>
          <span className="xs muted">{ROLE_DEFS[me.role].label}</span>
        </div>
        <div className="avatar">{initials(me.name === 'Yzerah' ? 'Y Z' : me.name)}</div>
      </button>
      {open && (
        <div className="card menu">
          <div className="menu-title">
            <LogIn size={13} /> Se connecter en tant que (démo)
          </div>
          <div className="menu-group">Équipe JONAS</div>
          {team.map((u) => (
            <Row key={u.id} id={u.id} />
          ))}
          <div className="menu-group">Portail fournisseurs</div>
          {suppliers.map((u) => (
            <Row key={u.id} id={u.id} />
          ))}
        </div>
      )}
    </div>
  );
}
