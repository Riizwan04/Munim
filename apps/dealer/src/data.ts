import { partyStats, getPreset, partyBalance, entryEffect, pendingAsEntries, type Entry, type EntryPayload, type MaterialRef, type PartyRef, type EntryType, type PublicStatementPayload, type PublicError, isPublicError } from "@munim/ledger-core";
import { Platform } from "react-native";
import { localToday } from "./dates";
import { getItems } from "./offline/outbox";
import { withCache } from "./offline/cache";
import { supabase } from "./supabase";

export interface PartyRow {
  id: string; name: string; phone: string; opening: number; balance: number; creditLimit: number | null;
  nicknames: string[]; language: string; overdueDays: number | null;
}
export interface Overview { businessId: string; business: string; parties: PartyRow[]; todaySales: number; todayCollections: number }
export interface LedgerRow {
  key: string; entryId?: string; kind: "balance" | "line" | "payment" | "charge" | "total";
  date?: string; item: string; qty?: string; rate?: number; amount: number; site?: string; pending?: boolean;
}

const toEntry = (r: any): Entry => ({
  id: r.id, partyId: r.party_id, siteId: r.site_id, type: r.type, date: r.entry_date, status: r.status,
  amount: r.type === "sale" || r.type === "return" ? undefined : Number(r.amount),
  paymentMode: r.payment_mode ?? undefined, chequeBounced: r.cheque_bounced,
  lines: (r.entry_lines ?? []).map((l: any) => ({ materialId: l.material_id, quantity: Number(l.quantity), unit: l.unit, rate: Number(l.rate), gstBp: l.gst_bp ?? undefined })),
});

export async function loadParties(): Promise<Overview> {
  const raw = await withCache("overview", async () => {
    const [b, p, e] = await Promise.all([
      supabase.from("businesses").select("id,name").limit(1).maybeSingle(),
      supabase.from("parties").select("id,name,phone,opening_balance,credit_limit,nicknames,preferred_language"),
      supabase.from("entries").select("id,party_id,site_id,type,entry_date,status,amount,payment_mode,cheque_bounced,entry_lines(material_id,quantity,unit,rate,gst_bp)"),
    ]);
    if (b.error) throw b.error;
    if (p.error) throw p.error;
    if (e.error) throw e.error;
    return { b: b.data, p: p.data ?? [], e: e.data ?? [] };
  });
  const b = { data: raw.b }, p = { data: raw.p }, e = { data: raw.e };
  const byParty = new Map<string, Entry[]>();
  for (const r of e.data ?? []) (byParty.get(r.party_id) ?? byParty.set(r.party_id, []).get(r.party_id)!).push(toEntry(r));
  // entries saved on this phone but not uploaded yet count straight away
  for (const en of pendingAsEntries(getItems())) (byParty.get(en.partyId) ?? byParty.set(en.partyId, []).get(en.partyId)!).push(en);
  const today = localToday();
  let todaySales = 0, todayCollections = 0;
  const parties: PartyRow[] = (p.data ?? []).map((x) => {
    const st = partyStats(Number(x.opening_balance), byParty.get(x.id) ?? [], today);
    todaySales += st.todaySales; todayCollections += st.todayCollections;
    return {
      id: x.id, name: x.name, phone: x.phone, opening: Number(x.opening_balance), balance: st.balance,
      creditLimit: x.credit_limit === null ? null : Number(x.credit_limit),
      nicknames: x.nicknames ?? [], language: x.preferred_language ?? "hi", overdueDays: st.overdueDays,
    };
  }).sort((a, b) => b.balance - a.balance);
  return { businessId: b.data?.id ?? "", business: b.data?.name ?? "Munim", parties, todaySales, todayCollections };
}

const trim = (n: number) => String(Math.round(n * 1000) / 1000);

/** Builds the notebook-style rows (Layout A): opening balance, entries, balance after each payment, final total. */
export async function loadLedger(party: PartyRow): Promise<LedgerRow[]> {
  const raw = await withCache(`ledger:${party.id}`, async () => {
    const [e, s] = await Promise.all([
      supabase.from("entries").select("id,party_id,site_id,type,entry_date,status,amount,payment_mode,cheque_bounced,created_at,entry_lines(material_id,quantity,unit,rate,gst_bp,line_total,materials(name))").eq("party_id", party.id).eq("status", "active").order("entry_date").order("created_at"),
      supabase.from("sites").select("id,name").eq("party_id", party.id),
    ]);
    if (e.error) throw e.error;
    return { e: e.data ?? [], s: s.data ?? [] };
  });
  const names = new Map((await loadMaterials().catch(() => [] as MaterialRef[])).map((m) => [m.id, m.name]));
  const pendingRaw = getItems().filter((i) => i.status === "pending" && i.payload.party_id === party.id).map((i) => ({
    id: i.id, party_id: i.payload.party_id, site_id: i.payload.site_id, type: i.payload.type, entry_date: i.payload.entry_date, status: "active",
    amount: i.payload.amount, payment_mode: i.payload.payment_mode, cheque_bounced: false, created_at: i.createdAt, pending: true,
    entry_lines: i.payload.lines.map((l) => ({ material_id: l.material_id, quantity: l.quantity, unit: l.unit, rate: l.rate, gst_bp: null, line_total: l.line_total, materials: { name: names.get(l.material_id) ?? "Item" } })),
  }));
  const all: any[] = [...raw.e, ...pendingRaw].sort((x, y) => (x.entry_date === y.entry_date ? (String(x.created_at) < String(y.created_at) ? -1 : 1) : x.entry_date < y.entry_date ? -1 : 1));
  const e = { data: all };
  const s = { data: raw.s };
  const sites = new Map((s.data ?? []).map((x: any) => [x.id, x.name]));
  const rows: LedgerRow[] = [{ key: "open", kind: "balance", item: "@balance", amount: party.opening }];
  let running = party.opening;
  for (const r of e.data ?? []) {
    const entry = toEntry(r);
    const eff = entryEffect(entry);
    const site = r.site_id ? sites.get(r.site_id) : undefined;
    const date = r.entry_date.slice(8, 10) + "-" + r.entry_date.slice(5, 7);
    if (r.type === "payment") {
      rows.push({ key: r.id, entryId: r.pending ? undefined : r.id, pending: r.pending, kind: "payment", date, item: `@mode:${r.payment_mode ?? "paid"}`, amount: eff, site });
      running += eff;
      rows.push({ key: r.id + "b", kind: "balance", item: "@balance", amount: running });
      continue;
    }
    if (r.entry_lines?.length) {
      (r.entry_lines as any[]).forEach((l, i) =>
        rows.push({ key: r.id + i, entryId: r.pending ? undefined : r.id, pending: r.pending, kind: "line", date: i === 0 ? date : undefined, item: l.materials?.name ?? "Item",
          qty: `${trim(Number(l.quantity) / 1000)} ${l.unit}`, rate: Number(l.rate), amount: Number(l.line_total), site: i === 0 ? site : undefined }));
    } else {
      rows.push({ key: r.id, entryId: r.pending ? undefined : r.id, pending: r.pending, kind: "charge", date, item: `@${r.type}`, amount: eff, site });
    }
    running += eff;
  }
  rows.push({ key: "total", kind: "total", item: "@total", amount: running });
  return rows;
}

export async function loadMaterials(): Promise<MaterialRef[]> {
  const rows = await withCache("materials", async () => {
    const r = await supabase.from("materials").select("id,name,category,local_names,units").order("category").order("name");
    if (r.error) throw r.error;
    return r.data ?? [];
  });
  return rows.map((m: any) => ({ id: m.id, name: m.name, category: m.category, localNames: m.local_names ?? [], units: m.units }));
}

/** A party's sites and active past entries (used for "last rate" hints and balance preview). */
export async function loadPartyContext(partyId: string): Promise<{ sites: { id: string; name: string }[]; entries: Entry[] }> {
  const raw = await withCache(`pctx:${partyId}`, async () => {
    const [s, e] = await Promise.all([
      supabase.from("sites").select("id,name").eq("party_id", partyId).order("name"),
      supabase.from("entries").select("id,party_id,site_id,type,entry_date,status,amount,payment_mode,cheque_bounced,entry_lines(material_id,quantity,unit,rate,gst_bp)").eq("party_id", partyId).eq("status", "active"),
    ]);
    if (s.error) throw s.error;
    if (e.error) throw e.error;
    return { s: s.data ?? [], e: e.data ?? [] };
  });
  return { sites: raw.s, entries: [...raw.e.map(toEntry), ...pendingAsEntries(getItems(), partyId)] };
}

export interface EntryDetail {
  id: string; partyId: string; siteId: string | null; siteName?: string; type: string; date: string; amount: number; status: string;
  paymentMode: string | null; version: number;
  lines: { materialId: string; name: string; qty: number; unit: string; rate: number; total: number }[];
}
export async function loadEntry(id: string): Promise<EntryDetail> {
  const r = await supabase.from("entries").select("id,party_id,site_id,type,entry_date,amount,status,payment_mode,version,sites(name),entry_lines(material_id,quantity,unit,rate,line_total,materials(name))").eq("id", id).single();
  if (r.error) throw r.error;
  const d: any = r.data;
  return {
    id: d.id, partyId: d.party_id, siteId: d.site_id, siteName: d.sites?.name, type: d.type, date: d.entry_date, amount: Number(d.amount),
    status: d.status, paymentMode: d.payment_mode, version: d.version,
    lines: (d.entry_lines ?? []).map((l: any) => ({ materialId: l.material_id, name: l.materials?.name ?? "Item", qty: Number(l.quantity), unit: l.unit, rate: Number(l.rate), total: Number(l.line_total) })),
  };
}

const must = <T,>(r: { data: T; error: { message: string } | null }): NonNullable<T> => { if (r.error) throw new Error(r.error.message); return r.data as NonNullable<T>; };
export const saveEntry = async (p: EntryPayload) => must(await supabase.rpc("save_entry", { p }));
export const editEntry = async (id: string, p: EntryPayload, reason: string) => must(await supabase.rpc("edit_entry", { p_entry_id: id, p, p_reason: reason }));
export const cancelEntry = async (id: string, reason: string) => { must(await supabase.rpc("cancel_entry", { p_entry_id: id, p_reason: reason })); };
export const createParty = async (businessId: string, name: string, phone: string) =>
  must(await supabase.from("parties").insert({ business_id: businessId, name, phone, preferred_language: "en" }).select("id").single()).id as string;
export const createSite = async (businessId: string, partyId: string, name: string) =>
  must(await supabase.from("sites").insert({ business_id: businessId, party_id: partyId, name }).select("id").single()).id as string;

export async function loadUnderstandContext(): Promise<{ parties: PartyRef[]; materials: MaterialRef[] }> {
  const raw = await withCache("understand", async () => {
    const [p, s] = await Promise.all([supabase.from("parties").select("id,name,nicknames"), supabase.from("sites").select("id,name,party_id")]);
    if (p.error) throw p.error;
    if (s.error) throw s.error;
    return { p: p.data ?? [], s: s.data ?? [] };
  });
  const materials = await loadMaterials();
  const parties: PartyRef[] = raw.p.map((x: any) => ({
    id: x.id, name: x.name, nicknames: x.nicknames ?? [],
    sites: raw.s.filter((y: any) => y.party_id === x.id).map((y: any) => ({ id: y.id, name: y.name })),
  }));
  return { parties, materials };
}

// ───────── setup & masters ─────────
export async function createBusinessWithPreset(name: string, phone: string, presetKey: string): Promise<void> {
  const id = must(await supabase.rpc("create_business", { p_name: name, p_phone: phone, p_language: "en", p_type: presetKey })) as string;
  const items = getPreset(presetKey)?.items ?? [];
  if (items.length) {
    must(await supabase.from("materials").insert(items.map((i) => ({ business_id: id, name: i.name, category: i.category, units: i.units, local_names: i.localNames ?? [] }))).select("id"));
  }
}

export interface MaterialFull { id: string; name: string; category: string | null; units: string[]; localNames: string[] }
export async function loadMaterialsFull(): Promise<MaterialFull[]> {
  const r = await supabase.from("materials").select("id,name,category,local_names,units").order("category").order("name");
  if (r.error) throw r.error;
  return (r.data ?? []).map((m) => ({ id: m.id, name: m.name, category: m.category, units: m.units, localNames: m.local_names ?? [] }));
}
export const saveMaterial = async (businessId: string, m: { id?: string; name: string; category: string; units: string[]; localNames: string[] }) => {
  const row = { name: m.name, category: m.category || null, units: m.units, local_names: m.localNames };
  if (m.id) must(await supabase.from("materials").update(row).eq("id", m.id).select("id"));
  else must(await supabase.from("materials").insert({ ...row, business_id: businessId }).select("id"));
};
export const updateParty = async (id: string, v: { name: string; phone: string; nicknames: string[]; creditLimit: number | null; opening: number; language: string }) => {
  must(await supabase.from("parties").update({ name: v.name, phone: v.phone, nicknames: v.nicknames, credit_limit: v.creditLimit, opening_balance: v.opening, preferred_language: v.language }).eq("id", id).select("id"));
};

export interface StatementData { businessName: string; entries: Entry[]; materialNames: Record<string, string>; siteNames: Record<string, string>; sites: { id: string; name: string }[] }
/** Everything the statement builder needs for one party (active entries only; order = date then creation). */
export async function loadStatementData(partyId: string): Promise<StatementData> {
  const [b, m, s, e] = await Promise.all([
    supabase.from("businesses").select("name").limit(1).maybeSingle(),
    supabase.from("materials").select("id,name"),
    supabase.from("sites").select("id,name").eq("party_id", partyId),
    supabase.from("entries").select("id,party_id,site_id,type,entry_date,status,amount,payment_mode,cheque_bounced,created_at,entry_lines(material_id,quantity,unit,rate,gst_bp)").eq("party_id", partyId).eq("status", "active").order("entry_date").order("created_at"),
  ]);
  for (const r of [b, m, s, e]) if (r.error) throw r.error;
  return {
    businessName: b.data?.name ?? "Munim",
    entries: (e.data ?? []).map(toEntry),
    materialNames: Object.fromEntries((m.data ?? []).map((x) => [x.id, x.name])),
    siteNames: Object.fromEntries((s.data ?? []).map((x) => [x.id, x.name])),
    sites: s.data ?? [],
  };
}

// ───────── manual reminders (log only; nothing is sent or scheduled by the app) ─────────
/** Latest reminder time per party, so the list can show "last reminded". Returns {} if the table is not set up yet. */
export async function loadReminderLog(): Promise<Record<string, string>> {
  const r = await supabase.from("reminders").select("party_id,created_at").order("created_at", { ascending: false });
  if (r.error) return {};
  const out: Record<string, string> = {};
  for (const row of r.data ?? []) if (!out[row.party_id]) out[row.party_id] = row.created_at;
  return out;
}
export async function logReminder(businessId: string, partyId: string, amount: number, message: string): Promise<void> {
  const r = await supabase.from("reminders").insert({ business_id: businessId, party_id: partyId, amount, message, channel: "whatsapp" });
  if (r.error) throw new Error(r.error.message);
}

// ───────── reports ─────────
export interface ReportData {
  businessName: string; parties: { id: string; name: string; opening: number }[]; entries: Entry[];
  materials: Record<string, { name: string; category: string | null }>; sites: Record<string, string>;
}
/** Everything the report builder needs: all parties, active entries with lines, item and site names. */
export async function loadReportData(): Promise<ReportData> {
  const [b, p, m, s, e] = await Promise.all([
    supabase.from("businesses").select("name").limit(1).maybeSingle(),
    supabase.from("parties").select("id,name,opening_balance"),
    supabase.from("materials").select("id,name,category"),
    supabase.from("sites").select("id,name"),
    supabase.from("entries").select("id,party_id,site_id,type,entry_date,status,amount,payment_mode,cheque_bounced,entry_lines(material_id,quantity,unit,rate,gst_bp)").eq("status", "active").order("entry_date").limit(20000),
  ]);
  for (const r of [b, p, m, s, e]) if (r.error) throw r.error;
  return {
    businessName: b.data?.name ?? "Munim",
    parties: (p.data ?? []).map((x) => ({ id: x.id, name: x.name, opening: Number(x.opening_balance) })),
    entries: (e.data ?? []).map(toEntry),
    materials: Object.fromEntries((m.data ?? []).map((x) => [x.id, { name: x.name, category: x.category }])),
    sites: Object.fromEntries((s.data ?? []).map((x) => [x.id, x.name])),
  };
}

// ───────── importing handwritten pages ─────────
export async function loadImportContext(partyId: string): Promise<{ sites: { id: string; name: string }[]; materials: MaterialRef[]; existing: { date: string; type: EntryType; amount: number }[] }> {
  const [s, materials, e] = await Promise.all([
    supabase.from("sites").select("id,name").eq("party_id", partyId),
    loadMaterials(),
    supabase.from("entries").select("entry_date,type,amount").eq("party_id", partyId).eq("status", "active"),
  ]);
  if (s.error) throw s.error;
  if (e.error) throw e.error;
  return { sites: s.data ?? [], materials, existing: (e.data ?? []).map((x) => ({ date: x.entry_date, type: x.type as EntryType, amount: Number(x.amount) })) };
}
export const createPartyWithOpening = async (businessId: string, name: string, phone: string, openingPaise: number) =>
  must(await supabase.from("parties").insert({ business_id: businessId, name, phone, opening_balance: openingPaise, preferred_language: "en" }).select("id").single()).id as string;
/** Asks the "scan-ledger" edge function (AI vision) to read a photo of a khata page. Returns its raw JSON text. */
export async function scanPagePhoto(base64: string, mime: string): Promise<string> {
  const r = await supabase.functions.invoke("scan-ledger", { body: { image: base64, mime } });
  if (r.error) throw new Error(r.error.message);
  return typeof r.data === "string" ? r.data : JSON.stringify(r.data);
}

// ───────── customer statement links ─────────
/** Where customers open their link: the web address of the deployed app. */
export const webOrigin = (): string => process.env.EXPO_PUBLIC_WEB_URL?.trim() || (Platform.OS === "web" && typeof window !== "undefined" ? window.location.origin : "");
export interface LinkRow { id: string; created_at: string; expires_at: string; revoked_at: string | null; view_count: number; last_viewed_at: string | null }
export async function createStatementLink(partyId: string, days: number): Promise<{ id: string; token: string; expires_at: string }> {
  return must(await supabase.rpc("create_statement_link", { p_party_id: partyId, p_days: days, p_pin_required: true })) as { id: string; token: string; expires_at: string };
}
export async function revokeStatementLink(id: string): Promise<void> { must(await supabase.rpc("revoke_statement_link", { p_id: id })); }
export async function loadStatementLinks(partyId: string): Promise<LinkRow[]> {
  const r = await supabase.from("statement_links").select("id,created_at,expires_at,revoked_at,view_count,last_viewed_at").eq("party_id", partyId).order("created_at", { ascending: false }).limit(20);
  if (r.error) return []; // table not created yet (migration 0005)
  return r.data as LinkRow[];
}
/** PUBLIC: no login. Returns the statement data, or an error code (invalid, locked, pin_required, wrong_pin). */
export async function fetchPublicStatement(token: string, pin?: string): Promise<PublicStatementPayload | { error: PublicError }> {
  const r = await supabase.rpc("get_statement", { p_token: token, p_pin: pin ?? null });
  if (r.error) throw new Error(r.error.message);
  return r.data as PublicStatementPayload | { error: PublicError };
}
export { isPublicError };
