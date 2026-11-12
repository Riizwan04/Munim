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

export const isNumberWord = (w: string) => w in BASE || w in MULT || w in MOD || /^\d[\d,]*(\.\d+)?$/.test(w);

const tokenize = (s: string) => s.toLowerCase().replace(/₹|rs\.?|rupay[ea]?|rupees?/g, " ").split(/[\s]+/).map((w) => w.replace(/[.,;!?]+$/, "")).filter(Boolean);

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
