import type { Lang, StatementInput } from "./statement";
import { formatINR } from "./money";
import type { Entry, EntryType, PaymentMode } from "./types";

/**
 * What the public statement function (get_statement) returns, and how it becomes the same Statement the dealer sees.
 * The customer's page uses buildStatement/statementText, so its numbers match the dealer's ledger exactly.
 */
export interface PublicStatementPayload {
  business: { name: string; tagline?: string };
  party: { name: string; opening_balance: number; language?: string | null };
  sites: { id: string; name: string }[];
  entries: {
    id: string; date: string; type: EntryType; amount: number; payment_mode?: PaymentMode | null; site_id?: string | null;
    lines: { name: string; quantity: number; unit: string; rate: number; gst_bp?: number | null; line_total: number }[];
  }[];
  expires_at: string; generated_at: string;
}
export type PublicError = "invalid" | "locked" | "pin_required" | "wrong_pin";
export const isPublicError = (x: unknown): x is { error: PublicError } => !!x && typeof x === "object" && typeof (x as { error?: unknown }).error === "string";

/** Maps the payload to builder input. Item names travel with each line, so a stable per-name id stands in for material ids. */
export function payloadToStatementInput(p: PublicStatementPayload, o: { from?: string; to: string; siteId?: string | null; lang: Lang }): StatementInput {
  const materialNames: Record<string, string> = {};
  const entries: Entry[] = p.entries.map((e) => ({
    id: e.id, partyId: "party", siteId: e.site_id ?? null, type: e.type, date: e.date, status: "active" as const,
    amount: e.type === "sale" || e.type === "return" ? undefined : Number(e.amount), paymentMode: e.payment_mode ?? undefined,
    lines: e.lines.map((l) => { const id = `m:${l.name}`; materialNames[id] = l.name; return { materialId: id, quantity: Number(l.quantity), unit: l.unit, rate: Number(l.rate), gstBp: l.gst_bp ?? undefined }; }),
  }));
  return {
    businessName: p.business.name, partyName: p.party.name, opening: Number(p.party.opening_balance), entries, materialNames,
    siteNames: Object.fromEntries(p.sites.map((s) => [s.id, s.name])), from: o.from, to: o.to, siteId: o.siteId, lang: o.lang,
  };
}

/** WhatsApp message that carries the live link and tells the customer which code to enter. */
export function linkMessage(a: { lang: Lang; businessName: string; partyName: string; url: string; balance?: number }): string {
  const bal = a.balance !== undefined ? formatINR(a.balance) : "";
  if (a.lang === "mr") return `Namaskar ${a.partyName} ji,\n${a.businessName} cha tumcha hisheb ithe pahā:${bal ? `\nEkun baaki: ${bal}` : ""}\n${a.url}\n(Ughadtana tumchya phone numberche shevtche 4 ank taka.)\n— ${a.businessName}`;
  if (a.lang === "en") return `Hello ${a.partyName} ji,\nSee your account with ${a.businessName} here:${bal ? `\nBalance due: ${bal}` : ""}\n${a.url}\n(When it asks, enter the last 4 digits of your phone number.)\n— ${a.businessName}`;
  return `Namaste ${a.partyName} ji,\n${a.businessName} mein aapka poora hisaab yahan dekhein:${bal ? `\nKul baaki: ${bal}` : ""}\n${a.url}\n(Khulne par apne phone number ke aakhri 4 ank daaliye.)\n— ${a.businessName}`;
}

/** The link the customer opens. The token goes after "#", so it never reaches web-server logs or referrer headers. */
export const statementUrl = (origin: string, token: string) => `${origin.replace(/\/+$/, "")}/#/s/${token}`;
export function tokenFromHash(hash: string): string | null {
  const m = hash.match(/^#\/s\/([A-Za-z0-9_-]{20,64})$/);
  return m ? m[1]! : null;
}
