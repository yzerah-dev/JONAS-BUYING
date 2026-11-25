import { Navigate } from 'react-router-dom';
import { currentUser, useAuth, useStore } from '../data/store';
import { homeOf } from '../data/permissions';

/** Page d'arrivée : portail pour un fournisseur ou un transitaire ; sinon Proformas si le rôle y a accès, sinon Performance. */
export default function Landing() {
  const { canSee } = useAuth();
  const { state } = useStore();
  const home = homeOf(currentUser(state));
  if (home !== '/') return <Navigate to={home} replace />;
  return <Navigate to={canSee('proformas') ? '/proformas' : '/performance'} replace />;
}
