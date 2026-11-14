import { Navigate } from 'react-router-dom';
import { useAuth } from '../data/store';

/** Page d'arrivée : Proformas si le rôle y a accès, sinon Performance. */
export default function Landing() {
  const { canSee } = useAuth();
  return <Navigate to={canSee('proformas') ? '/proformas' : '/performance'} replace />;
}
