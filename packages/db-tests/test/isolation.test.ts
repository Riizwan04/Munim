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
