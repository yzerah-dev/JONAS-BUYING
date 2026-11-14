import { Link } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { useAuth } from '../data/store';
import { ROLE_DEFS } from '../data/permissions';

export function Forbidden() {
  const { user } = useAuth();
  return (
    <div className="card empty" style={{ maxWidth: 520, margin: '60px auto' }}>
      <Lock size={34} className="muted" />
      <h2 className="mt" style={{ color: 'var(--ink)' }}>
        Accès non autorisé
      </h2>
      <p>
        Ce module n’est pas ouvert au rôle <b>{ROLE_DEFS[user.role].label}</b>.
      </p>
      <Link to="/" className="btn primary">
        Retour à mon espace
      </Link>
    </div>
  );
}
