import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { heuristicUnderstand, resolveUtterance, type ResolvedEntry } from "@munim/ledger-core";
import { loadUnderstandContext } from "./data";
import { supabase } from "./supabase";
import { FONT, useTheme } from "./theme";
import { Btn, Row } from "./ui";

const EXAMPLES = [
  "Santosh ko Moira site pe 80 bag JSW 360 rate se diya",
  "Santosh ne 50,000 diya UPI se",
  "Santosh ko 2 butti reti 700, gaadi bhada 800",
];

/** "Bolo ya likho": the phone keyboard's 🎤 button works for Hindi/Marathi dictation until the in-app mic (STT) is added. */
export function Voice({ onResolved, onCancel }: { onResolved: (entries: ResolvedEntry[], transcript: string) => void; onCancel: () => void }) {
  const t = useTheme();
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
    if (resolved.length === 0) { setErr("Samajh nahi aaya. Party, maal ya rakam ke saath dobara boliye."); return; }
    onResolved(resolved, text.trim());
  }
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14, borderBottomWidth: 2, borderColor: t.ink }}>
        <Text style={{ fontSize: FONT.title, fontWeight: "700", color: t.ink }}>Bolo ya likho</Text>
        <Pressable onPress={onCancel} accessibilityRole="button" style={{ minHeight: 48, justifyContent: "center", paddingHorizontal: 8 }}>
          <Text style={{ fontSize: FONT.body, color: t.accent, fontWeight: "600" }}>Band karo ✕</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} keyboardShouldPersistTaps="handled">
        <Text style={{ fontSize: FONT.body, color: t.muted }}>Entry boliye. Keyboard ke 🎤 button se bol sakte hain (Hindi, Marathi ya English).</Text>
        <TextInput nativeID="utterance" multiline value={text} onChangeText={(v) => { setText(v); setErr(""); }} placeholder="Santosh ko 80 bag JSW 360 rate se diya"
          placeholderTextColor={t.muted} style={{ minHeight: 120, textAlignVertical: "top", borderWidth: 2, borderColor: t.line, backgroundColor: t.surface, color: t.fg, borderRadius: 12, padding: 14, fontSize: FONT.body + 2 }} />
        {err ? <Text style={{ color: t.due, fontSize: FONT.body }}>{err}</Text> : null}
        {!ctx && !err ? <ActivityIndicator /> : <Row wrap={false}><Btn label="Samjho ›" disabled={!ctx || !text.trim()} onPress={go} /></Row>}
        <Text style={{ fontSize: FONT.small, color: t.muted, fontWeight: "700", textTransform: "uppercase" }}>Udaharan (tap karo)</Text>
        {EXAMPLES.map((e) => (
          <Pressable key={e} onPress={() => setText(e)} accessibilityRole="button" style={{ padding: 12, borderRadius: 10, borderWidth: 1, borderColor: t.line, backgroundColor: t.surface }}>
            <Text style={{ fontSize: FONT.body, color: t.fg }}>{e}</Text>
          </Pressable>
        ))}
        <Text style={{ fontSize: FONT.small, color: t.muted }}>Rate har baar boliye. Jo nahi bola, Munim poochhega. Save se pehle aapko sab dikhega.</Text>
      </ScrollView>
    </View>
  );
}
