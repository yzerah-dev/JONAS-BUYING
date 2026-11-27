import { useCallback, useEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import { STORAGE_KEY, StoreContext, load, reducer, type Action, type State } from './store';
import { processMailEvents } from '../lib/mail/outbox';
import { applyRemoteChange, diffState, fromDocs, remoteEnabled, type Collection } from './remote';
import { currentMember, loadDocs, pushDocs, subscribeDocs, supabase } from './supabaseSync';
import { authMessage, cleanAuthUrl, LINK_FAILED, readAuthReturn } from '../lib/authReturn';

// Lu au chargement, avant que le client Supabase n'échange le code et ne nettoie l'adresse
const authReturn = readAuthReturn(typeof location === 'undefined' ? '' : location.href);
/** Demande « mot de passe oublié » faite depuis ce navigateur : au retour du lien, choisir un nouveau mot de passe */
const RESET_KEY = 'jonas-buying-reset';
const resetPending = () => {
  try {
    return !!localStorage.getItem(RESET_KEY);
  } catch {
    return false;
  }
};
const clearReset = () => {
  try {
    localStorage.removeItem(RESET_KEY);
  } catch {
    /* rien */
  }
};

/**
 * Fournit l'état de l'application.
 * Mode démo (par défaut) : sauvegardé dans le navigateur.
 * Mode partagé (Supabase configuré) : comptes réels, base commune, modifications en temps réel.
 */
export function StoreProvider({ children }: { children: ReactNode }) {
  return remoteEnabled() ? <RemoteStoreProvider>{children}</RemoteStoreProvider> : <LocalStoreProvider>{children}</LocalStoreProvider>;
}

function LocalStoreProvider({ children }: { children: ReactNode }) {
  const [state, rawDispatch] = useReducer(reducer, undefined, load);
  // E-mails fournisseurs (démo : préparés, non envoyés) ; pas pour un changement d'utilisateur ou une remise à zéro
  const prev = useRef(state);
  const skip = useRef(false);
  const dispatch = useCallback((a: Action) => {
    if (a.type === 'reset' || a.type === 'login') skip.current = true;
    rawDispatch(a);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* stockage indisponible : l'application reste utilisable */
    }
    if (prev.current !== state && !skip.current) processMailEvents(prev.current, state, { remote: false, log: (m) => rawDispatch({ type: 'logSupplierMail', ...m }) });
    skip.current = false;
    prev.current = state;
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
  const [phase, setPhase] = useState<'checking' | 'auth' | 'loading' | 'ready' | 'nomember' | 'error' | 'newpw'>('checking');
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
        if (data.session && authReturn.hadCode && resetPending()) return setPhase('newpw');
        if (data.session) return start();
        if (authReturn.hadCode || authReturn.error) setError(LINK_FAILED);
        setPhase('auth');
      });
    const { data: sub } = supabase().auth.onAuthStateChange((ev) => {
      if (ev === 'PASSWORD_RECOVERY' || (ev === 'SIGNED_IN' && authReturn.hadCode && resetPending())) return setPhase('newpw');
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
    processMailEvents(synced.current, state, { remote: true, log: (m) => dispatch({ type: 'logSupplierMail', ...m }) });
    synced.current = state;
    if (!upserts.length && !deletes.length) return;
    queue.current = queue.current.then(() => pushDocs(upserts, deletes)).catch((e) => setError(`Enregistrement refusé : ${(e as Error).message}`));
  }, [state, phase]);

  if (phase === 'newpw')
    return (
      <NewPasswordScreen
        onDone={() => {
          clearReset();
          start();
        }}
      />
    );
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
    setMsg(err ? authMessage(err, !!password) : password ? '' : 'Lien de connexion envoyé : ouvrez votre e-mail, dans ce même navigateur.');
  };
  /** Mot de passe oublié : e-mail avec un lien pour en choisir un nouveau */
  const forgot = async () => {
    setMsg('');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return setMsg('Saisissez d’abord votre e-mail, puis cliquez sur « Mot de passe oublié ? ».');
    try {
      localStorage.setItem(RESET_KEY, email);
    } catch {
      /* le lien connectera quand même ; le mot de passe pourra être choisi depuis le menu */
    }
    const { error: err } = await supabase().auth.resetPasswordForEmail(email, { redirectTo: location.origin + '/' });
    setMsg(err ? authMessage(err, false) : 'E-mail envoyé : ouvrez le lien dans ce même navigateur pour choisir un nouveau mot de passe.');
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
            <button type="button" className="btn ghost sm auth-forgot" onClick={forgot}>
              Mot de passe oublié ?
            </button>
            {msg && <p className="small">{msg}</p>}
          </>
        )}
      </form>
    </div>
  );
}

/** Retour du lien « mot de passe oublié » : choisir le nouveau mot de passe avant d'entrer */
function NewPasswordScreen({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 8) return setMsg('8 caractères minimum.');
    if (pw !== pw2) return setMsg('Les deux mots de passe ne sont pas identiques.');
    setBusy(true);
    const { error } = await supabase().auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return setMsg(`Mot de passe non enregistré : ${error.message}`);
    onDone();
  };
  return (
    <div className="auth-screen">
      <form className="card pad auth-card" onSubmit={submit} aria-label="Nouveau mot de passe">
        <div className="logo">
          <span className="logo-mark">J</span> JONAS BUYING
        </div>
        <p className="bold">Choisissez votre nouveau mot de passe</p>
        <label htmlFor="np-pw1">
          Nouveau mot de passe <span className="muted small">(8 caractères minimum)</span>
          <input id="np-pw1" className="input" type="password" autoComplete="new-password" required value={pw} onChange={(e) => setPw(e.target.value)} />
        </label>
        <label htmlFor="np-pw2">
          Confirmer le mot de passe
          <input id="np-pw2" className="input" type="password" autoComplete="new-password" required value={pw2} onChange={(e) => setPw2(e.target.value)} />
        </label>
        <button type="submit" className="btn primary" disabled={busy}>
          Enregistrer et entrer
        </button>
        {msg && <p className="red small">{msg}</p>}
      </form>
    </div>
  );
}
