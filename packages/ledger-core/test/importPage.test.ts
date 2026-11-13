import { describe, it, expect } from "vitest";
import { parseScanJson, normalizeDate, reconcilePage, prepareImport, rupeesToPaise as R, type ScannedPage, type MaterialRef } from "../src/index";

// The real handwritten page from the shop (customer name removed): opening 84,610; written balances 1,15,810 / 65,810; final total 2,03,610.
const page: ScannedPage = {
  openingBalance: 84610, year: 2026, total: 203610,
  rows: [
    { date: "2026-11-03", item: "Waddi", qty: 80, unit: "bag", amount: 31200 },
    { date: "2026-11-04", kind: "payment", mode: "upi", amount: 50000 },
    { date: "2026-11-05", item: "Waddi", qty: 120, unit: "bag", amount: 46800 },
    { date: "2026-11-10", item: "JSW", qty: 80, unit: "bag", amount: 28800, site: "Moira" },
    { date: "2026-11-10", item: "Super", qty: 50, unit: "bag", amount: 19000, site: "Aldiyad" },
    { date: "2026-11-11", item: "JSW", qty: 120, unit: "bag", amount: 43200 },
  ],
  balances: [{ afterRow: 0, balance: 115810 }, { afterRow: 1, balance: 65810 }],
};
const materials: MaterialRef[] = ["Waddi", "JSW", "Super"].map((n) => ({ id: n.toLowerCase(), name: n, category: "Cement", localNames: [], units: ["bag"] }));
const ctx = { businessId: "b", partyId: "p", materials, sites: [{ id: "moira", name: "Moira" }, { id: "ald", name: "Aldiyad" }], today: "2026-11-13" };

describe("reconcile: the page's own numbers are checksums", () => {
  it("the real page adds up to its written balances and total", () => {
    const r = reconcilePage(page);
    expect(r.ok).toBe(true);
    expect(r.computedTotal).toBe(R(203610));
    expect(r.checks.map((c) => c.ok)).toEqual([true, true, true]);
  });
  it("a misread digit is caught (46,800 read as 48,600)", () => {
    const bad = { ...page, rows: page.rows.map((x, i) => (i === 2 ? { ...x, amount: 48600 } : x)) };
    const r = reconcilePage(bad);
    expect(r.ok).toBe(false);
    const total = r.checks.find((c) => c.label === "total")!;
    expect(total.ok).toBe(false);
    expect(total.computed - total.written).toBe(R(1800));
    expect(r.checks.filter((c) => c.label === "balance").every((c) => c.ok)).toBe(true); // error is after the written balances
  });
  it("row problems: no amount, no date, qty × rate ≠ amount", () => {
    const r = reconcilePage({ rows: [{ item: "JSW", qty: 10 }, { date: "2026-11-01", item: "JSW", qty: 10, rate: 360, amount: 3000 }] });
    expect(r.rowIssues).toEqual(expect.arrayContaining([{ row: 0, code: "no-amount" }, { row: 0, code: "no-date" }, { row: 1, code: "qty-rate-amount" }]));
  });
});

describe("dates and json", () => {
  it("normalizes handwritten dates", () => {
    expect(normalizeDate("03-11", 2026)).toBe("2026-11-03");
    expect(normalizeDate("3/11", 2026)).toBe("2026-11-03");
    expect(normalizeDate("03-11-26", 2026)).toBe("2026-11-03");
    expect(normalizeDate("2026-11-03", 2025)).toBe("2026-11-03");
    expect(normalizeDate("31-13", 2026)).toBeUndefined();
  });
  it("parses extractor output, with fences, strings and a missing year", () => {
    const r = parseScanJson('Here you go:\n```json\n{"partyName":"X","openingBalance":"84,610","rows":[{"date":"03-11","item":"Waddi","qty":"80","unit":"bag","amount":"31,200"},{"date":"04-11","kind":"payment","mode":"upi","amount":50000}],"balances":[{"afterRow":0,"balance":115810}],"total":65810}\n```', 2026);
    expect(r.page).toMatchObject({ partyName: "X", openingBalance: 84610, total: 65810 });
    expect(r.page!.rows[0]).toMatchObject({ date: "2026-11-03", qty: 80, amount: 31200 });
    expect(reconcilePage(r.page!).ok).toBe(true);
  });
  it("rejects garbage", () => {
    expect(parseScanJson("hello", 2026).error).toBeTruthy();
    expect(parseScanJson('{"a":1}', 2026).error).toMatch(/rows/);
  });
});

describe("prepareImport", () => {
  it("builds ready-to-save entries; rate = amount ÷ quantity", () => {
    const p = prepareImport(page, ctx);
    expect(p.ready).toBe(true);
    expect(p.entries).toHaveLength(6); // two same-day rows have different sites, so they stay separate
    expect(p.entries[0]!.payload!.lines[0]).toMatchObject({ quantity: 80000, rate: R(390), line_total: R(31200) });
    expect(p.entries[1]!.payload).toMatchObject({ type: "payment", amount: R(50000), payment_mode: "upi" });
    expect(p.entries[3]!.payload!.site_id).toBe("moira");
    expect(p.entries.reduce((s, e) => s + (e.payload!.type === "payment" ? -e.total : e.total), R(84610))).toBe(R(203610));
  });
  it("same-day, same-site sale rows become one entry with several lines", () => {
    const p = prepareImport({ rows: [{ date: "2026-11-10", item: "JSW", qty: 10, unit: "bag", amount: 3600 }, { date: "2026-11-10", item: "Waddi", qty: 5, unit: "bag", amount: 1950 }] }, ctx);
    expect(p.entries).toHaveLength(1);
    expect(p.entries[0]!.payload!.lines).toHaveLength(2);
    expect(p.entries[0]!.total).toBe(R(5550));
  });
  it("unknown item, unknown site, missing payment mode are flagged, not guessed", () => {
    const p = prepareImport({ rows: [{ date: "2026-11-01", item: "Ambuja", qty: 10, unit: "bag", amount: 3600 }, { date: "2026-11-01", kind: "payment", amount: 100 }, { date: "2026-11-02", item: "JSW", qty: 1, unit: "bag", amount: 360, site: "Nowhere" }] }, ctx);
    expect(p.ready).toBe(false);
    expect(p.problems.map((x) => x.code).sort()).toEqual(["material", "mode", "site"]);
  });
  it("bare 'cement' is ambiguous (brand must be chosen)", () => {
    const p = prepareImport({ rows: [{ date: "2026-11-01", item: "Cement", qty: 10, unit: "bag", amount: 3900 }] }, ctx);
    expect(p.problems[0]).toMatchObject({ code: "material" });
    expect((p.problems[0] as any).options).toHaveLength(3);
  });
  it("amount that is not quantity × a whole rate drifts by paise and is reported", () => {
    const p = prepareImport({ rows: [{ date: "2026-11-01", item: "JSW", qty: 3, unit: "bag", amount: 1000 }] }, ctx);
    expect(p.problems[0]).toMatchObject({ code: "amount-drift" });
    expect(p.entries[0]!.payload).toBeDefined(); // still importable once reviewed
  });
  it("duplicates of existing entries are marked", () => {
    const p = prepareImport(page, { ...ctx, existing: [{ date: "2026-11-04", type: "payment", amount: R(50000) }] });
    expect(p.entries.map((e) => e.duplicate)).toEqual([false, true, false, false, false, false]);
  });
  it("Devanagari site and item names are matched to saved ones", () => {
    const p = prepareImport({ rows: [{ date: "2026-11-01", item: "जेएसडब्ल्यू", qty: 1, unit: "bag", amount: 360, site: "मोइरा" }] }, { ...ctx, materials: [{ ...materials[1]!, localNames: ["जेएसडब्ल्यू"] }] });
    expect(p.entries[0]!.payload!.site_id).toBe("moira");
    expect(p.problems.filter((x) => x.code !== "amount-drift")).toEqual([]);
  });
});
