import { describe, it, expect } from "vitest";
import { buildStatement, statementText, statementHtml, entryMessage, partyBalance, rupeesToPaise as R, toMilliQty, type Entry } from "../src/index";

const L = (materialId: string, bags: number, rate: number) => ({ materialId, quantity: toMilliQty(bags), unit: "bag", rate: R(rate) });
const entries: Entry[] = [
  { id: "a", partyId: "p", type: "sale", date: "2026-11-03", status: "active", lines: [L("waddi", 80, 390)] },
  { id: "b", partyId: "p", type: "payment", date: "2026-11-04", status: "active", amount: R(50000), paymentMode: "upi" },
  { id: "c", partyId: "p", type: "sale", date: "2026-11-10", status: "active", siteId: "moira", lines: [L("jsw", 80, 360)] },
  { id: "d", partyId: "p", type: "charge", date: "2026-11-11", status: "active", amount: R(800) },
  { id: "x", partyId: "p", type: "sale", date: "2026-11-11", status: "cancelled", lines: [L("jsw", 5, 360)] },
  { id: "y", partyId: "p", type: "sale", date: "2026-11-05", status: "edited", lines: [L("jsw", 5, 360)] },
];
const base = { businessName: "Sample Building Supplies", partyName: "Santosh Naik", opening: R(84610), entries, materialNames: { waddi: "Waddi", jsw: "JSW" }, siteNames: { moira: "Moira" }, to: "2026-11-12", lang: "hi" as const };

describe("statement", () => {
  it("closing balance equals the ledger balance; cancelled/edited versions are excluded", () => {
    const s = buildStatement(base);
    expect(s.closing).toBe(partyBalance(R(84610), entries));
    expect(s.closing).toBe(R(84610 + 31200 - 50000 + 28800 + 800));
    expect(s.rows.map((r) => r.entryId)).toEqual(["a", "b", "c", "d"]);
    expect(s.totalSales).toBe(R(31200 + 28800));
    expect(s.totalReceived).toBe(R(50000));
  });
  it("running balance after each row", () => {
    expect(buildStatement(base).rows.map((r) => r.balance)).toEqual([R(115810), R(65810), R(94610), R(95410)]);
  });
  it("period: opening rolls forward entries before 'from'", () => {
    const s = buildStatement({ ...base, from: "2026-11-05" });
    expect(s.opening).toBe(R(65810));
    expect(s.rows.map((r) => r.entryId)).toEqual(["c", "d"]);
    expect(s.closing).toBe(R(95410));
  });
  it("entries after 'to' are left out of the closing balance", () => {
    expect(buildStatement({ ...base, to: "2026-11-10" }).closing).toBe(R(94610));
  });
  it("site statement shows only that site's entries from zero", () => {
    const s = buildStatement({ ...base, siteId: "moira" });
    expect(s.opening).toBe(0);
    expect(s.closing).toBe(R(28800));
    expect(s.siteName).toBe("Moira");
  });
  it("text is WhatsApp-ready with numbers matching the rows", () => {
    const txt = statementText(buildStatement({ ...base, from: "2026-11-01" }));
    expect(txt).toContain("*Sample Building Supplies*");
    expect(txt).toContain("Purana baaki: ₹84,610");
    expect(txt).toContain("03-11 Waddi 80 bag × ₹390 = ₹31,200");
    expect(txt).toContain("04-11 Bhugtan (Online/UPI): − ₹50,000");
    expect(txt).toContain("10-11 JSW 80 bag × ₹360 [Moira] = ₹28,800");
    expect(txt).toContain("*Kul baaki: ₹95,410*");
  });
  it("languages", () => {
    expect(statementText(buildStatement({ ...base, lang: "en" }))).toContain("*Total due: ₹95,410*");
    expect(statementText(buildStatement({ ...base, lang: "mr" }))).toContain("Ekun baaki");
  });
  it("long statements keep the latest rows and say so", () => {
    const many: Entry[] = Array.from({ length: 60 }, (_, i) => ({ id: `e${i}`, partyId: "p", type: "charge", date: "2026-11-01", status: "active", amount: R(10) }));
    const txt = statementText(buildStatement({ ...base, entries: many, opening: 0 }), 10);
    expect(txt).toContain("50 pehle ki entries chhodi gayi hain");
  });
  it("html contains totals and escapes names", () => {
    const html = statementHtml(buildStatement({ ...base, partyName: "A<b>&Co" }));
    expect(html).toContain("A&lt;b&gt;&amp;Co");
    expect(html).toContain("₹95,410");
  });
});

describe("entry messages (PRD §10)", () => {
  it("new sale, Hindi", () => {
    const m = entryMessage({ lang: "hi", businessName: "Shop", partyName: "Suresh", date: "2026-10-25", siteName: "Porvorim site", kind: "sale", items: ["Reti 2 brass", "Cement 50 bag"], total: R(33300), newBalance: R(153300) });
    expect(m).toBe("Namaste Suresh ji,\n25-10 ke liye Porvorim site: Reti 2 brass, Cement 50 bag. Total ₹33,300.\nAapka kul baaki: ₹1,53,300\n— Shop");
  });
  it("payment in three languages", () => {
    const f = (lang: "hi" | "mr" | "en") => entryMessage({ lang, businessName: "Shop", partyName: "Suresh", date: "2026-10-26", kind: "payment", total: R(50000), paymentMode: "upi", newBalance: R(103300) });
    expect(f("hi")).toContain("Suresh ji, ₹50,000 (Online/UPI) prapt hua. Dhanyavaad!");
    expect(f("mr")).toContain("milale. Dhanyavaad!");
    expect(f("en")).toContain("(UPI) received. Thank you!");
  });
});

import { reminderMessage } from "../src/index";
describe("reminder message", () => {
  const a = { businessName: "Shop", partyName: "Suresh", balance: R(103300), overdueDays: 35 };
  it("hindi / marathi / english", () => {
    expect(reminderMessage({ ...a, lang: "hi" })).toBe("Namaste Suresh ji,\nAapka ₹1,03,300 baaki hai (sabse purani entry 35 din). Kripya jaldi bhugtan karein.\nDhanyavaad!\n— Shop");
    expect(reminderMessage({ ...a, lang: "mr" })).toContain("Tumcha ₹1,03,300 baaki aahe (sarvat juni entry 35 divas)");
    expect(reminderMessage({ ...a, lang: "en" })).toContain("Your balance of ₹1,03,300 is due (oldest entry 35 days)");
  });
  it("leaves out the age when unknown or zero", () => {
    expect(reminderMessage({ ...a, lang: "hi", overdueDays: null })).not.toContain("purani");
    expect(reminderMessage({ ...a, lang: "hi", overdueDays: 0 })).not.toContain("purani");
  });
});
