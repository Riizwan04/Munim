import { useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { isValidEmail } from "@munim/ledger-core";
import { supabase } from "./supabase";
import { useI18n } from "./i18n";
import { FONT, useTheme } from "./theme";

export function Login() {
  const t = useTheme();
  const { tr } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [info, setInfo] = useState("");
  const input = { borderWidth: 2, borderColor: t.line, backgroundColor: t.surface, color: t.fg, borderRadius: 10, padding: 14, fontSize: FONT.body } as const;
  async function go() {
    setErr(""); setInfo("");
    if (mode === "signup") {
      if (!isValidEmail(email)) { setErr(tr("login.badEmail")); return; }
      if (password.length < 8) { setErr(tr("login.shortPw")); return; }
    }
    setBusy(true);
    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
      if (error) setErr(error.message);
      else if (!data.session) setInfo(tr("login.confirmEmail")); // email confirmation is on: no session until confirmed
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) setErr(error.message);
    }
    setBusy(false);
  }
  return (
    <View style={{ flex: 1, justifyContent: "center", gap: 14, padding: 24, backgroundColor: t.bg }}>
      <Text style={{ fontSize: 34, fontWeight: "700", color: t.ink }}>Munim</Text>
      <Text style={{ fontSize: FONT.body, color: t.muted }}>{tr("login.tagline")}</Text>
      <TextInput nativeID="email" style={input} placeholder={tr("login.email")} placeholderTextColor={t.muted} autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <TextInput nativeID="password" style={input} placeholder={tr("login.password")} placeholderTextColor={t.muted} secureTextEntry value={password} onChangeText={setPassword} />
      {mode === "signup" ? <Text style={{ color: t.muted, fontSize: FONT.small }}>{tr("login.pwHint")}</Text> : null}
      {err ? <Text style={{ color: t.due, fontSize: FONT.small }}>{err}</Text> : null}
      {info ? <Text style={{ color: t.paid, fontSize: FONT.small, fontWeight: "600" }}>{info}</Text> : null}
      <Pressable onPress={go} disabled={busy} accessibilityRole="button" style={{ backgroundColor: t.accent, padding: 16, borderRadius: 12, alignItems: "center", minHeight: 56, justifyContent: "center" }}>
        {busy ? <ActivityIndicator color={t.accentFg} /> : <Text style={{ color: t.accentFg, fontSize: FONT.body, fontWeight: "700" }}>{mode === "signup" ? tr("login.signup") : tr("login.button")}</Text>}
      </Pressable>
      <Pressable onPress={() => { setMode(mode === "login" ? "signup" : "login"); setErr(""); setInfo(""); }} accessibilityRole="button" style={{ minHeight: 48, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: t.accent, fontSize: FONT.body, fontWeight: "600" }}>{mode === "login" ? tr("login.create") : tr("login.haveAccount")}</Text>
      </Pressable>
    </View>
  );
}
