import { describe, it, expect } from "vitest";
import { partyStats, PRESETS, rupeesToPaise as R, type Entry } from "../src/index";

const sale = (id: string, date: string, amt: number): Entry => ({ id, partyId: "p", type: "sale", date, status: "active", lines: [{ materialId: "m", quantity: 1000, unit: "nos", rate: R(amt) }] });
const pay = (id: string, date: string, amt: number): Entry => ({ id, partyId: "p", type: "payment", date, status: "active", amount: R(amt), paymentMode: "cash" });

describe("partyStats", () => {
  it("today's sales / collections and balance", () => {
    const s = partyStats(R(1000), [sale("a", "2026-11-12", 500), sale("b", "2026-11-12", 300), pay("c", "2026-11-12", 200), sale("d", "2026-11-01", 999)], "2026-11-12");
    expect(s).toMatchObject({ todaySales: R(800), todayCollections: R(200), balance: R(1000) + R(500) + R(300) + R(999) - R(200) });
  });
  it("overdue days follow the oldest unpaid due (FIFO)", () => {
    const e = [sale("a", "2026-10-01", 1000), sale("b", "2026-11-05", 500), pay("c", "2026-11-06", 1000)];
    expect(partyStats(0, e, "2026-11-12").overdueDays).toBe(7); // first sale settled → oldest open is 5 Nov
  });
  it("fully paid → no overdue", () => {
    expect(partyStats(0, [sale("a", "2026-11-01", 100), pay("b", "2026-11-02", 100)], "2026-11-12").overdueDays).toBeNull();
  });
  it("ignores cancelled and edited versions", () => {
    const x = { ...sale("a", "2026-11-12", 500), status: "cancelled" as const };
    expect(partyStats(0, [x], "2026-11-12")).toMatchObject({ todaySales: 0, balance: 0 });
  });
});

describe("presets", () => {
  it("every item has a unit and the building preset has brands-ready categories", () => {
    for (const p of PRESETS) for (const i of p.items) expect(i.units.length).toBeGreaterThan(0);
    expect(PRESETS.find((p) => p.key === "building_material")!.items.map((i) => i.category)).toContain("Cement");
    expect(PRESETS.find((p) => p.key === "general")!.items).toEqual([]);
  });
});
