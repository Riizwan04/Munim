/**
 * Matching names across scripts. A shopkeeper may have saved "Santosh Naik" in English letters while the keyboard mic
 * types "संतोष नाईक". Both reduce to the same consonant skeleton ("sntsh nk"), so they match. Skeletons are only used to
 * compare a Devanagari word with a Roman one (or two Devanagari spellings); two Roman words must match exactly.
 */
const DEV = /[ऀ-ॿ]/;
export const isDevanagari = (s: string) => DEV.test(s);

/** Hindi/Marathi dictation varies in nukta, chandrabindu and joiners; fold them so spellings compare equal. */
export function foldDevanagari(s: string): string {
  return s.normalize("NFD").replace(/[़​-‍]/g, "").replace(/ँ/g, "ं").normalize("NFC");
}

const CONS: Record<string, string> = {
  क: "k", ख: "k", ग: "g", घ: "g", ङ: "n", च: "c", छ: "c", ज: "j", झ: "j", ञ: "n", ट: "t", ठ: "t", ड: "d", ढ: "d", ण: "n",
  त: "t", थ: "t", द: "d", ध: "d", न: "n", प: "p", फ: "f", ब: "b", भ: "b", म: "m", र: "r", ल: "l", ळ: "l", व: "v",
  श: "s", ष: "s", स: "s", क्ष: "ks", ज्ञ: "g", ऱ: "r",
};
const collapse = (s: string) => s.replace(/(.)\1+/g, "$1");

function devSkeleton(s: string): string {
  let out = "";
  const t = foldDevanagari(s);
  for (let i = 0; i < t.length; i++) {
    const two = t.slice(i, i + 3); // क्ष / ज्ञ are written with a halant between the two letters
    if (two === "क्ष" || two === "ज्ञ") { out += CONS[two]; i += 2; continue; }
    const c = CONS[t[i]!];
    if (c) out += c;
    else if (t[i] === "ं") out += "n"; // anusvara: ईंट -> nt
  }
  return collapse(out);
}
function romanSkeleton(s: string): string {
  let r = s.toLowerCase().replace(/[^a-z]/g, "");
  r = r.replace(/c(?=[eiy])/g, "s").replace(/ck/g, "k").replace(/ph/g, "f").replace(/[kgjdtb]h/g, (m) => m[0]!).replace(/sh|ch/g, (m) => (m === "sh" ? "s" : "c"));
  r = r.replace(/q/g, "k").replace(/x/g, "ks").replace(/w/g, "v").replace(/z/g, "j");
  r = r.replace(/[aeiouyh]/g, "");
  return collapse(r);
}
export const skeleton = (s: string) => (isDevanagari(s) ? devSkeleton(s) : romanSkeleton(s));

/** Marathi/Hindi glue small words onto names ("संतोषला", "रमेशने", "साइटवर"): try the word with each ending removed. */
const SUFFIXES = ["च्या", "साठी", "कडून", "कडे", "वर", "ला", "ने", "नी", "ना", "चा", "ची", "चे", "को", "से", "का", "की", "के", "पर"];
export function stems(token: string): string[] {
  const t = foldDevanagari(token);
  const out = [t];
  if (isDevanagari(t)) for (const s of SUFFIXES) if (t.length > s.length + 1 && t.endsWith(s)) out.push(t.slice(0, -s.length));
  return out;
}

/** Same word? Exact, or the same sound when the two are written in different scripts. */
export function sameWord(spoken: string, saved: string): boolean {
  if (spoken === saved) return true;
  const sd = isDevanagari(spoken), vd = isDevanagari(saved);
  if (!sd && !vd) return false;
  const target = skeleton(saved);
  if (target.length < 2) return foldDevanagari(spoken) === foldDevanagari(saved);
  return stems(spoken).some((x) => skeleton(x) === target);
}
export const hasToken = (tokens: string[], word: string) => tokens.some((t) => sameWord(t, word));
