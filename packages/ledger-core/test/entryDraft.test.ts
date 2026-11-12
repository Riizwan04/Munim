import { describe, it, expect } from "vitest";
import { buildDraft, parseQty, parseRupees, type MaterialRef, type DraftInput } from "../src/index";

const mats: MaterialRef[] = [
  { id: "jsw", name: "JSW", category: "Cement", localNames: [], units: ["bag"] },
  { id: "sand", name: "Sand", category: "Sand", localNames: [], units: ["butti", "mtr"] },
];
const base: DraftInput = { businessId: "b", partyId: "p", type: "sale", date: "2026-11-12", lines: [], amount: "" };

describe("parsing", () => {
  it("parses quantities", () => {
    expect(parseQty("80")).toBe(80000);
    expect(parseQty("1.5")).toBe(1500);
    expect(parseQty("0")).toBeNull();
    expect(parseQty("abc")).toBeNull();
    expect(parseQty("")).toBeNull();
  });
  it("parses rupees with commas and paise", () => {
    expect(parseRupees("1,200")).toBe(120000);
    expect(parseRupees("360.50")).toBe(36050);
    expect(parseRupees("-5")).toBeNull();
    expect(parseRupees("1.234")).toBeNull();
  });
});

describe("buildDraft", () => {
  it("builds a sale payload with server-checkable totals", () => {
    const r = buildDraft({ ...base, lines: [{ materialId: "jsw", unit: "bag", qty: "80", rate: "360" }, { materialId: "sand", unit: "butti", qty: "8", rate: "700" }] }, mats);
    expect(r.errors).toEqual([]);
    expect(r.total).toBe(2880000 + 560000);
    expect(r.payload!.lines.map((l) => l.line_total)).toEqual([2880000, 560000]);
    expect(r.payload!.amount).toBe(r.total);
  });
  it("RATE is mandatory on every line", () => {
    const r = buildDraft({ ...base, lines: [{ materialId: "jsw", unit: "bag", qty: "80", rate: "" }] }, mats);
    expect(r.errors).toEqual(["Item 1: enter the rate"]);
    expect(r.payload).toBeUndefined();
  });
  it("rejects zero rate, missing item, wrong unit, missing qty", () => {
    expect(buildDraft({ ...base, lines: [{ materialId: "jsw", unit: "bag", qty: "5", rate: "0" }] }, mats).errors[0]).toMatch(/rate/);
    expect(buildDraft({ ...base, lines: [{ qty: "5", rate: "5" }] }, mats).errors[0]).toMatch(/choose the item/);
    expect(buildDraft({ ...base, lines: [{ materialId: "sand", unit: "bag", qty: "5", rate: "5" }] }, mats).errors[0]).toMatch(/unit/);
    expect(buildDraft({ ...base, lines: [{ materialId: "jsw", unit: "bag", qty: "", rate: "5" }] }, mats).errors[0]).toMatch(/quantity/);
  });
  it("needs at least one item for a sale", () => {
    expect(buildDraft(base, mats).errors).toEqual(["Add at least one item"]);
  });
  it("payment needs amount and mode", () => {
    expect(buildDraft({ ...base, type: "payment", amount: "50000" }, mats).errors).toEqual(["Choose how it was paid"]);
    const ok = buildDraft({ ...base, type: "payment", amount: "50,000", paymentMode: "upi" }, mats);
    expect(ok.payload).toMatchObject({ amount: 5000000, payment_mode: "upi", lines: [] });
  });
  it("charge / discount are flat amounts", () => {
    expect(buildDraft({ ...base, type: "charge", amount: "800" }, mats).payload?.amount).toBe(80000);
    expect(buildDraft({ ...base, type: "discount", amount: "" }, mats).errors).toEqual(["Enter the amount"]);
  });
  it("rejects a bad date", () => {
    expect(buildDraft({ ...base, type: "charge", amount: "5", date: "12-11-2026" }, mats).errors).toContain("Date is not valid");
  });
});
