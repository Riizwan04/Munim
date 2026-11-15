import { describe, expect, it } from "vitest";
import { Dialogue, type DialogueCtx, type MaterialRef, type PartyRef } from "../src";

const mat = (id: string, name: string, category: string, units = ["bag"]): MaterialRef => ({ id, name, category, localNames: [], units });
const parties: PartyRef[] = [{ id: "p1", name: "Ramesh", nicknames: [], sites: [] }];
const make = () => {
  const materials = [mat("m1", "Waddi", "Cement"), mat("m2", "JSW", "Cement"), mat("m3", "Super", "Cement"), mat("m4", "River Sand", "Sand", ["butti", "mtr"])];
  let n = 0;
  const ctx: DialogueCtx = { businessId: "b", today: "2026-11-15", parties, materials, partyInfo: () => ({ name: "Ramesh", opening: 0, creditLimit: null }), partyEntries: () => [], newId: () => `n${++n}` };
  const d = new Dialogue(ctx, { lang: "en" }); d.start();
  return { d, materials };
};

describe("items that are not in the list", () => {
  it("20 ACC cement bags 390 ka → a NEW item, no brand question", () => {
    const { d, materials } = make();
    const o = d.heard("Ramesh ko 20 ACC cement bags 390 ka");
    expect(o.view.phase).toBe("readback");
    const l = o.view.card!.lines[0]!;
    expect(l.name).toBe("ACC cement"); expect(l.isNew).toBe(true); expect(l.qty).toBe(20000); expect(l.unit).toBe("bag"); expect(l.rate).toBe(39000); expect(l.total).toBe(780000);
    expect(o.view.card!.payload.new_materials).toEqual([{ id: "n1", name: "ACC cement", category: null, units: ["bag"] }]);
    d.savedEntry(); expect(materials.find((m) => m.id === "n1")!.isNew).toBeUndefined(); // now an ordinary item
  });
  it("other word orders", () => {
    for (const s of ["Ramesh ko ACC cement 20 bags 390 ka", "Ramesh ko 20 bags ACC cement 390 ka", "Ramesh ko 20 acc cement bag rate 390"]) {
      const { d } = make(); const c = d.heard(s).view.card;
      expect(c?.lines[0]?.name, s).toBe("ACC cement"); expect(c?.total, s).toBe(780000);
    }
  });
  it("a completely unknown item with its own unit", () => {
    const { d } = make(); const c = d.heard("Ramesh ko 12 paint bucket 5 nos 450 rate".replace("5 nos", "")).view.card;
    expect(c).toBeUndefined(); // no unit word at all: Munim asks, nothing is invented
    const { d: d2 } = make(); const c2 = d2.heard("Ramesh ko 12 plywood sheet nos 450 ka").view.card!;
    expect(c2.lines[0]!.name).toBe("Plywood sheet"); expect(c2.lines[0]!.unit).toBe("nos"); expect(c2.total).toBe(540000);
  });
  it("mishearing a saved item is not a new item", () => {
    const { d } = make(); const c = d.heard("Ramesh ko 10 waddy cement bag 390 ka").view.card!;
    expect(c.lines[0]!.isNew).toBeUndefined(); expect(c.lines[0]!.name).toBe("Waddi");
  });
  it("saved items still work exactly as before", () => {
    const { d } = make(); const c = d.heard("Ramesh ko 80 Waddi bag 390 ka").view.card!;
    expect(c.lines[0]!.name).toBe("Waddi"); expect(c.total).toBe(3120000);
  });
  it("bare 'cement' is still ambiguous (which brand?)", () => {
    const { d } = make(); const o = d.heard("Ramesh ko 20 cement bag 390 ka");
    expect(o.view.card).toBeUndefined(); expect(o.say[0]!.key).toBe("q.materialWhich");
  });
  it("Hindi sentence with English rate: das cement bags 390 ka (ACC)", () => {
    const { d } = make(); const c = d.heard("रमेश को दस ACC सीमेंट बैग 390 का").view.card;
    expect(c?.total).toBe(390000); // 10 × ₹390 = ₹3,900
  });
});
