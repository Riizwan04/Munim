import { entryNotice, type EntryPayload, type NoticeKind } from "@munim/ledger-core";
import { loadParties } from "./data";
import { supabase } from "./supabase";

/**
 * After the shop saves, corrects or cancels an entry, tell that customer's phones (if they turned notifications on).
 * Fire-and-forget: a failure here must never get in the way of the shop's work, and customers without notifications are simply skipped.
 * The text is built here with ledger-core (every number from code); the server function only delivers it.
 */
export async function notifyParty(partyId: string, kind: NoticeKind, amount?: number): Promise<void> {
  try {
    const ov = await loadParties();
    const p = ov.parties.find((x) => x.id === partyId);
    if (!p) return;
    const lang = p.language === "hi" || p.language === "mr" ? p.language : "en";
    const n = entryNotice({ lang, businessName: ov.business, kind, amount, balance: p.balance });
    await supabase.functions.invoke("notify-entry", { body: { party_id: partyId, title: n.title, body: n.body } });
  } catch { /* never disturb the shop */ }
}

/** Amount of a freshly saved entry: payments/charges/discounts carry it, sales and returns are the sum of their lines. */
export const payloadAmount = (p: EntryPayload): number => (p.type === "sale" || p.type === "return" ? p.lines.reduce((s, l) => s + l.line_total, 0) : p.amount);
