import { notifyParty, payloadAmount } from "../notify";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import { useSyncExternalStore } from "react";
import { AppState } from "react-native";
import {
  backoffMs, classifyError, counts, enqueue, markAttempt, markFailed, parseQueue, remove, retryFailed, serialize, sortedPending,
  type EntryPayload, type OutboxItem,
} from "@munim/ledger-core";
import { supabase } from "../supabase";
import { onRegained, startNetWatch } from "./net";

/**
 * The outbox: new entries are written to the phone first, then uploaded one by one, oldest first. Anything that cannot be
 * uploaded stays on the phone and is retried (2s, 4s, 8s, then every 15s) and whenever the connection returns or the app
 * comes back to the front. Each entry's client_id makes a repeated upload harmless.
 */
let user: string | null = null;
let items: OutboxItem[] = [];
let syncing: Promise<void> | null = null;
let isSyncing = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let snapshot = { items: [] as OutboxItem[], pending: 0, failed: 0, syncing: false };
const subs = new Set<() => void>();
const syncedCbs = new Set<() => void>();
const KEY = (u: string) => `munim.outbox.${u}`;

function emit() { snapshot = { items, ...counts(items), syncing: isSyncing }; subs.forEach((f) => f()); }
async function persist() { if (user) await AsyncStorage.setItem(KEY(user), serialize(items)); }
export const getItems = () => items;
export const onSynced = (f: () => void) => { syncedCbs.add(f); return () => { syncedCbs.delete(f); }; };
export const useOutbox = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => snapshot, () => snapshot);

let wired = false;
export async function startOutbox(userId: string) {
  user = userId;
  items = parseQueue(await AsyncStorage.getItem(KEY(userId)).catch(() => null));
  emit();
  if (!wired) {
    wired = true;
    startNetWatch(() => void syncNow());
    onRegained(() => void syncNow());
    AppState.addEventListener("change", (s) => { if (s === "active") void syncNow(); });
  }
  void syncNow();
}
export function stopOutbox() { user = null; items = []; clearTimeout(timer); emit(); }

/** Saves the entry on the phone straight away (so a crash or a dead signal cannot lose it). Upload is a separate step. */
export async function enqueueEntry(payload: EntryPayload): Promise<OutboxItem> {
  if (!user) throw new Error("not signed in");
  const id = Crypto.randomUUID();
  items = enqueue(items, payload, id, new Date().toISOString());
  await persist();
  emit();
  return items.find((i) => i.id === id)!;
}

async function run() {
  clearTimeout(timer);
  isSyncing = true; emit();
  let sent = 0;
  let retryIn: number | null = null;
  for (const it of sortedPending(items)) {
    if (!user) break;
    items = markAttempt(items, it.id, new Date().toISOString());
    let error: unknown = null;
    try { error = (await supabase.rpc("save_entry", { p: it.payload })).error; } catch (e) { error = e; }
    if (!error) { items = remove(items, it.id); sent++; await persist(); emit(); void notifyParty(it.payload.party_id, it.payload.type, payloadAmount(it.payload)); continue; }
    const kind = classifyError(error);
    if (kind === "network") { retryIn = backoffMs(items.find((i) => i.id === it.id)!.attempts - 1); await persist(); break; }
    if (kind === "auth") { retryIn = 30_000; await persist(); break; }
    items = markFailed(items, it.id, (error as { message?: string })?.message ?? String(error));
    await persist(); emit();
  }
  isSyncing = false; emit();
  if (retryIn !== null && user) timer = setTimeout(() => void syncNow(), retryIn);
  if (sent > 0) syncedCbs.forEach((f) => f());
}

/** Uploads what is waiting. One run at a time. With timeoutMs it stops waiting after that long (the upload carries on in the background). */
export function syncNow(opts: { timeoutMs?: number } = {}): Promise<void> {
  if (!syncing) syncing = run().finally(() => { syncing = null; });
  const p = syncing;
  return opts.timeoutMs ? Promise.race([p, new Promise<void>((r) => setTimeout(r, opts.timeoutMs))]) : p;
}
export async function retryItem(id: string) { items = retryFailed(items, id); await persist(); emit(); void syncNow(); }
export async function discardItem(id: string) { items = remove(items, id); await persist(); emit(); }

/** Log out only when nothing is still waiting, so no entry is ever lost. */
export async function canSignOut(): Promise<boolean> {
  if (counts(items).pending === 0) return true;
  await syncNow({ timeoutMs: 6000 });
  return counts(items).pending === 0;
}
