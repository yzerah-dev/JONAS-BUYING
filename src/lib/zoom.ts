// Taille d'affichage choisie par l'utilisateur (sinon automatique selon la largeur de l'écran, voir index.css)
export type Zoom = 'auto' | '60' | '70' | '80' | '90' | '100';
export const ZOOMS: Zoom[] = ['auto', '60', '70', '80', '90', '100'];
const KEY = 'jonas-buying-zoom';

export function readZoom(): Zoom {
  try {
    const v = localStorage.getItem(KEY) as Zoom | null;
    return v && ZOOMS.includes(v) ? v : 'auto';
  } catch {
    return 'auto';
  }
}

export function applyZoom(z: Zoom) {
  if (z === 'auto') delete document.documentElement.dataset.zoom;
  else document.documentElement.dataset.zoom = z;
  try {
    if (z === 'auto') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, z);
  } catch {
    /* stockage indisponible : réglage valable pour la session */
  }
}
