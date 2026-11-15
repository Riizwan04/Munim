// Supabase Edge Function: "understand" — turns a spoken/typed sentence into ParsedUtterance JSON using Claude (Haiku 5.5 by default).
// The model ONLY extracts words and numbers; the app does every calculation (golden rule) and the owner taps Save.
// Secrets (Supabase → Edge Functions → Secrets): ANTHROPIC_API_KEY. Optional: ANTHROPIC_MODEL (default claude-haiku-5-5).
// Turn "Verify JWT" off for this function (it checks the signed-in shop owner itself). NOT YET DEPLOYED.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, "content-type": "application/json" } });

const SYSTEM = `You read ONE spoken sentence (or a few) from an Indian shop owner who is recording sales and payments in his ledger. The sentence may be Hindi, Marathi, English or a mix, often typed by a speech recogniser, so words may be spelled in Devanagari or in English letters, and English words may appear in Devanagari (e.g. "थ्री नाइंटी" = 390).
Return ONLY the JSON that matches the schema. Extract; NEVER calculate totals; NEVER invent a party, item, quantity or rate that was not said (use null instead).

Rules
- intent: "sale" = goods given to a party; "return" = goods taken back (wapas/parat/return); "payment" = money received from a party ("X ne <amount> diya", "mila", cash/UPI/cheque/bank); "charge" = transport/other cost (bhada, gaadi, freight); "discount" = a reduction (chhoot, kam, discount).
- ALL names (partyText, siteText, materialText) must be written in English letters (Roman script), never Devanagari. Examples: "एसीसी सीमेंट" -> "ACC cement", "रमेश" -> "Ramesh". If a spoken name clearly means a party / site / item listed in CONTEXT, copy that exact spelling from CONTEXT. Otherwise write the spoken name in English letters, e.g. a brand the shop has not listed yet ("ACC cement") — that is allowed and expected.
- items[].materialText: the item name only (brand + type), without the quantity, unit or rate. quantity is a number. unit is one of: bag, nos, kg, mtr, ltr, butti, brass, trolley, ton, box, pkt, dozen (bori/goni/gonya/bag = bag; piece/pcs/nang = nos). rate = rupees PER UNIT (bhav / rate / "390 ka"); it is not the line total.
- Numbers: convert number words from any language to digits (das=10, teen sau nabbe=390, dedh=1.5, dhai=2.5, sava X=X+0.25, paune X=X-0.25, sadhe X=X+0.5, hazaar=1000, lakh=100000). A digit said inside a Hindi sentence ("das cement bag 390 ka") is the rate or quantity as written.
- A payment or discount or charge has amount (rupees) and, for payment, paymentMode: cash, upi, cheque or bank (null if not said).
- Several parties or entries in one sentence are separate entries. If a later entry has no party said, leave partyText null (the app reuses the previous one).
- siteText: the construction site/location said after the party, if any (e.g. "Moira site").
- language: the main language of the sentence: "hi", "mr" or "en".`;

const NUM = { type: ["number", "null"] };
const STR = { type: ["string", "null"] };
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["entries", "language"],
  properties: {
    language: { type: "string", enum: ["hi", "mr", "en"] },
    entries: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["intent", "partyText", "siteText", "items", "amount", "paymentMode"],
        properties: {
          intent: { type: "string", enum: ["sale", "payment", "charge", "discount", "return"] },
          partyText: STR,
          siteText: STR,
          amount: NUM,
          paymentMode: { type: ["string", "null"], enum: ["cash", "upi", "cheque", "bank", null] },
          items: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["materialText", "quantity", "unit", "rate"],
              properties: { materialText: { type: "string" }, quantity: NUM, unit: STR, rate: NUM },
            },
          },
        },
      },
    },
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    // Only signed-in shop owners may call this (protects your Anthropic credit).
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: u } = await sb.auth.getUser();
    if (!u.user) return json({ error: "not signed in" }, 401);

    const { text, parties, materials } = await req.json();
    if (typeof text !== "string" || !text.trim() || text.length > 1000) return json({ error: "bad text" }, 400);
    const context = JSON.stringify({
      parties: (parties ?? []).slice(0, 400).map((p: any) => ({ name: p.name, nicknames: p.nicknames, sites: (p.sites ?? []).map((s: any) => s.name) })),
      materials: (materials ?? []).slice(0, 600).map((m: any) => ({ name: m.name, category: m.category, localNames: m.localNames, units: m.units })),
    });

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: Deno.env.get("ANTHROPIC_MODEL") ?? "claude-haiku-5-5",
        max_tokens: 1500,
        // a short extraction: low effort keeps it fast and cheap
        output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
        system: SYSTEM,
        messages: [{ role: "user", content: `CONTEXT (the shop's saved parties and items): ${context}\n\nSENTENCE: ${text}` }],
      }),
    });
    if (!r.ok) return json({ error: `model error ${r.status}` }, 502);
    const out = await r.json();
    if (out.stop_reason === "refusal") return json({ error: "refused" }, 502);
    const raw: string = (out.content ?? []).find((b: any) => b.type === "text")?.text ?? "";
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.entries)) throw new Error("no entries");
    return json(parsed);
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
