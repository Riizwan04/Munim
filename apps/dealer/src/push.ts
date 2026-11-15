import { Platform } from "react-native";
import { subscribePush, unsubscribePush } from "./data";

/**
 * Customer-side notifications (web push). Free: no app store, no SMS. The customer opens their statement link, taps "Get notifications",
 * and the browser gives this page a private address the shop's server can send to. iPhone only allows this after "Add to Home Screen".
 */
const VAPID = (process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY ?? "").trim();

export type PushState = "unsupported" | "needs-install" | "denied" | "off" | "on";

const isWeb = () => Platform.OS === "web" && typeof window !== "undefined" && typeof navigator !== "undefined";
const isIOS = () => isWeb() && /iPad|iPhone|iPod/.test(navigator.userAgent);
const isStandalone = () => isWeb() && (window.matchMedia?.("(display-mode: standalone)").matches || (navigator as any).standalone === true);

export const pushAvailable = (): boolean => isWeb() && !!VAPID && "serviceWorker" in navigator;

export async function pushState(): Promise<PushState> {
  if (!pushAvailable()) return "unsupported";
  if (isIOS() && !isStandalone()) return "needs-install";
  if (!("PushManager" in window) || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  try {
    const reg = await navigator.serviceWorker.ready;
    return (await reg.pushManager.getSubscription()) ? "on" : "off";
  } catch { return "off"; }
}

const b64 = (s: string) => { const p = "=".repeat((4 - (s.length % 4)) % 4); const r = atob((s + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(r, (c) => c.charCodeAt(0)); };
const key = (sub: PushSubscription, n: "p256dh" | "auth") => { const k = sub.getKey(n); return k ? btoa(String.fromCharCode(...new Uint8Array(k))) : ""; };

/** The notification tap needs to know which statement to open: keep the link where the service worker can read it. */
async function rememberLink() {
  try { const c = await caches.open("meta-stmt"); await c.put("/__stmt", new Response(window.location.href)); } catch { /* ok */ }
}

export async function enablePush(token: string, pin: string): Promise<"on" | "denied" | "error"> {
  try {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return "denied";
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(VAPID) }));
    const r = await subscribePush(token, pin, sub.endpoint, key(sub, "p256dh"), key(sub, "auth"));
    if ((r as { error?: string }).error) return "error";
    await rememberLink();
    return "on";
  } catch { return "error"; }
}

export async function disablePush(token: string): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) { await unsubscribePush(token, sub.endpoint).catch(() => undefined); await sub.unsubscribe(); }
  } catch { /* ok */ }
}

/** "Add to Home Screen" from the statement page should open THIS customer's statement, with the shop's name, not the shop owner's app. */
export function brandInstallManifest(businessName: string) {
  if (!isWeb()) return;
  try {
    const abs = (p: string) => new URL(p, window.location.origin).href;
    const m = {
      name: businessName, short_name: businessName.slice(0, 12), start_url: window.location.href, scope: `${window.location.origin}/`, display: "standalone",
      background_color: "#f3ecdc", theme_color: "#1b2a6b",
      icons: [{ src: abs("/icon-192.png"), sizes: "192x192", type: "image/png" }, { src: abs("/icon-512.png"), sizes: "512x512", type: "image/png" }],
    };
    const href = URL.createObjectURL(new Blob([JSON.stringify(m)], { type: "application/manifest+json" }));
    let l = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (!l) { l = document.createElement("link"); l.rel = "manifest"; document.head.appendChild(l); }
    l.href = href;
    const t = document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]'); if (t) t.content = businessName.slice(0, 20);
  } catch { /* ok */ }
}
