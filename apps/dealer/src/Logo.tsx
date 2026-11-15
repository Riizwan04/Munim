import { Image, Text, View } from "react-native";
import { HEAD, useTheme } from "./theme";

/** The Munim mark (an M on a ledger page with an accountant's double underline). */
export function Logo({ size = 40 }: { size?: number }) {
  return <Image source={require("../assets/logo-mark.png")} style={{ width: size, height: size }} accessibilityLabel="Munim" />;
}
export function LogoWord({ size = 40, color }: { size?: number; color?: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: size * 0.28 }}>
      <Logo size={size} />
      <Text style={{ fontFamily: HEAD, fontSize: size * 0.72, color: color ?? t.ink, lineHeight: size * 0.95 }}>Munim</Text>
    </View>
  );
}

const AVATAR = ["#c2410c", "#6d28d9", "#0369a1", "#15803d", "#be185d", "#a16207", "#0f766e", "#4338ca"];
/** A round initials badge. The colour comes from the name, so a party always keeps the same one. */
export function Avatar({ name, size = 42 }: { name: string; size?: number }) {
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const initials = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: AVATAR[h % AVATAR.length], alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontFamily: HEAD, color: "#fff", fontSize: size * 0.38 }}>{initials}</Text>
    </View>
  );
}

/** A small status pill: tone "bad" (due), "good" (clear), "warn" (reminded). */
export function Tag({ label, tone }: { label: string; tone: "bad" | "good" | "warn" }) {
  const t = useTheme();
  const c = tone === "bad" ? t.due : tone === "good" ? t.paid : t.saffron;
  return (
    <View style={{ alignSelf: "flex-end", backgroundColor: tone === "warn" ? t.warnBg : tone === "good" ? t.paidBg : "transparent", borderRadius: 99, paddingHorizontal: 9, paddingVertical: 2, borderWidth: tone === "bad" ? 1.5 : 0, borderColor: c }}>
      <Text style={{ fontSize: 11.5, fontWeight: "700", color: c }}>{label}</Text>
    </View>
  );
}
