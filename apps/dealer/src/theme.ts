import { useColorScheme } from "react-native";

const light = {
  bg: "#f6f7f4", surface: "#ffffff", fg: "#1d2433", muted: "#5d6678", line: "#d5d9cf", rule: "#e6e9e1",
  ink: "#1f3a8a", due: "#b3261e", paid: "#1b7a3a", paidBg: "#e4f3e8", accent: "#1f3a8a", accentFg: "#ffffff",
};
const dark: typeof light = {
  bg: "#12151c", surface: "#1b2029", fg: "#e8ebf2", muted: "#9aa3b5", line: "#343b4a", rule: "#2a3140",
  ink: "#9db4ff", due: "#ff8a80", paid: "#6fd58c", paidBg: "#17301f", accent: "#9db4ff", accentFg: "#12151c",
};
export type Theme = typeof light;
export const useTheme = (): Theme => (useColorScheme() === "dark" ? dark : light);
// Accessibility: large text, big touch targets (PRD 7.3: min 18sp)
export const FONT = { body: 18, small: 15, title: 24, big: 28 };
