import { entryTotal } from "./entryTotals.js";
import type { Paise } from "./money.js";
import type { Entry } from "./types.js";

/** Signed effect of an entry on what the party owes (+ = owes more). BR-1, BR-7, BR-9. */
export function entryEffect(e: Entry): Paise {
  if (e.status === "cancelled") return 0;
  const amount =
    e.lines && e.lines.length > 0 ? entryTotal({ lines: e.lines }).total : (e.amount ?? 0);
  switch (e.type) {
    case "sale":
    case "charge":
      return amount;
    case "payment":
      return e.paymentMode === "cheque" && e.chequeBounced ? 0 : -amount;
    case "discount":
    case "return":
      return -amount;
  }
}

/** BR-1: opening + sales + charges − payments − discounts − returns. */
export function partyBalance(opening: Paise, entries: Entry[]): Paise {
  return entries.reduce((s, e) => s + entryEffect(e), opening);
}

/**
 * BR-2 / FR-33: per-site balance from entries tagged to the site.
 * Untagged entries are returned under `untagged`; party balance =
 * opening + sum(sites) + untagged.
 */
export function siteBalances(entries: Entry[]): { bySite: Record<string, Paise>; untagged: Paise } {
  const bySite: Record<string, Paise> = {};
  let untagged = 0;
  for (const e of entries) {
    const eff = entryEffect(e);
    if (e.siteId) bySite[e.siteId] = (bySite[e.siteId] ?? 0) + eff;
    else untagged += eff;
  }
  return { bySite, untagged };
}

/** BR-8: warn (never block) when a sale pushes the party past its credit limit. */
export function creditLimitWarning(args: {
  currentBalance: Paise;
  newEntryEffect: Paise;
  creditLimit?: Paise | null;
}): { exceeded: boolean; newBalance: Paise } {
  const newBalance = args.currentBalance + args.newEntryEffect;
  const exceeded = args.creditLimit != null && args.newEntryEffect > 0 && newBalance > args.creditLimit;
  return { exceeded, newBalance };
}
