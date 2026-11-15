import type { ReactNode } from "react";
import { Platform, View, useWindowDimensions } from "react-native";
import { useTheme } from "./theme";

/**
 * On a laptop/desktop browser the app is shown inside a phone-shaped frame, so testing there looks and behaves like the phone.
 * On a real phone (or any narrow window) and in the native apps it does nothing at all.
 */
export function PhoneFrame({ children }: { children: ReactNode }) {
  const { width, height } = useWindowDimensions();
  const t = useTheme();
  if (Platform.OS !== "web" || width < 720) return <>{children}</>;
  const h = Math.min(height - 32, 880);
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: t.line }} testID="phone-frame-backdrop">
      <View style={{ width: 400, height: h, borderRadius: 42, borderWidth: 10, borderColor: "#10131f", overflow: "hidden", backgroundColor: t.bg, position: "relative",
        shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 30, shadowOffset: { width: 0, height: 14 } }} testID="phone-frame">
        {children}
      </View>
    </View>
  );
}
