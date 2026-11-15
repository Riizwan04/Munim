import { describe, expect, it } from "vitest";
import { ASK_TOOLS, Dialogue, renderSay, runAskTool, stripWakeWord, rupeesToSpeech, rupeesToPaise as R, toMilliQty, type AskData, type DialogueCtx, type Entry } from "../src";
import { translate } from "../../../apps/dealer/src/i18n";

const materials = [{ id: "jsw", name: "JSW", category: "Cement", localNames: [], units: ["bag"] }, { id: "sup", name: "Super", category: "Cement", localNames: [], units: ["bag"] }, { id: "sand", name: "River Sand", category: "Sand", localNames: [], units: ["butti"] }];
const sale = (id: string, p: string, date: string, mat: string, q: number, rate: number, unit = "bag"): Entry => ({ id, partyId: p, type: "sale", date, status: "active", lines: [{ materialId: mat, quantity: toMilliQty(q), unit, rate: R(rate) }] });
const E: Entry[] = [sale("e1", "p1", "2026-11-03", "jsw", 100, 355), sale("e2", "p1", "2026-11-10", "jsw", 80, 360), sale("e3", "p2", "2026-11-11", "sup", 50, 380), sale("e4", "p2", "2026-10-02", "sand", 10, 700, "butti"),
  { id: "e5", partyId: "p1", type: "payment", date: "2026-11-12", status: "active", amount: R(50000), paymentMode: "upi" }, { ...sale("e6", "p1", "2026-11-14", "jsw", 999, 999), status: "cancelled" }];
const data: AskData = { today: "2026-11-15", materials, entries: E, parties: [
  { id: "p1", name: "Santosh Naik", nicknames: ["Santosh bhau"], opening: R(1000), creditLimit: null, sites: [] }, { id: "p2", name: "Moira Traders", nicknames: [], opening: 0, creditLimit: R(50000), sites: [] }] };

describe("ask tools: read-only, computed by code, on the owner's data only", () => {
  it("find_party and party_overview", () => {
    const m = (runAskTool("find_party", { query: "santosh" }, data) as any).matches;
    expect(m).toEqual([{ party_id: "p1", name: "Santosh Naik", balance_rupees: 1000 + 35500 + 28800 - 50000 }]);
    const o = runAskTool("party_overview", { party_id: "p1" }, data) as any;
    expect(o.balance_rupees).toBe(15300); expect(o.total_sales_rupees).toBe(64300); expect(o.total_payments_rupees).toBe(50000); expect(o.entries).toBe(3);
    expect(o.last_payment).toEqual({ date: "2026-11-12", amount_rupees: 50000, mode: "upi" }); expect(o.last_purchase.items).toEqual(["JSW"]);
  });
  it("cancelled entries never count; list_entries filters by item and dates", () => {
    const l = runAskTool("list_entries", { party_id: "p1", item: "JSW", from: "2026-11-05" }, data) as any;
    expect(l.count).toBe(1); expect(l.entries[0].lines[0]).toMatchObject({ item: "JSW", quantity: 80, rate_rupees: 360, total_rupees: 28800 });
    expect((runAskTool("list_entries", { include_cancelled: true, party_id: "p1" }, data) as any).count).toBe(4);
  });
  it("totals, ranking and item report", () => {
    expect(runAskTool("totals", { from: "2026-11-01", to: "2026-11-30" }, data)).toMatchObject({ sales_rupees: 35500 + 28800 + 19000, payments_rupees: 50000 });
    expect((runAskTool("rank_parties", { by: "sales", from: "2026-11-01" }, data) as any).rows.map((r: any) => r.name)).toEqual(["Santosh Naik", "Moira Traders"]);
    expect((runAskTool("rank_parties", { by: "balance" }, data) as any).rows[0]).toMatchObject({ name: "Moira Traders", value: 26000 });
    const r = runAskTool("item_report", { item: "JSW" }, data) as any;
    expect(r.quantity_sold_by_unit).toEqual({ bag: 180 }); expect(r.sales_rupees).toBe(64300); expect(r.latest_rate).toEqual({ date: "2026-11-10", rate_rupees: 360 }); expect(r.top_buyers[0].name).toBe("Santosh Naik");
  });
  it("bad input is an error the model can read, never a crash; every tool is read-only", () => {
    expect(runAskTool("party_overview", { party_id: "zzz" }, data)).toEqual({ error: "unknown party_id" });
    expect(runAskTool("delete_everything", {}, data)).toMatchObject({ error: expect.any(String) });
    expect(ASK_TOOLS.map((t) => t.name).every((n) => /^(find|party|list|totals|rank|item|rate)/.test(n))).toBe(true);
  });
  it("only the data handed to it is visible: another business's parties cannot be found", () => {
    expect((runAskTool("find_party", { query: "Rahul" }, data) as any).matches).toEqual([]);
  });
});

describe("free questions in the conversation", () => {
  const mk = (canAsk: boolean, name?: string) => {
    const ctx: DialogueCtx = { businessId: "b", today: "2026-11-15", parties: [{ id: "p1", name: "Santosh Naik", nicknames: [], sites: [] }], materials: [...materials], canAsk, assistantName: name,
      partyInfo: () => ({ name: "x", opening: 0, creditLimit: null }), partyEntries: () => [] };
    const d = new Dialogue(ctx, { lang: "en" }); d.start(); return d;
  };
  const say = (o: { say: any[] }, lang: "en" | "hi" = "en", spell = true) => o.say.map((s) => renderSay(s, lang, (k, v) => translate(lang, k as never, v), spell)).join(" ");
  it("a question the rules do not know goes to the reader; an entry never does", () => {
    expect(mk(true).heard("which customer bought the most cement last month").action).toEqual({ kind: "ask", text: "which customer bought the most cement last month" });
    expect(mk(true).heard("Santosh ko 20 bag JSW 360 ka").action).toBeUndefined();
    expect(mk(true).heard("Santosh ka kitna baaki hai").action?.kind).not.toBe("ask"); // the rules answer this one for free
  });
  it("the answer is spoken with amounts in words and shown with digits", () => {
    const o = mk(true).answeredFree("Moira Traders bought the most: ₹19000 in November.");
    expect(say(o)).toContain("nineteen thousand rupees"); expect(say(o, "en", false)).toContain("₹19000");
    expect(say(mk(true).answeredFree(null))).toContain("could not reach");
    expect(rupeesToSpeech(1900000, "en")).toBe("nineteen thousand rupees");
  });
  it("without the AI reader it says what it can do instead of guessing", () => {
    expect(say(mk(false).heard("which customer bought the most cement last month"))).toContain("AI reader must be switched on");
  });
});

describe("each business names its own assistant", () => {
  it("wakes on THAT name (and sound-alikes, other script) and not on 'Munim'", () => {
    expect(stripWakeWord("Jarvis, Santosh ka kitna baaki hai", "Jarvis")).toEqual({ heard: true, rest: "Santosh ka kitna baaki hai" });
    expect(stripWakeWord("जार्विस रिपोर्ट खोलो", "Jarvis").heard).toBe(true);
    expect(stripWakeWord("Munim, reports kholo", "Jarvis").heard).toBe(false);
    expect(stripWakeWord("Munshi ji reports kholo", "Munshi")).toEqual({ heard: true, rest: "reports kholo" });
    expect(stripWakeWord("Santosh ne paise diye", "Jarvis").heard).toBe(false);
  });
});
