import type { DraftLine } from "./entryDraft";
import { matchMaterial, prettyItemName, type MaterialRef } from "./materials";
import { foldDevanagari, hasToken, isDevanagari, sameWord, skeleton, stems } from "./phonetic";
import { isDateWord, THIS } from "./assistant";
import { romanizeWord } from "./romanize";
import { isNumberWord, scanNumbers, tokenize, type NumberSpan } from "./spoken";
import type { EntryType, PaymentMode } from "./types";

/**
 * Voice pipeline (PRD 6.1): Listen → STT → UNDERSTAND (extract only, never calculate) → MATCH → VALIDATE → CALCULATE → CONFIRM.
 * This file = Understand contract + Match + Validate. The extractor can be a rule-based fallback (below) or an LLM that
 * returns the same ParsedUtterance JSON. Either way the dealer sees and confirms a filled form before anything is saved.
 */
export interface ParsedItem { materialText: string; quantity?: number; unit?: string; rate?: number /* rupees */ }
export interface ParsedEntry {
  intent: EntryType; partyText?: string; siteText?: string; items: ParsedItem[];
  amount?: number /* rupees: payment / charge / discount */; paymentMode?: PaymentMode;
}
export interface ParsedUtterance { entries: ParsedEntry[]; language?: "hi" | "mr" | "en" }

export interface PartyRef { id: string; name: string; nicknames: string[]; sites: { id: string; name: string }[] }
export interface UnderstandContext { parties: PartyRef[]; materials: MaterialRef[]; /** the customer whose page is open: used when no party is named */ currentPartyId?: string }

export type Question =
  | { kind: "party"; spoken?: string; options: PartyRef[] }          // options empty = unknown name → offer "new party?"
  | { kind: "site"; spoken: string; options: { id: string; name: string }[] }
  | { kind: "material"; line: number; spoken: string; options: MaterialRef[] } // brand question when several match
  | { kind: "unit"; line: number; options: string[] }
  | { kind: "quantity"; line: number }
  | { kind: "rate"; line: number }                                    // rate is mandatory on every line
  | { kind: "amount" }
  | { kind: "mode" };

export interface ResolvedEntry {
  type: EntryType; partyId?: string; siteId?: string | null; lines: DraftLine[]; amount: string;
  paymentMode?: PaymentMode | null; questions: Question[];
  /** Items said aloud that are not in the list: the dialogue adds them (the owner sees a NEW ITEM tag and they are created on Save). */
  newItems: { line: number; name: string; unit?: string }[];
}

const fold = (xs: string[]) => xs.map(foldDevanagari);
const HONORIFICS = new Set(["bhai", "ji", "sahab", "saheb", "shri", "mr", "bhau", "tai", "dada", "bhaiya", ...fold(["जी", "भाई", "भैया", "साहब", "साहेब", "सेठ", "दादा", "ताई", "भाऊ", "श्री"])]);
const clean = (s: string) => tokenize(s).filter((w) => !HONORIFICS.has(w));

/** Match a spoken name to parties: exact name/nickname → unique token subset → ambiguous. */
export function matchParty(text: string, parties: PartyRef[]): { kind: "match"; party: PartyRef } | { kind: "ambiguous"; options: PartyRef[] } | { kind: "none" } {
  const spoken = clean(text);
  if (spoken.length === 0) return { kind: "none" };
  const names = (p: PartyRef) => [p.name, ...p.nicknames].map(clean);
  const same = (a: string[], b: string[]) => a.length === b.length && a.every((w, i) => sameWord(w, b[i]!));
  const exact = parties.filter((p) => names(p).some((n) => same(spoken, n)));
  if (exact.length === 1) return { kind: "match", party: exact[0]! };
  const pool = exact.length > 1 ? exact : parties.filter((p) => names(p).some((n) => spoken.every((w) => n.some((x) => sameWord(w, x)))));
  if (pool.length === 1) return { kind: "match", party: pool[0]! };
  return pool.length > 1 ? { kind: "ambiguous", options: pool } : { kind: "none" };
}

const UNIT_ALIASES: Record<string, string> = {
  bag: "bag", bags: "bag", goni: "bag", gonya: "bag", bori: "bag", butti: "butti", buttis: "butti", butty: "butti",
  mtr: "mtr", meter: "mtr", metre: "mtr", meters: "mtr", metres: "mtr", mtrs: "mtr",
  ltr: "ltr", litre: "ltr", liter: "ltr", litres: "ltr", liters: "ltr", kg: "kg", kilo: "kg", kgs: "kg",
  nos: "nos", no: "nos", pcs: "nos", piece: "nos", pieces: "nos", brass: "brass", trolley: "trolley", ton: "ton", tonne: "ton",
  ...Object.fromEntries(Object.entries({
    बैग: "bag", बोरी: "bag", बोरा: "bag", बोऱ्या: "bag", गोणी: "bag", गोण्या: "bag", गोण: "bag", थैली: "bag",
    बुट्टी: "butti", बट्टी: "butti", बुटी: "butti", मीटर: "mtr", मिटर: "mtr", मीटरे: "mtr", लीटर: "ltr", लिटर: "ltr", किलो: "kg", किलोग्राम: "kg",
    नग: "nos", पीस: "nos", नंग: "nos", ब्रास: "brass", ट्रॉली: "trolley", ट्राली: "trolley", ट्रॉल्या: "trolley", टन: "ton",
  }).map(([k, v]) => [foldDevanagari(k), v])),
};
/** Canonical unit for a spoken word (Roman or Devanagari, also with a glued ending), or undefined. */
export const unitOf = (token: string): string | undefined => { for (const x of stems(token)) if (x in UNIT_ALIASES) return UNIT_ALIASES[x]; return undefined; };
export const normalizeUnit = (u: string) => unitOf(u.toLowerCase()) ?? u.toLowerCase();

const fmt = (n: number) => String(Math.round(n * 1000) / 1000);

/** Two Roman spellings of one sound ("waddy" / "waddi"): same consonants and the same first letter. */
const softSame = (a: string, b: string) => !isDevanagari(a) && !isDevanagari(b) && a[0] === b[0] && skeleton(a).length >= 2 && skeleton(a) === skeleton(b);

/** Saved items whose name (or category / local name) every spoken word SOUNDS like: "waddy cement" → Waddi. Catches mishearing, so a new item is not made twice. */
function soundsLike(text: string, materials: MaterialRef[]): MaterialRef[] {
  const spoken = tokenize(text);
  if (!spoken.length) return [];
  return materials.filter((m) => {
    const hay = [m.name, ...m.localNames, m.category ?? ""].flatMap((x) => tokenize(x));
    return spoken.every((w) => hay.some((h) => sameWord(w, h) || softSame(w, h)));
  });
}

/** MATCH + VALIDATE: turn extracted text into a form draft plus the follow-up questions still open. */
export function resolveUtterance(parsed: ParsedUtterance, ctx: UnderstandContext): ResolvedEntry[] {
  let lastParty: PartyRef | undefined = ctx.currentPartyId ? ctx.parties.find((p) => p.id === ctx.currentPartyId) : undefined;
  return parsed.entries.map((e) => {
    const questions: Question[] = [];
    let party: PartyRef | undefined;
    if (e.partyText) {
      const m = matchParty(e.partyText, ctx.parties);
      if (m.kind === "match") party = m.party;
      else questions.push({ kind: "party", spoken: e.partyText, options: m.kind === "ambiguous" ? m.options : [] });
    } else if (lastParty) party = lastParty;
    else questions.push({ kind: "party", options: [] });
    if (party) lastParty = party;

    let siteId: string | null = null;
    if (e.siteText && party) {
      const s = clean(e.siteText);
      const hits = party.sites.filter((x) => { const n = clean(x.name); return s.every((w) => n.some((y) => sameWord(w, y))); });
      if (hits.length === 1) siteId = hits[0]!.id;
      else questions.push({ kind: "site", spoken: e.siteText, options: hits.length ? hits : party.sites });
    }

    const lines: DraftLine[] = [];
    const newItems: ResolvedEntry["newItems"] = [];
    if (e.intent === "sale" || e.intent === "return") {
      e.items.forEach((it, i) => {
        const m = matchMaterial(it.materialText, ctx.materials);
        let material: MaterialRef | undefined;
        let fresh = false;
        if (m.kind === "match") material = m.material;
        else if (m.kind === "ambiguous") questions.push({ kind: "material", line: i, spoken: it.materialText, options: m.options });
        else {
          // not on the list: a name that SOUNDS the same as a saved item is that item; otherwise it is a new item (created when the owner taps Save)
          const near = soundsLike(it.materialText, ctx.materials);
          if (near.length === 1) material = near[0];
          else if (near.length > 1) questions.push({ kind: "material", line: i, spoken: it.materialText, options: near });
          else if (tokenize(it.materialText).length) { fresh = true; newItems.push({ line: i, name: prettyItemName(tokenize(it.materialText).map(romanizeWord)), unit: it.unit ? normalizeUnit(it.unit) : undefined }); }
          else questions.push({ kind: "material", line: i, spoken: it.materialText, options: [] });
        }
        let unit = it.unit ? normalizeUnit(it.unit) : undefined;
        if (fresh) { /* the unit is settled by the dialogue once the new item exists */ }
        else if (material) {
          if (unit && !material.units.some((u) => u.toLowerCase() === unit)) { questions.push({ kind: "unit", line: i, options: material.units }); unit = undefined; }
          else if (!unit && material.units.length === 1) unit = material.units[0];
          else if (!unit) questions.push({ kind: "unit", line: i, options: material.units });
        }
        if (it.quantity === undefined) questions.push({ kind: "quantity", line: i });
        if (it.rate === undefined) questions.push({ kind: "rate", line: i });
        lines.push({ materialId: material?.id, unit, qty: it.quantity === undefined ? "" : fmt(it.quantity), rate: it.rate === undefined ? "" : fmt(it.rate) });
      });
    } else {
      if (e.amount === undefined) questions.push({ kind: "amount" });
      if (e.intent === "payment" && !e.paymentMode) questions.push({ kind: "mode" });
    }
    return {
      type: e.intent, partyId: party?.id, siteId, lines, amount: e.amount === undefined ? "" : fmt(e.amount),
      paymentMode: e.intent === "payment" ? (e.paymentMode ?? null) : null, questions, newItems,
    };
  });
}

// ───────────────────────── rule-based extractor (fallback; an LLM can return the same JSON) ─────────────────────────
const MODE_WORDS: Record<string, PaymentMode> = {
  upi: "upi", online: "upi", gpay: "upi", phonepe: "upi", paytm: "upi", cash: "cash", nakad: "cash", rokda: "cash",
  cheque: "cheque", check: "cheque", bank: "bank", neft: "bank", rtgs: "bank", transfer: "bank",
  ...Object.fromEntries(Object.entries({
    यूपीआई: "upi", यूपीआय: "upi", युपीआई: "upi", ऑनलाइन: "upi", ऑनलाईन: "upi", ऑनलाइन्: "upi", गूगलपे: "upi", जीपे: "upi", फोनपे: "upi", पेटीएम: "upi",
    नकद: "cash", कैश: "cash", रोख: "cash", रोकड: "cash", नगद: "cash", चेक: "cheque", धनादेश: "cheque", बैंक: "bank", नेफ्ट: "bank", ट्रांसफर: "bank", बँक: "bank",
  }).map(([k, v]) => [foldDevanagari(k), v as PaymentMode])),
};
export const modeOf = (token: string): PaymentMode | undefined => { for (const x of stems(token)) if (x in MODE_WORDS) return MODE_WORDS[x]; return undefined; };
const CHARGE = new Set(["bhada", "bhaada", "bhade", "transport", "gaadi", "gadi", "freight", "vahatuk", ...fold(["भाडा", "भाडे", "भाड़ा", "किराया", "किराये", "ट्रांसपोर्ट", "गाड़ी", "गाडी", "वाहतूक", "फ्रेट", "ढुलाई", "ढुलाई"])]);
const DISCOUNT = new Set(["discount", "chhoot", "chhut", "concession", ...fold(["छूट", "डिस्काउंट", "सूट", "कन्सेशन"])]);
const RETURN = new Set(["wapas", "vapas", "return", "parat", ...fold(["वापस", "वापसी", "रिटर्न", "परत", "लौटाया", "लौटाए", "लौटाये"])]);
const PAID_WORDS = new Set(["paid", "received", "jama", "mila", ...fold(["मिला", "मिले", "मिली", "मिळाले", "मिळाली", "मिळाला", "प्राप्त", "जमा", "भरले", "भरा", "दिए", "दिये"])]);
const SITE_WORDS = ["site", "saite"];
const isSiteWord = (w: string) => SITE_WORDS.includes(w) || /^(साइट|साईट)/.test(w);
const isKoNeLa = (w: string) => ["ko", "ne", "la", "को", "ने", "ला"].includes(w);
const hasNe = (w: string) => w === "ne" || w === "ने" || (isDevanagari(w) && w.length > 2 && w.endsWith("ने"));
const FILLER = new Set(["ka", "ki", "ke", "rate", "hisab", "se", "mein", "me", "per", "at", "of", "ne", "ko", "la", "diya", "dila", "diye", "bheja", "gave", "to", "from", "pe", "var", "site", "kar", "do", "kam", "jodo", "add", "rupay", "rupaye", "rs", "ruppe"]);

const FILLER_DEV = new Set(fold(["का", "की", "के", "रेट", "भाव", "दर", "हिसाब", "से", "में", "पर", "को", "ने", "दिया", "दिये", "दिए", "लिखो", "लिख", "एंट्री", "एन्ट्री", "जोड़ो", "जोडो", "कर", "दो", "रुपये", "चाहिए", "भेजा", "माल", "सामान"]).concat(["likho", "entry", "dena", "de", "liya", "chahiye", "maal", "saman", "samaan", "sale", "kharida", "becha"]));

interface Mention { start: number; end: number; text: string }

/** An item the shop has never listed: the words around a quantity and a unit. */
function findFreeItem(tokens: string[], spans: NumberSpan[], noise: (i: number) => boolean): Mention | null {
  const mk = (start: number, end: number): Mention => ({ start, end, text: tokens.slice(start, end).join(" ") });
  for (const s of spans) {
    // "20 ACC cement bags": number, item words, unit
    let j = s.end;
    while (j < tokens.length && !noise(j) && j - s.end < 4) j++;
    if (j > s.end && j < tokens.length && unitOf(tokens[j]!)) return mk(s.end, j);
    // "20 bags ACC cement" / "ACC cement 20 bags": number, unit, then the item words after or before
    if (s.end < tokens.length && unitOf(tokens[s.end]!)) {
      let e = s.end + 1;
      while (e < tokens.length && !noise(e) && e - (s.end + 1) < 4) e++;
      if (e > s.end + 1) return mk(s.end + 1, e);
      let b = s.start;
      while (b > 0 && !noise(b - 1) && s.start - b < 4) b--;
      if (b < s.start) return mk(b, s.start);
    }
  }
  return null;
}

function findMentions(tokens: string[], materials: MaterialRef[]): Mention[] {
  const variants: { toks: string[] }[] = [];
  for (const m of materials) {
    for (const n of [m.name, ...m.localNames]) variants.push({ toks: tokenize(n) });
    if (m.category) variants.push({ toks: tokenize(m.category) });
  }
  variants.sort((a, b) => b.toks.length - a.toks.length);
  const out: Mention[] = [];
  for (let i = 0; i < tokens.length; i++) {
    for (const v of variants) {
      if (v.toks.length && v.toks.every((w, k) => i + k < tokens.length && sameWord(tokens[i + k]!, w))) { out.push({ start: i, end: i + v.toks.length, text: v.toks.join(" ") }); i += v.toks.length - 1; break; }
    }
  }
  return out;
}

/** Rule-based "understand": pulls party, site, items, quantities, units, rates, payments, charges out of one sentence. */
export function heuristicUnderstand(text: string, ctx: UnderstandContext): ParsedUtterance {
  const clauses = text.replace(/(^|\s)(और|आणि|तथा|व)(?=\s)/g, "$1,").replace(/[।॥]/g, ",").split(/(?<!\d),|,(?!\d)|;|\.(?=\s|$)|\b(?:aur|and|ani|tatha)\b/i).map((c) => c.trim()).filter(Boolean);
  const entries: ParsedEntry[] = [];
  for (const clause of clauses) {
    const tokens = tokenize(clause);
    const mentions = findMentions(tokens, ctx.materials);
    // a number that is part of an item name ("Block 6 inch") is not a quantity or a rate
    const spans = scanNumbers(tokens).filter((sp) => !mentions.some((m) => sp.start >= m.start && sp.end <= m.end));

    // party: a saved party name/nickname token found in the clause, else the words before ko/ne/la
    let partyText: string | undefined;
    let bestLen = 0;
    for (const p of ctx.parties) {
      for (const variant of [p.name, ...p.nicknames]) {
        const vt = clean(variant);
        if (vt.length && vt.every((w) => hasToken(tokens, w)) && vt.length > bestLen) { partyText = vt.join(" "); bestLen = vt.length; }
      }
    }
    if (!partyText) {
      for (const p of ctx.parties) for (const w of clean(p.name)) if (w.length >= 2 && hasToken(tokens, w) && bestLen < 1) { partyText = w; bestLen = 1; }
    }
    if (!partyText) {
      const k = tokens.findIndex(isKoNeLa);
      if (k > 0) { const before = tokens.slice(0, k).filter((w) => !isNumberWord(w) && !HONORIFICS.has(w) && !modeOf(w) && !isDateWord(w) && !THIS.has(w) && !unitOf(w)); if (before.length && !mentions.length) partyText = before.join(" "); else if (before.length && mentions[0] && mentions[0].start > k) partyText = before.join(" "); }
    }

    // site: word before "site"/"saite", or a saved site name of the matched party
    let siteText: string | undefined;
    for (const p of ctx.parties) for (const s of p.sites) { const st = clean(s.name); if (st.length && st.every((w) => hasToken(tokens, w))) siteText = st.join(" "); }
    const si = tokens.findIndex(isSiteWord);
    if (!siteText && si > 0) siteText = tokens[si - 1];

    const hasWord = (set: Set<string>) => tokens.some((w) => set.has(w));
    const mode = tokens.map(modeOf).find(Boolean);
    const firstAmount = spans[0]?.value;

    if (hasWord(CHARGE) && mentions.length === 0) { entries.push({ intent: "charge", items: [], amount: firstAmount }); continue; }
    if (hasWord(DISCOUNT) || ((tokens.includes("kam") || tokens.includes("कम")) && mentions.length === 0)) { entries.push({ intent: "discount", items: [], partyText, amount: firstAmount }); continue; }
    if (mentions.length === 0 && (tokens.some(hasNe) || mode || tokens.some((w) => PAID_WORDS.has(w)))) {
      entries.push({ intent: "payment", items: [], partyText, amount: firstAmount, paymentMode: mode }); continue;
    }

    // Words that are NOT part of an item name: numbers, units, "ka/ko/ne", the party and site words, payment words…
    const partyWords = new Set(clean(partyText ?? "")); const siteWords = new Set(clean(siteText ?? ""));
    const k0 = tokens.findIndex(isKoNeLa);
    const low = k0 >= 0 && spans.length && k0 < spans[0]!.start ? k0 + 1 : 0; // everything before "ko/ne" is the party
    const noise = (i: number) => {
      const w = tokens[i]!;
      return i < low || isNumberWord(w) || !!unitOf(w) || FILLER.has(w) || FILLER_DEV.has(w) || HONORIFICS.has(w) || isKoNeLa(w) || hasNe(w) || isSiteWord(w) || !!modeOf(w)
        || CHARGE.has(w) || DISCOUNT.has(w) || RETURN.has(w) || PAID_WORDS.has(w) || partyWords.has(w) || siteWords.has(w);
    };
    // "ACC cement": a brand/word said just before a known item (or category) belongs to the item name
    const inMention = (i: number) => mentions.some((m) => i >= m.start && i < m.end);
    for (const m of mentions) {
      let n = 0;
      while (n < 3 && m.start > 0 && !noise(m.start - 1) && !inMention(m.start - 1)) { m.start--; n++; }
      m.text = tokens.slice(m.start, m.end).join(" ");
    }
    // nothing on the list matches: read the sentence by its shape, "<qty> <item words> <unit> <rate>" (or unit first / item first)
    if (mentions.length === 0) {
      const free = findFreeItem(tokens, spans, noise);
      if (!free) continue;
      mentions.push(free);
    }

    // items
    const unitAt = (i: number) => (i < tokens.length && unitOf(tokens[i]!) ? tokens[i]! : undefined);
    const used = new Set<NumberSpan>();
    const items: ParsedItem[] = mentions.map((m) => {
      const cands = spans.filter((s) => !used.has(s) && (unitAt(s.end) || s.end === m.start));
      cands.sort((a, b) => Math.abs(a.start - m.start) - Math.abs(b.start - m.start));
      const q = cands[0];
      if (q) used.add(q);
      // the unit is right after the number ("80 bag") or, when the number comes first, after the item name ("20 ACC cement bags")
      return { materialText: m.text, quantity: q?.value, unit: q ? (unitAt(q.end) ?? (q.end === m.start ? unitAt(m.end) : undefined)) : undefined };
    });
    // rates: leftover numbers, nearest mention first
    mentions.forEach((m, i) => {
      const rest = spans.filter((s) => !used.has(s));
      rest.sort((a, b) => Math.abs(a.start - m.start) - Math.abs(b.start - m.start));
      const r = rest[0];
      if (r) { used.add(r); items[i]!.rate = r.value; }
    });
    const intent: EntryType = hasWord(RETURN) ? "return" : "sale";
    entries.push({ intent, partyText, siteText, items });
  }
  // merge consecutive sale clauses that have no party of their own (e.g. "…2 brass reti, 50 bag cement")
  const merged: ParsedEntry[] = [];
  for (const e of entries) {
    const prev = merged[merged.length - 1];
    if (prev && prev.intent === e.intent && (e.intent === "sale" || e.intent === "return") && !e.partyText && !e.siteText) prev.items.push(...e.items);
    else merged.push(e);
  }
  return { entries: merged };
}

const INTENTS = new Set(["sale", "payment", "charge", "discount", "return"]);
const MODES = new Set(["cash", "upi", "cheque", "bank"]);
const str = (x: unknown) => (typeof x === "string" && x.trim() ? x.trim() : undefined);
const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : undefined);

/**
 * What the AI extractor sent back, checked and cleaned (nulls removed, odd values dropped). Returns null when it is unusable,
 * so the app falls back to its built-in rules. Nothing from the AI is trusted blindly: the owner still sees and taps Save.
 */
export function sanitizeParsed(raw: unknown): ParsedUtterance | null {
  const r = raw as { entries?: unknown; language?: unknown } | null;
  if (!r || !Array.isArray(r.entries) || r.entries.length === 0) return null;
  const entries: ParsedEntry[] = [];
  for (const e of r.entries as Record<string, unknown>[]) {
    if (!e || typeof e.intent !== "string" || !INTENTS.has(e.intent)) continue;
    const items: ParsedItem[] = [];
    if (Array.isArray(e.items)) for (const it of e.items as Record<string, unknown>[]) { const m = str(it?.materialText); if (m) items.push({ materialText: m, quantity: num(it.quantity), unit: str(it.unit), rate: num(it.rate) }); }
    const mode = str(e.paymentMode);
    entries.push({ intent: e.intent as EntryType, partyText: str(e.partyText), siteText: str(e.siteText), items, amount: num(e.amount), paymentMode: mode && MODES.has(mode) ? (mode as PaymentMode) : undefined });
  }
  if (!entries.length) return null;
  const l = r.language;
  return { entries, language: l === "hi" || l === "mr" || l === "en" ? l : undefined };
}
