import { entryEffect } from "./ledger";
import { formatINR, type Paise } from "./money";
import { matchMaterial, type MaterialRef } from "./materials";
import { foldDevanagari, hasToken, skeleton } from "./phonetic";
import { romanizeName } from "./romanize";
import { scanNumbers, tokenize } from "./spoken";
import type { Entry, PaymentMode } from "./types";
import type { PartyRef } from "./understand";

/**
 * MUNIM THE ASSISTANT. What the owner can ask or tell Munim from any screen. Everything here is plain code on the shop's own data:
 * questions are answered from the ledger (no guessing), commands only OPEN or PREPARE something. Saving, sending and cancelling
 * are always the owner's tap. A language model can later replace the reading of the sentence without changing any of this.
 */
export interface AssistCtx { parties: PartyRef[]; materials: MaterialRef[]; currentPartyId?: string }

export type QueryKind = "balance" | "lastPayment" | "lastPurchase" | "lastRate";
export type Command =
  | { kind: "query"; q: "balance" | "lastPayment" | "lastPurchase"; partyId: string }
  | { kind: "query"; q: "lastRate"; partyId: string; materialId: string }
  | { kind: "query"; q: "totalDue" | "topDue" | "today" }
  | { kind: "needParty"; then: QueryKind | "remind" | "open"; materialText?: string }
  | { kind: "needItem"; partyId: string }
  | { kind: "goto"; screen: "reports" | "items" | "reminders" | "settings" | "parties" }
  | { kind: "open"; partyId: string }
  | { kind: "remind"; partyId: string }
  | { kind: "newParty"; name?: string; phone?: string };

export type AssistantAction =
  | { kind: "goto"; screen: "reports" | "items" | "reminders" | "settings" | "parties" }
  | { kind: "open"; partyId: string }
  | { kind: "remind"; partyId: string }
  | { kind: "newParty"; name?: string; phone?: string }
  /** a question the built-in rules cannot answer: the app asks the AI reader (read-only tools on the owner's own data) and answers */
  | { kind: "ask"; text: string };

const S = (xs: string[]) => new Set(xs.map(foldDevanagari));
const anyOf = (toks: string[], set: Set<string>) => toks.some((t) => set.has(t));

// ───────── wake word ─────────
/** "<name>, Santosh ka kitna baaki hai" → heard: true, rest: "Santosh ka kitna baaki hai". Each business names its own assistant; close mishearings of the name (other script, doubled letters) count. */
export function stripWakeWord(text: string, name = "munim"): { heard: boolean; rest: string } {
  const parts = text.trim().split(/\s+/);
  const target = skeleton(name.trim().toLowerCase());
  const nameLc = name.trim().toLowerCase();
  if (!nameLc) return { heard: false, rest: text };
  for (let i = 0; i < Math.min(2, parts.length); i++) {
    const w = parts[i]!.replace(/[.,;!?।]+$/g, "");
    if (w.length >= 3 && (w.toLowerCase() === nameLc || (target.length >= 2 && skeleton(w) === target))) {
      let j = i + 1;
      if (parts[j] && ["ji", "जी", "sir", "bhai"].includes(parts[j]!.toLowerCase())) j++;
      return { heard: true, rest: parts.slice(j).join(" ").replace(/^[,.\s]+/, "") };
    }
  }
  return { heard: false, rest: text };
}

// ───────── spoken dates ─────────
const MONTHS: Record<string, number> = Object.fromEntries(Object.entries({
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4, may: 5, june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8, september: 9, sept: 9, sep: 9, october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12,
  जनवरी: 1, फरवरी: 2, मार्च: 3, अप्रैल: 4, मई: 5, जून: 6, जुलाई: 7, अगस्त: 8, सितंबर: 9, सितम्बर: 9, अक्टूबर: 10, नवंबर: 11, नवम्बर: 11, दिसंबर: 12, दिसम्बर: 12,
  जानेवारी: 1, फेब्रुवारी: 2, एप्रिल: 4, मे: 5, जुलै: 7, ऑगस्ट: 8, सप्टेंबर: 9, ऑक्टोबर: 10, नोव्हेंबर: 11, डिसेंबर: 12,
}).map(([k, v]) => [foldDevanagari(k), v]));
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fromIso = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y!, m! - 1, d!); };
const addDays = (s: string, n: number) => { const d = fromIso(s); d.setDate(d.getDate() + n); return iso(d); };
const YESTERDAY = S(["yesterday", "kal", "कल", "कालच", "काल", "येस्टरडे"]);
const DAYBEFORE = S(["parso", "parson", "परसों", "परसो", "परवा"]);
const TODAYW = S(["today", "aaj", "आज", "आत्ता", "टुडे"]);

/** "yesterday / kal / parso / 3 days ago / 12 November / 12th / 12 tarikh" → YYYY-MM-DD, or null when no date was said. Future dates are not accepted. */
export function parseSpokenDate(text: string, today: string): string | null {
  const t = tokenize(text);
  if (anyOf(t, DAYBEFORE) || /day before yesterday/i.test(text)) return addDays(today, -2);
  const ago = text.match(/(\d{1,2})\s*(?:days?|din|दिन)\s*(?:ago|pehle|पहले|आधी)/i);
  if (ago) return addDays(today, -Number(ago[1]));
  const ord = text.match(/\b(\d{1,2})(?:st|nd|rd|th)\b/i);
  if (ord) { const dd = Number(ord[1]); const td = fromIso(today); let y = td.getFullYear(), m = td.getMonth() + 1; if (dd > td.getDate()) { m -= 1; if (m === 0) { m = 12; y -= 1; } } const d = new Date(y, m - 1, dd); if (dd >= 1 && d.getMonth() === m - 1) return iso(d); }
  const sp = scanNumbers(t);
  const day = sp.find((s) => Number.isInteger(s.value) && s.value >= 1 && s.value <= 31 && (MONTHS[t[s.end] ?? ""] || MONTHS[t[s.start - 1] ?? ""] || /^(tareekh|tarikh|taarikh|date|तारीख|तारीख़|तारिख|तारखेला|तारखेस|th|st|nd|rd)$/.test(t[s.end] ?? "") || /\b\d{1,2}(st|nd|rd|th)\b/i.test(text) && String(s.value) === (text.match(/\b(\d{1,2})(st|nd|rd|th)\b/i)?.[1] ?? "")));
  if (day) {
    const mon = MONTHS[t[day.end] ?? ""] ?? MONTHS[t[day.start - 1] ?? ""];
    const td = fromIso(today);
    let y = td.getFullYear(), m = mon ?? td.getMonth() + 1;
    if (!mon && day.value > td.getDate()) { m -= 1; if (m === 0) { m = 12; y -= 1; } }       // "20 tareekh" said on the 5th = last month
    if (mon && (m > td.getMonth() + 1 || (m === td.getMonth() + 1 && day.value > td.getDate()))) y -= 1; // "12 December" said in November = last year
    const d = new Date(y, m - 1, day.value);
    if (d.getMonth() === m - 1) { const s = iso(d); return s <= today ? s : null; }
  }
  if (anyOf(t, YESTERDAY)) return addDays(today, -1);
  if (anyOf(t, TODAYW)) return today;
  return null;
}

/** Words about WHEN or "this person", which are never part of a party name. */
export const isDateWord = (w: string) => w in MONTHS || YESTERDAY.has(w) || DAYBEFORE.has(w) || TODAYW.has(w) || /^(tareekh|tarikh|taarikh|date|तारीख|तारीख़|तारिख|को)$/.test(w) || /^\d{1,2}(st|nd|rd|th)$/.test(w);

// ───────── reading the sentence ─────────
const QWORD = S(["kitna", "kitne", "kitni", "kab", "kya", "kiska", "kaun", "kiski", "last", "pichla", "pichli", "pichle", "aakhri", "akhri", "previous", "much", "when", "what", "which", "who", "tell", "batao", "bata", "bolo", "बताओ", "बता", "कितना", "कितने", "कितनी", "कब", "क्या", "किसका", "कौन", "पिछला", "पिछली", "आख़िरी", "आखिरी", "आखरी", "किती", "केव्हा", "कधी", "सांग", "शेवटचा", "शेवटची"]);
const LASTW = S(["last", "pichla", "pichli", "pichle", "aakhri", "akhri", "previous", "latest", "पिछला", "पिछली", "पिछले", "आख़िरी", "आखिरी", "आखरी", "शेवटचा", "शेवटची", "मागचा", "मागची"]);
const WHEN = S(["kab", "when", "date", "tareekh", "tarikh", "कब", "तारीख", "तारीख़", "केव्हा", "कधी"]);
const PAY = S(["payment", "paid", "pay", "diya", "diye", "paisa", "paise", "bhugtan", "jama", "received", "mila", "दिया", "दिए", "दिये", "पैसा", "पैसे", "भुगतान", "जमा", "पेमेंट", "दिले", "दिली", "पैसे"]);
const BUY = S(["purchase", "purchased", "bought", "buy", "liya", "kharida", "kharidi", "maal", "saman", "samaan", "order", "लिया", "खरीदा", "खरीदी", "माल", "सामान", "ऑर्डर", "घेतले", "घेतला", "खरेदी"]);
const RATE = S(["rate", "bhav", "bhaav", "price", "daam", "dar", "रेट", "भाव", "दाम", "कीमत", "दर", "किंमत"]);
const OWE = S(["baaki", "baki", "balance", "owe", "owes", "due", "pending", "dena", "outstanding", "बाकी", "बाकि", "देना", "बकाया", "शिल्लक", "येणे", "देणे"]);
const TOTALW = S(["total", "sab", "sabka", "sabhi", "all", "kul", "everyone", "overall", "कुल", "सब", "सबका", "सभी", "एकूण", "सगळ्यांचे", "सगळे"]);
const MOST = S(["sabse", "most", "highest", "zyada", "jyada", "biggest", "सबसे", "ज्यादा", "ज़्यादा", "जास्त", "सर्वात"]);
const TODAYQ = S(["aaj", "today", "आज", "आज"]);
const SALEW = S(["sale", "sales", "bikri", "collection", "vasuli", "बिक्री", "वसूली", "विक्री"]);
const OPENV = S(["open", "kholo", "khol", "dikhao", "dikha", "show", "jao", "go", "chalo", "खोलो", "खोल", "दिखाओ", "दिखा", "जाओ", "चलो", "उघड", "दाखव", "दाखवा", "उघडा"]);
const REMIND = S(["remind", "reminder", "yaad", "dilao", "dilana", "reminders", "रिमाइंडर", "याद", "दिलाओ", "दिलाना", "आठवण", "रिमाइंड"]);
const NEWW = S(["naya", "nayi", "nayee", "new", "add", "banao", "create", "jodo", "नया", "नई", "नयी", "बनाओ", "जोड़ो", "जोडो", "नवीन", "नवा", "नवी", "जोडा", "बनवा"]);
const CUSTW = S(["customer", "party", "grahak", "dukandar", "client", "ग्राहक", "पार्टी", "कस्टमर", "दुकानदार", "क्लाइंट"]);
const RANGEW = S(["month", "months", "monthly", "week", "weeks", "weekly", "year", "years", "yearly", "quarter", "mahina", "mahine", "mahinay", "hafta", "hafte", "saal", "varsh", "महीना", "महीने", "महिना", "हफ्ता", "हफ्ते", "आठवडा", "साल", "वर्ष", "yesterday", "kal"]);
const AGGW = S(["most", "least", "highest", "lowest", "average", "compare", "comparison", "best", "worst", "top", "ranking", "rank", "list", "all", "बनाम", "औसत", "सबसे", "ज़्यादा", "ज्यादा", "कम"]);
export const THIS = S(["this", "him", "his", "her", "is", "isko", "iska", "iski", "isne", "isse", "yeh", "ye", "इस", "इसको", "इसका", "इसकी", "इसने", "इससे", "यह", "ये", "हा", "ही", "याचा", "याची"]);
const SCREENS: [Set<string>, "reports" | "items" | "reminders" | "settings" | "parties"][] = [
  [S(["report", "reports", "रिपोर्ट", "रिपोर्ट्स", "अहवाल"]), "reports"], [S(["items", "item", "materials", "stock", "आइटम", "आयटम", "माल", "सामान"]), "items"],
  [S(["reminders", "reminder", "रिमाइंडर", "आठवण"]), "reminders"], [S(["settings", "setting", "सेटिंग", "सेटिंग्स", "सेटिंग्ज"]), "settings"],
  [S(["home", "parties", "customers", "होम", "पार्टियां", "ग्राहक"]), "parties"],
];

/** Finds a saved party named in the sentence (longest name wins). */
export function partyIn(toks: string[], parties: PartyRef[]): PartyRef | null {
  let best: PartyRef | null = null; let bestLen = 0;
  for (const p of parties) for (const v of [p.name, ...p.nicknames]) {
    const vt = tokenize(v).filter((w) => !["ji", "bhai", "जी", "भाई"].includes(w));
    if (vt.length && vt.every((w) => hasToken(toks, w)) && vt.length > bestLen) { best = p; bestLen = vt.length; }
  }
  if (!best) for (const p of parties) for (const w of tokenize(p.name)) if (w.length >= 3 && toks.some((t) => t === w) && bestLen < 1) { best = p; bestLen = 1; }
  return best;
}

/**
 * Is this sentence a question or a command for Munim (rather than a ledger entry)? null = not one, so it is read as an entry.
 * No party named → the open customer ("this person") if there is one, else Munim asks which customer.
 */
export function routeCommand(text: string, ctx: AssistCtx): Command | null {
  const toks = tokenize(text);
  if (!toks.length) return null;
  const named = partyIn(toks, ctx.parties);
  const party = named ?? (ctx.currentPartyId ? ctx.parties.find((p) => p.id === ctx.currentPartyId) ?? null : null);
  const hasQ = anyOf(toks, QWORD) || /\?/.test(text);
  const needs = (then: QueryKind | "remind" | "open", materialText?: string): Command => (party ? ({ kind: "query", q: then as never, partyId: party.id } as Command) : { kind: "needParty", then, materialText });

  // new customer: "naya customer Rahul 9876543210"
  if (anyOf(toks, NEWW) && anyOf(toks, CUSTW)) {
    const digits = text.replace(/\D/g, "");
    const phone = digits.length >= 10 ? digits.slice(-10) : undefined;
    const nameToks = text.replace(/\d+/g, " ").split(/\s+/).filter((w) => { const f = tokenize(w)[0]; return f && !NEWW.has(f) && !CUSTW.has(f) && !["ka", "ko", "ki", "named", "name", "naam", "number", "phone", "mobile", "का", "को", "नाम", "नंबर", "फोन", "मोबाइल"].includes(f); });
    const name = nameToks.length ? romanizeName(nameToks.join(" ")) : undefined;
    return { kind: "newParty", name, phone };
  }
  // reminder: "Santosh ko reminder bhejo"
  if (anyOf(toks, REMIND)) return party ? { kind: "remind", partyId: party.id } : { kind: "needParty", then: "remind" };
  // screens: "reports kholo", "items dikhao"
  if (anyOf(toks, OPENV) && !named) for (const [set, screen] of SCREENS) if (anyOf(toks, set)) return { kind: "goto", screen };
  // everyone: totals, who owes most, today
  if (!named && anyOf(toks, MOST) && anyOf(toks, OWE)) return { kind: "query", q: "topDue" };
  if (!named && anyOf(toks, TODAYQ) && anyOf(toks, SALEW)) return { kind: "query", q: "today" };
  if (!named && !anyOf(toks, THIS) && anyOf(toks, TOTALW) && anyOf(toks, OWE)) return { kind: "query", q: "totalDue" };
  // questions over a period ("last month", "this week") or comparing/ranking are for the AI reader, not for the single-answer rules below
  if (anyOf(toks, RANGEW) || anyOf(toks, AGGW)) return null;
  // one customer
  if (hasQ && anyOf(toks, RATE) && (anyOf(toks, LASTW) || anyOf(toks, WHEN) || anyOf(toks, S(["charged", "tha", "थ", "था", "होता", "लावला", "लगाया"])))) {
    const m = findMaterial(text, toks, ctx.materials);
    if (!party) return { kind: "needParty", then: "lastRate", materialText: m?.name };
    return m ? { kind: "query", q: "lastRate", partyId: party.id, materialId: m.id } : { kind: "needItem", partyId: party.id };
  }
  if (hasQ && (anyOf(toks, WHEN) || anyOf(toks, LASTW)) && anyOf(toks, PAY) && !anyOf(toks, BUY)) return needs("lastPayment");
  if (hasQ && (anyOf(toks, WHEN) || anyOf(toks, LASTW)) && anyOf(toks, BUY)) return needs("lastPurchase");
  if (hasQ && anyOf(toks, OWE)) return needs("balance");
  if (hasQ && anyOf(toks, S(["kitna", "much", "कितना", "किती"])) && (anyOf(toks, S(["dena", "देना", "देणे", "owe", "owes", "pay"])) || party)) return needs("balance");
  // "open Santosh" / "Santosh kholo"
  if (anyOf(toks, OPENV) && named) return { kind: "open", partyId: named.id };
  return null;
}

export function findMaterial(text: string, toks: string[], materials: MaterialRef[]): MaterialRef | null {
  const hit = materials.filter((m) => [m.name, ...m.localNames].some((n) => { const nt = tokenize(n); return nt.length && nt.every((w) => hasToken(toks, w)); }));
  if (hit.length === 1) return hit[0]!;
  if (hit.length > 1) return hit.sort((a, b) => tokenize(b.name).length - tokenize(a.name).length)[0]!;
  const m = matchMaterial(text, materials);
  return m.kind === "match" ? m.material : null;
}

// ───────── answers (from the ledger, by code) ─────────
export interface PartyFacts { name: string; balance: Paise; entries: Entry[] }
export interface Overview { parties: { id: string; name: string; balance: Paise }[]; todaySales: Paise; todayCollections: Paise }

/** The newest ACTIVE payment (money received) of this party. */
export function lastPayment(entries: Entry[]): { date: string; amount: Paise; mode?: PaymentMode } | null {
  const ps = entries.filter((e) => e.status === "active" && e.type === "payment" && !e.chequeBounced).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id.localeCompare(a.id)));
  const e = ps[0];
  return e ? { date: e.date, amount: -entryEffect(e), mode: e.paymentMode } : null;
}
/** The newest sale: its date, the items sold and the entry total. */
export function lastPurchase(entries: Entry[], names: (id: string) => string): { date: string; items: string[]; total: Paise } | null {
  const ss = entries.filter((e) => e.status === "active" && e.type === "sale").sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id.localeCompare(a.id)));
  const e = ss[0];
  return e ? { date: e.date, items: [...new Set((e.lines ?? []).map((l) => names(l.materialId)))], total: entryEffect(e) } : null;
}
/** Everyone's balance, biggest first (customers who owe). */
export const topDue = (o: Overview) => [...o.parties].filter((p) => p.balance > 0).sort((a, b) => b.balance - a.balance);
export const totalDue = (o: Overview): { total: Paise; n: number } => { const d = topDue(o); return { total: d.reduce((s, p) => s + p.balance, 0), n: d.length }; };
export const money = formatINR;

/** Does the sentence contain a question word ("kitna", "when", "?")? */
export const hasQuestionWord = (text: string): boolean => anyOf(tokenize(text), QWORD) || /\?/.test(text);
