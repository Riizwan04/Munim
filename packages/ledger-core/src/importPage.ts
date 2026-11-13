import { buildDraft, type DraftInput, type DraftLine, type EntryPayload } from "./entryDraft";
import { matchMaterial, validUnit, type MaterialRef } from "./materials";
import { formatINR, rupeesToPaise, type Paise } from "./money";
import { sameWord } from "./phonetic";
import { normalizeUnit } from "./understand";
import type { EntryType, PaymentMode } from "./types";

/**
 * Importing a handwritten khata page. An extractor (a person, or an AI vision model) turns the photo into ScannedPage;
 * everything after that is plain code: checks against the page's own written balances, matching to your items and sites,
 * and building entries that go through the normal save path. Nothing is saved until the dealer reviews it.
 */
export interface ScannedRow {
  date?: string; kind?: EntryType; item?: string; qty?: number; unit?: string; rate?: number /* rupees */; amount?: number /* rupees */;
  site?: string; mode?: PaymentMode;
}
export interface ScannedPage {
  partyName?: string; openingBalance?: number /* rupees, balance carried to the top of the page */;
  rows: ScannedRow[];
  /** Balances written on the page: `balance` is the running balance after row index `afterRow` (0-based). */
  balances?: { afterRow: number; balance: number }[];
  total?: number /* rupees, written at the bottom */; year?: number;
}

const KINDS = ["sale", "payment", "charge", "discount", "return"];
const num = (v: unknown): number | undefined => { if (typeof v === "number" && Number.isFinite(v)) return v; if (typeof v === "string" && /^-?[\d,]+(\.\d+)?$/.test(v.trim())) return Number(v.replace(/,/g, "")); return undefined; };

/** "03-11", "3/11", "03-11-2026", "2026-11-03" → "2026-11-03". `year` fills in a missing year. */
export function normalizeDate(s: string | undefined, year: number): string | undefined {
  if (!s) return undefined;
  const t = s.trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2]!.padStart(2, "0")}-${m[3]!.padStart(2, "0")}`;
  m = t.match(/^(\d{1,2})[-/.](\d{1,2})(?:[-/.](\d{2,4}))?$/);
  if (!m) return undefined;
  const y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : year;
  const d = Number(m[1]), mo = Number(m[2]);
  if (d < 1 || d > 31 || mo < 1 || mo > 12) return undefined;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Reads the extractor's JSON (tolerates ``` fences and extra text) into a ScannedPage. */
export function parseScanJson(text: string, defaultYear: number): { page?: ScannedPage; error?: string } {
  let raw: any;
  try {
    const a = text.indexOf("{"), b = text.lastIndexOf("}");
    raw = JSON.parse(text.slice(a, b + 1));
  } catch { return { error: "This is not valid JSON." }; }
  if (!raw || !Array.isArray(raw.rows)) return { error: 'Missing the "rows" list.' };
  const year = num(raw.year) ?? defaultYear;
  const rows: ScannedRow[] = raw.rows.map((r: any) => ({
    date: normalizeDate(typeof r.date === "string" ? r.date : undefined, year),
    kind: KINDS.includes(r.kind) ? r.kind : undefined,
    item: typeof r.item === "string" ? r.item : undefined, qty: num(r.qty), unit: typeof r.unit === "string" ? r.unit : undefined,
    rate: num(r.rate), amount: num(r.amount), site: typeof r.site === "string" && r.site.trim() ? r.site.trim() : undefined,
    mode: ["cash", "upi", "cheque", "bank"].includes(r.mode) ? r.mode : undefined,
  }));
  const balances = Array.isArray(raw.balances) ? raw.balances.map((x: any) => ({ afterRow: num(x?.afterRow), balance: num(x?.balance) })).filter((x: any) => x.afterRow !== undefined && x.balance !== undefined) : undefined;
  return { page: { partyName: typeof raw.partyName === "string" ? raw.partyName : undefined, openingBalance: num(raw.openingBalance), rows, balances, total: num(raw.total), year } };
}

const kindOf = (r: ScannedRow): EntryType => r.kind ?? (r.item ? "sale" : r.mode ? "payment" : "sale");
const rowAmount = (r: ScannedRow): Paise | undefined => {
  if (r.amount !== undefined) return rupeesToPaise(r.amount);
  if (r.qty !== undefined && r.rate !== undefined) return Math.round(r.qty * 1000 * rupeesToPaise(r.rate) / 1000);
  return undefined;
};
const effect = (r: ScannedRow): Paise => { const a = rowAmount(r) ?? 0; const k = kindOf(r); return k === "payment" || k === "discount" || k === "return" ? -a : a; };

export interface Check { label: "balance" | "total"; afterRow?: number; written: Paise; computed: Paise; ok: boolean }
export interface RowIssue { row: number; code: "no-amount" | "no-date" | "qty-rate-amount" | "no-item" | "no-qty" }
export interface Reconciliation { opening: Paise; computedTotal: Paise; checks: Check[]; rowIssues: RowIssue[]; ok: boolean }

/** Uses the numbers written on the page as checksums: a misread digit makes a written balance disagree with the arithmetic. */
export function reconcilePage(page: ScannedPage): Reconciliation {
  const opening = rupeesToPaise(page.openingBalance ?? 0);
  const rowIssues: RowIssue[] = [];
  const running: Paise[] = [];
  let bal = opening;
  page.rows.forEach((r, i) => {
    const k = kindOf(r);
    if (rowAmount(r) === undefined) rowIssues.push({ row: i, code: "no-amount" });
    if (!r.date) rowIssues.push({ row: i, code: "no-date" });
    if (k === "sale" || k === "return") {
      if (!r.item) rowIssues.push({ row: i, code: "no-item" });
      if (r.qty === undefined) rowIssues.push({ row: i, code: "no-qty" });
      if (r.qty !== undefined && r.rate !== undefined && r.amount !== undefined && Math.abs(r.qty * r.rate - r.amount) > 1) rowIssues.push({ row: i, code: "qty-rate-amount" });
    }
    bal += effect(r);
    running.push(bal);
  });
  const checks: Check[] = [];
  for (const b of page.balances ?? []) {
    const computed = running[b.afterRow];
    if (computed === undefined) continue;
    const written = rupeesToPaise(b.balance);
    checks.push({ label: "balance", afterRow: b.afterRow, written, computed, ok: written === computed });
  }
  if (page.total !== undefined) {
    const written = rupeesToPaise(page.total);
    checks.push({ label: "total", written, computed: bal, ok: written === bal });
  }
  return { opening, computedTotal: bal, checks, rowIssues, ok: checks.every((c) => c.ok) && rowIssues.length === 0 };
}

export interface ImportContext {
  businessId: string; partyId: string; materials: MaterialRef[]; sites: { id: string; name: string }[];
  existing?: { date: string; type: EntryType; amount: Paise }[]; today: string;
}
export type Problem =
  | { row: number; code: "material"; spoken: string; options: MaterialRef[] }
  | { row: number; code: "unit"; options: string[] }
  | { row: number; code: "site"; spoken: string; options: { id: string; name: string }[] }
  | { row: number; code: "mode" }
  | { row: number; code: "amount-drift"; written: Paise; computed: Paise };
export interface PreparedEntry { rows: number[]; draft: DraftInput; payload?: EntryPayload; errors: string[]; total: Paise; problems: Problem[]; duplicate: boolean }
export interface PreparedImport { entries: PreparedEntry[]; problems: Problem[]; ready: boolean; reconciliation: Reconciliation }

const plain = (n: number) => String(Math.round(n * 100) / 100);

/** Groups rows into entries (consecutive sale rows with the same date and site become one entry) and validates them. */
export function prepareImport(page: ScannedPage, ctx: ImportContext): PreparedImport {
  const entries: PreparedEntry[] = [];
  let open: PreparedEntry | null = null;
  let openKey = "";
  page.rows.forEach((r, i) => {
    const kind = kindOf(r);
    const problems: Problem[] = [];
    let siteId: string | null = null;
    if (r.site) {
      const hit = ctx.sites.filter((s) => s.name.toLowerCase().split(/\s+/).every((w) => r.site!.toLowerCase().split(/\s+/).some((x) => sameWord(x, w))));
      if (hit.length === 1) siteId = hit[0]!.id; else problems.push({ row: i, code: "site", spoken: r.site, options: hit.length ? hit : ctx.sites });
    }
    const date = r.date ?? ctx.today;
    if (kind === "sale" || kind === "return") {
      const m = matchMaterial(r.item ?? "", ctx.materials);
      let material: MaterialRef | undefined;
      if (m.kind === "match") material = m.material; else problems.push({ row: i, code: "material", spoken: r.item ?? "", options: m.kind === "ambiguous" ? m.options : [] });
      let unit = r.unit ? normalizeUnit(r.unit) : undefined;
      if (material) {
        if (!unit && material.units.length === 1) unit = material.units[0];
        if (!unit || !validUnit(material, unit)) { problems.push({ row: i, code: "unit", options: material.units }); unit = undefined; }
      }
      // handwritten pages show quantity and amount, not the rate: rate = amount ÷ quantity
      let rate = r.rate;
      if (rate === undefined && r.qty && r.amount !== undefined) rate = Math.round((r.amount * 100) / r.qty) / 100;
      const line: DraftLine = { materialId: material?.id, unit, qty: r.qty === undefined ? "" : plain(r.qty), rate: rate === undefined ? "" : plain(rate) };
      const written = r.amount !== undefined ? rupeesToPaise(r.amount) : undefined;
      if (written !== undefined && r.qty && rate !== undefined) {
        const computed = Math.round(r.qty * 1000 * rupeesToPaise(rate) / 1000);
        if (computed !== written) problems.push({ row: i, code: "amount-drift", written, computed });
      }
      const key = `${kind}|${date}|${siteId ?? ""}`;
      if (open && openKey === key) { open.draft.lines.push(line); open.rows.push(i); open.problems.push(...problems); return; }
      open = { rows: [i], draft: { businessId: ctx.businessId, partyId: ctx.partyId, siteId, type: kind, date, lines: [line], amount: "" }, errors: [], total: 0, problems, duplicate: false };
      openKey = key; entries.push(open);
      return;
    }
    open = null;
    let mode = r.mode;
    if (kind === "payment" && !mode) problems.push({ row: i, code: "mode" });
    entries.push({ rows: [i], draft: { businessId: ctx.businessId, partyId: ctx.partyId, siteId, type: kind, date, lines: [], amount: r.amount === undefined ? "" : plain(r.amount), paymentMode: mode ?? null }, errors: [], total: 0, problems, duplicate: false });
  });

  const all: Problem[] = [];
  for (const e of entries) {
    const res = buildDraft({ ...e.draft, source: "manual", transcript: "Imported from a scanned page" }, ctx.materials);
    e.errors = res.errors; e.payload = res.payload; e.total = res.total;
    e.duplicate = !!ctx.existing?.some((x) => x.date === e.draft.date && x.type === e.draft.type && x.amount === res.total && res.total > 0);
    all.push(...e.problems);
  }
  const reconciliation = reconcilePage(page);
  const ready = entries.length > 0 && entries.every((e) => e.payload && e.problems.every((p) => p.code === "amount-drift"));
  return { entries, problems: all, ready, reconciliation };
}

export const checkText = (c: Check) => `${c.label === "total" ? "Total" : `Balance after row ${(c.afterRow ?? 0) + 1}`}: written ${formatINR(c.written)}, calculated ${formatINR(c.computed)}`;
