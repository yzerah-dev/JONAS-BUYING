import { useState } from 'react';
import { Check, CheckCircle2, Clock, History, PenLine, ThumbsDown, Upload } from 'lucide-react';
import { canPackFiles, currentUser, currentValidatorLabel, packDone, useAuth, useStore } from '../data/store';
import { VALIDATION_LABELS, VALIDATION_STEPS, type PackFileKind, type Product } from '../data/types';
import { fdate, fstamp } from '../lib/format';
import { fromInput, newFileId, putBlob, supplierScope } from '../lib/files';
import PackFiles, { type PackRound } from './PackFiles';
import { toast } from './ui-shared';

/** Étapes du pack : Brief → Création → Validation → Terminé */
function Stepper({ p }: { p: Product }) {
  const files = p.pack.files ?? [];
  // Pack créé : fichier déposé (ou version déjà déclarée) ; un pack créé vaut brief passé
  const pack = files.some((f) => f.kind === 'pack') || p.pack.artworkVersions > 0;
  const brief = pack || !!p.pack.brief || files.some((f) => f.kind === 'brief');
  const done = packDone(p);
  const nDone = VALIDATION_STEPS.filter((s) => p.pack.validations[s].state === 'done').length;
  const steps = [
    { label: 'Brief', ok: brief },
    { label: 'Création', ok: pack },
    { label: pack && !done ? `Validation ${nDone}/${VALIDATION_STEPS.length}` : 'Validation', ok: done },
    { label: 'Terminé', ok: done },
  ];
  const current = steps.findIndex((s) => !s.ok);
  return (
    <ol className="pk-steps" aria-label="Étapes du pack">
      {steps.map((s, i) => (
        <li key={s.label} className={s.ok ? 'done' : i === current ? 'current' : ''} aria-current={i === current ? 'step' : undefined}>
          <span className="pk-step-num">{s.ok ? <Check size={16} strokeWidth={3} /> : i + 1}</span>
          <span className="pk-step-label">{s.label}</span>
        </li>
      ))}
    </ol>
  );
}

/** Circuit de validation, bien visible : chaque valideur, son état, et l'historique des décisions */
function Validations({ p }: { p: Product }) {
  const { state } = useStore();
  const v = p.pack.validations;
  const started = (p.pack.files ?? []).some((f) => f.kind === 'pack') || VALIDATION_STEPS.some((s) => v[s].state !== 'todo');
  const nDone = VALIDATION_STEPS.filter((s) => v[s].state === 'done').length;
  const lastPack = Math.max(p.pack.artworkVersions, ...(p.pack.files ?? []).filter((f) => f.kind === 'pack').map((f) => f.version ?? 0));
  const waiting = !!p.pack.rejection && p.pack.rejection.version >= lastPack && !packDone(p);
  const history = state.journal
    .filter((j) => j.target === p.ref && (j.type === 'validatePack' || j.type === 'rejectPack' || (j.type === 'addPackFiles' && j.text.startsWith('Pack uploadé'))))
    .slice(0, 6);
  return (
    <section className="card pad pk-valid" aria-label="Validation du pack">
      <div className="row">
        <h3 className="pk-h" style={{ margin: 0 }}>
          Validation du pack
        </h3>
        <div className="grow" />
        <span className={`pill ${nDone === VALIDATION_STEPS.length ? 'green' : started ? 'orange' : 'grey'}`}>
          {nDone} / {VALIDATION_STEPS.length} validé(s)
        </span>
      </div>
      {!started && <p className="muted small">Le circuit démarre quand le designer dépose le pack.</p>}
      {p.pack.rejection && !packDone(p) && (
        <div className="pk-rejection" role="note">
          <b>
            Refusé par {p.pack.rejection.by} ({p.pack.rejection.step}) — V{p.pack.rejection.version}
          </b>
          <span>« {p.pack.rejection.reason} »</span>
          <small>{fstamp(p.pack.rejection.at)}</small>
        </div>
      )}
      <ol className="pk-vlist">
        {VALIDATION_STEPS.map((s) => {
          const st = v[s].state;
          return (
            <li key={s} className={st}>
              <span className="pk-vdot">{st === 'done' ? <Check size={16} strokeWidth={3} /> : st === 'pending' ? <Clock size={15} /> : null}</span>
              <b>{VALIDATION_LABELS[s]}</b>
              <span className="pk-vstate">{st === 'done' ? `Validé${v[s].date ? ` le ${fdate(v[s].date)}` : ''}` : st === 'pending' ? (waiting ? 'Attend la nouvelle version du designer' : 'À valider — c’est son tour') : 'À venir'}</span>
            </li>
          );
        })}
      </ol>
      {history.length > 0 && (
        <div className="pk-vhist">
          <div className="pk-next-label">
            <History size={14} /> Historique
          </div>
          {history.map((j) => (
            <div key={`${j.at}-${j.id}`} className={`pk-vh ${j.type === 'rejectPack' ? 'red' : ''}`}>
              <small>{fstamp(j.at)}</small> {j.user} : {j.text}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * Design & Pack, simple : étapes, documents du pack (3 ronds : die cut, pack, documents),
 * et la prochaine action de la personne connectée, en un gros bouton.
 */
export default function PackFlow({ p }: { p: Product }) {
  const { state, dispatch } = useStore();
  const auth = useAuth();
  const me = currentUser(state);
  const [round, setRound] = useState<PackRound | undefined>();
  const [refusing, setRefusing] = useState(false);
  const [reason, setReason] = useState('');
  const [kind, setKind] = useState<PackFileKind>('pack');
  const files = p.pack.files ?? [];
  const has = (k: PackFileKind) => files.some((f) => f.kind === k);
  const can = (k: PackFileKind) => canPackFiles(state, me, p.id, k);
  const lastPack = files.filter((f) => f.kind === 'pack').reduce((m, f) => Math.max(m, f.version ?? 0), 0);

  const upload = async (k: PackFileKind, list: FileList | null) => {
    const picked = fromInput(list);
    if (!picked.length) return;
    const chosen = k === 'pack' ? picked.slice(0, 1) : picked;
    const metas = [];
    for (const [i, { file, path }] of chosen.entries()) {
      const id = newFileId(supplierScope(p.supplierId), `${p.id}-${k}`, i);
      await putBlob(id, file);
      metas.push({ id, name: file.name, path, size: file.size, type: file.type });
    }
    dispatch({ type: 'addPackFiles', productId: p.id, kind: k, files: metas });
    toast(k === 'pack' ? `Pack V${Math.max(lastPack, p.pack.artworkVersions) + 1} envoyé en validation` : `${metas.length} fichier(s) déposé(s)`);
  };
  const pick = (k: PackFileKind, r: PackRound) => {
    setKind(k);
    setRound(r);
    setTimeout(() => document.getElementById('pk-next-file')?.click());
  };

  // Prochaine action de la personne connectée
  const step = currentValidatorLabel(p);
  // Refus en cours : demande de modification sur la dernière version (pas encore de nouvelle version)
  const rejected = !!p.pack.rejection && p.pack.rejection.version >= Math.max(lastPack, p.pack.artworkVersions) && !packDone(p);
  let action: { title: string; text?: string; button?: { label: string; icon: typeof Upload; run: () => void }; second?: { label: string; run: () => void } };
  if (packDone(p)) action = { title: 'Pack terminé', text: 'Validé par tout le circuit.' };
  else if (auth.allowed({ type: 'validatePack', productId: p.id }) && (has('pack') || p.pack.artworkVersions > 0) && !rejected)
    action = {
      title: `Valider le pack V${lastPack || p.pack.artworkVersions}`,
      text: `Étape : ${step}. Téléchargez le pack dans « Documents du pack » pour le vérifier.`,
      button: { label: 'Valider le pack', icon: CheckCircle2, run: () => (dispatch({ type: 'validatePack', productId: p.id }), toast(`Pack validé (${step})`)) },
      second: auth.allowed({ type: 'rejectPack', productId: p.id })
        ? { label: 'Refuser et demander une modification', run: () => setRefusing(true) }
        : undefined,
    };
  else if (can('pack') && rejected)
    action = {
      title: 'Modifications demandées',
      text: `${p.pack.rejection!.by} (${p.pack.rejection!.step}) : « ${p.pack.rejection!.reason} »`,
      button: { label: 'Déposer la nouvelle version', icon: Upload, run: () => pick('pack', 'pack') },
    };
  else if (can('pack') && !has('pack'))
    action = {
      title: 'Déposer le pack',
      text: has('brief') || p.pack.brief ? 'Le brief est prêt (rond Pack).' : 'Pas encore de brief : demandez-le à l’acheteur.',
      button: { label: 'Déposer et passer en validation', icon: Upload, run: () => pick('pack', 'pack') },
    };
  else if (can('brief') && !p.pack.brief && !has('brief'))
    action = {
      title: 'Écrire le brief',
      text: 'Le designer en a besoin pour commencer : texte et photos de ce à quoi le pack doit ressembler.',
      button: {
        label: 'Écrire le brief',
        icon: PenLine,
        run: () => {
          setRound('pack');
          setTimeout(() => document.getElementById('ps-brief')?.focus());
        },
      },
    };
  else if (can('diecut') && !has('diecut'))
    action = { title: 'Déposer le die cut', text: 'Tous formats : PDF, AI, DXF, EPS, ZIP…', button: { label: 'Déposer le die cut', icon: Upload, run: () => pick('diecut', 'diecut') } };
  else if (can('quality') && !has('quality'))
    action = { title: 'Déposer les documents', text: 'MSDS, fiche composition, certificats…', button: { label: 'Déposer les documents', icon: Upload, run: () => setRound('docs') } };
  else if (can('pack') && has('pack'))
    action = {
      title: `Pack V${lastPack} en validation`,
      text: `En attente : ${step}. Vous pouvez déposer une nouvelle version.`,
      button: { label: 'Déposer une nouvelle version', icon: Upload, run: () => pick('pack', 'pack') },
    };
  else if (rejected) action = { title: 'En attente de la nouvelle version', text: `Modifications demandées au designer ${p.pack.designer} : « ${p.pack.rejection!.reason} »` };
  else action = { title: has('pack') ? `En attente : ${step}` : `En attente du pack de ${p.pack.designer}`, text: 'Rien à faire pour vous pour le moment.' };

  return (
    <div className="pk-flow">
      <Stepper p={p} />
      <input id="pk-next-file" type="file" hidden multiple={kind !== 'pack'} aria-label="Fichier de la prochaine action" onChange={(e) => (upload(kind, e.target.files), (e.target.value = ''))} />
      <div className="pk-cols">
        <section className="card pad pk-docs" aria-label="Documents du pack">
          <h3 className="pk-h">Documents du pack</h3>
          <PackFiles p={p} round={round} onRound={setRound} />
        </section>
        <div className="pk-side">
          <section className="card pad pk-next" aria-label="Prochaine action">
            <div className="pk-next-label">Prochaine action</div>
            <div className="pk-next-title">{action.title}</div>
            {action.text && <p className="muted">{action.text}</p>}
            {action.button && (
              <button className="btn primary pk-next-btn" onClick={action.button.run}>
                <action.button.icon size={20} /> {action.button.label}
              </button>
            )}
            {action.second && !refusing && (
              <button className="btn pk-next-second" onClick={action.second.run}>
                <ThumbsDown size={16} /> {action.second.label}
              </button>
            )}
            {refusing && (
              <form
                className="pk-refuse"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!reason.trim()) return toast('Écrivez la demande de modification');
                  dispatch({ type: 'rejectPack', productId: p.id, reason });
                  toast('Pack refusé : demande de modification envoyée au designer');
                  setRefusing(false);
                  setReason('');
                }}
              >
                <label htmlFor="pk-reason" className="pk-next-label">
                  Demande de modification
                </label>
                <textarea id="pk-reason" className="input" rows={4} autoFocus placeholder="Ce qui doit changer : couleurs, texte, logo, mentions, taille…" value={reason} onChange={(e) => setReason(e.target.value)} />
                <div className="row" style={{ gap: 8 }}>
                  <button type="button" className="btn" onClick={() => setRefusing(false)}>
                    Annuler
                  </button>
                  <button type="submit" className="btn danger grow" disabled={!reason.trim()}>
                    <ThumbsDown size={16} /> Envoyer la demande de modification
                  </button>
                </div>
              </form>
            )}
            {!action.button && !packDone(p) && (
              <div className="pk-wait">
                <Clock size={16} /> {step ? `Circuit : ${step}` : ''}
              </div>
            )}
          </section>
          <Validations p={p} />
        </div>
      </div>
    </div>
  );
}
