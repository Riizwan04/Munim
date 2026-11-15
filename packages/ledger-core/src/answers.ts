import { hasToken, foldDevanagari } from "./phonetic";
import { scanNumbers, tokenize } from "./spoken";
import { modeOf, unitOf } from "./understand";
import type { PaymentMode } from "./types";
import type { SpeakLang } from "./speak";

/** Reading short spoken answers: yes / no / done, "the second one", a number, a unit, a payment mode, a name from a list. */
const set = (xs: string[]) => new Set(xs.map(foldDevanagari));
const YES = set(["yes", "yeah", "yep", "ok", "okay", "correct", "right", "sure", "haan", "han", "ha", "haa", "theek", "thik", "sahi", "ji", "ho", "hoy", "barobar", "हाँ", "हां", "हा", "जी", "ठीक", "सही", "बिल्कुल", "होय", "हो", "बरोबर", "बरं"]);
const NO = set(["no", "nope", "wrong", "change", "incorrect", "nahi", "nahin", "nai", "na", "galat", "nako", "nahi", "नहीं", "नही", "ना", "गलत", "नको", "नाही", "चूक", "बदलो", "बदला"]);
const DONE = set(["bas", "done", "finished", "enough", "nothing", "stop", "बस", "खत्म", "समाप्त", "हो गया", "काही नाही", "पुरे"]);
const DONE_PHRASES = ["that's all", "thats all", "that is all", "that's it", "no more", "nothing more", "bas itna", "bas itna hi", "बस इतना", "बस इतना ही", "और कुछ नहीं", "आणखी काही नाही", "ho gaya", "हो गया", "kuch nahi", "कुछ नहीं"];

const words = (text: string) => tokenize(text);
export const isYes = (text: string) => words(text).some((w) => YES.has(w)) && !isNo(text);
export const isNo = (text: string) => words(text).some((w) => NO.has(w));
/** "That's all": an end-of-session answer to "any more entries?". A plain "no" counts too. */
export function isDone(text: string): boolean {
  const t = foldDevanagari(text.toLowerCase());
  return DONE_PHRASES.some((p) => t.includes(foldDevanagari(p))) || words(text).some((w) => DONE.has(w)) || (isNo(text) && !/\d/.test(text) && words(text).length <= 3);
}

const ORD: Record<string, number> = Object.fromEntries(Object.entries({
  first: 0, "1st": 0, one: 0, pehla: 0, pehli: 0, pehle: 0, पहला: 0, पहली: 0, पहले: 0, पहिला: 0, पहिली: 0, एक: 0,
  second: 1, "2nd": 1, two: 1, doosra: 1, dusra: 1, doosri: 1, दूसरा: 1, दूसरी: 1, दुसरा: 1, दुसरी: 1, दो: 1, दोन: 1,
  third: 2, "3rd": 2, three: 2, teesra: 2, tisra: 2, तीसरा: 2, तीसरी: 2, तिसरा: 2, तिसरी: 2, तीन: 2,
  fourth: 3, "4th": 3, four: 3, chautha: 3, चौथा: 3, चौथी: 3, चार: 3,
}).map(([k, v]) => [foldDevanagari(k), v]));

export interface Choice { id: string; names: string[] }
/** Picks one of the options by name ("JSW", "Moira") or by position ("the second one", "दूसरा"). null when unclear. */
export function parseChoice(text: string, options: Choice[]): string | null {
  const toks = words(text);
  const byName = options.filter((o) => o.names.some((n) => { const nt = tokenize(n); return nt.length > 0 && nt.every((w) => hasToken(toks, w)); }));
  if (byName.length === 1) return byName[0]!.id;
  if (byName.length > 1) { // e.g. "Ramesh Naik" vs "Ramesh": prefer the one whose name uses more of what was said
    const score = (o: Choice) => Math.max(...o.names.map((n) => tokenize(n).filter((w) => hasToken(toks, w)).length));
    const best = Math.max(...byName.map(score));
    const top = byName.filter((o) => score(o) === best);
    return top.length === 1 ? top[0]!.id : null;
  }
  for (const t of toks) { const i = ORD[t]; if (i !== undefined && i < options.length) return options[i]!.id; }
  const n = scanNumbers(toks)[0]?.value;
  if (n !== undefined && Number.isInteger(n) && n >= 1 && n <= options.length) return options[n - 1]!.id;
  return null;
}

/** First positive number in the answer ("three sixty", "तीन सौ साठ", "360 rupees"). */
export function parseNumberAnswer(text: string): number | null {
  const v = scanNumbers(words(text)).find((s) => s.value > 0)?.value;
  return v === undefined ? null : v;
}
export function parseUnitAnswer(text: string, allowed: string[]): string | null {
  for (const w of words(text)) { const u = unitOf(w); if (u && allowed.some((a) => a.toLowerCase() === u)) return allowed.find((a) => a.toLowerCase() === u)!; }
  return null;
}
export const parseModeAnswer = (text: string): PaymentMode | null => words(text).map(modeOf).find(Boolean) ?? null;
export const isNoSite = (text: string) => isNo(text) || /\b(none|no site|koi nahi|kuch nahi)\b/i.test(text) || /कोई नहीं|साइट नहीं|नाही/.test(text);

/** Which language to answer in: Devanagari → Hindi; Roman Hindi (Hinglish) → Hindi; plain English → English; unclear → the current language. */
const HINGLISH = new Set(["ko", "ne", "diya", "diye", "hai", "hain", "kar", "do", "bhai", "aur", "ka", "ke", "ki", "se", "mein", "rupay", "rupaye", "hazaar", "hazar", "lakh", "sau", "bhaav", "bhav", "kitna", "kya", "nahi", "haan", "ji", "dena", "bheja", "liya", "kam", "wapas", "gaadi", "bhada", "bhaada"]);
const MARATHI = new Set(["la", "dila", "dile", "dilya", "ani", "aahe", "gonya", "goni", "kiti", "nahi"]);
export function detectSpokenLang(text: string, fallback: SpeakLang): SpeakLang {
  if (/[ऀ-ॿ]/.test(text)) return fallback === "mr" ? "mr" : /(ला |ने |ले |दिल्या|दिले|गोण|आणि|आहे|किती)/.test(text + " ") && /(दिल्या|दिले|गोण|आणि|आहे|किती)/.test(text) ? "mr" : "hi";
  const t = words(text);
  const letters = text.replace(/[^A-Za-z]/g, "");
  if (letters.length < 3) return fallback;
  if (t.some((w) => MARATHI.has(w)) && t.some((w) => ["dila", "dile", "dilya", "ani", "aahe", "goni", "kiti"].includes(w))) return "mr";
  if (t.some((w) => HINGLISH.has(w))) return "hi";
  return "en";
}
