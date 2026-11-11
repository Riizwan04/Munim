import { describe, it, expect } from "vitest";
import { matchMaterial, validUnit, suggestRate, toMilliQty, rupeesToPaise as R, lineTotal, type MaterialRef, type Entry } from "../src/index.js";

const mats: MaterialRef[] = [
  { id: "waddi", name: "Waddi", category: "Cement", localNames: [], units: ["bag"] },
  { id: "jsw", name: "JSW", category: "Cement", localNames: ["jsw cement"], units: ["bag"] },
  { id: "super", name: "Super", category: "Cement", localNames: [], units: ["bag"] },
  { id: "sand", name: "Sand", category: "Sand", localNames: ["reti", "vaalu", "ret"], units: ["butti", "mtr"] },
];

describe("material matching", () => {
  it("brand name matches directly", () => {
    expect(matchMaterial("waddi", mats)).toEqual({ kind: "match", material: mats[0] });
    expect(matchMaterial("JSW cement", mats)).toMatchObject({ kind: "match" });
  });
  it("bare 'cement' is ambiguous → must ask brand", () => {
    const m = matchMaterial("cement", mats);
    expect(m.kind).toBe("ambiguous");
    if (m.kind === "ambiguous") {
      expect(m.reason).toBe("brand");
      expect(m.options.map((o) => o.name)).toEqual(["Waddi", "JSW", "Super"]);
    }
  });
  it("local names work (reti → Sand)", () => {
    expect(matchMaterial("reti", mats)).toMatchObject({ kind: "match", material: { id: "sand" } });
  });
  it("unknown item", () => expect(matchMaterial("paint", mats)).toEqual({ kind: "none" }));
});

describe("units: separate rate per unit, no conversion", () => {
  it("sand allows butti and mtr, not bag", () => {
    expect(validUnit(mats[3]!, "Butti")).toBe(true);
    expect(validUnit(mats[3]!, "mtr")).toBe(true);
    expect(validUnit(mats[3]!, "bag")).toBe(false);
  });
  it("each line priced in its own unit", () => {
    expect(lineTotal({ materialId: "sand", quantity: toMilliQty(10), unit: "butti", rate: R(120) })).toBe(R(1200));
    expect(lineTotal({ materialId: "sand", quantity: toMilliQty(2), unit: "mtr", rate: R(5500) })).toBe(R(11000));
  });
});
