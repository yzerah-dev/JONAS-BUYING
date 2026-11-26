import type { Container } from '../data/types';
import { toast } from '../components/ui-shared';
import { getBlob, saveBlob } from './files';

/** Télécharger le fichier d'un document de conteneur ; sans fichier joint, le dire */
export async function downloadContainerDoc(c: Container, doc: string) {
  const f = c.docFiles?.[doc];
  if (!f) return toast(`${doc} : document noté, sans fichier joint.`);
  const blob = await getBlob(f.fileId);
  if (!blob) return toast('Fichier introuvable : il a peut-être été déposé avant la mise en ligne du stockage.');
  await saveBlob(blob, f.name);
}
