import { lineTotal } from "./entryTotals";
import { rupeesToPaise, toMilliQty, type MilliQty, type Paise } from "./money";
import type { EntryType, PaymentMode } from "./types";
import { validUnit, type MaterialRef } from "./materials";

/** Text-field helpers: what the dealer types ("1,200", "1.5") → integers. null = invalid. */
function parseDecimal(s: string, maxDp: number): number | null {
  const t = s.trim().replace(/,/g, "");
  if (!new RegExp(`^\\d+(\\.\\d{1,${maxDp}})?$`).test(t)) return null;
  return Number(t);
}
export function parseQty(s: string): MilliQty | null {
  const n = parseDecimal(s, 3);
  return n === null || n <= 0 ? null : toMilliQty(n);
}
export function parseRupees(s: string): Paise | null {
  const n = parseDecimal(s, 2);
  return n === null ? null : rupeesToPaise(n);
}

export interface DraftLine { materialId?: string; unit?: string; qty: string; rate: string }
export interface DraftInput {
  businessId: string; partyId: string; siteId?: string | null; type: EntryType; date: string;
  lines: DraftLine[]; amount: string; paymentMode?: PaymentMode | null;
  source?: "voice" | "manual"; transcript?: string;
}
export interface EntryPayload {
  business_id: string; party_id: string; site_id: string | null; type: EntryType; entry_date: string;
  amount: Paise; payment_mode: PaymentMode | null; source: "voice" | "manual"; transcript: string | null;
  lines: { material_id: string; quantity: MilliQty; unit: string; rate: Paise; gst_bp: number | null; line_total: Paise }[];
}
export type DraftIssueCode = "date" | "items" | "item" | "unit" | "qty" | "rate" | "amount" | "mode";
/** Machine-readable form of each error so the app can show it in any language. `line` is 1-based. */
export interface DraftIssue { code: DraftIssueCode; line?: number }
export interface DraftResult { errors: string[]; issues: DraftIssue[]; payload?: EntryPayload; total: Paise; lineTotals: Paise[] }

/**
 * Validates a half-typed entry and builds the payload for save_entry.
 * Rule from the shop: the RATE must be stated on every sale/return line.
 * All maths happens here, in code — never in the AI.
 */
export function buildDraft(input: DraftInput, materials: MaterialRef[]): DraftResult {
  const errors: string[] = [];
  const issues: DraftIssue[] = [];
  const err = (message: string, code: DraftIssueCode, line?: number) => { errors.push(message); issues.push({ code, line }); };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || Number.isNaN(Date.parse(input.date))) err("Date is not valid", "date");
  const lines: EntryPayload["lines"] = [];
  const lineTotals: Paise[] = [];
  let total = 0;

  if (input.type === "sale" || input.type === "return") {
    if (input.lines.length === 0) err("Add at least one item", "items");
    input.lines.forEach((l, i) => {
      const n = i + 1;
      const m = materials.find((x) => x.id === l.materialId);
      if (!m) { err(`Item ${n}: choose the item`, "item", n); return; }
      if (!l.unit || !validUnit(m, l.unit)) { err(`Item ${n}: choose a unit for ${m.name}`, "unit", n); return; }
      const quantity = parseQty(l.qty);
      if (quantity === null) { err(`Item ${n}: enter the quantity`, "qty", n); return; }
      const rate = parseRupees(l.rate);
      if (rate === null || rate <= 0) { err(`Item ${n}: enter the rate`, "rate", n); return; }
      const lt = lineTotal({ materialId: m.id, quantity, unit: l.unit, rate });
      lines.push({ material_id: m.id, quantity, unit: l.unit, rate, gst_bp: null, line_total: lt });
      lineTotals.push(lt);
      total += lt;
    });
  } else {
    const a = parseRupees(input.amount);
    if (a === null || a <= 0) err("Enter the amount", "amount");
    else total = a;
    if (input.type === "payment" && !input.paymentMode) err("Choose how it was paid", "mode");
  }
  if (errors.length) return { errors, issues, total, lineTotals };
  return {
    errors, issues, total, lineTotals,
    payload: {
      business_id: input.businessId, party_id: input.partyId, site_id: input.siteId ?? null, type: input.type,
      entry_date: input.date, amount: total, payment_mode: input.type === "payment" ? (input.paymentMode ?? null) : null,
      source: input.source ?? "manual", transcript: input.transcript ?? null, lines,
    },
  };
}
