import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Box, Calendar, Check, Download, FileText, History, LayoutGrid, Layers, List, Scissors, Send, Tag, Truck, Upload, X } from 'lucide-react';
import { byId, packDone, packLate, useStore, type State } from '../data/store';
import type { Product } from '../data/types';
import { VALIDATION_LABELS, VALIDATION_STEPS } from '../data/types';
import { BrandLogo, Kpi, Pill, ProductThumb, Progress, Seg, Tabs, ValidationCircuit, ValidationDot, toast } from '../components/ui';
import { TODAY, fdate, fshort, weekKey, weekLabel, weekRange } from '../lib/format';

type Tab = 'liste' | 'planning' | 'diecut' | 'envois';

function packStatus(p: Product): [string, string] {
  const v = p.pack.validations;
  if (packDone(p)) return ['Validé', 'green'];
  if (v.david.state === 'todo') return ['À traiter', 'grey'];
  if (v.david.state === 'pending') return ['À valider', 'orange'];
  if (v.fournisseur.state === 'pending') return p.pack.sentToSupplier ? ['Chez fournisseur', 'blue'] : ['À envoyer', 'blue'];
  return ['En validation', 'orange'];
}

function proformaOf(s: State, p: Product) {
  return s.proformas.filter((pf) => pf.status !== 'arrive' && pf.lines.some((l) => l.productId === p.id)).sort((a, b) => a.etd.localeCompare(b.etd))[0];
}

export default function Design() {
  const { state } = useStore();
  const designers = [...new Set(state.products.map((p) => p.pack.designer))];
  const [designer, setDesigner] = useState('all');
  const mine = state.products.filter((p) => designer === 'all' || p.pack.designer === designer);

  const weeks = useMemo(() => {
    const map = new Map<string, Product[]>();
    for (const p of mine) map.set(weekKey(p.pack.artworkDeadline), [...(map.get(weekKey(p.pack.artworkDeadline)) ?? []), p]);
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [mine]);

  const currentKey = weeks.find(([k]) => k >= weekKey(TODAY))?.[0] ?? weeks[0]?.[0];
  const [week, setWeek] = useState<string | undefined>(currentKey);
  const items = weeks.find(([k]) => k === week)?.[1] ?? [];
  const [tab, setTab] = useState<Tab>('liste');
  const [mode, setMode] = useState<'liste' | 'galerie'>('liste');
  const [selId, setSelId] = useState<string | null>(null);
  const sel = items.find((p) => p.id === selId) ?? items[0];

  const okCount = items.filter(packDone).length;
  const pfs = new Set(items.map((p) => proformaOf(state, p)?.id).filter(Boolean));

  return (
    <>
      <div className="page-head">
        <div className="cal-icon" style={{ width: 54, height: 54 }}>
          <Box size={28} />
        </div>
        <div>
          <h1>Espace Designer</h1>
          <div className="page-sub">Mes packs – planning par semaine</div>
        </div>
        <div className="grow" />
        <select className="input" value={designer} onChange={(e) => setDesigner(e.target.value)}>
          <option value="all">Tous les designers</option>
          {designers.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
      </div>

      <div className="row wrap mb" style={{ alignItems: 'stretch' }}>
        {weeks.map(([k, ps]) => {
          const ok = ps.filter(packDone).length;
          const late = ps.some(packLate);
          return (
            <div
              key={k}
              className="card pad"
              style={{ minWidth: 150, cursor: 'pointer', borderColor: k === week ? 'var(--green)' : late ? 'var(--red)' : undefined, background: k === week ? 'var(--green-softer)' : undefined }}
              onClick={() => {
                setWeek(k);
                setSelId(null);
              }}
            >
              <div className="row">
                <Calendar size={15} className={late ? 'red' : 'green'} />
                <span className="bold">Semaine {weekLabel(ps[0].pack.artworkDeadline)}</span>
                {late && <AlertTriangle size={14} className="red" />}
              </div>
              <div className="xs muted">{weekRange(ps[0].pack.artworkDeadline)}</div>
              <div style={{ fontSize: 26, fontWeight: 800 }} className={ok === ps.length ? 'green' : ''}>
                {ok} / {ps.length} <span className="small muted">packs</span>
              </div>
              <Progress value={ok / ps.length} />
            </div>
          );
        })}
      </div>

      <div className="kpis mb">
        <Kpi icon={<Check size={18} />} value={`${okCount} / ${items.length}`} label={`packs validés · ${items.length ? Math.round((okCount / items.length) * 100) : 0} %`} />
        <Kpi icon={<Box size={18} />} value={items.length} label="Produits" />
        <Kpi icon={<Layers size={18} />} value={pfs.size} label="Proformas" />
        <Kpi icon={<Truck size={18} />} value={new Set(items.map((p) => p.supplierId)).size} label="Fournisseurs" />
        <Kpi icon={<Tag size={18} />} value={new Set(items.map((p) => p.brandId)).size} label="Marques" />
        <Kpi icon={<AlertTriangle size={18} />} value={items.filter(packLate).length} label="En retard" color="red" />
      </div>

      <div className="split">
        <div>
          <div className="row wrap">
            <Tabs<Tab>
              value={tab}
              onChange={setTab}
              tabs={[
                { id: 'liste', label: `Liste des packs (${items.length})`, icon: <Box size={16} /> },
                { id: 'diecut', label: 'Die cut', icon: <Scissors size={16} /> },
                { id: 'envois', label: 'Envois fournisseurs', icon: <Send size={16} /> },
              ]}
            />
            <div className="grow" />
            <Seg
              value={mode}
              onChange={setMode}
              options={[
                { id: 'galerie', label: '', icon: <LayoutGrid size={16} /> },
                { id: 'liste', label: '', icon: <List size={16} /> },
              ]}
            />
          </div>
          <PackList
            items={tab === 'diecut' ? items.filter((p) => p.pack.dieCut !== 'received') : tab === 'envois' ? items.filter((p) => p.pack.validations.moinard.state === 'done') : items}
            mode={mode}
            state={state}
            selected={sel?.id}
            onSelect={setSelId}
          />
        </div>
        <div className="sticky-panel">{sel && <PackPanel p={sel} />}</div>
      </div>
    </>
  );
}

function PackList({ items, mode, state, selected, onSelect }: { items: Product[]; mode: 'liste' | 'galerie'; state: State; selected?: string; onSelect: (id: string) => void }) {
  if (!items.length) return <div className="card empty">Rien à traiter ici cette semaine.</div>;
  if (mode === 'galerie')
    return (
      <div className="gallery">
        {items.map((p) => {
          const [label, color] = packStatus(p);
          return (
            <div key={p.id} className="pcard" style={selected === p.id ? { borderColor: 'var(--green)' } : undefined} onClick={() => onSelect(p.id)}>
              <div className="photo" style={{ background: p.tint }}>
                {p.emoji}
              </div>
              <div className="row">
                <span className="ref-tag">{p.ref}</span>
                <span className="small bold">{p.name}</span>
              </div>
              <div className="row">
                <BrandLogo brand={byId(state.brands, p.brandId)} size={10} />
                <div className="grow" />
                <ValidationCircuit product={p} compact />
              </div>
              <div className="row">
                <Pill color={color}>{label}</Pill>
                <div className="grow" />
                <span className={`small ${packLate(p) ? 'red bold' : ''}`}>{fshort(p.pack.artworkDeadline)}</span>
              </div>
            </div>
          );
        })}
      </div>
    );
  return (
    <div className="card tbl-wrap">
      <table className="tbl">
        <thead>
          <tr>
            <th>#</th>
            <th>Produit</th>
            <th>Marque</th>
            <th>Fournisseur</th>
            <th>Type de pack</th>
            {VALIDATION_STEPS.map((s) => (
              <th key={s} className="center xs">
                {VALIDATION_LABELS[s]}
              </th>
            ))}
            <th>Échéance</th>
            <th>Statut</th>
          </tr>
        </thead>
        <tbody>
          {items.map((p, i) => {
            const [label, color] = packStatus(p);
            const sup = byId(state.suppliers, p.supplierId);
            return (
              <tr key={p.id} className={`clickable ${selected === p.id ? 'selected' : ''}`} onClick={() => onSelect(p.id)}>
                <td className="muted">{i + 1}</td>
                <td>
                  <div className="row">
                    <ProductThumb product={p} size={38} />
                    <div>
                      <div className="bold small">{p.name}</div>
                      <div className="xs muted">Réf. {p.ref}</div>
                    </div>
                  </div>
                </td>
                <td>
                  <BrandLogo brand={byId(state.brands, p.brandId)} size={9} />
                </td>
                <td className="small nowrap">
                  {sup.shortName} {sup.flag}
                </td>
                <td>
                  <Pill color="violet">{p.pack.type}</Pill>
                </td>
                {VALIDATION_STEPS.map((s) => (
                  <td key={s} className="center">
                    <ValidationDot state={p.pack.validations[s].state} />
                  </td>
                ))}
                <td className={`nowrap ${packLate(p) ? 'red bold' : ''}`}>
                  <Calendar size={13} /> {fshort(p.pack.artworkDeadline)}
                </td>
                <td>
                  <Pill color={color}>{label}</Pill>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PackPanel({ p }: { p: Product }) {
  const { state, dispatch } = useStore();
  const [sub, setSub] = useState<'pack' | 'diecut' | 'brief' | 'fichiers'>('pack');
  const sup = byId(state.suppliers, p.supplierId);
  const pf = proformaOf(state, p);
  const done = packDone(p);
  const pendingStep = VALIDATION_STEPS.find((s) => p.pack.validations[s].state !== 'done');

  return (
    <div className="card pad">
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div className="thumb" style={{ width: 140, height: 110, background: p.tint, fontSize: 70 }}>
          {p.emoji}
        </div>
        <div className="col grow" style={{ alignItems: 'flex-end' }}>
          <BrandLogo brand={byId(state.brands, p.brandId)} size={14} />
          <span className="small">
            {sup.shortName} {sup.flag}
          </span>
          {pf && (
            <Link to={`/proformas/${pf.id}`} className="small green bold">
              {pf.id}
            </Link>
          )}
          <span className="small">Réf. {p.ref}</span>
        </div>
      </div>
      <h3 className="mt" style={{ fontSize: 20 }}>
        {p.name}
      </h3>
      <div className="row mt small">
        Type de pack <Pill color="violet">{p.pack.type}</Pill>
      </div>
      {packLate(p) && (
        <div className="pill red mt">
          <AlertTriangle size={13} /> Date limite artwork dépassée ({fdate(p.pack.artworkDeadline)})
        </div>
      )}
      <Tabs
        value={sub}
        onChange={setSub}
        tabs={[
          { id: 'pack', label: 'Pack', icon: <Box size={14} /> },
          { id: 'diecut', label: 'Die cut', icon: <Scissors size={14} /> },
          { id: 'brief', label: 'Brief', icon: <FileText size={14} /> },
          { id: 'fichiers', label: 'Fichiers', icon: <Layers size={14} /> },
        ]}
      />
      {sub === 'pack' && (
        <div className="grid2">
          <div className="thumb" style={{ height: 100, background: '#efe6da', fontWeight: 800, fontSize: 12, textAlign: 'center' }}>
            {byId(state.brands, p.brandId).name}
            <br />v{p.pack.artworkVersions}
          </div>
          <div className="thumb" style={{ height: 100, background: '#f5f7f6', fontSize: 34 }}>
            ✂️
          </div>
          <button className="btn sm" onClick={() => toast('Téléchargement pack (AI/PSD) – démo')}>
            <Download size={13} /> Pack (AI/PSD)
          </button>
          <button className="btn sm" disabled={p.pack.dieCut !== 'received'} onClick={() => toast('Téléchargement die cut – démo')}>
            <Download size={13} /> Die cut (AI/PDF)
          </button>
        </div>
      )}
      {sub === 'diecut' && (
        <div className="col">
          <div>
            État :{' '}
            {p.pack.dieCut === 'received' ? <Pill color="green">Reçu</Pill> : p.pack.dieCut === 'requested' ? <Pill color="orange">Demandé au fournisseur</Pill> : <Pill color="grey">Non demandé</Pill>}
          </div>
          {p.pack.dieCut === 'requested' && (
            <button className="btn sm" onClick={() => dispatch({ type: 'receiveDieCut', productId: p.id })}>
              <Check size={13} /> Marquer comme reçu
            </button>
          )}
        </div>
      )}
      {sub === 'brief' && (
        <div className="small">
          Pack {p.pack.type.toLowerCase()} pour la marque {byId(state.brands, p.brandId).name}, collection {p.collection}. Rendu attendu le {fdate(p.pack.artworkDeadline)} (designer : {p.pack.designer}).
        </div>
      )}
      {sub === 'fichiers' && (
        <div>
          {Array.from({ length: p.pack.artworkVersions }, (_, i) => (
            <div key={i} className="alert-line small">
              <FileText size={14} className="green" /> {p.ref}_pack_v{i + 1}.ai
            </div>
          ))}
        </div>
      )}

      <div className="bold mt mb">Circuit de validation (4 étapes)</div>
      <ValidationCircuit product={p} />

      <div className="grid2 mt">
        <button
          className="btn"
          disabled={p.pack.dieCut !== 'none'}
          onClick={() => {
            dispatch({ type: 'requestDieCut', productId: p.id });
            toast('Die cut demandé au fournisseur');
          }}
        >
          <Scissors size={15} /> Demander le die cut
        </button>
        <button
          className="btn"
          onClick={() => {
            dispatch({ type: 'uploadArtwork', productId: p.id });
            toast(`Version v${p.pack.artworkVersions + 1} déposée`);
          }}
        >
          <Upload size={15} /> Déposer une version
        </button>
        {!done && pendingStep && (
          <button
            className="btn primary"
            onClick={() => {
              dispatch({ type: 'validatePack', productId: p.id });
              toast(`Validation ${VALIDATION_LABELS[pendingStep]} enregistrée`);
            }}
          >
            <Check size={15} /> Valider ({VALIDATION_LABELS[pendingStep]})
          </button>
        )}
        {!done && (
          <button className="btn danger" onClick={() => dispatch({ type: 'rejectPack', productId: p.id })}>
            <X size={15} /> Refuser
          </button>
        )}
        <button
          className="btn primary"
          disabled={p.pack.validations.moinard.state !== 'done' || p.pack.sentToSupplier}
          onClick={() => {
            dispatch({ type: 'forwardPack', productId: p.id });
            toast(`Pack transmis à ${sup.shortName}`);
          }}
        >
          <Send size={15} /> Forwarder le pack
        </button>
      </div>
      <div className="xs muted mt row" style={{ gap: 6 }}>
        <History size={12} /> Un pack n’est compté terminé qu’après les quatre validations.
      </div>
    </div>
  );
}
