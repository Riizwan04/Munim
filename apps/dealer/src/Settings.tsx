import { ScrollView, Text } from "react-native";
import { LANGS, useI18n } from "./i18n";
import { useState } from "react";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { recent, report } from "./diagnostics";
import { useOutbox } from "./offline/outbox";
import { useReachable } from "./offline/net";
import { shareText } from "./share";
import { requestSignOut } from "./offline/signout";
import { FONT, useTheme } from "./theme";
import { Btn, Chip, Row, Section } from "./ui";

/** App language (screens) and assistant language (its questions and read-back) are chosen separately (PRD FR-02). */
export function Settings({ onBack }: { onBack: () => void }) {
  const t = useTheme();
  const { tr, ui, asst, setUi, setAsst } = useI18n();
  const [note, setNote] = useState("");
  const online = useReachable();
  const { pending, failed } = useOutbox();
  const version = Constants.expoConfig?.version ?? "?";
  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={{ padding: 16, gap: 20 }}>
      <Text onPress={onBack} accessibilityRole="button" style={{ fontSize: FONT.body, color: t.accent, fontWeight: "600" }}>‹ {tr("common.back")}</Text>
      <Text style={{ fontSize: FONT.title, fontWeight: "700", color: t.ink }}>{tr("set.title")}</Text>
      <Section title={tr("set.appLang")}>
        <Row>{LANGS.map((l) => <Chip key={l.k} label={l.label} on={ui === l.k} onPress={() => setUi(l.k)} />)}</Row>
      </Section>
      <Section title={tr("set.asstLang")}>
        <Row>{LANGS.map((l) => <Chip key={l.k} label={l.label} on={asst === l.k} onPress={() => setAsst(l.k)} />)}</Row>
        <Text style={{ fontSize: FONT.small, color: t.muted }}>{tr("set.note")}</Text>
      </Section>
      <Text style={{ fontSize: FONT.small, color: t.muted }}>{tr("set.msgNote")}</Text>

      <Section title={tr("diag.title")}>
        <Text style={{ fontSize: FONT.body, color: t.fg, fontWeight: "600" }}>{tr("diag.version", { v: version })}</Text>
        <Text style={{ fontSize: FONT.small, color: t.muted }}>{tr("diag.note")}</Text>
        {Platform.OS === "web" ? <Text style={{ fontSize: FONT.small, color: t.muted }}>{tr("diag.install")}</Text> : null}
        <Text style={{ fontSize: FONT.small, color: t.muted, fontWeight: "700", marginTop: 4 }}>{tr("diag.recent")}</Text>
        {recent(8).length === 0 ? <Text style={{ fontSize: FONT.small, color: t.paid }}>{tr("diag.none")}</Text> : recent(8).map((l, i) => <Text key={i} style={{ fontSize: 12, color: t.due }}>{l}</Text>)}
        <Row wrap={false}><Btn kind="ghost" label={tr("diag.share")} onPress={async () => { await shareText(report({ version, ui, asst, online, pending, failed })); setNote(tr("diag.shared")); }} /></Row>
      </Section>
      {note ? <Text style={{ color: t.due, fontSize: FONT.small }}>{note}</Text> : null}
      <Row wrap={false}><Btn kind="ghost" label={tr("common.logout")} onPress={async () => { if (!(await requestSignOut())) setNote(tr("offline.logoutBlocked")); }} /></Row>
    </ScrollView>
  );
}
