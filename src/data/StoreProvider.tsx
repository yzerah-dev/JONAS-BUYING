import { useEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import { STORAGE_KEY, StoreContext, load, reducer, type Action, type State } from './store';
import { applyRemoteChange, diffState, fromDocs, remoteEnabled, type Collection } from './remote';
import { currentMember, loadDocs, pushDocs, subscribeDocs, supabase } from './supabaseSync';
import { authMessage, cleanAuthUrl, LINK_FAILED, readAuthReturn } from '../lib/authReturn';

// Lu au chargement, avant que le client Supabase n'échange le code et ne nettoie l'adresse
const authReturn = readAuthReturn(typeof location === 'undefined' ? '' : location.href);

/**
 * Fournit l'état de l'application.
 * Mode démo (par défaut) : sauvegardé dans le navigateur.
 * Mode partagé (Supabase configuré) : comptes réels, base commune, modifications en temps réel.
 */
export function StoreProvider({ children }: { children: ReactNode }) {
  return remoteEnabled() ? <RemoteStoreProvider>{children}</RemoteStoreProvider> : <LocalStoreProvider>{children}</LocalStoreProvider>;
}

function LocalStoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, load);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* stockage indisponible : l'application reste utilisable */
    }
  }, [state]);
  return <StoreContext.Provider value={{ state, dispatch }}>{children}</StoreContext.Provider>;
}

// ---------------------------------------------------------------------------
// Mode partagé

type Internal = Action | { type: '__replace'; state: State } | { type: '__remote'; change: { collection: Collection; id: string; data: unknown | null } };

/** États produits par la base (chargement, temps réel) : à ne pas renvoyer au serveur */
const fromServer = new WeakSet<State>();

function remoteReducer(s: State, a: Internal): State {
  if (a.type === '__replace') {
    fromServer.add(a.state);
    return a.state;
  }
  if (a.type === '__remote') {
    const next = applyRemoteChange(s, a.change);
    fromServer.add(next);
    return next;
  }
  // En base partagée : pas de remise à zéro ni de changement d'utilisateur (vraie connexion)
  if (a.type === 'reset' || a.type === 'login') return s;
  return reducer(s, a);
}

function RemoteStoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(remoteReducer, undefined, load);
  const [phase, setPhase] = useState<'checking' | 'auth' | 'loading' | 'ready' | 'nomember' | 'error'>('checking');
  const [error, setError] = useState('');
  const synced = useRef<State | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());

  // Connexion puis chargement de la base visible par cet utilisateur
  const started = useRef(false);
  const start = async () => {
    // getSession et l'événement SIGNED_IN arrivent tous deux au retour du lien : un seul chargement
    if (started.current) return;
    started.current = true;
    setError('');
    setPhase('loading');
    try {
      const member = await currentMember();
      if (!member) return setPhase('nomember');
      const docs = await loadDocs();
      const base = load();
      const next = { ...fromDocs(docs, base), currentUserId: member.app_user_id };
      synced.current = next;
      dispatch({ type: '__replace', state: next });
      setPhase('ready');
    } catch (e) {
      started.current = false; // nouvelle tentative possible
      setError((e as Error).message);
      setPhase('error');
    }
  };
  useEffect(() => {
    // getSession attend la fin de l'échange du code (?code=…) par le client
    supabase()
      .auth.getSession()
      .then(({ data }) => {
        if (authReturn.hadCode || authReturn.error) history.replaceState(history.state, '', cleanAuthUrl(location.href));
        if (data.session) return start();
        if (authReturn.hadCode || authReturn.error) setError(LINK_FAILED);
        setPhase('auth');
      });
    const { data: sub } = supabase().auth.onAuthStateChange((ev) => {
      if (ev === 'SIGNED_IN') start();
      if (ev === 'SIGNED_OUT') {
        started.current = false;
        setPhase('auth');
      }
    });
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Temps réel : modifications des autres utilisateurs
  useEffect(() => {
    if (phase !== 'ready') return;
    return subscribeDocs((change) => dispatch({ type: '__remote', change }));
  }, [phase]);

  // Après chaque action locale : on envoie seulement ce qui a changé, dans l'ordre
  useEffect(() => {
    if (phase !== 'ready' || !synced.current) return;
    if (fromServer.has(state)) {
      synced.current = state;
      return;
    }
    const { upserts, deletes } = diffState(synced.current, state);
    synced.current = state;
    if (!upserts.length && !deletes.length) return;
    queue.current = queue.current.then(() => pushDocs(upserts, deletes)).catch((e) => setError(`Enregistrement refusé : ${(e as Error).message}`));
  }, [state, phase]);

  if (phase !== 'ready') return <AuthScreen phase={phase} error={error} />;
  return (
    <StoreContext.Provider value={{ state, dispatch: dispatch as (a: Action) => void }}>
      {error && (
        <div className="sync-error" role="alert">
          {error} <button onClick={() => setError('')}>×</button>
        </div>
      )}
      {children}
    </StoreContext.Provider>
  );
}

/** Écran de connexion (e-mail + mot de passe, ou lien de connexion par e-mail) */
function AuthScreen({ phase, error }: { phase: string; error: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg('');
    const { error: err } = password
      ? await supabase().auth.signInWithPassword({ email, password })
      : await supabase().auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: location.origin + '/' } });
    setMsg(
      err
        ? authMessage(err, !!password)
        : password
          ? ''
          : 'Lien de connexion envoyé : ouvrez votre e-mail, dans ce même navigateur.',
    );
  };
  return (
    <div className="auth-screen">
      <form className="card pad auth-card" onSubmit={signIn}>
        <div className="logo">
          <span className="logo-mark">J</span> JONAS BUYING
        </div>
        {phase === 'checking' || phase === 'loading' ? (
          <p className="muted">Chargement…</p>
        ) : phase === 'nomember' ? (
          <>
            <p>Ce compte n’est rattaché à aucun utilisateur JONAS BUYING. Demandez l’accès au Pilote.</p>
            <button type="button" className="btn" onClick={() => supabase().auth.signOut()}>
              Se déconnecter
            </button>
          </>
        ) : (
          <>
            {phase === 'error' && <p className="red small">Base inaccessible : {error}</p>}
            {phase === 'auth' && error && !msg && <p className="red small">{error}</p>}
            <label htmlFor="auth-email">
              E-mail
              <input id="auth-email" className="input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label htmlFor="auth-pw">
              Mot de passe <span className="muted small">(vide : lien de connexion par e-mail)</span>
              <input id="auth-pw" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            <button type="submit" className="btn primary">
              Se connecter
            </button>
            {msg && <p className="small">{msg}</p>}
          </>
        )}
      </form>
    </div>
  );
}
