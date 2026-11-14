// Stockage des fichiers (pack + dossier créa).
// Les contenus sont gardés dans IndexedDB du navigateur ; seules les métadonnées
// (nom, chemin, taille, version, auteur) vont dans l'état de l'application.
// À remplacer par un stockage serveur partagé (ex. Supabase Storage).
import JSZip from 'jszip';

const DB_NAME = 'jonas-buying-files';
const STORE = 'blobs';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = run(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const putBlob = (id: string, blob: Blob) => tx('readwrite', (s) => s.put(blob, id));
export const getBlob = (id: string) => tx<Blob | undefined>('readonly', (s) => s.get(id) as IDBRequest<Blob | undefined>);
export const deleteBlob = (id: string) => tx('readwrite', (s) => s.delete(id));

/** Fichier choisi ou déposé, avec son chemin relatif dans le dossier */
export interface PickedFile {
  file: File;
  path: string;
}

/** Fichiers d'un <input type="file"> (webkitRelativePath pour un dossier) */
export function fromInput(list: FileList | null): PickedFile[] {
  return [...(list ?? [])].map((file) => ({ file, path: file.webkitRelativePath || file.name }));
}

type Entry = { isFile: boolean; isDirectory: boolean; name: string; fullPath: string };
type FileEntry = Entry & { file: (ok: (f: File) => void, ko: (e: unknown) => void) => void };
type DirEntry = Entry & { createReader: () => { readEntries: (ok: (e: Entry[]) => void, ko: (e: unknown) => void) => void } };

async function walk(entry: Entry, out: PickedFile[]): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((ok, ko) => (entry as FileEntry).file(ok, ko));
    out.push({ file, path: entry.fullPath.replace(/^\//, '') });
  } else if (entry.isDirectory) {
    const reader = (entry as DirEntry).createReader();
    // readEntries rend les entrées par paquets : on lit jusqu'à épuisement
    for (;;) {
      const batch = await new Promise<Entry[]>((ok, ko) => reader.readEntries(ok, ko));
      if (!batch.length) break;
      for (const e of batch) await walk(e, out);
    }
  }
}

/** Fichiers et dossiers glissés-déposés (dossiers parcourus récursivement) */
export async function fromDrop(dt: DataTransfer): Promise<PickedFile[]> {
  const out: PickedFile[] = [];
  const entries = [...dt.items]
    .map((i) => (i.kind === 'file' ? (i as DataTransferItem & { webkitGetAsEntry?: () => Entry | null }).webkitGetAsEntry?.() : null))
    .filter(Boolean) as Entry[];
  if (entries.length) {
    for (const e of entries) await walk(e, out);
    return out;
  }
  return fromInput(dt.files);
}

export function fsize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2).replace('.', ',')} Go`;
}

export const ext = (name: string) => (name.includes('.') ? name.split('.').pop()!.toLowerCase() : '');

/** Extensions qu'un Artifact claude.ai sait faire télécharger telles quelles */
const ARTIFACT_OK = new Set('gif png jpg jpeg webp mp4 webm txt json md docx pptx epub csv ttf html svg pdf xlsx zip fig'.split(' '));

type Downloads = { save: (r: { filename: string; data: Blob }) => Promise<unknown> };
type ClaudeWin = { claude?: { use?: (n: string) => Promise<unknown> } };

/**
 * Propose le fichier au téléchargement.
 * Dans un Artifact : capacité « downloads » (formats non admis, ex. .ai/.psd, emballés en .zip).
 * Ailleurs : téléchargement classique du navigateur.
 */
export async function saveBlob(blob: Blob, filename: string): Promise<'saved' | 'zipped' | 'declined' | 'unavailable'> {
  const host = (window as unknown as ClaudeWin).claude;
  if (host?.use) {
    const dl = (await host.use('downloads')) as Downloads | null;
    if (!dl) return 'unavailable';
    let data = blob;
    let name = filename;
    let zipped = false;
    if (!ARTIFACT_OK.has(ext(filename))) {
      data = await zipBlobs([{ path: filename, blob }]);
      name = `${filename.replace(/\.[^.]+$/, '')}.zip`;
      zipped = true;
    }
    try {
      await dl.save({ filename: name, data });
      return zipped ? 'zipped' : 'saved';
    } catch (e) {
      return (e as { code?: string })?.code === 'declined' ? 'declined' : 'unavailable';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return 'saved';
}

export async function zipBlobs(items: { path: string; blob: Blob }[]): Promise<Blob> {
  const zip = new JSZip();
  for (const it of items) zip.file(it.path, it.blob);
  return zip.generateAsync({ type: 'blob' });
}
