import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import {
  buildDraft, creditLimitWarning, entryEffect, partyBalance, rateLooksUnusual, suggestRate,
  type DraftLine, type Entry, type EntryType, type MaterialRef, type PaymentMode, type Question, type ResolvedEntry,
} from "@munim/ledger-core";
import { createParty, createSite, editEntry, loadEntry, loadMaterials, loadPartyContext, saveEntry, type PartyRow } from "./data";
import { localToday } from "./dates";
import { rupee } from "./money";
import { FONT, useTheme } from "./theme";
import { Btn, Chip, Field, Row, Section } from "./ui";

const TYPES: { k: EntryType; label: string }[] = [
  { k: "sale", label: "Maal diya (Sale)" }, { k: "payment", label: "Paisa mila (Payment)" },
  { k: "charge", label: "Gaadi bhada / Charge" }, { k: "discount", label: "Discount" },
];
const MODES: { k: PaymentMode; label: string }[] = [
  { k: "cash", label: "Cash" }, { k: "upi", label: "Online (UPI)" }, { k: "cheque", label: "Cheque" }, { k: "bank", label: "Bank" },
];
const today = localToday;
const blank = (): DraftLine => ({ qty: "", rate: "" });

export function questionText(q: Question): string {
  const n = (l: number) => `Item ${l + 1}`;
  switch (q.kind) {
    case "party": return q.options.length ? `Kaun se ${q.spoken}? Neeche se chuniye.` : q.spoken ? `"${q.spoken}" naam ki party nahi mili. Nayi party banayein?` : "Kis party ki entry hai?";
    case "site": return `"${q.spoken}" site nahi mili. Chuniye ya nayi banaiye.`;
    case "material": return q.options.length > 1 ? `${n(q.line)}: kaun sa ${q.spoken}? ${q.options.map((o) => o.name).join(" / ")}` : `${n(q.line)}: "${q.spoken}" nahi mila. Chuniye.`;
    case "unit": return `${n(q.line)}: kis unit mein? (${q.options.join(" / ")})`;
    case "quantity": return `${n(q.line)}: kitna?`;
    case "rate": return `${n(q.line)}: rate batao (₹ per unit)`;
    case "amount": return "Kitni rakam?";
    case "mode": return "Kaise mila? Cash / UPI / Cheque / Bank";
  }
}

interface Props {
  prefill?: ResolvedEntry; transcript?: string; queueLabel?: string; onSkip?: () => void;
  businessId: string; parties: PartyRow[]; initialParty?: PartyRow; editingId?: string;
  onDone: (party: PartyRow | undefined) => void; onCancel: () => void;
}

export function AddEntry({ businessId, parties, initialParty, editingId, onDone, onCancel, prefill, transcript, queueLabel, onSkip }: Props) {
  const t = useTheme();
  const [materials, setMaterials] = useState<MaterialRef[]>([]);
  const [party, setParty] = useState<PartyRow | undefined>(initialParty);
  const [ctx, setCtx] = useState<{ sites: { id: string; name: string }[]; entries: Entry[] }>({ sites: [], entries: [] });
  const [siteId, setSiteId] = useState<string | null>(null);
  const [type, setType] = useState<EntryType>("sale");
  const [date, setDate] = useState(today());
  const [lines, setLines] = useState<DraftLine[]>([blank()]);
  const [pick, setPick] = useState<number | null>(0); // which line's item picker is open
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<PaymentMode | null>(null);
  const [reason, setReason] = useState("");
  const [review, setReview] = useState(false);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [newParty, setNewParty] = useState<{ name: string; phone: string } | null>(null);
  const [newSite, setNewSite] = useState<string | null>(null);
  const [partyList, setPartyList] = useState(parties);

  useEffect(() => {
    if (!prefill) return;
    const p = partyList.find((x) => x.id === prefill.partyId);
    if (p) setParty(p);
    setSiteId(prefill.siteId ?? null); setType(prefill.type);
    if (prefill.lines.length) { setLines(prefill.lines); setPick(prefill.lines.findIndex((l) => !l.materialId)); }
    setAmount(prefill.amount); setMode(prefill.paymentMode ?? null);
    const unk = prefill.questions.find((q) => q.kind === "party" && q.options.length === 0 && q.spoken);
    if (unk && unk.kind === "party") setNewParty({ name: (unk.spoken ?? "").replace(/\b\w/g, (c) => c.toUpperCase()), phone: "" });
    setTouched(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { loadMaterials().then(setMaterials).catch((e) => setErr(e.message)); }, []);
  useEffect(() => { if (party) loadPartyContext(party.id).then(setCtx).catch((e) => setErr(e.message)); }, [party]);
  useEffect(() => {
    if (!editingId) return;
    loadEntry(editingId).then((d) => {
      setParty(partyList.find((p) => p.id === d.partyId)); setSiteId(d.siteId); setType(d.type as EntryType); setDate(d.date);
      setAmount(d.lines.length ? "" : String(d.amount / 100)); setMode((d.paymentMode as PaymentMode) ?? null);
      setLines(d.lines.length ? d.lines.map((l) => ({ materialId: l.materialId, unit: l.unit, qty: String(l.qty / 1000), rate: String(l.rate / 100) })) : [blank()]);
      setPick(null);
    }).catch((e) => setErr(e.message));
  }, [editingId]); // eslint-disable-line react-hooks/exhaustive-deps

  const isItems = type === "sale";
  const draft = useMemo(
    () => party ? buildDraft({ businessId, partyId: party.id, siteId, type, date, lines: isItems ? lines : [], amount, paymentMode: mode, source: prefill ? "voice" : "manual", transcript }, materials) : null,
    [party, businessId, siteId, type, date, lines, amount, mode, materials, isItems],
  );
  const cats = useMemo(() => [...new Set(materials.map((m) => m.category ?? "Other"))], [materials]);

  const upd = (i: number, patch: Partial<DraftLine>) => { setTouched(true); setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l))); };

  // Balance preview for the review card — all arithmetic from ledger-core.
  const preview = useMemo(() => {
    if (!party || !draft?.payload) return null;
    const others = editingId ? ctx.entries.filter((e) => e.id !== editingId) : ctx.entries;
    const before = partyBalance(party.opening, others);
    const p = draft.payload;
    const asEntry: Entry = { id: "new", partyId: party.id, type: p.type, date: p.entry_date, status: "active", amount: p.type === "sale" ? undefined : p.amount,
      lines: p.lines.map((l) => ({ materialId: l.material_id, quantity: l.quantity, unit: l.unit, rate: l.rate })), paymentMode: p.payment_mode ?? undefined };
    const eff = entryEffect(asEntry);
    return { before, after: before + eff, credit: creditLimitWarning({ currentBalance: before, newEntryEffect: eff, creditLimit: party.creditLimit }) };
  }, [party, draft, ctx.entries, editingId]);

  const warnings = useMemo(() => {
    const w: string[] = [];
    if (preview?.credit.exceeded) w.push(`Credit limit paar ho raha hai (limit ${rupee(party!.creditLimit!)})`);
    if (isItems && party) lines.forEach((l, i) => {
      if (!l.materialId) return;
      const s = suggestRate({ entries: ctx.entries, partyId: party.id, materialId: l.materialId });
      const r = Number(l.rate.replace(/,/g, "")) * 100;
      if (s && r > 0 && rateLooksUnusual(r, s)) w.push(`Item ${i + 1}: rate ${rupee(r)} pichle rate ${rupee(s.rate)} se bahut alag hai. Sahi hai?`);
    });
    return w;
  }, [preview, isItems, lines, ctx.entries, party]);

  async function save() {
    if (!draft?.payload) return;
    setBusy(true); setErr("");
    try {
      if (editingId) await editEntry(editingId, draft.payload, reason.trim());
      else await saveEntry(draft.payload);
      onDone(party);
    } catch (e: any) { setErr(e.message ?? String(e)); setBusy(false); }
  }

  const needReason = !!editingId && reason.trim() === "";
  const title = editingId ? "Entry badlo" : "Nayi entry";

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14, borderBottomWidth: 2, borderColor: t.ink }}>
        <Text style={{ fontSize: FONT.title, fontWeight: "700", color: t.ink }}>{title}</Text>
        <Pressable onPress={onCancel} accessibilityRole="button" style={{ minHeight: 48, justifyContent: "center", paddingHorizontal: 8 }}>
          <Text style={{ fontSize: FONT.body, color: t.accent, fontWeight: "600" }}>Band karo ✕</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 20 }} keyboardShouldPersistTaps="handled">
        {err ? <Text style={{ color: t.due, fontSize: FONT.body }}>{err}</Text> : null}

        {prefill && !review && (
          <View style={{ gap: 6, padding: 12, borderRadius: 12, backgroundColor: t.surface, borderWidth: 2, borderColor: t.accent }}>
            <Text style={{ fontSize: FONT.small, color: t.muted }}>{queueLabel ? `${queueLabel} · ` : ""}Maine suna: “{transcript}”</Text>
            {prefill.questions.length > 0
              ? <>{prefill.questions.map((q, i) => <Text key={i} style={{ fontSize: FONT.body, fontWeight: "600", color: t.fg }}>• {questionText(q)}</Text>)}</>
              : <Text style={{ fontSize: FONT.body, fontWeight: "600", color: t.paid }}>Sab mil gaya. Dekh kar confirm kijiye.</Text>}
          </View>
        )}

        {!review ? (<>
          <Section title="Party">
            <Row>
              {partyList.map((p) => <Chip key={p.id} label={p.name} on={party?.id === p.id} onPress={() => { if (!editingId) { setParty(p); setSiteId(null); } }} />)}
              {!editingId && <Chip label="+ Nayi party" onPress={() => setNewParty({ name: "", phone: "" })} />}
            </Row>
            {newParty && (
              <View style={{ gap: 8 }}>
                <Row wrap={false}><Field label="Naam" nativeID="np-name" value={newParty.name} onChangeText={(v) => setNewParty({ ...newParty, name: v })} />
                  <Field label="Phone" nativeID="np-phone" keyboardType="phone-pad" value={newParty.phone} onChangeText={(v) => setNewParty({ ...newParty, phone: v })} /></Row>
                <Row><Btn label="Party banao" disabled={!newParty.name.trim() || newParty.phone.trim().length < 8} onPress={async () => {
                  try {
                    const id = await createParty(businessId, newParty.name.trim(), newParty.phone.trim());
                    const p: PartyRow = { id, name: newParty.name.trim(), phone: newParty.phone.trim(), opening: 0, balance: 0, creditLimit: null, nicknames: [], language: "hi", overdueDays: null };
                    setPartyList([...partyList, p]); setParty(p); setNewParty(null);
                  } catch (e: any) { setErr(e.message); }
                }} /><Btn kind="ghost" label="Rehne do" onPress={() => setNewParty(null)} /></Row>
              </View>
            )}
          </Section>

          {party && (<>
            <Section title="Kya hua?">
              <Row>{TYPES.map((x) => <Chip key={x.k} label={x.label} on={type === x.k} onPress={() => !editingId && setType(x.k)} />)}</Row>
            </Section>

            {type === "sale" && (
              <Section title="Site (optional)">
                <Row>
                  <Chip label="Koi nahi" on={siteId === null} onPress={() => setSiteId(null)} />
                  {ctx.sites.map((s) => <Chip key={s.id} label={s.name} on={siteId === s.id} onPress={() => setSiteId(s.id)} />)}
                  <Chip label="+ Nayi site" onPress={() => setNewSite("")} />
                </Row>
                {newSite !== null && (
                  <Row wrap={false}>
                    <Field label="Site ka naam" nativeID="ns-name" value={newSite} onChangeText={setNewSite} />
                    <View style={{ justifyContent: "flex-end" }}>
                      <Btn label="Add" disabled={!newSite.trim()} onPress={async () => {
                        try { const id = await createSite(businessId, party.id, newSite.trim()); setCtx({ ...ctx, sites: [...ctx.sites, { id, name: newSite.trim() }] }); setSiteId(id); setNewSite(null); }
                        catch (e: any) { setErr(e.message); }
                      }} />
                    </View>
                  </Row>
                )}
              </Section>
            )}

            {isItems && lines.map((l, i) => {
              const m = materials.find((x) => x.id === l.materialId);
              const sug = m ? suggestRate({ entries: ctx.entries, partyId: party.id, materialId: m.id }) : undefined;
              return (
                <View key={i} style={{ gap: 10, padding: 12, borderWidth: 2, borderColor: t.line, borderRadius: 12, backgroundColor: t.surface }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={{ fontSize: FONT.body, fontWeight: "700", color: t.ink }}>Item {i + 1}{m ? `: ${m.name}` : ""}</Text>
                    {lines.length > 1 && <Pressable onPress={() => setLines(lines.filter((_, j) => j !== i))} style={{ minHeight: 44, justifyContent: "center" }}><Text style={{ color: t.due, fontSize: FONT.body }}>Hatao</Text></Pressable>}
                  </View>
                  {(pick === i || !m) ? (
                    <View style={{ gap: 8 }}>
                      {cats.map((c) => (
                        <View key={c} style={{ gap: 6 }}>
                          <Text style={{ fontSize: FONT.small, color: t.muted }}>{c}</Text>
                          <Row>{materials.filter((x) => (x.category ?? "Other") === c).map((x) => (
                            <Chip key={x.id} label={x.name} on={l.materialId === x.id} onPress={() => { upd(i, { materialId: x.id, unit: x.units.length === 1 ? x.units[0] : undefined }); setPick(null); }} />
                          ))}</Row>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Pressable onPress={() => setPick(i)}><Text style={{ color: t.accent, fontSize: FONT.small }}>Item badlo</Text></Pressable>
                  )}
                  {m && m.units.length > 1 && <Row>{m.units.map((u) => <Chip key={u} label={u} on={l.unit === u} onPress={() => upd(i, { unit: u })} />)}</Row>}
                  {m && (
                    <>
                      <Row wrap={false}>
                        <Field label={`Quantity${l.unit ? ` (${l.unit})` : ""}`} nativeID={`qty-${i}`} keyboardType="decimal-pad" value={l.qty} onChangeText={(v) => upd(i, { qty: v })} />
                        <Field label={`Rate per ${l.unit ?? "unit"} (₹) *`} nativeID={`rate-${i}`} keyboardType="decimal-pad" value={l.rate} onChangeText={(v) => upd(i, { rate: v })} />
                      </Row>
                      {sug && (
                        <Pressable onPress={() => upd(i, { rate: String(sug.rate / 100) })} accessibilityRole="button">
                          <Text style={{ fontSize: FONT.small, color: t.accent }}>Pichli baar ₹{sug.rate / 100} tha ({sug.date}). Wahi lagao?</Text>
                        </Pressable>
                      )}
                      {draft && draft.lineTotals[i] !== undefined && <Text style={{ fontSize: FONT.body, fontWeight: "700", color: t.fg }}>= {rupee(draft.lineTotals[i]!)}</Text>}
                    </>
                  )}
                </View>
              );
            })}
            {isItems && <Row><Chip label="+ Aur item" onPress={() => { setLines([...lines, blank()]); setPick(lines.length); }} /></Row>}

            {!isItems && (
              <Section title="Amount">
                <Field label="Rakam (₹)" nativeID="amount" keyboardType="decimal-pad" value={amount} onChangeText={(v) => { setTouched(true); setAmount(v); }} />
                {type === "payment" && <Row>{MODES.map((x) => <Chip key={x.k} label={x.label} on={mode === x.k} onPress={() => setMode(x.k)} />)}</Row>}
              </Section>
            )}

            <Section title="Tareekh">
              <Row wrap={false}><Field label="YYYY-MM-DD" nativeID="date" value={date} onChangeText={setDate} autoCapitalize="none" />
                <View style={{ justifyContent: "flex-end" }}><Chip label="Aaj" on={date === today()} onPress={() => setDate(today())} /></View></Row>
            </Section>

            {editingId && <Field label="Badalne ka karan (zaroori)" nativeID="reason" value={reason} onChangeText={setReason} placeholder="jaise: bag 40 the, 50 nahi" />}

            {touched && draft && draft.errors.length > 0 && (
              <View style={{ gap: 2 }}>{draft.errors.map((e) => <Text key={e} style={{ color: t.due, fontSize: FONT.small }}>• {e}</Text>)}</View>
            )}
            <Row wrap={false}><Btn label="Dekho aur save karo ›" disabled={!draft?.payload || needReason} onPress={() => setReview(true)} />{onSkip && <Btn kind="ghost" label="Chhodo" onPress={onSkip} />}</Row>
          </>)}
        </>) : (
          // ───────── Review: read-back before saving (FR-25, FR-40) ─────────
          <View style={{ gap: 14 }}>
            <Text style={{ fontSize: FONT.title, fontWeight: "700", color: t.fg }}>{party!.name}{siteId ? ` · ${ctx.sites.find((s) => s.id === siteId)?.name}` : ""}</Text>
            <Text style={{ fontSize: FONT.small, color: t.muted }}>{date}</Text>
            {draft!.payload!.lines.map((l, i) => {
              const m = materials.find((x) => x.id === l.material_id);
              return <Text key={i} style={{ fontSize: FONT.body + 1, color: t.fg }}>{m?.name}: {l.quantity / 1000} {l.unit} × {rupee(l.rate)} = <Text style={{ fontWeight: "700" }}>{rupee(l.line_total)}</Text></Text>;
            })}
            {type !== "sale" && <Text style={{ fontSize: FONT.body + 1, color: t.fg }}>{TYPES.find((x) => x.k === type)?.label}{mode ? ` · ${MODES.find((x) => x.k === mode)?.label}` : ""}: <Text style={{ fontWeight: "700" }}>{rupee(draft!.total)}</Text></Text>}
            <View style={{ borderTopWidth: 2, borderColor: t.ink, paddingTop: 12, gap: 4 }}>
              <Text style={{ fontSize: FONT.body, color: t.muted }}>Entry total: <Text style={{ color: t.fg, fontWeight: "700" }}>{rupee(draft!.total)}</Text></Text>
              <Text style={{ fontSize: FONT.body, color: t.muted }}>Purana baaki: {rupee(preview!.before)}</Text>
              <Text style={{ fontSize: FONT.big, fontWeight: "700", color: preview!.after > 0 ? t.due : t.paid }}>Naya baaki: {rupee(preview!.after)}</Text>
            </View>
            {warnings.map((w) => <Text key={w} style={{ color: t.due, fontSize: FONT.body, fontWeight: "600" }}>⚠ {w}</Text>)}
            {editingId && <Text style={{ color: t.muted, fontSize: FONT.small }}>Karan: {reason}</Text>}
            {busy ? <ActivityIndicator /> : (
              <Row wrap={false}>
                <Btn label="Haan, Save" onPress={save} />
                <Btn kind="ghost" label="Badlo" onPress={() => setReview(false)} />
              </Row>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
