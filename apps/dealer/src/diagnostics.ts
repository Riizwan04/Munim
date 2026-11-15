import { Platform } from "react-native";

/**
 * Field-test diagnostics: a small in-memory log of problems (failed requests, crashes) and a plain-text report that can be
 * shared. It records WHAT happened (status codes, page paths, error names), never names, phone numbers or amounts.
 */
const MAX = 60;
const log: string[] = [];
export function note(kind: "net" | "http" | "error", msg: string) {
  log.push(`${new Date().toISOString().slice(11, 19)} ${kind} ${msg.slice(0, 160)}`);
  if (log.length > MAX) log.shift();
}
export const recent = (n = 15) => log.slice(-n);

let installed = false;
export function installGlobalHandlers() {
  if (installed) return;
  installed = true;
  if (Platform.OS === "web" && typeof window !== "undefined") {
    window.addEventListener("error", (e) => note("error", `${e.message ?? "error"} @${(e.filename ?? "").split("/").pop()}:${e.lineno ?? 0}`));
    window.addEventListener("unhandledrejection", (e) => note("error", `unhandled: ${String((e.reason as { message?: string })?.message ?? e.reason)}`));
  } else {
    const g = globalThis as unknown as { ErrorUtils?: { getGlobalHandler: () => (e: Error, fatal?: boolean) => void; setGlobalHandler: (f: (e: Error, fatal?: boolean) => void) => void } };
    const prev = g.ErrorUtils?.getGlobalHandler();
    g.ErrorUtils?.setGlobalHandler((e, fatal) => { note("error", `${fatal ? "FATAL " : ""}${e?.name}: ${e?.message}`); prev?.(e, fatal); });
  }
}

/** The path of a request without its query string (which can hold names or ids). */
export const safePath = (url: string) => { try { return new URL(url).pathname; } catch { return "?"; } };

export function report(a: { version: string; ui: string; asst: string; online: boolean; pending: number; failed: number }): string {
  const web = Platform.OS === "web" && typeof navigator !== "undefined";
  const lines = [
    "Munim diagnostics",
    `Version: ${a.version}`,
    `Platform: ${Platform.OS} ${String(Platform.Version ?? "")}`.trim(),
    web ? `Browser: ${navigator.userAgent}` : "",
    web && typeof window !== "undefined" ? `Screen: ${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio}` : "",
    web && "serviceWorker" in navigator ? `Installed app mode: ${window.matchMedia?.("(display-mode: standalone)").matches ? "yes (home screen)" : "no (browser tab)"}` : "",
    `Language: app ${a.ui}, assistant ${a.asst}`,
    `Online: ${a.online ? "yes" : "no"}`,
    `Entries waiting to upload: ${a.pending}, could not be saved: ${a.failed}`,
    "",
    "Recent problems:",
    ...(log.length ? log.slice(-20) : ["(none recorded)"]),
  ];
  return lines.filter((l, i) => l !== "" || i > 0).join("\n");
}
