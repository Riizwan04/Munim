import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { heuristicUnderstand, resolveUtterance, type ResolvedEntry } from "@munim/ledger-core";
import { loadUnderstandContext } from "./data";
import { supabase } from "./supabase";
import { useI18n } from "./i18n";
import { FONT, useTheme } from "./theme";
import { Btn, Row } from "./ui";


/** "Bolo ya likho": the phone keyboard's 🎤 button works for Hindi/Marathi dictation until the in-app mic (STT) is added. */
export function Voice({ onResolved, onCancel }: { onResolved: (entries: ResolvedEntry[], transcript: string) => void; onCancel: () => void }) {
  const t = useTheme();
  const { tr, ta } = useI18n();
  const EXAMPLES = [ta("voice.ex1"), ta("voice.ex2"), ta("voice.ex3")];
  const [text, setText] = useState("");
  const [ctx, setCtx] = useState<Awaited<ReturnType<typeof loadUnderstandContext>> | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { loadUnderstandContext().then(setCtx).catch((e) => setErr(e.message)); }, []);

  async function go() {
    if (!ctx) return;
    // Optional AI extractor (Supabase Edge Function "understand"); falls back to the built-in rules if it is off or fails.
    let parsed = heuristicUnderstand(text, ctx);
    if (process.env.EXPO_PUBLIC_UNDERSTAND_FUNCTION === "1") {
      const r = await supabase.functions.invoke("understand", { body: { text, parties: ctx.parties, materials: ctx.materials } });
      if (!r.error && Array.isArray(r.data?.entries) && r.data.entries.length) parsed = r.data;
    }
    const resolved = resolveUtterance(parsed, ctx);
    if (resolved.length === 0) { setErr(ta("voice.fail")); return; }
    onResolved(resolved, text.trim());
  }
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14, borderBottomWidth: 2, borderColor: t.ink }}>
        <Text style={{ fontSize: FONT.title, fontWeight: "700", color: t.ink }}>{ta("voice.title")}</Text>
        <Pressable onPress={onCancel} accessibilityRole="button" style={{ minHeight: 48, justifyContent: "center", paddingHorizontal: 8 }}>
          <Text style={{ fontSize: FONT.body, color: t.accent, fontWeight: "600" }}>{tr("add.closeX")}</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} keyboardShouldPersistTaps="handled">
        <Text style={{ fontSize: FONT.body, color: t.muted }}>{ta("voice.intro")}</Text>
        <TextInput nativeID="utterance" multiline value={text} onChangeText={(v) => { setText(v); setErr(""); }} placeholder={ta("voice.placeholder")}
          placeholderTextColor={t.muted} style={{ minHeight: 120, textAlignVertical: "top", borderWidth: 2, borderColor: t.line, backgroundColor: t.surface, color: t.fg, borderRadius: 12, padding: 14, fontSize: FONT.body + 2 }} />
        {err ? <Text style={{ color: t.due, fontSize: FONT.body }}>{err}</Text> : null}
        {!ctx && !err ? <ActivityIndicator /> : <Row wrap={false}><Btn label={ta("voice.go")} disabled={!ctx || !text.trim()} onPress={go} /></Row>}
        <Text style={{ fontSize: FONT.small, color: t.muted, fontWeight: "700", textTransform: "uppercase" }}>{ta("voice.examples")}</Text>
        {EXAMPLES.map((e) => (
          <Pressable key={e} onPress={() => setText(e)} accessibilityRole="button" style={{ padding: 12, borderRadius: 10, borderWidth: 1, borderColor: t.line, backgroundColor: t.surface }}>
            <Text style={{ fontSize: FONT.body, color: t.fg }}>{e}</Text>
          </Pressable>
        ))}
        <Text style={{ fontSize: FONT.small, color: t.muted }}>{ta("voice.hint")}</Text>
      </ScrollView>
    </View>
  );
}
