import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, Platform, Pressable, ScrollView, Text, View } from "react-native";
import type { ResolvedEntry, SpeakLang } from "@munim/ledger-core";
import { createParty } from "./data";
import { useI18n, LANGS, type Key } from "./i18n";
import { rupee } from "./money";
import { FONT, useTheme } from "./theme";
import { Btn, Chip, Field, Row, Section } from "./ui";
import { useConversation, type Orb } from "./voice/useConversation";

const VOICE_LANGS = LANGS.filter((l) => l.k !== "mr"); // Marathi speech comes later
const toSpeak = (l: string): SpeakLang => (l === "en" ? "en" : "hi");

/** Jarvis-style: Munim greets, listens, shows each entry and reads it back. Only the owner's tap on Save saves. */
export function Talk({ businessId, onClose, onType, onManual }: { businessId: string; onClose: () => void; onType: () => void; onManual: (draft: ResolvedEntry) => void }) {
  const t = useTheme();
  const { tr, ta, asst, setAsst } = useI18n();
  const c = useConversation(toSpeak(asst));
  const { st } = c;
  const [showHeard, setShowHeard] = useState(false);
  const [np, setNp] = useState({ name: "", phone: "" });
  const started = useRef(false);
  useEffect(() => { if (!started.current) { started.current = true; void c.begin(); } }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // the orb pulses while Munim speaks or listens
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (st.orb !== "listening" && st.orb !== "speaking") { pulse.setValue(1); return; }
    const a = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: st.orb === "listening" ? 1.18 : 1.08, duration: st.orb === "listening" ? 700 : 450, easing: Easing.inOut(Easing.quad), useNativeDriver: Platform.OS !== "web" }),
      Animated.timing(pulse, { toValue: 1, duration: st.orb === "listening" ? 700 : 450, easing: Easing.inOut(Easing.quad), useNativeDriver: Platform.OS !== "web" }),
    ]));
    a.start();
    return () => a.stop();
  }, [st.orb, pulse]);

  const orbColor: Record<Orb, string> = { loading: t.muted, idle: t.muted, speaking: "#c27c0e", listening: t.paid, thinking: t.accent };
  const label: Record<Orb, Key> = { loading: "talk.loading", idle: "talk.paused", speaking: "talk.speaking", listening: "talk.listening", thinking: "talk.thinking" };
  const card = st.view.card;
  const problemText = st.problem === "denied" ? tr("talk.noMic") : st.problem === "unsupported" ? tr("talk.noSupport") : st.problem === "network" ? tr("talk.needNet")
    : st.problem === "no-voice" ? tr("talk.noVoice", { lang: st.lang === "en" ? "English" : "Hindi" }) : st.problem === "language" ? tr("talk.noSupport") : "";
  const ended = st.view.phase === "ended";

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14, borderBottomWidth: 2, borderColor: t.ink }}>
        <Text style={{ fontSize: FONT.title, fontWeight: "700", color: t.ink }}>{tr("talk.title")}</Text>
        <Pressable onPress={() => { c.stop(); onClose(); }} accessibilityRole="button" style={{ minHeight: 48, justifyContent: "center", paddingHorizontal: 8 }}>
          <Text style={{ fontSize: FONT.body, color: t.accent, fontWeight: "600" }}>{tr("add.closeX")}</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, alignItems: "stretch" }} keyboardShouldPersistTaps="handled">
        <Section title={tr("talk.voiceLang")}>
          <Row>{VOICE_LANGS.map((l) => <Chip key={l.k} label={l.label} on={toSpeak(asst) === l.k} onPress={() => { setAsst(l.k); c.stop(); }} />)}</Row>
          <Text style={{ fontSize: 13, color: t.muted }}>{tr("talk.langNote")}</Text>
        </Section>

        <View style={{ alignItems: "center", gap: 10, paddingVertical: 6 }}>
          <Pressable onPress={() => void c.tapMic()} accessibilityRole="button" accessibilityLabel={tr("talk.tapMic")} testID="orb">
            <Animated.View style={{ width: 132, height: 132, borderRadius: 66, backgroundColor: orbColor[st.orb], alignItems: "center", justifyContent: "center", transform: [{ scale: pulse }], opacity: st.orb === "idle" ? 0.85 : 1 }}>
              {st.orb === "loading" ? <ActivityIndicator color="#fff" /> : <Text style={{ fontSize: 54 }}>{st.orb === "listening" ? "🎙" : st.orb === "speaking" ? "🔊" : st.orb === "thinking" ? "…" : "🎤"}</Text>}
            </Animated.View>
          </Pressable>
          <Text style={{ fontSize: FONT.small, fontWeight: "700", color: orbColor[st.orb], textTransform: "uppercase", letterSpacing: 0.8 }}>{tr(label[st.orb])}</Text>
        </View>

        {st.caption ? <Text style={{ fontSize: FONT.title - 2, fontWeight: "600", color: t.fg, textAlign: "center", lineHeight: 32 }} testID="caption">{st.caption}</Text> : null}
        {problemText ? <Text style={{ fontSize: FONT.body, color: t.due, textAlign: "center" }} testID="problem">{problemText}</Text> : null}
        {st.error ? <Text style={{ fontSize: FONT.body, color: t.due, textAlign: "center" }}>{st.error}</Text> : null}

        {showHeard && st.heard ? <Text style={{ fontSize: FONT.small, color: t.muted, textAlign: "center" }}>{tr("talk.heard")}: “{st.heard}”</Text> : null}

        {card ? (
          <View style={{ gap: 8, padding: 14, borderRadius: 14, borderWidth: 2, borderColor: t.ink, backgroundColor: t.surface }} testID="card">
            {st.view.position && st.view.position.n > 1 ? <Text style={{ fontSize: FONT.small, color: t.muted }}>{tr("talk.entryOf", { i: st.view.position.i, n: st.view.position.n })}</Text> : null}
            <Text style={{ fontSize: FONT.title - 2, fontWeight: "700", color: t.ink }}>{card.party}{card.site ? ` · ${card.site}` : ""}</Text>
            <Text style={{ fontSize: FONT.small, color: t.muted }}>{tr(`type.${card.type}` as Key)}{card.paymentMode ? ` · ${tr(`mode.${card.paymentMode}` as Key)}` : ""}</Text>
            {card.lines.map((l, i) => <Text key={i} style={{ fontSize: FONT.body + 1, color: t.fg }}>{ta("rv.line", { name: l.name, qty: l.qty / 1000, unit: l.unit, rate: rupee(l.rate), total: rupee(l.total) })}</Text>)}
            <View style={{ borderTopWidth: 2, borderColor: t.ink, paddingTop: 8, gap: 2 }}>
              <Text style={{ fontSize: FONT.body, color: t.muted }}>{ta("rv.entryTotal", { v: rupee(card.total) })}</Text>
              <Text style={{ fontSize: FONT.body, color: t.muted }}>{tr("talk.old")}: {rupee(card.oldBalance)}</Text>
              <Text style={{ fontSize: FONT.big, fontWeight: "700", color: card.newBalance > 0 ? t.due : t.paid }}>{tr("talk.new")}: {rupee(card.newBalance)}</Text>
            </View>
            {card.warnings.includes("rate") ? <Text style={{ color: t.due, fontWeight: "600", fontSize: FONT.small }}>⚠ {tr("talk.warnRate")}</Text> : null}
            {card.warnings.includes("credit") ? <Text style={{ color: t.due, fontWeight: "600", fontSize: FONT.small }}>⚠ {tr("talk.warnCredit")}</Text> : null}
            <Row wrap={false}><Btn label={st.saving ? tr("talk.saving") : tr("talk.save")} disabled={st.saving} onPress={() => void c.save()} /></Row>
            <Row wrap={false}>
              <Btn kind="ghost" label={tr("talk.edit")} onPress={() => { const dr = c.manual(); if (dr) onManual(dr as unknown as ResolvedEntry); }} />
              <Btn kind="ghost" label={tr("talk.skip")} onPress={() => void c.skip()} />
            </Row>
          </View>
        ) : null}

        {st.view.unknownParty ? (
          <View style={{ gap: 10, padding: 14, borderRadius: 14, borderWidth: 2, borderColor: t.accent, backgroundColor: t.surface }} testID="newparty">
            <Row wrap={false}>
              <Field label={tr("add.name")} nativeID="tk-name" value={np.name} onChangeText={(v) => setNp({ ...np, name: v })} />
              <Field label={tr("add.phone")} nativeID="tk-phone" keyboardType="phone-pad" value={np.phone} onChangeText={(v) => setNp({ ...np, phone: v })} />
            </Row>
            <Row wrap={false}>
              <Btn label={tr("talk.addParty")} disabled={!np.name.trim() || np.phone.trim().length < 8} onPress={async () => {
                try { const id = await createParty(businessId, np.name.trim(), np.phone.trim()); setNp({ name: "", phone: "" }); await c.partyAdded({ id, name: np.name.trim(), nicknames: [st.view.unknownParty!], sites: [] }); } catch { /* shown by the next step */ }
              }} />
              <Btn kind="ghost" label={tr("talk.skip")} onPress={() => void c.skip()} />
            </Row>
          </View>
        ) : null}

        {st.view.needsManual && !card ? (
          <View style={{ gap: 10 }}>
            <Text style={{ fontSize: FONT.body, color: t.fg, textAlign: "center" }}>{tr("talk.useButtons")}</Text>
            <Row wrap={false}><Btn label={tr("talk.edit")} onPress={() => { const dr = c.manual(); if (dr) onManual(dr as unknown as ResolvedEntry); }} /><Btn kind="ghost" label={tr("talk.skip")} onPress={() => void c.skip()} /></Row>
          </View>
        ) : null}

        {ended ? (
          <View style={{ gap: 10 }}>
            <Text style={{ fontSize: FONT.title, fontWeight: "700", color: t.paid, textAlign: "center" }}>{tr("talk.finished", { n: st.view.saved })}</Text>
            <Row wrap={false}><Btn label={tr("talk.close")} onPress={onClose} /></Row>
          </View>
        ) : null}

        <Row>
          <Chip label={tr("talk.typeInstead")} onPress={() => { c.stop(); onType(); }} />
          <Chip label={tr("talk.showHeard")} on={showHeard} onPress={() => setShowHeard(!showHeard)} />
        </Row>
      </ScrollView>
    </View>
  );
}
