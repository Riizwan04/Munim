import { describe, expect, it } from "vitest";
import { Dialogue, type DialogueCtx, type MaterialRef, type PartyRef } from "../src";

const parties: PartyRef[] = [{ id: "p1", name: "Santosh Naik", nicknames: [], sites: [] }];
const base = (): MaterialRef[] => [{ id: "w", name: "Waddi", category: "Cement", localNames: [], units: ["bag"] }, { id: "j", name: "JSW", category: "Cement", localNames: [], units: ["bag"] }, { id: "s", name: "Sand", category: "Sand", localNames: [], units: ["butti", "mtr"] }];
const run = (text: string, materials = base()) => {
  let n = 0; const ctx: DialogueCtx = { businessId: "b", today: "2026-11-15", parties, materials, partyInfo: () => ({ name: "x", opening: 0, creditLimit: null }), partyEntries: () => [], newId: () => `n${++n}` };
  const d = new Dialogue(ctx, { lang: "hi" }); d.start(); return d.heard(text);
};
const SENTENCES = [
  "santosh purchased 10 acc cement bags for 390 today",
  "Santosh purchased 10 ACC cement bags at 390 rupees",
  "santosh bought ten acc cement bags for three ninety",
  "Santosh ne 10 acc cement bag liye 390 rate se aaj",
  "santosh ko 10 acc cement bags diye 390 ke hisab se",
  "संतोष ने 10 एसीसी सीमेंट बैग लिए 390 के भाव से",
  "संतोष पर्चेस्ड 10 एसीसी सीमेंट बैग्स फॉर 390 टुडे",
  "संतोष को दस ACC सीमेंट बोरी तीन सौ नब्बे का आज",
  "Santosh Naik ne aaj 10 bag ACC cement kharide 390 mein",
];
describe("one sentence, one card (no follow-up questions)", () => {
  for (const s of SENTENCES) it(s, () => {
    const o = run(s); const c = o.view.card;
    expect(c, JSON.stringify(o.say)).toBeDefined();
    expect([c!.party, c!.lines.length, c!.lines[0]!.qty, c!.lines[0]!.unit, c!.lines[0]!.rate, c!.total]).toEqual(["Santosh Naik", 1, 10000, "bag", 39000, 390000]);
    expect(c!.lines[0]!.name).toBe("ACC cement"); // English letters
  });
  it("an item that already exists as ACC cement is used, not duplicated", () => {
    const mats = [...base(), { id: "a1", name: "ACC cement", category: null, localNames: [], units: ["bag"] }];
    const c = run("संतोष ने 10 एसीसी सीमेंट बैग्स लिए 390 के भाव से", mats).view.card!;
    expect(c.lines[0]!.isNew).toBeUndefined(); expect(c.payload.lines[0]!.material_id).toBe("a1");
  });
  it("two saved items with the same name (ACC cement / Acc cement) are the same item, not a question", () => {
    const mats = [...base(), { id: "a1", name: "ACC cement", category: null, localNames: [], units: ["bag"] }, { id: "a2", name: "Acc cement", category: null, localNames: [], units: ["bag"] }];
    const o = run("santosh purchased 10 acc cement bags for 390 today", mats);
    expect(o.view.card).toBeDefined();
  });
});
