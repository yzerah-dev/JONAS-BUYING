import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { History, Search } from 'lucide-react';
import { useStore } from '../data/store';
import { ROLE_DEFS } from '../data/permissions';
import type { JournalEntry, Role } from '../data/types';
import { fdate } from '../lib/format';
import { designerColor } from '../components/ui-shared';
import { initials } from '../lib/format';

const FAMILIES: { id: string; label: string; types: string[] }[] = [
  { id: 'pf', label: 'Proformas', types: ['signProforma', 'setProformaStatus', 'setProformaCurrency'] },
  { id: 'pack', label: 'Packs', types: ['validatePack', 'rejectPack', 'requestDieCut', 'receiveDieCut', 'uploadArtwork', 'forwardPack', 'startPack', 'planPack', 'addPackFiles', 'removePackFile', 'reassignPack', 'toggleUrgent'] },
  { id: 'dev', label: 'Développement', types: ['advanceDev', 'markDeveloped'] },
  { id: 'log', label: 'Logistique', types: ['allocate', 'deallocate', 'createContainer', 'validatePlan', 'requestPlan', 'proposePlan', 'addContainerDoc', 'requestBooking', 'confirmBooking', 'ship', 'receive', 'reviseEta'] },
  { id: 'fin', label: 'Finance', types: ['payDeposit', 'payBalance', 'setFx'] },
  { id: 'adm', label: 'Administration', types: ['setUserRole', 'toggleUser', 'setCapacity', 'setDefaultCapacity'] },
];

/** Lien vers l'objet concerné, quand on sait le retrouver */
function targetLink(e: JournalEntry, s: ReturnType<typeof useStore>['state']) {
  if (!e.target) return null;
  if (s.proformas.some((p) => p.id === e.target)) return `/proformas/${e.target}`;
  const prod = s.products.find((p) => p.ref === e.target);
  if (prod) return `/produits/${prod.id}`;
  const c = s.containers.find((x) => x.number === e.target || x.id === e.target);
  if (c) return `/conteneurs?c=${c.id}`;
  return null;
}

export default function Journal() {
  const { state } = useStore();
  const [who, setWho] = useState('all');
  const [family, setFamily] = useState('all');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(100);
  const journal = useMemo(() => state.journal ?? [], [state.journal]);
  const people = [...new Set(journal.map((e) => e.user))].sort();

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const fam = FAMILIES.find((f) => f.id === family);
    return journal
      .filter((e) => who === 'all' || e.user === who)
      .filter((e) => !fam || fam.types.includes(e.type))
      .filter((e) => !s || `${e.text} ${e.target ?? ''} ${e.user}`.toLowerCase().includes(s));
  }, [journal, who, family, q]);

  const days = new Map<string, JournalEntry[]>();
  for (const e of list.slice(0, limit)) {
    const d = e.at.slice(0, 10);
    days.set(d, [...(days.get(d) ?? []), e]);
  }

  return (
    <div className="pf-page">
      <div className="row wrap" style={{ gap: 14 }}>
        <h1 className="pf-title">Journal d’activité</h1>
        <span className="muted">Toutes les actions : qui, quoi, quand · {journal.length} entrée(s)</span>
      </div>
      <div className="jr-tools">
        <label className="pf-search dev-search">
          <Search size={18} />
          <input placeholder="Référence, proforma, conteneur, texte…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <select className="input" value={who} onChange={(e) => setWho(e.target.value)} aria-label="Personne">
          <option value="all">Tout le monde</option>
          {people.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <div className="pk-chips">
          <button className={`pk-chip ${family === 'all' ? 'active' : ''}`} onClick={() => setFamily('all')}>
            Tout
          </button>
          {FAMILIES.map((f) => (
            <button key={f.id} className={`pk-chip ${family === f.id ? 'active' : ''}`} onClick={() => setFamily(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {journal.length === 0 && (
        <div className="card empty">
          <History size={30} className="muted" />
          <p>Le journal se remplit au fil des actions : signatures, validations, déplacements de packs, bookings, réceptions, paiements…</p>
        </div>
      )}
      {journal.length > 0 && list.length === 0 && <div className="card empty">Aucune action pour ce filtre.</div>}

      {[...days.entries()].map(([d, entries]) => (
        <section key={d} className="card jr-day">
          <div className="jr-date">{fdate(d)}</div>
          {entries.map((e) => {
            const to = targetLink(e, state);
            return (
              <div key={e.id} className="jr-row">
                <span className="jr-time">{e.at.slice(11, 16)}</span>
                <span className="dev-avatar" style={{ background: designerColor(e.user) }} title={e.user}>
                  {initials(e.user)}
                </span>
                <span className="jr-who">
                  <b>{e.user}</b>
                  <small>{ROLE_DEFS[e.role as Role]?.label ?? e.role}</small>
                </span>
                <span className="jr-text">{e.text}</span>
                {e.target && (to ? <Link to={to} className="jr-target">{e.target}</Link> : <span className="jr-target plain">{e.target}</span>)}
              </div>
            );
          })}
        </section>
      ))}
      {list.length > limit && (
        <button className="btn" style={{ alignSelf: 'center' }} onClick={() => setLimit(limit + 100)}>
          Afficher plus ({list.length - limit} restantes)
        </button>
      )}
    </div>
  );
}
