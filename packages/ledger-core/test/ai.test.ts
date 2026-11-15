import { describe, expect, it } from "vitest";
import { Dialogue, sanitizeParsed, type DialogueCtx, type MaterialRef, type PartyRef } from "../src";

const materials: MaterialRef[] = [{ id: "m1", name: "Waddi", category: "Cement", localNames: [], units: ["bag"] }];
const parties: PartyRef[] = [{ id: "p1", name: "Ramesh", nicknames: [], sites: [] }];
const mk = () => { let n = 0; const ctx: DialogueCtx = { businessId: "b", today: "2026-11-15", parties, materials: [...materials], partyInfo: () => ({ name: "Ramesh", opening: 0, creditLimit: null }), partyEntries: () => [], newId: () => `n${++n}` }; const d = new Dialogue(ctx, { lang: "hi" }); d.start(); return d; };

describe("AI extractor output", () => {
  it("a full sentence read by the AI goes straight to the card (no follow-up questions)", () => {
    // what the model returns for: "रमेश को दस एसीसी सीमेंट बोरी तीन सौ नब्बे का"
    const raw = { language: "hi", entries: [{ intent: "sale", partyText: "Ramesh", siteText: null, amount: null, paymentMode: null, items: [{ materialText: "ACC cement", quantity: 10, unit: "bag", rate: 390 }] }] };
    const o = mk().heard("रमेश को दस एसीसी सीमेंट बोरी तीन सौ नब्बे का", sanitizeParsed(raw)!);
    expect(o.view.phase).toBe("readback");
    const l = o.view.card!.lines[0]!;
    expect([l.name, l.qty, l.unit, l.rate, l.total, l.isNew]).toEqual(["ACC cement", 10000, "bag", 39000, 390000, true]);
  });
  it("a payment and a sale in one sentence become two entries", () => {
    const raw = { language: "en", entries: [
      { intent: "payment", partyText: "Ramesh", siteText: null, amount: 5000, paymentMode: "upi", items: [] },
      { intent: "sale", partyText: null, siteText: null, amount: null, paymentMode: null, items: [{ materialText: "Waddi", quantity: 20, unit: "bag", rate: 390 }] }] };
    const o = mk().heard("Ramesh gave 5000 by UPI and 20 bags Waddi at 390", sanitizeParsed(raw)!);
    expect(o.view.position?.n).toBe(2); expect(o.view.card?.type).toBe("payment"); expect(o.view.card?.total).toBe(500000);
  });
  it("cleans nulls and rejects junk, so the rules take over", () => {
    expect(sanitizeParsed(null)).toBeNull(); expect(sanitizeParsed({ entries: [] })).toBeNull(); expect(sanitizeParsed({ entries: [{ intent: "gift", items: [] }] })).toBeNull();
    const c = sanitizeParsed({ entries: [{ intent: "payment", partyText: " ", siteText: null, amount: 100, paymentMode: "gold", items: [] }] })!;
    expect(c.entries[0]).toMatchObject({ intent: "payment", amount: 100, partyText: undefined, paymentMode: undefined });
    expect(sanitizeParsed({ entries: [{ intent: "sale", items: [{ materialText: "X", quantity: -5, unit: null, rate: "390" }] }] })!.entries[0]!.items[0]).toEqual({ materialText: "X", quantity: undefined, unit: undefined, rate: undefined });
  });
});
