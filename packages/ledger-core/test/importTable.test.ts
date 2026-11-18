import { describe, expect, it } from "vitest";
import { parseTable, tableToPage } from "../src";

const Y = 2026;
describe("spreadsheet / pasted table → rows for review", () => {
  it("English headings, CSV", () => {
    const r = tableToPage("Date,Item,Qty,Unit,Rate,Amount\n03-11-2026,Waddi,80,bag,390,\n04-11-2026,Payment,,,,50000\n05-11,Sand,8,butti,700,5600", { year: Y });
    expect(r.page!.rows).toEqual([
      { date: "2026-11-03", kind: "sale", item: "Waddi", qty: 80, unit: "bag", rate: 390, amount: undefined, site: undefined, mode: undefined },
      { date: "2026-11-04", kind: "payment", qty: undefined, unit: undefined, rate: undefined, amount: 50000, site: undefined, mode: undefined },
      { date: "2026-11-05", kind: "sale", item: "Sand", qty: 8, unit: "butti", rate: 700, amount: 5600, site: undefined, mode: undefined },
    ]);
  });
  it("pasted from Excel (tabs), Hindi headings, debit/credit columns, ₹ and commas", () => {
    const r = tableToPage("तारीख\tविवरण\tनावे\tजमा\n3/11/26\tवड्डी 80 बैग\t₹31,200\t\n4/11/26\tऑनलाइन\t\t50,000", { year: Y });
    expect(r.page!.rows.map((x) => [x.date, x.kind, x.amount])).toEqual([["2026-11-03", "sale", 31200], ["2026-11-04", "payment", 50000]]);
  });
  it("no heading row: date, item, qty, unit, rate, amount", () => {
    const r = tableToPage("03-11,JSW,10,bag,360,3600\n04-11,Super,5,bag,380,1900", { year: Y });
    expect(r.page!.rows).toHaveLength(2); expect(r.page!.rows[1]).toMatchObject({ item: "Super", qty: 5, rate: 380, amount: 1900 });
  });
  it("opening and total lines are not entries; opening is kept", () => {
    const r = tableToPage("Date,Item,Amount\nOpening,Purana baaki,84610\n03-11,Waddi,31200\nTotal,,31200", { year: Y });
    expect(r.page!.openingBalance).toBe(84610); expect(r.page!.rows).toHaveLength(1);
  });
  it("one customer at a time when the sheet lists several", () => {
    const t = "Customer,Date,Item,Qty,Rate,Amount\nSantosh,03-11,Waddi,10,390,3900\nMoira,04-11,JSW,5,360,1800";
    const r = tableToPage(t, { year: Y, forParty: (n) => /santosh/i.test(n) });
    expect(r.page!.rows).toHaveLength(1); expect(r.skippedOtherParties).toBe(1);
  });
  it("quotes and bad input", () => {
    expect(parseTable('a,"b,c",d\n1,2,3')[0]).toEqual(["a", "b,c", "d"]);
    expect(tableToPage("", { year: Y }).error).toBe("empty"); expect(tableToPage("foo,bar\n1,2", { year: Y }).error).toBeDefined();
  });
});
