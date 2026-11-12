import { entryEffect } from "./ledger";
import { formatINR, type Paise } from "./money";
import type { Entry, PaymentMode } from "./types";

/**
 * Party statements + messages. One builder feeds the on-screen statement, the WhatsApp text and the PDF,
 * so every place shows the same numbers. Roman Hindi / Marathi / English (as in PRD §10).
 */
export type Lang = "hi" | "mr" | "en";

export interface StatementInput {
  businessName: string; partyName: string; opening: Paise; entries: Entry[];
  materialNames: Record<string, string>; siteNames: Record<string, string>;
  from?: string; to: string; siteId?: string | null; lang: Lang;
}
export interface StatementRow {
  entryId: string; date: string; text: string; site?: string; amount: Paise /* signed: + owes more, − paid/credited */; balance: Paise; kind: "line" | "payment" | "other";
}
export interface Statement {
  businessName: string; partyName: string; lang: Lang; from?: string; to: string; siteName?: string;
  opening: Paise; rows: StatementRow[]; closing: Paise; totalSales: Paise; totalReceived: Paise;
}

const L = {
  hi: { stmt: "Hisaab", opening: "Purana baaki", closing: "Kul baaki", period: "se", received: "Mila", payment: "Bhugtan", charge: "Gaadi bhada / Charge", discount: "Discount", ret: "Wapas", site: "Site", date: "Tareekh", item: "Maal", amount: "Rakam", balance: "Baaki", greet: "Namaste", thanks: "Dhanyavaad!", site_bal: "Site ka baaki", today: "Aaj", forSite: "ke liye", total: "Total", yourBalance: "Aapka kul baaki", received2: "prapt hua", more: "pehle ki entries chhodi gayi hain" },
  mr: { stmt: "Hisheb", opening: "Juna baaki", closing: "Ekun baaki", period: "pasun", received: "Milale", payment: "Bhugtan", charge: "Gaadi bhada / Charge", discount: "Discount", ret: "Parat", site: "Site", date: "Tareekh", item: "Maal", amount: "Rakkam", balance: "Baaki", greet: "Namaskar", thanks: "Dhanyavaad!", site_bal: "Site cha baaki", today: "Aaj", forSite: "sathi", total: "Ekun", yourBalance: "Tumcha ekun baaki", received2: "milale", more: "adhichya entries vagalya aahet" },
  en: { stmt: "Statement", opening: "Opening balance", closing: "Total due", period: "to", received: "Received", payment: "Payment", charge: "Transport / Charge", discount: "Discount", ret: "Return", site: "Site", date: "Date", item: "Item", amount: "Amount", balance: "Balance", greet: "Hello", thanks: "Thank you!", site_bal: "Site balance", today: "Today", forSite: "for", total: "Total", yourBalance: "Your total balance", received2: "received", more: "earlier entries omitted" },
} as const;
export const labels = (lang: Lang) => L[lang];

const MODE: Record<Lang, Record<PaymentMode, string>> = {
  hi: { cash: "Cash", upi: "Online/UPI", cheque: "Cheque", bank: "Bank" },
  mr: { cash: "Cash", upi: "Online/UPI", cheque: "Cheque", bank: "Bank" },
  en: { cash: "Cash", upi: "UPI", cheque: "Cheque", bank: "Bank" },
};
const qty = (milli: number) => String(Math.round(milli) / 1000);
const dm = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}`;

/** Describes one sale/return line, e.g. "JSW 80 bag × ₹360". */
export function lineText(name: string, quantity: number, unit: string, rate: Paise): string {
  return `${name} ${qty(quantity)} ${unit} × ${formatINR(rate)}`;
}

export function buildStatement(inp: StatementInput): Statement {
  const t = L[inp.lang];
  const active = inp.entries.filter((e) => e.status === "active" && (inp.siteId === undefined || inp.siteId === null || e.siteId === inp.siteId));
  const sorted = [...active].sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? -1 : 1)); // stable: keeps entry order within a day
  const siteOnly = inp.siteId !== undefined && inp.siteId !== null;
  let opening = siteOnly ? 0 : inp.opening;
  if (inp.from) for (const e of sorted) if (e.date < inp.from) opening += entryEffect(e);

  const rows: StatementRow[] = [];
  let bal = opening, sales = 0, received = 0;
  for (const e of sorted) {
    if ((inp.from && e.date < inp.from) || e.date > inp.to) continue;
    const site = e.siteId ? inp.siteNames[e.siteId] : undefined;
    const push = (text: string, amount: Paise, kind: StatementRow["kind"]) => { bal += amount; rows.push({ entryId: e.id, date: e.date, text, site, amount, balance: bal, kind }); };
    if (e.lines && e.lines.length > 0) {
      for (const l of e.lines) {
        const total = entryEffectOfLine(l.quantity, l.rate, l.gstBp);
        const signed = e.type === "return" ? -total : total;
        push((e.type === "return" ? `${t.ret}: ` : "") + lineText(inp.materialNames[l.materialId] ?? "Item", l.quantity, l.unit, l.rate), signed, "line");
        if (signed > 0) sales += signed;
      }
    } else {
      const eff = entryEffect(e);
      if (e.type === "payment") { push(`${t.payment} (${MODE[inp.lang][e.paymentMode ?? "cash"]})`, eff, "payment"); received += -eff; }
      else push(e.type === "charge" ? t.charge : t.discount, eff, "other");
    }
  }
  return {
    businessName: inp.businessName, partyName: inp.partyName, lang: inp.lang, from: inp.from, to: inp.to,
    siteName: siteOnly ? inp.siteNames[inp.siteId!] : undefined, opening, rows, closing: bal, totalSales: sales, totalReceived: received,
  };
}

// round half away from zero, same as entryTotals.lineTotal (kept local to avoid a cycle)
function entryEffectOfLine(quantity: number, rate: Paise, gstBp?: number): Paise {
  const num = quantity * rate * (10000 + (gstBp ?? 0)), den = 1000 * 10000;
  return Math.floor((2 * num + den) / (2 * den));
}

/** WhatsApp-ready statement text. Long statements keep the most recent rows. */
export function statementText(s: Statement, maxRows = 40): string {
  const t = L[s.lang];
  const shown = s.rows.slice(-maxRows);
  const out: string[] = [];
  out.push(`*${s.businessName}*`);
  out.push(`${t.stmt}: ${s.partyName}${s.siteName ? ` (${t.site}: ${s.siteName})` : ""}`);
  if (s.from) out.push(`${dm(s.from)} ${t.period} ${dm(s.to)}`);
  out.push("");
  out.push(`${t.opening}: ${formatINR(s.opening)}`);
  if (shown.length < s.rows.length) out.push(`(${s.rows.length - shown.length} ${t.more})`);
  for (const r of shown) {
    const amt = r.amount < 0 ? `− ${formatINR(-r.amount)}` : formatINR(r.amount);
    out.push(`${dm(r.date)} ${r.text}${r.site ? ` [${r.site}]` : ""}${r.kind === "line" ? ` = ${amt}` : `: ${amt}`}`);
  }
  out.push("");
  out.push(`*${s.siteName ? t.site_bal : t.closing}: ${formatINR(s.closing)}*`);
  return out.join("\n");
}

/** Message sent right after an entry is saved (PRD §10 templates). */
export function entryMessage(a: {
  lang: Lang; businessName: string; partyName: string; date: string; siteName?: string;
  kind: "sale" | "payment" | "other"; items?: string[]; total: Paise; paymentMode?: PaymentMode; newBalance: Paise;
}): string {
  const t = L[a.lang];
  const name = `${a.partyName} ji`;
  if (a.kind === "payment") {
    return `${name}, ${formatINR(a.total)} (${MODE[a.lang][a.paymentMode ?? "cash"]}) ${t.received2}. ${t.thanks}\n${t.balance}: ${formatINR(a.newBalance)}\n— ${a.businessName}`;
  }
  const what = a.items?.length ? a.items.join(", ") + ". " : "";
  return `${t.greet} ${name},\n${dm(a.date)}${a.siteName ? ` ${t.forSite} ${a.siteName}` : ""}: ${what}${t.total} ${formatINR(a.total)}.\n${t.yourBalance}: ${formatINR(a.newBalance)}\n— ${a.businessName}`;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** Printable statement page (used for the PDF). Same rows as the text version. */
export function statementHtml(s: Statement): string {
  const t = L[s.lang];
  const rupee = (p: Paise) => (p < 0 ? `− ${formatINR(-p)}` : formatINR(p));
  const rows = s.rows.map((r) => `<tr><td>${dm(r.date)}</td><td>${esc(r.text)}${r.site ? ` <small>[${esc(r.site)}]</small>` : ""}</td><td class="n${r.amount < 0 ? " g" : ""}">${rupee(r.amount)}</td><td class="n">${formatINR(r.balance)}</td></tr>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
body{font:14px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;color:#1d2433;padding:24px}h1{margin:0;font-size:22px;color:#1f3a8a}h2{margin:4px 0 16px;font-size:16px;font-weight:600}
table{border-collapse:collapse;width:100%}th{text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#5d6678;border-bottom:2px solid #1f3a8a;padding:6px}
td{padding:7px 6px;border-bottom:1px solid #e6e9e1}.n{text-align:right;font-variant-numeric:tabular-nums}.g{color:#1b7a3a}tr.tot td{border-top:2px solid #1f3a8a;font-weight:700;font-size:16px}small{color:#5d6678}</style></head><body>
<h1>${esc(s.businessName)}</h1><h2>${t.stmt}: ${esc(s.partyName)}${s.siteName ? ` (${t.site}: ${esc(s.siteName)})` : ""}${s.from ? ` · ${dm(s.from)} ${t.period} ${dm(s.to)}` : ""}</h2>
<table><thead><tr><th>${t.date}</th><th>${t.item}</th><th class="n">${t.amount}</th><th class="n">${t.balance}</th></tr></thead><tbody>
<tr><td></td><td><b>${t.opening}</b></td><td></td><td class="n"><b>${formatINR(s.opening)}</b></td></tr>${rows}
<tr class="tot"><td></td><td>${s.siteName ? t.site_bal : t.closing}</td><td></td><td class="n">${formatINR(s.closing)}</td></tr></tbody></table></body></html>`;
}
