import { Linking, Platform, Share } from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

/** "9876543210" / "+91 98765 43210" → "919876543210" for wa.me links (10-digit numbers get India's +91). */
export function waNumber(phone: string): string {
  const d = phone.replace(/\D/g, "");
  return d.length === 10 ? "91" + d : d.replace(/^0+/, "");
}
export const whatsappUrl = (phone: string, text: string) => `https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(text)}`;

/** Opens WhatsApp chat with the party, message pre-filled. The dealer taps send (no WhatsApp API, no cost). */
export const sendWhatsApp = (phone: string, text: string) => Linking.openURL(whatsappUrl(phone, text));

/** System share sheet (WhatsApp group, Telegram, SMS...). */
export async function shareText(text: string) {
  if (Platform.OS === "web") {
    const nav: any = typeof navigator !== "undefined" ? navigator : undefined;
    if (nav?.share) { await nav.share({ text }); return; }
    await nav?.clipboard?.writeText(text);
    return;
  }
  await Share.share({ message: text });
}

/** PDF of the statement, opened in the share sheet (phone) or print dialog (web). */
export async function sharePdf(html: string) {
  if (Platform.OS === "web") { await Print.printAsync({ html }); return; }
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf" });
}
