// Plan de chargement d'un conteneur en Excel : en-tête (conteneur, fournisseur, dates) puis une ligne par produit, avec totaux.
import { byId, containerCapacity, containerCbm, containerEta, containerEtd, containerQty, type State } from '../data/store';
import type { Container } from '../data/types';
import { weekLabel } from './format';

export const loadingPlanFileName = (c: Container) => `Plan de chargement ${c.number ?? c.id}.xlsx`;

export async function loadingPlanXlsx(s: State, c: Container): Promise<Blob> {
  const XLSX = await import('xlsx');
  const sup = byId(s.suppliers, c.supplierId);
  const cbm = containerCbm(s, c);
  const head: (string | number)[][] = [
    ['JONAS INTERNATIONAL – PLAN DE CHARGEMENT / LOADING PLAN'],
    [],
    ['Conteneur / Container', c.number ?? c.id, '', 'Type', c.type],
    ['Fournisseur / Supplier', sup.name, '', 'Booking', c.bookingNo ?? '—'],
    ['Chargement / Loading (ETD)', `${containerEtd(c)} (${weekLabel(containerEtd(c))})`, '', 'Arrivée / ETA', `${containerEta(c)} (${weekLabel(containerEta(c))})`],
    ['Port départ / From', c.portFrom ?? '', '', 'Port arrivée / To', c.portTo ?? ''],
    ['Transitaire / Forwarder', c.forwarder ?? '—', '', 'Remplissage / Fill', `${Math.round((cbm / containerCapacity(c)) * 100)} %`],
    [],
    [
      'Réf. JONAS',
      'Réf. fournisseur / Supplier ref',
      'EAN',
      'Désignation / Description',
      'Proforma',
      'Colisage / PCS per CTN',
      'Quantité / QTY (pcs)',
      'Cartons / CTNS',
      'm³ / carton',
      'CBM total',
      'Poids brut / G.W. (kg)',
    ],
  ];
  const rows = c.allocations.map((a) => {
    const p = byId(s.products, a.productId);
    const ctns = p.pcb ? a.qty / p.pcb : 0;
    return [
      p.ref,
      p.supplierRef ?? '',
      p.ean ?? '',
      p.description?.en || p.name,
      a.proformaId,
      p.pcb,
      a.qty,
      Math.round(ctns * 100) / 100,
      p.cbmCarton,
      Math.round(ctns * p.cbmCarton * 1000) / 1000,
      Math.round(a.qty * (p.weight ?? 0) * 10) / 10,
    ];
  });
  const totCtn = rows.reduce((t, r) => t + Number(r[7]), 0);
  const totKg = rows.reduce((t, r) => t + Number(r[10]), 0);
  const total = ['TOTAL', '', '', '', '', '', containerQty(c), Math.round(totCtn * 100) / 100, '', Math.round(cbm * 1000) / 1000, Math.round(totKg * 10) / 10];
  const ws = XLSX.utils.aoa_to_sheet([...head, ...rows, total, [], [`Capacité / Capacity : ${containerCapacity(c)} m³`]]);
  ws['!cols'] = [{ wch: 14 }, { wch: 18 }, { wch: 15 }, { wch: 46 }, { wch: 15 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 11 }, { wch: 11 }, { wch: 14 }];
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Plan de chargement');
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
