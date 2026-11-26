import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { bookingStage, packDone, pendingVersion, pfContainers, type State } from '../data/store';
import type { Proforma } from '../data/types';
import { ProformaStatusPill } from '../components/ui';
import { useT } from '../i18n';
import { usePortal } from './usePortal';

type StepKey = 'pf' | 'packs' | 'prod' | 'booking' | 'depart' | 'docs';
const STEPS: StepKey[] = ['pf', 'packs', 'prod', 'booking', 'depart', 'docs'];
const REQUIRED_DOCS = ['BL.pdf', 'Invoice.pdf', 'Packing List.xlsx'];

interface Flow {
  /** Étape en cours (index dans STEPS), STEPS.length si tout est fait */
  current: number;
  /** Action attendue du fournisseur (texte + lien), sinon ce qu'on attend de JONAS / du transitaire */
  you?: { text: string; to: string };
  wait?: string;
}

/** Où en est une commande, du point de vue du fournisseur */
function flowOf(s: State, pf: Proforma, t: ReturnType<typeof useT>['t'], fdate: (d: string) => string): Flow {
  const prods = pf.lines.map((l) => s.products.find((p) => p.id === l.productId)).filter((p) => !!p);
  const packsOk = prods.filter(packDone).length;
  const toValidate = prods.filter((p) => p.pack.sentToSupplier && p.pack.validations.fournisseur.state === 'pending' && !packDone(p)).length;
  const dieCuts = prods.filter((p) => p.pack.dieCut === 'requested').length;
  const link = `/portail/proformas?pf=${pf.id}`;
  if (pf.status === 'a_signer') {
    return pendingVersion(pf) ? { current: 0, wait: t('flow.wait.pf') } : { current: 0, you: { text: t('flow.act.pf'), to: link } };
  }
  if (pf.splitRequest?.side === 'jonas') return { current: pf.status === 'en_dev' ? 1 : 2, you: { text: t('flow.act.split'), to: link } };
  if (pf.status === 'en_dev') {
    if (toValidate) return { current: 1, you: { text: t('flow.act.packs', { n: toValidate }), to: '/portail/packs' } };
    if (dieCuts) return { current: 1, you: { text: t('flow.act.diecut', { n: dieCuts }), to: '/portail/packs?vue=diecut' } };
    return { current: 1, wait: t('flow.wait.packs', { done: packsOk, total: prods.length }) };
  }
  if (pf.status === 'en_production') {
    const st = bookingStage(pf);
    if (st === 'fournisseur') return { current: 3, you: { text: t('flow.act.booking'), to: '/portail/booking' } };
    if (st === 'validation' && !pf.booking?.proposal?.supplierOk) return { current: 3, you: { text: t('flow.act.proposal'), to: '/portail/booking' } };
    if (st) return { current: 3, wait: t('flow.wait.booking') };
    return { current: 2, wait: t('flow.wait.prod', { date: fdate(pf.etd) }) };
  }
  const docsMissing = pfContainers(s, pf.id).some((c) => REQUIRED_DOCS.some((d) => !c.documents.includes(d)));
  if (pf.status === 'booke') {
    if (docsMissing) return { current: 4, you: { text: t('flow.act.docs'), to: '/portail/conteneurs' } };
    return { current: 4, wait: t('flow.wait.depart', { date: fdate(pf.etd) }) };
  }
  if (pf.status === 'en_transit') {
    if (docsMissing) return { current: 5, you: { text: t('flow.act.docs'), to: '/portail/conteneurs' } };
    return { current: STEPS.length, wait: t('flow.wait.transit', { date: fdate(pf.eta) }) };
  }
  return { current: STEPS.length };
}

/** Tableau de bord : chaque commande en cours avec ses étapes, et ce qu'on attend du fournisseur */
export default function PortalFlow() {
  const { state, proformas } = usePortal();
  const { t, fmt } = useT();
  const open = proformas.filter((p) => p.status !== 'arrive').sort((a, b) => a.etd.localeCompare(b.etd));
  const flows = open.map((pf) => ({ pf, f: flowOf(state, pf, t, fmt.fdate) }));
  // Les commandes qui attendent le fournisseur d'abord
  flows.sort((a, b) => Number(!!b.f.you) - Number(!!a.f.you));
  return (
    <section className="card pad mb pflow" aria-label={t('flow.title')}>
      <div className="card-title">{t('flow.title')}</div>
      <p className="small muted pflow-sub">{t('flow.sub')}</p>
      {!flows.length && <div className="empty">{t('flow.none')}</div>}
      {flows.map(({ pf, f }) => (
        <div key={pf.id} className={`pflow-row ${f.you ? 'you' : ''}`} data-pf={pf.id}>
          <Link to={`/portail/proformas?pf=${pf.id}`} className="pflow-id">
            <b>{pf.id}</b>
            <span className="xs muted">
              {fmt.weekLabel(pf.etd)} · {fmt.fshort(pf.etd)}
            </span>
            <ProformaStatusPill status={pf.status} />
          </Link>
          <ol className="pflow-steps">
            {STEPS.map((k, i) => {
              const cls = i < f.current ? 'done' : i === f.current ? (f.you ? 'you' : 'now') : 'todo';
              return (
                <li key={k} className={cls} aria-current={i === f.current ? 'step' : undefined}>
                  <span className="pflow-dot">{i < f.current ? <Check size={14} strokeWidth={3} /> : i + 1}</span>
                  <span className="pflow-lbl">{t(`flow.s.${k}`)}</span>
                </li>
              );
            })}
          </ol>
          <div className="pflow-next">
            {f.you ? (
              <Link to={f.you.to} className="btn sm primary pflow-act">
                <span className="pflow-you">{t('flow.you')}</span> {f.you.text} ›
              </Link>
            ) : (
              f.wait && <span className="small muted">{f.wait}</span>
            )}
          </div>
        </div>
      ))}
    </section>
  );
}
