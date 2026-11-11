import { entryEffect } from "./ledger.js";
import type { Paise } from "./money.js";
import type { Entry } from "./types.js";

export interface DueItem {
  entryId: string; // "opening" for the opening balance
  siteId?: string | null;
  date: string;
  amount: Paise;
  paid: Paise;
  outstanding: Paise;
}

export interface AllocationResult {
  dues: DueItem[];
  /** Credit that could not be matched to any due (advance payment). */
  unallocated: Paise;
}

/**
 * BR-5 / FR-34: payments (and discounts/returns, which also reduce dues)
 * are applied oldest-first. A payment tagged to a site only settles that
 * site's dues; untagged payments settle everything oldest-first.
 * Debits = sales + charges; opening balance is the oldest due.
 */
export function allocatePayments(opening: Paise, entries: Entry[], openingDate = "0000-00-00"): AllocationResult {
  const dues: DueItem[] = [];
  if (opening > 0) {
    dues.push({ entryId: "opening", date: openingDate, amount: opening, paid: 0, outstanding: opening });
  }
  const ordered = [...entries].sort((a, b) => (a.date === b.date ? (a.id < b.id ? -1 : 1) : a.date < b.date ? -1 : 1));
  for (const e of ordered) {
    const eff = entryEffect(e);
    if (eff > 0) {
      dues.push({ entryId: e.id, siteId: e.siteId ?? null, date: e.date, amount: eff, paid: 0, outstanding: eff });
    }
  }
  let unallocated = opening < 0 ? -opening : 0;
  for (const e of ordered) {
    const eff = entryEffect(e);
    if (eff >= 0) continue;
    let credit = -eff;
    for (const d of dues) {
      if (credit === 0) break;
      if (e.siteId && d.siteId !== e.siteId) continue;
      const take = Math.min(credit, d.outstanding);
      d.paid += take;
      d.outstanding -= take;
      credit -= take;
    }
    unallocated += credit;
  }
  return { dues, unallocated };
}

/** Days overdue = days since the oldest outstanding due (for sorting/reminders). */
export function oldestOutstandingDays(dues: DueItem[], today: string): number | null {
  const open = dues.filter((d) => d.outstanding > 0).sort((a, b) => (a.date < b.date ? -1 : 1))[0];
  if (!open) return null;
  const ms = Date.parse(`${today}T00:00:00Z`) - Date.parse(`${open.date}T00:00:00Z`);
  return Math.floor(ms / 86_400_000);
}
