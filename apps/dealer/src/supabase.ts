import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { checkSupabaseConfig } from "@munim/ledger-core";

const url = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? "").trim();
const key = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();

/** Empty when the app is configured correctly; otherwise what is wrong (shown on a setup screen instead of a cryptic browser error). */
export const configProblems = checkSupabaseConfig(url, key);

// With a bad value the client is still created (so imports work), but the app never uses it: App shows the setup screen.
export const supabase = createClient(configProblems.length ? "https://invalid.supabase.co" : url, configProblems.length ? "invalid-key-placeholder-value" : key, {
  auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});
