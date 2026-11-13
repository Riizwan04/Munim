import { allocatePayments } from "./allocation";
import { entryEffect, partyBalance } from "./ledger";
import { formatINR, type Paise } from "./money";
import { lineText } from "./statement";
import type { Entry } from "./types";

/**
 * Business reports (FR-70/72). Pure functions: the same numbers feed the screen, the shared text, the CSV and the PDF.
 * Only active entries count; replaced (edited) and cancelled versions never do.
 */
export interface ReportInput {
  parties: { id: string; name: string; opening: Paise }[];
  entries: (Entry & { createdOrder?: number })[];
  materials: Record<string, { name: string; category?: string | null }>;
  sites: Record<string, string>;
  from?: string; to: string;
}
export interface Summary { sales: Paise; returns: Paise; charges: Paise; discounts: Paise; collections: Paise; netChange: Paise; receivable: Paise }
export interface MaterialRow { materialId: string; name: string; category: string; qtyByUnit: Record<string, number>; amount: Paise }
export interface PartyRowR { partyId: string; name: string; sales: Paise; collections: Paise; balance: Paise }
export interface SiteRow { partyId: string; partyName: string; siteId: string | null; siteName: string; sales: Paise }
export interface AgingRow { partyId: string; name: string; b0: Paise; b31: Paise; b61: Paise; b90: Paise; total: Paise }
export interface Report { from?: string; to: string; summary: Summary; byMaterial: MaterialRow[]; byParty: PartyRowR[]; bySite: SiteRow[]; aging: AgingRow[] }

const inRange = (d: string, from: string | undefined, to: string) => (!from || d >= from) && d <= to;
const lineAmount = (q: number, r: number, gst?: number) => {
  const num = q * r * (10000 + (gst ?? 0)), den = 1000 * 10000;
  return Math.floor((2 * num + den) / (2 * den));
};
const daysBetween = (a: string, b: string) => Math.floor((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

export function buildReport(inp: ReportInput): Report {
  const active = inp.entries.filter((e) => e.status === "active" && e.date <= inp.to);
  const pName = Object.fromEntries(inp.parties.map((p) => [p.id, p.name]));
  const summary: Summary = { sales: 0, returns: 0, charges: 0, discounts: 0, collections: 0, netChange: 0, receivable: 0 };
  const mat = new Map<string, MaterialRow>();
  const party = new Map<string, PartyRowR>(inp.parties.map((p) => [p.id, { partyId: p.id, name: p.name, sales: 0, collections: 0, balance: 0 }]));
  const site = new Map<string, SiteRow>();

  for (const e of active) {
    if (!inRange(e.date, inp.from, inp.to)) continue;
    const eff = entryEffect(e);
    const pr = party.get(e.partyId);
    if (e.type === "sale") {
      summary.sales += eff;
      if (pr) pr.sales += eff;
      const key = `${e.partyId}|${e.siteId ?? ""}`;
      const s = site.get(key) ?? { partyId: e.partyId, partyName: pName[e.partyId] ?? "?", siteId: e.siteId ?? null, siteName: e.siteId ? (inp.sites[e.siteId] ?? "?") : "", sales: 0 };
      s.sales += eff; site.set(key, s);
      for (const l of e.lines ?? []) {
        const m = inp.materials[l.materialId];
        const row = mat.get(l.materialId) ?? { materialId: l.materialId, name: m?.name ?? "?", category: m?.category ?? "", qtyByUnit: {}, amount: 0 };
        row.qtyByUnit[l.unit] = (row.qtyByUnit[l.unit] ?? 0) + l.quantity;
        row.amount += lineAmount(l.quantity, l.rate, l.gstBp);
        mat.set(l.materialId, row);
      }
    } else if (e.type === "return") summary.returns += -eff;
    else if (e.type === "charge") summary.charges += eff;
    else if (e.type === "discount") summary.discounts += -eff;
    else if (e.type === "payment" && eff < 0) { summary.collections += -eff; if (pr) pr.collections += -eff; }
  }
  summary.netChange = summary.sales + summary.charges - summary.returns - summary.discounts - summary.collections;

  const aging: AgingRow[] = [];
  for (const p of inp.parties) {
    const mine = active.filter((e) => e.partyId === p.id);
    const bal = partyBalance(p.opening, mine);
    party.get(p.id)!.balance = bal;
    summary.receivable += Math.max(bal, 0);
    if (bal <= 0) continue;
    const first = mine.map((e) => e.date).sort()[0] ?? inp.to;
    const row: AgingRow = { partyId: p.id, name: p.name, b0: 0, b31: 0, b61: 0, b90: 0, total: 0 };
    for (const d of allocatePayments(p.opening, mine, first).dues) {
      if (d.outstanding <= 0) continue;
      const age = Math.max(daysBetween(d.date, inp.to), 0);
      if (age <= 30) row.b0 += d.outstanding; else if (age <= 60) row.b31 += d.outstanding; else if (age <= 90) row.b61 += d.outstanding; else row.b90 += d.outstanding;
      row.total += d.outstanding;
    }
    aging.push(row);
  }
  aging.sort((a, b) => b.total - a.total);
  return {
    from: inp.from, to: inp.to, summary,
    byMaterial: [...mat.values()].sort((a, b) => b.amount - a.amount),
    byParty: [...party.values()].filter((p) => p.sales || p.collections || p.balance).sort((a, b) => b.balance - a.balance),
    bySite: [...site.values()].sort((a, b) => b.sales - a.sales),
    aging,
  };
}

export const qtyText = (qtyByUnit: Record<string, number>) => Object.entries(qtyByUnit).map(([u, q]) => `${Math.round(q) / 1000} ${u}`).join(" + ");
const dm = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}`;

/** Plain text for WhatsApp / sharing. English; the screen itself is translated. */
export function reportText(r: Report, businessName: string): string {
  const s = r.summary;
  const out = [`*${businessName}*`, `Report${r.from ? `: ${dm(r.from)} to ${dm(r.to)}` : `: until ${dm(r.to)}`}`, ""];
  out.push(`Sales: ${formatINR(s.sales)}`, `Received: ${formatINR(s.collections)}`);
  if (s.charges) out.push(`Charges: ${formatINR(s.charges)}`);
  if (s.discounts) out.push(`Discounts: ${formatINR(s.discounts)}`);
  if (s.returns) out.push(`Returns: ${formatINR(s.returns)}`);
  out.push(`*Total receivable: ${formatINR(s.receivable)}*`, "");
  if (r.byMaterial.length) { out.push("*By item*"); for (const m of r.byMaterial.slice(0, 15)) out.push(`${m.name}: ${qtyText(m.qtyByUnit)} = ${formatINR(m.amount)}`); out.push(""); }
  const top = r.byParty.filter((p) => p.balance > 0).slice(0, 10);
  if (top.length) { out.push("*Highest balances*"); for (const p of top) out.push(`${p.name}: ${formatINR(p.balance)}`); }
  return out.join("\n");
}

const q = (v: string | number) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const rupees = (p: Paise) => (p / 100).toFixed(2);
const csv = (rows: (string | number)[][]) => rows.map((r) => r.map(q).join(",")).join("\n");

export const materialCsv = (r: Report) => csv([["Item", "Category", "Quantity", "Amount (INR)"], ...r.byMaterial.map((m) => [m.name, m.category, qtyText(m.qtyByUnit), rupees(m.amount)])]);
export const partyCsv = (r: Report) => csv([["Party", "Sales (INR)", "Received (INR)", "Balance (INR)"], ...r.byParty.map((p) => [p.name, rupees(p.sales), rupees(p.collections), rupees(p.balance)])]);
export const agingCsv = (r: Report) => csv([["Party", "0-30 days", "31-60 days", "61-90 days", "Over 90 days", "Total"], ...r.aging.map((a) => [a.name, rupees(a.b0), rupees(a.b31), rupees(a.b61), rupees(a.b90), rupees(a.total)])]);

/** Every active entry as one row per line. Doubles as the "export all my data" backup (NFR Backup). */
export function entriesCsv(inp: Pick<ReportInput, "parties" | "entries" | "materials" | "sites">): string {
  const pName = Object.fromEntries(inp.parties.map((p) => [p.id, p.name]));
  const rows: (string | number)[][] = [["Date", "Party", "Site", "Type", "Item", "Quantity", "Unit", "Rate (INR)", "Amount (INR)", "Payment mode"]];
  for (const e of [...inp.entries].filter((x) => x.status === "active").sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))) {
    const base = [e.date, pName[e.partyId] ?? "", e.siteId ? (inp.sites[e.siteId] ?? "") : "", e.type];
    if (e.lines && e.lines.length) for (const l of e.lines) rows.push([...base, inp.materials[l.materialId]?.name ?? "", Math.round(l.quantity) / 1000, l.unit, rupees(l.rate), rupees(lineAmount(l.quantity, l.rate, l.gstBp)), ""]);
    else rows.push([...base, "", "", "", "", rupees(Math.abs(entryEffect(e))), e.paymentMode ?? ""]);
  }
  return csv(rows);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export function reportHtml(r: Report, businessName: string): string {
  const s = r.summary;
  const tr = (cells: string[], cls = "") => `<tr class="${cls}">${cells.map((c, i) => `<td${i > 0 ? ' class="n"' : ""}>${c}</td>`).join("")}</tr>`;
  const table = (head: string[], rows: string[]) => `<table><thead><tr>${head.map((h, i) => `<th${i > 0 ? ' class="n"' : ""}>${h}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
body{font:14px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;color:#1d2433;padding:24px}h1{margin:0;font-size:22px;color:#1f3a8a}h2{font-size:16px;margin:20px 0 6px}
table{border-collapse:collapse;width:100%}th{text-align:left;font-size:12px;text-transform:uppercase;color:#5d6678;border-bottom:2px solid #1f3a8a;padding:6px}td{padding:6px;border-bottom:1px solid #e6e9e1}.n{text-align:right;font-variant-numeric:tabular-nums}</style></head><body>
<h1>${esc(businessName)}</h1><div>Report ${r.from ? `${dm(r.from)} to ${dm(r.to)}` : `until ${dm(r.to)}`}</div>
<h2>Summary</h2>${table(["", "Amount"], [tr(["Sales", formatINR(s.sales)]), tr(["Received", formatINR(s.collections)]), tr(["Charges", formatINR(s.charges)]), tr(["Discounts", formatINR(s.discounts)]), tr(["Returns", formatINR(s.returns)]), tr(["Total receivable", formatINR(s.receivable)], "b")])}
<h2>By item</h2>${table(["Item", "Quantity", "Amount"], r.byMaterial.map((m) => tr([esc(m.name), qtyText(m.qtyByUnit), formatINR(m.amount)])))}
<h2>By party</h2>${table(["Party", "Sales", "Received", "Balance"], r.byParty.map((p) => tr([esc(p.name), formatINR(p.sales), formatINR(p.collections), formatINR(p.balance)])))}
<h2>Ageing of dues</h2>${table(["Party", "0-30", "31-60", "61-90", "90+", "Total"], r.aging.map((a) => tr([esc(a.name), formatINR(a.b0), formatINR(a.b31), formatINR(a.b61), formatINR(a.b90), formatINR(a.total)])))}
</body></html>`;
}
export { lineText };
