import { useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { supabase } from "./supabase";
import { FONT, useTheme } from "./theme";

export function Login() {
  const t = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const input = { borderWidth: 2, borderColor: t.line, backgroundColor: t.surface, color: t.fg, borderRadius: 10, padding: 14, fontSize: FONT.body } as const;
  async function go() {
    setBusy(true); setErr("");
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) setErr(error.message);
    setBusy(false);
  }
  return (
    <View style={{ flex: 1, justifyContent: "center", gap: 14, padding: 24, backgroundColor: t.bg }}>
      <Text style={{ fontSize: 34, fontWeight: "700", color: t.ink }}>Munim</Text>
      <Text style={{ fontSize: FONT.body, color: t.muted }}>Bas boliye, hisaab likha jayega.</Text>
      <TextInput nativeID="email" style={input} placeholder="Email" placeholderTextColor={t.muted} autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <TextInput nativeID="password" style={input} placeholder="Password" placeholderTextColor={t.muted} secureTextEntry value={password} onChangeText={setPassword} />
      {err ? <Text style={{ color: t.due, fontSize: FONT.small }}>{err}</Text> : null}
      <Pressable onPress={go} disabled={busy} accessibilityRole="button" style={{ backgroundColor: t.accent, padding: 16, borderRadius: 12, alignItems: "center", minHeight: 56, justifyContent: "center" }}>
        {busy ? <ActivityIndicator color={t.accentFg} /> : <Text style={{ color: t.accentFg, fontSize: FONT.body, fontWeight: "700" }}>Login</Text>}
      </Pressable>
    </View>
  );
}
