import NetInfo from "@react-native-community/netinfo";
import { useSyncExternalStore } from "react";
import { Platform } from "react-native";

/**
 * Are we online? The truth is the last real request: every request goes through trackedFetch (see supabase.ts), which
 * calls setReachable. The phone's own network status (NetInfo) is only a hint that triggers a try.
 */
let reachable = true;
const subs = new Set<() => void>();
const regained = new Set<() => void>();
export const getReachable = () => reachable;
export function setReachable(v: boolean) {
  if (v === reachable) return;
  reachable = v;
  subs.forEach((f) => f());
  if (v) regained.forEach((f) => f());
}
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const onRegained = (f: () => void) => { regained.add(f); return () => { regained.delete(f); }; };
export const useReachable = () => useSyncExternalStore(subscribe, getReachable, getReachable);

let watching = false;
export function startNetWatch(onHint: () => void) {
  if (watching) return;
  watching = true;
  if (Platform.OS === "web" && typeof window !== "undefined") {
    window.addEventListener("online", onHint);
    window.addEventListener("offline", () => setReachable(false));
  }
  NetInfo.addEventListener((s) => {
    if (s.isConnected === false) setReachable(false);
    else if (s.isConnected) onHint(); // connected again: try to upload; a successful request flips us back to online
  });
}
