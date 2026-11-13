/**
 * Spoken number words (Hindi / Marathi / English) → numbers. Deterministic, no AI.
 * dedh=1.5, dhai=2.5, sava X = X+¼, paune X = X−¼, sadhe X = X+½ (all × the multiplier after: sau/hazaar/lakh).
 *   "sava sau" → 125, "paune do hazaar" → 1750, "ek lakh bees hazaar" → 120000, "sadhe teen" → 3.5
 */
const BASE: Record<string, number> = {
  ek: 1, one: 1, do: 2, don: 2, two: 2, teen: 3, three: 3, char: 4, chaar: 4, four: 4, paanch: 5, panch: 5, paach: 5, five: 5,
  chhe: 6, che: 6, chhah: 6, six: 6, saat: 7, sat: 7, seven: 7, aath: 8, aat: 8, eight: 8, nau: 9, nine: 9, das: 10, dahaa: 10, ten: 10,
  gyarah: 11, barah: 12, terah: 13, chaudah: 14, pandrah: 15, solah: 16, satrah: 17, atharah: 18, unnis: 19,
  bees: 20, pachees: 25, tees: 30, paintees: 35, chalis: 40, pachaas: 50, pachas: 50, pannas: 50, saath: 60, sattar: 70, assi: 80, nabbe: 90,
  dedh: 1.5, deedh: 1.5, dhai: 2.5, adhai: 2.5, aadha: 0.5, adha: 0.5,
};
const MULT: Record<string, number> = { sau: 100, hundred: 100, hazaar: 1000, hajar: 1000, hazar: 1000, thousand: 1000, lakh: 100000, lac: 100000 };
const MOD: Record<string, number> = { sava: 0.25, sawa: 0.25, paune: -0.25, poune: -0.25, sadhe: 0.5, saade: 0.5 };

import { foldDevanagari } from "./phonetic";

// Hindi 1-99 (irregular, so listed in full) and Marathi 1-99. Spellings are folded the same way as the input.
const HI = "एक दो तीन चार पाँच छह सात आठ नौ दस ग्यारह बारह तेरह चौदह पंद्रह सोलह सत्रह अठारह उन्नीस बीस इक्कीस बाईस तेईस चौबीस पच्चीस छब्बीस सत्ताईस अट्ठाईस उनतीस तीस इकतीस बत्तीस तैंतीस चौंतीस पैंतीस छत्तीस सैंतीस अड़तीस उनतालीस चालीस इकतालीस बयालीस तैंतालीस चौंतालीस पैंतालीस छियालीस सैंतालीस अड़तालीस उनचास पचास इक्यावन बावन तिरपन चौवन पचपन छप्पन सत्तावन अट्ठावन उनसठ साठ इकसठ बासठ तिरसठ चौंसठ पैंसठ छियासठ सड़सठ अड़सठ उनहत्तर सत्तर इकहत्तर बहत्तर तिहत्तर चौहत्तर पचहत्तर छिहत्तर सतहत्तर अठहत्तर उन्यासी अस्सी इक्यासी बयासी तिरासी चौरासी पचासी छियासी सत्तासी अट्ठासी नवासी नब्बे इक्यानवे बानवे तिरानवे चौरानवे पचानवे छियानवे सत्तानवे अट्ठानवे निन्यानवे".split(" ");
const MR = "एक दोन तीन चार पाच सहा सात आठ नऊ दहा अकरा बारा तेरा चौदा पंधरा सोळा सतरा अठरा एकोणीस वीस एकवीस बावीस तेवीस चोवीस पंचवीस सव्वीस सत्तावीस अठ्ठावीस एकोणतीस तीस एकतीस बत्तीस तेहतीस चौतीस पस्तीस छत्तीस सदतीस अडतीस एकोणचाळीस चाळीस एकेचाळीस बेचाळीस त्रेचाळीस चव्वेचाळीस पंचेचाळीस सेहेचाळीस सत्तेचाळीस अठ्ठेचाळीस एकोणपन्नास पन्नास एकावन्न बावन्न त्रेपन्न चोपन्न पंचावन्न छप्पन्न सत्तावन्न अठ्ठावन्न एकोणसाठ साठ एकसष्ट बासष्ट त्रेसष्ट चौसष्ट पासष्ट सहासष्ट सदुसष्ट अडुसष्ट एकोणसत्तर सत्तर एकाहत्तर बाहत्तर त्र्याहत्तर चौऱ्याहत्तर पंचाहत्तर शहात्तर सत्त्याहत्तर अठ्ठ्याहत्तर एकोणऐंशी ऐंशी एक्याऐंशी ब्याऐंशी त्र्याऐंशी चौऱ्याऐंशी पंच्याऐंशी शहाऐंशी सत्त्याऐंशी अठ्ठ्याऐंशी एकोणनव्वद नव्वद एक्याण्णव ब्याण्णव त्र्याण्णव चौऱ्याण्णव पंच्याण्णव शहाण्णव सत्त्याण्णव अठ्ठ्याण्णव नव्व्याण्णव".split(" ");
HI.forEach((w, i) => { BASE[foldDevanagari(w)] = i + 1; });
MR.forEach((w, i) => { BASE[foldDevanagari(w)] ??= i + 1; });
for (const [w, v] of Object.entries({ डेढ: 1.5, दीड: 1.5, ढाई: 2.5, अढाई: 2.5, अडीच: 2.5, आधा: 0.5, अर्धा: 0.5, पाव: 0.25 })) BASE[foldDevanagari(w)] = v;
for (const [w, v] of Object.entries({ सौ: 100, शंभर: 100, हजार: 1000, लाख: 100000 })) MULT[foldDevanagari(w)] = v;
for (const [w, v] of Object.entries({ सवा: 0.25, सव्वा: 0.25, पौने: -0.25, पाऊण: -0.25, साढे: 0.5, साडे: 0.5 })) MOD[foldDevanagari(w)] = v;

export const isNumberWord = (w: string) => w in BASE || w in MULT || w in MOD || /^\d[\d,]*(\.\d+)?$/.test(w);

const DEV_DIGITS = "०१२३४५६७८९";
/** Normalises what the keyboard mic types: folds Devanagari spelling variants, turns ०-९ into 0-9, drops "rupees" words. */
export function normalizeInput(s: string): string {
  return foldDevanagari(s).toLowerCase()
    .replace(/[०-९]/g, (d) => String(DEV_DIGITS.indexOf(d)))
    .replace(/₹|rs\.?|rupay[ea]?|rupees?|रुपये|रुपए|रुपया|रूपये|रुपयाला|रु\./g, " ")
    .replace(/[।॥]/g, ",");
}
const tokenize = (s: string) => normalizeInput(s).split(/[\s]+/).map((w) => w.replace(/[.,;!?।]+$/, "")).filter(Boolean);

/** Parses a run of number tokens. Returns null if any token is not a number word. */
export function parseNumberTokens(tokens: string[]): number | null {
  if (tokens.length === 0) return null;
  let total = 0, current = 0, mod = 0, hasCur = false;
  for (const raw of tokens) {
    const w = raw.replace(/,/g, "");
    if (/^\d+(\.\d+)?$/.test(w)) { current += Number(w); hasCur = true; continue; }
    if (w in MOD) { mod = MOD[w]!; continue; }
    if (w in BASE) { current += BASE[w]! + mod; mod = 0; hasCur = true; continue; }
    if (w in MULT) {
      const base = hasCur ? current : 1;
      const adj = mod ? base + mod : base; // "sava sau" = (1+.25)×100 ; "paune do hazaar" handled below
      total += (hasCur && mod ? adj : hasCur ? base : mod ? 1 + mod : 1) * MULT[w]!;
      current = 0; hasCur = false; mod = 0; continue;
    }
    return null;
  }
  return Math.round((total + current) * 1000) / 1000;
}

export function parseSpokenNumber(text: string): number | null {
  return parseNumberTokens(tokenize(text));
}

export interface NumberSpan { value: number; start: number; end: number } // token indexes, end exclusive

/** Finds runs of consecutive number tokens inside a sentence. */
export function scanNumbers(tokens: string[]): NumberSpan[] {
  const out: NumberSpan[] = [];
  let i = 0;
  while (i < tokens.length) {
    if (!isNumberWord(tokens[i]!)) { i++; continue; }
    let j = i;
    while (j < tokens.length && isNumberWord(tokens[j]!)) j++;
    // a bare modifier ("sava") with nothing after it is not a number
    const v = parseNumberTokens(tokens.slice(i, j));
    if (v !== null) out.push({ value: v, start: i, end: j });
    i = j;
  }
  return out;
}
export { tokenize };
