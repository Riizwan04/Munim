import { describe, it, expect } from "vitest";
import { buildStatement, statementText, payloadToStatementInput, linkMessage, statementUrl, tokenFromHash, isPublicError, partyBalance, rupeesToPaise as R, toMilliQty, type PublicStatementPayload, type Entry } from "../src/index";

// What get_statement returns for the shop's sample party (amounts in paise).
const payload: PublicStatementPayload = {
  business: { name: "Sample Building Supplies" }, party: { name: "Santosh Naik", opening_balance: R(84610), language: "hi" },
  sites: [{ id: "moira", name: "Moira" }],
  entries: [
    { id: "1", date: "2026-11-03", type: "sale", amount: R(31200), site_id: null, lines: [{ name: "Waddi", quantity: toMilliQty(80), unit: "bag", rate: R(390), line_total: R(31200) }] },
    { id: "2", date: "2026-11-04", type: "payment", amount: R(50000), payment_mode: "upi", lines: [] },
    { id: "3", date: "2026-11-10", type: "sale", amount: R(28800), site_id: "moira", lines: [{ name: "JSW", quantity: toMilliQty(80), unit: "bag", rate: R(360), line_total: R(28800) }] },
    { id: "4", date: "2026-11-11", type: "charge", amount: R(800), lines: [] },
  ],
  expires_at: "2026-12-15T00:00:00Z", generated_at: "2026-11-15T10:00:00Z",
};

describe("public statement uses the same maths as the dealer's ledger", () => {
  const stmt = buildStatement(payloadToStatementInput(payload, { to: "2026-11-15", lang: "en" }));
  it("closing balance = ledger balance", () => {
    const ledger: Entry[] = [
      { id: "1", partyId: "p", type: "sale", date: "2026-11-03", status: "active", lines: [{ materialId: "w", quantity: 80000, unit: "bag", rate: R(390) }] },
      { id: "2", partyId: "p", type: "payment", date: "2026-11-04", status: "active", amount: R(50000), paymentMode: "upi" },
      { id: "3", partyId: "p", type: "sale", date: "2026-11-10", status: "active", lines: [{ materialId: "j", quantity: 80000, unit: "bag", rate: R(360) }] },
      { id: "4", partyId: "p", type: "charge", date: "2026-11-11", status: "active", amount: R(800) },
    ];
    expect(stmt.closing).toBe(partyBalance(R(84610), ledger));
    expect(stmt.closing).toBe(R(84610 + 31200 - 50000 + 28800 + 800));
  });
  it("rows, site tags, text", () => {
    expect(stmt.rows.map((r) => r.text)).toEqual(["Waddi 80 bag × ₹390", "Payment (UPI)", "JSW 80 bag × ₹360", "Transport / Charge"]);
    expect(stmt.rows[2]!.site).toBe("Moira");
    expect(statementText(stmt)).toContain("*Total due: ₹95,410*");
  });
  it("site and period filters work on the public data too", () => {
    expect(buildStatement(payloadToStatementInput(payload, { to: "2026-11-15", siteId: "moira", lang: "en" })).closing).toBe(R(28800));
    expect(buildStatement(payloadToStatementInput(payload, { from: "2026-11-05", to: "2026-11-15", lang: "en" })).opening).toBe(R(65810));
  });
  it("payload holds only what a statement needs (no phone, ids of other parties, or business contact)", () => {
    const keys = JSON.stringify(Object.keys(payload).sort());
    expect(keys).toBe(JSON.stringify(["business", "entries", "expires_at", "generated_at", "party", "sites"]));
    expect(Object.keys(payload.party).sort()).toEqual(["language", "name", "opening_balance"]);
  });
});

describe("link and message", () => {
  it("token travels after # so servers never see it", () => {
    const tok = "abcdefghijklmnopqrstuvwxyz012345";
    const url = statementUrl("https://munim-coral.vercel.app/", tok);
    expect(url).toBe("https://munim-coral.vercel.app/#/s/abcdefghijklmnopqrstuvwxyz012345");
    expect(tokenFromHash(new URL(url).hash)).toBe(tok);
  });
  it("rejects malformed hashes", () => {
    for (const h of ["", "#", "#/s/", "#/s/short", "#/s/has space aaaaaaaaaaaaaaaaaaaa", "#/x/abcdefghijklmnopqrstuvwxyz012345", "#/s/abcdefghijklmnopqrstuvwxyz012345/extra", "#/s/" + "a".repeat(80)]) expect(tokenFromHash(h)).toBeNull();
  });
  it("message in three languages names the code to enter", () => {
    const base = { businessName: "Shop", partyName: "Suresh", url: "https://x/#/s/t", balance: R(103300) };
    expect(linkMessage({ ...base, lang: "en" })).toContain("last 4 digits of your phone number");
    expect(linkMessage({ ...base, lang: "hi" })).toContain("aakhri 4 ank");
    expect(linkMessage({ ...base, lang: "mr" })).toContain("shevtche 4 ank");
    expect(linkMessage({ ...base, lang: "en" })).toContain("Balance due: ₹1,03,300");
    expect(linkMessage({ ...base, balance: undefined, lang: "en" })).not.toContain("Balance");
  });
  it("error payloads are recognised", () => {
    expect(isPublicError({ error: "wrong_pin" })).toBe(true);
    expect(isPublicError(payload)).toBe(false);
    expect(isPublicError(null)).toBe(false);
  });
});
