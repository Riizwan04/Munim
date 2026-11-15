import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Platform, useColorScheme } from "react-native";

/**
 * Munim's look: "Bahi-khata". Warm khata-paper and ink blue by day, an ink-night version after dark, saffron for the
 * assistant. Both palettes keep the same meaning: green = money received, red = money due.
 */
const light = {
  bg: "#f3ecdc", surface: "#fffdf6", fg: "#1b2547", muted: "#6d6a5c", line: "#d8cdb3", rule: "#e8dfc9",
  ink: "#1b2a6b", due: "#b02a1f", paid: "#2c7a3a", paidBg: "#e3f1e3", accent: "#1b2a6b", accentFg: "#ffffff",
  hero: "#1b2a6b", heroFg: "#ffffff", saffron: "#d9731a", saffronFg: "#ffffff", warnBg: "#fbead0",
};
const dark: typeof light = {
  bg: "#12141f", surface: "#1b1e2e", fg: "#ece7d8", muted: "#9c998a", line: "#34374d", rule: "#272a3d",
  ink: "#aab8ff", due: "#ff7b6e", paid: "#5ac27a", paidBg: "#1a3223", accent: "#aab8ff", accentFg: "#12141f",
  hero: "#232c63", heroFg: "#f3efe2", saffron: "#f2a24b", saffronFg: "#1a1204", warnBg: "#3a2a12",
};
export type Theme = typeof light;
export type ThemeMode = "system" | "light" | "dark";

interface Ctx { mode: ThemeMode; scheme: "light" | "dark"; setMode: (m: ThemeMode) => void }
const ThemeCtx = createContext<Ctx | null>(null);
const KEY = "munim.theme";

/** Light / dark / follow the phone. The choice is remembered on this device. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme() === "dark" ? "dark" : "light";
  const [mode, setModeState] = useState<ThemeMode>("system");
  useEffect(() => { AsyncStorage.getItem(KEY).then((v) => { if (v === "light" || v === "dark" || v === "system") setModeState(v); }).catch(() => undefined); }, []);
  const setMode = useCallback((m: ThemeMode) => { setModeState(m); AsyncStorage.setItem(KEY, m).catch(() => undefined); }, []);
  const scheme = mode === "system" ? system : mode;
  useEffect(() => { // no white flash behind the app on the web
    if (Platform.OS === "web" && typeof document !== "undefined") {
      const p = scheme === "dark" ? dark : light;
      document.documentElement.style.backgroundColor = p.bg; document.body.style.backgroundColor = p.bg;
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", p.hero);
    }
  }, [scheme]);
  const value = useMemo(() => ({ mode, scheme, setMode }), [mode, scheme, setMode]);
  return createElement(ThemeCtx.Provider, { value }, children);
}

export function useThemeMode() {
  const c = useContext(ThemeCtx);
  const sys = useColorScheme() === "dark" ? "dark" : "light";
  return c ?? { mode: "system" as ThemeMode, scheme: sys as "light" | "dark", setMode: () => undefined };
}
export const useTheme = (): Theme => (useThemeMode().scheme === "dark" ? dark : light);

// Accessibility: large text, big touch targets (PRD 7.3: min 18sp)
export const FONT = { body: 18, small: 15, title: 24, big: 28 };
/** Heading and number font (Baloo 2). Loaded in App; until then the system font is used. */
export const HEAD = "Baloo2_700Bold";
