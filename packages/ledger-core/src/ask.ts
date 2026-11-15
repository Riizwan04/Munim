import { allocatePayments, oldestOutstandingDays } from "./allocation";
import { entryEffect, partyBalance, siteBalances } from "./ledger";
import type { MaterialRef } from "./materials";
import type { Paise } from "./money";
import { hasToken, sameWord } from "./phonetic";
import { tokenize } from "./spoken";
import { lastPayment, lastPurchase } from "./assistant";
import type { Entry, EntryType } from "./types";

/**
 * "Ask anything about my business". An AI model reads the question and chooses among the READ-ONLY tools below; the tools run here, in code, on
 * the signed-in owner's own copy of their data (so no other business can ever be reached, and no number is ever made up or calculated by the AI).
 * Only the question and the tool results leave the phone. Nothing here can change, save, send or delete anything.
 */
export interface AskParty { id: string; name: string; nicknames: string[]; opening: Paise; creditLimit: Paise | null; sites: { id: string; name: string }[] }
export interface AskData { today: string; parties: AskParty[]; entries: Entry[]; materials: MaterialRef[] }

export interface ToolDef { name: string; description: string; input_schema: Record<string, unknown> }
const str = (description: string) => ({ type: "string", description });
const date = (description: string) => ({ type: "string", description: `${description} (YYYY-MM-DD)` });
const ENTRY_TYPES = ["sale", "payment", "return", "charge", "discount"];

export const ASK_TOOLS: ToolDef[] = [
  { name: "find_party", description: "Find customers by (part of) a name or nickname. Returns up to 5 with their id and current balance. Use this first when a customer is named.", input_schema: { type: "object", properties: { query: str("name as spoken") }, required: ["query"] } },
  { name: "party_overview", description: "Everything summarised for ONE customer: balance, opening balance, credit limit, days overdue, total sales and payments, last payment, last purchase, number of entries, first entry date, and per-site balances.", input_schema: { type: "object", properties: { party_id: str("id from find_party") }, required: ["party_id"] } },
  { name: "list_entries", description: "List ledger entries (newest first, max 40), optionally filtered. Amounts are rupees. Cancelled entries are left out unless asked for.", input_schema: { type: "object", properties: { party_id: str("customer id"), type: { type: "string", enum: ENTRY_TYPES }, from: date("first date"), to: date("last date"), item: str("item name"), include_cancelled: { type: "boolean" }, limit: { type: "integer" } } } },
  { name: "totals", description: "Sum of sales, payments received, returns, charges and discounts, in rupees, plus the entry count, for any date range, customer and/or item. All sums are computed by code.", input_schema: { type: "object", properties: { from: date("first date"), to: date("last date"), party_id: str("customer id"), item: str("item name") } } },
  { name: "rank_parties", description: "Rank customers (top n, max 20) by: balance (who owes most), sales, payments, or overdue_days, optionally within a date range (sales and payments only).", input_schema: { type: "object", properties: { by: { type: "string", enum: ["balance", "sales", "payments", "overdue_days"] }, from: date("first date"), to: date("last date"), n: { type: "integer" } }, required: ["by"] } },
  { name: "item_report", description: "For ONE item (brand): quantity sold per unit, sales amount, average and latest rate, and its top buyers, optionally within a date range.", input_schema: { type: "object", properties: { item: str("item name"), from: date("first date"), to: date("last date") }, required: ["item"] } },
  { name: "rate_history", description: "The rates one customer was charged for one item over time (newest first, max 20).", input_schema: { type: "object", properties: { party_id: str("customer id"), item: str("item name") }, required: ["party_id", "item"] } },
  { name: "list_items", description: "The shop's item list: name, category and units.", input_schema: { type: "object", properties: {} } },
];

const rupees = (p: Paise) => Math.round(p / 100);
const norm = (s: string) => s.toLowerCase().trim();

function findParties(q: string, d: AskData) {
  const qt = tokenize(q);
  const names = (p: AskParty) => [p.name, ...p.nicknames];
  let hit = d.parties.filter((p) => names(p).some((n) => { const nt = tokenize(n); return nt.length && nt.every((w) => hasToken(qt, w)); }));
  if (!hit.length) hit = d.parties.filter((p) => names(p).some((n) => tokenize(n).some((w) => w.length >= 3 && qt.some((x) => x === w || sameWord(x, w)))));
  return hit.slice(0, 5);
}
function findItems(q: string, d: AskData): MaterialRef[] {
  const qt = tokenize(q);
  const all = d.materials.filter((m) => [m.name, ...m.localNames, m.category ?? ""].some((n) => { const nt = tokenize(n); return nt.length && nt.every((w) => hasToken(qt, w)); }));
  const exact = all.filter((m) => norm(m.name) === norm(q));
  return exact.length ? exact : all;
}
const inRange = (e: Entry, from?: string, to?: string) => (!from || e.date >= from) && (!to || e.date <= to);
const active = (d: AskData) => d.entries.filter((e) => e.status === "active");
const matName = (d: AskData, id: string) => d.materials.find((m) => m.id === id)?.name ?? "?";
const partyName = (d: AskData, id: string) => d.parties.find((p) => p.id === id)?.name ?? "?";
const entryAmount = (e: Entry): Paise => Math.abs(entryEffect(e));

function row(e: Entry, d: AskData) {
  return {
    id: e.id, date: e.date, type: e.type, status: e.status, customer: partyName(d, e.partyId), amount_rupees: rupees(entryAmount(e)), payment_mode: e.paymentMode ?? null,
    lines: (e.lines ?? []).map((l) => ({ item: matName(d, l.materialId), quantity: l.quantity / 1000, unit: l.unit, rate_rupees: rupees(l.rate), total_rupees: rupees(Math.round((l.quantity * l.rate) / 1000)) })),
  };
}

/** Runs one read-only tool on the owner's own data. Every number is computed here. Unknown tools / bad inputs return an error object for the model to read. */
export function runAskTool(name: string, input: Record<string, any>, d: AskData): unknown {
  const eventsOf = (partyId?: string) => (partyId ? d.entries.filter((e) => e.partyId === partyId) : d.entries);
  switch (name) {
    case "find_party": {
      const hits = findParties(String(input.query ?? ""), d);
      return { matches: hits.map((p) => ({ party_id: p.id, name: p.name, balance_rupees: rupees(partyBalance(p.opening, eventsOf(p.id))) })) };
    }
    case "party_overview": {
      const p = d.parties.find((x) => x.id === input.party_id);
      if (!p) return { error: "unknown party_id" };
      const es = eventsOf(p.id); const act = es.filter((e) => e.status === "active");
      const first = act.map((e) => e.date).sort()[0] ?? d.today;
      const { dues } = allocatePayments(p.opening, act, first);
      const lp = lastPayment(es); const lb = lastPurchase(es, (id) => matName(d, id));
      const sb = siteBalances(es);
      return {
        name: p.name, balance_rupees: rupees(partyBalance(p.opening, es)), opening_rupees: rupees(p.opening), credit_limit_rupees: p.creditLimit === null ? null : rupees(p.creditLimit),
        overdue_days: oldestOutstandingDays(dues, d.today), total_sales_rupees: rupees(act.filter((e) => e.type === "sale").reduce((s, e) => s + entryAmount(e), 0)),
        total_payments_rupees: rupees(act.filter((e) => e.type === "payment" && !e.chequeBounced).reduce((s, e) => s + entryAmount(e), 0)), entries: act.length, first_entry: act.length ? first : null,
        last_payment: lp ? { date: lp.date, amount_rupees: rupees(lp.amount), mode: lp.mode ?? null } : null,
        last_purchase: lb ? { date: lb.date, items: lb.items, total_rupees: rupees(lb.total) } : null,
        sites: [...Object.entries(sb.bySite).map(([id, v]) => ({ site: p.sites.find((s) => s.id === id)?.name ?? id, balance_rupees: rupees(v) })), ...(sb.untagged ? [{ site: "(no site)", balance_rupees: rupees(sb.untagged) }] : [])],
      };
    }
    case "list_entries": {
      const it = input.item ? findItems(String(input.item), d).map((m) => m.id) : null;
      let es = (input.include_cancelled ? d.entries : active(d)).filter((e) => (!input.party_id || e.partyId === input.party_id) && (!input.type || e.type === input.type) && inRange(e, input.from, input.to)
        && (!it || (e.lines ?? []).some((l) => it.includes(l.materialId))));
      es = es.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id.localeCompare(a.id)));
      const limit = Math.min(Math.max(Number(input.limit) || 20, 1), 40);
      return { count: es.length, shown: Math.min(es.length, limit), entries: es.slice(0, limit).map((e) => row(e, d)) };
    }
    case "totals": {
      const it = input.item ? findItems(String(input.item), d).map((m) => m.id) : null;
      const es = active(d).filter((e) => (!input.party_id || e.partyId === input.party_id) && inRange(e, input.from, input.to) && (!it || (e.lines ?? []).some((l) => it.includes(l.materialId))));
      const sum = (t: EntryType) => rupees(es.filter((e) => e.type === t && !(t === "payment" && e.chequeBounced)).reduce((s, e) => s + entryAmount(e), 0));
      const qty: Record<string, number> = {};
      if (it) for (const e of es) if (e.type === "sale") for (const l of e.lines ?? []) if (it.includes(l.materialId)) qty[l.unit] = (qty[l.unit] ?? 0) + l.quantity / 1000;
      return { entries: es.length, sales_rupees: sum("sale"), payments_rupees: sum("payment"), returns_rupees: sum("return"), charges_rupees: sum("charge"), discounts_rupees: sum("discount"), ...(it ? { quantity_sold_by_unit: qty } : {}) };
    }
    case "rank_parties": {
      const by = String(input.by); const n = Math.min(Math.max(Number(input.n) || 5, 1), 20);
      const rows = d.parties.map((p) => {
        const es = eventsOf(p.id);
        const act = es.filter((e) => e.status === "active" && inRange(e, input.from, input.to));
        const act2 = es.filter((e) => e.status === "active");
        const first = act2.map((e) => e.date).sort()[0] ?? d.today;
        const { dues } = allocatePayments(p.opening, act2, first);
        const v = by === "balance" ? partyBalance(p.opening, es) : by === "sales" ? act.filter((e) => e.type === "sale").reduce((s, e) => s + entryAmount(e), 0)
          : by === "payments" ? act.filter((e) => e.type === "payment" && !e.chequeBounced).reduce((s, e) => s + entryAmount(e), 0) : (oldestOutstandingDays(dues, d.today) ?? 0);
        return { party_id: p.id, name: p.name, value: by === "overdue_days" ? v : rupees(v) };
      }).filter((r) => r.value > 0).sort((a, b) => b.value - a.value).slice(0, n);
      return { ranked_by: by, unit: by === "overdue_days" ? "days" : "rupees", rows };
    }
    case "item_report": {
      const ms = findItems(String(input.item ?? ""), d);
      if (!ms.length) return { error: "no such item", hint: "call list_items" };
      const ids = ms.map((m) => m.id);
      const qty: Record<string, number> = {}; let amount = 0; const buyers: Record<string, number> = {}; let latest: { date: string; rate: number } | undefined; let rateSum = 0, rateN = 0;
      for (const e of active(d).filter((x) => x.type === "sale" && inRange(x, input.from, input.to))) for (const l of e.lines ?? []) if (ids.includes(l.materialId)) {
        const t = Math.round((l.quantity * l.rate) / 1000);
        qty[l.unit] = (qty[l.unit] ?? 0) + l.quantity / 1000; amount += t; buyers[e.partyId] = (buyers[e.partyId] ?? 0) + t; rateSum += l.rate; rateN++;
        if (!latest || e.date >= latest.date) latest = { date: e.date, rate: l.rate };
      }
      return { items: ms.map((m) => m.name), quantity_sold_by_unit: qty, sales_rupees: rupees(amount), average_rate_rupees: rateN ? rupees(rateSum / rateN) : null, latest_rate: latest ? { date: latest.date, rate_rupees: rupees(latest.rate) } : null,
        top_buyers: Object.entries(buyers).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, v]) => ({ name: partyName(d, id), sales_rupees: rupees(v) })) };
    }
    case "rate_history": {
      const ids = findItems(String(input.item ?? ""), d).map((m) => m.id);
      const out: { date: string; item: string; rate_rupees: number; quantity: number; unit: string }[] = [];
      for (const e of active(d).filter((x) => x.partyId === input.party_id && x.type === "sale")) for (const l of e.lines ?? []) if (ids.includes(l.materialId)) out.push({ date: e.date, item: matName(d, l.materialId), rate_rupees: rupees(l.rate), quantity: l.quantity / 1000, unit: l.unit });
      return { rates: out.sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 20) };
    }
    case "list_items":
      return { items: d.materials.slice(0, 200).map((m) => ({ name: m.name, category: m.category ?? null, units: m.units })) };
    default:
      return { error: `unknown tool ${name}` };
  }
}

/** Is this a question for the books (so it goes to the reader) rather than a ledger entry? Entries always carry numbers and no question words. */
export function looksLikeQuestion(text: string, hasNumbers: boolean, hasQuestionWord: boolean): boolean {
  if (!hasQuestionWord) return /\?\s*$/.test(text.trim());
  return !hasNumbers || /\?\s*$/.test(text.trim()) || /^\s*(what|when|which|who|how|show|list|tell|give|kitn|kab|kaun|kya|batao|dikha|क्या|कौन|कब|कितन|बताओ|दिखाओ)/i.test(text);
}
