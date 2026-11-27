// E-mails aux fournisseurs : textes (langue du fournisseur + anglais) et mise en page HTML aux couleurs de JONAS BUYING.
// Mise en page en tableaux et styles en ligne : lisible dans Gmail, Outlook, Apple Mail et les messageries chinoises.

export type MailLang = 'fr' | 'en' | 'zh';
export type MailKind = 'order' | 'signed' | 'diecut' | 'deposit' | 'pack';

export interface MailItem {
  ref: string;
  name: string;
  sub?: string;
}

export interface MailData {
  kind: MailKind;
  supplierName: string;
  contactName?: string;
  pfId?: string;
  pfTitle?: string;
  /** Montant déjà formaté dans la devise du fournisseur */
  amount?: string;
  /** Semaine de chargement souhaitée, ex. « S05 · 2027-02-04 » */
  loading?: string;
  items?: MailItem[];
  /** Pièces jointes (noms) et documents trop lourds laissés sur la plateforme */
  attached: string[];
  onPlatform: string[];
  link: string;
  company: { name: string; address?: string; city?: string };
  /** Personne de JONAS qui déclenche l'envoi (signature) */
  sender?: string;
}

interface Copy {
  subject: (d: MailData) => string;
  title: string;
  intro: (d: MailData) => string;
  button: string;
}

const T: Record<
  MailLang,
  {
    hello: (n?: string) => string;
    regards: string;
    attached: string;
    onPlatform: string;
    pf: string;
    amount: string;
    loading: string;
    items: string;
    linkHelp: string;
    auto: string;
    kinds: Record<MailKind, Copy>;
  }
> = {
  fr: {
    hello: (n) => (n ? `Bonjour ${n},` : 'Bonjour,'),
    regards: 'Cordialement,',
    attached: 'Pièces jointes',
    onPlatform: 'Disponible sur la plateforme',
    pf: 'Proforma',
    amount: 'Montant',
    loading: 'Chargement souhaité',
    items: 'Articles',
    linkHelp: 'Le bouton ouvre directement la bonne page de votre espace fournisseur JONAS BUYING.',
    auto: 'E-mail envoyé automatiquement par JONAS BUYING.',
    kinds: {
      order: {
        subject: (d) => `Nouvelle commande ${d.pfId} – merci d’envoyer votre proforma`,
        title: 'Nouvelle commande',
        intro: (d) => `JONAS INTERNATIONAL vous adresse une nouvelle commande (${d.items?.length ?? 0} article(s)). Merci d’établir votre proforma et de la déposer dans votre espace fournisseur.`,
        button: 'Déposer ma proforma',
      },
      signed: {
        subject: (d) => `Proforma ${d.pfId} signée – confirmation de commande`,
        title: 'Commande confirmée',
        intro: () => 'Nous avons signé votre proforma : la commande est confirmée. Vous trouverez la proforma signée et nos conditions d’achat en pièce jointe.',
        button: 'Voir la commande',
      },
      diecut: {
        subject: (d) => `Die cut demandé – ${d.items?.length ?? 0} article(s)`,
        title: 'Die cut demandé',
        intro: () => 'Merci de nous envoyer le die cut (gabarit de découpe) des articles ci-dessous pour démarrer la création des packs.',
        button: 'Déposer les die cuts',
      },
      deposit: {
        subject: (d) => `Acompte payé – ${d.pfId}`,
        title: 'Acompte payé',
        intro: (d) => `Nous avons réglé l’acompte${d.amount ? ` de ${d.amount}` : ''} pour la proforma ${d.pfId}.`,
        button: 'Voir mes paiements',
      },
      pack: {
        subject: (d) => `Pack validé par JONAS – à vérifier (${d.items?.length ?? 0} article(s))`,
        title: 'Pack à valider',
        intro: () => 'Le pack des articles ci-dessous est validé par JONAS. Merci de le vérifier et de le valider dans votre espace avant la production.',
        button: 'Valider le pack',
      },
    },
  },
  en: {
    hello: (n) => (n ? `Dear ${n},` : 'Hello,'),
    regards: 'Best regards,',
    attached: 'Attachments',
    onPlatform: 'Available on the platform',
    pf: 'Proforma',
    amount: 'Amount',
    loading: 'Requested loading',
    items: 'Items',
    linkHelp: 'The button opens the right page of your JONAS BUYING supplier space.',
    auto: 'E-mail sent automatically by JONAS BUYING.',
    kinds: {
      order: {
        subject: (d) => `New order ${d.pfId} – please send your proforma`,
        title: 'New order',
        intro: (d) => `JONAS INTERNATIONAL sends you a new order (${d.items?.length ?? 0} item(s)). Please prepare your proforma invoice and upload it in your supplier space.`,
        button: 'Upload my proforma',
      },
      signed: {
        subject: (d) => `Proforma ${d.pfId} signed – order confirmation`,
        title: 'Order confirmed',
        intro: () => 'We have signed your proforma: the order is confirmed. Please find the signed proforma and our purchase conditions attached.',
        button: 'View the order',
      },
      diecut: {
        subject: (d) => `Die cut requested – ${d.items?.length ?? 0} item(s)`,
        title: 'Die cut requested',
        intro: () => 'Please send us the die cut (cutting template) of the items below so that we can start the packaging artwork.',
        button: 'Upload the die cuts',
      },
      deposit: {
        subject: (d) => `Deposit paid – ${d.pfId}`,
        title: 'Deposit paid',
        intro: (d) => `We have paid the deposit${d.amount ? ` of ${d.amount}` : ''} for proforma ${d.pfId}.`,
        button: 'View my payments',
      },
      pack: {
        subject: (d) => `Packaging approved by JONAS – please check (${d.items?.length ?? 0} item(s))`,
        title: 'Packaging to approve',
        intro: () => 'The packaging artwork of the items below is approved by JONAS. Please check it and approve it in your space before production.',
        button: 'Approve the packaging',
      },
    },
  },
  zh: {
    hello: (n) => (n ? `${n}，您好：` : '您好：'),
    regards: '此致敬礼',
    attached: '附件',
    onPlatform: '可在平台上查看',
    pf: '形式发票',
    amount: '金额',
    loading: '期望装柜',
    items: '产品',
    linkHelp: '点击按钮可直接打开您在 JONAS BUYING 供应商门户中的相应页面。',
    auto: '此邮件由 JONAS BUYING 自动发送。',
    kinds: {
      order: {
        subject: (d) => `新订单 ${d.pfId} – 请提交形式发票`,
        title: '新订单',
        intro: (d) => `JONAS INTERNATIONAL 向您下了新订单（${d.items?.length ?? 0} 个产品）。请制作形式发票并上传到您的供应商门户。`,
        button: '上传形式发票',
      },
      signed: {
        subject: (d) => `形式发票 ${d.pfId} 已签署 – 订单确认`,
        title: '订单已确认',
        intro: () => '我们已签署您的形式发票，订单正式确认。附件为已签署的形式发票及我们的采购条款。',
        button: '查看订单',
      },
      diecut: {
        subject: (d) => `请提供刀模 – ${d.items?.length ?? 0} 个产品`,
        title: '请提供刀模',
        intro: () => '请发送以下产品的刀模（切割模板），以便我们开始包装设计。',
        button: '上传刀模',
      },
      deposit: {
        subject: (d) => `定金已支付 – ${d.pfId}`,
        title: '定金已支付',
        intro: (d) => `我们已支付形式发票 ${d.pfId} 的定金${d.amount ? `（${d.amount}）` : ''}。`,
        button: '查看付款',
      },
      pack: {
        subject: (d) => `包装设计已由 JONAS 确认 – 请审核（${d.items?.length ?? 0} 个产品）`,
        title: '请确认包装',
        intro: () => '以下产品的包装设计已由 JONAS 确认。请在生产前在您的门户中检查并确认。',
        button: '确认包装',
      },
    },
  },
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Langues de l'e-mail : celle du fournisseur puis l'anglais (une seule si c'est l'anglais) */
export const mailLangs = (lang: MailLang): MailLang[] => (lang === 'en' ? ['en'] : [lang, 'en']);

export function mailSubject(d: MailData, lang: MailLang) {
  const langs = mailLangs(lang);
  // Objet : langue du fournisseur / anglais
  return langs.map((l) => T[l].kinds[d.kind].subject(d)).join(' / ');
}

const GREEN = '#0f7a5c';
const GREEN_DARK = '#0b5e47';
const INK = '#14201c';
const MUTED = '#5f6d68';
const LINE = '#e3e9e6';
const ACCENT: Record<MailKind, string> = { order: '#1d6fd8', signed: GREEN, diecut: '#e0701a', deposit: '#7b2cbf', pack: GREEN };

function section(d: MailData, l: MailLang, first: boolean) {
  const t = T[l];
  const k = t.kinds[d.kind];
  const rows: [string, string][] = [];
  if (d.pfId) rows.push([t.pf, `${esc(d.pfId)}${d.pfTitle ? ` · ${esc(d.pfTitle)}` : ''}`]);
  if (d.amount) rows.push([t.amount, esc(d.amount)]);
  if (d.loading) rows.push([t.loading, esc(d.loading)]);
  const items = (d.items ?? []).slice(0, 30);
  return `
  <tr><td style="padding:${first ? '28px' : '8px'} 32px 0 32px;">
    ${first ? '' : `<div style="border-top:1px dashed ${LINE};margin:18px 0 22px 0;"></div>`}
    <div style="display:inline-block;padding:4px 12px;border-radius:999px;background:${ACCENT[d.kind]}1a;color:${ACCENT[d.kind]};font-size:12px;font-weight:700;letter-spacing:.3px;">${esc(k.title.toUpperCase())}</div>
    <p style="margin:18px 0 6px 0;font-size:16px;color:${INK};">${esc(t.hello(d.contactName))}</p>
    <p style="margin:0 0 16px 0;font-size:15px;line-height:1.55;color:${INK};">${esc(k.intro(d))}</p>
    ${
      rows.length
        ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;background:#f4f8f6;border-radius:12px;margin:0 0 14px 0;">${rows
            .map(
              ([a, b]) =>
                `<tr><td style="padding:9px 16px;font-size:13px;color:${MUTED};width:38%;">${esc(a)}</td><td style="padding:9px 16px;font-size:14px;font-weight:700;color:${INK};">${b}</td></tr>`,
            )
            .join('')}</table>`
        : ''
    }
    ${
      items.length
        ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${LINE};border-radius:12px;margin:0 0 14px 0;"><tr><td style="padding:10px 16px 4px 16px;font-size:12px;font-weight:700;color:${MUTED};text-transform:uppercase;">${esc(t.items)}</td></tr>${items
            .map(
              (i) =>
                `<tr><td style="padding:6px 16px;border-top:1px solid ${LINE};font-size:14px;color:${INK};"><b style="color:${GREEN_DARK};">${esc(i.ref)}</b> &nbsp;${esc(i.name)}${i.sub ? `<br><span style="font-size:12px;color:${MUTED};">${esc(i.sub)}</span>` : ''}</td></tr>`,
            )
            .join('')}${(d.items?.length ?? 0) > items.length ? `<tr><td style="padding:6px 16px;font-size:12px;color:${MUTED};">+ ${(d.items?.length ?? 0) - items.length}</td></tr>` : ''}</table>`
        : ''
    }
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 10px 0;"><tr><td style="border-radius:12px;background:${GREEN};">
      <a href="${esc(d.link)}" style="display:inline-block;padding:14px 26px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px;">${esc(k.button)} &rarr;</a>
    </td></tr></table>
    <p style="margin:0 0 10px 0;font-size:12px;color:${MUTED};">${esc(t.linkHelp)}</p>
    ${
      d.attached.length || d.onPlatform.length
        ? `<p style="margin:12px 0 4px 0;font-size:12px;font-weight:700;color:${MUTED};text-transform:uppercase;">📎 ${esc(t.attached)}</p>
           <p style="margin:0 0 6px 0;font-size:13px;color:${INK};line-height:1.6;">${d.attached.map(esc).join('<br>')}${
             d.onPlatform.length ? `${d.attached.length ? '<br>' : ''}<span style="color:${MUTED};">${esc(t.onPlatform)} : ${d.onPlatform.map(esc).join(', ')}</span>` : ''
           }</p>`
        : ''
    }
    <p style="margin:16px 0 0 0;font-size:14px;color:${INK};">${esc(t.regards)}<br><b>${esc(d.sender ? `${d.sender} – ` : '')}${esc(d.company.name || 'JONAS INTERNATIONAL')}</b></p>
  </td></tr>`;
}

/** E-mail complet (HTML) : en-tête JONAS INTERNATIONAL, langue du fournisseur, puis anglais */
export function mailHtml(d: MailData, lang: MailLang) {
  const langs = mailLangs(lang);
  const addr = [d.company.address, d.company.city]
    .filter(Boolean)
    .map((x) => esc(x!))
    .join(' · ');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(mailSubject(d, lang))}</title></head>
<body style="margin:0;padding:0;background:#eef3f1;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,'PingFang SC','Microsoft YaHei',sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef3f1;"><tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 4px 18px rgba(16,40,32,.08);">
  <tr><td align="center" style="padding:26px 32px 20px 32px;background:#ffffff;">
    <div style="font-family:'Arial Black',Arial,Helvetica,sans-serif;font-size:34px;line-height:1;font-weight:900;letter-spacing:7px;color:${INK};padding-left:7px;">JONAS</div>
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1;font-weight:700;letter-spacing:6.5px;color:${GREEN};margin-top:8px;padding-left:6.5px;">INTERNATIONAL</div>
    <div style="width:48px;height:3px;border-radius:3px;background:${GREEN};margin:14px auto 0 auto;font-size:0;line-height:0;">&nbsp;</div>
  </td></tr>
  <tr><td style="background:linear-gradient(135deg,${GREEN},${GREEN_DARK});background-color:${GREEN};padding:11px 32px;text-align:center;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:12.5px;letter-spacing:.6px;">
    JONAS BUYING &nbsp;·&nbsp; <b>${esc(d.supplierName)}</b>
  </td></tr>
  ${langs.map((l, i) => section(d, l, i === 0)).join('')}
  <tr><td style="padding:26px 32px 26px 32px;">
    <div style="border-top:1px solid ${LINE};padding-top:14px;font-size:11.5px;color:${MUTED};line-height:1.6;">
      <span style="font-family:'Arial Black',Arial,sans-serif;font-weight:900;letter-spacing:3px;color:${INK};">JONAS</span> <span style="font-weight:700;letter-spacing:3px;color:${GREEN};">INTERNATIONAL</span>${addr ? ` · ${addr}` : ''}<br>${langs.map((l) => esc(T[l].auto)).join(' · ')}
    </div>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}
