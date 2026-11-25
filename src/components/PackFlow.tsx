import { useState } from 'react';
import { Check, CheckCircle2, Clock, PenLine, ThumbsDown, Upload } from 'lucide-react';
import { canPackFiles, currentUser, currentValidatorLabel, packDone, useAuth, useStore } from '../data/store';
import type { PackFileKind, Product } from '../data/types';
import { fromInput, newFileId, putBlob, supplierScope } from '../lib/files';
import PackFiles, { type PackRound } from './PackFiles';
import { toast } from './ui-shared';

/** Étapes du pack : Brief → Création → Validation → Terminé */
function Stepper({ p }: { p: Product }) {
  const files = p.pack.files ?? [];
  const brief = !!p.pack.brief || files.some((f) => f.kind === 'brief');
  const pack = files.some((f) => f.kind === 'pack');
  const done = packDone(p);
  const steps = [
    { label: 'Brief', ok: brief },
    { label: 'Création', ok: pack },
    { label: 'Validation', ok: done },
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

/**
 * Design & Pack, simple : étapes, documents du pack (3 ronds : die cut, pack, documents),
 * et la prochaine action de la personne connectée, en un gros bouton.
 */
export default function PackFlow({ p }: { p: Product }) {
  const { state, dispatch } = useStore();
  const auth = useAuth();
  const me = currentUser(state);
  const [round, setRound] = useState<PackRound | undefined>();
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
    toast(k === 'pack' ? `Pack V${lastPack + 1} envoyé en validation` : `${metas.length} fichier(s) déposé(s)`);
  };
  const pick = (k: PackFileKind, r: PackRound) => {
    setKind(k);
    setRound(r);
    setTimeout(() => document.getElementById('pk-next-file')?.click());
  };

  // Prochaine action de la personne connectée
  const step = currentValidatorLabel(p);
  let action: { title: string; text?: string; button?: { label: string; icon: typeof Upload; run: () => void }; second?: { label: string; run: () => void } };
  if (packDone(p)) action = { title: 'Pack terminé', text: 'Validé par tout le circuit.' };
  else if (auth.allowed({ type: 'validatePack', productId: p.id }) && has('pack'))
    action = {
      title: `Valider le pack V${lastPack || p.pack.artworkVersions}`,
      text: `Étape : ${step}. Téléchargez le pack dans « Documents du pack » pour le vérifier.`,
      button: { label: 'Valider le pack', icon: CheckCircle2, run: () => (dispatch({ type: 'validatePack', productId: p.id }), toast(`Pack validé (${step})`)) },
      second: auth.allowed({ type: 'rejectPack', productId: p.id }) ? { label: 'Refuser', run: () => (dispatch({ type: 'rejectPack', productId: p.id }), toast('Pack refusé : retour au designer')) } : undefined,
    };
  else if (can('pack') && !has('pack')) action = { title: 'Déposer le pack', text: has('brief') || p.pack.brief ? 'Le brief est prêt (rond Pack).' : 'Pas encore de brief : demandez-le à l’acheteur.', button: { label: 'Déposer et passer en validation', icon: Upload, run: () => pick('pack', 'pack') } };
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
  else if (can('diecut') && !has('diecut')) action = { title: 'Déposer le die cut', text: 'Tous formats : PDF, AI, DXF, EPS, ZIP…', button: { label: 'Déposer le die cut', icon: Upload, run: () => pick('diecut', 'diecut') } };
  else if (can('quality') && !has('quality')) action = { title: 'Déposer les documents', text: 'MSDS, fiche composition, certificats…', button: { label: 'Déposer les documents', icon: Upload, run: () => setRound('docs') } };
  else if (can('pack') && has('pack')) action = { title: `Pack V${lastPack} en validation`, text: `En attente : ${step}. Vous pouvez déposer une nouvelle version.`, button: { label: 'Déposer une nouvelle version', icon: Upload, run: () => pick('pack', 'pack') } };
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
        <section className="card pad pk-next" aria-label="Prochaine action">
          <div className="pk-next-label">Prochaine action</div>
          <div className="pk-next-title">{action.title}</div>
          {action.text && <p className="muted">{action.text}</p>}
          {action.button && (
            <button className="btn primary pk-next-btn" onClick={action.button.run}>
              <action.button.icon size={20} /> {action.button.label}
            </button>
          )}
          {action.second && (
            <button className="btn pk-next-second" onClick={action.second.run}>
              <ThumbsDown size={16} /> {action.second.label}
            </button>
          )}
          {!action.button && !packDone(p) && (
            <div className="pk-wait">
              <Clock size={16} /> {step ? `Circuit : ${step}` : ''}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
