// Constantes et utilitaires d'interface partagés (sans composant React)
import type { LucideIcon } from 'lucide-react';
import { Box, CheckCircle2, Code2, PenLine, Settings, Truck } from 'lucide-react';
import type { ContainerStatus, ProformaStatus } from '../data/types';

export const PROFORMA_COLOR: Record<ProformaStatus, string> = {
  a_signer: 'red',
  en_dev: 'violet',
  en_production: 'orange',
  booke: 'blue',
  en_transit: 'yellow',
  arrive: 'green',
};
/** Icône et couleur
/** Icône et couleur de chaque statut (maquette JONAS) */
export const PROFORMA_ICON: Record<ProformaStatus, { icon: LucideIcon; color: string }> = {
  a_signer: { icon: PenLine, color: 'var(--red)' },
  en_dev: { icon: Code2, color: 'var(--violet)' },
  en_production: { icon: Settings, color: 'var(--orange)' },
  booke: { icon: Box, color: 'var(--blue)' },
  en_transit: { icon: Truck, color: 'var(--yellow)' },
  arrive: { icon: CheckCircle2, color: 'var(--ink-2)' },
};

export const CONTAINER_COLOR: Record<ContainerStatus, string> = {
  a_booker: 'orange',
  booking_demande: 'violet',
  booke: 'green',
  en_transit: 'blue',
  arrive: 'green',
};

/** Couleur fixe par designer (identique sur tous les écrans) */
const DESIGNER_FIXED: Record<string, string> = { Léa: '#d6336c', Sarah: '#7048e8', Hugo: '#1c7ed6' };
const DESIGNER_PALETTE = ['#e8590c', '#0ca678', '#ae3ec9', '#f08c00', '#1098ad'];
export function designerColor(name: string): string {
  if (DESIGNER_FIXED[name]) return DESIGNER_FIXED[name];
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return DESIGNER_PALETTE[h % DESIGNER_PALETTE.length];
}

// Messages éphémères (toasts) : toast() émet, le composant Toaster affiche
type ToastListener = (m: string) => void;
let listener: ToastListener = () => {};
export function toast(m: string) {
  listener(m);
}
export function onToast(fn: ToastListener) {
  listener = fn;
  return () => {
    if (listener === fn) listener = () => {};
  };
}

/** Volume utile d'un 40HC pour estimer le nombre de containers */
export const CBM_40HC = 68;
export const estimateContainers = (cbm: number) => Math.max(1, Math.ceil(cbm / CBM_40HC));
