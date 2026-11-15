import { isDone, isNo, isNoSite, isYes, parseChoice, parseModeAnswer, parseNumberAnswer, parseUnitAnswer, detectSpokenLang, type Choice } from "./answers";
import { buildDraft, parseQty, parseRupees, type DraftLine, type EntryPayload } from "./entryDraft";
import { entryEffect, partyBalance, creditLimitWarning } from "./ledger";
import { findMaterial } from "./assistant";
import { looksLikeQuestion } from "./ask";
import { matchMaterial, NEW_ITEM_UNITS, validUnit, type MaterialRef } from "./materials";
import type { Paise } from "./money";
import { rateLooksUnusual, suggestRate } from "./rates";
import { dateToSpeech, qtyToSpeech, rupeesToSpeech, spellAcronyms, unitToSpeech, modeToSpeech, type SpeakLang } from "./speak";
import { hasToken, isDevanagari } from "./phonetic";
import { hasQuestionWord, lastPayment, lastPurchase, parseSpokenDate, partyIn, routeCommand, stripWakeWord, topDue, totalDue, type AssistantAction, type Command, type Overview } from "./assistant";
import { scanNumbers, tokenize } from "./spoken";
import type { Entry, EntryType, PaymentMode } from "./types";
import { heuristicUnderstand, normalizeUnit, resolveUtterance, unitOf, type ParsedUtterance, type PartyRef, type Question, type UnderstandContext } from "./understand";

/**
 * The conversation with the shop owner. Pure logic: it is told what was heard and returns what to say (as language-free
 * "Say" intents), whether to listen next, and what to show. It never saves anything: saving is the owner's tap.
 * All money is computed by code (buildDraft); the voice only fills in the blanks.
 */
export type SayVar = string | number | { rupees: Paise } | { qty: number; unit: string } | { name: string; alt?: string } | { mode: PaymentMode } | { date: string } | { unit: string } | { prose: string } | { say: Say } | { list: { name: string; alt?: string }[] };
export interface Say { key: string; vars?: Record<string, SayVar> }

export type Phase = "idle" | "await_entries" | "asking" | "readback" | "correcting" | "await_more" | "ended" | "cmd_party" | "cmd_item";
export interface CardLine { name: string; qty: number; unit: string; rate: Paise; total: Paise; isNew?: boolean }
export interface EntryCard {
  date: string; partyId: string; party: string; site?: string; type: EntryType; lines: CardLine[]; total: Paise;
  paymentMode?: PaymentMode | null; oldBalance: Paise; newBalance: Paise; payload: EntryPayload; warnings: string[];
}
export interface View { phase: Phase; card?: EntryCard; position?: { i: number; n: number }; unknownParty?: string; needsManual: boolean; saved: number }
export interface Output { say: Say[]; listen: boolean; view: View; lang: SpeakLang; /** something for the app to open or prepare (the owner then taps) */ action?: AssistantAction }

export interface DialogueCtx {
  businessId: string; today: string; parties: PartyRef[]; materials: MaterialRef[];
  partyInfo(partyId: string): { name: string; opening: Paise; creditLimit: Paise | null };
  /** Active entries of the party, including any still waiting to upload. */
  partyEntries(partyId: string): Entry[];
  /** The AI reader is available: questions the rules cannot answer are sent to it (see `ask`). */
  canAsk?: boolean;
  /** What this business called its assistant ("Jarvis"): the name that wakes it. */
  assistantName?: string;
  /** The customer whose page is open: "add 20 bags for this person" means them. */
  currentPartyId?: string;
  /** Everyone's balances and today's totals, for "how much is outstanding in total?". */
  overview?(): Overview;
  understand?: (text: string, ctx: UnderstandContext) => ParsedUtterance;
  /** Makes the id of an item said aloud that is not in the list yet (a real uuid in the app). */
  newId?: () => string;
}

interface EntryState {
  date?: string; type: EntryType; partyId?: string; partyOptions: PartyRef[]; siteId?: string | null; lines: DraftLine[]; amount: string; mode?: PaymentMode | null;
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
  private newCount = 0;
  private pendingCmd: Command | null = null;

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

  /** `parsed` = what the AI extractor made of this sentence; without it the built-in rules read it. */
  heard(text: string, parsed?: ParsedUtterance): Output {
    // the language is the owner's choice in Settings: it never flips because a word or number was said in another language
    text = stripWakeWord(text, this.ctx.assistantName || "munim").rest || text;
    switch (this.phase) {
      case "cmd_party": case "cmd_item": return this.onCmdAnswer(text);
      case "await_entries": case "await_more": return this.onEntries(text, parsed);
      case "asking": return this.onAnswer(text);
      case "readback": case "correcting": return this.onReadback(text);
      case "idle": return this.onEntries(text, parsed);
      default: return this.out([], false);
    }
  }

  /** The owner tapped Save and the entry was stored (on the server or in the phone's outbox). */
  savedEntry(): Output {
    const card = this.lastCard;
    if (card) {
      this.session.set(card.partyId, (this.session.get(card.partyId) ?? 0) + (card.type === "payment" || card.type === "discount" || card.type === "return" ? -card.total : card.total));
    }
    for (const nm of card?.payload.new_materials ?? []) { const m = this.ctx.materials.find((x) => x.id === nm.id); if (m) delete m.isNew; } // now in the shop's list
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
  private onEntries(text: string, given?: ParsedUtterance): Output {
    if (this.phase === "await_more" || this.saved > 0) {
      if (isDone(text)) { this.phase = "ended"; return this.out([{ key: "v.done", vars: { n: this.saved } }], false); }
      if (isYes(text) && tokenize(text).length <= 2) { this.phase = "await_more"; return this.out([{ key: "v.goAhead" }], true); }
    }
    // a question or a command for Munim ("Santosh ka kitna baaki hai", "reports kholo") is not a ledger entry
    const cmd = routeCommand(text, { parties: this.ctx.parties, materials: this.ctx.materials, currentPartyId: this.ctx.currentPartyId });
    if (cmd) return this.runCommand(cmd);
    // any other question about the books goes to the AI reader (read-only tools on the owner's own data)
    const qNums = scanNumbers(tokenize(text)).length > 0;
    if (looksLikeQuestion(text, qNums, hasQuestionWord(text))) {
      if (this.ctx.canAsk) { this.phase = "await_more"; const o = this.out([], false); o.action = { kind: "ask", text }; return o; }
      this.phase = "await_more"; return this.out([{ key: "a.noReader" }], true); // never read a question as an entry
    }
    const uctx: UnderstandContext = { parties: this.ctx.parties, materials: this.ctx.materials, currentPartyId: this.ctx.currentPartyId };
    const date = parseSpokenDate(text, this.ctx.today) ?? undefined;
    const parsed = given ?? (this.ctx.understand ?? heuristicUnderstand)(text, uctx);
    const resolved = resolveUtterance(parsed, uctx);
    if (resolved.length === 0 && looksLikeQuestion(text, qNums, hasQuestionWord(text))) { this.phase = "await_more"; return this.out([{ key: "a.noReader" }], true); }
    if (resolved.length === 0) {
      this.misses++;
      if (this.misses >= 2) { this.phase = "idle"; return this.out([{ key: "v.notUnderstood" }, { key: "v.useTap" }], false); }
      this.phase = this.saved > 0 ? "await_more" : "await_entries";
      return this.out([{ key: "v.notUnderstood" }], true);
    }
    this.misses = 0;
    this.queue = resolved.map((r) => ({ ...this.fromResolved(r), date }));
    this.cur = this.queue[0]!;
    return this.advance(this.queue.length > 1 ? [{ key: "v.several", vars: { n: this.queue.length } }] : []);
  }

  private fromResolved(r: ReturnType<typeof resolveUtterance>[number]): EntryState {
    const pq = r.questions.find((q) => q.kind === "party") as Extract<Question, { kind: "party" }> | undefined;
    const sq = r.questions.find((q) => q.kind === "site") as Extract<Question, { kind: "site" }> | undefined;
    const spokenMat: (string | undefined)[] = [];
    for (const q of r.questions) if (q.kind === "material") spokenMat[q.line] = q.spoken;
    // an item the shop never listed becomes a NEW item (created on Save); saying it twice is the same item
    for (const ni of r.newItems) {
      let m = this.ctx.materials.find((x) => x.isNew && x.name.toLowerCase() === ni.name.toLowerCase());
      if (!m) { m = { id: this.ctx.newId?.() ?? `new-${Date.now()}-${++this.newCount}`, name: ni.name, category: null, localNames: [], units: ni.unit ? [ni.unit] : [...NEW_ITEM_UNITS], isNew: true }; this.ctx.materials.push(m); }
      else if (ni.unit && !m.units.includes(ni.unit)) m.units = [ni.unit];
      const line = r.lines[ni.line]!;
      line.materialId = m.id; line.unit = ni.unit ?? (m.units.length === 1 ? m.units[0] : undefined);
    }
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
        if (u) { s.lines[q.line]!.unit = u; if (m.isNew) m.units = [u]; ok = true; }
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
    const draft = buildDraft({ businessId: this.ctx.businessId, partyId: party.id, siteId: s.siteId ?? null, type: s.type, date: s.date ?? this.ctx.today, lines: s.type === "sale" || s.type === "return" ? s.lines : [], amount: s.amount, paymentMode: s.mode, source: "voice" }, this.ctx.materials);
    if (!draft.payload) { s.fails++; this.phase = "idle"; return this.outManual([{ key: "v.useTap" }]); }
    const entries = this.ctx.partyEntries(party.id);
    const oldBalance = partyBalance(info.opening, entries) + (this.session.get(party.id) ?? 0);
    const p = draft.payload;
    const eff = entryEffect({ id: "new", partyId: party.id, type: p.type, date: p.entry_date, status: "active", amount: p.type === "sale" || p.type === "return" ? undefined : p.amount, paymentMode: p.payment_mode ?? undefined, lines: p.lines.map((l) => ({ materialId: l.material_id, quantity: l.quantity, unit: l.unit, rate: l.rate })) });
    const newBalance = oldBalance + eff;
    const lines: CardLine[] = p.lines.map((l) => { const m = this.ctx.materials.find((x) => x.id === l.material_id); return { name: m?.name ?? "?", qty: l.quantity, unit: l.unit, rate: l.rate, total: l.line_total, isNew: m?.isNew || undefined }; });
    const fresh = new Map<string, NonNullable<EntryPayload["new_materials"]>[number]>();
    for (const l of p.lines) { const m = this.ctx.materials.find((x) => x.id === l.material_id); if (m?.isNew) fresh.set(m.id, { id: m.id, name: m.name, category: m.category ?? null, units: [l.unit] }); }
    if (fresh.size) p.new_materials = [...fresh.values()];

    const warnings: string[] = []; const warnSay: Say[] = [];
    const cl = creditLimitWarning({ currentBalance: oldBalance, newEntryEffect: eff, creditLimit: info.creditLimit });
    if (cl.exceeded) { warnings.push("credit"); warnSay.push({ key: "v.creditWarn" }); }
    if (s.type === "sale") s.lines.forEach((l) => {
      const sug = suggestRate({ entries, partyId: party.id, materialId: l.materialId! });
      const r = parseRupees(l.rate);
      if (sug && r !== null && rateLooksUnusual(r, sug)) { warnings.push("rate"); if (!warnSay.some((w) => w.key === "v.checkRate")) warnSay.push({ key: "v.checkRate" }); }
    });

    const card: EntryCard = { date: p.entry_date, partyId: party.id, party: party.name, site, type: s.type, lines, total: draft.total, paymentMode: s.mode ?? null, oldBalance, newBalance, payload: p, warnings };
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
    const newNote: Say[] = lines.filter((l) => l.isNew).slice(0, 1).map((l) => ({ key: "v.newItemNote", vars: { name: l.name } }));
    const dateNote: Say[] = p.entry_date !== this.ctx.today ? [{ key: "v.dateNote", vars: { date: { date: p.entry_date } } }] : [];
    return this.out([...prefix, main, ...dateNote, ...newNote, ...warnSay, { key: "v.tapSave" }], true);
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

  /** The AI reader's answer to a free question (null = it could not be reached). */
  answeredFree(text: string | null): Output {
    this.phase = "await_more"; this.misses = 0;
    return this.out([text ? { key: "a.free", vars: { text: { prose: text } } } : { key: "a.askFailed" }], true);
  }

  // ───────── questions and commands ─────────
  private partyRef(id: string): PartyRef | undefined { return this.ctx.parties.find((p) => p.id === id); }
  private runCommand(cmd: Command): Output {
    this.misses = 0; this.pendingCmd = null;
    const act = (action: AssistantAction, say: Say): Output => { this.phase = "await_entries"; const o = this.out([say], false); o.action = action; return o; };
    switch (cmd.kind) {
      case "needParty": this.pendingCmd = cmd; this.phase = "cmd_party"; return this.out([{ key: "q.partyAsk" }], true);
      case "needItem": this.pendingCmd = cmd; this.phase = "cmd_item"; return this.out([{ key: "a.askItem" }], true);
      case "goto": return act({ kind: "goto", screen: cmd.screen }, { key: "c.goto", vars: { screen: { say: { key: `n.${cmd.screen}` } } } });
      case "open": { const p = this.partyRef(cmd.partyId)!; return act({ kind: "open", partyId: p.id }, { key: "c.opening", vars: { name: sayName(p) } }); }
      case "remind": { const p = this.partyRef(cmd.partyId)!; return act({ kind: "remind", partyId: p.id }, { key: "c.remind", vars: { party: sayName(p) } }); }
      case "newParty": return act({ kind: "newParty", name: cmd.name, phone: cmd.phone }, { key: "c.newParty" });
      case "query": this.phase = "await_more"; return this.out([this.answer(cmd)], true);
    }
  }
  private onCmdAnswer(text: string): Output {
    const c = this.pendingCmd;
    if (!c) return this.advance([]);
    const toks = tokenize(text);
    if (c.kind === "needParty") {
      const p = partyIn(toks, this.ctx.parties);
      if (p) {
        if (c.then === "remind") return this.runCommand({ kind: "remind", partyId: p.id });
        if (c.then === "open") return this.runCommand({ kind: "open", partyId: p.id });
        if (c.then === "lastRate") {
          const m = c.materialText ? findMaterial(c.materialText, tokenize(c.materialText), this.ctx.materials) : null;
          return m ? this.runCommand({ kind: "query", q: "lastRate", partyId: p.id, materialId: m.id }) : this.runCommand({ kind: "needItem", partyId: p.id });
        }
        return this.runCommand({ kind: "query", q: c.then, partyId: p.id });
      }
    } else if (c.kind === "needItem") {
      const m = findMaterial(text, toks, this.ctx.materials);
      if (m) return this.runCommand({ kind: "query", q: "lastRate", partyId: c.partyId, materialId: m.id });
    }
    this.misses++;
    if (this.misses >= 2) { this.misses = 0; this.pendingCmd = null; this.phase = "idle"; return this.out([{ key: "v.notUnderstood" }], false); }
    return this.out([{ key: "v.repeat" }, { key: c.kind === "needItem" ? "a.askItem" : "q.partyAsk" }], true);
  }

  /** The answer to a question about the books, built from the ledger (never guessed). */
  private answer(cmd: Extract<Command, { kind: "query" }>): Say {
    if (cmd.q === "totalDue" || cmd.q === "topDue" || cmd.q === "today") {
      const o = this.ctx.overview?.();
      if (!o) return { key: "a.unknown" };
      if (cmd.q === "today") return { key: "a.today", vars: { sales: { rupees: o.todaySales }, coll: { rupees: o.todayCollections } } };
      if (cmd.q === "totalDue") { const t = totalDue(o); return { key: "a.totalDue", vars: { amount: { rupees: t.total }, n: t.n } }; }
      const top = topDue(o)[0];
      if (!top) return { key: "a.nobodyOwes" };
      const p = this.partyRef(top.id);
      return { key: "a.topDue", vars: { party: p ? sayName(p) : top.name, amount: { rupees: top.balance } } };
    }
    const pc = cmd as Extract<Command, { kind: "query"; partyId: string }>;
    const p = this.partyRef(pc.partyId)!; const party = sayName(p);
    const info = this.ctx.partyInfo(p.id); const entries = this.ctx.partyEntries(p.id);
    const matName = (id: string) => this.ctx.materials.find((m) => m.id === id)?.name ?? "?";
    switch (pc.q) {
      case "balance": { const bal = partyBalance(info.opening, entries); return bal > 0 ? { key: "a.balance", vars: { party, amount: { rupees: bal } } } : bal < 0 ? { key: "a.balanceAdvance", vars: { party, amount: { rupees: -bal } } } : { key: "a.balanceClear", vars: { party } }; }
      case "lastPayment": { const lp = lastPayment(entries); return !lp ? { key: "a.noPayment", vars: { party } } : lp.mode ? { key: "a.lastPaymentMode", vars: { party, date: { date: lp.date }, amount: { rupees: lp.amount }, mode: { mode: lp.mode } } } : { key: "a.lastPayment", vars: { party, date: { date: lp.date }, amount: { rupees: lp.amount } } }; }
      case "lastPurchase": { const lp = lastPurchase(entries, matName); return !lp ? { key: "a.noPurchase", vars: { party } } : { key: "a.lastPurchase", vars: { party, date: { date: lp.date }, items: { list: lp.items.map((n) => ({ name: n })) }, amount: { rupees: lp.total } } }; }
      case "lastRate": {
        let best: { date: string; rate: Paise; unit: string; id: string } | undefined;
        for (const e of entries) if (e.status === "active" && e.type === "sale") for (const l of e.lines ?? []) if (l.materialId === (pc as { materialId: string }).materialId && (!best || e.date > best.date || (e.date === best.date && e.id > best.id))) best = { date: e.date, rate: l.rate, unit: l.unit, id: e.id };
        const m = this.ctx.materials.find((x) => x.id === (pc as { materialId: string }).materialId)!;
        return best ? { key: "a.lastRate", vars: { party, item: matName(m.id), rate: { rupees: best.rate }, unit: { unit: best.unit }, date: { date: best.date } } } : { key: "a.noRate", vars: { party, item: matName(m.id) } };
      }
    }
  }

  /** The entry as it stands, for the owner to finish by hand in the normal form. */
  manualDraft(): { type: EntryType; partyId?: string; siteId: string | null; lines: DraftLine[]; amount: string; paymentMode: PaymentMode | null; questions: Question[] } | null {
    const s = this.cur;
    return s ? { type: s.type, partyId: s.partyId, siteId: s.siteId ?? null, lines: s.lines.map((l) => ({ ...l, materialId: this.ctx.materials.find((m) => m.id === l.materialId)?.isNew ? undefined : l.materialId })), amount: s.amount, paymentMode: s.mode ?? null, questions: [] } : null;
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
  if ("date" in v) return dateToSpeech(v.date, lang);
  if ("prose" in v) return spell ? v.prose.replace(/₹\s?([\d,]+(?:\.\d+)?)/g, (_, n: string) => rupeesToSpeech(Math.round(Number(n.replace(/,/g, "")) * 100), lang)) : v.prose; // spoken: amounts in words
  if ("unit" in v) return unitToSpeech(v.unit, 1000, lang);
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
