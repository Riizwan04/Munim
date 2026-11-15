import { HI_WORDS_RAW, MR_WORDS_RAW } from "./spoken";
import type { PaymentMode } from "./types";
import type { Paise } from "./money";

/**
 * Words for the voice assistant to SAY. Digits are spelled out because phone voices read "2,39,910" badly; amounts follow the
 * Indian system (lakh, hazaar), as in PRD 6.3. Languages: English, Hindi (Devanagari), Marathi (Devanagari, less tested).
 */
export type SpeakLang = "en" | "hi" | "mr";

const EN_ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const EN_TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const en2 = (n: number) => (n < 20 ? EN_ONES[n]! : EN_TENS[Math.floor(n / 10)]! + (n % 10 ? "-" + EN_ONES[n % 10]! : ""));
const below100 = (n: number, lang: SpeakLang) => (lang === "en" ? en2(n) : (lang === "hi" ? HI_WORDS_RAW : MR_WORDS_RAW)[n - 1]!);

const UNITS: Record<SpeakLang, { crore: string; lakh: string; thousand: string; hundred: string; zero: string; minus: string }> = {
  en: { crore: "crore", lakh: "lakh", thousand: "thousand", hundred: "hundred", zero: "zero", minus: "minus" },
  hi: { crore: "करोड़", lakh: "लाख", thousand: "हज़ार", hundred: "सौ", zero: "शून्य", minus: "माइनस" },
  mr: { crore: "कोटी", lakh: "लाख", thousand: "हजार", hundred: "शे", zero: "शून्य", minus: "वजा" },
};

/** 239910 → "two lakh thirty-nine thousand nine hundred ten" / "दो लाख उनतालीस हज़ार नौ सौ दस". Whole numbers only. */
export function numberToWords(n: number, lang: SpeakLang): string {
  n = Math.round(n);
  const u = UNITS[lang];
  if (n === 0) return u.zero;
  if (n < 0) return `${u.minus} ${numberToWords(-n, lang)}`;
  const parts: string[] = [];
  const crore = Math.floor(n / 1e7);
  const lakh = Math.floor(n / 1e5) % 100, thousand = Math.floor(n / 1e3) % 100, hundred = Math.floor(n / 100) % 10, rest = n % 100;
  if (crore) parts.push(`${numberToWords(crore, lang)} ${u.crore}`);
  if (lakh) parts.push(`${below100(lakh, lang)} ${u.lakh}`);
  if (thousand) parts.push(`${below100(thousand, lang)} ${u.thousand}`);
  if (hundred) parts.push(lang === "mr" && hundred === 1 ? "शंभर" : lang === "mr" ? `${below100(hundred, lang)}${u.hundred}` : `${below100(hundred, lang)} ${u.hundred}`);
  if (rest) parts.push(below100(rest, lang));
  return parts.join(" ");
}

const RUPEE: Record<SpeakLang, [string, string]> = { en: ["rupee", "rupees"], hi: ["रुपया", "रुपये"], mr: ["रुपया", "रुपये"] };
/** ₹2,39,910 in paise → "two lakh ... rupees". Rounded to the rupee, as on screen. */
export function rupeesToSpeech(paise: Paise, lang: SpeakLang): string {
  const r = Math.round(paise / 100);
  const w = numberToWords(Math.abs(r), lang);
  const word = RUPEE[lang][Math.abs(r) === 1 ? 0 : 1];
  return `${r < 0 ? UNITS[lang].minus + " " : ""}${w} ${word}`;
}

/** Quantity in thousandths (1500 = 1.5): "डेढ़", "ढाई", "साढ़े तीन", "one and a half", "two point two five". */
export function qtyToSpeech(milli: number, lang: SpeakLang): string {
  const whole = Math.floor(milli / 1000), frac = Math.round(milli % 1000);
  if (frac === 0) return numberToWords(whole, lang);
  if (lang === "en") {
    if (frac === 500) return whole === 0 ? "half" : `${numberToWords(whole, lang)} and a half`;
    if (frac === 250 && whole === 0) return "a quarter";
    const digits = String(frac).padStart(3, "0").replace(/0+$/, "").split("").map((d) => EN_ONES[Number(d)]).join(" ");
    return `${numberToWords(whole, lang)} point ${digits}`;
  }
  const hi = lang === "hi";
  if (frac === 500) { if (whole === 0) return hi ? "आधा" : "अर्धा"; if (whole === 1) return hi ? "डेढ़" : "दीड"; if (whole === 2) return hi ? "ढाई" : "अडीच"; return `${hi ? "साढ़े" : "साडे"} ${numberToWords(whole, lang)}`; }
  if (frac === 250) return `${hi ? "सवा" : "सव्वा"} ${whole === 0 ? "" : numberToWords(whole, lang)}`.trim();
  if (frac === 750) return `${hi ? "पौने" : "पाऊण"} ${numberToWords(whole + 1, lang)}`;
  const digits = String(frac).padStart(3, "0").replace(/0+$/, "").split("").map((d) => numberToWords(Number(d), lang)).join(" ");
  return `${numberToWords(whole, lang)} ${hi ? "दशमलव" : "पूर्णांक"} ${digits}`;
}

const UNIT_WORDS: Record<SpeakLang, Record<string, [string, string]>> = {
  en: { bag: ["bag", "bags"], butti: ["butti", "butti"], mtr: ["metre", "metres"], ltr: ["litre", "litres"], kg: ["kilo", "kilos"], nos: ["piece", "pieces"], brass: ["brass", "brass"], trolley: ["trolley", "trolleys"], ton: ["ton", "tons"] },
  hi: { bag: ["बैग", "बैग"], butti: ["बुट्टी", "बुट्टी"], mtr: ["मीटर", "मीटर"], ltr: ["लीटर", "लीटर"], kg: ["किलो", "किलो"], nos: ["नग", "नग"], brass: ["ब्रास", "ब्रास"], trolley: ["ट्रॉली", "ट्रॉली"], ton: ["टन", "टन"] },
  mr: { bag: ["गोणी", "गोण्या"], butti: ["बुट्टी", "बुट्टी"], mtr: ["मीटर", "मीटर"], ltr: ["लिटर", "लिटर"], kg: ["किलो", "किलो"], nos: ["नग", "नग"], brass: ["ब्रास", "ब्रास"], trolley: ["ट्रॉली", "ट्रॉल्या"], ton: ["टन", "टन"] },
};
export function unitToSpeech(unit: string, milli: number, lang: SpeakLang): string {
  const w = UNIT_WORDS[lang][unit.toLowerCase()];
  return w ? w[milli === 1000 ? 0 : 1] : unit;
}
const MODE_WORDS: Record<SpeakLang, Record<PaymentMode, string>> = {
  en: { cash: "cash", upi: "UPI", cheque: "cheque", bank: "bank transfer" },
  hi: { cash: "नकद", upi: "यूपीआई", cheque: "चेक", bank: "बैंक ट्रांसफर" },
  mr: { cash: "रोख", upi: "यूपीआय", cheque: "चेक", bank: "बँक ट्रान्सफर" },
};
export const modeToSpeech = (m: PaymentMode, lang: SpeakLang) => MODE_WORDS[lang][m];

/** "JSW" is read letter by letter ("J S W"); other words are left alone. */
export const spellAcronyms = (s: string) => s.replace(/\b[A-Z]{2,5}\b/g, (w) => w.split("").join(" "));

const MONTH_NAMES: Record<SpeakLang, string[]> = {
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  hi: ["जनवरी", "फ़रवरी", "मार्च", "अप्रैल", "मई", "जून", "जुलाई", "अगस्त", "सितंबर", "अक्टूबर", "नवंबर", "दिसंबर"],
  mr: ["जानेवारी", "फेब्रुवारी", "मार्च", "एप्रिल", "मे", "जून", "जुलै", "ऑगस्ट", "सप्टेंबर", "ऑक्टोबर", "नोव्हेंबर", "डिसेंबर"],
};
/** "2026-11-12" → "twelve November" / "बारह नवंबर". */
export function dateToSpeech(iso: string, lang: SpeakLang): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${numberToWords(d!, lang)} ${MONTH_NAMES[lang][m! - 1]}`;
}
