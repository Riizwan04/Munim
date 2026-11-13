import { describe, it, expect } from "vitest";
import { heuristicUnderstand, resolveUtterance, parseSpokenNumber as n, sameWord, skeleton, normalizeInput, type UnderstandContext, type MaterialRef } from "../src/index";

const materials: MaterialRef[] = [
  { id: "waddi", name: "Waddi", category: "Cement", localNames: [], units: ["bag"] },
  { id: "jsw", name: "JSW", category: "Cement", localNames: [], units: ["bag"] },
  { id: "sand", name: "Sand", category: "Sand", localNames: ["reti", "vaalu"], units: ["butti", "mtr"] },
  { id: "khadi", name: "Khadi", category: "Khadi", localNames: ["gitti"], units: ["butti", "mtr"] },
  { id: "b6", name: "Block 6 inch", category: "Blocks", localNames: [], units: ["nos"] },
];
const ctx: UnderstandContext = {
  materials,
  parties: [
    { id: "santosh", name: "Santosh Naik", nicknames: ["Naik mistri"], sites: [{ id: "moira", name: "Moira" }, { id: "ald", name: "Aldiyad" }] },
    { id: "ramesh1", name: "Ramesh Naik", nicknames: [], sites: [] },
    { id: "ramesh2", name: "Ramesh Mistri", nicknames: [], sites: [] },
  ],
};
const run = (s: string) => resolveUtterance(heuristicUnderstand(s, ctx), ctx);

describe("Devanagari numbers (Hindi)", () => {
  it.each([
    ["एक", 1], ["दो सौ पचास", 250], ["डेढ़ हज़ार", 1500], ["सवा सौ", 125], ["पौने दो हज़ार", 1750], ["साढ़े तीन", 3.5],
    ["एक लाख बीस हज़ार", 120000], ["ढाई", 2.5], ["पचपन", 55], ["निन्यानवे", 99], ["पाँच सौ", 500], ["८०", 80], ["१,२०,०००", 120000],
    ["पचास हजार", 50000], ["दस हज़ार पाँच सौ", 10500],
  ])("%s → %d", (s, v) => expect(n(s)).toBe(v));
});
describe("Devanagari numbers (Marathi)", () => {
  it.each([
    ["दीड हजार", 1500], ["अडीच", 2.5], ["पंचवीस", 25], ["सव्वा शंभर", 125], ["पन्नास", 50], ["दोन", 2], ["नऊ", 9], ["पाऊण शंभर", 75], ["साडे तीन", 3.5],
    ["एक लाख", 100000], ["सत्तर", 70],
  ])("%s → %d", (s, v) => expect(n(s)).toBe(v));
});

describe("names across scripts", () => {
  it("same sound, different script", () => {
    expect(sameWord("संतोष", "Santosh")).toBe(true);
    expect(sameWord("नाईक", "Naik")).toBe(true);
    expect(sameWord("मिस्त्री", "Mistri")).toBe(true);
    expect(sameWord("मोइरा", "Moira")).toBe(true);
    expect(sameWord("रेती", "reti")).toBe(true);
    expect(sameWord("वाळू", "vaalu")).toBe(true);
    expect(sameWord("गिट्टी", "gitti")).toBe(true);
    expect(sameWord("सीमेंट", "Cement")).toBe(true);
    expect(sameWord("ब्लॉक", "Block")).toBe(true);
    expect(sameWord("संतोषला", "Santosh")).toBe(true); // Marathi glued ending
  });
  it("different names do not match", () => {
    expect(sameWord("सुरेश", "Santosh")).toBe(false);
    expect(sameWord("रमेश", "Suresh")).toBe(false);
    expect(skeleton("Santosh")).toBe(skeleton("संतोष"));
  });
  it("spelling variants (nukta, chandrabindu) fold together", () => {
    expect(normalizeInput("हज़ार")).toBe(normalizeInput("हजार"));
    expect(normalizeInput("पाँच")).toBe(normalizeInput("पांच"));
  });
});

describe("Hindi sentences, as spoken (Devanagari)", () => {
  it("full sale", () => {
    const [e] = run("संतोष को मोइरा साइट पर 80 बैग JSW 360 रुपये के भाव से दिया");
    expect(e).toMatchObject({ type: "sale", partyId: "santosh", siteId: "moira", questions: [] });
    expect(e!.lines).toEqual([{ materialId: "jsw", unit: "bag", qty: "80", rate: "360" }]);
  });
  it("number words and honorific: संतोष जी को पचास बैग JSW तीन सौ साठ रुपये भाव", () => {
    const [e] = run("संतोष जी को पचास बैग JSW तीन सौ साठ रुपये भाव से दिया");
    expect(e!.lines[0]).toMatchObject({ materialId: "jsw", qty: "50", rate: "360" });
  });
  it("payment with UPI", () => {
    expect(run("संतोष ने पचास हज़ार रुपये यूपीआई से दिए")[0]).toMatchObject({ type: "payment", partyId: "santosh", amount: "50000", paymentMode: "upi", questions: [] });
  });
  it("payment in cash, mode word नकद", () => {
    expect(run("संतोष ने बीस हजार नकद दिए")[0]).toMatchObject({ type: "payment", amount: "20000", paymentMode: "cash" });
  });
  it("payment without mode asks how", () => {
    const [e] = run("संतोष ने दस हज़ार दिए");
    expect(e).toMatchObject({ type: "payment", amount: "10000" });
    expect(e!.questions.map((q) => q.kind)).toEqual(["mode"]);
  });
  it("two things in one sentence: sand + transport", () => {
    const r = run("संतोष को 2 बुट्टी रेती 700 के भाव से दी, गाड़ी भाड़ा 800");
    expect(r).toHaveLength(2);
    expect(r[0]!.lines[0]).toMatchObject({ materialId: "sand", unit: "butti", qty: "2", rate: "700" });
    expect(r[1]).toMatchObject({ type: "charge", partyId: "santosh", amount: "800" });
  });
  it("conjunction और splits entries", () => {
    expect(run("संतोष को 2 बुट्टी रेती 700 और 1 मीटर गिट्टी 3400")[0]!.lines.map((l) => l.materialId)).toEqual(["sand", "khadi"]);
  });
  it("discount", () => {
    expect(run("संतोष का पाँच सौ रुपये कम कर दो")[0]).toMatchObject({ type: "discount", partyId: "santosh", amount: "500" });
  });
  it("return", () => {
    expect(run("संतोष ने 10 बैग JSW वापस किए 360 रुपये")[0]).toMatchObject({ type: "return", partyId: "santosh" });
  });
  it("Devanagari digits", () => {
    expect(run("संतोष को ८० बैग JSW ३६० रुपये भाव")[0]!.lines[0]).toMatchObject({ qty: "80", rate: "360" });
  });
  it("bare सीमेंट asks which brand (never guesses)", () => {
    const [e] = run("संतोष को पचास बैग सीमेंट 390 रुपये भाव से दिया");
    const q = e!.questions.find((x) => x.kind === "material") as any;
    expect(q.options.map((o: MaterialRef) => o.name)).toEqual(["Waddi", "JSW"]);
  });
  it("missing rate is asked, never invented", () => {
    const [e] = run("संतोष को 80 बैग JSW दिया");
    expect(e!.lines[0]!.rate).toBe("");
    expect(e!.questions.some((q) => q.kind === "rate")).toBe(true);
  });
  it("two Rameshes → asks which one", () => {
    const [e] = run("रमेश को 100 नग ब्लॉक 6 इंच 42 रुपये भाव से दिया");
    expect((e!.questions[0] as any).options).toHaveLength(2);
  });
  it("unknown party", () => {
    const [e] = run("इमरान को 100 नग ब्लॉक 6 इंच 42 रुपये भाव से दिया");
    expect(e!.questions[0]).toMatchObject({ kind: "party", spoken: "इमरान", options: [] });
  });
  it("English brand/words mixed into Hindi still work", () => {
    expect(run("संतोष को 80 bag JSW 360 rate से दिया")[0]).toMatchObject({ partyId: "santosh", questions: [] });
  });
});

describe("Marathi sentences, as spoken (Devanagari)", () => {
  it("full sale with glued endings (संतोषला, साइटवर, दराने)", () => {
    const [e] = run("संतोषला मोइरा साइटवर 80 गोणी JSW 360 रुपये दराने दिल्या");
    expect(e).toMatchObject({ type: "sale", partyId: "santosh", siteId: "moira", questions: [] });
    expect(e!.lines).toEqual([{ materialId: "jsw", unit: "bag", qty: "80", rate: "360" }]);
  });
  it("payment: संतोषने पन्नास हजार रुपये यूपीआयने दिले", () => {
    expect(run("संतोषने पन्नास हजार रुपये यूपीआयने दिले")[0]).toMatchObject({ type: "payment", partyId: "santosh", amount: "50000", paymentMode: "upi", questions: [] });
  });
  it("cash payment: रोख", () => {
    expect(run("संतोषने वीस हजार रोख दिले")[0]).toMatchObject({ type: "payment", amount: "20000", paymentMode: "cash" });
  });
  it("sand with वाळू + transport, split on आणि", () => {
    const r = run("संतोषला 2 बुट्टी वाळू 700 दराने आणि गाडी भाडे 800");
    expect(r).toHaveLength(2);
    expect(r[0]!.lines[0]).toMatchObject({ materialId: "sand", unit: "butti", qty: "2", rate: "700" });
    expect(r[1]).toMatchObject({ type: "charge", amount: "800", partyId: "santosh" });
  });
  it("Marathi number words: दीड मीटर गिट्टी तीन हजार चारशे? (हजार + digits)", () => {
    expect(run("संतोषला दीड मीटर गिट्टी 3400 दराने दिली")[0]!.lines[0]).toMatchObject({ materialId: "khadi", unit: "mtr", qty: "1.5", rate: "3400" });
  });
});

describe("Roman input still works", () => {
  it("unchanged behaviour", () => {
    expect(run("Santosh ko Moira site pe 80 bag JSW 360 rate se diya")[0]).toMatchObject({ partyId: "santosh", siteId: "moira", questions: [] });
  });
});
