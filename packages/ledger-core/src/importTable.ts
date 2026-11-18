import { normalizeDate, type ScannedPage, type ScannedRow } from "./importPage";
import { foldDevanagari } from "./phonetic";
import type { EntryType, PaymentMode } from "./types";

/**
 * Old entries from a spreadsheet: a CSV/TSV file, or cells pasted from Excel / Google Sheets. Columns are recognised by their headings
 * (English, Hindi, Hinglish) or, with no heading row, by the order date · item · qty · unit · rate · amount. The rows then go through the
 * same review as a scanned page (checks, matching to your items, duplicates), and nothing is saved until the owner taps Import.
 */
const H: Record<string, string[]> = {
  date: ["date", "tarikh", "tareekh", "dinank", "तारीख", "तारीख़", "दिनांक", "तारिख", "तारीक"],
  party: ["party", "customer", "name", "client", "grahak", "ग्राहक", "नाम", "पार्टी", "कस्टमर"],
  item: ["item", "items", "particulars", "particular", "material", "description", "maal", "saman", "विवरण", "माल", "सामान", "आइटम", "वस्तु", "तपशील"],
  qty: ["qty", "quantity", "nos", "matra", "sankhya", "मात्रा", "संख्या", "नग", "संख्या"],
  unit: ["unit", "units", "uom", "यूनिट", "एकक"],
  rate: ["rate", "price", "bhav", "bhaav", "dar", "daam", "भाव", "दर", "रेट", "दाम", "किंमत"],
  amount: ["amount", "total", "value", "rakam", "rashi", "raqam", "रकम", "रक्कम", "राशि", "रकमा", "कुल"],
  debit: ["debit", "dr", "udhar", "उधार", "नावे"],
  credit: ["credit", "cr", "jama", "received", "जमा", "प्राप्त", "जमा"],
  type: ["type", "kind", "entry", "प्रकार"],
  mode: ["mode", "payment mode", "paymode", "मोड"],
  site: ["site", "साइट"],
  balance: ["balance", "bal", "baaki", "baki", "बाकी", "शिल्लक"],
};
const norm = (s: string) => foldDevanagari(s.toLowerCase().replace(/[.:()_\-/]/g, " ").replace(/\s+/g, " ").trim());
const HN = Object.fromEntries(Object.entries(H).map(([k, v]) => [k, v.map(norm)]));
const field = (cell: string): string | null => { const c = norm(cell); for (const [k, v] of Object.entries(HN)) if (v.includes(c)) return k; return null; };

/** Splits CSV/TSV text into cells (quotes, commas inside quotes, tabs from Excel). */
export function parseTable(text: string): string[][] {
  const t = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n").trim();
  if (!t) return [];
  const first = t.split("\n")[0]!;
  const delim = [["\t", (first.match(/\t/g) ?? []).length], [",", (first.match(/,/g) ?? []).length], [";", (first.match(/;/g) ?? []).length], ["|", (first.match(/\|/g) ?? []).length]].sort((a, b) => (b[1] as number) - (a[1] as number))[0]![0] as string;
  const rows: string[][] = []; let cur: string[] = []; let cell = ""; let q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i]!;
    if (q) { if (c === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === delim) { cur.push(cell.trim()); cell = ""; }
    else if (c === "\n") { cur.push(cell.trim()); rows.push(cur); cur = []; cell = ""; }
    else cell += c;
  }
  cur.push(cell.trim()); rows.push(cur);
  return rows.filter((r) => r.some((x) => x !== ""));
}

const num = (s: string | undefined): number | undefined => { if (!s) return undefined; const v = s.replace(/[₹,\s]/g, "").replace(/^\((.*)\)$/, "-$1"); return /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : undefined; };
const KINDS: Record<string, EntryType> = { sale: "sale", sales: "sale", goods: "sale", bikri: "sale", udhar: "sale", payment: "payment", paid: "payment", received: "payment", receipt: "payment", jama: "payment", credit: "payment", पेमेंट: "payment", जमा: "payment", return: "return", wapas: "return", वापस: "return", discount: "discount", chhoot: "discount", छूट: "discount", charge: "charge", transport: "charge", bhada: "charge", भाड़ा: "charge" };
const kindOf = (s: string | undefined): EntryType | undefined => (s ? KINDS[norm(s)] : undefined);
const modeOf = (s: string | undefined): PaymentMode | undefined => { const m = norm(s ?? ""); return /upi|gpay|phonepe|paytm|online/.test(m) ? "upi" : /cash|nakad|रोख|नकद/.test(m) ? "cash" : /cheque|check|चेक/.test(m) ? "cheque" : /bank|neft|rtgs/.test(m) ? "bank" : undefined; };

export interface TableResult { page?: ScannedPage; error?: string; skippedOtherParties: number; headings: Record<string, number>; }

/** `forParty`: when the sheet has a customer column, only that customer's rows are used (the rest are counted, to import customer by customer). */
export function tableToPage(text: string, opts: { year: number; forParty?: (name: string) => boolean }): TableResult {
  const grid = parseTable(text);
  if (grid.length === 0) return { error: "empty", skippedOtherParties: 0, headings: {} };
  const probe = grid[0]!.map(field);
  const hasHeader = probe.filter(Boolean).length >= 2;
  const cols: Record<string, number> = {};
  if (hasHeader) probe.forEach((f, i) => { if (f && !(f in cols)) cols[f] = i; });
  else ["date", "item", "qty", "unit", "rate", "amount"].forEach((f, i) => { cols[f] = i; });
  if (!("date" in cols) || (!("amount" in cols) && !("debit" in cols) && !("credit" in cols) && !("qty" in cols))) return { error: "columns", skippedOtherParties: 0, headings: cols };
  const body = hasHeader ? grid.slice(1) : grid;
  const get = (r: string[], k: string) => (k in cols ? (r[cols[k]!] ?? "").trim() : "");
  const rows: ScannedRow[] = []; let skipped = 0; let opening: number | undefined;
  for (const r of body) {
    if (opts.forParty && "party" in cols && get(r, "party") && !opts.forParty(get(r, "party"))) { skipped++; continue; }
    const item = get(r, "item");
    const dateTxt = get(r, "date");
    if (/^(opening|purana|पुराना|ओपनिंग)/i.test(item) || /^(opening|purana)/i.test(dateTxt)) { opening = num(get(r, "amount")) ?? num(get(r, "balance")) ?? opening; continue; }
    if (/^(total|balance|closing|कुल)/i.test(item) || /^(total|balance)/i.test(dateTxt)) continue;       // lines written at the bottom are not entries
    const debit = num(get(r, "debit")), credit = num(get(r, "credit"));
    let amount = num(get(r, "amount"));
    let kind: EntryType | undefined = kindOf(get(r, "type"));
    if (debit !== undefined && debit > 0) { amount = debit; kind ??= "sale"; }
    if (credit !== undefined && credit > 0) { amount = credit; kind ??= "payment"; }
    const qty = num(get(r, "qty")), rate = num(get(r, "rate"));
    const mode = modeOf(get(r, "mode")) ?? (kind === "payment" ? modeOf(item) : undefined);
    if (!kind) kind = item && !/^(payment|paid|received|jama|cash|upi|online|cheque|जमा)/i.test(item) ? "sale" : amount !== undefined || mode ? "payment" : "sale";
    const row: ScannedRow = { date: normalizeDate(dateTxt, opts.year), kind, qty, unit: get(r, "unit") || undefined, rate, amount, site: get(r, "site") || undefined, mode };
    if (kind === "sale" || kind === "return") row.item = item || undefined;
    if (!row.date && !item && amount === undefined && qty === undefined) continue; // an empty line
    rows.push(row);
  }
  if (!hasHeader && rows.every((x) => !x.date)) return { error: "columns", skippedOtherParties: skipped, headings: cols }; // no headings and no dates: this is not an entries sheet
  if (!rows.length) return { error: "norows", skippedOtherParties: skipped, headings: cols };
  return { page: { rows, openingBalance: opening, year: opts.year }, skippedOtherParties: skipped, headings: cols };
}

/** A small example the owner can start from. */
export const IMPORT_TEMPLATE = "Date,Item,Qty,Unit,Rate,Amount,Type\n03-11-2026,Waddi,80,bag,390,,sale\n04-11-2026,,,,,50000,payment\n";
