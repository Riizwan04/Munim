import { useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { PRESETS } from "@munim/ledger-core";
import { createBusinessWithPreset } from "./data";
import { supabase } from "./supabase";
import { useI18n } from "./i18n";
import { FONT, useTheme } from "./theme";
import { Btn, Chip, Field, Row, Section } from "./ui";

/** First launch for a new owner: name the business, pick a starting item list (all editable later). */
export function Onboarding({ onDone }: { onDone: () => void }) {
  const t = useTheme();
  const { tr } = useI18n();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [preset, setPreset] = useState(PRESETS[0]!.key);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function go() {
    setBusy(true); setErr("");
    try { await createBusinessWithPreset(name.trim(), phone.trim(), preset); onDone(); } catch (e: any) { setErr(e.message ?? String(e)); setBusy(false); }
  }
  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={{ padding: 20, gap: 20 }} keyboardShouldPersistTaps="handled">
      <Text style={{ fontSize: 30, fontWeight: "700", color: t.ink }}>{tr("ob.title")}</Text>
      <Text style={{ fontSize: FONT.body, color: t.muted }}>{tr("ob.sub")}</Text>
      <Field label={tr("ob.name")} nativeID="biz-name" value={name} onChangeText={setName} />
      <Field label={tr("ob.phone")} nativeID="biz-phone" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
      <Section title={tr("ob.what")}>
        <Row>{PRESETS.map((p) => <Chip key={p.key} label={p.label} on={preset === p.key} onPress={() => setPreset(p.key)} />)}</Row>
      </Section>
      {err ? <Text style={{ color: t.due, fontSize: FONT.body }}>{err}</Text> : null}
      {busy ? <ActivityIndicator /> : <Row wrap={false}><Btn label={tr("ob.start")} disabled={!name.trim() || phone.trim().length < 8} onPress={go} /></Row>}
      <Text onPress={() => supabase.auth.signOut()} style={{ color: t.muted, fontSize: FONT.small, textAlign: "center", padding: 12 }}>{tr("common.logout")}</Text>
    </ScrollView>
  );
}
