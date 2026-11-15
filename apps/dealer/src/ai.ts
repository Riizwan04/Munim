import { sanitizeParsed, type ParsedUtterance, type UnderstandContext } from "@munim/ledger-core";
import { supabase } from "./supabase";

/**
 * Optional AI reading of a whole spoken sentence in one go (Supabase Edge Function "understand", Claude Haiku).
 * Off unless EXPO_PUBLIC_UNDERSTAND_FUNCTION=1. Anything wrong (no internet, not deployed, slow, nonsense) returns null and the
 * built-in rules read the sentence instead, so voice always works. After a failure it is not tried again for a few minutes.
 */
export const aiEnabled = () => process.env.EXPO_PUBLIC_UNDERSTAND_FUNCTION === "1";
let pausedUntil = 0;
const TIMEOUT_MS = 7000;

export async function understandRemote(text: string, ctx: UnderstandContext): Promise<ParsedUtterance | null> {
  if (!aiEnabled() || Date.now() < pausedUntil) return null;
  try {
    const call = supabase.functions.invoke("understand", { body: { text, parties: ctx.parties, materials: ctx.materials.filter((m) => !m.isNew) } });
    const r = await Promise.race([call, new Promise<null>((res) => setTimeout(() => res(null), TIMEOUT_MS))]);
    if (!r || r.error) { pausedUntil = Date.now() + 5 * 60_000; return null; }
    const parsed = sanitizeParsed(r.data);
    if (!parsed) return null;
    return parsed;
  } catch { pausedUntil = Date.now() + 5 * 60_000; return null; }
}
