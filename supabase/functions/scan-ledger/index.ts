// Supabase Edge Function "scan-ledger": reads a photo of a handwritten khata page with Claude (vision) and returns ScannedPage JSON.
// The app never trusts it blindly: every number is re-checked against the balances written on the page and the dealer reviews
// all rows before anything is saved. NOT YET DEPLOYED / UNTESTED. Secrets: ANTHROPIC_API_KEY (Supabase → Edge Functions → Secrets).
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const SYSTEM = `You read photos of handwritten shop ledger pages (khata) from India. One page belongs to one customer.
Typical layout: customer name at the top; columns Date, Item, Qty, Amount, Site; rows for goods given (item, quantity with unit like "80 Bag", amount), payments (word like "online", "cash", "paid"), and running "Balance" / "Total" lines.
Return ONLY JSON: {"partyName":string?,"openingBalance":number?,"rows":[{"date":"dd-mm or yyyy-mm-dd","kind":"sale|payment|charge|discount|return","item":string?,"qty":number?,"unit":string?,"rate":number?,"amount":number,"site":string?,"mode":"cash|upi|cheque|bank"?}],"balances":[{"afterRow":number,"balance":number}],"total":number?,"year":number?}
Rules: copy numbers exactly as written; never guess or fix a number. Omit a field you cannot read. openingBalance = the balance written at the top before the first entry.
Do not make rows for "Balance"/"Total" lines: put them in "balances" (afterRow = 0-based index of the last row above that written balance) and "total" (the final total at the bottom).
"online"/"UPI"/"GPay" => mode upi. Amounts are rupees. If a row has no item and looks like money received, kind is payment.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: u } = await sb.auth.getUser();
    if (!u.user) return new Response(JSON.stringify({ error: "not signed in" }), { status: 401, headers: CORS });
    const { image, mime } = await req.json();
    if (typeof image !== "string" || image.length > 7_000_000) return new Response(JSON.stringify({ error: "bad image" }), { status: 400, headers: CORS });
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: Deno.env.get("ANTHROPIC_VISION_MODEL") ?? "claude-sonnet-5-5", max_tokens: 4000, system: SYSTEM,
        messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: mime ?? "image/jpeg", data: image } }, { type: "text", text: "Read this page." }] }],
      }),
    });
    if (!r.ok) return new Response(JSON.stringify({ error: `model error ${r.status}` }), { status: 502, headers: CORS });
    const out = await r.json();
    const raw: string = out.content?.[0]?.text ?? "";
    JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)); // must be JSON
    return new Response(raw, { headers: { ...CORS, "content-type": "text/plain" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: CORS });
  }
});
