import { partyBalance, entryEffect, type Entry, type EntryPayload, type MaterialRef } from "@munim/ledger-core";
import { supabase } from "./supabase";

export interface PartyRow { id: string; name: string; phone: string; opening: number; balance: number; creditLimit: number | null }
export interface LedgerRow {
  key: string; entryId?: string; kind: "balance" | "line" | "payment" | "charge" | "total";
  date?: string; item: string; qty?: string; rate?: number; amount: number; site?: string;
}

const toEntry = (r: any): Entry => ({
  id: r.id, partyId: r.party_id, siteId: r.site_id, type: r.type, date: r.entry_date, status: r.status,
  amount: r.type === "sale" || r.type === "return" ? undefined : Number(r.amount),
  paymentMode: r.payment_mode ?? undefined, chequeBounced: r.cheque_bounced,
  lines: (r.entry_lines ?? []).map((l: any) => ({ materialId: l.material_id, quantity: Number(l.quantity), unit: l.unit, rate: Number(l.rate), gstBp: l.gst_bp ?? undefined })),
});

export async function loadParties(): Promise<{ businessId: string; business: string; parties: PartyRow[] }> {
  const [b, p, e] = await Promise.all([
    supabase.from("businesses").select("id,name").limit(1).maybeSingle(),
    supabase.from("parties").select("id,name,phone,opening_balance,credit_limit"),
    supabase.from("entries").select("id,party_id,site_id,type,entry_date,status,amount,payment_mode,cheque_bounced,entry_lines(material_id,quantity,unit,rate,gst_bp)"),
  ]);
  if (p.error) throw p.error;
  if (e.error) throw e.error;
  const byParty = new Map<string, Entry[]>();
  for (const r of e.data ?? []) (byParty.get(r.party_id) ?? byParty.set(r.party_id, []).get(r.party_id)!).push(toEntry(r));
  const parties = (p.data ?? []).map((x) => ({
    id: x.id, name: x.name, phone: x.phone, opening: Number(x.opening_balance),
    balance: partyBalance(Number(x.opening_balance), byParty.get(x.id) ?? []),
    creditLimit: x.credit_limit === null ? null : Number(x.credit_limit),
  })).sort((a, b) => b.balance - a.balance);
  return { businessId: b.data?.id ?? "", business: b.data?.name ?? "Munim", parties };
}

const MODE: Record<string, string> = { cash: "Cash", upi: "Online (UPI)", cheque: "Cheque", bank: "Bank transfer" };
const trim = (n: number) => String(Math.round(n * 1000) / 1000);
const label = (type: string) => (type === "charge" ? "Gaadi bhada / Charge" : type === "discount" ? "Discount" : type === "return" ? "Return" : "");

/** Builds the notebook-style rows (Layout A): opening balance, entries, balance after each payment, final total. */
export async function loadLedger(party: PartyRow): Promise<LedgerRow[]> {
  const [e, s] = await Promise.all([
    supabase.from("entries").select("id,party_id,site_id,type,entry_date,status,amount,payment_mode,cheque_bounced,created_at,entry_lines(material_id,quantity,unit,rate,gst_bp,line_total,materials(name))").eq("party_id", party.id).eq("status", "active").order("entry_date").order("created_at"),
    supabase.from("sites").select("id,name").eq("party_id", party.id),
  ]);
  if (e.error) throw e.error;
  const sites = new Map((s.data ?? []).map((x) => [x.id, x.name]));
  const rows: LedgerRow[] = [{ key: "open", kind: "balance", item: "Balance", amount: party.opening }];
  let running = party.opening;
  for (const r of e.data ?? []) {
    const entry = toEntry(r);
    const eff = entryEffect(entry);
    const site = r.site_id ? sites.get(r.site_id) : undefined;
    const date = r.entry_date.slice(8, 10) + "-" + r.entry_date.slice(5, 7);
    if (r.type === "payment") {
      rows.push({ key: r.id, entryId: r.id, kind: "payment", date, item: MODE[r.payment_mode as string] ?? "Paid", amount: eff, site });
      running += eff;
      rows.push({ key: r.id + "b", kind: "balance", item: "Balance", amount: running });
      continue;
    }
    if (r.entry_lines?.length) {
      (r.entry_lines as any[]).forEach((l, i) =>
        rows.push({ key: r.id + i, entryId: r.id, kind: "line", date: i === 0 ? date : undefined, item: l.materials?.name ?? "Item",
          qty: `${trim(Number(l.quantity) / 1000)} ${l.unit}`, rate: Number(l.rate), amount: Number(l.line_total), site: i === 0 ? site : undefined }));
    } else {
      rows.push({ key: r.id, entryId: r.id, kind: "charge", date, item: label(r.type), amount: eff, site });
    }
    running += eff;
  }
  rows.push({ key: "total", kind: "total", item: "Total", amount: running });
  return rows;
}

export async function loadMaterials(): Promise<MaterialRef[]> {
  const r = await supabase.from("materials").select("id,name,category,local_names,units").order("category").order("name");
  if (r.error) throw r.error;
  return (r.data ?? []).map((m) => ({ id: m.id, name: m.name, category: m.category, localNames: m.local_names ?? [], units: m.units }));
}

/** A party's sites and active past entries (used for "last rate" hints and balance preview). */
export async function loadPartyContext(partyId: string): Promise<{ sites: { id: string; name: string }[]; entries: Entry[] }> {
  const [s, e] = await Promise.all([
    supabase.from("sites").select("id,name").eq("party_id", partyId).order("name"),
    supabase.from("entries").select("id,party_id,site_id,type,entry_date,status,amount,payment_mode,cheque_bounced,entry_lines(material_id,quantity,unit,rate,gst_bp)").eq("party_id", partyId).eq("status", "active"),
  ]);
  if (s.error) throw s.error;
  if (e.error) throw e.error;
  return { sites: s.data ?? [], entries: (e.data ?? []).map(toEntry) };
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
  must(await supabase.from("parties").insert({ business_id: businessId, name, phone }).select("id").single()).id as string;
export const createSite = async (businessId: string, partyId: string, name: string) =>
  must(await supabase.from("sites").insert({ business_id: businessId, party_id: partyId, name }).select("id").single()).id as string;
