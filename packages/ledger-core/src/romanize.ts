import { foldDevanagari, isDevanagari } from "./phonetic";

/**
 * Everything written in the app is in English letters, even when the phone's speech recognition typed a name in Devanagari
 * ("एसीसी सीमेंट" → "ACC cement", "रमेश" → "Ramesh"). Known shop words come from a list, initials like एसीसी/जेएसडब्ल्यू become ACC/JSW,
 * and anything else is transliterated sound by sound. The owner can still rename it (the NEW ITEM card, Items screen).
 */
const WORDS: Record<string, string> = {
  सीमेंट: "cement", सिमेंट: "cement", सीमेन्ट: "cement", ईंट: "brick", ईट: "brick", रेत: "sand", रेती: "sand", वाळू: "sand", खडी: "khadi", खड़ी: "khadi", गिट्टी: "gravel",
  ब्लॉक: "block", ब्लाक: "block", टाइल: "tile", टाइल्स: "tiles", पेंट: "paint", पेन्ट: "paint", पाइप: "pipe", पाईप: "pipe", तार: "wire", लोहा: "iron", सरिया: "steel bar", सळई: "steel bar",
  कील: "nails", चूना: "lime", प्लाईवुड: "plywood", ब्रास: "brass", वॉटरप्रूफिंग: "waterproofing", केमिकल: "chemical", सुपर: "super", गोल्ड: "gold", प्लस: "plus", प्रीमियम: "premium",
  पर्चेस्ड: "purchased", पर्चेस: "purchase", परचेज: "purchase", पर्चेज: "purchase", बॉट: "bought", बाउट: "bought", फॉर: "for", एट: "at", टुडे: "today", येस्टरडे: "yesterday", बैग्स: "bags", बैग्ज: "bags", रेट: "rate", प्राइस: "price", ऑर्डर: "order", सोल्ड: "sold", नंबर: "number", इंच: "inch", मोटा: "thick", पतला: "thin", ग्रे: "grey", व्हाइट: "white", रेड: "red", ब्लैक: "black", रोड: "road", साइट: "site",
};
const FOLDED: Record<string, string> = Object.fromEntries(Object.entries(WORDS).map(([k, v]) => [foldDevanagari(k), v]));

const HINDI_WORDS = new Set(["ईंट", "ईट", "रेत", "रेती", "वाळू", "खडी", "खड़ी", "गिट्टी", "तार", "लोहा", "सरिया", "सळई", "कील", "चूना", "मोटा", "पतला"].map(foldDevanagari));

// letter names as spoken in English: "एसीसी" = A C C
const LETTERS: Record<string, string> = Object.fromEntries(Object.entries({
  ए: "A", बी: "B", सी: "C", डी: "D", ई: "E", एफ: "F", जी: "G", एच: "H", आई: "I", जे: "J", के: "K", एल: "L", एम: "M", एन: "N", ओ: "O", पी: "P", क्यू: "Q", आर: "R", एस: "S",
  टी: "T", यू: "U", वी: "V", डब्ल्यू: "W", डब्लू: "W", एक्स: "X", वाई: "Y", जेड: "Z", ज़ेड: "Z",
}).map(([k, v]) => [foldDevanagari(k), v]));

function acronym(w: string): string | null {
  const go = (i: number): string[] | null => {
    if (i === w.length) return [];
    for (let len = Math.min(8, w.length - i); len >= 1; len--) {
      const l = LETTERS[w.slice(i, i + len)];
      if (l) { const rest = go(i + len); if (rest) return [l, ...rest]; }
    }
    return null;
  };
  const r = go(0);
  return r && r.length >= 2 ? r.join("") : null;
}

const VOWEL: Record<string, string> = { अ: "a", आ: "a", इ: "i", ई: "i", उ: "u", ऊ: "u", ए: "e", ऐ: "ai", ओ: "o", औ: "au", ऑ: "o", ऋ: "ri", ऍ: "e" };
const MATRA: Record<string, string> = { "ा": "a", "ि": "i", "ी": "i", "ु": "u", "ू": "u", "े": "e", "ै": "ai", "ो": "o", "ौ": "au", "ॉ": "o", "ृ": "ri", "ॅ": "e" };
const CONS: Record<string, string> = {
  क: "k", ख: "kh", ग: "g", घ: "gh", ङ: "n", च: "ch", छ: "chh", ज: "j", झ: "jh", ञ: "n", ट: "t", ठ: "th", ड: "d", ढ: "dh", ण: "n", त: "t", थ: "th", द: "d", ध: "dh", न: "n",
  प: "p", फ: "f", ब: "b", भ: "bh", म: "m", य: "y", र: "r", ल: "l", ळ: "l", व: "v", श: "sh", ष: "sh", स: "s", ह: "h", ऱ: "r",
};

/** Sound-by-sound fallback ("रमेश" → "ramesh"); the inherent "a" at the end of a word is dropped, as it is spoken. */
function translit(w: string): string {
  let out = "";
  const cs = Array.from(w);
  for (let i = 0; i < cs.length; i++) {
    const c = cs[i]!;
    if (c === "क" && cs[i + 1] === "्" && cs[i + 2] === "ष") { out += "ksh"; i += 2; if (!MATRA[cs[i + 1]!] && cs[i + 1] !== "्") { if (i + 1 < cs.length) out += "a"; } continue; }
    if (c === "ज" && cs[i + 1] === "्" && cs[i + 2] === "ञ") { out += "gy"; i += 2; if (!MATRA[cs[i + 1]!] && i + 1 < cs.length) out += "a"; continue; }
    if (CONS[c]) {
      out += CONS[c];
      const n = cs[i + 1];
      if (n === "्") { i++; continue; }                 // halant: no vowel
      if (n && MATRA[n]) { out += MATRA[n]; i++; continue; }
      if (i + 1 < cs.length && DEVA_LETTER.test(n ?? "")) out += "a"; // inherent "a" inside the word
      continue;
    }
    if (VOWEL[c]) { out += VOWEL[c]; continue; }
    if (c === "ं" || c === "ँ") { out += "n"; continue; }
    if (c === "ः") { out += "h"; continue; }
    if (/[०-९]/.test(c)) { out += String("०१२३४५६७८९".indexOf(c)); continue; }
    if (!isDevanagari(c)) out += c;
  }
  return out;
}
const DEVA_LETTER = /[ऀ-ॿ]/;

/** One word in English letters; words already in English letters are returned unchanged. */
export function romanizeWord(word: string): string {
  if (!isDevanagari(word)) return word;
  const w = foldDevanagari(word);
  return FOLDED[w] ?? acronym(w) ?? translit(w);
}

/** A name (party, item) in English letters. Words in English letters keep their spelling; new words get a capital letter. */
export function romanizeName(text: string): string {
  return text.trim().split(/\s+/).filter(Boolean).map((w) => {
    if (!isDevanagari(w)) return w;
    const r = romanizeWord(w);
    return r === r.toUpperCase() && r.length > 1 ? r : r.charAt(0).toUpperCase() + r.slice(1);
  }).join(" ");
}

/** A Devanagari spelling of an English word or of initials ("बैग्स" → "bags", "एसीसी" → "acc"), or null for any other word. Used to read dictated sentences. */
export function loanword(word: string): string | null {
  if (!isDevanagari(word)) return null;
  const w = foldDevanagari(word);
  if (HINDI_WORDS.has(w)) return null;                 // real Hindi/Marathi shop words (ईंट, गिट्टी…) stay as they are for matching
  const hit = FOLDED[w] ?? acronym(w);
  return hit ? hit.toLowerCase() : null;
}
