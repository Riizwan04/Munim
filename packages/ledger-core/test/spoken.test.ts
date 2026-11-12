import { describe, it, expect } from "vitest";
import { parseSpokenNumber as n, scanNumbers, tokenize } from "../src/index";

describe("spoken numbers (PRD 6.4)", () => {
  it.each([
    ["dedh", 1.5], ["dhai", 2.5], ["sava sau", 125], ["paune do hazaar", 1750], ["ek lakh bees hazaar", 120000],
    ["sadhe teen", 3.5], ["don", 2], ["teen", 3], ["paach", 5], ["pannas", 50], ["pachaas", 50],
    ["dedh sau", 150], ["dhai hazaar", 2500], ["paune sau", 75], ["sadhe saat sau", 750], ["sava do hazaar", 2250],
    ["do sau pachaas", 250], ["2 lakh", 200000], ["1,20,000", 120000], ["50", 50], ["1.5", 1.5], ["hazaar", 1000], ["bees hazaar", 20000],
    ["20 hazaar", 20000], ["ek hazaar paanch sau", 1500],
  ])("%s → %d", (s, v) => expect(n(s)).toBe(v));
  it("rejects non-numbers", () => { expect(n("cement")).toBeNull(); expect(n("")).toBeNull(); });
  it("finds number runs in a sentence", () => {
    const t = tokenize("suresh ne bees hazaar cash diya");
    expect(scanNumbers(t)).toEqual([{ value: 20000, start: 2, end: 4 }]);
    const t2 = tokenize("50 bag cement 390 ka");
    expect(scanNumbers(t2).map((s) => s.value)).toEqual([50, 390]);
  });
});
