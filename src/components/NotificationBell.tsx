import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Bell, Check, Info } from 'lucide-react';
import { currentUser, useStore } from '../data/store';
import { notificationsFor } from '../data/notifications';

/** Identifiants lus, par utilisateur, mémorisés dans ce navigateur */
const seenKey = (userId: string) => `jonas-buying-seen-${userId}`;
function readSeen(userId: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(seenKey(userId)) ?? '[]');
  } catch {
    return [];
  }
}

export default function NotificationBell() {
  const { state } = useStore();
  const me = currentUser(state);
  const navigate = useNavigate();
  const notices = useMemo(() => notificationsFor(state), [state]);
  const [seen, setSeen] = useState<string[]>(() => readSeen(me.id));
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const unread = notices.filter((n) => !seen.includes(n.id));
  const markAll = () => {
    const ids = notices.map((n) => n.id);
    setSeen(ids);
    try {
      localStorage.setItem(seenKey(me.id), JSON.stringify(ids));
    } catch {
      /* stockage indisponible */
    }
  };

  return (
    <div ref={ref} className="notif">
      <button className="icon-btn" title={`${unread.length} notification(s) non lue(s)`} aria-label="Notifications" onClick={() => setOpen(!open)}>
        <Bell size={26} />
        {unread.length > 0 && <span className="notif-count">{unread.length > 9 ? '9+' : unread.length}</span>}
      </button>
      {open && (
        <div className="card notif-menu" role="dialog" aria-label="Notifications">
          <div className="notif-head">
            <b>Notifications</b>
            {unread.length > 0 && (
              <button className="btn sm ghost" onClick={markAll}>
                <Check size={14} /> Tout marquer comme lu
              </button>
            )}
          </div>
          {notices.length === 0 && <div className="empty small">Rien à signaler 👍</div>}
          {notices.map((n) => (
            <button
              key={n.id}
              className={`notif-row ${seen.includes(n.id) ? 'read' : ''}`}
              onClick={() => {
                setOpen(false);
                navigate(n.to);
              }}
            >
              <span className={`notif-ico ${n.level}`}>{n.level === 'info' ? <Info size={15} /> : <AlertTriangle size={15} />}</span>
              <span className="notif-text">
                <b>{n.title}</b>
                {n.detail && <small>{n.detail}</small>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
