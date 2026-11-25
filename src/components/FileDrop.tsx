import { useRef, useState } from 'react';
import { FileUp } from 'lucide-react';
import { useT } from '../i18n';

const ACCEPT = '.pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg';

/** Fichiers d'un dossier déposé (sous-dossiers compris) */
async function filesOf(entries: FileSystemEntry[]): Promise<File[]> {
  const out: File[] = [];
  for (const en of entries) {
    if (en.isFile) out.push(await new Promise<File>((ok, ko) => (en as FileSystemFileEntry).file(ok, ko)));
    else if (en.isDirectory) {
      const reader = (en as FileSystemDirectoryEntry).createReader();
      // readEntries rend les fichiers par paquets : on lit jusqu'au bout
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((ok, ko) => reader.readEntries(ok, ko));
        if (!batch.length) break;
        out.push(...(await filesOf(batch)));
      }
    }
  }
  return out;
}

/** Zone de dépôt : glisser-déposer un fichier, ou cliquer pour le choisir */
export default function FileDrop({
  onFile,
  onFiles,
  multiple,
  label,
  ariaLabel,
  current,
  accept = ACCEPT,
  hint,
}: {
  onFile?: (f: File) => void;
  /** Plusieurs fichiers (multiple) */
  onFiles?: (fs: File[]) => void;
  multiple?: boolean;
  label?: string;
  ariaLabel: string;
  current?: string;
  accept?: string;
  hint?: string;
}) {
  const take = (list?: FileList | null) => {
    const fs = [...(list ?? [])];
    if (!fs.length) return;
    if (multiple && onFiles) onFiles(fs);
    else onFile?.(fs[0]);
  };
  const { t } = useT();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <label
      className={`drop-zone ${over ? 'over' : ''} ${current ? 'has-file' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOver(false);
        // Dossier déposé (plusieurs fichiers) : on lit les fichiers qu'il contient
        const entries = multiple ? [...e.dataTransfer.items].map((i) => i.webkitGetAsEntry?.()).filter((x): x is FileSystemEntry => !!x) : [];
        if (entries.some((x) => x.isDirectory)) filesOf(entries).then((fs) => fs.length && onFiles?.(fs));
        else take(e.dataTransfer.files);
      }}
    >
      <FileUp size={26} />
      <b>{over ? t('pv.dropHere') : current ?? label ?? t('pv.drop')}</b>
      <small>{hint ?? t('pv.chooseFile')}</small>
      <input
        ref={input}
        type="file"
        accept={accept}
        multiple={multiple}
        aria-label={ariaLabel}
        onChange={(e) => {
          take(e.target.files);
          if (input.current) input.current.value = '';
        }}
      />
    </label>
  );
}
