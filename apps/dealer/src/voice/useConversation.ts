import { askEnabled, askRemote } from "../ask";
import { localToday as today0 } from "../dates";
import { understandRemote } from "../ai";
import * as Crypto from "expo-crypto";
import { useCallback, useEffect, useRef, useState } from "react";
import { Dialogue, renderSay, type AskData, type AssistantAction, type DialogueCtx, type EntryPayload, type Output, type PartyRef, type SpeakLang, type View } from "@munim/ledger-core";
import { loadVoiceContext, type VoiceContext } from "../data";
import { localToday } from "../dates";
import { fe } from "../errors";
import { translate, type Key } from "../i18n";
import { discardItem, enqueueEntry, getItems, syncNow } from "../offline/outbox";
import { listen, sttAvailable, type Listener } from "./stt";
import { speak, stopSpeaking, voiceAvailable } from "./tts";

export type Orb = "loading" | "idle" | "speaking" | "listening" | "thinking";
export type Problem = null | "denied" | "unsupported" | "network" | "language" | "no-voice";
export interface TalkState { orb: Orb; caption: string; heard: string; view: View; problem: Problem; error: string; saving: boolean; lang: SpeakLang }

const EMPTY_VIEW: View = { phase: "idle", needsManual: false, saved: 0 };
const tEn = (k: string, v?: Record<string, string | number>) => translate("en", k as Key, v);

/**
 * Runs the conversation: Munim speaks (phone voice) → listens (phone speech recognition) → the Dialogue decides → repeat.
 * The owner's tap on Save is the only thing that saves; every entry goes through the offline-safe outbox.
 */
export function useConversation(initialLang: SpeakLang, opts: { assistantName?: string; currentPartyId?: string; onAction?: (a: AssistantAction) => void } = {}) {
  const onActionRef = useRef(opts.onAction);
  onActionRef.current = opts.onAction;
  const [st, setSt] = useState<TalkState>({ orb: "loading", caption: "", heard: "", view: EMPTY_VIEW, problem: null, error: "", saving: false, lang: initialLang });
  const d = useRef<Dialogue | null>(null);
  const ctx = useRef<VoiceContext | null>(null);
  const token = useRef(0);               // bumped whenever the owner interrupts, so a stale step stops quietly
  const listener = useRef<Listener | null>(null);
  const heardLog = useRef<string[]>([]);   // everything said while creating the current entry(ies): kept as proof with the entry
  const langRef = useRef<SpeakLang>(initialLang);
  const patch = (p: Partial<TalkState>) => setSt((s) => ({ ...s, ...p }));

  const play = useCallback(async (out: Output, tok: number) => {
    langRef.current = out.lang;
    if (out.view.phase === "await_more" || out.view.phase === "ended") heardLog.current = [];   // a finished round: start fresh
    // On screen: short English text. The full read-back is spoken and shown on the entry card, so it is not repeated here.
    const caption = out.say.filter((s) => !s.key.startsWith("v.read")).map((s) => renderSay(s, "en", tEn, false)).filter(Boolean).join(" ");
    patch({ view: out.view, lang: out.lang, ...(out.say.length ? { caption, orb: "speaking" } : {}) });
    for (const s of out.say) {
      if (tok !== token.current) return;
      await speak(renderSay(s, out.lang, (k, v) => translate(out.lang, k as Key, v)), out.lang);
    }
    if (tok !== token.current) return;
    if (out.action?.kind === "ask") { // a free question: the AI reader picks read-only tools, they run on this phone's copy of the owner's data
      patch({ orb: "thinking" });
      const c = ctx.current!; const q = out.action.text;
      const data: AskData = { today: today0(), parties: c.parties.map((p) => ({ id: p.id, name: p.name, nicknames: p.nicknames, sites: p.sites, opening: c.info[p.id]?.opening ?? 0, creditLimit: c.info[p.id]?.creditLimit ?? null })), entries: Object.values(c.entries).flat(), materials: c.materials };
      const answer = await askRemote(q, data, { lang: langRef.current, name: opts.assistantName || "Munim" });
      if (tok !== token.current) return;
      await play(d.current!.answeredFree(answer), tok);
      return;
    }
    if (out.action) { patch({ orb: "idle" }); onActionRef.current?.(out.action); return; } // open / prepare something: the owner takes it from there
    if (!out.listen) { patch({ orb: "idle" }); return; }
    await hear(tok);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const hear = useCallback(async (tok: number) => {
    if (tok !== token.current) return;
    if (!sttAvailable()) { patch({ orb: "idle", problem: "unsupported" }); return; }
    patch({ orb: "listening", heard: "", problem: null });
    const l = listen(langRef.current, (t) => patch({ heard: t }));
    listener.current = l;
    const r = await l.promise;
    listener.current = null;
    if (tok !== token.current) return;
    if (r.ok) {
      heardLog.current.push(r.text);
      patch({ orb: "thinking", heard: r.text });
      const dlg = d.current!;
      // a new sentence (not an answer to one question) is read as a whole by the AI when it is switched on
      const fresh = dlg.phase === "await_entries" || dlg.phase === "await_more" || dlg.phase === "idle";
      const parsed = fresh && ctx.current ? await understandRemote(r.text, { parties: ctx.current.parties, materials: ctx.current.materials }) : null;
      if (tok !== token.current) return;
      await play(dlg.heard(r.text, parsed ?? undefined), tok);
    } else if (r.reason === "no-speech") await play(d.current!.silence(), tok);
    else if (r.reason === "aborted") return;
    else patch({ orb: "idle", problem: r.reason === "denied" ? "denied" : r.reason === "network" ? "network" : r.reason === "language" ? "language" : "unsupported" });
  }, [play]);

  /** Load the shop's data, then greet. Works from the phone's saved copy when offline. */
  /** `initial`: the sentence that woke Munim ("Munim, Santosh ka kitna baaki hai"): skip the greeting and answer it straight away. */
  const begin = useCallback(async (initial?: string) => {
    const tok = ++token.current;
    patch({ orb: "loading", problem: null, error: "" });
    try {
      const c = await loadVoiceContext();
      ctx.current = c;
      const dctx: DialogueCtx = {
        businessId: c.businessId, today: localToday(), parties: c.parties, materials: c.materials, currentPartyId: opts.currentPartyId, overview: () => c.overview, assistantName: opts.assistantName, canAsk: askEnabled(),
        partyInfo: (id) => c.info[id] ?? { name: id, opening: 0, creditLimit: null }, partyEntries: (id) => c.entries[id] ?? [],
      };
      d.current = new Dialogue({ ...dctx, newId: () => Crypto.randomUUID() }, { lang: initialLang });
      if (!(await voiceAvailable(initialLang))) patch({ problem: "no-voice" });
      if (initial && initial.trim()) { d.current.start(); await play(d.current.heard(initial, (await understandRemote(initial, { parties: c.parties, materials: c.materials, currentPartyId: opts.currentPartyId })) ?? undefined), tok); }
      else await play(d.current.start(), tok);
    } catch (e) { patch({ orb: "idle", error: fe(e) }); }
  }, [initialLang, play]);

  const stop = useCallback(() => { token.current++; listener.current?.abort(); stopSpeaking(); }, []);
  useEffect(() => () => { token.current++; listener.current?.abort(); stopSpeaking(); }, []);

  /** The big mic button: interrupt Munim, finish listening, or wake him up. */
  const tapMic = useCallback(async () => {
    if (!d.current) return;
    if (listener.current) { listener.current.stop(); return; }           // "I'm done talking"
    const tok = ++token.current;
    stopSpeaking();
    if (st.orb === "speaking" || st.orb === "thinking") { await hear(tok); return; }
    await play(d.current.resume(), tok);
  }, [hear, play, st.orb]);

  /** The owner tapped Save: store it (offline-safe), then carry on with the conversation. */
  const save = useCallback(async () => {
    const card = st.view.card;
    if (!card || !d.current) return;
    stop(); patch({ saving: true, error: "" });
    const tok = ++token.current;
    try {
      const payload: EntryPayload = { ...card.payload, source: "voice", transcript: heardLog.current.join(" ⏎ ").slice(0, 600) || null };
      const item = await enqueueEntry(payload);
      await syncNow({ timeoutMs: 6000 });
      const now = getItems().find((i) => i.id === item.id);
      if (now?.status === "failed") { await discardItem(item.id); throw new Error(now.error ?? "rejected"); }
      // keep this session's numbers right even before the next refresh
      const list = (ctx.current!.entries[card.partyId] ??= []);
      void list;
      patch({ saving: false });
      await play(d.current.savedEntry(), tok);
    } catch (e) { patch({ saving: false, error: fe(e), orb: "idle" }); }
  }, [play, st.view.card, stop]);

  const skip = useCallback(async () => { if (!d.current) return; stop(); const tok = ++token.current; await play(d.current.skipped(), tok); }, [play, stop]);
  const partyAdded = useCallback(async (p: PartyRef) => { if (!d.current) return; stop(); const tok = ++token.current; await play(d.current.partyAdded(p), tok); }, [play, stop]);
  /** Hand the entry to the normal form; the voice session ends here. */
  const manual = useCallback(() => { stop(); return d.current?.manualDraft() ?? null; }, [stop]);
  const handedOver = useCallback(() => d.current?.handedOver(), []);

  return { st, begin, stop, tapMic, save, skip, partyAdded, manual, handedOver, ctx };
}
