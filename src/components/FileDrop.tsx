import { useRef, useState } from 'react';
import { FileUp } from 'lucide-react';
import { useT } from '../i18n';

const ACCEPT = '.pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg';

/** Zone de dépôt : glisser-déposer un fichier, ou cliquer pour le choisir */
export default function FileDrop({ onFile, label, ariaLabel, current, accept = ACCEPT, hint }: { onFile: (f: File) => void; label?: string; ariaLabel: string; current?: string; accept?: string; hint?: string }) {
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
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
    >
      <FileUp size={26} />
      <b>{over ? t('pv.dropHere') : current ?? label ?? t('pv.drop')}</b>
      <small>{hint ?? t('pv.chooseFile')}</small>
      <input
        ref={input}
        type="file"
        accept={accept}
        aria-label={ariaLabel}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          if (input.current) input.current.value = '';
        }}
      />
    </label>
  );
}
