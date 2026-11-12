import { describe, it, expect } from "vitest";
import { heuristicUnderstand, resolveUtterance, matchParty, type UnderstandContext, type MaterialRef } from "../src/index";

const materials: MaterialRef[] = [
  { id: "waddi", name: "Waddi", category: "Cement", localNames: [], units: ["bag"] },
  { id: "jsw", name: "JSW", category: "Cement", localNames: [], units: ["bag"] },
  { id: "super", name: "Super", category: "Cement", localNames: [], units: ["bag"] },
  { id: "sand", name: "Sand", category: "Sand", localNames: ["reti", "vaalu", "ret"], units: ["butti", "mtr"] },
  { id: "khadi", name: "Khadi", category: "Khadi", localNames: ["gitti", "jelly"], units: ["butti", "mtr"] },
  { id: "b6", name: "Block 6 inch", category: "Blocks", localNames: [], units: ["nos"] },
];
const ctx: UnderstandContext = {
  materials,
  parties: [
    { id: "santosh", name: "Santosh Naik", nicknames: ["Santosh bhai", "Naik mistri"], sites: [{ id: "moira", name: "Moira" }, { id: "ald", name: "Aldiyad" }] },
    { id: "ramesh1", name: "Ramesh Naik", nicknames: [], sites: [] },
    { id: "ramesh2", name: "Ramesh Mistri", nicknames: ["Ramesh mistri"], sites: [] },
  ],
};
const run = (s: string) => resolveUtterance(heuristicUnderstand(s, ctx), ctx);

describe("party matching", () => {
  it("nickname and first-name", () => {
    expect(matchParty("Santosh bhai", ctx.parties)).toMatchObject({ kind: "match", party: { id: "santosh" } });
    expect(matchParty("santosh", ctx.parties)).toMatchObject({ kind: "match" });
  });
  it("two Rameshes are ambiguous, never guessed", () => {
    expect(matchParty("Ramesh", ctx.parties)).toMatchObject({ kind: "ambiguous" });
    expect(matchParty("Ramesh mistri", ctx.parties)).toMatchObject({ kind: "match", party: { id: "ramesh2" } });
  });
  it("unknown name", () => expect(matchParty("Imran", ctx.parties)).toEqual({ kind: "none" }));
});

describe("understand + resolve", () => {
  it("full sentence: party, site, brand, qty, unit, rate → no questions", () => {
    const [e] = run("Santosh ko Moira site pe 80 bag JSW 360 rate se diya");
    expect(e).toMatchObject({ type: "sale", partyId: "santosh", siteId: "moira", questions: [] });
    expect(e!.lines).toEqual([{ materialId: "jsw", unit: "bag", qty: "80", rate: "360" }]);
  });
  it("PRD 5.1: two items + transport, no rates → asks the rate for each, charge inherits party", () => {
    const r = run("Santosh ko Moira site pe 2 butti reti, 50 bag waddi diya, gaadi bhada 800");
    expect(r).toHaveLength(2);
    const sale = r[0]!;
    expect(sale.partyId).toBe("santosh");
    expect(sale.lines.map((l) => [l.materialId, l.qty, l.unit])).toEqual([["sand", "2", "butti"], ["waddi", "50", "bag"]]);
    expect(sale.questions.filter((q) => q.kind === "rate").map((q: any) => q.line)).toEqual([0, 1]);
    expect(r[1]).toMatchObject({ type: "charge", partyId: "santosh", amount: "800", questions: [] });
  });
  it("bare 'cement' → asks which brand", () => {
    const [e] = run("Santosh ko 50 bag cement 390 rate");
    const q = e!.questions.find((x) => x.kind === "material") as any;
    expect(q.options.map((o: MaterialRef) => o.name)).toEqual(["Waddi", "JSW", "Super"]);
  });
  it("Hindi number words in qty and rate", () => {
    const [e] = run("Santosh ko dedh mtr khadi teen hazaar chaar sau ka");
    expect(e!.lines[0]).toMatchObject({ materialId: "khadi", unit: "mtr", qty: "1.5", rate: "3400" });
  });
  it("Marathi phrasing: vaalu / goni", () => {
    const [e] = run("Santosh la don butti vaalu ani pannas goni jsw dila");
    expect(e!.lines.map((l) => [l.materialId, l.qty])).toEqual([["sand", "2"], ["jsw", "50"]]);
  });
  it("sand needs a unit when none spoken (butti vs mtr)", () => {
    const [e] = run("Santosh ko 5 reti 700");
    expect(e!.questions.some((q) => q.kind === "unit")).toBe(true);
  });
  it("payment with mode", () => {
    const [e] = run("Santosh ne 50,000 diya UPI se");
    expect(e).toMatchObject({ type: "payment", partyId: "santosh", amount: "50000", paymentMode: "upi", questions: [] });
  });
  it("payment spoken in words, mode missing → asks", () => {
    const [e] = run("Santosh ne bees hazaar diya");
    expect(e).toMatchObject({ type: "payment", amount: "20000" });
    expect(e!.questions.map((q) => q.kind)).toEqual(["mode"]);
  });
  it("discount", () => {
    expect(run("Santosh ko 500 kam kar do")[0]).toMatchObject({ type: "discount", partyId: "santosh", amount: "500" });
  });
  it("return", () => {
    expect(run("Santosh ne 10 bag jsw wapas kiye 360")[0]).toMatchObject({ type: "return", partyId: "santosh" });
  });
  it("unknown party → asks (offer to create)", () => {
    const [e] = run("Imran ko 100 nos block 6 inch 42 ka");
    expect(e!.questions[0]).toMatchObject({ kind: "party", spoken: "imran", options: [] });
  });
  it("ambiguous Ramesh → question with both options", () => {
    const [e] = run("Ramesh ko 100 nos block 6 inch 42 rate");
    expect((e!.questions[0] as any).options).toHaveLength(2);
  });
  it("never invents a rate", () => {
    const [e] = run("Santosh ko 80 bag jsw");
    expect(e!.lines[0]!.rate).toBe("");
    expect(e!.questions.some((q) => q.kind === "rate")).toBe(true);
  });
});

describe("number formats inside a sentence", () => {
  it("1,20,000 and 1.5 are not split", () => {
    expect(run("Santosh ne 1,20,000 diya cash")[0]).toMatchObject({ type: "payment", amount: "120000", paymentMode: "cash" });
    expect(run("Santosh ko 1.5 mtr khadi 3400")[0]!.lines[0]).toMatchObject({ qty: "1.5", rate: "3400" });
  });
});
