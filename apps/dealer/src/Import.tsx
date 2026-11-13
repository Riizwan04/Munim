import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { checkText, formatINR, parseScanJson, prepareImport, rupeesToPaise, type MaterialRef, type PreparedImport, type ScannedPage, type ScannedRow } from "@munim/ledger-core";
import { createPartyWithOpening, loadImportContext, saveEntry, scanPagePhoto, type PartyRow } from "./data";
import { localToday } from "./dates";
import { useI18n, type Key } from "./i18n";
import { rupee } from "./money";
import { FONT, useTheme } from "./theme";
import { Btn, Chip, Field, Row, Section } from "./ui";

const SCAN_ON = process.env.EXPO_PUBLIC_SCAN_FUNCTION === "1";
type Step = "party" | "source" | "review" | "running" | "done";
const MODES = ["cash", "upi", "cheque", "bank"] as const;
const KINDS = ["sale", "payment", "charge", "discount", "return"] as const;

/**
 * Import a handwritten khata page: pick the party, add the extracted data (photo scan or pasted), check it against the
 * page's own written balances, fix anything highlighted, then import. Nothing is saved until the dealer taps Import.
 */
export function Import({ businessId, parties, onClose, onDone }: { businessId: string; parties: PartyRow[]; onClose: () => void; onDone: () => void }) {
  const t = useTheme();
  const { tr } = useI18n();
  const [step, setStep] = useState<Step>("party");
  const [party, setParty] = useState<PartyRow | null>(null);
  const [newParty, setNewParty] = useState<{ name: string; phone: string } | null>(null);
  const [ctx, setCtx] = useState<{ sites: { id: string; name: string }[]; materials: MaterialRef[]; existing: { date: string; type: any; amount: number }[] }>({ sites: [], materials: [], existing: [] });
  const [text, setText] = useState("");
  const [page, setPage] = useState<ScannedPage | null>(null);
  const [skipDup, setSkipDup] = useState(true);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ i: 0, n: 0 });
  const [result, setResult] = useState<{ ok: number; failedAt?: number; error?: string }>({ ok: 0 });

  useEffect(() => { loadImportContext(party?.id ?? "").then(setCtx).catch(() => undefined); }, [party]);
  useEffect(() => { if (!party && newParty) loadImportContext("00000000-0000-0000-0000-000000000000").then(setCtx).catch(() => undefined); }, [party, newParty]);

  const prepared: PreparedImport | null = useMemo(
    () => page ? prepareImport(page, { businessId, partyId: party?.id ?? "new", materials: ctx.materials, sites: ctx.sites, existing: ctx.existing, today: localToday() }) : null,
    [page, ctx, party, businessId],
  );
  const upd = (i: number, patch: Partial<ScannedRow>) => setPage((p) => p && { ...p, rows: p.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) });

  function read(raw: string) {
    const r = parseScanJson(raw, new Date().getFullYear());
    if (r.error || !r.page) { setErr(tr("im.badData", { err: r.error ?? "" })); return; }
    setErr(""); setPage(r.page); setStep("review");
  }
  async function scan() {
    setErr("");
    const pick = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], base64: true, quality: 0.8 });
    if (pick.canceled || !pick.assets[0]?.base64) return;
    setBusy(true);
    try { read(await scanPagePhoto(pick.assets[0].base64, pick.assets[0].mimeType ?? "image/jpeg")); }
    catch (e: any) { setErr(tr("im.scanFail", { err: e.message ?? String(e) })); }
    setBusy(false);
  }

  const toImport = prepared ? prepared.entries.filter((e) => !(skipDup && e.duplicate)) : [];
  async function run() {
    if (!prepared || !page) return;
    setStep("running"); setProgress({ i: 0, n: toImport.length });
    let ok = 0;
    try {
      let pid = party?.id;
      if (!pid && newParty) pid = await createPartyWithOpening(businessId, newParty.name.trim(), newParty.phone.trim(), rupeesToPaise(page.openingBalance ?? 0));
      for (let k = 0; k < toImport.length; k++) {
        setProgress({ i: k + 1, n: toImport.length });
        try { await saveEntry({ ...toImport[k]!.payload!, party_id: pid! }); ok++; }
        catch (e: any) { setResult({ ok, failedAt: k + 1, error: e.message ?? String(e) }); setStep("done"); onDone(); return; }
      }
      setResult({ ok }); setStep("done"); onDone();
    } catch (e: any) { setResult({ ok, failedAt: 0, error: e.message ?? String(e) }); setStep("done"); onDone(); }
  }

  const head = (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14, borderBottomWidth: 2, borderColor: t.ink }}>
      <Text style={{ fontSize: FONT.title - 2, fontWeight: "700", color: t.ink, flexShrink: 1 }}>{tr("im.title")}</Text>
      <Pressable onPress={onClose} accessibilityRole="button" style={{ minHeight: 48, justifyContent: "center", paddingHorizontal: 8 }}><Text style={{ fontSize: FONT.body, color: t.accent, fontWeight: "600" }}>{tr("im.back")}</Text></Pressable>
    </View>
  );
  const body = { padding: 16, gap: 18 } as const;

  if (step === "party") return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>{head}
      <ScrollView contentContainerStyle={body} keyboardShouldPersistTaps="handled">
        <Section title={tr("im.pickParty")}>
          <Row>
            {parties.map((p) => <Chip key={p.id} label={p.name} on={party?.id === p.id} onPress={() => { setParty(p); setNewParty(null); }} />)}
            <Chip label={tr("im.newParty")} on={!!newParty} onPress={() => { setParty(null); setNewParty({ name: "", phone: "" }); }} />
          </Row>
        </Section>
        {newParty && <Row wrap={false}><Field label={tr("im.partyName")} nativeID="ip-name" value={newParty.name} onChangeText={(v) => setNewParty({ ...newParty, name: v })} /><Field label={tr("im.phone")} nativeID="ip-phone" keyboardType="phone-pad" value={newParty.phone} onChangeText={(v) => setNewParty({ ...newParty, phone: v })} /></Row>}
        <Row wrap={false}><Btn label="›" disabled={!party && !(newParty && newParty.name.trim() && newParty.phone.trim().length >= 8)} onPress={() => setStep("source")} /></Row>
      </ScrollView>
    </View>
  );

  if (step === "source") return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>{head}
      <ScrollView contentContainerStyle={body} keyboardShouldPersistTaps="handled">
        <Text style={{ fontSize: FONT.title - 4, fontWeight: "700", color: t.fg }}>{party?.name ?? newParty?.name}</Text>
        <Section title={tr("im.how")}>
          <Row wrap={false}><Btn label={busy ? tr("im.scanning") : tr("im.scan")} disabled={!SCAN_ON || busy} onPress={scan} /></Row>
          {!SCAN_ON && <Text style={{ fontSize: FONT.small, color: t.muted }}>{tr("im.scanOff")}</Text>}
          {busy && <ActivityIndicator />}
        </Section>
        <Section title={tr("im.paste")}>
          <Field label="" nativeID="im-paste" multiline value={text} onChangeText={(v) => { setText(v); setErr(""); }} placeholder={tr("im.pastePh")} />
        </Section>
        {err ? <Text style={{ color: t.due, fontSize: FONT.body }}>{err}</Text> : null}
        <Row wrap={false}><Btn label={tr("im.read")} disabled={!text.trim()} onPress={() => read(text)} /></Row>
      </ScrollView>
    </View>
  );

  if (step === "running") return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>{head}<View style={{ padding: 24, gap: 14 }}><ActivityIndicator /><Text style={{ fontSize: FONT.body, color: t.fg, textAlign: "center" }}>{tr("im.importing", { i: progress.i, n: progress.n })}</Text></View></View>
  );

  if (step === "done") return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>{head}
      <View style={{ padding: 20, gap: 16 }}>
        <Text style={{ fontSize: FONT.title, fontWeight: "700", color: result.error ? t.due : t.paid }}>{tr("im.done", { n: result.ok })}</Text>
        {result.error ? <Text style={{ fontSize: FONT.body, color: t.due }}>{tr("im.failed", { n: result.failedAt ?? 0, err: result.error })}</Text> : null}
        <Row wrap={false}><Btn label={tr("im.reportsLink")} onPress={onClose} /><Btn kind="ghost" label={tr("im.again")} onPress={() => { setPage(null); setText(""); setStep("party"); setParty(null); setNewParty(null); }} /></Row>
      </View>
    </View>
  );

  // ───────── review ─────────
  const rec = prepared!.reconciliation;
  const rowProblems = (i: number) => prepared!.problems.filter((p) => p.row === i);
  const rowIssue = (i: number) => rec.rowIssues.some((x) => x.row === i);
  const dupRows = new Set(prepared!.entries.filter((e) => e.duplicate).flatMap((e) => e.rows));
  const canImport = prepared!.ready && toImport.length > 0;
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>{head}
      <ScrollView contentContainerStyle={body} keyboardShouldPersistTaps="handled">
        <Text style={{ fontSize: FONT.title - 4, fontWeight: "700", color: t.fg }}>{party?.name ?? newParty?.name} · {tr("im.review")}</Text>

        <View style={{ padding: 12, gap: 6, borderRadius: 12, borderWidth: 2, borderColor: rec.ok ? t.paid : t.due, backgroundColor: t.surface }}>
          <Text style={{ fontSize: FONT.body, fontWeight: "700", color: rec.ok ? t.paid : t.due }}>{rec.ok ? tr("im.allMatch") : tr("im.mismatch")}</Text>
          {rec.checks.filter((c) => !c.ok).map((c, i) => <Text key={i} style={{ fontSize: FONT.small, color: t.due }}>{c.label === "total" ? tr("im.totalCheck", { w: formatINR(c.written), c: formatINR(c.computed) }) : tr("im.balanceCheck", { n: (c.afterRow ?? 0) + 1, w: formatINR(c.written), c: formatINR(c.computed) })}</Text>)}
          <Text style={{ fontSize: FONT.small, color: t.muted }}>{tr("im.opening", { v: rupee(rec.opening) })} · {newParty ? tr("im.openingNew") : tr("im.openingExisting")}</Text>
        </View>

        {page!.rows.map((r, i) => {
          const probs = rowProblems(i);
          const bad = probs.some((p) => p.code !== "amount-drift") || rowIssue(i);
          const kind = r.kind ?? (r.item ? "sale" : r.mode ? "payment" : "sale");
          const items = kind === "sale" || kind === "return";
          return (
            <View key={i} style={{ gap: 10, padding: 12, borderRadius: 12, borderWidth: 2, borderColor: bad ? t.due : t.line, backgroundColor: dupRows.has(i) ? t.rule : t.surface }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontSize: FONT.body, fontWeight: "700", color: t.ink }}>{tr("im.row", { n: i + 1 })}</Text>
                {dupRows.has(i) ? <Text style={{ fontSize: FONT.small, color: t.muted }}>{tr("im.dup")}</Text> : bad ? <Text style={{ fontSize: FONT.small, color: t.due }}>{tr("im.rowIssue")}</Text> : null}
              </View>
              <Row>{KINDS.map((k) => <Chip key={k} label={tr(`type.${k}` as Key)} on={kind === k} onPress={() => upd(i, { kind: k })} />)}</Row>
              <Row wrap={false}>
                <Field label={tr("im.date")} nativeID={`r${i}-date`} value={r.date ?? ""} onChangeText={(v) => upd(i, { date: v })} autoCapitalize="none" />
                {items && <Field label={tr("im.qty")} nativeID={`r${i}-qty`} keyboardType="decimal-pad" value={r.qty === undefined ? "" : String(r.qty)} onChangeText={(v) => upd(i, { qty: v === "" ? undefined : Number(v.replace(/,/g, "")) || 0 })} />}
                {items && <Field label={tr("im.unit")} nativeID={`r${i}-unit`} value={r.unit ?? ""} onChangeText={(v) => upd(i, { unit: v })} autoCapitalize="none" />}
              </Row>
              <Row wrap={false}>
                {items && <Field label={tr("im.item")} nativeID={`r${i}-item`} value={r.item ?? ""} onChangeText={(v) => upd(i, { item: v })} />}
                <Field label={tr("im.amount")} nativeID={`r${i}-amt`} keyboardType="decimal-pad" value={r.amount === undefined ? "" : String(r.amount)} onChangeText={(v) => upd(i, { amount: v === "" ? undefined : Number(v.replace(/,/g, "")) || 0 })} />
              </Row>
              {items && <Field label={tr("im.site")} nativeID={`r${i}-site`} value={r.site ?? ""} onChangeText={(v) => upd(i, { site: v || undefined })} />}
              {kind === "payment" && <Row>{MODES.map((m) => <Chip key={m} label={tr(`mode.${m}` as Key)} on={r.mode === m} onPress={() => upd(i, { mode: m })} />)}</Row>}

              {probs.map((p, k) => (
                <View key={k} style={{ gap: 6 }}>
                  {p.code === "material" && <><Text style={{ fontSize: FONT.small, color: t.due }}>{tr("im.pMaterial", { spoken: p.spoken })}</Text><Row>{(p.options.length ? p.options : ctx.materials).map((m) => <Chip key={m.id} label={m.name} onPress={() => upd(i, { item: m.name })} />)}</Row></>}
                  {p.code === "unit" && <><Text style={{ fontSize: FONT.small, color: t.due }}>{tr("im.pUnit")}</Text><Row>{p.options.map((u) => <Chip key={u} label={u} onPress={() => upd(i, { unit: u })} />)}</Row></>}
                  {p.code === "site" && <><Text style={{ fontSize: FONT.small, color: t.due }}>{tr("im.pSite", { spoken: p.spoken })}</Text><Row>{p.options.map((s) => <Chip key={s.id} label={s.name} onPress={() => upd(i, { site: s.name })} />)}</Row></>}
                  {p.code === "mode" && <Text style={{ fontSize: FONT.small, color: t.due }}>{tr("im.pMode")}</Text>}
                  {p.code === "amount-drift" && <Text style={{ fontSize: FONT.small, color: t.muted }}>{tr("im.pDrift", { w: formatINR(p.written), c: formatINR(p.computed) })}</Text>}
                </View>
              ))}
            </View>
          );
        })}

        {prepared!.entries.some((e) => e.duplicate) && (
          <Pressable onPress={() => setSkipDup(!skipDup)} accessibilityRole="checkbox" accessibilityState={{ checked: skipDup }} style={{ flexDirection: "row", gap: 12, alignItems: "center", minHeight: 48 }}>
            <View style={{ width: 28, height: 28, borderRadius: 7, borderWidth: 3, borderColor: skipDup ? t.paid : t.line, backgroundColor: skipDup ? t.paid : "transparent", alignItems: "center", justifyContent: "center" }}>{skipDup ? <Text style={{ color: "#fff", fontWeight: "700" }}>✓</Text> : null}</View>
            <Text style={{ fontSize: FONT.body, color: t.fg, flexShrink: 1 }}>{tr("im.skipDup")}</Text>
          </Pressable>
        )}
        {!prepared!.ready && <Text style={{ fontSize: FONT.body, color: t.due }}>{tr("im.fixFirst")}</Text>}
        <Row wrap={false}><Btn label={tr("im.importBtn", { n: toImport.length })} disabled={!canImport} onPress={run} /></Row>
      </ScrollView>
    </View>
  );
}
