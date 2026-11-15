import { isDone, isNo, isNoSite, isYes, parseChoice, parseModeAnswer, parseNumberAnswer, parseUnitAnswer, detectSpokenLang, type Choice } from "./answers";
import { buildDraft, parseQty, parseRupees, type DraftLine, type EntryPayload } from "./entryDraft";
import { entryEffect, partyBalance, creditLimitWarning } from "./ledger";
import { matchMaterial, validUnit, type MaterialRef } from "./materials";
import type { Paise } from "./money";
import { rateLooksUnusual, suggestRate } from "./rates";
import { qtyToSpeech, rupeesToSpeech, spellAcronyms, unitToSpeech, modeToSpeech, type SpeakLang } from "./speak";
import { hasToken, isDevanagari } from "./phonetic";
import { scanNumbers, tokenize } from "./spoken";
import type { Entry, EntryType, PaymentMode } from "./types";
import { heuristicUnderstand, normalizeUnit, resolveUtterance, unitOf, type ParsedUtterance, type PartyRef, type Question, type UnderstandContext } from "./understand";

/**
 * The conversation with the shop owner. Pure logic: it is told what was heard and returns what to say (as language-free
 * "Say" intents), whether to listen next, and what to show. It never saves anything: saving is the owner's tap.
 * All money is computed by code (buildDraft); the voice only fills in the blanks.
 */
export type SayVar = string | number | { rupees: Paise } | { qty: number; unit: string } | { name: string; alt?: string } | { mode: PaymentMode } | { say: Say } | { list: { name: string; alt?: string }[] };
export interface Say { key: string; vars?: Record<string, SayVar> }

export type Phase = "idle" | "await_entries" | "asking" | "readback" | "correcting" | "await_more" | "ended";
export interface CardLine { name: string; qty: number; unit: string; rate: Paise; total: Paise }
export interface EntryCard {
  partyId: string; party: string; site?: string; type: EntryType; lines: CardLine[]; total: Paise;
  paymentMode?: PaymentMode | null; oldBalance: Paise; newBalance: Paise; payload: EntryPayload; warnings: string[];
}
export interface View { phase: Phase; card?: EntryCard; position?: { i: number; n: number }; unknownParty?: string; needsManual: boolean; saved: number }
export interface Output { say: Say[]; listen: boolean; view: View; lang: SpeakLang }

export interface DialogueCtx {
  businessId: string; today: string; parties: PartyRef[]; materials: MaterialRef[];
  partyInfo(partyId: string): { name: string; opening: Paise; creditLimit: Paise | null };
  /** Active entries of the party, including any still waiting to upload. */
  partyEntries(partyId: string): Entry[];
  understand?: (text: string, ctx: UnderstandContext) => ParsedUtterance;
}

interface EntryState {
  type: EntryType; partyId?: string; partyOptions: PartyRef[]; siteId?: string | null; lines: DraftLine[]; amount: string; mode?: PaymentMode | null;
  spoken: { party?: string; site?: string; materials: (string | undefined)[] }; fails: number; unknownParty?: string;
}
type Q = Question | { kind: "unknownParty"; spoken: string };

const fmt = (n: number) => String(Math.round(n * 1000) / 1000);
const devNick = (p: PartyRef) => p.nicknames.find(isDevanagari);
const sayName = (p: PartyRef) => ({ name: p.name, alt: devNick(p) });
const matName = (m: MaterialRef) => ({ name: m.name, alt: [m.name, ...m.localNames].find(isDevanagari) });

export class Dialogue {
  phase: Phase = "idle";
  lang: SpeakLang;
  private queue: EntryState[] = [];
  private cur: EntryState | null = null;
  private saved = 0;
  private misses = 0;
  private session = new Map<string, Paise>();
  private lastCard: EntryCard | undefined;

  constructor(private ctx: DialogueCtx, opts: { lang: SpeakLang }) { this.lang = opts.lang; }

  // ───────── events ─────────
  start(): Output { this.phase = "await_entries"; this.misses = 0; return this.out([{ key: "v.greet" }], true); }
  setLang(l: SpeakLang) { this.lang = l; }
  stop(): Output { this.phase = "idle"; return this.out([{ key: "v.stopped" }], false); }

  /** The owner tapped the mic while idle. */
  resume(): Output {
    this.misses = 0;
    if (this.cur) return this.advance([]);
    this.phase = this.saved > 0 ? "await_more" : "await_entries";
    return this.out([{ key: "v.listening" }], true);
  }
  /** Nothing was heard. */
  silence(): Output {
    if (this.phase === "readback" || this.phase === "idle" || this.phase === "ended") return this.out([], false);
    this.misses++;
    if (this.misses === 1) return this.out([{ key: "v.listening" }], true);
    this.phase = "idle";
    return this.out([{ key: "v.noSpeech" }], false);
  }

  heard(text: string): Output {
    this.lang = detectSpokenLang(text, this.lang);
    switch (this.phase) {
      case "await_entries": case "await_more": return this.onEntries(text);
      case "asking": return this.onAnswer(text);
      case "readback": case "correcting": return this.onReadback(text);
      case "idle": return this.onEntries(text);
      default: return this.out([], false);
    }
  }

  /** The owner tapped Save and the entry was stored (on the server or in the phone's outbox). */
  savedEntry(): Output {
    const card = this.lastCard;
    if (card) {
      this.session.set(card.partyId, (this.session.get(card.partyId) ?? 0) + (card.type === "payment" || card.type === "discount" || card.type === "return" ? -card.total : card.total));
    }
    this.saved++;
    this.queue.shift(); this.cur = null; this.lastCard = undefined;
    return this.next([{ key: "v.saved" }]);
  }
  skipped(): Output { this.queue.shift(); this.cur = null; this.lastCard = undefined; return this.next([{ key: "v.skipped" }]); }
  /** A new party was added by the owner for the entry that was waiting. */
  partyAdded(p: PartyRef): Output {
    if (!this.cur) return this.out([], false);
    if (!this.ctx.parties.some((x) => x.id === p.id)) this.ctx.parties.push(p);
    this.cur.partyId = p.id; this.cur.unknownParty = undefined; this.cur.partyOptions = [];
    return this.advance([{ key: "v.ok" }]);
  }
  /** The owner chose to fix this entry by hand; the voice flow moves on without it. */
  handedOver(): Output { this.queue.shift(); this.cur = null; this.lastCard = undefined; return this.next([]); }

  // ───────── understanding what was said ─────────
  private onEntries(text: string): Output {
    if (this.phase === "await_more" || this.saved > 0) {
      if (isDone(text)) { this.phase = "ended"; return this.out([{ key: "v.done", vars: { n: this.saved } }], false); }
      if (isYes(text) && tokenize(text).length <= 2) { this.phase = "await_more"; return this.out([{ key: "v.goAhead" }], true); }
    }
    const uctx: UnderstandContext = { parties: this.ctx.parties, materials: this.ctx.materials };
    const parsed = (this.ctx.understand ?? heuristicUnderstand)(text, uctx);
    const resolved = resolveUtterance(parsed, uctx);
    if (resolved.length === 0) {
      this.misses++;
      if (this.misses >= 2) { this.phase = "idle"; return this.out([{ key: "v.notUnderstood" }, { key: "v.useTap" }], false); }
      this.phase = this.saved > 0 ? "await_more" : "await_entries";
      return this.out([{ key: "v.notUnderstood" }], true);
    }
    this.misses = 0;
    this.queue = resolved.map((r) => this.fromResolved(r));
    this.cur = this.queue[0]!;
    return this.advance(this.queue.length > 1 ? [{ key: "v.several", vars: { n: this.queue.length } }] : []);
  }

  private fromResolved(r: ReturnType<typeof resolveUtterance>[number]): EntryState {
    const pq = r.questions.find((q) => q.kind === "party") as Extract<Question, { kind: "party" }> | undefined;
    const sq = r.questions.find((q) => q.kind === "site") as Extract<Question, { kind: "site" }> | undefined;
    const spokenMat: (string | undefined)[] = [];
    for (const q of r.questions) if (q.kind === "material") spokenMat[q.line] = q.spoken;
    return {
      type: r.type, partyId: r.partyId, partyOptions: pq?.options ?? [], siteId: sq ? undefined : (r.siteId ?? null), lines: r.lines, amount: r.amount, mode: r.paymentMode,
      spoken: { party: pq?.spoken, site: sq?.spoken, materials: spokenMat }, fails: 0,
      unknownParty: pq && pq.options.length === 0 && pq.spoken ? pq.spoken : undefined,
    };
  }

  /** What is still missing, in the order Munim asks. */
  private openQuestion(s: EntryState): Q | null {
    if (!s.partyId) return s.unknownParty ? { kind: "unknownParty", spoken: s.unknownParty } : { kind: "party", spoken: s.spoken.party, options: s.partyOptions };
    const party = this.ctx.parties.find((p) => p.id === s.partyId)!;
    if (s.siteId === undefined) return { kind: "site", spoken: s.spoken.site ?? "", options: party.sites };
    if (s.type === "sale" || s.type === "return") {
      if (s.lines.length === 0) return { kind: "material", line: 0, spoken: "", options: [] };
      for (let i = 0; i < s.lines.length; i++) {
        const l = s.lines[i]!;
        const m = this.ctx.materials.find((x) => x.id === l.materialId);
        if (!m) return { kind: "material", line: i, spoken: s.spoken.materials[i] ?? "", options: this.optionsFor(s.spoken.materials[i]) };
        if (!l.unit || !validUnit(m, l.unit)) return { kind: "unit", line: i, options: m.units };
        if (parseQty(l.qty) === null) return { kind: "quantity", line: i };
        const rate = parseRupees(l.rate);
        if (rate === null || rate <= 0) return { kind: "rate", line: i };
      }
    } else {
      const a = parseRupees(s.amount);
      if (a === null || a <= 0) return { kind: "amount" };
      if (s.type === "payment" && !s.mode) return { kind: "mode" };
    }
    return null;
  }
  private optionsFor(spoken?: string): MaterialRef[] {
    if (!spoken) return [];
    const m = matchMaterial(spoken, this.ctx.materials);
    return m.kind === "ambiguous" ? m.options : [];
  }

  private advance(prefix: Say[]): Output {
    const s = this.cur;
    if (!s) return this.next(prefix);
    const q = this.openQuestion(s);
    if (q?.kind === "unknownParty") { this.phase = "idle"; return this.out([...prefix, { key: "v.unknownParty", vars: { spoken: q.spoken } }], false); }
    if (q) { this.phase = "asking"; return this.out([...prefix, this.questionSay(q)], true); }
    return this.readback(prefix);
  }
  private next(prefix: Say[]): Output {
    if (this.queue.length) { this.cur = this.queue[0]!; return this.advance([...prefix, { key: "v.nextEntry" }]); }
    this.phase = "await_more"; this.misses = 0;
    return this.out([...prefix, { key: "v.again" }], true);
  }

  private questionSay(q: Question): Say {
    const n = q.kind === "material" || q.kind === "unit" || q.kind === "quantity" || q.kind === "rate" ? q.line + 1 : 0;
    switch (q.kind) {
      case "party": return q.options.length ? { key: "q.partyWhich", vars: { spoken: q.spoken ?? "" } } : { key: "q.partyAsk" };
      case "site": return { key: "q.site", vars: { spoken: q.spoken } };
      case "material": return q.options.length > 1 ? { key: "q.materialWhich", vars: { n, spoken: q.spoken, options: { list: q.options.map(matName) } } } : { key: "q.materialNone", vars: { n, spoken: q.spoken } };
      case "unit": return { key: "q.unit", vars: { n, options: { list: q.options.map((o) => ({ name: o })) } } };
      case "quantity": return { key: "q.qty", vars: { n } };
      case "rate": return { key: "q.rate", vars: { n } };
      case "amount": return { key: "q.amount" };
      case "mode": return { key: "q.mode" };
    }
  }

  // ───────── answering a question ─────────
  private onAnswer(text: string): Output {
    const s = this.cur!;
    const q = this.openQuestion(s);
    if (!q || q.kind === "unknownParty") return this.advance([]);
    let ok = false;
    switch (q.kind) {
      case "party": {
        const pool: PartyRef[] = q.options.length ? q.options : this.ctx.parties;
        const id = parseChoice(text, pool.map((p) => ({ id: p.id, names: [p.name, ...p.nicknames] })));
        if (id) { s.partyId = id; s.partyOptions = []; ok = true; }
        break;
      }
      case "site": {
        if (isNoSite(text)) { s.siteId = null; ok = true; break; }
        const id = parseChoice(text, q.options.map((o) => ({ id: o.id, names: [o.name] })));
        if (id) { s.siteId = id; ok = true; }
        break;
      }
      case "material": {
        const pool = q.options.length ? q.options : this.ctx.materials;
        const id = parseChoice(text, pool.map((m) => ({ id: m.id, names: [m.name, ...m.localNames] })));
        if (id) {
          const m = this.ctx.materials.find((x) => x.id === id)!;
          const line = s.lines[q.line] ?? (s.lines[q.line] = { qty: "", rate: "" });
          line.materialId = id; if (m.units.length === 1) line.unit = m.units[0];
          ok = true;
        }
        break;
      }
      case "unit": {
        const m = this.ctx.materials.find((x) => x.id === s.lines[q.line]!.materialId)!;
        const u = parseUnitAnswer(text, m.units);
        if (u) { s.lines[q.line]!.unit = u; ok = true; }
        break;
      }
      case "quantity": { const v = parseNumberAnswer(text); if (v !== null) { s.lines[q.line]!.qty = fmt(v); ok = true; } break; }
      case "rate": { const v = parseNumberAnswer(text); if (v !== null) { s.lines[q.line]!.rate = fmt(v); ok = true; } break; }
      case "amount": { const v = parseNumberAnswer(text); if (v !== null) { s.amount = fmt(v); ok = true; } break; }
      case "mode": { const m = parseModeAnswer(text); if (m) { s.mode = m; ok = true; } break; }
    }
    if (ok) { s.fails = 0; return this.advance([]); }
    s.fails++;
    if (s.fails >= 2) { this.phase = "idle"; return this.outManual([{ key: "v.useTap" }]); }
    return this.out([{ key: "v.repeat" }, this.questionSay(q)], true);
  }

  // ───────── read-back and corrections ─────────
  private readback(prefix: Say[]): Output {
    const s = this.cur!;
    const party = this.ctx.parties.find((p) => p.id === s.partyId)!;
    const info = this.ctx.partyInfo(party.id);
    const site = s.siteId ? party.sites.find((x) => x.id === s.siteId)?.name : undefined;
    const draft = buildDraft({ businessId: this.ctx.businessId, partyId: party.id, siteId: s.siteId ?? null, type: s.type, date: this.ctx.today, lines: s.type === "sale" || s.type === "return" ? s.lines : [], amount: s.amount, paymentMode: s.mode, source: "voice" }, this.ctx.materials);
    if (!draft.payload) { s.fails++; this.phase = "idle"; return this.outManual([{ key: "v.useTap" }]); }
    const entries = this.ctx.partyEntries(party.id);
    const oldBalance = partyBalance(info.opening, entries) + (this.session.get(party.id) ?? 0);
    const p = draft.payload;
    const eff = entryEffect({ id: "new", partyId: party.id, type: p.type, date: p.entry_date, status: "active", amount: p.type === "sale" || p.type === "return" ? undefined : p.amount, paymentMode: p.payment_mode ?? undefined, lines: p.lines.map((l) => ({ materialId: l.material_id, quantity: l.quantity, unit: l.unit, rate: l.rate })) });
    const newBalance = oldBalance + eff;
    const lines: CardLine[] = p.lines.map((l) => ({ name: this.ctx.materials.find((m) => m.id === l.material_id)?.name ?? "?", qty: l.quantity, unit: l.unit, rate: l.rate, total: l.line_total }));

    const warnings: string[] = []; const warnSay: Say[] = [];
    const cl = creditLimitWarning({ currentBalance: oldBalance, newEntryEffect: eff, creditLimit: info.creditLimit });
    if (cl.exceeded) { warnings.push("credit"); warnSay.push({ key: "v.creditWarn" }); }
    if (s.type === "sale") s.lines.forEach((l) => {
      const sug = suggestRate({ entries, partyId: party.id, materialId: l.materialId! });
      const r = parseRupees(l.rate);
      if (sug && r !== null && rateLooksUnusual(r, sug)) { warnings.push("rate"); if (!warnSay.some((w) => w.key === "v.checkRate")) warnSay.push({ key: "v.checkRate" }); }
    });

    const card: EntryCard = { partyId: party.id, party: party.name, site, type: s.type, lines, total: draft.total, paymentMode: s.mode ?? null, oldBalance, newBalance, payload: p, warnings };
    this.lastCard = card;
    this.phase = "readback";
    const siteSay: SayVar = site ? { say: { key: "v.atSite", vars: { site } } } : "";
    const base = { party: sayName(party), site: siteSay, total: { rupees: draft.total }, old: { rupees: oldBalance }, new: { rupees: newBalance } };
    let main: Say;
    if (s.type === "sale" || s.type === "return") {
      main = { key: s.type === "sale" ? "v.readSale" : "v.readReturn", vars: { ...base, lines: { say: { key: "v.lines", vars: { items: { list: [] } } } } } };
      main.vars!.lines = { say: { key: "v.joined", vars: { parts: { list: lines.map((l) => ({ name: `${l.name}|${l.qty}|${l.unit}|${l.rate}` })) } } } };
    } else if (s.type === "payment") main = { key: "v.readPayment", vars: { party: sayName(party), amount: { rupees: draft.total }, mode: { mode: s.mode! }, old: base.old, new: base.new } };
    else main = { key: "v.readFlat", vars: { kind: { say: { key: s.type === "charge" ? "v.kindCharge" : "v.kindDiscount" } }, party: sayName(party), amount: { rupees: draft.total }, old: base.old, new: base.new } };
    return this.out([...prefix, main, ...warnSay, { key: "v.tapSave" }], true);
  }

  private onReadback(text: string): Output {
    const s = this.cur!;
    if (isYes(text) && !/\d/.test(text)) return this.out([{ key: "v.tapSavePlease" }], false);
    const patch = this.parseCorrection(text, s);
    if (patch) { Object.assign(s, patch.state); s.fails = 0; return this.readback([{ key: "v.corrected" }]); }
    if (isNo(text) && !/\d/.test(text)) { this.phase = "correcting"; return this.out([{ key: "v.fixWhat" }], true); }
    s.fails++;
    if (s.fails >= 2) { this.phase = "idle"; return this.outManual([{ key: "v.cantFix" }]); }
    this.phase = "correcting";
    return this.out([{ key: "v.fixWhat" }], true);
  }

  /** "No, 40 bags" / "rate 365" / "amount 20000": change one thing without starting over. Returns null if unclear. */
  private parseCorrection(text: string, s: EntryState): { state: Partial<EntryState> } | null {
    const toks = tokenize(text);
    const spans = scanNumbers(toks);
    if (!spans.length) return null;
    const RATE = ["rate", "bhav", "bhaav", "daam", "price", "per", "bhaw", "भाव", "दर", "रेट", "दाम", "कीमत"];
    const AMT = ["amount", "rakam", "paisa", "total", "रकम", "पैसा", "रक्कम"];
    const hasRate = toks.some((w) => RATE.includes(w)), hasAmt = toks.some((w) => AMT.includes(w));
    if (s.type === "sale" || s.type === "return") {
      let idx = s.lines.length === 1 ? 0 : -1;
      if (idx === -1) for (let i = 0; i < s.lines.length; i++) { const m = this.ctx.materials.find((x) => x.id === s.lines[i]!.materialId); if (m && [m.name, ...m.localNames].some((n) => tokenize(n).every((w) => hasToken(toks, w)))) { idx = i; break; } }
      if (idx === -1) return null;
      const lines = s.lines.map((l) => ({ ...l }));
      const withUnit = spans.find((sp) => sp.end < toks.length + 1 && unitOf(toks[sp.end] ?? ""));
      if (hasRate) { lines[idx]!.rate = fmt(spans[spans.length - 1]!.value); return { state: { lines } }; }
      if (withUnit) { lines[idx]!.qty = fmt(withUnit.value); const u = unitOf(toks[withUnit.end]!); const m = this.ctx.materials.find((x) => x.id === lines[idx]!.materialId); if (u && m && m.units.includes(normalizeUnit(u))) lines[idx]!.unit = normalizeUnit(u); return { state: { lines } }; }
      return spans.length === 1 && !hasAmt ? (lines[idx]!.qty = fmt(spans[0]!.value), { state: { lines } }) : null;
    }
    return { state: { amount: fmt(spans[0]!.value) } };
  }

  /** The entry as it stands, for the owner to finish by hand in the normal form. */
  manualDraft(): { type: EntryType; partyId?: string; siteId: string | null; lines: DraftLine[]; amount: string; paymentMode: PaymentMode | null; questions: Question[] } | null {
    const s = this.cur;
    return s ? { type: s.type, partyId: s.partyId, siteId: s.siteId ?? null, lines: s.lines.map((l) => ({ ...l })), amount: s.amount, paymentMode: s.mode ?? null, questions: [] } : null;
  }

  // ───────── output ─────────
  private view(): View {
    return { phase: this.phase, card: this.phase === "readback" || this.phase === "correcting" ? this.lastCard : undefined, position: this.queue.length > 1 || this.cur ? { i: 1, n: this.queue.length } : undefined, unknownParty: this.cur?.unknownParty && !this.cur.partyId ? this.cur.unknownParty : undefined, needsManual: false, saved: this.saved };
  }
  private out(say: Say[], listen: boolean): Output { return { say, listen, view: this.view(), lang: this.lang }; }
  private outManual(say: Say[]): Output { const o = this.out(say, false); o.view.needsManual = true; return o; }
}

// ───────── turning Say intents into text (for speaking, and for the English caption) ─────────
export type Translate = (key: string, vars?: Record<string, string | number>) => string;
function renderVar(v: SayVar, lang: SpeakLang, t: Translate, spell = true): string {
  const sp = (x: string) => (spell ? spellAcronyms(x) : x);
  if (typeof v === "string" || typeof v === "number") return String(v);
  if ("rupees" in v) return rupeesToSpeech(v.rupees, lang);
  if ("qty" in v) return `${qtyToSpeech(v.qty, lang)} ${unitToSpeech(v.unit, v.qty, lang)}`;
  if ("mode" in v) return modeToSpeech(v.mode, lang);
  if ("name" in v) return sp(lang !== "en" && v.alt ? v.alt : v.name);
  if ("say" in v) return renderSay(v.say, lang, t, spell);
  return v.list.map((x) => sp(lang !== "en" && x.alt ? x.alt : x.name)).join(", ");
}
/** `spell: false` is for text on screen ("JSW"); the voice gets "J S W". */
export function renderSay(say: Say, lang: SpeakLang, t: Translate, spell = true): string {
  if (say.key === "v.joined") { // "Waddi, eighty bags, at ... each" for every line, joined
    const parts = (say.vars!.parts as { list: { name: string }[] }).list.map((p) => {
      const [name, qty, unit, rate] = p.name.split("|");
      return t("v.line", { name: spell ? spellAcronyms(name!) : name!, qty: renderVar({ qty: Number(qty), unit: unit! }, lang, t, spell), rate: rupeesToSpeech(Number(rate), lang) });
    });
    return parts.join("; ");
  }
  const vars: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(say.vars ?? {})) vars[k] = renderVar(v, lang, t, spell);
  return t(say.key, vars).replace(/\s+/g, " ").replace(/\s+([,.;:।!?])/g, "$1").trim();
}
