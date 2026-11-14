import { useEffect, useRef, useState } from 'react';
import { Archive, Download, File as FileIcon, FileImage, FileText, Folder, FolderUp, Loader2, Trash2, Upload, X } from 'lucide-react';
import { useAuth, useStore } from '../data/store';
import type { PackFile, Product } from '../data/types';
import { deleteBlob, ext, fromDrop, fromInput, fsize, getBlob, putBlob, saveBlob, zipBlobs, type PickedFile } from '../lib/files';
import { fstamp } from '../lib/format';
import { toast } from './ui';

const IMAGE = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']);
const isImage = (f: PackFile) => IMAGE.has(ext(f.name));

function KindIcon({ f }: { f: PackFile }) {
  const e = ext(f.name);
  if (isImage(f)) return <FileImage size={16} />;
  if (['pdf', 'ai', 'eps', 'psd', 'indd'].includes(e)) return <FileText size={16} />;
  if (['zip', 'rar', '7z'].includes(e)) return <Archive size={16} />;
  return <FileIcon size={16} />;
}

/** Miniature d'une image stockée (chargée à la demande) */
function Thumb({ f, onOpen }: { f: PackFile; onOpen: (url: string) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let u: string | null = null;
    getBlob(f.id).then((b) => {
      if (b) {
        u = URL.createObjectURL(b);
        setUrl(u);
      }
    });
    return () => {
      if (u) URL.revokeObjectURL(u);
    };
  }, [f.id]);
  if (!url) return <span className="pf-file-ico"><KindIcon f={f} /></span>;
  return <img className="pf-file-thumb" src={url} alt={f.name} onClick={() => onOpen(url)} />;
}

export default function PackFiles({ p }: { p: Product }) {
  const { dispatch } = useStore();
  const auth = useAuth();
  const canEdit = auth.allowed({ type: 'addPackFiles', productId: p.id, kind: 'crea', files: [] });
  const files = p.pack.files ?? [];
  const packs = files.filter((f) => f.kind === 'pack').sort((a, b) => (b.version ?? 0) - (a.version ?? 0));
  const crea = files.filter((f) => f.kind === 'crea').sort((a, b) => a.path.localeCompare(b.path));
  const [busy, setBusy] = useState<string | null>(null);
  const [over, setOver] = useState<'pack' | 'crea' | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const packInput = useRef<HTMLInputElement>(null);
  const filesInput = useRef<HTMLInputElement>(null);
  const dirInput = useRef<HTMLInputElement>(null);

  async function upload(kind: 'pack' | 'crea', picked: PickedFile[]) {
    if (!picked.length) return;
    if (kind === 'pack') picked = picked.slice(0, 1);
    setBusy(`Envoi de ${picked.length} fichier${picked.length > 1 ? 's' : ''}…`);
    try {
      const metas = [];
      for (const [i, { file, path }] of picked.entries()) {
        const id = `${p.id}-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`;
        await putBlob(id, file);
        metas.push({ id, name: file.name, path, size: file.size, type: file.type });
      }
      dispatch({ type: 'addPackFiles', productId: p.id, kind, files: metas });
      toast(kind === 'pack' ? `Pack V${Math.max(0, ...packs.map((f) => f.version ?? 0)) + 1} envoyé en validation` : `${metas.length} fichier(s) ajouté(s) au dossier créa`);
    } catch {
      toast('Envoi impossible : espace de stockage du navigateur insuffisant ou refusé.');
    } finally {
      setBusy(null);
    }
  }

  async function download(f: PackFile) {
    const blob = await getBlob(f.id);
    if (!blob) return toast('Fichier introuvable sur cet appareil (envoyé depuis un autre navigateur).');
    const r = await saveBlob(blob, f.name);
    if (r === 'zipped') toast(`${f.name} téléchargé dans un .zip (format non téléchargeable tel quel ici)`);
    if (r === 'unavailable') toast('Téléchargement non disponible dans cette vue.');
  }

  async function downloadAll() {
    setBusy('Préparation du .zip…');
    try {
      const items = [];
      for (const f of [...packs.slice(0, 1), ...crea]) {
        const blob = await getBlob(f.id);
        if (blob) items.push({ path: f.kind === 'pack' ? `PACK_${f.name}` : `Dossier créa/${f.path}`, blob });
      }
      if (!items.length) return toast('Aucun fichier disponible sur cet appareil.');
      const zip = await zipBlobs(items);
      const r = await saveBlob(zip, `${p.ref}_dossier_crea.zip`);
      if (r === 'unavailable') toast('Téléchargement non disponible dans cette vue.');
    } finally {
      setBusy(null);
    }
  }

  async function remove(f: PackFile) {
    dispatch({ type: 'removePackFile', productId: p.id, fileId: f.id });
    await deleteBlob(f.id).catch(() => undefined);
    toast(`${f.name} supprimé`);
  }

  const drop = (kind: 'pack' | 'crea') =>
    canEdit
      ? {
          onDragOver: (e: React.DragEvent) => {
            if (!e.dataTransfer.types.includes('Files')) return;
            e.preventDefault();
            setOver(kind);
          },
          onDragLeave: () => setOver(null),
          onDrop: async (e: React.DragEvent) => {
            if (!e.dataTransfer.types.includes('Files')) return;
            e.preventDefault();
            setOver(null);
            upload(kind, await fromDrop(e.dataTransfer));
          },
        }
      : {};

  // Arborescence : dossiers (chemin sans le nom de fichier)
  const folders = new Map<string, PackFile[]>();
  for (const f of crea) {
    const dir = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : '';
    folders.set(dir, [...(folders.get(dir) ?? []), f]);
  }
  const total = crea.reduce((s, f) => s + f.size, 0);

  const FileLine = ({ f, label }: { f: PackFile; label?: React.ReactNode }) => (
    <div className="pf-file">
      {isImage(f) ? <Thumb f={f} onOpen={setPreview} /> : <span className="pf-file-ico"><KindIcon f={f} /></span>}
      <span className="pf-file-name">
        <b title={f.path}>
          {label}
          {f.name}
        </b>
        <small>
          {fsize(f.size)} · {fstamp(f.uploadedAt)} · {f.uploadedBy}
        </small>
      </span>
      <button className="icon-btn" title="Télécharger" onClick={() => download(f)}>
        <Download size={16} />
      </button>
      {canEdit && (
        <button className="icon-btn danger-ico" title="Supprimer" onClick={() => remove(f)}>
          <Trash2 size={16} />
        </button>
      )}
    </div>
  );

  return (
    <div className="pf-files">
      <input ref={packInput} type="file" hidden onChange={(e) => (upload('pack', fromInput(e.target.files)), (e.target.value = ''))} />
      <input ref={filesInput} type="file" multiple hidden onChange={(e) => (upload('crea', fromInput(e.target.files)), (e.target.value = ''))} />
      <input
        ref={dirInput}
        type="file"
        multiple
        hidden
        {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
        onChange={(e) => (upload('crea', fromInput(e.target.files)), (e.target.value = ''))}
      />

      {/* Pack : fichier final, versionné */}
      <section className={`pf-drop ${over === 'pack' ? 'over' : ''}`} {...drop('pack')}>
        <header>
          <b>Pack</b>
          <span className="muted small">{packs.length ? `${packs.length} version${packs.length > 1 ? 's' : ''}` : `V${p.pack.artworkVersions} déclarée, aucun fichier`}</span>
          {canEdit && (
            <button className="btn sm primary" onClick={() => packInput.current?.click()} disabled={!!busy}>
              <Upload size={14} /> {packs.length ? 'Nouvelle version' : 'Uploader le pack'}
            </button>
          )}
        </header>
        {packs.map((f, i) => (
          <div key={f.id} className={i === 0 ? 'pf-current' : 'pf-old'}>
            <FileLine f={f} label={<span className={`pf-ver ${i === 0 ? 'on' : ''}`}>V{f.version}</span>} />
          </div>
        ))}
        {!packs.length && canEdit && <div className="pf-hint">Glissez ici le fichier du pack (AI, PDF, PSD…) : il part en validation chez David.</div>}
      </section>

      {/* Dossier créa : tous les fichiers de travail, avec sous-dossiers */}
      <section className={`pf-drop ${over === 'crea' ? 'over' : ''}`} {...drop('crea')}>
        <header>
          <b>Dossier créa</b>
          <span className="muted small">
            {crea.length} fichier{crea.length > 1 ? 's' : ''}
            {crea.length ? ` · ${fsize(total)}` : ''}
          </span>
        </header>
        {canEdit && (
          <div className="pf-actions">
            <button className="btn sm" onClick={() => filesInput.current?.click()} disabled={!!busy}>
              <Upload size={14} /> Ajouter des fichiers
            </button>
            <button className="btn sm" onClick={() => dirInput.current?.click()} disabled={!!busy}>
              <FolderUp size={14} /> Ajouter un dossier
            </button>
          </div>
        )}
        {[...folders.entries()].map(([dir, list]) => (
          <div key={dir || '/'} className="pf-folder">
            {dir && (
              <div className="pf-folder-name">
                <Folder size={15} /> {dir} <small>{list.length}</small>
              </div>
            )}
            {list.map((f) => (
              <FileLine key={f.id} f={f} />
            ))}
          </div>
        ))}
        {!crea.length && <div className="pf-hint">{canEdit ? 'Glissez ici des fichiers ou un dossier entier (rendus, sources, typos, références…).' : 'Aucun fichier.'}</div>}
      </section>

      {(packs.length > 0 || crea.length > 0) && (
        <button className="btn sm" onClick={downloadAll} disabled={!!busy}>
          <Archive size={14} /> Tout télécharger (.zip)
        </button>
      )}
      {busy && (
        <div className="pf-busy">
          <Loader2 size={15} className="spin" /> {busy}
        </div>
      )}
      <div className="xs muted">Fichiers conservés dans ce navigateur (démo). Le partage entre utilisateurs viendra avec le stockage serveur.</div>

      {preview && (
        <div className="pf-preview" onClick={() => setPreview(null)}>
          <img src={preview} alt="Aperçu" />
          <button className="icon-btn" aria-label="Fermer">
            <X size={22} />
          </button>
        </div>
      )}
    </div>
  );
}
