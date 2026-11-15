/**
 * Checks the two public Supabase values the app is built with. A copied "…" or a stray space makes browsers fail with
 * "String contains non ISO-8859-1 code point", so we catch it up front and say what to fix.
 */
export type ConfigProblem = "missing_url" | "bad_url" | "missing_key" | "bad_key";
export function checkSupabaseConfig(url: string | undefined, key: string | undefined): ConfigProblem[] {
  const out: ConfigProblem[] = [];
  const u = url ?? "", k = key ?? "";
  if (!u.trim()) out.push("missing_url");
  else if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(u) && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(u)) out.push("bad_url");
  if (!k.trim()) out.push("missing_key");
  else if (/[^\x21-\x7E]/.test(k) || k.length < 20) out.push("bad_key"); // only visible ASCII, no spaces, no "…"
  return out;
}
export const isValidEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim());
