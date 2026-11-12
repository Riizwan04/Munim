import { allocatePayments, oldestOutstandingDays } from "./allocation";
import { entryEffect, partyBalance } from "./ledger";
import type { Paise } from "./money";
import type { Entry } from "./types";

export interface PartyStats { balance: Paise; todaySales: Paise; todayCollections: Paise; overdueDays: number | null }

/** Dashboard numbers for one party (FR-70, FR-71). Overdue = days since the oldest unpaid due (FIFO, BR-5). */
export function partyStats(opening: Paise, entries: Entry[], today: string): PartyStats {
  const active = entries.filter((e) => e.status === "active");
  let todaySales = 0, todayCollections = 0;
  for (const e of active) {
    if (e.date !== today) continue;
    const eff = entryEffect(e);
    if (e.type === "sale" && eff > 0) todaySales += eff;
    if (e.type === "payment" && eff < 0) todayCollections += -eff;
  }
  const first = active.map((e) => e.date).sort()[0] ?? today;
  const { dues } = allocatePayments(opening, active, first);
  return { balance: partyBalance(opening, entries), todaySales, todayCollections, overdueDays: oldestOutstandingDays(dues, today) };
}
