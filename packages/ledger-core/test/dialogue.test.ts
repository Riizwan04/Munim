import { describe, it, expect } from "vitest";
import { Dialogue, renderSay, isYes, isNo, isDone, parseChoice, parseNumberAnswer, detectSpokenLang, rupeesToPaise as R, toMilliQty, partyBalance, type DialogueCtx, type Entry, type MaterialRef, type Output, type PartyRef } from "../src/index";

const materials: MaterialRef[] = [
  { id: "waddi", name: "Waddi", category: "Cement", localNames: ["वड्डी"], units: ["bag"] },
  { id: "jsw", name: "JSW", category: "Cement", localNames: ["जेएसडब्ल्यू"], units: ["bag"] },
  { id: "super", name: "Super", category: "Cement", localNames: [], units: ["bag"] },
  { id: "sand", name: "Sand", category: "Sand", localNames: ["reti"], units: ["butti", "mtr"] },
];
const parties: PartyRef[] = [
  { id: "santosh", name: "Santosh Naik", nicknames: ["संतोष"], sites: [{ id: "moira", name: "Moira" }, { id: "ald", name: "Aldiyad" }] },
  { id: "r1", name: "Ramesh Naik", nicknames: [], sites: [] },
  { id: "r2", name: "Ramesh Mistri", nicknames: [], sites: [] },
];
const past: Entry[] = [{ id: "p1", partyId: "santosh", type: "sale", date: "2026-11-05", status: "active", lines: [{ materialId: "jsw", quantity: toMilliQty(80), unit: "bag", rate: R(360) }] }];
const mk = (extra: Partial<DialogueCtx> = {}) => {
  const ctx: DialogueCtx = {
    businessId: "b", today: "2026-11-15", parties: structuredClone(parties), materials,
    partyInfo: (id) => ({ name: parties.find((p) => p.id === id)?.name ?? id, opening: id === "santosh" ? R(84610) : 0, creditLimit: id === "santosh" ? R(300000) : null }),
    partyEntries: (id) => (id === "santosh" ? past : []), ...extra,
  };
  return new Dialogue(ctx, { lang: "hi" });
};
const keys = (o: Output) => o.say.map((s) => s.key);
const t = (key: string, vars?: Record<string, string | number>) => `${key}${vars ? JSON.stringify(vars) : ""}`;
const text = (o: Output, lang: "en" | "hi" = "en") => o.say.map((s) => renderSay(s, lang, t)).join(" | ");

describe("a complete conversation", () => {
  it("greets, listens, reads back the entry, waits for the TAP, then asks for more and ends", () => {
    const d = mk();
    const g = d.start();
    expect(keys(g)).toEqual(["v.greet"]); expect(g.listen).toBe(true);

    const r = d.heard("संतोष को मोइरा साइट पर 80 बैग JSW 365 रुपये के भाव से दिया");
    expect(keys(r)).toEqual(["v.readSale", "v.tapSave"]);
    expect(r.listen).toBe(true);                                    // listens for corrections only
    expect(r.view.phase).toBe("readback");
    const card = r.view.card!;
    expect(card).toMatchObject({ party: "Santosh Naik", site: "Moira", type: "sale", total: R(29200) });
    expect(card.lines).toEqual([{ name: "JSW", qty: 80000, unit: "bag", rate: R(365), total: R(29200) }]);
    expect(card.oldBalance).toBe(partyBalance(R(84610), past));      // 84,610 + 28,800
    expect(card.newBalance).toBe(card.oldBalance + R(29200));
    expect(card.payload.client_id).toBeUndefined();                  // the app stamps the id when queuing

    // saying "haan" does NOT save: only the tap does
    const y = d.heard("हाँ");
    expect(keys(y)).toEqual(["v.tapSavePlease"]); expect(y.view.saved).toBe(0);

    const s = d.savedEntry();
    expect(keys(s)).toEqual(["v.saved", "v.again"]); expect(s.listen).toBe(true);
    expect(s.view.saved).toBe(1);

    const end = d.heard("नहीं बस");
    expect(keys(end)).toEqual(["v.done"]); expect(end.listen).toBe(false);
    expect(end.say[0]!.vars).toEqual({ n: 1 });
  });

  it("on screen 'JSW' stays 'JSW'; only the voice spells it out", () => {
    const d = mk(); d.start();
    const rb = d.heard("Santosh ko 80 bag JSW 365 rate").say[0]!;
    expect(renderSay(rb, "en", t, false)).toContain("JSW");
    expect(renderSay(rb, "en", t, false)).not.toContain("J S W");
    expect(renderSay(rb, "en", t)).toContain("J S W");
  });
  it("the spoken read-back has the amounts in words (Hindi and English)", () => {
    const d = mk();
    d.start();
    const r = d.heard("संतोष को 80 बैग JSW 365 रुपये के भाव से दिया");
    const rb = r.say[0]!;
    const hi = renderSay(rb, "hi", (k, v) => `${k} ${JSON.stringify(v)}`);
    expect(hi).toContain("उनतीस हज़ार दो सौ रुपये");               // total 29,200
    expect(hi).toContain("एक लाख तेरह हज़ार चार सौ दस रुपये");        // old balance 1,13,410
    expect(hi).toContain("J S W");                                    // brand spelled out; no Devanagari alias needed
    const en = renderSay(rb, "en", t);
    expect(en).toContain("twenty-nine thousand two hundred rupees");
    expect(en).toContain("eighty bags");
  });
});

describe("one question at a time, never a guess", () => {
  it("missing rate → asks the rate → number answer → read-back", () => {
    const d = mk(); d.start();
    const q = d.heard("Santosh ko 80 bag JSW diya");
    expect(keys(q)).toEqual(["q.rate"]); expect(q.listen).toBe(true); expect(q.view.phase).toBe("asking");
    const r = d.heard("तीन सौ साठ");
    expect(keys(r)).toEqual(["v.readSale", "v.tapSave"]);
    expect(r.view.card!.lines[0]!.rate).toBe(R(360));
  });
  it("brand not said → asks which brand → answer by name or by position", () => {
    const d = mk(); d.start();
    const q = d.heard("Santosh ko 50 bag cement 390 rate");
    expect(keys(q)).toEqual(["q.materialWhich"]);
    expect(d.heard("JSW").view.card!.lines[0]!.name).toBe("JSW");
    const d2 = mk(); d2.start(); d2.heard("Santosh ko 50 bag cement 390 rate");
    expect(d2.heard("दूसरा").view.card!.lines[0]!.name).toBe("JSW");
    const d3 = mk(); d3.start(); d3.heard("Santosh ko 50 bag cement 390 rate");
    expect(d3.heard("वड्डी").view.card!.lines[0]!.name).toBe("Waddi");        // by Devanagari name
  });
  it("sand: unit missing → asks → 'butti'", () => {
    const d = mk(); d.start();
    expect(keys(d.heard("Santosh ko 5 sand 700"))).toEqual(["q.unit"]);
    expect(d.heard("बुट्टी").view.card!.lines[0]).toMatchObject({ unit: "butti", qty: 5000, rate: R(700) });
  });
  it("payment with no mode → asks how", () => {
    const d = mk(); d.start();
    expect(keys(d.heard("संतोष ने पचास हज़ार दिए"))).toEqual(["q.mode"]);
    const r = d.heard("यूपीआई से");
    expect(keys(r)).toEqual(["v.readPayment", "v.tapSave"]);
    expect(r.view.card).toMatchObject({ type: "payment", total: R(50000), paymentMode: "upi" });
    expect(r.view.card!.newBalance).toBe(r.view.card!.oldBalance - R(50000));
  });
  it("two Rameshes → asks which; answer by full name", () => {
    const d = mk(); d.start();
    expect(keys(d.heard("Ramesh ko 10 bag JSW 360 rate"))).toEqual(["q.partyWhich"]);
    expect(d.heard("Ramesh Mistri").view.card!.party).toBe("Ramesh Mistri");
  });
  it("a site that was not recognised → asks; 'none' is an answer", () => {
    const d = mk(); d.start();
    expect(keys(d.heard("Santosh ko Nowhere site pe 10 bag JSW 360 rate"))).toEqual(["q.site"]);
    expect(d.heard("कोई नहीं").view.card!.site).toBeUndefined();
  });
  it("an unclear answer is asked again, then handed to the screen (never loops forever)", () => {
    const d = mk(); d.start(); d.heard("Santosh ko 80 bag JSW diya");
    const a = d.heard("umm what");
    expect(keys(a)).toEqual(["v.repeat", "q.rate"]);
    const b = d.heard("pata nahi");
    expect(keys(b)).toEqual(["v.useTap"]); expect(b.view.needsManual).toBe(true); expect(b.listen).toBe(false);
  });
  it("unknown party → says so and waits for the owner to add the party", () => {
    const d = mk(); d.start();
    const u = d.heard("इमरान को 10 बैग JSW 360 रुपये");
    expect(keys(u)).toEqual(["v.unknownParty"]); expect(u.listen).toBe(false);
    expect(u.view.unknownParty).toBe("इमरान");
    const r = d.partyAdded({ id: "imran", name: "Imran", nicknames: [], sites: [] });
    expect(keys(r)).toEqual(["v.ok", "v.readSale", "v.tapSave"]);
    expect(r.view.card!.party).toBe("Imran");
  });
});

describe("several entries in one sentence", () => {
  it("sale + transport: goes through them one by one, in order", () => {
    const d = mk(); d.start();
    const r = d.heard("Santosh ko Moira site pe 2 butti sand 700, gaadi bhada 800");
    expect(keys(r)).toEqual(["v.several", "v.readSale", "v.tapSave"]);
    expect(d.savedEntry().say.map((s) => s.key)).toEqual(["v.saved", "v.nextEntry", "v.readFlat", "v.tapSave"]);
    const last = d.savedEntry();
    expect(keys(last)).toEqual(["v.saved", "v.again"]);
    expect(last.view.saved).toBe(2);
  });
  it("balances carry over inside the session: the second entry sees the first one", () => {
    const d = mk(); d.start();
    const first = d.heard("Santosh ko 10 bag JSW 360 rate");
    d.savedEntry();
    const again = d.heard("Santosh ko 5 bag JSW 360 rate");
    expect(again.view.card!.oldBalance).toBe(first.view.card!.newBalance);
  });
  it("skip moves on without counting", () => {
    const d = mk(); d.start();
    d.heard("Santosh ko 2 butti sand 700, gaadi bhada 800");
    const s = d.skipped();
    expect(keys(s)).toEqual(["v.skipped", "v.nextEntry", "v.readFlat", "v.tapSave"]);
    expect(s.view.saved).toBe(0);
  });
});

describe("corrections by voice, after the read-back", () => {
  it("'no, 40 bags' changes the quantity and reads it back again", () => {
    const d = mk(); d.start(); d.heard("Santosh ko 50 bag JSW 360 rate");
    const r = d.heard("नहीं, 40 बैग");
    expect(keys(r)).toEqual(["v.corrected", "v.readSale", "v.tapSave"]);
    expect(r.view.card!.lines[0]!.qty).toBe(40000);
    expect(r.view.card!.total).toBe(R(14400));
  });
  it("'rate 365' changes the rate", () => {
    const d = mk(); d.start(); d.heard("Santosh ko 50 bag JSW 360 rate");
    expect(d.heard("rate 365").view.card!.lines[0]!.rate).toBe(R(365));
  });
  it("a payment amount can be corrected", () => {
    const d = mk(); d.start(); d.heard("संतोष ने 50000 दिए नकद");
    expect(d.heard("नहीं, 20000").view.card!.total).toBe(R(20000));
  });
  it("a bare 'no' asks what to change; something it cannot fix goes to the screen", () => {
    const d = mk(); d.start(); d.heard("Santosh ko 50 bag JSW 360 rate");
    expect(keys(d.heard("नहीं"))).toEqual(["v.fixWhat"]);
    expect(keys(d.heard("umm"))).toEqual(["v.fixWhat"]);
    const x = d.heard("hmm");
    expect(keys(x)).toEqual(["v.cantFix"]); expect(x.view.needsManual).toBe(true);
  });
});

describe("warnings are spoken, not hidden", () => {
  it("a rate far from the last one", () => {
    const d = mk(); d.start();
    expect(keys(d.heard("Santosh ko 10 bag JSW 3600 rate"))).toEqual(["v.readSale", "v.checkRate", "v.tapSave"]);
  });
  it("credit limit", () => {
    const d = mk(); d.start();
    expect(keys(d.heard("Santosh ko 900 bag JSW 360 rate"))).toContain("v.creditWarn");
  });
});

describe("silence, not understood, stopping", () => {
  it("first silence: 'I'm listening'; second: pauses and waits for the mic tap", () => {
    const d = mk(); d.start();
    expect(keys(d.silence())).toEqual(["v.listening"]);
    const s = d.silence();
    expect(keys(s)).toEqual(["v.noSpeech"]); expect(s.listen).toBe(false); expect(s.view.phase).toBe("idle");
    expect(d.resume().listen).toBe(true);
  });
  it("silence after the read-back does not nag", () => {
    const d = mk(); d.start(); d.heard("Santosh ko 50 bag JSW 360 rate");
    const s = d.silence();
    expect(s.say).toEqual([]); expect(s.listen).toBe(false);
  });
  it("not understood twice → points to the keyboard", () => {
    const d = mk(); d.start();
    expect(keys(d.heard("blah blah"))).toEqual(["v.notUnderstood"]);
    expect(keys(d.heard("blah"))).toEqual(["v.notUnderstood", "v.useTap"]);
  });
  it("'that's all' after saving ends the session; 'yes' alone keeps going", () => {
    const d = mk(); d.start(); d.heard("Santosh ko 5 bag JSW 360 rate"); d.savedEntry();
    expect(keys(d.heard("yes"))).toEqual(["v.goAhead"]);
    expect(keys(d.heard("that's all"))).toEqual(["v.done"]);
  });
  it("stop", () => { const d = mk(); d.start(); expect(keys(d.stop())).toEqual(["v.stopped"]); });
});

describe("the language is the owner's choice", () => {
  it("Hindi stays Hindi (and English stays English) even when words or numbers are said in the other language", () => {
    const d = mk({ lang: "hi" } as never); d.setLang("hi"); d.start();
    expect(d.heard("Gave Santosh 80 bags JSW at 360").lang).toBe("hi");
    expect(d.heard("संतोष को 5 बैग JSW 360 रुपये").lang).toBe("hi");
    const e = mk(); e.setLang("en"); e.start();
    expect(e.heard("संतोष को 80 बैग JSW 360 रुपये").lang).toBe("en");
  });
  it("detectSpokenLang still tells scripts apart (kept for tools)", () => {
    expect(detectSpokenLang("Gave Santosh 80 bags of JSW at 360", "hi")).toBe("en");
    expect(detectSpokenLang("संतोष को 80 बैग दिया", "en")).toBe("hi");
  });
});

describe("answer helpers", () => {
  it("yes / no / done", () => {
    expect(isYes("haan theek hai")).toBe(true); expect(isYes("हाँ")).toBe(true); expect(isYes("yes please")).toBe(true);
    expect(isNo("नहीं")).toBe(true); expect(isNo("nahi, 40 bag")).toBe(true); expect(isYes("nahi")).toBe(false);
    expect(isDone("बस")).toBe(true); expect(isDone("that is all")).toBe(true); expect(isDone("नहीं")).toBe(true); expect(isDone("नहीं 40 बैग JSW संतोष को")).toBe(false);
  });
  it("numbers and choices", () => {
    expect(parseNumberAnswer("three sixty")).toBe(360);
    expect(parseNumberAnswer("तीन सौ साठ रुपये")).toBe(360);
    expect(parseNumberAnswer("twelve fifty")).toBe(1250);
    expect(parseNumberAnswer("three sixty five")).toBe(365);
    expect(parseNumberAnswer("twenty five")).toBe(25);
    expect(parseNumberAnswer("no idea")).toBeNull();
    const opts = [{ id: "a", names: ["Waddi"] }, { id: "b", names: ["JSW"] }];
    expect(parseChoice("the second one", opts)).toBe("b"); expect(parseChoice("jsw please", opts)).toBe("b"); expect(parseChoice("something else", opts)).toBeNull();
  });
});
