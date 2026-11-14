import { Check, Lock, RotateCcw, Users } from 'lucide-react';
import { useAuth, useStore } from '../data/store';
import { MODULE_LABELS, PERM_LABELS, ROLE_DEFS, ROLES, type Module, type Perm } from '../data/permissions';
import { VALIDATION_LABELS, VALIDATION_STEPS, type Role, type ValidationStep } from '../data/types';
import { Pill, toast } from '../components/ui';
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
