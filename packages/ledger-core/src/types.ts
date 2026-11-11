import type { MilliQty, Paise } from "./money.js";

export type EntryType = "sale" | "payment" | "charge" | "discount" | "return";
export type EntryStatus = "active" | "edited" | "cancelled";
export type PaymentMode = "cash" | "upi" | "cheque" | "bank";

export interface EntryLine {
  materialId: string;
  quantity: MilliQty; // milli-units
  unit: string;
  rate: Paise; // per 1 unit
  gstBp?: number; // GST in basis points (5% = 500), only when business GST is on
}

export interface Entry {
  id: string;
  partyId: string;
  siteId?: string | null;
  type: EntryType;
  date: string; // YYYY-MM-DD
  status: EntryStatus; // "cancelled" has zero effect on balances (BR-7)
  lines?: EntryLine[]; // sale / return
  amount?: Paise; // payment / charge / discount (flat amount)
  paymentMode?: PaymentMode;
  chequeBounced?: boolean; // BR-9: bounced cheque reverses the payment
}

export interface MaterialRate {
  materialId: string;
  rate: Paise;
  effectiveFrom: string; // YYYY-MM-DD
}

export interface PartyRate extends MaterialRate {
  partyId: string;
}
