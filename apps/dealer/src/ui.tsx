import type { ReactNode } from "react";
import { Pressable, Text, TextInput, View, type TextInputProps } from "react-native";
import { FONT, HEAD, useTheme } from "./theme";

export function Chip({ label, on, onPress }: { label: string; on?: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: !!on }}
      style={{ minHeight: 46, paddingHorizontal: 16, justifyContent: "center", borderRadius: 23, borderWidth: 1.5, borderColor: on ? t.accent : t.line, backgroundColor: on ? t.accent : t.surface }}>
      <Text style={{ fontSize: FONT.body - 1, fontWeight: "600", color: on ? t.accentFg : t.fg }}>{label}</Text>
    </Pressable>
  );
}
export function Btn({ label, onPress, kind = "primary", disabled }: { label: string; onPress: () => void; kind?: "primary" | "ghost" | "danger"; disabled?: boolean }) {
  const t = useTheme();
  const bg = kind === "primary" ? t.paid : kind === "danger" ? t.due : "transparent";
  const fg = kind === "ghost" ? t.accent : "#ffffff";
  const fgDark = kind !== "ghost" && t.bg === "#12141f"; // keep white text readable on the dark-mode green and red
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button"
      style={{ minHeight: 56, paddingHorizontal: 20, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: bg, borderWidth: kind === "ghost" ? 1.5 : 0, borderColor: t.accent, opacity: disabled ? 0.5 : 1, flex: 1 }}>
      <Text style={{ fontFamily: HEAD, fontSize: FONT.body + 1, color: fgDark ? "#06130a" : fg }}>{label}</Text>
    </Pressable>
  );
}
export function Field({ label, ...p }: TextInputProps & { label: string }) {
  const t = useTheme();
  return (
    <View style={{ gap: 4, flex: 1 }}>
      <Text style={{ fontSize: FONT.small, color: t.muted, fontWeight: "600" }}>{label}</Text>
      <TextInput placeholderTextColor={t.muted} {...p}
        style={{ borderWidth: 1.5, borderColor: t.line, backgroundColor: t.surface, color: t.fg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: FONT.body, minHeight: 52 }} />
    </View>
  );
}
export function Section({ title, children }: { title: string; children: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ width: 16, height: 3, borderRadius: 2, backgroundColor: t.saffron }} />
        <Text style={{ fontSize: FONT.small - 1, color: t.muted, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", flexShrink: 1 }}>{title}</Text>
      </View>
      {children}
    </View>
  );
}
export const Row = ({ children, wrap = true }: { children: ReactNode; wrap?: boolean }) => (
  <View style={{ flexDirection: "row", gap: 8, flexWrap: wrap ? "wrap" : "nowrap" }}>{children}</View>
);
