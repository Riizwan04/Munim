import { describe, it, expect } from "vitest";
import {
  lineTotal, entryTotal, suggestRate, missingRatePrompt, rateLooksUnusual, entryEffect, partyBalance,
  siteBalances, creditLimitWarning, allocatePayments, oldestOutstandingDays,
  formatINR, groupIndian, toMilliQty, rupeesToPaise, divRound, roundToRupee,
  type Entry,
} from "../src/index.js";

const R = rupeesToPaise;

describe("money", () => {
  it("groups Indian digits", () => {
    expect(groupIndian(153300)).toBe("1,53,300");
    expect(groupIndian(12345678)).toBe("1,23,45,678");
    expect(groupIndian(999)).toBe("999");
  });
  it("formats INR", () => {
    expect(formatINR(R(153300))).toBe("₹1,53,300");
    expect(formatINR(-R(500))).toBe("-₹500");
  });
  it("rounds half away from zero", () => {
    expect(divRound(5, 2)).toBe(3);
    expect(divRound(-5, 2)).toBe(-3);
    expect(roundToRupee(12350)).toBe(12400);
  });
  it("converts without float drift", () => {
    expect(R(0.1 + 0.2)).toBe(30);
    expect(toMilliQty(1.5)).toBe(1500);
  });
});

describe("entry totals (PRD example 5.1)", () => {
  const lines = [
    { materialId: "reti", quantity: toMilliQty(2), unit: "brass", rate: R(6500) },
    { materialId: "cement", quantity: toMilliQty(50), unit: "bag", rate: R(390) },
  ];
  it("computes line totals", () => {
    expect(lineTotal(lines[0]!)).toBe(R(13000));
    expect(lineTotal(lines[1]!)).toBe(R(19500));
  });
  it("sums lines + charges − discount to ₹33,300", () => {
    expect(entryTotal({ lines, charges: [R(800)] }).total).toBe(R(33300));
    expect(entryTotal({ lines, charges: [R(800)], discount: R(300) }).total).toBe(R(33000));
  });
  it("handles fractional quantity (dedh brass)", () => {
    expect(lineTotal({ materialId: "reti", quantity: 1500, unit: "brass", rate: R(6500) })).toBe(R(9750));
  });
  it("applies GST when set (BR-10)", () => {
    expect(lineTotal({ materialId: "c", quantity: toMilliQty(10), unit: "bag", rate: R(100), gstBp: 1800 })).toBe(R(1180));
  });
  it("rejects non-integer input", () => {
    expect(() => lineTotal({ materialId: "c", quantity: 1.5, unit: "x", rate: 100 })).toThrow();
  });
});

describe("rate policy: rate is stated on every entry", () => {
  const past: Entry[] = [
    { id: "1", partyId: "leela", type: "sale", date: "2026-11-05", status: "active",
      lines: [{ materialId: "jsw", quantity: 80000, unit: "bag", rate: R(360) }] },
    { id: "2", partyId: "leela", type: "sale", date: "2026-11-11", status: "active",
      lines: [{ materialId: "jsw", quantity: 120000, unit: "bag", rate: R(365) }] },
    { id: "3", partyId: "other", type: "sale", date: "2026-11-12", status: "active",
      lines: [{ materialId: "jsw", quantity: 1000, unit: "bag", rate: R(400) }] },
  ];
  it("suggests the last rate for THIS party only", () => {
    expect(suggestRate({ entries: past, partyId: "leela", materialId: "jsw" }))
      .toEqual({ rate: R(365), source: "last_for_party", date: "2026-11-11" });
  });
  it("falls back to a reference price, else nothing", () => {
    expect(suggestRate({ entries: past, partyId: "new", materialId: "jsw", referenceRate: R(390) })?.source).toBe("reference");
    expect(suggestRate({ entries: past, partyId: "new", materialId: "jsw" })).toBeUndefined();
  });
  it("always asks for the rate when not spoken", () => {
    const s = suggestRate({ entries: past, partyId: "leela", materialId: "jsw" });
    expect(missingRatePrompt(undefined, s)).toEqual({ ask: "rate", suggestion: s });
    expect(missingRatePrompt(R(360), s)).toBeNull();
  });
  it("flags unusual rates (typo guard)", () => {
    const s = suggestRate({ entries: past, partyId: "leela", materialId: "jsw" });
    expect(rateLooksUnusual(R(3650), s)).toBe(true);
    expect(rateLooksUnusual(R(370), s)).toBe(false);
  });
});

describe("real khata page: R. Leela, Nov 2026", () => {
  const L = (id: string, date: string, material: string, bags: number, rate: number, siteId: string | null = null): Entry => ({
    id, partyId: "leela", siteId, type: "sale", date, status: "active",
    lines: [{ materialId: material, quantity: toMilliQty(bags), unit: "bag", rate: R(rate) }],
  });
  const entries: Entry[] = [
    L("a", "2026-11-03", "waddi", 80, 390),
    { id: "b", partyId: "leela", type: "payment", date: "2026-11-04", status: "active", amount: R(50000), paymentMode: "upi" },
    L("c", "2026-11-05", "waddi", 120, 390),
    L("d", "2026-11-10", "jsw", 80, 360, "moira"),
    L("e", "2026-11-10", "super", 50, 380, "aldiyad"),
    L("f", "2026-11-11", "jsw", 120, 360),
  ];
  it("line amounts match the handwritten page", () => {
    expect(entries.filter((e) => e.type === "sale").map((e) => entryEffect(e) / 100))
      .toEqual([31200, 46800, 28800, 19000, 43200]);
  });
  it("opening 84,610 → total 2,03,610", () => {
    expect(partyBalance(R(84610), entries)).toBe(R(203610));
  });
  it("running balance after the payment is 65,810", () => {
    expect(partyBalance(R(84610), entries.slice(0, 2))).toBe(R(65810));
  });
  it("site balances split Moira / Aldiyad", () => {
    expect(siteBalances(entries).bySite).toEqual({ moira: R(28800), aldiyad: R(19000) });
  });
});

const sale = (id: string, date: string, amt: number, siteId: string | null = null): Entry => ({
  id, partyId: "p", siteId, type: "sale", date, status: "active",
  lines: [{ materialId: "m", quantity: 1000, unit: "nos", rate: R(amt) }],
});
const pay = (id: string, date: string, amt: number, siteId: string | null = null, extra: Partial<Entry> = {}): Entry => ({
  id, partyId: "p", siteId, type: "payment", date, status: "active", amount: R(amt), paymentMode: "upi", ...extra,
});

describe("balances (BR-1, BR-2, BR-7, BR-9)", () => {
  it("follows the PRD example: 1,20,000 + 33,300 − 50,000", () => {
    const entries = [sale("a", "2026-10-25", 33300), pay("b", "2026-10-26", 50000)];
    expect(partyBalance(R(120000), entries)).toBe(R(103300));
  });
  it("handles charge, discount, return", () => {
    const e: Entry[] = [
      { id: "1", partyId: "p", type: "charge", date: "2026-10-25", status: "active", amount: R(800) },
      { id: "2", partyId: "p", type: "discount", date: "2026-10-25", status: "active", amount: R(500) },
      { id: "3", partyId: "p", type: "return", date: "2026-10-25", status: "active", lines: [{ materialId: "m", quantity: 10000, unit: "bag", rate: R(390) }] },
    ];
    expect(partyBalance(0, e)).toBe(R(800) - R(500) - R(3900));
  });
  it("cancelled entries have zero effect", () => {
    const s = { ...sale("a", "2026-10-25", 1000), status: "cancelled" as const };
    expect(entryEffect(s)).toBe(0);
  });
  it("superseded (edited) versions have zero effect", () => {
    const old = { ...sale("a", "2026-10-25", 1000), status: "edited" as const };
    expect(entryEffect(old)).toBe(0);
    expect(partyBalance(0, [old, sale("a2", "2026-10-25", 800)])).toBe(R(800));
  });
  it("bounced cheque reverses payment", () => {
    const p = pay("c", "2026-10-25", 1000, null, { paymentMode: "cheque", chequeBounced: true });
    expect(entryEffect(p)).toBe(0);
  });
  it("party balance = opening + site balances + untagged", () => {
    const entries = [sale("a", "2026-10-01", 1000, "s1"), sale("b", "2026-10-02", 2000, "s2"), pay("c", "2026-10-03", 500)];
    const { bySite, untagged } = siteBalances(entries);
    expect(bySite).toEqual({ s1: R(1000), s2: R(2000) });
    expect(untagged).toBe(-R(500));
    expect(R(100) + R(1000) + R(2000) - R(500)).toBe(partyBalance(R(100), entries));
  });
});

describe("credit limit (BR-8)", () => {
  it("warns but reports new balance", () => {
    expect(creditLimitWarning({ currentBalance: R(90000), newEntryEffect: R(20000), creditLimit: R(100000) }))
      .toEqual({ exceeded: true, newBalance: R(110000) });
    expect(creditLimitWarning({ currentBalance: 0, newEntryEffect: R(10), creditLimit: null }).exceeded).toBe(false);
    expect(creditLimitWarning({ currentBalance: R(200000), newEntryEffect: -R(10), creditLimit: R(100000) }).exceeded).toBe(false);
  });
});

describe("FIFO payment allocation (BR-5)", () => {
  it("settles opening balance first, then oldest sales", () => {
    const entries = [sale("s1", "2026-10-01", 1000), sale("s2", "2026-10-10", 2000), pay("p1", "2026-10-15", 2500)];
    const { dues, unallocated } = allocatePayments(R(500), entries);
    expect(dues.map((d) => [d.entryId, d.outstanding])).toEqual([
      ["opening", 0], ["s1", 0], ["s2", R(1000)],
    ]);
    expect(unallocated).toBe(0);
  });
  it("site-tagged payment only settles that site", () => {
    const entries = [sale("a", "2026-10-01", 1000, "s1"), sale("b", "2026-10-02", 1000, "s2"), pay("p", "2026-10-03", 1000, "s2")];
    const { dues } = allocatePayments(0, entries);
    expect(dues.find((d) => d.entryId === "a")!.outstanding).toBe(R(1000));
    expect(dues.find((d) => d.entryId === "b")!.outstanding).toBe(0);
  });
  it("keeps over-payment as advance", () => {
    const { unallocated } = allocatePayments(0, [sale("a", "2026-10-01", 100), pay("p", "2026-10-02", 300)]);
    expect(unallocated).toBe(R(200));
  });
  it("total outstanding equals party balance when no advance", () => {
    const entries = [sale("a", "2026-10-01", 700), sale("b", "2026-10-05", 300), pay("p", "2026-10-06", 800)];
    const { dues } = allocatePayments(R(100), entries);
    expect(dues.reduce((s, d) => s + d.outstanding, 0)).toBe(partyBalance(R(100), entries));
  });
  it("computes days overdue", () => {
    const { dues } = allocatePayments(0, [sale("a", "2026-09-20", 100)]);
    expect(oldestOutstandingDays(dues, "2026-10-25")).toBe(35);
  });
});
