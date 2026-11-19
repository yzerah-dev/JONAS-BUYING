import { useState } from 'react';
import { CompanyStamp } from '../components/ProformaVersions';
import { Check, Lock, RotateCcw, Users } from 'lucide-react';
import { useAuth, useStore } from '../data/store';
import { MODULE_LABELS, PERM_LABELS, ROLE_DEFS, ROLES, type Module, type Perm } from '../data/permissions';
import { VALIDATION_LABELS, VALIDATION_STEPS, type Role, type ValidationStep } from '../data/types';
import { Pill, Seg } from '../components/ui';
import { ZOOMS, applyZoom, readZoom, type Zoom } from '../lib/zoom';
import { toast } from '../components/ui-shared';
import { initials } from '../lib/format';

export default function Settings() {
  const { state, dispatch } = useStore();
  const auth = useAuth();
  const admin = auth.can('users.manage');
  const internalRoles = ROLES.filter((r) => r !== 'fournisseur');

  return (
    <>
      <div className="page-head">
        <h1>Paramètres</h1>
      </div>

      <div className="card pad mb">
        <div className="card-title">
          <Users size={18} className="green" /> Utilisateurs & rôles
          <div className="grow" />
          {!admin && (
            <Pill color="grey" icon={<Lock size={12} />}>
              Lecture seule – réservé au rôle Pilote
            </Pill>
          )}
        </div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Utilisateur</th>
                <th>Fonction</th>
                <th>Rôle</th>
                <th>Étape de validation pack</th>
                <th>Rattachement</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {state.users.map((u) => {
                const sup = u.supplierId ? state.suppliers.find((s) => s.id === u.supplierId) : undefined;
                const self = u.id === auth.user.id;
                return (
                  <tr key={u.id} style={{ opacity: u.active ? 1 : 0.5 }}>
                    <td>
                      <div className="row">
                        <div className="avatar sm" style={sup ? { background: sup.color } : undefined}>
                          {initials(u.name)}
                        </div>
                        <div>
                          <div className="bold">
                            {u.name} {self && <span className="xs green">(vous)</span>}
                          </div>
                          <div className="xs muted">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="small">{u.title}</td>
                    <td>
                      {u.role === 'fournisseur' ? (
                        <Pill color="blue">Fournisseur</Pill>
                      ) : (
                        <select
                          className="input"
                          disabled={!admin || self}
                          value={u.role}
                          onChange={(e) => {
                            dispatch({ type: 'setUserRole', userId: u.id, role: e.target.value as Role });
                            toast(`${u.name} → ${ROLE_DEFS[e.target.value as Role].label}`);
                          }}
                        >
                          {internalRoles.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_DEFS[r].label}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td>
                      {u.role === 'fournisseur' ? (
                        <span className="small muted">Fournisseur</span>
                      ) : (
                        <select
                          className="input"
                          disabled={!admin}
                          value={u.validationStep ?? ''}
                          onChange={(e) =>
                            dispatch({ type: 'setUserRole', userId: u.id, role: u.role, validationStep: (e.target.value || null) as ValidationStep | null })
                          }
                        >
                          <option value="">—</option>
                          {VALIDATION_STEPS.filter((s) => s !== 'fournisseur').map((s) => (
                            <option key={s} value={s}>
                              {VALIDATION_LABELS[s]}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="small">{sup ? sup.name : u.designerName ? `Packs de ${u.designerName}` : 'JONAS'}</td>
                    <td>
                      {admin && !self ? (
                        <button className="btn sm" onClick={() => dispatch({ type: 'toggleUser', userId: u.id })}>
                          {u.active ? 'Actif · désactiver' : 'Inactif · réactiver'}
                        </button>
                      ) : (
                        <Pill color={u.active ? 'green' : 'grey'}>{u.active ? 'Actif' : 'Inactif'}</Pill>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid2 mb">
        <div className="card pad">
          <div className="card-title">Capacité des designers</div>
          <p className="small muted" style={{ marginTop: 0 }}>
            Nombre de packs qu’un designer peut traiter par semaine. Sert au planning de charge (Design) et aux compteurs du Développement.
          </p>
          <div className="set-row">
            <label htmlFor="cap-default">Par défaut</label>
            <input
              id="cap-default"
              className="input"
              type="number"
              min={1}
              max={200}
              disabled={!admin}
              value={state.settings.defaultCapacity}
              onChange={(e) => +e.target.value > 0 && dispatch({ type: 'setDefaultCapacity', capacity: +e.target.value })}
            />
            <span className="small muted">packs / semaine</span>
          </div>
          {[...new Set(state.products.map((p) => p.pack.designer))].sort().map((d) => {
            const own = state.settings.capacity[d];
            return (
              <div key={d} className="set-row">
                <label htmlFor={`cap-${d}`}>{d}</label>
                <input
                  id={`cap-${d}`}
                  className="input"
                  type="number"
                  min={1}
                  max={200}
                  disabled={!admin}
                  placeholder={String(state.settings.defaultCapacity)}
                  value={own ?? ''}
                  onChange={(e) => dispatch({ type: 'setCapacity', designer: d, capacity: e.target.value ? Math.max(1, +e.target.value) : null })}
                />
                <span className="small muted">{own ? 'capacité propre' : 'par défaut'}</span>
              </div>
            );
          })}
        </div>
        <div className="card pad">
          <div className="card-title">Devises</div>
          <p className="small muted" style={{ marginTop: 0 }}>
            Cours utilisés pour convertir les proformas en dollars ou en yuans. Tous les totaux de l’application sont affichés en euros.
          </p>
          {(['USD', 'CNY'] as const).map((c) => (
            <div key={c} className="set-row">
              <label htmlFor={`fx-${c}`}>1 {c} =</label>
              <input
                id={`fx-${c}`}
                className="input"
                type="number"
                step="0.0001"
                min={0}
                disabled={!auth.can('finance.pay')}
                value={state.settings.fx[c]}
                onChange={(e) => +e.target.value > 0 && dispatch({ type: 'setFx', currency: c, rate: +e.target.value })}
              />
              <span className="small muted">€</span>
            </div>
          ))}
          <p className="xs muted">Modifiable par la Finance et le Pilote. À brancher plus tard sur un cours du jour automatique.</p>
        </div>
      </div>

      <ZoomCard />

      <CompanyCard />

      <div className="card pad mb">
        <div className="card-title">Matrice des droits</div>
        <div className="tbl-wrap">
          <table className="tbl matrix">
            <thead>
              <tr>
                <th />
                {ROLES.map((r) => (
                  <th key={r} title={ROLE_DEFS[r].description}>
                    {ROLE_DEFS[r].label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={ROLES.length + 1} className="bold green small">
                  Modules visibles
                </td>
              </tr>
              {(Object.keys(MODULE_LABELS) as Module[]).map((m) => (
                <tr key={m}>
                  <td className="small">{MODULE_LABELS[m]}</td>
                  {ROLES.map((r) => (
                    <td key={r}>{ROLE_DEFS[r].modules.includes(m) ? <Check size={16} className="green" /> : ''}</td>
                  ))}
                </tr>
              ))}
              <tr>
                <td colSpan={ROLES.length + 1} className="bold green small">
                  Actions
                </td>
              </tr>
              {(Object.keys(PERM_LABELS) as Perm[]).map((p) => (
                <tr key={p}>
                  <td className="small">{PERM_LABELS[p]}</td>
                  {ROLES.map((r) => (
                    <td key={r}>{ROLE_DEFS[r].perms.includes(p) ? <Check size={16} className="green" /> : ''}</td>
                  ))}
                </tr>
              ))}
              <tr>
                <td className="small">Valider une étape pack</td>
                {ROLES.map((r) => (
                  <td key={r} className="xs">
                    {r === 'pilote' ? 'Toutes (arbitrage)' : r === 'fournisseur' ? 'Fournisseur' : 'Selon l’étape attribuée'}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <div className="xs muted mt">
          Le portail fournisseur ne montre que les données du fournisseur connecté : ses produits, proformas, packs à valider, die cuts, plans de chargement, conteneurs, documents et
          paiements.
        </div>
      </div>

      <div className="grid2">
        <div className="card pad">
          <div className="card-title">Données de démonstration</div>
          <p className="small">
            Les données sont stockées localement dans le navigateur. Le changement d’utilisateur (menu en haut à droite) simule la connexion ; il sera remplacé par une vraie authentification.
          </p>
          <button
            className="btn danger"
            onClick={() => {
              dispatch({ type: 'reset' });
              toast('Données réinitialisées');
            }}
          >
            <RotateCcw size={16} /> Réinitialiser les données
          </button>
        </div>
        <div className="card pad">
          <div className="card-title">Règles de calcul</div>
          <ul className="small" style={{ paddingLeft: 18, margin: 0, lineHeight: 1.8 }}>
            <li>Capacité de référence : 69 m³ par 40HC (pilotage volumétrique, ne remplace pas une vérification physique).</li>
            <li>CBM d’une ligne = (quantité ÷ PCB) × CBM carton ; équivalent 40HC = CBM ÷ 69.</li>
            <li>Un pack est terminé uniquement après les 4 validations : David → Direction → Moinard → Fournisseur.</li>
            <li>Quantités suivies par commande, conteneur et réception (pas de double comptage).</li>
            <li>Vue conteneurs par ETA : arrivée prévue, révisée ou réelle dans la période, même si l’ETD est antérieure.</li>
            <li>Les changements de dates et de statuts sont historisés.</li>
          </ul>
        </div>
      </div>
    </>
  );
}

/** Société portée sur le tampon des proformas signées (Direction / Pilote) */
function CompanyCard() {
  const { state, dispatch } = useStore();
  const auth = useAuth();
  const edit = auth.can('proforma.sign');
  const saved = state.settings.company;
  const [c, setC] = useState(saved);
  const dirty = JSON.stringify(c) !== JSON.stringify(saved);
  const set = (k: keyof typeof c, v: string) => setC({ ...c, [k]: v });
  const fields: { k: keyof typeof c; label: string; ph: string }[] = [
    { k: 'name', label: 'Raison sociale', ph: 'JONAS INTERNATIONAL' },
    { k: 'address', label: 'Adresse', ph: 'N° et rue' },
    { k: 'city', label: 'Code postal et ville', ph: '75000 Paris' },
    { k: 'vat', label: 'N° de TVA intracommunautaire', ph: 'FR00 000000000' },
    { k: 'gs1Prefix', label: 'Préfixe GS1 des codes-barres EAN JONAS', ph: '370157' },
  ];
  return (
    <div className="card pad mb">
      <div className="card-title">Tampon de la société</div>
      <p className="small muted" style={{ marginTop: 0 }}>
        Porté sur chaque proforma signée, avec la date, la signature de la Direction et la date d’expédition demandée. Modifiable par la Direction et le Pilote.
      </p>
      <div className="co-grid">
        <div className="co-fields">
          {fields.map((f) => (
            <label key={f.k} htmlFor={`co-${f.k}`}>
              {f.label}
              <input id={`co-${f.k}`} className="input" disabled={!edit} placeholder={f.ph} value={c[f.k] ?? ''} onChange={(e) => set(f.k, e.target.value)} />
            </label>
          ))}
        </div>
        <div className="pv-stamp-preview">
          <CompanyStamp company={c} />
        </div>
      </div>
      {edit && (
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
          <button
            className="btn primary"
            disabled={!dirty}
            onClick={() => {
              dispatch({ type: 'setCompany', company: { name: c.name.trim(), address: c.address.trim(), city: c.city.trim(), vat: c.vat.trim().toUpperCase(), gs1Prefix: (c.gs1Prefix ?? '').replace(/\D/g, '') || undefined } });
              toast('Tampon de la société enregistré');
            }}
          >
            <Check size={16} /> Enregistrer le tampon
          </button>
        </div>
      )}
    </div>
  );
}

/** Taille d'affichage, propre à chaque utilisateur (navigateur) */
function ZoomCard() {
  const [z, setZ] = useState<Zoom>(readZoom);
  return (
    <div className="card pad mb">
      <div className="card-title">Taille d’affichage</div>
      <p className="small muted" style={{ marginTop: 0 }}>
        Automatique : réduite sur les grands écrans (60 % à partir de 1800 px de large, 70 % puis 80 % sur les écrans plus petits, 100 % sur téléphone). Réglage propre à ce navigateur.
      </p>
      <Seg
        value={z}
        onChange={(v) => {
          setZ(v);
          applyZoom(v);
        }}
        options={ZOOMS.map((id) => ({ id, label: id === 'auto' ? 'Automatique' : `${id} %` }))}
      />
    </div>
  );
}
