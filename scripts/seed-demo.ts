/**
 * Seeds a DEMO business with sample data (made-up party, rates are examples only).
 * Idempotent: signs into the demo account if it exists, skips if it already has a business.
 * Run: npm run seed
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { toMilliQty, rupeesToPaise as R, lineTotal, formatINR, partyBalance, type Entry } from "@munim/ledger-core";

const env = (k: string) =>
  process.env[k] ?? readFileSync(new URL("../.env", import.meta.url), "utf8").match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const db = createClient(env("EXPO_PUBLIC_SUPABASE_URL")!, env("EXPO_PUBLIC_SUPABASE_ANON_KEY")!, { auth: { persistSession: false } });

export const DEMO_EMAIL = "demo.dealer@example.com";
export const DEMO_PASSWORD = "Munim-demo-2026";

async function main() {
  let { data, error } = await db.auth.signInWithPassword({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
  if (error) {
    const up = await db.auth.signUp({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
    if (up.error || !up.data.session) throw new Error(`demo sign-up failed: ${up.error?.message}`);
    data = up.data as typeof data;
  }
  const existing = await db.from("business_members").select("business_id").limit(1);
  if (existing.data?.length) { console.log("Demo business already exists, nothing to do."); return; }

  const biz = (await db.rpc("create_business", { p_name: "Sample Building Supplies", p_phone: "+919999999999", p_language: "hi" })).data as string;
  const ins = async (table: string, row: object) => {
    const r = await db.from(table).insert(row).select("id").single();
    if (r.error) throw new Error(`${table}: ${r.error.message}`);
    return r.data.id as string;
  };

  const mats: Record<string, { id: string; unit: string }> = {};
  const addMat = async (key: string, name: string, category: string, units: string[], local: string[] = []) => {
    mats[key] = { id: await ins("materials", { business_id: biz, name, category, units, local_names: local }), unit: units[0]! };
  };
  await addMat("waddi", "Waddi", "Cement", ["bag"]);
  await addMat("jsw", "JSW", "Cement", ["bag"]);
  await addMat("super", "Super", "Cement", ["bag"]);
  await addMat("sand", "Sand", "Sand", ["butti", "mtr"], ["reti", "vaalu", "ret"]);
  await addMat("khadi", "Khadi", "Khadi", ["butti", "mtr"], ["gitti", "metal", "jelly"]);
  await addMat("brick", "Red Brick", "Bricks", ["nos"], ["eent"]);
  await addMat("b4", "Block 4 inch", "Blocks", ["nos"]);
  await addMat("b6", "Block 6 inch", "Blocks", ["nos"]);
  await addMat("wp", "Waterproofing Liquid", "Waterproofing", ["ltr"]);
  await addMat("wpp", "Waterproofing Powder", "Waterproofing", ["kg"]);

  const party = await ins("parties", { business_id: biz, name: "Santosh Naik", nicknames: ["Santosh bhai", "Naik mistri"], phone: "+918888888888", opening_balance: R(84610) });
  const moira = await ins("sites", { business_id: biz, party_id: party, name: "Moira", is_default: false });
  const aldiyad = await ins("sites", { business_id: biz, party_id: party, name: "Aldiyad" });

  const sale = (date: string, lines: [string, string, number, number][], site?: string) => {
    const ls = lines.map(([m, unit, qty, rate]) => {
      const quantity = toMilliQty(qty), rt = R(rate);
      return { material_id: mats[m]!.id, quantity, unit, rate: rt, gst_bp: null, line_total: lineTotal({ materialId: m, quantity, unit, rate: rt }) };
    });
    return { business_id: biz, party_id: party, site_id: site ?? null, type: "sale", entry_date: date, source: "manual",
      amount: ls.reduce((s, l) => s + l.line_total, 0), lines: ls };
  };
  const flat = (type: string, date: string, amount: number, extra: object = {}) =>
    ({ business_id: biz, party_id: party, site_id: null, type, entry_date: date, amount: R(amount), source: "manual", ...extra });

  const entries = [
    sale("2026-11-03", [["waddi", "bag", 80, 390]]),
    flat("payment", "2026-11-04", 50000, { payment_mode: "upi" }),
    sale("2026-11-05", [["waddi", "bag", 120, 390]]),
    sale("2026-11-07", [["sand", "butti", 8, 700], ["khadi", "mtr", 2, 3400]]),
    sale("2026-11-08", [["brick", "nos", 1000, 9], ["b6", "nos", 200, 42]], moira),
    sale("2026-11-10", [["jsw", "bag", 80, 360]], moira),
    sale("2026-11-10", [["super", "bag", 50, 380]], aldiyad),
    sale("2026-11-11", [["jsw", "bag", 120, 360], ["wp", "ltr", 20, 285]]),
    flat("charge", "2026-11-11", 800),
  ];
  const ledger: Entry[] = [];
  for (const p of entries) {
    const r = await db.rpc("save_entry", { p });
    if (r.error) throw new Error(`save_entry: ${r.error.message}`);
    ledger.push({ id: r.data, partyId: party, type: p.type as Entry["type"], date: p.entry_date, status: "active",
      amount: p.type === "sale" ? undefined : p.amount, lines: (p as any).lines?.map((l: any) => ({ materialId: l.material_id, quantity: l.quantity, unit: l.unit, rate: l.rate })) });
  }
  console.log(`Seeded. Balance: ${formatINR(partyBalance(R(84610), ledger))}`);
  console.log(`Login: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
