import { useEffect, useState, type ReactNode } from 'react';
import { Box, Check, CheckCircle2, Circle, Clock, Code2, PenLine, Settings, Truck, type LucideIcon } from 'lucide-react';
import type { Brand, ContainerStatus, Product, ProformaStatus, Supplier, ValidationStep } from '../data/types';
import { VALIDATION_LABELS, VALIDATION_STEPS } from '../data/types';
import { CONTAINER_STATUS_LABEL, PROFORMA_STATUS_LABEL, packLate, packState, type PackState } from '../data/store';
import { fshort, initials } from '../lib/format';

export function Pill({ color, children, icon }: { color: string; children: ReactNode; icon?: ReactNode }) {
  return (
    <span className={`pill ${color}`}>
      {icon}
      {children}
    </span>
  );
}

export const PROFORMA_COLOR: Record<ProformaStatus, string> = {
  a_signer: 'red',
  en_dev: 'violet',
  en_production: 'orange',
  booke: 'blue',
  en_transit: 'yellow',
  arrive: 'green',
};
/** Icône et couleur de chaque statut (maquette JONAS) */
export const PROFORMA_ICON: Record<ProformaStatus, { icon: LucideIcon; color: string }> = {
  a_signer: { icon: PenLine, color: 'var(--red)' },
  en_dev: { icon: Code2, color: 'var(--violet)' },
  en_production: { icon: Settings, color: 'var(--orange)' },
  booke: { icon: Box, color: 'var(--blue)' },
  en_transit: { icon: Truck, color: 'var(--yellow)' },
  arrive: { icon: CheckCircle2, color: 'var(--ink-2)' },
};

export function ProformaStatusPill({ status, big }: { status: ProformaStatus; big?: boolean }) {
  const Icon = PROFORMA_ICON[status].icon;
  return (
    <span className={`pill ${PROFORMA_COLOR[status]} ${big ? 'pill-big' : ''}`}>
      <Icon size={big ? 17 : 13} />
      {PROFORMA_STATUS_LABEL[status]}
    </span>
  );
}

/** Monogramme fournisseur façon logo (lettre en dégradé), utilisé dans les listes */
export function SupplierMark({ supplier, size = 30 }: { supplier: Supplier; size?: number }) {
  if (supplier.mark === 'badge')
    return (
      <span className="supplier-badge" title={supplier.name} style={{ width: size, height: size, background: supplier.color, fontSize: size * 0.62 }}>
        {supplier.shortName[0]}
      </span>
    );
  return (
    <span
      className="supplier-mark"
      title={supplier.name}
      style={{ fontSize: size, backgroundImage: `linear-gradient(135deg, ${supplier.color}, ${supplier.color}88 55%, ${supplier.color})` }}
    >
      {supplier.shortName[0]}
    </span>
  );
}

export const CONTAINER_COLOR: Record<ContainerStatus, string> = {
  a_booker: 'orange',
  booking_demande: 'violet',
  booke: 'green',
  en_transit: 'blue',
  arrive: 'green',
};
export function ContainerStatusPill({ status }: { status: ContainerStatus }) {
  return <Pill color={CONTAINER_COLOR[status]}>{CONTAINER_STATUS_LABEL[status]}</Pill>;
}

const PACK_LABEL: Record<PackState, [string, string]> = {
  ok: ['OK', 'green'],
  en_cours: ['En cours', 'orange'],
  a_faire: ['À faire', 'red'],
};
export function PackPill({ product, prefix }: { product: Product; prefix?: boolean }) {
  const st = packState(product);
  const late = packLate(product);
  const [label, color] = PACK_LABEL[st];
  return (
    <Pill color={late ? 'red' : color} icon={st === 'ok' ? <Check size={13} /> : undefined}>
      {prefix ? 'État pack : ' : ''}
      {label}
      {late ? ' · en retard' : ''}
    </Pill>
  );
}

export function ProductThumb({ product, size = 44 }: { product: Product; size?: number }) {
  return (
    <div className="thumb" style={{ width: size, height: size, background: product.tint, fontSize: size * 0.6 }}>
      {product.emoji}
    </div>
  );
}

export function BrandLogo({ brand, size = 11 }: { brand: Brand; size?: number }) {
  return (
    <div className="brand-logo" style={{ fontSize: size }}>
      {brand.name}
      <small style={{ fontSize: size * 0.62 }}>{brand.tagline}</small>
    </div>
  );
}

export function SupplierLogo({ supplier, size = 44 }: { supplier: Supplier; size?: number }) {
  return (
    <div className="supplier-logo" style={{ width: size, height: size, background: supplier.color, fontSize: size * 0.36 }}>
      {initials(supplier.shortName)}
    </div>
  );
}

export function ValidationDot({ state }: { state: 'done' | 'pending' | 'todo' }) {
  return (
    <span className={`vdot ${state}`}>
      {state === 'done' ? <Check size={20} strokeWidth={3} /> : state === 'pending' ? <Clock size={20} /> : <Circle size={20} />}
    </span>
  );
}

export function ValidationCircuit({ product, compact }: { product: Product; compact?: boolean }) {
  const v = product.pack.validations;
  if (compact)
    return (
      <div className="row" style={{ gap: 4 }}>
        {VALIDATION_STEPS.map((s) => (
          <span key={s} title={VALIDATION_LABELS[s]}>
            <ValidationDot state={v[s].state} />
          </span>
        ))}
      </div>
    );
  return (
    <div className="stepper">
      {VALIDATION_STEPS.map((s: ValidationStep) => {
        const st = v[s].state;
        return (
          <div key={s} className={`step ${st === 'done' ? 'done' : st === 'pending' ? 'pending' : ''}`}>
            <div className="bullet">{st === 'done' ? <Check size={16} strokeWidth={3} /> : st === 'pending' ? <Clock size={15} /> : null}</div>
            <div className="lbl">{VALIDATION_LABELS[s]}</div>
            <div className={st === 'pending' ? 'orange xs' : 'muted xs'}>
              {st === 'done' ? fshort(v[s].date) : st === 'pending' ? 'En attente' : 'À venir'}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function Kpi({ icon, value, label, onClick, color }: { icon: ReactNode; value: ReactNode; label: ReactNode; onClick?: () => void; color?: string }) {
  return (
    <div className={`kpi ${onClick ? 'clickable' : ''}`} onClick={onClick}>
      <div className="kpi-icon" style={color ? { background: `var(--${color}-soft)`, color: `var(--${color})` } : undefined}>
        {icon}
      </div>
      <div>
        <div className="kpi-value">{value}</div>
        <div className="kpi-label">{label}</div>
      </div>
    </div>
  );
}

export function Progress({ value, warnAt = 2 }: { value: number; warnAt?: number }) {
  const cls = value > 1 ? 'over' : value >= warnAt ? 'warn' : '';
  return (
    <div className={`progress ${cls}`}>
      <div style={{ width: `${Math.min(100, value * 100)}%` }} />
    </div>
  );
}

export function Ring({ value, size = 90, stroke = 10, label }: { value: number; size?: number; stroke?: number; label?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--grey-soft)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="var(--green)"
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${c * Math.min(1, value)} ${c}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span style={{ fontSize: size * 0.2 }}>{label ?? `${Math.round(value * 100)} %`}</span>
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: ReactNode; icon?: ReactNode }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="tabs">
      {tabs.map((t) => (
        <button key={t.id} className={t.id === value ? 'active' : ''} onClick={() => onChange(t.id)}>
          {t.icon}
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Seg<T extends string>({ options, value, onChange }: { options: { id: T; label: ReactNode; icon?: ReactNode }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={o.id} className={o.id === value ? 'active' : ''} onClick={() => onChange(o.id)}>
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Petit système de notification
let pushToast: (m: string) => void = () => {};
export function toast(m: string) {
  pushToast(m);
}
export function Toaster() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    pushToast = (m) => {
      setMsg(m);
      clearTimeout(t);
      t = setTimeout(() => setMsg(null), 2600);
    };
  }, []);
  return msg ? <div className="toast">{msg}</div> : null;
}

/** Pictogramme conteneur de la maquette (rectangle à barres verticales) */
export function ContainerGlyph({ size = 18, strokeWidth = 1.8, className }: { size?: number; strokeWidth?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2.5" y="5.5" width="19" height="13" rx="2.5" fill="none" />
      <path d="M7 9v6M10.3 9v6M13.7 9v6M17 9v6" />
    </svg>
  );
}
