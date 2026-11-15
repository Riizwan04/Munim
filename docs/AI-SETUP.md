# Step 19 — AI understanding of whole sentences (Claude Haiku 5.5)

The free built-in rules read a sentence by fixed patterns, so they ask for the unit, then the rate, one by one. With this switched on, the
**whole sentence is read in one go** ("रमेश को दस ACC सीमेंट बोरी तीन सौ नब्बे का" → party, item, 10 bag, ₹390), names come back in English letters, and Munim only asks about what is truly missing.
The AI only extracts words and numbers. **Every calculation is still done by code, and nothing is saved until you tap Save.** If the AI is off, slow, offline or confused, the built-in rules read the sentence instead.

## Cost (Anthropic list price, checked Nov 2026)
Haiku 5.5: $0.10 per million input tokens, $0.50 per million output. One sentence ≈ 3,000 tokens in + 200 out ≈ $0.0004 (≈ ₹0.035).
100 entries a day for 30 days ≈ $1.2 ≈ **₹100 a month**. (Sonnet 5.5 is about 20× that.) Set a monthly spend cap so it can never run away.

## One-time setup (you do the money/secret parts)
1. **Account.** https://console.anthropic.com → sign up → add a payment method.
2. **Spend cap.** Console → Settings → Limits → set a monthly limit (e.g. $10).
3. **API key.** Console → API keys → Create key. Copy it once. Never paste it in chat or commit it.
4. **Supabase secret.** Supabase → Edge Functions → **Secrets** → add `ANTHROPIC_API_KEY` = the key.
5. **Function.** Supabase → Edge Functions → open `understand` (or deploy a new function named exactly `understand`) → paste `supabase/functions/understand/index.ts` → Deploy.
   Turn **"Verify JWT with legacy secret" off** (the function checks the signed-in shop owner itself).
6. **App switch.** Vercel → Environment Variables → `EXPO_PUBLIC_UNDERSTAND_FUNCTION` = `1` → redeploy.

To use a different model later, add the secret `ANTHROPIC_MODEL` (e.g. `claude-sonnet-5-5`); no code change.

## Check it works
Open Talk and say a normal sentence in one go, e.g. "Ramesh ko das ACC cement bori teen sau nabbe ka". You should go straight to the card, with a NEW ITEM tag if ACC cement is not in the list.
If the card still asks for the unit and rate separately, the AI is not reachable: look at Supabase → Edge Functions → `understand` → Logs.

## Also deploy `ask` (answers any question about your own books)
Supabase → Edge Functions → deploy a new function named exactly `ask` → paste `supabase/functions/ask/index.ts`; "Verify JWT with legacy secret" off. It uses the same `ANTHROPIC_API_KEY` secret. The same Vercel switch (`EXPO_PUBLIC_UNDERSTAND_FUNCTION=1`) enables it. See docs/ASSISTANT.md.

## Also run migration 0008 (assistant name)
Supabase SQL editor → run `supabase/migrations/0008_assistant_name.sql`. Until then the name is kept on each phone only.
