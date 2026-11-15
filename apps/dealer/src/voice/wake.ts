import { useEffect, useRef, useState } from "react";
import { stripWakeWord, type SpeakLang } from "@munim/ledger-core";
import { listen, sttAvailable, type Listener } from "./stt";

/**
 * "Munim, …" — hands-free mode. While the app is open and this is switched on, the phone's speech recognition runs in short bursts and
 * EVERYTHING that does not start with the name "Munim" is thrown away on the spot (never stored, never sent anywhere by this app).
 * It stops by itself when the owner is away for a while, when the app goes to the background, and whenever Munim is already open.
 * (The phone's recogniser itself is the system's: on the web, Chrome's, which may process audio on Google's servers.)
 */
const IDLE_MS = 10 * 60_000;   // nothing said to Munim for ten minutes → listening switches itself off

export function useWakeWord(o: { name: string; enabled: boolean; paused: boolean; lang: SpeakLang; onWake: (rest: string) => void; onStop: (why: "idle" | "denied" | "unsupported") => void }) {
  const [listening, setListening] = useState(false);
  const cb = useRef(o); cb.current = o;
  const on = o.enabled && !o.paused;
  useEffect(() => {
    if (!on) return;
    if (!sttAvailable()) { cb.current.onStop("unsupported"); return; }
    let stop = false; let l: Listener | null = null; let since = Date.now();
    const hidden = () => typeof document !== "undefined" && document.visibilityState === "hidden";
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    (async () => {
      while (!stop) {
        if (hidden()) { setListening(false); await sleep(1000); continue; }       // never listen in the background
        l = listen(cb.current.lang);
        setListening(true);
        const r = await l.promise;
        setListening(false);
        if (stop) return;
        if (r.ok) {
          const w = stripWakeWord(r.text, cb.current.name);
          if (w.heard) { cb.current.onWake(w.rest); return; }                    // addressed to Munim
          // not for Munim: dropped here
        } else if (r.reason === "denied") { cb.current.onStop("denied"); return; }
        else if (r.reason === "unsupported" || r.reason === "language") { cb.current.onStop("unsupported"); return; }
        if (Date.now() - since > IDLE_MS) { cb.current.onStop("idle"); return; }
        await sleep(r.ok ? 150 : 700);
      }
    })();
    return () => { stop = true; l?.abort(); setListening(false); };
  }, [on, o.lang, o.name]);
  return { listening };
}
