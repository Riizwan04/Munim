import { Pressable, ScrollView, Text, View } from "react-native";
import { LANGS, useI18n } from "./i18n";
import { Logo } from "./Logo";
import { FONT, HEAD, useTheme } from "./theme";

/** Shown once, the first time the app is opened: which language should Munim speak? Afterwards it only changes in Settings. */
export function Welcome() {
  const t = useTheme();
  const { chooseAsst } = useI18n();
  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={{ flexGrow: 1, padding: 24, gap: 18, justifyContent: "center" }}>
      <View style={{ alignItems: "center", gap: 10 }}><Logo size={84} /><Text style={{ fontFamily: HEAD, fontSize: 34, color: t.ink }}>Munim</Text></View>
      <Text style={{ fontFamily: HEAD, fontSize: FONT.title, color: t.ink, textAlign: "center" }}>Which language should Munim speak?</Text>
      <Text style={{ fontSize: FONT.body, color: t.muted, textAlign: "center" }}>मुनीम किस भाषा में बोले? · मुनीम कोणत्या भाषेत बोलेल?</Text>
      {LANGS.map((l) => (
        <Pressable key={l.k} onPress={() => chooseAsst(l.k)} accessibilityRole="button" accessibilityLabel={l.label} testID={`welcome-${l.k}`}
          style={{ minHeight: 64, borderRadius: 18, borderWidth: 2, borderColor: t.ink, backgroundColor: t.surface, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontFamily: HEAD, fontSize: 26, color: t.ink }}>{l.label}</Text>
        </Pressable>
      ))}
      <Text style={{ fontSize: FONT.small, color: t.muted, textAlign: "center" }}>You can change this later in Settings.</Text>
    </ScrollView>
  );
}
