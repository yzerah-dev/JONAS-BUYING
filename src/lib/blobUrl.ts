// Adresse affichable d'un fichier du stockage (photo produit…), chargée une seule fois par fichier.
import { useEffect, useMemo, useState } from 'react';
import { getBlob } from './files';

const cache = new Map<string, Promise<string | undefined>>();

export function blobUrl(fileId: string): Promise<string | undefined> {
  let p = cache.get(fileId);
  if (!p) {
    p = getBlob(fileId)
      .then((b) => (b ? URL.createObjectURL(b) : undefined))
      .catch(() => undefined);
    cache.set(fileId, p);
  }
  return p;
}

/** Adresse d'un fichier enregistré (identifiant), ou d'un fichier pas encore enregistré (Blob) */
export function useBlobUrl(src?: string | Blob): string | undefined {
  // Fichier en mémoire (vérification d'une proforma avant envoi) : adresse immédiate
  const local = useMemo(() => (src instanceof Blob ? URL.createObjectURL(src) : undefined), [src]);
  const [stored, setStored] = useState<{ id: string; url?: string }>();
  useEffect(() => {
    if (typeof src !== 'string') return;
    let live = true;
    blobUrl(src).then((url) => live && setStored({ id: src, url }));
    return () => {
      live = false;
    };
  }, [src]);
  return local ?? (typeof src === 'string' && stored?.id === src ? stored.url : undefined);
}
