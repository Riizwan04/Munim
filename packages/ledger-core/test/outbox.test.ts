import { describe, it, expect } from "vitest";
import {
  classifyError, backoffMs, enqueue, sortedPending, remove, markAttempt, markFailed, retryFailed, counts, serialize, parseQueue, pendingAsEntries,
  buildDraft, partyBalance, rupeesToPaise as R, type EntryPayload, type MaterialRef, type OutboxItem,
} from "../src/index";

const mats: MaterialRef[] = [{ id: "jsw", name: "JSW", category: "Cement", localNames: [], units: ["bag"] }];
const sale = (qty: string, rate: string): EntryPayload =>
  buildDraft({ businessId: "b", partyId: "p", type: "sale", date: "2026-11-15", lines: [{ materialId: "jsw", unit: "bag", qty, rate }], amount: "" }, mats).payload!;
const pay = (amt: string): EntryPayload => buildDraft({ businessId: "b", partyId: "p", type: "payment", date: "2026-11-15", lines: [], amount: amt, paymentMode: "cash" }, mats).payload!;

describe("classifyError: retry later vs ask a person", () => {
  it("network problems are retried", () => {
    for (const m of ["TypeError: Failed to fetch", "Network request failed", "Load failed", "request timed out", "fetch failed", "The operation was aborted"]) expect(classifyError({ message: m })).toBe("network");
    expect(classifyError({ message: "x", status: 0 })).toBe("network");
    expect(classifyError({ message: "bad gateway", status: 502 })).toBe("network");
    expect(classifyError({ message: "slow down", status: 429 })).toBe("network");
  });
  it("signed-out / not allowed keeps the entry for after login", () => {
    expect(classifyError({ message: "JWT expired" })).toBe("auth");
    expect(classifyError({ message: "x", status: 401 })).toBe("auth");
  });
  it("server rules (wrong total, unit not sold, not your business) need a person", () => {
    expect(classifyError({ message: "line total mismatch: expected 100, got 101", status: 400 })).toBe("rejected");
    expect(classifyError({ message: "unit butti not allowed for this material" })).toBe("rejected");
    expect(classifyError({ message: "party does not belong to this business" })).toBe("rejected");
  });
});

describe("backoff", () => {
  it("2s, 4s, 8s, then every 15s", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 20].map(backoffMs)).toEqual([2000, 4000, 8000, 15000, 15000, 15000, 15000, 15000]);
    expect(backoffMs(-3)).toBe(2000);
  });
});

describe("queue rules", () => {
  const t = (n: number) => `2026-11-15T10:00:0${n}.000Z`;
  it("enqueue stamps the client id and ignores a repeated id", () => {
    let q = enqueue([], sale("10", "365"), "id-1", t(1));
    expect(q[0]!.payload.client_id).toBe("id-1");
    q = enqueue(q, sale("99", "1"), "id-1", t(2));
    expect(q).toHaveLength(1);
    expect(q[0]!.payload.amount).toBe(R(3650));
  });
  it("oldest first, failed ones are not auto-sent", () => {
    let q = enqueue([], sale("1", "1"), "b", t(2));
    q = enqueue(q, sale("1", "1"), "a", t(1));
    q = enqueue(q, sale("1", "1"), "c", t(3));
    q = markFailed(q, "a", "unit not allowed");
    expect(sortedPending(q).map((i) => i.id)).toEqual(["b", "c"]);
    expect(counts(q)).toEqual({ pending: 2, failed: 1 });
  });
  it("attempt counter, retry resets, remove", () => {
    let q = enqueue([], sale("1", "1"), "a", t(1));
    q = markAttempt(markAttempt(q, "a", t(2)), "a", t(3));
    expect(q[0]!.attempts).toBe(2);
    q = markFailed(q, "a", "x");
    q = retryFailed(q, "a");
    expect(q[0]).toMatchObject({ status: "pending", attempts: 0, error: undefined });
    expect(remove(q, "a")).toEqual([]);
  });
  it("survives storage: round trip, and garbage is skipped not fatal", () => {
    const q = enqueue(enqueue([], sale("2", "100"), "a", t(1)), pay("50"), "b", t(2));
    expect(parseQueue(serialize(q))).toEqual(q);
    expect(parseQueue("not json")).toEqual([]);
    expect(parseQueue(null)).toEqual([]);
    const mixed = JSON.stringify({ v: 1, items: [q[0], { junk: true }, null, q[1]] });
    expect(parseQueue(mixed).map((i: OutboxItem) => i.id)).toEqual(["a", "b"]);
  });
});

describe("waiting entries count in balances straight away", () => {
  it("opening + server entries + waiting entries", () => {
    const q = enqueue(enqueue([], sale("10", "365"), "a", "2026-11-15T10:00:01Z"), pay("1000"), "b", "2026-11-15T10:00:02Z");
    const server = [{ id: "s1", partyId: "p", type: "sale" as const, date: "2026-11-01", status: "active" as const, amount: undefined, lines: [{ materialId: "jsw", quantity: 80000, unit: "bag", rate: R(360) }] }];
    const all = [...server, ...pendingAsEntries(q, "p")];
    expect(partyBalance(R(500), all)).toBe(R(500) + R(28800) + R(3650) - R(1000));
    expect(pendingAsEntries(q, "someone-else")).toEqual([]);
  });
  it("failed entries are not counted", () => {
    const q = markFailed(enqueue([], sale("10", "365"), "a", "2026-11-15T10:00:01Z"), "a", "x");
    expect(pendingAsEntries(q)).toEqual([]);
  });
});
