import { formatINR, type Paise } from "./money";
import type { Lang } from "./statement";

export type NoticeKind = "sale" | "payment" | "return" | "charge" | "discount" | "edited" | "cancelled";

/**
 * The push notification a customer gets when the shop records something on their account.
 * Wording and every number come from here (never from the AI): amount of the entry and the balance after it.
 * Customer-facing text is in Roman script like the reminders, in the party's own language.
 */
export function entryNotice(a: { lang: Lang; businessName: string; kind: NoticeKind; amount?: Paise; balance: Paise }): { title: string; body: string } {
  const amt = a.amount !== undefined ? formatINR(a.amount) : "";
  const bal = formatINR(Math.abs(a.balance));
  const owes = a.balance > 0;
  const T = {
    en: {
      sale: `Sale ${amt} added`, payment: `Payment ${amt} received. Thank you!`, return: `Return ${amt} noted`, charge: `Charge ${amt} added`, discount: `Discount ${amt} given`,
      edited: "An entry was corrected", cancelled: "An entry was cancelled",
      due: `Balance due: ${bal}`, adv: `Advance with us: ${bal}`, clear: "Account is clear", tap: "Tap to see your statement.",
    },
    hi: {
      sale: `${amt} ka maal likha gaya`, payment: `${amt} mile. Dhanyavaad!`, return: `${amt} ka maal wapas likha gaya`, charge: `${amt} kharcha jodha gaya`, discount: `${amt} ki chhoot di gayi`,
      edited: "Ek entry sudhari gayi", cancelled: "Ek entry radd ki gayi",
      due: `Baaki: ${bal}`, adv: `Aapka advance: ${bal}`, clear: "Hisaab saaf hai", tap: "Statement dekhne ke liye dabayein.",
    },
    mr: {
      sale: `${amt} cha maal lihila`, payment: `${amt} milale. Dhanyavaad!`, return: `${amt} cha maal parat lihila`, charge: `${amt} kharcha jodla`, discount: `${amt} chi savalat dili`,
      edited: "Ek entry sudharli", cancelled: "Ek entry radd keli",
      due: `Baaki: ${bal}`, adv: `Tumcha advance: ${bal}`, clear: "Hisaab clear aahe", tap: "Statement pahaNyasathi daba.",
    },
  }[a.lang];
  const head = T[a.kind];
  const tail = a.balance === 0 ? T.clear : owes ? T.due : T.adv;
  return { title: a.businessName, body: `${head}. ${tail}. ${T.tap}`.replace("!. ", "! ") };
}
