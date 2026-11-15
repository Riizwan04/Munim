import { describe, expect, it } from "vitest";
import { entryNotice } from "../src";

describe("entryNotice", () => {
  it("sale in English shows the amount and balance due", () => {
    const n = entryNotice({ lang: "en", businessName: "R.R Enterprises", kind: "sale", amount: 1250000, balance: 23991000 });
    expect(n.title).toBe("R.R Enterprises");
    expect(n.body).toBe("Sale ₹12,500 added. Balance due: ₹2,39,910. Tap to see your statement.");
  });
  it("payment thanks the customer and no stray punctuation", () => {
    const n = entryNotice({ lang: "en", businessName: "X", kind: "payment", amount: 500000, balance: 0 });
    expect(n.body).toBe("Payment ₹5,000 received. Thank you! Account is clear. Tap to see your statement.");
  });
  it("shows advance when the balance is negative", () => {
    expect(entryNotice({ lang: "en", businessName: "X", kind: "payment", amount: 100, balance: -250000 }).body).toContain("Advance with us: ₹2,500");
  });
  it("edited and cancelled have no amount in them", () => {
    expect(entryNotice({ lang: "en", businessName: "X", kind: "cancelled", balance: 100000 }).body).toBe("An entry was cancelled. Balance due: ₹1,000. Tap to see your statement.");
  });
  it("Hindi and Marathi are in Roman script", () => {
    expect(entryNotice({ lang: "hi", businessName: "X", kind: "sale", amount: 100000, balance: 100000 }).body).toBe("₹1,000 ka maal likha gaya. Baaki: ₹1,000. Statement dekhne ke liye dabayein.");
    expect(entryNotice({ lang: "mr", businessName: "X", kind: "payment", amount: 100000, balance: 0 }).body).toContain("milale");
  });
});
