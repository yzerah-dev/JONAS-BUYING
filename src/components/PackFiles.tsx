import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Archive,
  Download,
  File as FileIcon,
  FileImage,
  FileText,
  Folder,
  FolderUp,
  Loader2,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { canPackFiles, currentUser, useAuth, useStore } from "../data/store";
import type { PackFile, PackFileKind, Product } from "../data/types";
import {
  deleteBlob,
  newFileId,
  supplierScope,
  ext,
  fromDrop,
  fromInput,
  fsize,
  getBlob,
  putBlob,
  saveBlob,
  zipBlobs,
  type PickedFile,
} from "../lib/files";
import { fstamp } from "../lib/format";
import { toast } from "./ui-shared";

const IMAGE = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg"]);
const isImage = (f: PackFile) => IMAGE.has(ext(f.name));
const QUALITY_TYPES = [
  "MSDS (fiche de sécurité)",
  "Fiche composition",
  "Certificat de conformité",
  "Rapport de test",
  "Fiche technique",
  "Autre",
];

/** Les 6 rubriques de l'espace pack, dans l'ordre du travail */
const SECTIONS: {
  kind: PackFileKind;
  title: string;
  who: string;
  hint: string;
  zip: string;
}[] = [
  {
    kind: "brief",
    title: "Brief marketing",
    who: "Acheteur · Direction · Pilote",
    hint: "Photos de ce à quoi le pack doit ressembler (références, inspirations, concurrents).",
    zip: "1 - Brief marketing",
  },
  {
    kind: "diecut",
    title: "Die cut",
    who: "Acheteur · Direction · Pilote · Fournisseur",
    hint: "Gabarit de découpe, tous formats (PDF, AI, DXF, EPS, ZIP…).",
    zip: "2 - Die cut",
  },
  {
    kind: "oldpack",
    title: "Ancien pack",
    who: "Acheteur · Direction · Pilote · Fournisseur",
    hint: "Pack existant à reprendre ou à faire évoluer.",
    zip: "3 - Ancien pack",
  },
  {
    kind: "pack",
    title: "Pack",
    who: "Designer",
    hint: "Fichier final du pack (AI, PDF…). Chaque dépôt crée une version qui part en validation.",
    zip: "4 - Pack",
  },
  {
    kind: "crea",
    title: "Dossier pack",
    who: "Designer",
    hint: "Tous les fichiers de travail : sources, rendus, typos… (un dossier entier peut être déposé).",
    zip: "5 - Dossier pack",
  },
  {
    kind: "quality",
    title: "Fiches qualité",
    who: "Acheteur · Direction · Pilote · Fournisseur",
    hint: "MSDS, fiche composition, certificats, rapports de test…",
    zip: "6 - Fiches qualité",
  },
];

function KindIcon({ f }: { f: PackFile }) {
  const e = ext(f.name);
  if (isImage(f)) return <FileImage size={16} />;
  if (["pdf", "ai", "eps", "psd", "indd", "dxf", "svg"].includes(e))
    return <FileText size={16} />;
  if (["zip", "rar", "7z"].includes(e)) return <Archive size={16} />;
  return <FileIcon size={16} />;
}

/** Miniature d'une image stockée (chargée à la demande) */
function Thumb({
  f,
  onOpen,
  big,
}: {
  f: PackFile;
  onOpen: (url: string) => void;
  big?: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let u: string | null = null;
    getBlob(f.id).then((b) => {
      if (b) {
        u = URL.createObjectURL(b);
        setUrl(u);
      }
    });
    return () => {
      if (u) URL.revokeObjectURL(u);
    };
  }, [f.id]);
  if (!url) return <span className="pf-file-ico">{<KindIcon f={f} />}</span>;
  return (
    <img
      className={big ? "ps-inspi" : "pf-file-thumb"}
      src={url}
      alt={f.name}
      onClick={() => onOpen(url)}
    />
  );
}

/**
 * Espace pack d'un produit, simple pour le designer : brief marketing, die cut, ancien pack,
 * pack (versions), dossier pack, fiches qualité. Chacun dépose ce qui le concerne ; tout le monde télécharge.
 */
export default function PackFiles({ p }: { p: Product }) {
  const { state, dispatch } = useStore();
  const auth = useAuth();
  const me = currentUser(state);
  const can = (kind: PackFileKind) => canPackFiles(state, me, p.id, kind);
  const files = p.pack.files ?? [];
  const of = (kind: PackFileKind) => files.filter((f) => f.kind === kind);
  const packs = of("pack").sort((a, b) => (b.version ?? 0) - (a.version ?? 0));
  const [busy, setBusy] = useState<string | null>(null);
  const [over, setOver] = useState<PackFileKind | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [docType, setDocType] = useState(QUALITY_TYPES[0]);
  const [brief, setBrief] = useState(p.pack.brief ?? "");
  const [briefSeen, setBriefSeen] = useState(p.pack.brief ?? "");
  if ((p.pack.brief ?? "") !== briefSeen) {
    setBriefSeen(p.pack.brief ?? "");
    setBrief(p.pack.brief ?? "");
  }
  const inputs = useRef<
    Partial<Record<PackFileKind | "dir", HTMLInputElement | null>>
  >({});
  const canBrief = auth.allowed({
    type: "setPackBrief",
    productId: p.id,
    brief: "",
  });

  async function upload(kind: PackFileKind, picked: PickedFile[]) {
    if (!picked.length) return;
    if (kind === "pack") picked = picked.slice(0, 1);
    if (kind === "brief")
      picked = picked.filter(
        ({ file }) =>
          file.type.startsWith("image/") || IMAGE.has(ext(file.name)),
      );
    if (!picked.length)
      return toast("Brief marketing : déposez des photos (JPG, PNG, WEBP…)");
    setBusy(`Envoi de ${picked.length} fichier(s)…`);
    try {
      const metas = [];
      for (const [i, { file, path }] of picked.entries()) {
        const id = newFileId(supplierScope(p.supplierId), `${p.id}-${kind}`, i);
        await putBlob(id, file);
        metas.push({
          id,
          name: file.name,
          path,
          size: file.size,
          type: file.type,
          ...(kind === "quality" ? { docType } : {}),
        });
      }
      dispatch({ type: "addPackFiles", productId: p.id, kind, files: metas });
      const title = SECTIONS.find((s) => s.kind === kind)!.title;
      toast(
        kind === "pack"
          ? `Pack V${Math.max(0, ...packs.map((f) => f.version ?? 0)) + 1} envoyé en validation`
          : `${metas.length} fichier(s) ajouté(s) : ${title}`,
      );
    } catch {
      toast("Envoi impossible : espace de stockage insuffisant ou refusé.");
    } finally {
      setBusy(null);
    }
  }

  async function download(f: PackFile) {
    const blob = await getBlob(f.id);
    if (!blob) return toast("Fichier introuvable sur cet appareil.");
    const r = await saveBlob(blob, f.name);
    if (r === "zipped")
      toast(
        `${f.name} téléchargé dans un .zip (format non téléchargeable tel quel ici)`,
      );
    if (r === "unavailable")
      toast("Téléchargement non disponible dans cette vue.");
  }

  async function downloadAll() {
    setBusy("Préparation du .zip…");
    try {
      const items = [];
      for (const s of SECTIONS) {
        const list = s.kind === "pack" ? packs.slice(0, 1) : of(s.kind);
        for (const f of list) {
          const blob = await getBlob(f.id);
          if (blob)
            items.push({
              path: `${s.zip}/${s.kind === "quality" && f.docType ? `${f.docType}/` : ""}${s.kind === "crea" ? f.path : f.name}`,
              blob,
            });
        }
      }
      if (!items.length)
        return toast("Aucun fichier disponible sur cet appareil.");
      const zip = await zipBlobs(items);
      const r = await saveBlob(zip, `${p.ref}_dossier_pack.zip`);
      if (r === "unavailable")
        toast("Téléchargement non disponible dans cette vue.");
    } finally {
      setBusy(null);
    }
  }

  async function remove(f: PackFile) {
    dispatch({ type: "removePackFile", productId: p.id, fileId: f.id });
    await deleteBlob(f.id).catch(() => undefined);
    toast(`${f.name} supprimé`);
  }

  const drop = (kind: PackFileKind) =>
    can(kind)
      ? {
          onDragOver: (e: React.DragEvent) => {
            if (!e.dataTransfer.types.includes("Files")) return;
            e.preventDefault();
            setOver(kind);
          },
          onDragLeave: () => setOver(null),
          onDrop: async (e: React.DragEvent) => {
            if (!e.dataTransfer.types.includes("Files")) return;
            e.preventDefault();
            setOver(null);
            upload(kind, await fromDrop(e.dataTransfer));
          },
        }
      : {};

  const fileLine = (f: PackFile, label?: ReactNode) => (
    <div key={f.id} className="pf-file">
      {isImage(f) ? (
        <Thumb f={f} onOpen={setPreview} />
      ) : (
        <span className="pf-file-ico">{<KindIcon f={f} />}</span>
      )}
      <span className="pf-file-name">
        <b title={f.path}>
          {label}
          {f.name}
        </b>
        <small>
          {fsize(f.size)} · {fstamp(f.uploadedAt)} · {f.uploadedBy}
        </small>
      </span>
      <button
        className="icon-btn"
        title="Télécharger"
        onClick={() => download(f)}
      >
        <Download size={16} />
      </button>
      {can(f.kind) && (
        <button
          className="icon-btn danger-ico"
          title="Supprimer"
          onClick={() => remove(f)}
        >
          <Trash2 size={16} />
        </button>
      )}
    </div>
  );

  /** Bouton de dépôt d'une rubrique (avec son champ fichier) */
  const pick = (
    kind: PackFileKind,
    label: string,
    opts: { multiple?: boolean; accept?: string; primary?: boolean } = {},
  ) =>
    can(kind) && (
      <>
        <input
          ref={(el) => {
            inputs.current[kind] = el;
          }}
          type="file"
          hidden
          multiple={opts.multiple}
          accept={opts.accept}
          aria-label={`Déposer : ${SECTIONS.find((s) => s.kind === kind)!.title}`}
          onChange={(e) => (
            upload(kind, fromInput(e.target.files)),
            (e.target.value = "")
          )}
        />
        <button
          className={`btn sm ${opts.primary ? "primary" : ""}`}
          onClick={() => inputs.current[kind]?.click()}
          disabled={!!busy}
        >
          <Upload size={14} /> {label}
        </button>
      </>
    );

  const status = (kind: PackFileKind) => {
    const n = kind === "pack" ? packs.length : of(kind).length;
    if (kind === "brief")
      return (
        (p.pack.brief ? "Texte" : "") +
          (n ? `${p.pack.brief ? " + " : ""}${n} photo(s)` : "") || "À faire"
      );
    if (kind === "pack") return n ? `V${packs[0].version}` : "À faire";
    return n ? `${n} fichier(s)` : kind === "oldpack" ? "Aucun" : "Manquant";
  };
  const done = (kind: PackFileKind) =>
    kind === "brief"
      ? !!p.pack.brief || of("brief").length > 0
      : of(kind).length > 0;

  const section = (
    kind: PackFileKind,
    actions: ReactNode,
    children: ReactNode,
  ) => {
    const s = SECTIONS.find((x) => x.kind === kind)!;
    return (
      <section
        className={`pf-drop ps-section ${over === kind ? "over" : ""} ${kind === "brief" ? "wide" : ""}`}
        aria-label={s.title}
        {...drop(kind)}
      >
        <header>
          <b>{s.title}</b>
          <span
            className={`ps-status ${done(kind) ? "ok" : kind === "oldpack" ? "" : "todo"}`}
          >
            {status(kind)}
          </span>
          <div className="grow" />
          {actions}
        </header>
        <div className="ps-who">Déposé par : {s.who}</div>
        {children}
        {can(kind) && (
          <div className="pf-hint">{s.hint} Glissez-déposez ici.</div>
        )}
      </section>
    );
  };

  // Dossier pack : arborescence
  const crea = of("crea").sort((a, b) => a.path.localeCompare(b.path));
  const folders = new Map<string, PackFile[]>();
  for (const f of crea) {
    const dir = f.path.includes("/")
      ? f.path.slice(0, f.path.lastIndexOf("/"))
      : "";
    folders.set(dir, [...(folders.get(dir) ?? []), f]);
  }
  const quality = of("quality");
  const qualityTypes = [...new Set(quality.map((f) => f.docType ?? "Autre"))];

  return (
    <div className="pf-files pack-space">
      {/* Où en est le pack : une case par rubrique */}
      <div className="ps-summary">
        {SECTIONS.map((s, i) => (
          <div
            key={s.kind}
            className={`ps-tile ${done(s.kind) ? "ok" : s.kind === "oldpack" ? "" : "todo"}`}
          >
            <span className="ps-num">{i + 1}</span>
            <div>
              <b>{s.title}</b>
              <small>{status(s.kind)}</small>
            </div>
          </div>
        ))}
      </div>

      <div className="ps-grid">
        {section(
          "brief",
          pick("brief", "Ajouter des photos", {
            multiple: true,
            accept: "image/*",
          }),
          <>
            {canBrief ? (
              <textarea
                className="input ps-brief"
                rows={4}
                aria-label="Texte du brief marketing"
                placeholder="Cible, positionnement, univers, couleurs, mentions obligatoires, prix de vente visé…"
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                onBlur={() => {
                  if (brief.trim() === (p.pack.brief ?? "")) return;
                  dispatch({ type: "setPackBrief", productId: p.id, brief });
                  toast("Brief marketing enregistré");
                }}
              />
            ) : p.pack.brief ? (
              <p className="ps-brief-text">{p.pack.brief}</p>
            ) : (
              <p className="muted small">Pas encore de brief écrit.</p>
            )}
            {of("brief").length > 0 && (
              <div className="ps-inspis">
                {of("brief").map((f) => (
                  <div key={f.id} className="ps-inspi-box">
                    <Thumb f={f} onOpen={setPreview} big />
                    {can("brief") && (
                      <button
                        className="icon-btn danger-ico"
                        title="Supprimer"
                        onClick={() => remove(f)}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>,
        )}

        {section(
          "diecut",
          pick("diecut", "Déposer le die cut", { multiple: true }),
          <>
            {of("diecut").map((f) => fileLine(f))}
            {!of("diecut").length && (
              <p className="muted small">
                {p.pack.dieCut === "requested"
                  ? "Demandé au fournisseur, pas encore reçu."
                  : "Pas encore de die cut."}
              </p>
            )}
          </>,
        )}

        {section(
          "oldpack",
          pick("oldpack", "Déposer l'ancien pack", { multiple: true }),
          <>
            {of("oldpack").map((f) => fileLine(f))}
            {!of("oldpack").length && (
              <p className="muted small">Aucun : nouveau pack.</p>
            )}
          </>,
        )}

        {section(
          "pack",
          pick("pack", packs.length ? "Nouvelle version" : "Uploader le pack", {
            primary: true,
          }),
          <>
            {packs.map((f, i) => (
              <div key={f.id} className={i === 0 ? "pf-current" : "pf-old"}>
                {fileLine(
                  f,
                  <span className={`pf-ver ${i === 0 ? "on" : ""}`}>
                    V{f.version}
                  </span>,
                )}
              </div>
            ))}
            {!packs.length && (
              <p className="muted small">Pas encore de pack déposé.</p>
            )}
          </>,
        )}

        {section(
          "crea",
          can("crea") && (
            <>
              {pick("crea", "Ajouter des fichiers", { multiple: true })}
              <input
                ref={(el) => {
                  inputs.current.dir = el;
                }}
                type="file"
                multiple
                hidden
                aria-label="Déposer un dossier : Dossier pack"
                {...({ webkitdirectory: "", directory: "" } as Record<
                  string,
                  string
                >)}
                onChange={(e) => (
                  upload("crea", fromInput(e.target.files)),
                  (e.target.value = "")
                )}
              />
              <button
                className="btn sm"
                onClick={() => inputs.current.dir?.click()}
                disabled={!!busy}
              >
                <FolderUp size={14} /> Ajouter un dossier
              </button>
            </>
          ),
          <>
            {[...folders.entries()].map(([dir, list]) => (
              <div key={dir || "/"} className="pf-folder">
                {dir && (
                  <div className="pf-folder-name">
                    <Folder size={15} /> {dir} <small>{list.length}</small>
                  </div>
                )}
                {list.map((f) => fileLine(f))}
              </div>
            ))}
            {!crea.length && (
              <p className="muted small">Pas encore de fichiers.</p>
            )}
          </>,
        )}

        {section(
          "quality",
          can("quality") && (
            <>
              <select
                className="input ps-doctype"
                aria-label="Type de fiche qualité"
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
              >
                {QUALITY_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
              {pick("quality", "Déposer", { multiple: true })}
            </>
          ),
          <>
            {qualityTypes.map((t) => (
              <div key={t} className="pf-folder">
                <div className="pf-folder-name">
                  <FileText size={15} /> {t}
                </div>
                {quality
                  .filter((f) => (f.docType ?? "Autre") === t)
                  .map((f) => fileLine(f))}
              </div>
            ))}
            {!quality.length && (
              <p className="muted small">Pas encore de fiche qualité.</p>
            )}
          </>,
        )}
      </div>

      {files.length > 0 && (
        <button className="btn sm" onClick={downloadAll} disabled={!!busy}>
          <Archive size={14} /> Tout télécharger (.zip)
        </button>
      )}
      {busy && (
        <div className="pf-busy">
          <Loader2 size={15} className="spin" /> {busy}
        </div>
      )}

      {preview && (
        <div className="pf-preview" onClick={() => setPreview(null)}>
          <img src={preview} alt="Aperçu" />
          <button className="icon-btn" aria-label="Fermer">
            <X size={22} />
          </button>
        </div>
      )}
    </div>
  );
}
