import { ScrollView, Text } from "react-native";
import { LANGS, useI18n } from "./i18n";
import { supabase } from "./supabase";
import { FONT, useTheme } from "./theme";
import { Btn, Chip, Row, Section } from "./ui";

/** App language (screens) and assistant language (its questions and read-back) are chosen separately (PRD FR-02). */
export function Settings({ onBack }: { onBack: () => void }) {
  const t = useTheme();
  const { tr, ui, asst, setUi, setAsst } = useI18n();
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
      <Row wrap={false}><Btn kind="ghost" label={tr("common.logout")} onPress={() => supabase.auth.signOut()} /></Row>
    </ScrollView>
  );
}
