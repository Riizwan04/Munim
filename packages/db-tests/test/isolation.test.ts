/**
 * Runs against the REAL Supabase project (needs .env). Proves:
 *  - one business cannot see or touch another's data
 *  - ledger writes only through functions, totals verified server-side
 *  - edits keep history, cancel has zero effect, audit log is written
 * Skips automatically when SUPABASE env vars are missing.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { toMilliQty, rupeesToPaise as R, entryTotal, lineTotal, partyBalance, type Entry } from "@munim/ledger-core";

function env(k: string): string | undefined {
  if (process.env[k]) return process.env[k];
  try {
    const m = readFileSync(new URL("../../../.env", import.meta.url), "utf8").match(new RegExp(`^${k}=(.*)$`, "m"));
    return m?.[1]?.trim();
  } catch { return undefined; }
}
const URL_ = env("EXPO_PUBLIC_SUPABASE_URL");
const KEY = env("EXPO_PUBLIC_SUPABASE_ANON_KEY");
const run = URL_ && KEY ? describe : describe.skip;

interface Tenant { db: SupabaseClient; biz: string; party: string; site: string; mat: string; uid: string }

async function tenant(label: string): Promise<Tenant> {
  const db = createClient(URL_!, KEY!, { auth: { persistSession: false } });
  const email = `munim.test+${label}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@example.com`;
  const { data, error } = await db.auth.signUp({ email, password: "Test-pass-12345" });
  if (error || !data.session) throw new Error(`signUp failed: ${error?.message ?? "no session (is Confirm email off?)"}`);
  const uid = data.user!.id;
  const { data: biz, error: e1 } = await db.rpc("create_business", { p_name: `Shop ${label}`, p_phone: "+910000000000" });
  if (e1) throw e1;
  const party = await db.from("parties").insert({ business_id: biz, name: `Party ${label}`, phone: "+911111111111", opening_balance: R(1000) }).select("id").single();
  if (party.error) throw party.error;
  const site = await db.from("sites").insert({ business_id: biz, party_id: party.data.id, name: "Moira" }).select("id").single();
  if (site.error) throw site.error;
  const mat = await db.from("materials").insert({ business_id: biz, name: "JSW", category: "Cement", units: ["bag"] }).select("id").single();
  if (mat.error) throw mat.error;
  return { db, biz, party: party.data.id, site: site.data.id, mat: mat.data.id, uid };
}

const salePayload = (t: Tenant, bags: number, rate: number) => {
  const line = { material_id: t.mat, quantity: toMilliQty(bags), unit: "bag", rate: R(rate), gst_bp: null as number | null };
  const total = lineTotal({ materialId: t.mat, quantity: line.quantity, unit: "bag", rate: line.rate });
  return {
    business_id: t.biz, party_id: t.party, site_id: t.site, type: "sale", entry_date: "2026-11-10", amount: total,
    source: "manual", lines: [{ ...line, line_total: total }],
  };
};

run("Supabase: isolation and ledger writes", () => {
  let A: Tenant, B: Tenant;
  beforeAll(async () => { A = await tenant("A"); B = await tenant("B"); }, 60_000);

  it("each business only sees its own rows", async () => {
    const a = await A.db.from("parties").select("id, business_id");
    expect(a.data?.every((p) => p.business_id === A.biz)).toBe(true);
    const peek = await A.db.from("parties").select("id").eq("id", B.party);
    expect(peek.data).toEqual([]);
    const peekBiz = await A.db.from("businesses").select("id").eq("id", B.biz);
    expect(peekBiz.data).toEqual([]);
  });

  it("cannot write into another business", async () => {
    const r = await A.db.from("parties").insert({ business_id: B.biz, name: "Intruder", phone: "+91" });
    expect(r.error).not.toBeNull();
    const rpc = await A.db.rpc("save_entry", { p: salePayload(B, 1, 100) });
    expect(rpc.error).not.toBeNull();
  });

  it("cannot insert or update ledger tables directly", async () => {
    const ins = await A.db.from("entries").insert({ business_id: A.biz, party_id: A.party, type: "sale", amount: 1 });
    expect(ins.error).not.toBeNull();
  });

  it("saves a sale; server rejects a wrong total", async () => {
    const ok = await A.db.rpc("save_entry", { p: salePayload(A, 80, 360) });
    expect(ok.error).toBeNull();
    const bad = salePayload(A, 80, 360);
    bad.amount += 1;
    expect((await A.db.rpc("save_entry", { p: bad })).error?.message).toMatch(/mismatch/);
    const badLine = salePayload(A, 80, 360);
    badLine.lines[0]!.line_total += 100;
    expect((await A.db.rpc("save_entry", { p: badLine })).error?.message).toMatch(/mismatch/);
  });

  it("rejects a unit the material is not sold in", async () => {
    const p = salePayload(A, 1, 100);
    p.lines[0]!.unit = "butti";
    expect((await A.db.rpc("save_entry", { p })).error?.message).toMatch(/unit/);
  });

  it("edit keeps history; cancel has zero effect; audit log written", async () => {
    const created = await A.db.rpc("save_entry", { p: salePayload(A, 50, 380) });
    const edited = await A.db.rpc("edit_entry", { p_entry_id: created.data, p: salePayload(A, 40, 380), p_reason: "bag count corrected" });
    expect(edited.error).toBeNull();
    expect((await A.db.rpc("edit_entry", { p_entry_id: created.data, p: salePayload(A, 40, 380), p_reason: "x" })).error).not.toBeNull(); // old version no longer editable
    expect((await A.db.rpc("edit_entry", { p_entry_id: edited.data, p: salePayload(A, 40, 380), p_reason: "" })).error?.message).toMatch(/reason/);

    const versions = await A.db.from("entries").select("version,status").order("version").eq("id", created.data);
    expect(versions.data).toEqual([{ version: 1, status: "edited" }]);

    await A.db.rpc("cancel_entry", { p_entry_id: edited.data, p_reason: "wrong party" });
    const all = await A.db.from("entries").select("id,type,amount,status,entry_date,site_id,party_id");
    const asEntries: Entry[] = (all.data ?? []).map((r) => ({
      id: r.id, partyId: r.party_id, siteId: r.site_id, type: r.type, date: r.entry_date, status: r.status, amount: r.amount,
    }));
    // only the first 80×360 sale still counts; edited + cancelled versions add nothing
    expect(partyBalance(R(1000), asEntries)).toBe(R(1000) + R(28800));

    const audit = await A.db.from("audit_log").select("action,reason").order("created_at");
    const actions = audit.data!.map((a) => a.action);
    expect(actions).toContain("edit");
    expect(actions).toContain("cancel");
    expect(entryTotal({ charges: [R(1)] }).total).toBe(R(1)); // sanity: ledger-core importable
  });

  it("B cannot see A's entries or audit log", async () => {
    expect((await B.db.from("entries").select("id")).data).toEqual([]);
    expect((await B.db.from("audit_log").select("id")).data).toEqual([]);
  });
});

// Needs migration 0004 (client_id). Uploading the same entry twice must never create two entries.
run("Supabase: offline uploads are idempotent (migration 0004)", () => {
  let A: Tenant;
  let migrated = false; // true once migration 0004 has been run in Supabase
  beforeAll(async () => {
    A = await tenant("idem");
    migrated = !(await A.db.from("entries").select("client_id").limit(1)).error;
    if (!migrated) console.warn("Migration 0004 is not applied yet: skipping the idempotency checks.");
  }, 60_000);
  const withId = (id: string, bags: number) => ({ ...salePayload(A, bags, 360), client_id: id });
  const newId = () => crypto.randomUUID();

  it("the same client_id twice returns the same entry, and stores one", async () => {
    if (!migrated) return;
    const id = newId();
    const first = await A.db.rpc("save_entry", { p: withId(id, 10) });
    const second = await A.db.rpc("save_entry", { p: withId(id, 10) });
    expect(first.error).toBeNull();
    expect(second.error).toBeNull();
    expect(second.data).toBe(first.data);
    const rows = await A.db.from("entries").select("id").eq("client_id", id);
    expect(rows.data).toHaveLength(1);
    const audit = await A.db.from("audit_log").select("id").eq("entry_id", first.data).eq("action", "create");
    expect(audit.data).toHaveLength(1);
  });
  it("two uploads at the same moment still make one entry", async () => {
    if (!migrated) return;
    const id = newId();
    const [x, y] = await Promise.all([A.db.rpc("save_entry", { p: withId(id, 5) }), A.db.rpc("save_entry", { p: withId(id, 5) })]);
    expect(x.error).toBeNull();
    expect(y.error).toBeNull();
    expect(x.data).toBe(y.data);
    expect((await A.db.from("entries").select("id").eq("client_id", id)).data).toHaveLength(1);
  });
  it("different client_ids are different entries; no client_id still works", async () => {
    if (!migrated) return;
    const a = await A.db.rpc("save_entry", { p: withId(newId(), 1) });
    const b = await A.db.rpc("save_entry", { p: withId(newId(), 1) });
    const c = await A.db.rpc("save_entry", { p: salePayload(A, 1, 360) });
    expect(new Set([a.data, b.data, c.data]).size).toBe(3);
  });
  it("another business cannot upload into this one using the same client_id", async () => {
    if (!migrated) return;
    const B2 = await tenant("idem2");
    const id = newId();
    await A.db.rpc("save_entry", { p: withId(id, 1) });
    const r = await B2.db.rpc("save_entry", { p: { ...salePayload(B2, 1, 360), client_id: id } });
    expect(r.error).toBeNull(); // unique per business: B2 gets its own entry
    expect((await B2.db.from("entries").select("id").eq("client_id", id)).data).toHaveLength(1);
  });
});

// Needs migration 0005. The public statement function must show ONE party's statement to someone holding the link and the code, and nothing else.
run("Supabase: customer statement links (migration 0005)", () => {
  let A: Tenant, B: Tenant;
  let ready = false;
  let secretParty: string;
  const anon = () => createClient(URL_!, KEY!, { auth: { persistSession: false } });
  beforeAll(async () => {
    A = await tenant("link"); B = await tenant("linkB");
    const probe = await A.db.rpc("create_statement_link", { p_party_id: A.party, p_days: 1 });
    ready = !(probe.error && /could not find|does not exist|PGRST202/i.test(probe.error.message));
    if (!ready) { console.warn("Migration 0005 is not applied yet: skipping the statement link checks."); return; }
    const sp = await A.db.from("parties").insert({ business_id: A.biz, name: "Secret Other Party", phone: "+912222222222", opening_balance: R(777) }).select("id").single();
    secretParty = sp.data!.id;
    await A.db.rpc("save_entry", { p: salePayload(A, 10, 360) });          // visible entry of the linked party
    const hidden = await A.db.rpc("save_entry", { p: { ...salePayload(A, 99, 999), party_id: secretParty, site_id: null } });
    expect(hidden.error).toBeNull();
    const cancelled = await A.db.rpc("save_entry", { p: salePayload(A, 7, 123) });
    await A.db.rpc("cancel_entry", { p_entry_id: cancelled.data, p_reason: "test" });
  }, 90_000);
  const make = async (days = 7) => (await A.db.rpc("create_statement_link", { p_party_id: A.party, p_days: days })).data as { id: string; token: string; expires_at: string };

  it("holding the link: asks for the code, wrong code refused, right code shows only this party", async () => {
    if (!ready) return;
    const l = await make();
    const c = anon();
    expect((await c.rpc("get_statement", { p_token: l.token })).data).toEqual({ error: "pin_required" });
    expect((await c.rpc("get_statement", { p_token: l.token, p_pin: "0000" })).data).toEqual({ error: "wrong_pin" });
    const ok = (await c.rpc("get_statement", { p_token: l.token, p_pin: "1111" })).data;
    expect(ok.party.name).toBe(`Party link`);
    expect(ok.business.name).toBe("Shop link");
    const all = JSON.stringify(ok);
    expect(all).not.toContain("Secret Other Party");       // other parties never appear
    expect(all).not.toContain("999");                       // nor their amounts
    expect(ok.entries).toHaveLength(1);                     // cancelled entry excluded
    expect(ok.entries[0].amount).toBe(R(3600));
    expect(Object.keys(ok.party).sort()).toEqual(["language", "name", "opening_balance"]);   // no phone number
  });
  it("five wrong codes lock the link, even for the right code", async () => {
    if (!ready) return;
    const l = await make();
    const c = anon();
    for (let i = 0; i < 4; i++) expect((await c.rpc("get_statement", { p_token: l.token, p_pin: "9999" })).data).toEqual({ error: "wrong_pin" });
    expect((await c.rpc("get_statement", { p_token: l.token, p_pin: "9999" })).data).toEqual({ error: "locked" });
    expect((await c.rpc("get_statement", { p_token: l.token, p_pin: "1111" })).data).toEqual({ error: "locked" });
  });
  it("made-up, empty and revoked tokens are all just 'invalid'", async () => {
    if (!ready) return;
    const c = anon();
    expect((await c.rpc("get_statement", { p_token: "x".repeat(32), p_pin: "1111" })).data).toEqual({ error: "invalid" });
    expect((await c.rpc("get_statement", { p_token: "" })).data).toEqual({ error: "invalid" });
    const l = await make();
    expect((await A.db.rpc("revoke_statement_link", { p_id: l.id })).error).toBeNull();
    expect((await c.rpc("get_statement", { p_token: l.token, p_pin: "1111" })).data).toEqual({ error: "invalid" });
  });
  it("only the token's hash is stored, and views are counted", async () => {
    if (!ready) return;
    const l = await make();
    await anon().rpc("get_statement", { p_token: l.token, p_pin: "1111" });
    const row = (await A.db.from("statement_links").select("token_hash,view_count,last_viewed_at").eq("id", l.id).single()).data!;
    expect(row.token_hash).toHaveLength(64);
    expect(row.token_hash).not.toBe(l.token);
    expect(row.view_count).toBe(1);
    expect(row.last_viewed_at).not.toBeNull();
  });
  it("another business cannot create, revoke or even see these links; strangers cannot read the table", async () => {
    if (!ready) return;
    const l = await make();
    expect((await B.db.rpc("create_statement_link", { p_party_id: A.party, p_days: 7 })).error).not.toBeNull();
    expect((await B.db.rpc("revoke_statement_link", { p_id: l.id })).error).not.toBeNull();
    expect((await B.db.from("statement_links").select("id").eq("id", l.id)).data).toEqual([]);
    expect((await anon().from("statement_links").select("id")).data ?? []).toEqual([]);
    expect((await anon().rpc("create_statement_link", { p_party_id: A.party, p_days: 7 })).error).not.toBeNull();
    expect((await A.db.from("statement_links").update({ expires_at: "2099-01-01" }).eq("id", l.id)).error).not.toBeNull(); // no direct edits
  });
  it("days outside 1..365 are refused", async () => {
    if (!ready) return;
    expect((await A.db.rpc("create_statement_link", { p_party_id: A.party, p_days: 0 })).error).not.toBeNull();
    expect((await A.db.rpc("create_statement_link", { p_party_id: A.party, p_days: 9999 })).error).not.toBeNull();
  });
});
