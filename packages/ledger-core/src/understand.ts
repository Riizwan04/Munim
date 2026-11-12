import type { DraftLine } from "./entryDraft";
import { matchMaterial, type MaterialRef } from "./materials";
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
export interface UnderstandContext { parties: PartyRef[]; materials: MaterialRef[] }

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
}

const HONORIFICS = new Set(["bhai", "ji", "sahab", "saheb", "shri", "mr", "bhau", "tai", "dada", "bhaiya"]);
const clean = (s: string) => tokenize(s).filter((w) => !HONORIFICS.has(w));

/** Match a spoken name to parties: exact name/nickname → unique token subset → ambiguous. */
export function matchParty(text: string, parties: PartyRef[]): { kind: "match"; party: PartyRef } | { kind: "ambiguous"; options: PartyRef[] } | { kind: "none" } {
  const spoken = clean(text);
  if (spoken.length === 0) return { kind: "none" };
  const names = (p: PartyRef) => [p.name, ...p.nicknames].map(clean);
  const exact = parties.filter((p) => names(p).some((n) => n.join(" ") === spoken.join(" ")));
  if (exact.length === 1) return { kind: "match", party: exact[0]! };
  const pool = exact.length > 1 ? exact : parties.filter((p) => names(p).some((n) => spoken.every((w) => n.includes(w))));
  if (pool.length === 1) return { kind: "match", party: pool[0]! };
  return pool.length > 1 ? { kind: "ambiguous", options: pool } : { kind: "none" };
}

const UNIT_ALIASES: Record<string, string> = {
  bag: "bag", bags: "bag", goni: "bag", gonya: "bag", bori: "bag", butti: "butti", buttis: "butti", butty: "butti",
  mtr: "mtr", meter: "mtr", metre: "mtr", meters: "mtr", metres: "mtr", mtrs: "mtr",
  ltr: "ltr", litre: "ltr", liter: "ltr", litres: "ltr", liters: "ltr", kg: "kg", kilo: "kg", kgs: "kg",
  nos: "nos", no: "nos", pcs: "nos", piece: "nos", pieces: "nos", brass: "brass", trolley: "trolley", ton: "ton", tonne: "ton",
};
export const normalizeUnit = (u: string) => UNIT_ALIASES[u.toLowerCase()] ?? u.toLowerCase();

const fmt = (n: number) => String(Math.round(n * 1000) / 1000);

/** MATCH + VALIDATE: turn extracted text into a form draft plus the follow-up questions still open. */
export function resolveUtterance(parsed: ParsedUtterance, ctx: UnderstandContext): ResolvedEntry[] {
  let lastParty: PartyRef | undefined;
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
      const hits = party.sites.filter((x) => { const n = clean(x.name); return s.every((w) => n.includes(w)); });
      if (hits.length === 1) siteId = hits[0]!.id;
      else questions.push({ kind: "site", spoken: e.siteText, options: hits.length ? hits : party.sites });
    }

    const lines: DraftLine[] = [];
    if (e.intent === "sale" || e.intent === "return") {
      e.items.forEach((it, i) => {
        const m = matchMaterial(it.materialText, ctx.materials);
        let material: MaterialRef | undefined;
        if (m.kind === "match") material = m.material;
        else questions.push({ kind: "material", line: i, spoken: it.materialText, options: m.kind === "ambiguous" ? m.options : [] });
        let unit = it.unit ? normalizeUnit(it.unit) : undefined;
        if (material) {
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
      paymentMode: e.intent === "payment" ? (e.paymentMode ?? null) : null, questions,
    };
  });
}

// ───────────────────────── rule-based extractor (fallback; an LLM can return the same JSON) ─────────────────────────
const MODE_WORDS: Record<string, PaymentMode> = {
  upi: "upi", online: "upi", gpay: "upi", phonepe: "upi", paytm: "upi", cash: "cash", nakad: "cash", rokda: "cash",
  cheque: "cheque", check: "cheque", bank: "bank", neft: "bank", rtgs: "bank", transfer: "bank",
};
const CHARGE = new Set(["bhada", "bhaada", "bhade", "transport", "gaadi", "gadi", "freight", "vahatuk"]);
const DISCOUNT = new Set(["discount", "chhoot", "chhut", "concession"]);
const RETURN = new Set(["wapas", "vapas", "return", "parat"]);
const FILLER = new Set(["ka", "ki", "ke", "rate", "hisab", "se", "mein", "me", "per", "at", "of", "ne", "ko", "la", "diya", "dila", "diye", "bheja", "gave", "to", "from", "pe", "var", "site", "kar", "do", "kam", "jodo", "add", "rupay", "rupaye", "rs", "ruppe"]);

interface Mention { start: number; end: number; text: string }

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
      if (v.toks.length && v.toks.every((w, k) => tokens[i + k] === w)) { out.push({ start: i, end: i + v.toks.length, text: v.toks.join(" ") }); i += v.toks.length - 1; break; }
    }
  }
  return out;
}

/** Rule-based "understand": pulls party, site, items, quantities, units, rates, payments, charges out of one sentence. */
export function heuristicUnderstand(text: string, ctx: UnderstandContext): ParsedUtterance {
  const clauses = text.split(/(?<!\d),|,(?!\d)|;|\.(?=\s|$)|\b(?:aur|and|ani|tatha)\b/i).map((c) => c.trim()).filter(Boolean);
  const entries: ParsedEntry[] = [];
  for (const clause of clauses) {
    const tokens = tokenize(clause);
    const spans = scanNumbers(tokens);
    const mentions = findMentions(tokens, ctx.materials);

    // party: a saved party name/nickname token found in the clause, else the words before ko/ne/la
    let partyText: string | undefined;
    let bestLen = 0;
    for (const p of ctx.parties) {
      for (const variant of [p.name, ...p.nicknames]) {
        const vt = clean(variant);
        if (vt.length && vt.every((w) => tokens.includes(w)) && vt.length > bestLen) { partyText = vt.join(" "); bestLen = vt.length; }
      }
    }
    if (!partyText) {
      for (const p of ctx.parties) for (const w of clean(p.name)) if (w.length >= 3 && tokens.includes(w) && bestLen < 1) { partyText = w; bestLen = 1; }
    }
    if (!partyText) {
      const k = tokens.findIndex((w) => w === "ko" || w === "ne" || w === "la");
      if (k > 0) { const before = tokens.slice(0, k).filter((w) => !isNumberWord(w) && !HONORIFICS.has(w)); if (before.length && !mentions.length) partyText = before.join(" "); else if (before.length && mentions[0] && mentions[0].start > k) partyText = before.join(" "); }
    }

    // site: word before "site"/"saite", or a saved site name of the matched party
    let siteText: string | undefined;
    const si = tokens.findIndex((w) => w === "site" || w === "saite");
    if (si > 0) siteText = tokens[si - 1];
    if (!siteText) for (const p of ctx.parties) for (const s of p.sites) { const st = clean(s.name); if (st.length && st.every((w) => tokens.includes(w))) siteText = st.join(" "); }

    const hasWord = (set: Set<string>) => tokens.some((w) => set.has(w));
    const mode = tokens.map((w) => MODE_WORDS[w]).find(Boolean);
    const firstAmount = spans[0]?.value;

    if (hasWord(CHARGE) && mentions.length === 0) { entries.push({ intent: "charge", items: [], amount: firstAmount }); continue; }
    if (hasWord(DISCOUNT) || (tokens.includes("kam") && mentions.length === 0)) { entries.push({ intent: "discount", items: [], partyText, amount: firstAmount }); continue; }
    if (mentions.length === 0 && (tokens.includes("ne") || mode || tokens.some((w) => ["paid", "received", "jama", "mila"].includes(w)))) {
      entries.push({ intent: "payment", items: [], partyText, amount: firstAmount, paymentMode: mode }); continue;
    }
    if (mentions.length === 0) continue;

    // items
    const unitAt = (i: number) => (i < tokens.length && tokens[i]! in UNIT_ALIASES ? tokens[i]! : undefined);
    const used = new Set<NumberSpan>();
    const items: ParsedItem[] = mentions.map((m) => {
      const cands = spans.filter((s) => !used.has(s) && (unitAt(s.end) || s.end === m.start));
      cands.sort((a, b) => Math.abs(a.start - m.start) - Math.abs(b.start - m.start));
      const q = cands[0];
      if (q) used.add(q);
      return { materialText: m.text, quantity: q?.value, unit: q ? unitAt(q.end) : undefined };
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
