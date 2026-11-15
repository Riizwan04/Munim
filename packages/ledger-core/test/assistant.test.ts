import { describe, expect, it } from "vitest";
import { Dialogue, parseSpokenDate, renderSay, stripWakeWord, rupeesToPaise as R, toMilliQty, type DialogueCtx, type Entry, type MaterialRef, type PartyRef } from "../src";
import { translate } from "../../../apps/dealer/src/i18n";

const materials: MaterialRef[] = [{ id: "jsw", name: "JSW", category: "Cement", localNames: [], units: ["bag"] }, { id: "sup", name: "Super", category: "Cement", localNames: [], units: ["bag"] }, { id: "sand", name: "Sand", category: "Sand", localNames: [], units: ["butti", "mtr"] }];
const parties: PartyRef[] = [{ id: "p1", name: "Santosh Naik", nicknames: [], sites: [] }, { id: "p2", name: "Moira Traders", nicknames: [], sites: [] }];
const sale = (id: string, date: string, mat: string, q: number, rate: number, unit = "bag"): Entry => ({ id, partyId: "p1", type: "sale", date, status: "active", lines: [{ materialId: mat, quantity: toMilliQty(q), unit, rate: R(rate) }] });
const E: Entry[] = [sale("e1", "2026-11-03", "jsw", 100, 355), sale("e2", "2026-11-10", "jsw", 80, 360), sale("e3", "2026-11-11", "sup", 50, 380),
  { id: "e4", partyId: "p1", type: "payment", date: "2026-11-05", status: "active", amount: R(20000), paymentMode: "cash" }, { id: "e5", partyId: "p1", type: "payment", date: "2026-11-12", status: "active", amount: R(50000), paymentMode: "upi" },
  { id: "e6", partyId: "p1", type: "payment", date: "2026-11-13", status: "cancelled", amount: R(99999), paymentMode: "cash" }];
const mk = (current?: string) => {
  const ctx: DialogueCtx = { businessId: "b", today: "2026-11-15", parties: [...parties], materials: [...materials], currentPartyId: current,
    partyInfo: (id) => ({ name: id, opening: id === "p1" ? R(1000) : 0, creditLimit: null }), partyEntries: (id) => (id === "p1" ? E : []),
    overview: () => ({ parties: [{ id: "p1", name: "Santosh Naik", balance: R(52000) }, { id: "p2", name: "Moira Traders", balance: R(90000) }], todaySales: R(12000), todayCollections: R(5000) }) };
  const d = new Dialogue(ctx, { lang: "en" }); d.start(); return d;
};
const say = (o: { say: any[] }) => o.say.map((s) => renderSay(s, "en", (k, v) => translate("en", k as never, v), false)).join(" ");

describe("Munim answers questions from the ledger", () => {
  it("balance (opening ₹1,000 + sales − payments, cancelled payment ignored)", () => {
    // 1000 + 35500 + 28800 + 19000 − 20000 − 50000 = 14300
    expect(say(mk().heard("Santosh ka kitna baaki hai"))).toContain("owes");
    expect(say(mk().heard("how much does Santosh owe"))).toContain("fourteen thousand three hundred rupees");
  });
  it("last payment: newest ACTIVE one, with date and mode", () => {
    expect(say(mk().heard("Santosh ne last time kab paise diye"))).toBe("Santosh Naik last paid fifty thousand rupees on twelve November, by UPI.");
  });
  it("last purchase", () => expect(say(mk().heard("when did Santosh last buy something"))).toBe("Santosh Naik last bought on eleven November: Super, worth nineteen thousand rupees."));
  it("last rate for an item", () => expect(say(mk().heard("what was the last rate of JSW for Santosh"))).toBe("The last rate for Santosh Naik on JSW was three hundred sixty rupees per bag, on ten November."));
  it("totals, who owes most, today", () => {
    expect(say(mk().heard("total baaki kitna hai"))).toContain("one lakh forty-two thousand rupees. Customers who owe: 2");
    expect(say(mk().heard("sabse zyada baaki kiska hai"))).toBe("Moira Traders owes the most: ninety thousand rupees.");
    expect(say(mk().heard("aaj ki sale kitni hui"))).toContain("twelve thousand rupees");
  });
  it("uses the open customer when none is named; otherwise asks which one, then answers", () => {
    expect(say(mk("p1").heard("last payment kab di thi"))).toContain("Santosh Naik last paid");
    const d = mk(); const o = d.heard("last payment kab hua"); expect(o.view.phase).toBe("cmd_party"); expect(say(o)).toContain("party");
    expect(say(d.heard("Santosh"))).toContain("Santosh Naik last paid");
  });
  it("the wake word 'Munim' (and mishearings) is dropped before reading", () => {
    expect(stripWakeWord("Munim, Santosh ka kitna baaki hai")).toEqual({ heard: true, rest: "Santosh ka kitna baaki hai" });
    expect(stripWakeWord("मुनीम जी रिपोर्ट खोलो").rest).toBe("रिपोर्ट खोलो");
    expect(stripWakeWord("moonim open items").heard).toBe(true);
    expect(stripWakeWord("Santosh ne paise diye").heard).toBe(false);
    expect(say(mk().heard("Munim Santosh ka kitna baaki hai"))).toContain("owes");
  });
});

describe("Munim does commands (prepares or opens; the owner taps)", () => {
  it("open a customer, a screen, prepare a reminder, new customer", () => {
    expect(mk().heard("Santosh kholo").action).toEqual({ kind: "open", partyId: "p1" });
    expect(mk().heard("reports kholo").action).toEqual({ kind: "goto", screen: "reports" });
    expect(mk().heard("Santosh ko reminder bhejo").action).toEqual({ kind: "remind", partyId: "p1" });
    expect(mk("p2").heard("remind this customer").action).toEqual({ kind: "remind", partyId: "p2" });
    expect(mk().heard("naya customer Rahul Patil 9876543210").action).toEqual({ kind: "newParty", name: "Rahul Patil", phone: "9876543210" });
  });
});

describe("dates and the open customer for entries", () => {
  it("spoken dates", () => {
    const t = "2026-11-15";
    expect(parseSpokenDate("kal", t)).toBe("2026-11-14"); expect(parseSpokenDate("parso", t)).toBe("2026-11-13"); expect(parseSpokenDate("3 days ago", t)).toBe("2026-11-12");
    expect(parseSpokenDate("12 November", t)).toBe("2026-11-12"); expect(parseSpokenDate("12 tareekh ko", t)).toBe("2026-11-12"); expect(parseSpokenDate("on the 20th", t)).toBe("2026-10-20");
    expect(parseSpokenDate("kuch nahi", t)).toBeNull();
  });
  it("'add 20 bags JSW at 360 for yesterday' on Santosh's page = Santosh, yesterday's date, no questions", () => {
    const c = mk("p1").heard("kal 20 bag JSW 360 ka add karo").view.card!;
    expect([c.party, c.date, c.total]).toEqual(["Santosh Naik", "2026-11-14", 720000]);
    expect(c.payload.entry_date).toBe("2026-11-14");
  });
  it("'he paid 5000 on 12 November by UPI' with the customer open", () => {
    const c = mk("p1").heard("5000 UPI 12 November ko diye").view.card!;
    expect([c.type, c.date, c.total]).toEqual(["payment", "2026-11-12", 500000]);
  });
});
