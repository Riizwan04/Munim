// Supabase Edge Function: "understand" — turns a spoken/typed sentence into ParsedUtterance JSON using Claude.
// The model ONLY extracts; the app does every calculation (golden rule). NOT YET DEPLOYED / UNTESTED.
// Secrets needed: ANTHROPIC_API_KEY (set in Supabase → Edge Functions → Secrets). Optional: ANTHROPIC_MODEL.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

const SYSTEM = `You extract ledger entries from the spoken sentence of an Indian shop owner (Hindi, Marathi, English or a mix).
Return ONLY JSON: {"entries":[{"intent":"sale|payment|charge|discount|return","partyText":string?,"siteText":string?,
"items":[{"materialText":string,"quantity":number?,"unit":string?,"rate":number?}],"amount":number?,"paymentMode":"cash|upi|cheque|bank"?}],"language":"hi|mr|en"}.
Rules: NEVER calculate totals. NEVER invent a rate, quantity, party or site that was not spoken: omit the field instead.
Rates are rupees per unit. Convert number words (dedh=1.5, dhai=2.5, sava X=X+0.25, paune X=X-0.25, sadhe X=X+0.5, hazaar=1000, lakh=100000).
"X ko ... diya" with goods = sale; "X ne <amount> diya" = payment; "gaadi bhada <amount>" = charge; "<amount> kam" = discount; "wapas" = return.
Use the party/material names exactly as given in CONTEXT when the speaker clearly means them; otherwise copy the spoken word. Split several parties/entries into separate entries.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    // Only signed-in dealers may call this (protects your Anthropic credit).
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: u } = await sb.auth.getUser();
    if (!u.user) return new Response(JSON.stringify({ error: "not signed in" }), { status: 401, headers: CORS });

    const { text, parties, materials } = await req.json();
    if (typeof text !== "string" || text.length > 1000) return new Response(JSON.stringify({ error: "bad text" }), { status: 400, headers: CORS });
    const context = JSON.stringify({
      parties: (parties ?? []).slice(0, 300).map((p: any) => ({ name: p.name, nicknames: p.nicknames, sites: (p.sites ?? []).map((s: any) => s.name) })),
      materials: (materials ?? []).slice(0, 300).map((m: any) => ({ name: m.name, category: m.category, localNames: m.localNames, units: m.units })),
    });
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: Deno.env.get("ANTHROPIC_MODEL") ?? "claude-haiku-5-5", max_tokens: 800, system: SYSTEM,
        messages: [{ role: "user", content: `CONTEXT: ${context}\nSENTENCE: ${text}` }],
      }),
    });
    if (!r.ok) return new Response(JSON.stringify({ error: `model error ${r.status}` }), { status: 502, headers: CORS });
    const out = await r.json();
    const raw: string = out.content?.[0]?.text ?? "";
    const json = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
    if (!Array.isArray(json.entries)) throw new Error("no entries");
    return new Response(JSON.stringify(json), { headers: { ...CORS, "content-type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: CORS });
  }
});
