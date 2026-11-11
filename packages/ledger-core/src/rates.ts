import type { Paise } from "./money.js";
import type { Entry } from "./types.js";

/**
 * RATE POLICY (from the shop's real khata): every customer has their own
 * price, per item/brand, and it changes. So the person making the entry
 * MUST state the rate on every line. Saved rates are only *suggestions*
 * the assistant can mention ("pichli baar ₹360 tha, wahi?") — never silently used.
 */
export type SuggestionSource = "last_for_party" | "reference";

export interface RateSuggestion {
  rate: Paise;
  source: SuggestionSource;
  date?: string;
}

/** Most recent rate this party paid for this material (from past active sales). */
export function lastRateForParty(entries: Entry[], partyId: string, materialId: string): RateSuggestion | undefined {
  let best: { rate: Paise; date: string; id: string } | undefined;
  for (const e of entries) {
    if (e.partyId !== partyId || e.type !== "sale" || e.status === "cancelled") continue;
    for (const l of e.lines ?? []) {
      if (l.materialId !== materialId) continue;
      if (!best || e.date > best.date || (e.date === best.date && e.id > best.id)) {
        best = { rate: l.rate, date: e.date, id: e.id };
      }
    }
  }
  return best && { rate: best.rate, source: "last_for_party", date: best.date };
}

/** Suggestion: last rate for this party, else optional shop reference price. */
export function suggestRate(args: {
  entries: Entry[];
  partyId: string;
  materialId: string;
  referenceRate?: Paise; // optional price list, informational only
}): RateSuggestion | undefined {
  return (
    lastRateForParty(args.entries, args.partyId, args.materialId) ??
    (args.referenceRate !== undefined ? { rate: args.referenceRate, source: "reference" } : undefined)
  );
}

/**
 * Validation for a spoken line: rate is mandatory. Returns the follow-up
 * the assistant should ask, or null when the line is complete.
 */
export function missingRatePrompt(spokenRate: Paise | undefined, suggestion?: RateSuggestion): null | { ask: "rate"; suggestion?: RateSuggestion } {
  if (spokenRate !== undefined && spokenRate > 0) return null;
  return { ask: "rate", suggestion };
}

/** Flag a rate far from the party's last rate so the assistant double-checks (typo guard). */
export function rateLooksUnusual(rate: Paise, suggestion?: RateSuggestion, tolerance = 0.25): boolean {
  if (!suggestion || suggestion.rate === 0) return false;
  return Math.abs(rate - suggestion.rate) / suggestion.rate > tolerance;
}
