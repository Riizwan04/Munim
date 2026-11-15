// Supabase Edge Function: "ask" — lets the owner ask ANYTHING about their own books by voice or typing.
// It is a thin, stateless carrier for the AI: the app sends the conversation and the read-only TOOLS, this function adds the rules and calls Claude,
// and returns what Claude wants next (a tool call to run on the phone, or the final answer). The tools run ON THE PHONE against the owner's own data,
// so this function never sees the database and no other business's data can be reached. Only the question and tool results pass through.
// Secrets: ANTHROPIC_API_KEY (and optional ANTHROPIC_MODEL, default claude-haiku-5-5). Turn "Verify JWT" off (it checks the signed-in owner itself). NOT YET DEPLOYED.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, "content-type": "application/json" } });

const system = (a: { today: string; lang: string; name: string }) => `You are ${a.name}, the voice assistant of ONE small shop. You answer the owner's questions about THIS shop's own books, using ONLY the tools provided. Today is ${a.today}.
Rules
- Never guess or invent a number, date, customer or item. Every figure must come from a tool result. If the data does not contain the answer, say so plainly.
- The tools do all the arithmetic. Do not add or multiply yourself except to repeat or compare numbers the tools returned.
- When a customer is named, call find_party first; if several match, ask which one. Work out date ranges from today's date ("last month", "this week").
- You can only read. You cannot save, send, cancel or change anything. If asked to, say the owner does it with a tap in the app, and offer to prepare it.
- Only answer questions about this shop's books. For anything else, say politely that you can only help with the shop's accounts.
- Answer in ${a.lang === "en" ? "English" : a.lang === "hi" ? "Hindi (Devanagari script)" : "Marathi (Devanagari script)"}, in one to three short sentences that sound natural when spoken aloud. Write money as ₹ followed by digits (for example ₹12500). Write dates in words (12 November). Keep customer and item names exactly as the tools give them.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: u } = await sb.auth.getUser();
    if (!u.user) return json({ error: "not signed in" }, 401);

    const raw = await req.text();
    if (raw.length > 120_000) return json({ error: "too large" }, 413);
    const { tools, messages, lang, today, name } = JSON.parse(raw);
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > 16) return json({ error: "bad messages" }, 400);
    if (!Array.isArray(tools) || tools.length === 0 || tools.length > 12) return json({ error: "bad tools" }, 400);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(today))) return json({ error: "bad date" }, 400);

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: Deno.env.get("ANTHROPIC_MODEL") ?? "claude-haiku-5-5",
        max_tokens: 900,
        output_config: { effort: "low" },
        system: system({ today: String(today), lang: ["en", "hi", "mr"].includes(lang) ? lang : "en", name: String(name ?? "Munim").slice(0, 20) }),
        tools: tools.map((t: any) => ({ name: String(t.name), description: String(t.description).slice(0, 600), input_schema: t.input_schema })),
        tool_choice: { type: "auto" },
        messages,
      }),
    });
    if (!r.ok) return json({ error: `model error ${r.status}` }, 502);
    const out = await r.json();
    if (out.stop_reason === "refusal") return json({ error: "refused" }, 502);
    return json({ stop_reason: out.stop_reason, content: out.content });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
