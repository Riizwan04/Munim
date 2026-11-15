import { ASK_TOOLS, runAskTool, type AskData, type SpeakLang } from "@munim/ledger-core";
import { supabase } from "./supabase";

/**
 * "Ask anything about my business": the AI (Supabase function "ask") chooses read-only tools, they are run HERE on the owner's own data
 * (ledger-core, all arithmetic by code), and the AI words the answer. Needs the same switch as the AI reader (EXPO_PUBLIC_UNDERSTAND_FUNCTION=1)
 * and the "ask" function deployed. Any failure returns null so the assistant says it cannot reach its reader.
 */
export const askEnabled = () => process.env.EXPO_PUBLIC_UNDERSTAND_FUNCTION === "1";
const MAX_ROUNDS = 5;
const TIMEOUT_MS = 15000;

type Block = { type: string; id?: string; name?: string; input?: Record<string, unknown>; text?: string; tool_use_id?: string; content?: string };
type Msg = { role: "user" | "assistant"; content: string | Block[] };

export async function askRemote(question: string, data: AskData, o: { lang: SpeakLang; name: string }): Promise<string | null> {
  if (!askEnabled()) return null;
  const messages: Msg[] = [{ role: "user", content: question }];
  const deadline = Date.now() + TIMEOUT_MS * 2;
  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const call = supabase.functions.invoke("ask", { body: { tools: ASK_TOOLS, messages, lang: o.lang, today: data.today, name: o.name } });
      const r = await Promise.race([call, new Promise<null>((res) => setTimeout(() => res(null), TIMEOUT_MS))]);
      if (!r || r.error || !r.data || Date.now() > deadline) return null;
      const content: Block[] = Array.isArray(r.data.content) ? r.data.content : [];
      const uses = content.filter((b) => b.type === "tool_use");
      if (r.data.stop_reason === "tool_use" && uses.length) {
        messages.push({ role: "assistant", content });
        messages.push({ role: "user", content: uses.map((u) => ({ type: "tool_result", tool_use_id: u.id!, content: JSON.stringify(safe(() => runAskTool(u.name!, (u.input ?? {}) as Record<string, any>, data))) })) });
        continue;
      }
      const text = content.filter((b) => b.type === "text").map((b) => b.text ?? "").join(" ").trim();
      return text || null;
    }
    return null;
  } catch { return null; }
}
const safe = (f: () => unknown) => { try { return f(); } catch (e) { return { error: String((e as Error).message ?? e) }; } };
