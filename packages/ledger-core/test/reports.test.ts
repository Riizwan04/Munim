import { describe, it, expect } from "vitest";
import { buildReport, reportText, entriesCsv, materialCsv, partyCsv, agingCsv, reportHtml, qtyText, rupeesToPaise as R, toMilliQty, partyBalance, type Entry } from "../src/index";

const L = (materialId: string, qty: number, unit: string, rate: number) => ({ materialId, quantity: toMilliQty(qty), unit, rate: R(rate) });
const entries: Entry[] = [
  { id: "1", partyId: "a", type: "sale", date: "2026-10-01", status: "active", lines: [L("jsw", 80, "bag", 360)] },
  { id: "2", partyId: "a", type: "sale", date: "2026-11-03", status: "active", siteId: "moira", lines: [L("jsw", 20, "bag", 360), L("sand", 2, "butti", 700)] },
  { id: "3", partyId: "a", type: "payment", date: "2026-11-04", status: "active", amount: R(10000), paymentMode: "upi" },
  { id: "4", partyId: "b", type: "sale", date: "2026-11-05", status: "active", lines: [L("sand", 3, "butti", 700), L("sand", 1, "mtr", 3400)] },
  { id: "5", partyId: "b", type: "charge", date: "2026-11-05", status: "active", amount: R(800) },
  { id: "6", partyId: "b", type: "discount", date: "2026-11-06", status: "active", amount: R(100) },
  { id: "7", partyId: "a", type: "sale", date: "2026-11-07", status: "cancelled", lines: [L("jsw", 99, "bag", 360)] },
  { id: "8", partyId: "a", type: "sale", date: "2026-11-07", status: "edited", lines: [L("jsw", 77, "bag", 360)] },
  { id: "9", partyId: "b", type: "return", date: "2026-11-08", status: "active", lines: [L("sand", 1, "butti", 700)] },
];
const base = {
  parties: [{ id: "a", name: "Santosh", opening: R(5000) }, { id: "b", name: "Ramesh", opening: 0 }, { id: "c", name: "Nobody", opening: 0 }],
  entries, materials: { jsw: { name: "JSW", category: "Cement" }, sand: { name: "Sand", category: "Sand" } }, sites: { moira: "Moira" }, to: "2026-11-12",
};

describe("report summary", () => {
  const r = buildReport({ ...base, from: "2026-11-01" });
  it("totals for the period, ignoring cancelled and replaced versions", () => {
    expect(r.summary).toMatchObject({
      sales: R(20 * 360 + 2 * 700 + 3 * 700 + 3400), collections: R(10000), charges: R(800), discounts: R(100), returns: R(700),
    });
    expect(r.summary.netChange).toBe(r.summary.sales + R(800) - R(700) - R(100) - R(10000));
  });
  it("receivable = sum of positive balances as of the end date", () => {
    const a = partyBalance(R(5000), entries.filter((e) => e.partyId === "a"));
    const b = partyBalance(0, entries.filter((e) => e.partyId === "b"));
    expect(r.summary.receivable).toBe(a + b);
    expect(r.byParty.find((p) => p.partyId === "a")!.balance).toBe(a);
  });
  it("period filter: October sale excluded from period sales but in the balance", () => {
    const all = buildReport({ ...base });
    expect(all.summary.sales - r.summary.sales).toBe(R(80 * 360));
  });
});

describe("by item / party / site", () => {
  const r = buildReport({ ...base, from: "2026-11-01" });
  it("material rows add up quantities per unit (no unit conversion)", () => {
    const sand = r.byMaterial.find((m) => m.materialId === "sand")!;
    expect(sand.qtyByUnit).toEqual({ butti: toMilliQty(5), mtr: toMilliQty(1) });
    expect(sand.amount).toBe(R(2 * 700 + 3 * 700 + 3400));
    expect(qtyText(sand.qtyByUnit)).toBe("5 butti + 1 mtr");
    expect(r.byMaterial[0]!.amount).toBeGreaterThanOrEqual(r.byMaterial[1]!.amount);
  });
  it("sum of item amounts equals sales", () => {
    expect(r.byMaterial.reduce((s, m) => s + m.amount, 0)).toBe(r.summary.sales);
  });
  it("site rows separate site sales from untagged", () => {
    expect(r.bySite.find((s) => s.siteId === "moira")!.sales).toBe(R(20 * 360 + 1400));
    expect(r.bySite.some((s) => s.siteId === null && s.partyId === "b")).toBe(true);
  });
  it("party rows skip parties with no activity", () => {
    expect(r.byParty.map((p) => p.partyId)).not.toContain("c");
  });
});

describe("ageing (FIFO)", () => {
  it("payments settle the oldest dues first, buckets by age on the end date", () => {
    const r = buildReport({ ...base, to: "2026-12-31" });
    const a = r.aging.find((x) => x.partyId === "a")!;
    expect(a.total).toBe(partyBalance(R(5000), entries.filter((e) => e.partyId === "a")));
    expect(a.b0 + a.b31 + a.b61 + a.b90).toBe(a.total);
    expect(a.b90).toBeGreaterThan(0); // the October sale is >90 days old by 31 Dec
  });
  it("parties that owe nothing are not listed", () => {
    expect(buildReport(base).aging.map((x) => x.partyId)).not.toContain("c");
  });
});

describe("exports", () => {
  const r = buildReport({ ...base, from: "2026-11-01" });
  it("text", () => {
    const t = reportText(r, "Shop");
    expect(t).toContain("*Shop*");
    expect(t).toContain("Sales: ₹");
    expect(t).toContain("Sand: 5 butti + 1 mtr");
  });
  it("csv quoting and rupee amounts", () => {
    expect(materialCsv(r)).toContain("Item,Category,Quantity,Amount (INR)");
    expect(materialCsv(r)).toContain("Sand,Sand,5 butti + 1 mtr,");
    expect(partyCsv(r).split("\n")[0]).toBe("Party,Sales (INR),Received (INR),Balance (INR)");
    expect(agingCsv(r).split("\n")[0]).toContain("Over 90 days");
  });
  it("entries csv: one row per line, active only, comma-safe", () => {
    const csv = entriesCsv({ ...base, parties: [{ id: "a", name: 'Santosh, "Sr"', opening: 0 }, ...base.parties.slice(1)] });
    const lines = csv.split("\n");
    expect(lines[0]).toBe("Date,Party,Site,Type,Item,Quantity,Unit,Rate (INR),Amount (INR),Payment mode");
    expect(csv).toContain('"Santosh, ""Sr"""');
    expect(csv).not.toContain("99"); // cancelled 99-bag sale is not exported
    expect(lines.length).toBe(1 + 1 + 2 + 1 + 2 + 1 + 1 + 1); // header + sale(1) + sale(2 lines) + payment + sale(2 lines) + charge + discount + return(1 line)
  });
  it("html", () => expect(reportHtml(r, "A<B")).toContain("A&lt;B"));
});
