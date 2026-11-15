import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { checkSupabaseConfig } from "@munim/ledger-core";
import { note, safePath } from "./diagnostics";
import { setReachable } from "./offline/net";

const url = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? "").trim();
const key = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();

/** Empty when the app is configured correctly; otherwise what is wrong (shown on a setup screen instead of a cryptic browser error). */
export const configProblems = checkSupabaseConfig(url, key);

/** Every request reports whether the network answered, which is how the app knows it is online or offline. */
const trackedFetch: typeof fetch = async (input, init) => {
  const path = safePath(typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url);
  try { const r = await fetch(input, init); setReachable(true); if (r.status >= 400) note("http", `${r.status} ${path}`); return r; }
  catch (e) { setReachable(false); note("net", `request failed ${path}`); throw e; }
};

// With a bad value the client is still created (so imports work), but the app never uses it: App shows the setup screen.
export const supabase = createClient(configProblems.length ? "https://invalid.supabase.co" : url, configProblems.length ? "invalid-key-placeholder-value" : key, {
  global: { fetch: trackedFetch },
  auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});
