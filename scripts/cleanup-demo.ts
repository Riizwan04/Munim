/** Cancels any demo entry created after the seed (keeps the demo balance at the seeded value). */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
const env = (k: string) => process.env[k] ?? readFileSync(new URL("../.env", import.meta.url), "utf8").match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const db = createClient(env("EXPO_PUBLIC_SUPABASE_URL")!, env("EXPO_PUBLIC_SUPABASE_ANON_KEY")!, { auth: { persistSession: false } });
(async () => {
const { error } = await db.auth.signInWithPassword({ email: "demo.dealer@example.com", password: "Munim-demo-2026" });
if (error) throw error;
const { data } = await db.from("entries").select("id,entry_date,amount,status").eq("status", "active").gt("entry_date", "2026-11-11");
const today = new Date().toISOString().slice(0, 10);
for (const e of (data ?? []).filter((x) => x.entry_date === today)) {
  const r = await db.rpc("cancel_entry", { p_entry_id: e.id, p_reason: "demo cleanup" });
  console.log(e.id, r.error?.message ?? "cancelled");
}
console.log("done");
})().catch((e) => { console.error(e); process.exit(1); });
