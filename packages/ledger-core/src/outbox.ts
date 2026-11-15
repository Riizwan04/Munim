import type { EntryPayload } from "./entryDraft";
import type { Entry } from "./types";

/**
 * Offline saving. Every new entry is written to the phone's outbox FIRST, then uploaded. Each entry carries its own id
 * (client_id) so a retry after a dropped connection cannot create it twice. These are the pure rules; the app keeps
 * the queue in the phone's storage.
 */
export interface OutboxItem {
  id: string; /* the client_id */ payload: EntryPayload; createdAt: string; attempts: number;
  status: "pending" | "failed"; error?: string; lastTriedAt?: string;
}
/** network = try again later; auth = signed out / not allowed right now, keep it and try again after login; rejected = the server said no, a person must look. */
export type ErrorKind = "network" | "auth" | "rejected";

const NETWORK = /failed to fetch|network request failed|load failed|networkerror|network error|timeout|timed out|abort|econn|enotfound|fetch failed|internet|offline/i;
const AUTH = /jwt|not signed in|permission denied|row-level security|invalid.*token|token.*expired/i;
export function classifyError(e: unknown): ErrorKind {
  const x = (e ?? {}) as { message?: string; status?: number; code?: string };
  const msg = String(x.message ?? e ?? "");
  const status = typeof x.status === "number" ? x.status : undefined;
  if (NETWORK.test(msg) || status === 0 || status === 408 || status === 429 || (status !== undefined && status >= 500)) return "network";
  if (status === 401 || status === 403 || AUTH.test(msg)) return "auth";
  return "rejected";
}

/** Wait before retry number `attempts` (0-based): 2s, 4s, 8s, then every 15s. A signal that returns without any event is still found within 15s. */
export const backoffMs = (attempts: number) => Math.min(15_000, 2000 * 2 ** Math.min(Math.max(attempts, 0), 5));

export function enqueue(queue: OutboxItem[], payload: EntryPayload, id: string, now: string): OutboxItem[] {
  if (queue.some((i) => i.id === id)) return queue;
  return [...queue, { id, payload: { ...payload, client_id: id }, createdAt: now, attempts: 0, status: "pending" }];
}
export const sortedPending = (queue: OutboxItem[]) => queue.filter((i) => i.status === "pending").sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
export const remove = (queue: OutboxItem[], id: string) => queue.filter((i) => i.id !== id);
export const markAttempt = (queue: OutboxItem[], id: string, now: string) => queue.map((i) => (i.id === id ? { ...i, attempts: i.attempts + 1, lastTriedAt: now } : i));
export const markFailed = (queue: OutboxItem[], id: string, error: string) => queue.map((i) => (i.id === id ? { ...i, status: "failed" as const, error } : i));
export const retryFailed = (queue: OutboxItem[], id: string) => queue.map((i) => (i.id === id ? { ...i, status: "pending" as const, error: undefined, attempts: 0 } : i));
export const counts = (queue: OutboxItem[]) => ({ pending: queue.filter((i) => i.status === "pending").length, failed: queue.filter((i) => i.status === "failed").length });

export const serialize = (queue: OutboxItem[]) => JSON.stringify({ v: 1, items: queue });
/** Reads the stored queue; skips anything malformed rather than losing the rest. */
export function parseQueue(raw: string | null | undefined): OutboxItem[] {
  if (!raw) return [];
  try {
    const j = JSON.parse(raw);
    if (!j || !Array.isArray(j.items)) return [];
    return j.items.filter((i: any) => i && typeof i.id === "string" && i.payload && typeof i.payload.party_id === "string" && typeof i.payload.business_id === "string" && typeof i.createdAt === "string")
      .map((i: any) => ({ ...i, attempts: Number(i.attempts) || 0, status: i.status === "failed" ? "failed" : "pending" }));
  } catch { return []; }
}

/** Waiting entries as ledger entries, so balances and "last rate" hints include them straight away. Failed ones are not counted. */
export function pendingAsEntries(queue: OutboxItem[], partyId?: string): Entry[] {
  return sortedPending(queue).filter((i) => !partyId || i.payload.party_id === partyId).map((i) => {
    const p = i.payload;
    return {
      id: i.id, partyId: p.party_id, siteId: p.site_id, type: p.type, date: p.entry_date, status: "active" as const,
      amount: p.type === "sale" || p.type === "return" ? undefined : p.amount, paymentMode: p.payment_mode ?? undefined,
      lines: p.lines.map((l) => ({ materialId: l.material_id, quantity: l.quantity, unit: l.unit, rate: l.rate })),
    };
  });
}
