import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Ban, RotateCcw, Trash2, X } from 'lucide-react';
import { byId, cancelBlock, canCancelLines, canCancelProforma, canDeleteProforma, currentUser, proformaTotals, useAuth, useStore } from '../data/store';
import type { Proforma } from '../data/types';
import { ProductPic, ProformaStatusPill } from './ui';
import { toast } from './ui-shared';
import { fdate, num } from '../lib/format';
import { cur0 } from '../lib/curr';

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
          {auth.can('finance.view') && <span>{cur0(t.amountCur, t.currency)}</span>}
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

/** Bouton « Annuler » d'un produit sur une proforma pas encore signée */
export function LineCancelButton({ pf, productId, compact }: { pf: Proforma; productId: string; compact?: boolean }) {
  const { state, dispatch } = useStore();
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  if (!canCancelLines(currentUser(state), pf)) return null;
  const p = byId(state.products, productId);
  const line = pf.lines.find((l) => l.productId === productId);
  const last = pf.lines.length <= 1;
  const allowed = auth.allowed({ type: 'cancelLine', id: pf.id, productId });
  return (
    <>
      <button
        type="button"
        className={`btn sm pfl-cancel${compact ? ' compact' : ''}`}
        disabled={!allowed}
        title={last ? 'Dernier produit : annulez la proforma' : `Annuler ${p.ref} sur ${pf.id}`}
        aria-label={`Annuler le produit ${p.ref}`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <Ban size={14} /> Annuler
      </button>
      {open && (
        <div
          className="palette-back"
          onMouseDown={(e) => {
            e.stopPropagation();
            setOpen(false);
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <form
            className="card rc-dialog bk-dialog"
            role="dialog"
            aria-label={`Annuler ${p.ref}`}
            onMouseDown={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              dispatch({ type: 'cancelLine', id: pf.id, productId, reason });
              toast(`${p.ref} annulé sur ${pf.id}`);
              setOpen(false);
            }}
          >
            <header className="rc-head">
              <div>
                <h2>Annuler {p.ref}</h2>
                <span className="muted small">{p.name}</span>
              </div>
              <button type="button" className="icon-btn" onClick={() => setOpen(false)} aria-label="Fermer">
                <X size={20} />
              </button>
            </header>
            <div className="bk-form" style={{ display: 'grid', gap: 10 }}>
              <p className="small" style={{ margin: 0 }}>
                Le produit ({line ? `${num(line.qty)} pcs` : ''}) sort de la proforma {pf.id} : totaux, CBM et conteneurs sont recalculés. Il reste affiché <b>ANNULÉ</b> sur la proforma et peut
                être rétabli tant qu’elle n’est pas signée.
              </p>
              <label htmlFor="pfl-reason" className="bk-wide">
                Motif (facultatif)
                <textarea id="pfl-reason" className="input" rows={2} autoFocus value={reason} placeholder="Ex. prix trop élevé, produit en doublon…" onChange={(e) => setReason(e.target.value)} />
              </label>
            </div>
            <footer className="rc-foot">
              <span />
              <button type="button" className="btn" onClick={() => setOpen(false)}>
                Retour
              </button>
              <button type="submit" className="btn danger">
                <Ban size={16} /> Annuler le produit
              </button>
            </footer>
          </form>
        </div>
      )}
    </>
  );
}

/** Produits annulés de la proforma : grisés, marqués ANNULÉ, rétablissables avant signature */
export function CancelledLines({ pf }: { pf: Proforma }) {
  const { state, dispatch } = useStore();
  const auth = useAuth();
  const navigate = useNavigate();
  const lines = pf.cancelledLines ?? [];
  if (!lines.length) return null;
  const cur = pf.currency ?? 'EUR';
  return (
    <div className="mt">
      <div className="card-title row" style={{ gap: 8 }}>
        <Ban size={16} /> Produits annulés ({lines.length})
      </div>
      <div className="gallery">
        {lines.map((l) => {
          const p = byId(state.products, l.productId);
          const canRestore = auth.allowed({ type: 'restoreLine', id: pf.id, productId: l.productId });
          return (
            <div key={l.productId} className="pcard pfp-card pfl-cancelled" onClick={() => navigate(`/produits/${p.id}`)}>
              <div className="photo" style={{ background: p.tint }}>
                <ProductPic product={p} />
                <span className="pfl-stamp">ANNULÉ</span>
              </div>
              <div>
                <span className="ref-tag">{p.ref}</span>
                <div className="pfp-name">{p.name}</div>
              </div>
              <div className="small muted">
                <s>
                  {num(l.qty)} pcs · {cur0(l.qty * l.price, cur)}
                </s>
                <div className="xs">
                  Annulé le {fdate(l.at.slice(0, 10))} par {l.by}
                  {l.reason ? ` · ${l.reason}` : ''}
                </div>
              </div>
              {canRestore && (
                <button
                  type="button"
                  className="btn sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    dispatch({ type: 'restoreLine', id: pf.id, productId: l.productId });
                    toast(`${p.ref} rétabli sur ${pf.id}`);
                  }}
                >
                  <RotateCcw size={14} /> Rétablir
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
