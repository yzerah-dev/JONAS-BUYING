// Données de démonstration — chiffres et fournisseurs illustratifs.
import type {
  ProformaDoc,
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
  { id: 'horizon', name: 'Ningbo Horizon Home', shortName: 'Horizon Home', country: 'Chine', flag: '🇨🇳', city: 'Ningbo', port: 'Ningbo', color: '#1a9a3e', mark: 'badge', active: true,
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
  // Produits à développer (répartis entre les designers)
  ['CP-S055', 'Sandale corde femme', 'camille', 'jinfa', 'Chaussures', '👡', '#f6e7d4', 5.9, 24, 0.12, 'Boîte + étiquette', 'Léa', false],
  ['CP-T010', 'Tong strass', 'camille', 'tide', 'Chaussures', '🩴', '#fde1ef', 2.4, 48, 0.12, 'Carte + crochet', 'Léa', false],
  ['AB-M040', 'Mocassin cuir velours', 'bellami', 'jinfa', 'Chaussures', '👞', '#e9ddd0', 13.9, 12, 0.06, 'Boîte + papier de soie', 'Léa', false],
  ['YD-S020', 'Sneaker toile homme', 'dorsey', 'wenzhoutex', 'Chaussures', '👟', '#e1e8f0', 7.8, 12, 0.08, 'Boîte', 'Sarah', false],
  ['PF-P030', 'Eau de toilette agrumes', 'perfumo', 'nova', 'Parfumerie', '🍋', '#fff5cc', 3.2, 24, 0.035, 'Étui + coffret', 'Sarah', false],
  ['JB-K010', 'Patchs yeux hydrogel', 'jbeauty', 'seoul', 'Beauté', '👁️', '#e5f3fb', 1.9, 48, 0.03, 'Étui', 'Sarah', false],
  ['JO-J220', 'Hamac XXL', 'jonas', 'horizon', 'Jardin', '🏝️', '#e3f2e5', 16.5, 4, 0.08, 'Housse + étiquette', 'Hugo', false],
  ['JO-R320', 'Paniers jacinthe ×3', 'jonas', 'northbay', 'Maison', '🧺', '#f1e6d2', 8.9, 4, 0.12, 'Hangtag', 'Hugo', false],
  ['TR-B010', 'Cabas paille', 'tropaya', 'yiwu', 'Bagagerie', '👜', '#f7ebcf', 4.6, 24, 0.14, 'Hangtag + étiquette', 'Hugo', false],
  ['JO-T050', 'Fouta rayée', 'jonas', 'wenzhoutex', 'Maison', '🧣', '#dff0f3', 3.8, 24, 0.07, 'Bandeau', 'Hugo', false],
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

// Échéances de développement (et urgences) des produits à développer
const DEV: Record<string, [deadline: string, urgent: boolean]> = {
  'AB-M030': ['2026-11-12', true],
  'YD-S020': ['2026-11-10', false],
  'CP-S055': ['2026-11-18', false],
  'CP-S050': ['2026-11-19', false],
  'JB-K010': ['2026-11-20', true],
  'CP-T010': ['2026-11-25', false],
  'YD-B012': ['2026-11-26', true],
  'JO-J220': ['2026-11-27', false],
  'JO-R320': ['2026-12-02', false],
  'JB-K005': ['2026-12-03', false],
  'AB-M040': ['2026-12-09', false],
  'TR-B010': ['2026-12-10', false],
  'PF-P030': ['2026-12-16', false],
  'JO-T050': ['2027-01-06', false],
};

// Niveaux de validation pack imposés pour la démo (proformas de la semaine 49)
const PACK_LEVEL: Record<string, number> = {
  'CP-B110': 1, // Brumes corps : 0/1
  'JO-J201': 2, // Mobilier jardin : 0/2
  'JO-J205': 0,
  'JO-R301': 4, // Rangement maison : OK
  'JO-R305': 4,
  'JO-R310': 4,
};

export const products: Product[] = productDefs.map((d, i) => {
  const [ref, name, brandId, supplierId, rayon, emoji, tint, pa, pcb, cbmCarton, packType, designer, developed = true] = d;
  const level = PACK_LEVEL[ref] ?? (developed ? [4, 4, 3, 2, 4, 1, 3, 0, 4, 2][i % 10] : 0);
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
    devDeadline: DEV[ref]?.[0] ?? addDays('2026-11-20', i * 5),
    urgent: DEV[ref]?.[1] ?? false,
    nextAction: developed ? 'Réassort à planifier' : ['Valider le brief', 'Recevoir l’échantillon', 'Valider l’échantillon', 'Négocier le prix'][i % 4],
    targetQty: developed ? 0 : 6000 + (i % 3) * 3000,
    pack,
    stock: { Péronne: 0, Meaux: 0, Lillois: 0 },
  };
});

// ---- Volume réaliste : ~40 packs par designer et par semaine ------------------
// Produits de collection générés (photo = pictogramme), répartis entre Léa, Sarah et Hugo.
const GEN_WEEKS = ['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30', '2026-12-07'];
const GEN_DESIGNERS = ['Léa', 'Sarah', 'Hugo'];
type Family = { rayon: string; items: [string, string][]; variants: string[]; suppliers: string[]; brands: [string, string][]; packs: string[]; tints: string[] };
const FAMILIES: Family[] = [
  {
    rayon: 'Chaussures',
    items: [['Tong', '🩴'], ['Claquette', '🩴'], ['Sandale', '👡'], ['Mule', '🥿'], ['Espadrille', '👟'], ['Mocassin', '👞'], ['Basket', '👟'], ['Sabot', '🥿']],
    variants: ['paillettes', 'tressée', 'EVA', 'palmier', 'bicolore', 'dorée', 'léopard', 'corde', 'pastel', 'strass', 'raphia', 'perlée'],
    suppliers: ['jinfa', 'tide', 'wenzhoutex'],
    brands: [['camille', 'CP'], ['bellami', 'AB'], ['dorsey', 'YD'], ['ora', 'ORA']],
    packs: ['Carte + crochet', 'Boîte + étiquette', 'Bandeau + cintre', 'Boîte + papier de soie'],
    tints: ['#ffe3ec', '#fde9d6', '#e6eef8', '#fff1d6', '#e9f5ee'],
  },
  {
    rayon: 'Beauté',
    items: [['Brume', '🧴'], ['Gel douche', '🧴'], ['Crème mains', '🧴'], ['Eau de toilette', '💐'], ['Coffret', '🎁'], ['Baume lèvres', '💄']],
    variants: ['coco', 'vanille', 'fleur d’oranger', 'monoï', 'agrumes', 'fruits rouges', 'musc blanc', 'figue', 'pêche'],
    suppliers: ['nova', 'gzbeauty', 'seoul'],
    brands: [['perfumo', 'PF'], ['jbeauty', 'JB'], ['camille', 'CP'], ['jardin', 'JD']],
    packs: ['Étui', 'Étui + coffret', 'Coffret rigide', 'Hangtag'],
    tints: ['#fdf0d9', '#f6e3f6', '#e5f3fb', '#fde4e4'],
  },
  {
    rayon: 'Maison',
    items: [['Panier', '🧺'], ['Coussin', '🛋️'], ['Bougie', '🕯️'], ['Plaid', '🧣'], ['Lanterne', '🏮'], ['Pot', '🪴'], ['Fouta', '🏖️'], ['Serviette', '🧻']],
    variants: ['rayé', 'jacinthe', 'bambou', 'terracotta', 'lin', 'bohème', 'marin', 'sable', 'olive'],
    suppliers: ['northbay', 'horizon', 'wenzhoutex'],
    brands: [['jonas', 'JO']],
    packs: ['Étiquette', 'Hangtag', 'Carton imprimé', 'Bandeau'],
    tints: ['#efe6d6', '#e3f2e5', '#e6f0f5', '#f6ecd8'],
  },
  {
    rayon: 'Accessoires',
    items: [['Cabas', '👜'], ['Chapeau', '👒'], ['Éventail', '🪭'], ['Trousse', '👝'], ['Pochette', '👛'], ['Lunettes', '🕶️']],
    variants: ['paille', 'raphia', 'paillettes', 'imprimé', 'perles', 'tie & dye', 'crochet', 'velours'],
    suppliers: ['yiwu', 'tide'],
    brands: [['tropaya', 'TR'], ['camille', 'CP']],
    packs: ['Hangtag + étiquette', 'Carte + blister', 'Étiquette + boîte'],
    tints: ['#fbecc9', '#ffe1f0', '#f2ecdf'],
  },
];
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const minDate = (a: string, b: string) => (a < b ? a : b);
const minDateMax = (a: string, floor: string) => (a > floor ? a : floor);
const notStarted = (): Record<ValidationStep, Validation> => ({ david: { state: 'todo' }, direction: { state: 'todo' }, moinard: { state: 'todo' }, fournisseur: { state: 'todo' } });

let genSeq = 200;
GEN_WEEKS.forEach((weekMonday, wi) => {
  GEN_DESIGNERS.forEach((designer) => {
    const count = 34 + Math.floor(rnd() * 13); // 34 à 46 packs
    for (let k = 0; k < count; k++) {
      const fam = FAMILIES[Math.floor(rnd() * FAMILIES.length)];
      const [item, emoji] = pick(fam.items);
      const [brandId, code] = pick(fam.brands);
      const ref = `${code}-N${genSeq++}`;
      const deadline = addDays(weekMonday, Math.floor(rnd() * 5));
      // Avancement selon la semaine : passées presque finies, à venir peu commencées
      const r = rnd();
      const level =
        wi === 0 ? (r < 0.9 ? 4 : Math.floor(rnd() * 3)) :
        wi === 1 ? (r < 0.55 ? 4 : r < 0.8 ? 3 : Math.floor(rnd() * 3)) :
        wi === 2 ? (r < 0.15 ? 4 : r < 0.35 ? 3 : r < 0.6 ? 2 : r < 0.8 ? 1 : 0) :
        wi === 3 ? (r < 0.15 ? 2 : r < 0.45 ? 1 : 0) :
        r < 0.15 ? 1 : 0;
      const pcb = pick([12, 24, 36, 48]);
      // Niveau 0 : artwork pas encore soumis (circuit « à venir »), sauf une partie déjà envoyée à David
      const submitted = level > 0 || rnd() < (wi <= 1 ? 0.25 : 0.08);
      const started = submitted || (wi <= 2 && rnd() < 0.5);
      products.push({
        id: ref,
        ref,
        ean: ean(1000 + genSeq),
        name: `${item} ${pick(fam.variants)}`,
        brandId,
        supplierId: pick(fam.suppliers),
        rayon: fam.rayon,
        collection: pick(['Été 2027', 'Été 2027', 'Printemps 2027', 'Noël 2026', 'Permanent']),
        gender: 'Mixte',
        material: 'Divers',
        emoji,
        tint: pick(fam.tints),
        pa: Math.round((1.2 + rnd() * 9) * 20) / 20,
        pcb,
        cbmCarton: Math.round((0.03 + rnd() * 0.12) * 1000) / 1000,
        weight: Math.round((0.1 + rnd() * 0.6) * 100) / 100,
        developed: level === 4,
        devStage: level === 4 ? 6 : 1,
        devDeadline: deadline,
        nextAction: level === 4 ? 'Passer commande' : 'Rendre le pack',
        targetQty: pcb * (100 + Math.floor(rnd() * 400)),
        urgent: level < 4 && rnd() < 0.04,
        pack: {
          type: pick(fam.packs),
          designer,
          artworkDeadline: deadline,
          validations: submitted ? validations(level, addDays(deadline, -6)) : notStarted(),
          dieCut: level >= 2 ? 'received' : level === 1 || (started && rnd() < 0.3) ? 'requested' : 'none',
          artworkVersions: Math.max(1, level),
          sentToSupplier: level >= 4 || (level === 3 && rnd() < 0.5),
          // Packs pas encore rendus : certains commencés, d'autres avec un début annoncé
          startedAt: started ? `${minDate(addDays(deadline, submitted ? -5 : -3), '2026-11-13')}T${10 + Math.floor(rnd() * 7)}:${pick(['00', '15', '30', '45'])}` : undefined,
          plannedStart: !started && wi >= 2 && rnd() < 0.35 ? minDateMax(addDays(deadline, -4), '2026-11-16') : undefined,
        },
        stock: { Péronne: 0, Meaux: 0, Lillois: 0 },
      });
    }
  });
});

const pid = (ref: string) => ref;

// ---- Proformas -------------------------------------------------------------

// Proformas de démonstration alignées sur la maquette (S49 → S52).
// Chaque ligne : [référence, CBM déclaré, montant €] → quantité au carton près, prix = montant ÷ quantité.
type PFDef = {
  id: string;
  supplier: string;
  title: string;
  status: ProformaStatus;
  etd: string;
  eta: string;
  lines: [string, number, number][];
  deposit: number;
  paid: boolean;
};

const S49 = '2026-12-02';
const S50 = '2026-12-09';
const S51 = '2026-12-16';
const S52 = '2026-12-23';

const pfDefs: PFDef[] = [
  // Semaine 49 — 5 proformas · 352,9 m³ · 620 000 €
  { id: 'PF-2026-0146', supplier: 'nova', title: 'Brumes corps', status: 'a_signer', etd: S49, eta: S51, lines: [['CP-B110', 68.5, 100000]], deposit: 20000, paid: false },
  { id: 'PF-2026-0148', supplier: 'horizon', title: 'Mobilier jardin – Été 2027', status: 'en_dev', etd: S49, eta: S50, lines: [['JO-J201', 100, 170000], ['JO-J205', 42, 80000]], deposit: 50000, paid: true },
  { id: 'PF-2026-0145', supplier: 'northbay', title: 'Rangement maison', status: 'en_production', etd: S49, eta: S52, lines: [['JO-R301', 50, 90000], ['JO-R305', 30, 60000], ['JO-R310', 18.4, 30000]], deposit: 30000, paid: true },
  { id: 'PF-2026-0141', supplier: 'tide', title: 'Claquettes été', status: 'booke', etd: S49, eta: addDays(S49, 35), lines: [['CP-C042', 14, 30000], ['YD-H008', 10, 20000]], deposit: 15000, paid: true },
  { id: 'PF-2026-0139', supplier: 'jinfa', title: 'Mocassins été', status: 'en_transit', etd: S49, eta: addDays(S49, 35), lines: [['AB-M026', 20, 40000]], deposit: 12000, paid: true },
  // Semaine 50 — 4 proformas · 214,4 m³ · 490 000 €
  { id: 'PF-2026-0150', supplier: 'wenzhoutex', title: 'Plateformes & claquettes', status: 'a_signer', etd: S50, eta: addDays(S50, 35), lines: [['CP-PL03', 35.4, 80000], ['YD-C003', 25, 60000]], deposit: 28000, paid: false },
  { id: 'PF-2026-0151', supplier: 'nova', title: 'Parfums collection', status: 'en_dev', etd: S50, eta: addDays(S50, 35), lines: [['PF-P014', 30, 70000], ['CP-B112', 26.4, 50000]], deposit: 30000, paid: true },
  { id: 'PF-2026-0136', supplier: 'yiwu', title: 'Sacs de plage', status: 'en_transit', etd: S50, eta: addDays(S50, 35), lines: [['TR-B002', 52.6, 110000]], deposit: 33000, paid: true },
  { id: 'PF-2026-0129', supplier: 'gzbeauty', title: 'Coffrets parfum', status: 'arrive', etd: S50, eta: addDays(S50, 35), lines: [['PF-P020', 25, 70000], ['JB-T010', 20, 50000]], deposit: 36000, paid: true },
  // Semaine 51 — 3 proformas · 126,8 m³ · 240 000 €
  { id: 'PF-2026-0153', supplier: 'jinfa', title: 'Chapeaux & claquettes', status: 'a_signer', etd: S51, eta: addDays(S51, 35), lines: [['CP-A001', 20, 40000], ['CP-C015', 30, 60000]], deposit: 30000, paid: false },
  { id: 'PF-2026-0152', supplier: 'tide', title: 'Tongs paillettes – réassort', status: 'en_production', etd: S51, eta: addDays(S51, 35), lines: [['CP-T001', 22, 40000]], deposit: 12000, paid: true },
  { id: 'PF-2026-0143', supplier: 'seoul', title: 'K-Beauty coffrets', status: 'en_production', etd: S51, eta: addDays(S51, 35), lines: [['JB-K001', 38.8, 80000]], deposit: 24000, paid: true },
  { id: 'PF-2026-0131', supplier: 'tide', title: 'Tongs & sabots', status: 'en_transit', etd: S51, eta: addDays(S51, 35), lines: [['CP-T001', 20, 30000], ['ORA-C006', 18, 30000]], deposit: 18000, paid: true },
  // Semaine 52 — 2 proformas · 74,0 m³ · 120 000 €
  { id: 'PF-2026-0124', supplier: 'wenzhoutex', title: 'Draps de plage', status: 'arrive', etd: S52, eta: addDays(S52, 35), lines: [['JO-T040', 40, 70000]], deposit: 21000, paid: true },
  { id: 'PF-2026-0122', supplier: 'yiwu', title: 'Éventails & tongs', status: 'arrive', etd: S52, eta: addDays(S52, 35), lines: [['CP-EV01', 14, 20000], ['TR-T001', 20, 30000]], deposit: 15000, paid: true },
];

const docsFor = (st: ProformaStatus) => {
  // La proforma elle-même est déposée par le fournisseur (versions signées) : ici, les autres documents
  const base = ['Conditions d’achat.pdf'];
  if (st === 'a_signer') return base;
  if (['booke', 'en_transit', 'arrive'].includes(st)) base.push('Plan de chargement.xlsx', 'Booking confirmation.pdf');
  if (['en_transit', 'arrive'].includes(st)) base.push('BL.pdf', 'Commercial Invoice.pdf', 'Packing List.xlsx');
  return base;
};

export const proformas: Proforma[] = pfDefs.map((d, i) => {
  const date = addDays(d.etd, -56);
  const history = [{ date, user: 'Yzerah', text: 'Proforma créée' }];
  if (d.status !== 'a_signer') history.push({ date: addDays(date, 2), user: 'Rudy Zerah', text: 'Proforma signée' });
  if (d.paid) history.push({ date: addDays(date, 6), user: 'Finance', text: 'Acompte versé' });
  if (['booke', 'en_transit', 'arrive'].includes(d.status)) history.push({ date: addDays(d.etd, -14), user: 'Logistique', text: 'Booking confirmé' });
  const lines = d.lines.map(([ref, cbm, amount]) => {
    const p = products.find((x) => x.id === pid(ref))!;
    const qty = Math.max(1, Math.round(cbm / p.cbmCarton)) * p.pcb;
    return { productId: p.id, qty, price: amount / qty, cbm };
  });
  const amount = d.lines.reduce((s, l) => s + l[2], 0);
  return {
    id: d.id,
    supplierId: d.supplier,
    title: d.title,
    poNumber: `PO-JONAS-${26800 + i * 13}`,
    date,
    status: d.status,
    etd: d.etd,
    eta: d.eta,
    lines,
    depositPct: Math.round((d.deposit / amount) * 100),
    depositAmount: d.deposit,
    depositPaid: d.paid,
    balancePaid: d.status === 'arrive',
    balanceDue: addDays(d.etd, 7),
    documents: docsFor(d.status),
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
      // Transitaire : Kuehne + Nagel pour la Corée et Xiamen, Logfret sinon
      forwarder: ['seoul', 'tide', 'gzbeauty'].includes(pf.supplierId) ? 'Kuehne + Nagel' : 'Logfret',
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
  ['PF-2026-0122', 1, 'arrive'],
  ['PF-2026-0124', 1, 'arrive'],
  ['PF-2026-0129', 1, 'arrive'],
  ['PF-2026-0131', 1, 'en_transit'],
  ['PF-2026-0136', 1, 'en_transit'],
  ['PF-2026-0139', 1, 'en_transit'],
  ['PF-2026-0141', 1, 'booke'],
  ['PF-2026-0145', 1, 'booking_demande'],
  ['PF-2026-0152', 1, 'booking_demande'],
  ['PF-2026-0143', 0.8, 'a_booker'],
  ['PF-2026-0148', 0.75, 'a_booker'],
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

// Suivi des bookings : demandes envoyées aux transitaires, relances, confirmations
{
  const VESSELS: Record<string, string[]> = {
    MSC: ['MSC ARINA', 'MSC TESSA', 'MSC GÜLSÜN'],
    'CMA CGM': ['CMA CGM JACQUES SAADE', 'CMA CGM TROCADERO'],
    Maersk: ['MAERSK HANGZHOU', 'MAERSK EMDEN'],
    COSCO: ['COSCO SHIPPING UNIVERSE', 'COSCO PRIDE'],
    'Hapag-Lloyd': ['BERLIN EXPRESS', 'HAMBURG EXPRESS'],
  };
  const clamp = (d: string) => (d < '2026-11-14' ? d : '2026-11-14');
  containers.forEach((c, i) => {
    if (c.status === 'a_booker') return;
    const requested = clamp(addDays(c.etdPlanned, -24));
    c.booking = { requestedAt: `${requested}T${9 + (i % 6)}:30`, requestedBy: 'Logistique', etdWanted: c.etdPlanned, reminders: [] };
    if (c.status === 'booking_demande') {
      // Une demande ancienne déjà relancée, une récente
      if (i % 2 === 0) {
        c.booking.requestedAt = '2026-11-06T10:15';
        c.booking.reminders = ['2026-11-10T09:05'];
      } else c.booking.requestedAt = '2026-11-12T16:40';
      return;
    }
    const list = VESSELS[c.carrier ?? 'MSC'] ?? ['MSC ARINA'];
    c.booking.confirmedAt = `${clamp(addDays(c.etdPlanned, -18))}T11:20`;
    c.booking.vessel = list[i % list.length];
    c.booking.cutoff = addDays(c.etdPlanned, -3);
  });
}

// Contrôles de réception des conteneurs arrivés (un avec écart, pour la démo)
containers
  .filter((x) => x.status === 'arrive')
  .forEach((c, i) => {
    c.reception = {
      at: `${c.receivedOn ?? c.etaPlanned}T09:30`,
      by: 'Logistique',
      lines: c.allocations.map((a, j) => ({
        proformaId: a.proformaId,
        productId: a.productId,
        expected: a.qty,
        received: i === 1 && j === 0 ? a.qty - 48 : a.qty,
      })),
      note: i === 1 ? '2 cartons écrasés, refusés au déchargement' : undefined,
    };
  });

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
  { id: 'direction', name: 'Rudy Zerah', email: 'rudy@jonas.example', role: 'direction', title: 'Direction générale', validationStep: 'direction', active: true },
  { id: 'direction-yoni', name: 'Yoni Zerah', email: 'yoni@jonas.example', role: 'direction', title: 'Direction générale', validationStep: 'direction', active: true },
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
  // Portail transitaire : un compte par commissionnaire
  { id: 'fwd-logfret', name: 'Julien Morel', email: 'j.morel@logfret.example', role: 'transitaire', title: 'Agent maritime · Logfret', forwarder: 'Logfret', active: true },
  { id: 'fwd-kn', name: 'Anna Weber', email: 'a.weber@kuehne-nagel.example', role: 'transitaire', title: 'Ocean Freight · Kuehne + Nagel', forwarder: 'Kuehne + Nagel', active: true },
];

// Booking par proforma : JONAS demande (nb de containers, date souhaitée), le fournisseur répond
// avec le plan de chargement et les dates réelles.
{
  for (const pf of proformas) {
    const cs = containers.filter((c) => c.allocations.some((x) => x.proformaId === pf.id));
    if (!cs.length) continue;
    const st = cs[0].status;
    if (st === 'a_booker') continue;
    const reqDay = addDays(pf.etd, -26) < '2026-11-14' ? addDays(pf.etd, -26) : '2026-11-06';
    pf.booking = { requestedAt: `${reqDay}T09:30`, requestedBy: 'Logistique', containers: cs.length, dateWanted: addDays(pf.etd, -5), reminders: [] };
    const fwd = cs[0].forwarder ?? 'Logfret';
    const fwdUser = fwd === 'Logfret' ? 'Julien Morel' : 'Anna Weber';
    if (st === 'booking_demande') {
      // Pris en compte par le fournisseur, transmis au transitaire choisi par JONAS : en attente de sa proposition
      const pfDate = addDays(pf.etd, -7);
      pf.booking = {
        ...pf.booking,
        requestedAt: '2026-11-06T10:15',
        ackAt: '2026-11-07T03:40',
        ackBy: suppliers.find((x) => x.id === pf.supplierId)!.contact.name,
        readyDate: pfDate,
        forwarder: fwd,
        reminders: ['2026-11-11T09:05'],
      };
      for (const c of cs) c.planValidated = true;
      continue;
    }
    const answered = addDays(reqDay, 3);
    const loadingDate = addDays(cs[0].etdPlanned, -5);
    const bySupplier = pf.id === 'PF-2026-0141';
    pf.booking = {
      ...pf.booking,
      ackAt: `${addDays(reqDay, 1)}T03:10`,
      ackBy: suppliers.find((x) => x.id === pf.supplierId)!.contact.name,
      readyDate: addDays(loadingDate, -2),
      forwarder: fwd,
      answeredAt: `${answered < '2026-11-14' ? answered : '2026-11-13'}T04:20`,
      answeredBy: bySupplier ? suppliers.find((x) => x.id === pf.supplierId)!.contact.name : fwdUser,
      bookedBy: bySupplier ? 'fournisseur' : 'transitaire',
      loadingDate,
      etd: cs[0].etdPlanned,
      eta: cs[0].etaPlanned,
      carrier: cs[0].carrier,
      bookingNo: cs[0].bookingNo,
      vessel: cs[0].booking?.vessel,
    };
    for (const c of cs) {
      c.loading = { date: loadingDate, status: 'validated', validatedAt: pf.booking.answeredAt };
      c.planValidatedBy = 'fournisseur';
      c.fwdConfirmedAt = pf.booking.answeredAt;
    }
  }
  // K-Beauty (Seoul) : demande envoyée il y a 2 jours, pas encore prise en compte par le fournisseur
  const seoul = proformas.find((p) => p.id === 'PF-2026-0143')!;
  seoul.booking = {
    requestedAt: '2026-11-12T15:40',
    requestedBy: 'Logistique',
    containers: 1,
    dateWanted: addDays(seoul.etd, -5),
    forwarder: 'Kuehne + Nagel',
    note: 'Merci de grouper avec les coffrets restants si possible',
    reminders: [],
  };
  // Tide (réassort tongs) : proposition de Kuehne + Nagel déjà acceptée par le fournisseur, JONAS doit l'accepter
  const tide = proformas.find((p) => p.id === 'PF-2026-0152')!;
  tide.booking = {
    ...tide.booking!,
    requestedAt: '2026-11-09T11:00',
    ackAt: '2026-11-10T02:15',
    reminders: [],
    proposal: {
      at: '2026-11-13T08:30',
      by: 'Anna Weber',
      enteredBy: 'transitaire',
      carrier: 'CMA CGM',
      bookingNo: 'CMA-447120',
      vessel: 'CMA CGM ALEXANDER',
      cutoff: addDays(tide.etd, -3),
      loadingDate: addDays(tide.etd, -5),
      etd: tide.etd,
      eta: tide.eta,
      supplierOk: { at: '2026-11-14T03:05', by: suppliers.find((x) => x.id === 'tide')!.contact.name },
    },
  };
  for (const c of containers.filter((x) => x.allocations.some((a) => a.proformaId === seoul.id))) c.status = 'booking_demande';
}

// Proformas déposées par les fournisseurs : v1 signée par JONAS (tampon + date d'expédition demandée),
// modifications signées par la Direction (annulent la version précédente)
{
  const doc = (pf: (typeof proformas)[number], n: number, day: string, extra: Partial<ProformaDoc> = {}): ProformaDoc => ({
    version: n,
    fileId: `demo-${pf.id}-v${n}`,
    name: n === 1 ? `${pf.id} Proforma Invoice.pdf` : `${pf.id} Proforma Invoice rev${n}.pdf`,
    size: 46_000 + n * 3_100,
    type: 'application/pdf',
    uploadedAt: `${day}T03:20`,
    uploadedBy: suppliers.find((x) => x.id === pf.supplierId)!.contact.name,
    status: 'a_signer',
    ...extra,
  });
  const sig = (day: string, etd: string, by = 'Rudy Zerah', role = 'Direction', replaces?: number) => ({ at: `${day}T10:05`, by, role, date: day, etdWanted: etd, replaces });
  for (const pf of proformas) {
    const up = addDays(pf.date, 1);
    if (pf.status === 'a_signer') {
      // PF-2026-0150 : le fournisseur n'a pas encore déposé sa proforma
      if (pf.id !== 'PF-2026-0150') pf.versions = [doc(pf, 1, up)];
      continue;
    }
    const signDay = addDays(pf.date, 2);
    pf.versions = [doc(pf, 1, up, { status: 'signee', signature: sig(signDay, pf.etd) })];
  }
  // Horizon : date de production décalée, modification signée par la Direction (la v1 est annulée)
  const horizon = proformas.find((p) => p.id === 'PF-2026-0148')!;
  const h1 = horizon.versions![0];
  const hDay = addDays(horizon.date, 12);
  horizon.versions = [
    { ...h1, status: 'annulee', cancelledBy: { version: 2, at: `${hDay}T11:40` } },
    doc(horizon, 2, addDays(horizon.date, 11), {
      reason: 'Production décalée d’une semaine (usine fermée Golden Week)',
      status: 'signee',
      signature: sig(hDay, horizon.etd, 'Yoni Zerah', 'Direction', 1),
    }),
  ];
  // Nova : demande de modification en attente de signature de la Direction
  const nova = proformas.find((p) => p.id === 'PF-2026-0151')!;
  nova.versions = [...nova.versions!, doc(nova, 2, '2026-11-13', { reason: 'Quantité CP-B112 portée à 60 000 pcs, prix unitaire ajusté' })];
}

// Northbay : problème usine sur l'étagère bambou, demande d'expédition partielle à accepter par JONAS
{
  const nb = proformas.find((p) => p.id === 'PF-2026-0145')!;
  nb.splitRequest = {
    at: '2026-11-13T04:10',
    by: 'Ms. Zhao Min',
    side: 'fournisseur',
    reason: 'Problème de séchage sur l’étagère bambou : production terminée 3 semaines plus tard',
    lines: nb.lines.map((l) => ({ productId: l.productId, qtyNow: l.productId === 'JO-R310' ? Math.round(l.qty * 0.4) : l.qty })),
    etdLater: addDays(nb.etd, 21),
  };
}

// Suivi transitaire : bookings confirmés, dédouanement et livraisons des conteneurs déjà partis
{
  for (const c of containers) {
    if (c.status === 'en_transit' || c.status === 'arrive') c.fwdConfirmedAt = `${addDays(c.etdPlanned, -15)}T10:00`;
    if (c.status === 'arrive') {
      c.customs = 'dedouane';
      c.deliveryDate = c.receivedOn;
    }
  }
}
