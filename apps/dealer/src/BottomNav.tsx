import { Pressable, Text, View } from "react-native";
import { useI18n } from "./i18n";
import { HEAD, useTheme } from "./theme";

export type NavKey = "parties" | "reminders" | "reports" | "items";

/** Bottom bar: four tabs with the saffron Talk button raised in the middle. */
export function BottomNav({ active, onGo, onTalk }: { active: string; onGo: (k: NavKey) => void; onTalk: () => void }) {
  const t = useTheme();
  const { tr } = useI18n();
  const tab = (k: NavKey, icon: string, label: string) => (
    <Pressable key={k} onPress={() => onGo(k)} accessibilityRole="tab" accessibilityState={{ selected: active === k }} style={{ flex: 1, minHeight: 58, alignItems: "center", justifyContent: "center", gap: 1 }}>
      <Text style={{ fontSize: 21, opacity: active === k ? 1 : 0.6 }}>{icon}</Text>
      <Text style={{ fontSize: 11.5, fontWeight: "700", color: active === k ? t.saffron : t.muted }} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", backgroundColor: t.surface, borderTopWidth: 1, borderColor: t.line, paddingHorizontal: 4 }}>
      {tab("parties", "👥", tr("tab.parties"))}
      {tab("reminders", "🔔", tr("tab.reminders"))}
      <View style={{ width: 84, alignItems: "center" }}>
        <Pressable onPress={onTalk} accessibilityRole="button" accessibilityLabel={tr("talk.home")} testID="talk-orb"
          style={{ width: 66, height: 66, borderRadius: 33, marginTop: -26, backgroundColor: t.saffron, alignItems: "center", justifyContent: "center", borderWidth: 4, borderColor: t.bg, shadowColor: "#000", shadowOpacity: 0.28, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 8 }}>
          <Text style={{ fontSize: 28 }}>🎙</Text>
        </Pressable>
        <Text style={{ fontFamily: HEAD, fontSize: 12.5, color: t.fg, marginTop: 3, marginBottom: 6 }}>{tr("tab.talk")}</Text>
      </View>
      {tab("reports", "📊", tr("tab.reports"))}
      {tab("items", "📦", tr("tab.items"))}
    </View>
  );
}
