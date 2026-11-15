import * as Speech from "expo-speech";
import type { SpeakLang } from "@munim/ledger-core";

/** Munim's voice: the phone's own text-to-speech (free). Hindi/English/Marathi depend on the voices installed on the phone. */
const LOCALE: Record<SpeakLang, string> = { en: "en-IN", hi: "hi-IN", mr: "mr-IN" };

/** Speaks one line and returns when it is finished (or stopped, or failed: it never hangs). */
export function speak(text: string, lang: SpeakLang): Promise<void> {
  return new Promise((resolve) => {
    if (!text.trim()) { resolve(); return; }
    let done = false;
    const finish = () => { if (!done) { done = true; clearTimeout(guard); resolve(); } };
    const guard = setTimeout(finish, Math.max(5000, text.length * 160)); // an engine that never reports back must not freeze the conversation
    try { Speech.speak(text, { language: LOCALE[lang], rate: 0.95, onDone: finish, onStopped: finish, onError: finish }); } catch { finish(); }
  });
}
export const stopSpeaking = () => { try { Speech.stop(); } catch { /* nothing speaking */ } };

/** Is a voice for this language installed? (If not, Munim stays silent and only shows text.) */
export async function voiceAvailable(lang: SpeakLang): Promise<boolean> {
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    if (!voices.length) return true; // some browsers list voices late: assume yes
    return voices.some((v) => v.language?.toLowerCase().startsWith(lang));
  } catch { return true; }
}
