import type { ReactNode } from 'react';
import { Anchor, Ship, Truck } from 'lucide-react';
import {
  byId,
  CONTAINER_PAYLOAD,
  containerCapacity,
  containerCbm,
  containerEta,
  containerEtd,
  containerProformas,
  containerQty,
  containerWeight,
  type State,
} from '../data/store';
import type { Container } from '../data/types';
import { TODAY, dec, diffDays, fshort, num, weekLabel } from '../lib/format';
import { pressable } from '../lib/a11y';
import { Pill, ProductThumb, SupplierLogo } from './ui';

/** Couleur de pastille par compagnie maritime (repère visuel, pas un logo officiel) */
const CARRIER_COLOR: Record<string, string> = {
  MSC: '#1d2b4f',
  'CMA CGM': '#0b3f8f',
  Maersk: '#2d9cc9',
  COSCO: '#1f4e9c',
  'Hapag-Lloyd': '#e0661b',
};

export function CarrierBadge({ carrier }: { carrier?: string }) {
  if (!carrier)
    return (
      <span className="ct-carrier none">
        <Ship size={15} /> <span className="ct-lg">Compagnie à définir</span>
        <span className="ct-sm">À définir</span>
      </span>
    );
  return (
    <span className="ct-carrier" style={{ background: CARRIER_COLOR[carrier] ?? 'var(--ink-2)' }}>
      <Ship size={15} /> {carrier}
    </span>
  );
}

/** Transitaire : pastille sobre, distincte de la compagnie maritime */
export function ForwarderBadge({ forwarder }: { forwarder?: string }) {
  return (
    <span className={`ct-fwd ${forwarder ? '' : 'none'}`} title="Transitaire">
      <Truck size={14} /> {forwarder ?? 'Transitaire à définir'}
    </span>
  );
}

/** Produit principal (plus grosse quantité) et description courte du conteneur */
function containerHeadline(s: State, c: Container) {
  const byQty = [...c.allocations].sort((a, b) => b.qty - a.qty);
  const main = byQty[0] ? byId(s.products, byQty[0].productId) : undefined;
  const refs = new Set(c.allocations.map((a) => a.productId)).size;
  return { main, others: Math.max(0, refs - 1) };
}

export default function ContainerCard({ s, c, selected, onOpen, actions }: { s: State; c: Container; selected: boolean; onOpen: () => void; actions: ReactNode }) {
  const sup = byId(s.suppliers, c.supplierId);
  const { main, others } = containerHeadline(s, c);
  const cbm = containerCbm(s, c);
  const fill = cbm / containerCapacity(c);
  const weight = containerWeight(s, c);
  const eta = containerEta(c);
  const etd = containerEtd(c);
  const left = diffDays(eta, TODAY);
  const late = !!c.etaRevised && !c.etaReal;
  const ident = c.number ?? (c.bookingNo ? `Booking ${c.bookingNo}` : c.id);

  return (
    <article className={`ct-card ${selected ? 'selected' : ''} ${late ? 'late' : ''}`} {...pressable(onOpen, `Conteneur ${ident}`)}>
      <div className="ct-top">
        <div className="ct-hero">
          {main ? (
            <span className="ct-thumb">
              <ProductThumb product={main} size={64} />
              {others > 0 && <em>+{others}</em>}
            </span>
          ) : (
            <span className="ct-thumb empty">
              <Ship size={28} />
            </span>
          )}
          <div className="ct-title">
            <b>{main ? main.name : 'Conteneur vide'}</b>
            <small>
              {others > 0 ? `+ ${others} autre${others > 1 ? 's' : ''} réf. · ` : ''}
              {num(containerQty(c))} pcs · {containerProformas(c).join(', ') || '—'}
            </small>
            <span className="ct-id">
              {ident} · {c.type}
              {c.number && c.bookingNo ? ` · ${c.bookingNo}` : ''}
            </span>
            <span className="ct-flags">
              {c.planRequested && <Pill color="orange">Plan demandé</Pill>}
              {c.planProposed && <Pill color="violet">Plan fournisseur à valider</Pill>}
              {late && <Pill color="red">ETA révisée</Pill>}
            </span>
          </div>
        </div>
        <div className="ct-sup">
          <SupplierLogo supplier={sup} size={44} />
          <div>
            <b>{sup.shortName}</b>
            <small>
              {sup.flag} {sup.city}
            </small>
          </div>
        </div>
        <div className="ct-ship">
          <CarrierBadge carrier={c.carrier} />
          <ForwarderBadge forwarder={c.forwarder} />
        </div>
      </div>

      <div className="ct-bottom">
        <div className="ct-route">
          <div className="ct-leg">
            <small>Départ {c.portFrom}</small>
            <b>{fshort(etd)}</b>
            <span>
              {weekLabel(etd)}
              {c.etdReal ? ' · réel' : ' · prévu'}
            </span>
          </div>
          <div className="ct-line" aria-hidden="true">
            <span />
            <Ship size={16} />
            <span />
          </div>
          <div className={`ct-leg arrive ${late ? 'red' : ''}`}>
            <small>
              <Anchor size={12} /> Arrivée port · {c.portTo}
            </small>
            <b>{fshort(eta)}</b>
            <span>
              {weekLabel(eta)}
              {c.status === 'arrive' ? ' · arrivé' : left >= 0 ? ` · J-${left}` : ` · +${-left} j`}
              {late ? ` · prévue ${fshort(c.etaPlanned)}` : ''}
            </span>
          </div>
        </div>
        <div className="ct-fill">
          <b>
            {dec(cbm, 1)} m³ <small>{Math.round(fill * 100)} %</small>
          </b>
          <span className={`ct-bar ${fill > 1 ? 'over' : ''}`}>
            <span style={{ width: `${Math.min(100, fill * 100)}%` }} />
          </span>
          <small className={weight > CONTAINER_PAYLOAD[c.type] ? 'red' : ''}>{dec(weight / 1000, 1)} t</small>
        </div>
        <div className="ct-actions" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          {actions}
        </div>
      </div>
    </article>
  );
}
