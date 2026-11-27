// Photo d'un produit réduite pour Claude (contrôle des textes, avis d'étiquetage)
import { getBlob } from './files';

/** Photo réduite à 640 px (JPEG) pour Claude : base64 + type, ou null */
export async function smallPhoto(fileId: string, maxSide = 640): Promise<{ data: string; type: string } | null> {
  try {
    const blob = await getBlob(fileId);
    if (!blob) return null;
    const bmp = await createImageBitmap(blob);
    const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(bmp.width * k));
    c.height = Math.max(1, Math.round(bmp.height * k));
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    const url = c.toDataURL('image/jpeg', 0.82);
    return { data: url.slice(url.indexOf(',') + 1), type: 'image/jpeg' };
  } catch {
    return null;
  }
}
