// Supabase Edge Function: "notify-entry" — sends a push notification to the phones of ONE customer (party) who turned notifications on
// from their statement link. Called by the dealer app right after an entry is saved, edited or cancelled.
// The app composes the text with ledger-core (all numbers come from code); this function only delivers it.
// Secrets needed (Supabase → Edge Functions → Secrets): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (e.g. mailto:you@example.com).
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided automatically. NOT YET DEPLOYED.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    // Only a signed-in dealer may call this, and only for a customer of their own business (row security decides).
    const me = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: u } = await me.auth.getUser();
    if (!u.user) return json({ error: "not signed in" }, 401);

    const { party_id, title, body } = await req.json();
    if (typeof party_id !== "string" || typeof title !== "string" || typeof body !== "string" || title.length > 120 || body.length > 300) return json({ error: "bad request" }, 400);
    const { data: party } = await me.from("parties").select("id").eq("id", party_id).maybeSingle();
    if (!party) return json({ error: "unknown party" }, 403);

    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: subs } = await admin.from("push_subscriptions").select("id,endpoint,p256dh,auth,statement_links!inner(revoked_at)").eq("party_id", party_id);
    const live = (subs ?? []).filter((s: any) => !s.statement_links?.revoked_at);
    if (!live.length) return json({ sent: 0 });

    webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com", Deno.env.get("VAPID_PUBLIC_KEY")!, Deno.env.get("VAPID_PRIVATE_KEY")!);
    let sent = 0; const dead: string[] = [];
    await Promise.all(live.map(async (s: any) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ title, body }), { TTL: 60 * 60 * 24 });
        sent++;
      } catch (e: any) { if (e?.statusCode === 404 || e?.statusCode === 410) dead.push(s.id); }
    }));
    if (dead.length) await admin.from("push_subscriptions").delete().in("id", dead);
    if (sent) await admin.from("push_subscriptions").update({ last_sent_at: new Date().toISOString() }).in("id", live.map((s: any) => s.id));
    return json({ sent, removed: dead.length });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
