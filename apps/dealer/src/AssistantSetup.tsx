import { useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { LANGS, useI18n, type Lang } from "./i18n";
import { saveAssistantName } from "./data";
import { Logo } from "./Logo";
import { FONT, HEAD, useTheme } from "./theme";
import { Btn, Chip, Field, Row, Section } from "./ui";

const SUGGESTIONS = ["Munshi", "Jarvis", "Babu", "Sahayak", "Seth", "Friday"];

/**
 * Every business names its own assistant (so two shops never share one name) and picks the language it speaks.
 * Shown once, right after the business is set up; the owner can change both any time in Settings.
 */
export function AssistantSetup({ businessId, onDone }: { businessId: string; onDone: () => void }) {
  const t = useTheme();
  const { chooseAsst, asst } = useI18n();
  const [name, setName] = useState("");
  const [lang, setLang] = useState<Lang>(asst);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function go() {
    setBusy(true); setErr("");
    try { await saveAssistantName(businessId, name); chooseAsst(lang); onDone(); }
    catch (e: any) { setErr(String(e?.message ?? e)); setBusy(false); }
  }
  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={{ padding: 22, gap: 18 }} keyboardShouldPersistTaps="handled">
      <View style={{ alignItems: "center", gap: 8 }}><Logo size={72} /></View>
      <Text style={{ fontFamily: HEAD, fontSize: 28, color: t.ink, textAlign: "center" }}>Name your assistant</Text>
      <Text style={{ fontSize: FONT.body, color: t.muted, textAlign: "center" }}>
        Your assistant answers questions about your books and prepares entries by voice. Give it a name you like. You can change it, and the language, any time in Settings.
      </Text>
      <Field label="Assistant name" nativeID="asst-name" value={name} onChangeText={(v) => setName(v.slice(0, 20))} />
      <Row>{SUGGESTIONS.map((s) => <Chip key={s} label={s} on={name === s} onPress={() => setName(s)} />)}</Row>
      <Section title="Language it speaks">
        <Row>{LANGS.map((l) => <Chip key={l.k} label={l.label} on={lang === l.k} onPress={() => setLang(l.k)} />)}</Row>
      </Section>
      {err ? <Text style={{ color: t.due, fontSize: FONT.body }}>{err}</Text> : null}
      {busy ? <ActivityIndicator /> : <Row wrap={false}><Btn label="Continue" disabled={name.trim().length < 2} onPress={go} /></Row>}
    </ScrollView>
  );
}
