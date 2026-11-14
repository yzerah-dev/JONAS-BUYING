// Données de démonstration — chiffres et fournisseurs illustratifs.
import type {
  User,
  Brand,
  Container,
  ContainerStatus,
  Pack,
  Product,
  Proforma,
  ProformaStatus,
  Supplier,
  Validation,
  ValidationStep,
} from './types';
import { CONTAINER_CAPACITY } from './types';
import { addDays } from '../lib/format';

// PRNG déterministe pour des données stables
let seed = 42;
const rnd = () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

export const SITES = ['Péronne', 'Meaux', 'Lillois'];

export const suppliers: Supplier[] = [
  { id: 'jinfa', name: 'Jinfa Shoes Co., Ltd.', shortName: 'Jinfa Shoes', country: 'Chine', flag: '🇨🇳', city: 'Wenzhou', port: 'Ningbo', color: '#e63946', active: true,
    contact: { name: 'Mr. Zhang Wei', role: 'Sales Manager', phone: '+86 138 0000 5678', email: 'zhang@jinfashoes.com', wechat: 'wxid_jinfashoes' } },
  { id: 'tide', name: 'Xiamen Tide Living', shortName: 'Tide Living', country: 'Chine', flag: '🇨🇳', city: 'Xiamen', port: 'Xiamen', color: '#1d6fd8', active: true,
    contact: { name: 'Mr. Chen', role: 'Export Manager', phone: '+86 138 0000 0000', email: 'chen@tideliving.com', wechat: 'wxid_tideliving' } },
  { id: 'nova', name: 'Shenzhen Nova Beauty', shortName: 'Nova Beauty', country: 'Chine', flag: '🇨🇳', city: 'Shenzhen', port: 'Yantian', color: '#f72585', active: true,
    contact: { name: 'Ms. Lin Yu', role: 'Account Manager', phone: '+86 139 1111 2222', email: 'lin@novabeauty.cn', wechat: 'wxid_novabeauty' } },
  { id: 'horizon', name: 'Ningbo Horizon Home', shortName: 'Horizon Home', country: 'Chine', flag: '🇨🇳', city: 'Ningbo', port: 'Ningbo', color: '#2a9d8f', active: true,
    contact: { name: 'Mr. Wang Lei', role: 'Sales Director', phone: '+86 137 3333 4444', email: 'wang@horizonhome.cn' } },
  { id: 'northbay', name: 'Qingdao Northbay', shortName: 'Northbay', country: 'Chine', flag: '🇨🇳', city: 'Qingdao', port: 'Qingdao', color: '#264de4', active: true,
    contact: { name: 'Ms. Zhao Min', role: 'Sales Manager', phone: '+86 136 5555 6666', email: 'zhao@northbay.cn' } },
  { id: 'wenzhoutex', name: 'Wenzhou Tex', shortName: 'Wenzhou Tex', country: 'Chine', flag: '🇨🇳', city: 'Wenzhou', port: 'Ningbo', color: '#c1121f', active: true,
    contact: { name: 'Mr. Li Qiang', role: 'Owner', phone: '+86 135 7777 8888', email: 'li@wenzhoutex.com' } },
  { id: 'yiwu', name: 'Yiwu Bag Co.', shortName: 'Yiwu Bag Co.', country: 'Chine', flag: '🇨🇳', city: 'Yiwu', port: 'Ningbo', color: '#e9a800', active: true,
    contact: { name: 'Ms. Huang Fang', role: 'Sales', phone: '+86 134 9999 0000', email: 'huang@yiwubag.com' } },
  { id: 'gzbeauty', name: 'Guangzhou Beauty', shortName: 'Guangzhou Beauty', country: 'Chine', flag: '🇨🇳', city: 'Guangzhou', port: 'Nansha', color: '#7b2cbf', active: true,
    contact: { name: 'Mr. Zhou Bin', role: 'Export Manager', phone: '+86 133 2222 1111', email: 'zhou@gzbeauty.cn' } },
  { id: 'seoul', name: 'Seoul Cosmetic', shortName: 'Seoul Cosmetic', country: 'Corée du Sud', flag: '🇰🇷', city: 'Séoul', port: 'Busan', color: '#0081a7', active: true,
    contact: { name: 'Ms. Park Ji-yeon', role: 'Overseas Sales', phone: '+82 10 1234 5678', email: 'park@seoulcosmetic.kr' } },
];

export const brands: Brand[] = [
  { id: 'camille', name: 'CAMILLE', tagline: 'PARIS' },
  { id: 'bellami', name: 'ALESSANDRO BELLAMI', tagline: 'PARIS' },
  { id: 'dorsey', name: 'YVES DORSEY', tagline: 'PARIS' },
  { id: 'ora', name: 'ORA+', tagline: 'SWITZERLAND' },
  { id: 'jardin', name: "JARDIN D'ORIENT", tagline: 'PARIS' },
  { id: 'jonas', name: 'JONAS', tagline: 'INTERNATIONAL' },
  { id: 'tropaya', name: 'TROPAYA', tagline: 'HONOLULU' },
  { id: 'perfumo', name: 'PERFUMÓ', tagline: 'PARIS' },
  { id: 'jbeauty', name: 'JONAS BEAUTY', tagline: 'SEOUL' },
];

type P = [ref: string, name: string, brand: string, supplier: string, rayon: string, emoji: string, tint: string,
  pa: number, pcb: number, cbmCarton: number, packType: string, designer: string, developed?: boolean];

const productDefs: P[] = [
  // Jinfa Shoes
  ['AB-M026', 'Mocassins été', 'bellami', 'jinfa', 'Chaussures', '👞', '#f3e3d3', 9.9, 24, 0.086, 'Boîte + papier de soie', 'Léa'],
  ['CP-C015', 'Claquettes paillettes', 'camille', 'jinfa', 'Chaussures', '🩴', '#fde2ec', 3.2, 36, 0.2, 'Carte + crochet', 'Léa'],
  ['CP-A001', 'Chapeau paille', 'camille', 'jinfa', 'Accessoires', '👒', '#f6ecd0', 4.5, 24, 0.138, 'Étiquette + boîte', 'Hugo'],
  ['AB-M030', 'Derby toile légère', 'bellami', 'jinfa', 'Chaussures', '👟', '#e4ecf7', 8.4, 12, 0.07, 'Boîte + papier', 'Léa', false],
  ['CP-S050', 'Sandale tressée', 'camille', 'jinfa', 'Chaussures', '👡', '#f8e5d6', 5.6, 24, 0.12, 'Boîte + étiquette', 'Hugo', false],
  ['YD-B012', 'Basket légère homme', 'dorsey', 'jinfa', 'Chaussures', '👟', '#e3f0ea', 11.2, 12, 0.09, 'Boîte', 'Sarah', false],
  // Xiamen Tide Living
  ['CP-T001', 'Tong femme paillettes', 'camille', 'tide', 'Chaussures', '🩴', '#ffd6e8', 2.9, 24, 0.09, 'Carte + crochet', 'Léa'],
  ['CP-C042', 'Claquettes EVA femme', 'camille', 'tide', 'Chaussures', '🩴', '#ffe5c7', 3.2, 24, 0.07, 'Carte + crochet', 'Léa'],
  ['YD-H008', 'Claquette homme bouclée', 'dorsey', 'tide', 'Chaussures', '👡', '#f2dcc8', 4.9, 12, 0.043, 'Bandeau + cintre', 'Sarah'],
  ['AB-M025', 'Mocassin été premium', 'bellami', 'tide', 'Chaussures', '👞', '#dfe6f2', 12.5, 12, 0.052, 'Boîte + papier', 'Léa'],
  ['ORA-C006', 'Sabot mixte ultra léger', 'ora', 'tide', 'Chaussures', '🥿', '#ffe3cc', 4.2, 24, 0.096, 'Hangtag + étiquette', 'Hugo'],
  ['CP-E021', 'Éventail XXL à paillettes', 'camille', 'tide', 'Accessoires', '🪭', '#ffd9ea', 1.9, 48, 0.028, 'Carte + blister', 'Hugo'],
  ['JO-P100', 'Eau de parfum 100 ml', 'jardin', 'tide', 'Parfumerie', '🧴', '#fbe1e6', 2.95, 12, 0.012, 'Étui + coffret', 'Sarah'],
  ['JO-T035', 'Serviettes microfibre 35×75', 'jonas', 'tide', 'Maison', '🧻', '#ffe0ef', 3.5, 12, 0.018, 'Bandeau', 'Hugo'],
  // Shenzhen Nova Beauty
  ['CP-B110', 'Brume corps vanille', 'camille', 'nova', 'Beauté', '🧴', '#fff0d9', 1.6, 48, 0.035, 'Étui', 'Sarah'],
  ['CP-B112', 'Brume corps coco', 'camille', 'nova', 'Beauté', '🥥', '#f3efe6', 1.6, 48, 0.035, 'Étui', 'Sarah'],
  ['PF-P014', 'Collection parfum', 'perfumo', 'nova', 'Parfumerie', '💐', '#f8dcef', 3.8, 24, 0.04, 'Étui + coffret', 'Sarah'],
  // Ningbo Horizon Home
  ['JO-J201', 'Salon de jardin 4 pièces', 'jonas', 'horizon', 'Jardin', '🪑', '#e2efe2', 48, 1, 0.42, 'Carton imprimé', 'Hugo'],
  ['JO-J205', 'Transat pliable', 'jonas', 'horizon', 'Jardin', '🏖️', '#e6f4f1', 14.5, 2, 0.11, 'Carton imprimé', 'Hugo'],
  ['JO-J210', 'Parasol 3 m inclinable', 'jonas', 'horizon', 'Jardin', '⛱️', '#fff4d6', 11.9, 4, 0.09, 'Housse + étiquette', 'Hugo'],
  // Qingdao Northbay
  ['JO-R301', 'Boîte de rangement 30 L', 'jonas', 'northbay', 'Maison', '📦', '#ecebf8', 2.1, 12, 0.11, 'Étiquette', 'Hugo'],
  ['JO-R305', 'Panier tissé', 'jonas', 'northbay', 'Maison', '🧺', '#f5ead9', 3.4, 12, 0.13, 'Hangtag', 'Hugo'],
  ['JO-R310', 'Étagère bambou 4 niveaux', 'jonas', 'northbay', 'Maison', '🪵', '#efe3cf', 9.8, 2, 0.06, 'Carton imprimé', 'Hugo'],
  // Wenzhou Tex
  ['CP-PL03', 'Plateforme', 'camille', 'wenzhoutex', 'Chaussures', '👡', '#f5e1cf', 6.4, 12, 0.07, 'Boîte + étiquette', 'Léa'],
  ['YD-C003', 'Claquettes homme', 'dorsey', 'wenzhoutex', 'Chaussures', '🩴', '#dde3ec', 3.6, 24, 0.09, 'Bandeau + cintre', 'Sarah'],
  ['JO-T040', 'Drap de plage XXL', 'jonas', 'wenzhoutex', 'Maison', '🏝️', '#d9f0f4', 4.2, 24, 0.09, 'Bandeau', 'Hugo'],
  // Yiwu Bag Co.
  ['TR-B002', 'Sac de plage', 'tropaya', 'yiwu', 'Bagagerie', '👜', '#fbecc9', 3.9, 24, 0.12, 'Hangtag + étiquette', 'Hugo'],
  ['TR-T001', 'Tongs îles', 'tropaya', 'yiwu', 'Chaussures', '🩴', '#ffe0d6', 1.4, 48, 0.12, 'Carte + crochet', 'Léa'],
  ['CP-EV01', 'Éventail pailleté', 'camille', 'yiwu', 'Accessoires', '🪭', '#ffe1f0', 1.5, 48, 0.03, 'Carte + blister', 'Hugo'],
  // Guangzhou Beauty
  ['PF-P020', 'Coffret parfum duo', 'perfumo', 'gzbeauty', 'Parfumerie', '🎁', '#f3e2f6', 4.6, 12, 0.03, 'Coffret rigide', 'Sarah'],
  ['JB-T010', 'Trousse maquillage', 'jbeauty', 'gzbeauty', 'Beauté', '💄', '#fde4e4', 2.2, 48, 0.07, 'Hangtag', 'Sarah'],
  // Seoul Cosmetic
  ['JB-K001', 'K-Beauty coffret', 'jbeauty', 'seoul', 'Beauté', '🎀', '#fde3ea', 5.9, 24, 0.06, 'Coffret rigide', 'Sarah'],
  ['JB-K005', 'Masques tissu ×10', 'jbeauty', 'seoul', 'Beauté', '🧖', '#e2f1f8', 2.4, 48, 0.04, 'Étui', 'Sarah', false],
];

function ean(i: number) {
  return `370157${String(1465900 + i * 37).padStart(7, '0')}`;
}

function validations(level: number, base: string): Record<ValidationStep, Validation> {
  const steps: ValidationStep[] = ['david', 'direction', 'moinard', 'fournisseur'];
  const out = {} as Record<ValidationStep, Validation>;
  steps.forEach((s, i) => {
    if (i < level) out[s] = { state: 'done', date: addDays(base, i) };
    else if (i === level) out[s] = { state: 'pending' };
    else out[s] = { state: 'todo' };
  });
  return out;
}

// Échéances artwork réparties sur les semaines à venir
const deadlines = ['2026-11-13', '2026-11-20', '2026-11-27', '2026-11-27', '2026-12-04', '2026-12-11', '2026-12-18', '2027-01-08'];

export const products: Product[] = productDefs.map((d, i) => {
  const [ref, name, brandId, supplierId, rayon, emoji, tint, pa, pcb, cbmCarton, packType, designer, developed = true] = d;
  const level = developed ? [4, 4, 3, 2, 4, 1, 3, 0, 4, 2][i % 10] : 0;
  const deadline = deadlines[i % deadlines.length];
  const pack: Pack = {
    type: packType,
    designer,
    artworkDeadline: deadline,
    validations: validations(level, addDays(deadline, -10)),
    dieCut: level >= 2 ? 'received' : level === 1 ? 'requested' : 'none',
    artworkVersions: Math.max(1, level),
    sentToSupplier: level >= 4,
  };
  const stage = developed ? 6 : [1, 2, 3, 0][i % 4];
  return {
    id: ref,
    ref,
    ean: ean(i),
    name,
    brandId,
    supplierId,
    rayon,
    collection: rayon === 'Jardin' || rayon === 'Chaussures' ? 'Été 2027' : 'Permanent',
    gender: /homme/i.test(name) ? 'Homme' : /femme/i.test(name) ? 'Femme' : 'Mixte',
    material: rayon === 'Chaussures' ? (pa > 8 ? 'Suédine' : 'EVA') : rayon === 'Maison' ? 'Polyester' : 'Divers',
    sizes: rayon === 'Chaussures' ? (/homme/i.test(name) ? '40 – 46' : '36 – 41') : undefined,
    emoji,
    tint,
    pa,
    pcb,
    cbmCarton,
    weight: Math.round((0.2 + rnd() * 0.8) * 100) / 100,
    developed,
    devStage: stage,
    devDeadline: addDays('2026-11-20', i * 5),
    nextAction: developed ? 'Réassort à planifier' : ['Valider le brief', 'Recevoir l’échantillon', 'Valider l’échantillon', 'Négocier le prix'][i % 4],
    targetQty: developed ? 0 : 6000 + (i % 3) * 3000,
    pack,
    stock: { Péronne: 0, Meaux: 0, Lillois: 0 },
  };
});

const pid = (ref: string) => ref;

// ---- Proformas -------------------------------------------------------------

type PFDef = [id: string, supplier: string, status: ProformaStatus, date: string, etd: string, transitDays: number,
  lines: [string, number][], depositPct: number, depositPaid: boolean];

const pfDefs: PFDef[] = [
  ['PF-2026-0118', 'jinfa', 'arrive', '2026-08-12', '2026-09-28', 35, [['AB-M026', 12000], ['CP-C015', 7200]], 30, true],
  ['PF-2026-0121', 'wenzhoutex', 'arrive', '2026-08-20', '2026-10-05', 33, [['YD-C003', 9600], ['JO-T040', 7200]], 30, true],
  ['PF-2026-0127', 'gzbeauty', 'en_transit', '2026-09-02', '2026-10-19', 38, [['PF-P020', 14400], ['JB-T010', 9600]], 30, true],
  ['PF-2026-0130', 'jinfa', 'en_transit', '2026-09-10', '2026-10-30', 35, [['AB-M026', 12000], ['CP-A001', 4800], ['CP-C015', 3600]], 30, true],
  ['PF-2026-0132', 'yiwu', 'en_transit', '2026-09-15', '2026-11-06', 34, [['TR-B002', 6000], ['TR-T001', 9600], ['CP-EV01', 9600]], 30, true],
  ['PF-2026-0137', 'tide', 'booke', '2026-09-28', '2026-11-23', 34, [['CP-T001', 4800], ['CP-C042', 2400], ['YD-H008', 1440], ['AB-M025', 720], ['ORA-C006', 1200], ['CP-E021', 960], ['JO-P100', 2880], ['JO-T035', 3200]], 30, true],
  ['PF-2026-0140', 'seoul', 'en_production', '2026-10-01', '2026-12-09', 36, [['JB-K001', 9600]], 30, true],
  ['PF-2026-0145', 'northbay', 'en_production', '2026-10-05', '2026-12-02', 33, [['JO-R301', 7200], ['JO-R305', 4800], ['JO-R310', 1400]], 30, true],
  ['PF-2026-0146', 'nova', 'a_signer', '2026-11-03', '2026-12-02', 36, [['CP-B110', 24000], ['CP-B112', 19200], ['PF-P014', 9600]], 20, false],
  ['PF-2026-0148', 'horizon', 'en_dev', '2026-10-21', '2026-12-04', 32, [['JO-J201', 240], ['JO-J205', 800], ['JO-J210', 2400]], 20, true],
  ['PF-2026-0150', 'wenzhoutex', 'en_dev', '2026-10-27', '2026-12-16', 33, [['CP-PL03', 9600], ['YD-C003', 7200]], 30, true],
  ['PF-2026-0152', 'jinfa', 'a_signer', '2026-11-09', '2026-12-23', 35, [['AB-M026', 12000], ['CP-C015', 7200]], 30, false],
  ['PF-2026-0155', 'yiwu', 'a_signer', '2026-11-12', '2026-12-30', 34, [['TR-B002', 4800], ['CP-EV01', 9600]], 30, false],
  ['PF-2026-0156', 'tide', 'en_production', '2026-10-14', '2026-12-11', 34, [['ORA-C006', 6000], ['CP-C042', 9600], ['CP-T001', 9600]], 30, true],
  ['PF-2027-0003', 'jinfa', 'en_dev', '2026-11-10', '2027-01-06', 35, [['AB-M026', 12000], ['CP-A001', 4800]], 30, false],
];

const docsFor = (st: ProformaStatus) => {
  const base = ['Proforma signée.pdf', 'Conditions d’achat.pdf'];
  if (st === 'a_signer') return ['Proforma.pdf'];
  if (['booke', 'en_transit', 'arrive'].includes(st)) base.push('Plan de chargement.xlsx', 'Booking confirmation.pdf');
  if (['en_transit', 'arrive'].includes(st)) base.push('BL.pdf', 'Commercial Invoice.pdf', 'Packing List.xlsx');
  return base;
};

export const proformas: Proforma[] = pfDefs.map((d, i) => {
  const [id, supplierId, status, date, etd, transit, lines, depositPct, depositPaid] = d;
  const eta = addDays(etd, transit);
  const history = [{ date, user: 'Yzerah', text: 'Proforma créée' }];
  if (status !== 'a_signer') history.push({ date: addDays(date, 2), user: 'Direction', text: 'Proforma signée' });
  if (depositPaid) history.push({ date: addDays(date, 6), user: 'Finance', text: `Acompte ${depositPct} % versé` });
  if (['booke', 'en_transit', 'arrive'].includes(status)) history.push({ date: addDays(etd, -14), user: 'Logistique', text: 'Booking confirmé' });
  return {
    id,
    supplierId,
    poNumber: `PO-JONAS-${26800 + i * 13}`,
    date,
    status,
    etd,
    eta,
    lines: lines.map(([ref, qty]) => {
      const p = products.find((x) => x.id === pid(ref))!;
      return { productId: p.id, qty, price: p.pa };
    }),
    depositPct,
    depositPaid,
    balancePaid: status === 'arrive',
    balanceDue: addDays(etd, 7),
    documents: docsFor(status),
    history,
  };
});

// ---- Conteneurs -------------------------------------------------------------

const carriers: [string, string][] = [['MSC', 'MSCU'], ['CMA CGM', 'CMAU'], ['Maersk', 'TGHU'], ['COSCO', 'TCLU'], ['Hapag-Lloyd', 'CAIU']];

const lineCbm = (productId: string, qty: number) => {
  const p = products.find((x) => x.id === productId)!;
  return (qty / p.pcb) * p.cbmCarton;
};

let containerSeq = 30;
let bookingSeq = 98740;

function buildContainers(pf: Proforma, coverage: number, status: ContainerStatus): Container[] {
  const cap = CONTAINER_CAPACITY['40HC'] * 0.94;
  const out: Container[] = [];
  let current: Container | null = null;
  const supplier = suppliers.find((s) => s.id === pf.supplierId)!;
  const newContainer = (): Container => {
    const [carrier, prefix] = carriers[containerSeq % carriers.length];
    containerSeq++;
    const booked = status === 'booke' || status === 'en_transit' || status === 'arrive';
    const c: Container = {
      id: `PLAN-${String(containerSeq).padStart(3, '0')}`,
      number: booked ? `${prefix}${Math.floor(1000000 + rnd() * 8999999)}` : undefined,
      bookingNo: booked || status === 'booking_demande' ? `BK-${bookingSeq++}` : undefined,
      seal: booked ? `SL${Math.floor(100000 + rnd() * 899999)}` : undefined,
      type: '40HC',
      status,
      supplierId: pf.supplierId,
      carrier: booked || status === 'booking_demande' ? carrier : undefined,
      portFrom: supplier.port,
      portTo: 'Le Havre',
      etdPlanned: pf.etd,
      etaPlanned: pf.eta,
      warehouse: 'Péronne',
      planValidated: status !== 'a_booker',
      allocations: [],
      documents: [],
      dateHistory: [{ date: pf.date, user: 'Système', text: `ETD prévue ${pf.etd} – ETA prévue ${pf.eta}` }],
    };
    if (status === 'en_transit' || status === 'arrive') {
      c.etdReal = addDays(pf.etd, Math.floor(rnd() * 3));
      c.documents = ['BL.pdf', 'Invoice.pdf', 'Packing List.xlsx'];
    } else if (status === 'booke') {
      c.documents = ['Booking confirmation.pdf'];
    }
    if (status === 'arrive') {
      c.etaReal = addDays(pf.eta, 1);
      c.receivedOn = addDays(pf.eta, 2);
    }
    out.push(c);
    return c;
  };
  for (const line of pf.lines) {
    const p = products.find((x) => x.id === line.productId)!;
    let remaining = Math.floor((line.qty * coverage) / p.pcb) * p.pcb;
    while (remaining > 0) {
      if (!current) current = newContainer();
      const used = current.allocations.reduce((s, a) => s + lineCbm(a.productId, a.qty), 0);
      const freeCartons = Math.floor((cap - used) / p.cbmCarton);
      if (freeCartons <= 0) {
        current = null;
        continue;
      }
      const qty = Math.min(remaining, freeCartons * p.pcb);
      current.allocations.push({ proformaId: pf.id, productId: p.id, qty });
      remaining -= qty;
    }
  }
  return out;
}

const containerPlan: [string, number, ContainerStatus][] = [
  ['PF-2026-0118', 1, 'arrive'],
  ['PF-2026-0121', 1, 'arrive'],
  ['PF-2026-0127', 1, 'en_transit'],
  ['PF-2026-0130', 1, 'en_transit'],
  ['PF-2026-0132', 1, 'en_transit'],
  ['PF-2026-0137', 1, 'booke'],
  ['PF-2026-0145', 1, 'booking_demande'],
  ['PF-2026-0140', 1, 'a_booker'],
  ['PF-2026-0156', 0.8, 'a_booker'],
];

export const containers: Container[] = containerPlan.flatMap(([pfId, cov, st]) =>
  buildContainers(proformas.find((p) => p.id === pfId)!, cov, st),
);

// Un retard réaliste : ETA révisée sur un conteneur en transit (historisée)
{
  const late = containers.find((c) => c.status === 'en_transit' && c.supplierId === 'jinfa');
  if (late) {
    late.etaRevised = addDays(late.etaPlanned, 4);
    late.dateHistory.push({ date: '2026-11-10', user: 'MSC', text: `ETA révisée : ${late.etaPlanned} → ${late.etaRevised}` });
  }
}

// Stock : alimenté par les conteneurs réceptionnés
for (const c of containers.filter((x) => x.status === 'arrive')) {
  for (const a of c.allocations) {
    const p = products.find((x) => x.id === a.productId)!;
    p.stock[c.warehouse] += Math.round(a.qty * 0.6); // une partie déjà vendue
  }
}
products.find((p) => p.id === 'AB-M026')!.stock.Meaux = 1800;

// ---- Utilisateurs (démo) ------------------------------------------------------
// Équipe JONAS + un compte portail par fournisseur.
export const users: User[] = [
  { id: 'yzerah', name: 'Yzerah', email: 'yzerah@jonas.example', role: 'pilote', title: 'Pilote achats', active: true },
  { id: 'david', name: 'David', email: 'david@jonas.example', role: 'acheteur', title: 'Chef de produit', validationStep: 'david', active: true },
  { id: 'direction', name: 'Direction', email: 'direction@jonas.example', role: 'direction', title: 'Direction générale', validationStep: 'direction', active: true },
  { id: 'moinard', name: 'Moinard', email: 'moinard@jonas.example', role: 'validateur', title: 'Validation pack', validationStep: 'moinard', active: true },
  { id: 'lea', name: 'Léa', email: 'lea@jonas.example', role: 'designer', title: 'Designer packaging', designerName: 'Léa', active: true },
  { id: 'sarah', name: 'Sarah', email: 'sarah@jonas.example', role: 'designer', title: 'Designer packaging', designerName: 'Sarah', active: true },
  { id: 'hugo', name: 'Hugo', email: 'hugo@jonas.example', role: 'designer', title: 'Designer packaging', designerName: 'Hugo', active: true },
  { id: 'finance', name: 'Finance', email: 'finance@jonas.example', role: 'finance', title: 'Comptabilité fournisseurs', active: true },
  { id: 'logistique', name: 'Logistique', email: 'logistique@jonas.example', role: 'logistique', title: 'Transport & réception', active: true },
  ...suppliers.map<User>((s) => ({
    id: `sup-${s.id}`,
    name: s.contact.name,
    email: s.contact.email,
    role: 'fournisseur',
    title: `${s.contact.role} · ${s.shortName}`,
    supplierId: s.id,
    active: true,
  })),
];

// Un plan de chargement demandé au fournisseur pour la démo du portail
{
  const c = containers.find((x) => x.status === 'a_booker' && x.supplierId === 'tide');
  if (c) c.planRequested = true;
}
