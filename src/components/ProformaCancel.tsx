import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Ban, RotateCcw, Trash2, X } from 'lucide-react';
import { byId, cancelBlock, canCancelProforma, canDeleteProforma, currentUser, proformaTotals, useAuth, useStore } from '../data/store';
import type { Proforma } from '../data/types';
import { ProformaStatusPill } from './ui';
import { toast } from './ui-shared';
import { eur, fdate, num } from '../lib/format';

type Mode = 'cancel' | 'delete';

/** Boutons « Annuler » et « Supprimer » d'une proforma active, avec leur fenêtre de confirmation */
export function ProformaCancelButtons({ pf }: { pf: Proforma }) {
  const { state } = useStore();
  const me = currentUser(state);
  const [mode, setMode] = useState<Mode | null>(null);
  const canCancel = canCancelProforma(state, me, pf);
  const canDelete = canDeleteProforma(state, me, pf);
  const block = cancelBlock(state, pf);
  if (!me || (!canCancel && !canDelete && !block)) return null;
  if (block && (me.role === 'pilote' || me.role === 'direction' || me.role === 'acheteur'))
    return (
      <button className="btn" disabled title={block}>
        <Ban size={16} /> Annuler
      </button>
    );
  return (
    <>
      {canCancel && (
        <button className="btn" onClick={() => setMode('cancel')}>
          <Ban size={16} /> Annuler
        </button>
      )}
      {canDelete && (
        <button className="btn danger" onClick={() => setMode('delete')} aria-label="Supprimer la proforma">
          <Trash2 size={16} /> Supprimer
        </button>
      )}
      {mode && <CancelDialog pf={pf} mode={mode} onClose={() => setMode(null)} />}
    </>
  );
}

function CancelDialog({ pf, mode, onClose }: { pf: Proforma; mode: Mode; onClose: () => void }) {
  const { state, dispatch } = useStore();
  const navigate = useNavigate();
  const [reason, setReason] = useState('');
  const [sure, setSure] = useState(false);
  const containers = state.containers.filter((c) => c.allocations.some((x) => x.proformaId === pf.id));
  const del = mode === 'delete';
  const ok = del ? sure : !!reason.trim();
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ok) return;
    if (del) {
      dispatch({ type: 'deleteProforma', id: pf.id });
      toast(`${pf.id} supprimée`);
    } else {
      dispatch({ type: 'cancelProforma', id: pf.id, reason });
      toast(`${pf.id} annulée`);
    }
    onClose();
    navigate('/proformas');
  };
  return (
    <div className="palette-back" onMouseDown={onClose}>
      <form className="card rc-dialog bk-dialog" role="dialog" aria-label={del ? `Supprimer ${pf.id}` : `Annuler ${pf.id}`} onMouseDown={(e) => e.stopPropagation()} onSubmit={submit}>
        <header className="rc-head">
          <div>
            <h2>{del ? `Supprimer ${pf.id}` : `Annuler ${pf.id}`}</h2>
            <span className="muted small">{pf.title}</span>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fermer">
            <X size={20} />
          </button>
        </header>
        <div className="bk-form" style={{ display: 'grid', gap: 10 }}>
          {del ? (
            <>
              <p className="small" style={{ margin: 0 }}>
                La proforma, ses lignes, ses versions et son historique sont <b>effacés définitivement</b>. Les produits créés restent dans le catalogue.
              </p>
              <p className="small muted" style={{ margin: 0 }}>
                Pour garder une trace (et pouvoir la rétablir), préférez <b>Annuler</b>.
              </p>
            </>
          ) : (
            <>
              <p className="small" style={{ margin: 0 }}>
                La proforma sort de toutes les listes (commandes, booking, paiements, portail fournisseur). Elle reste consultable dans l’onglet <b>Annulées</b> et peut être rétablie.
              </p>
              <label htmlFor="pfc-reason" className="bk-wide">
                Motif de l’annulation *
                <textarea
                  id="pfc-reason"
                  className="input"
                  rows={3}
                  required
                  autoFocus
                  value={reason}
                  placeholder="Ex. commande remplacée par PF-2026-0155, prix refusé…"
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
            </>
          )}
          {containers.length > 0 && (
            <p className="small" style={{ margin: 0, color: '#b45309' }}>
              Ses quantités sont retirées des conteneurs {containers.map((c) => c.number ?? c.id).join(', ')}.
            </p>
          )}
          {del && (
            <label className="row small" style={{ gap: 8 }}>
              <input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} /> Je confirme la suppression définitive de {pf.id}
            </label>
          )}
        </div>
        <footer className="rc-foot">
          <span />
          <button type="button" className="btn" onClick={onClose}>
            Retour
          </button>
          <button type="submit" className={`btn ${del ? 'danger' : 'primary'}`} disabled={!ok}>
            {del ? <Trash2 size={16} /> : <Ban size={16} />} {del ? 'Supprimer définitivement' : 'Annuler la proforma'}
          </button>
        </footer>
      </form>
    </div>
  );
}

/** Page d'une proforma annulée : motif, contenu, rétablir ou supprimer */
export function CancelledProforma({ pf }: { pf: Proforma }) {
  const { state, dispatch } = useStore();
  const auth = useAuth();
  const navigate = useNavigate();
  const [del, setDel] = useState(false);
  const sup = byId(state.suppliers, pf.supplierId);
  const t = proformaTotals(state, pf);
  const c = pf.cancelled!;
  return (
    <>
      <div className="page-head">
        <h1>Proforma {pf.id}</h1>
        <span className="pill red">Annulée</span>
        <ProformaStatusPill status={pf.status} />
        <div className="grow" />
        {auth.allowed({ type: 'restoreProforma', id: pf.id }) && (
          <button
            className="btn primary"
            onClick={() => {
              dispatch({ type: 'restoreProforma', id: pf.id });
              toast(`${pf.id} rétablie`);
            }}
          >
            <RotateCcw size={16} /> Rétablir
          </button>
        )}
        {auth.allowed({ type: 'deleteProforma', id: pf.id }) && (
          <button className="btn danger" onClick={() => setDel(true)} aria-label="Supprimer la proforma">
            <Trash2 size={16} /> Supprimer
          </button>
        )}
      </div>
      <div className="card pad mb pfc-box">
        <div>
          Annulée le <b>{fdate(c.at.slice(0, 10))}</b> par <b>{c.by}</b>
        </div>
        <div className="mt">
          Motif : <b>{c.reason}</b>
        </div>
      </div>
      <div className="card pad">
        <div className="row wrap" style={{ gap: 18 }}>
          <span>
            Fournisseur : <Link to={`/fournisseurs/${sup.id}`}>{sup.name}</Link>
          </span>
          <span>{pf.title}</span>
          <span>
            {num(t.qty)} pcs · {pf.lines.length} ligne(s)
          </span>
          {auth.can('finance.view') && <span>{eur(t.amount)}</span>}
        </div>
        <div className="mt">
          <Link to="/proformas?annulees=1" className="small">
            ← Proformas annulées
          </Link>
        </div>
      </div>
      {del && (
        <CancelDialogDeleteOnly
          pf={pf}
          onClose={() => setDel(false)}
          onDone={() => {
            setDel(false);
            navigate('/proformas?annulees=1');
          }}
        />
      )}
    </>
  );
}

function CancelDialogDeleteOnly({ pf, onClose, onDone }: { pf: Proforma; onClose: () => void; onDone: () => void }) {
  const { dispatch } = useStore();
  const [sure, setSure] = useState(false);
  return (
    <div className="palette-back" onMouseDown={onClose}>
      <form
        className="card rc-dialog bk-dialog"
        role="dialog"
        aria-label={`Supprimer ${pf.id}`}
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (!sure) return;
          dispatch({ type: 'deleteProforma', id: pf.id });
          toast(`${pf.id} supprimée`);
          onDone();
        }}
      >
        <header className="rc-head">
          <h2>Supprimer {pf.id}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fermer">
            <X size={20} />
          </button>
        </header>
        <div className="bk-form">
          <label className="row small" style={{ gap: 8 }}>
            <input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} /> Je confirme la suppression définitive de {pf.id}
          </label>
        </div>
        <footer className="rc-foot">
          <span />
          <button type="button" className="btn" onClick={onClose}>
            Retour
          </button>
          <button type="submit" className="btn danger" disabled={!sure}>
            <Trash2 size={16} /> Supprimer définitivement
          </button>
        </footer>
      </form>
    </div>
  );
}
