import type { SpeakLang } from "@munim/ledger-core";

/**
 * Munim's ears: the phone's own speech recognition (free). On Android/iPhone apps it uses the system recogniser; in the
 * browser it uses Chrome/Safari's. Loaded lazily so a build without the native module (Expo Go) falls back to typing
 * instead of crashing.
 */
declare const require: (id: string) => any;
const LOCALE: Record<SpeakLang, string> = { en: "en-IN", hi: "hi-IN", mr: "mr-IN" };
let mod: any;
function getMod(): any {
  if (mod !== undefined) return mod;
  try { mod = require("expo-speech-recognition").ExpoSpeechRecognitionModule ?? null; } catch { mod = null; }
  return mod;
}
export function sttAvailable(): boolean { try { return !!getMod()?.isRecognitionAvailable?.(); } catch { return false; } }

export type ListenFailure = "no-speech" | "denied" | "network" | "unsupported" | "language" | "aborted" | "error";
export type ListenResult = { ok: true; text: string } | { ok: false; reason: ListenFailure };
export interface Listener { promise: Promise<ListenResult>; stop(): void; abort(): void }

const mapError = (code: string): ListenFailure =>
  code === "not-allowed" || code === "service-not-allowed" ? "denied" : code === "no-speech" || code === "speech-timeout" ? "no-speech"
  : code === "network" ? "network" : code === "language-not-supported" ? "language" : code === "aborted" ? "aborted" : "error";

/** Listens for one utterance and resolves with what was said. */
export function listen(lang: SpeakLang, onPartial?: (t: string) => void): Listener {
  const m = getMod();
  let settle!: (r: ListenResult) => void;
  const promise = new Promise<ListenResult>((res) => { settle = res; });
  if (!m || !sttAvailable()) { settle({ ok: false, reason: "unsupported" }); return { promise, stop() {}, abort() {} }; }
  let final = "", partial = "", settled = false;
  const subs: { remove(): void }[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  const done = (r: ListenResult) => { if (settled) return; settled = true; clearTimeout(timer); subs.forEach((s) => s.remove()); settle(r); };
  subs.push(m.addListener("result", (e: any) => { const text: string = e?.results?.[0]?.transcript ?? ""; if (e?.isFinal) final = text; else { partial = text; onPartial?.(text); } }));
  subs.push(m.addListener("error", (e: any) => done({ ok: false, reason: mapError(String(e?.error ?? "")) })));
  subs.push(m.addListener("end", () => { const t = (final || partial).trim(); done(t ? { ok: true, text: t } : { ok: false, reason: "no-speech" }); }));
  (async () => {
    try {
      const p = await m.requestPermissionsAsync();
      if (!p?.granted) { done({ ok: false, reason: "denied" }); return; }
      m.start({ lang: LOCALE[lang], interimResults: true, continuous: false, maxAlternatives: 1, androidIntentOptions: { EXTRA_LANGUAGE_MODEL: "web_search" } });
      timer = setTimeout(() => { try { m.stop(); } catch { /* already ended */ } }, 15000);
    } catch { done({ ok: false, reason: "error" }); }
  })();
  return { promise, stop: () => { try { m.stop(); } catch { /* */ } }, abort: () => { try { m.abort(); } catch { /* */ } done({ ok: false, reason: "aborted" }); } };
}
