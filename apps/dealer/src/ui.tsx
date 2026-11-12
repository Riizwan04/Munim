import type { ReactNode } from "react";
import { Pressable, Text, TextInput, View, type TextInputProps } from "react-native";
import { FONT, useTheme } from "./theme";

export function Chip({ label, on, onPress }: { label: string; on?: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: !!on }}
      style={{ minHeight: 48, paddingHorizontal: 16, justifyContent: "center", borderRadius: 24, borderWidth: 2, borderColor: on ? t.accent : t.line, backgroundColor: on ? t.accent : t.surface }}>
      <Text style={{ fontSize: FONT.body, fontWeight: "600", color: on ? t.accentFg : t.fg }}>{label}</Text>
    </Pressable>
  );
}
export function Btn({ label, onPress, kind = "primary", disabled }: { label: string; onPress: () => void; kind?: "primary" | "ghost" | "danger"; disabled?: boolean }) {
  const t = useTheme();
  const bg = kind === "primary" ? t.paid : kind === "danger" ? t.due : "transparent";
  const fg = kind === "ghost" ? t.accent : "#ffffff";
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button"
      style={{ minHeight: 56, paddingHorizontal: 20, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: bg, borderWidth: kind === "ghost" ? 2 : 0, borderColor: t.accent, opacity: disabled ? 0.5 : 1, flex: 1 }}>
      <Text style={{ fontSize: FONT.body + 1, fontWeight: "700", color: fg }}>{label}</Text>
    </Pressable>
  );
}
export function Field({ label, ...p }: TextInputProps & { label: string }) {
  const t = useTheme();
  return (
    <View style={{ gap: 4, flex: 1 }}>
      <Text style={{ fontSize: FONT.small, color: t.muted, fontWeight: "600" }}>{label}</Text>
      <TextInput placeholderTextColor={t.muted} {...p}
        style={{ borderWidth: 2, borderColor: t.line, backgroundColor: t.surface, color: t.fg, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, fontSize: FONT.body, minHeight: 52 }} />
    </View>
  );
}
export function Section({ title, children }: { title: string; children: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontSize: FONT.small, color: t.muted, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase" }}>{title}</Text>
      {children}
    </View>
  );
}
export const Row = ({ children, wrap = true }: { children: ReactNode; wrap?: boolean }) => (
  <View style={{ flexDirection: "row", gap: 8, flexWrap: wrap ? "wrap" : "nowrap" }}>{children}</View>
);
