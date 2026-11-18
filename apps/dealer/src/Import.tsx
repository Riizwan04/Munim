import { createElement, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Linking, Platform, Pressable, ScrollView, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { IMPORT_TEMPLATE, checkText, formatINR, parseScanJson, partyIn, prepareImport, rupeesToPaise, tableToPage, tokenize, type MaterialRef, type PreparedImport, type ScannedPage, type ScannedRow } from "@munim/ledger-core";
import { createPartyWithOpening, loadImportContext, saveEntry, saveMaterial, scanPagePhoto, setOpeningBalance, type PartyRow } from "./data";
import { shareText } from "./share";
import { localToday } from "./dates";
import { useI18n, type Key } from "./i18n";
import { rupee } from "./money";
import { fe } from "./errors";
import { FONT, useTheme, HEAD } from "./theme";
import { Btn, Chip, Field, Row, Section } from "./ui";

const SCAN_ON = process.env.EXPO_PUBLIC_SCAN_FUNCTION === "1";
type Step = "hub" | "photo" | "opening" | "party" | "source" | "review" | "running" | "done";
type Method = "photo" | "sheet" | "scan" | "opening";
/** A file picked in the browser (photo, PDF, CSV). Native phones use the photo library for pictures. */
const pickWebFile = (accept: string) => new Promise<File | null>((res) => { if (Platform.OS !== "web" || typeof document === "undefined") return res(null); const i = document.createElement("input"); i.type = "file"; i.accept = accept; i.onchange = () => res(i.files?.[0] ?? null); i.click(); });
const MODES = ["cash", "upi", "cheque", "bank"] as const;
const KINDS = ["sale", "payment", "charge", "discount", "return"] as const;

/**
 * Import a handwritten khata page: pick the party, add the extracted data (photo scan or pasted), check it against the
 * page's own written balances, fix anything highlighted, then import. Nothing is saved until the dealer taps Import.
 */
export function Import({ businessId, parties, onClose, onDone, initialParty }: { businessId: string; parties: PartyRow[]; onClose: () => void; onDone: () => void; initialParty?: PartyRow }) {
  const t = useTheme();
  const { tr } = useI18n();
  const [step, setStep] = useState<Step>("hub");
  const [method, setMethod] = useState<Method | null>(null);
  const [party, setParty] = useState<PartyRow | null>(initialParty ?? null);
  const [photo, setPhoto] = useState<{ uri: string; kind: "image" | "pdf" } | null>(null);
  const [photoH, setPhotoH] = useState(260);
  const [showPhoto, setShowPhoto] = useState(true);
  const [openVals, setOpenVals] = useState<Record<string, string>>({});
  const [openBase, setOpenBase] = useState<Record<string, number>>({}); // the old balances as they are saved right now (paise), updated on every Save
  const [info, setInfo] = useState("");
  const [newParty, setNewParty] = useState<{ name: string; phone: string } | null>(null);
  const [ctx, setCtx] = useState<{ sites: { id: string; name: string }[]; materials: MaterialRef[]; existing: { date: string; type: any; amount: number }[] }>({ sites: [], materials: [], existing: [] });
  const [text, setText] = useState("");
  const [page, setPage] = useState<ScannedPage | null>(null);
  const [skipDup, setSkipDup] = useState(true);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ i: 0, n: 0 });
  const [result, setResult] = useState<{ ok: number; failedAt?: number; error?: string }>({ ok: 0 });

  const [ctxReady, setCtxReady] = useState(false); // rows are only judged against your items once those are loaded
  useEffect(() => { loadImportContext(party?.id ?? "").then((c) => { setCtx(c); setCtxReady(true); }).catch(() => setCtxReady(true)); }, [party]);
  useEffect(() => { if (!party && newParty) loadImportContext("00000000-0000-0000-0000-000000000000").then((c) => { setCtx(c); setCtxReady(true); }).catch(() => setCtxReady(true)); }, [party, newParty]);

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
    catch (e: any) { setErr(tr("im.scanFail", { err: fe(e) })); }
    setBusy(false);
  }

  // ───────── ways to bring old entries in ─────────
  const goMethod = (m: Method) => { setMethod(m); setErr(""); setInfo(""); if (m === "opening") { setOpenVals(Object.fromEntries(parties.map((p) => [p.id, p.opening ? String(p.opening / 100) : ""]))); setOpenBase(Object.fromEntries(parties.map((p) => [p.id, p.opening]))); setStep("opening"); } else if (party) setStep(m === "photo" ? "photo" : "source"); else setStep("party"); };
  const afterParty = () => setStep(method === "photo" ? "photo" : "source");
  function startTyping(p: { uri: string; kind: "image" | "pdf" }) { setPhoto(p); setShowPhoto(true); setPage({ rows: [{}], year: new Date().getFullYear() }); setStep("review"); }
  async function pickImage(camera: boolean) {
    setErr("");
    const r = camera ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.8 }) : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (!r.canceled && r.assets[0]?.uri) startTyping({ uri: r.assets[0].uri, kind: "image" });
  }
  async function pickPdf() { const f = await pickWebFile("application/pdf,.pdf"); if (f) startTyping({ uri: URL.createObjectURL(f), kind: "pdf" }); }
  /** Rows from a sheet (CSV text or pasted cells) — or, if it is the AI-style JSON, that. Only the chosen customer's rows are used. */
  function readTable(raw: string) {
    if (raw.trim().startsWith("{")) { read(raw); return; }
    const who = party ?? { id: "new", name: newParty?.name ?? "", nicknames: [], sites: [] };
    const r = tableToPage(raw, { year: new Date().getFullYear(), forParty: (n) => !!partyIn(tokenize(n), [{ id: who.id, name: who.name, nicknames: [], sites: [] }]) });
    if (r.error || !r.page) { setErr(r.error === "columns" ? tr("im2.badColumns") : tr("im2.noRows")); return; }
    setErr(""); setInfo(r.skippedOtherParties ? tr("im2.otherParties", { n: r.skippedOtherParties }) : ""); setPhoto(null); setPage(r.page); setStep("review");
  }
  async function pickCsv() { const f = await pickWebFile(".csv,.tsv,.txt,text/csv,text/plain"); if (f) readTable(await f.text()); }
  const addRow = () => setPage((p) => p && ({ ...p, rows: [...p.rows, { date: p.rows[p.rows.length - 1]?.date, kind: p.rows[p.rows.length - 1]?.kind }] }));
  const delRow = (i: number) => setPage((p) => p && ({ ...p, rows: p.rows.length > 1 ? p.rows.filter((_, j) => j !== i) : p.rows }));
  async function createItem(i: number, name: string) {
    try { await saveMaterial(businessId, { name, category: "", units: [page?.rows[i]?.unit?.trim() || "nos"], localNames: [] }); setCtx(await loadImportContext(party?.id ?? "00000000-0000-0000-0000-000000000000")); upd(i, { item: name }); }
    catch (e: any) { setErr(fe(e)); }
  }
  async function saveOpening() {
    setBusy(true); let n = 0;
    try { for (const p of parties) { const v = (openVals[p.id] ?? "").replace(/,/g, "").trim(); const paise = v === "" ? 0 : rupeesToPaise(Number(v)); if (Number.isFinite(paise) && paise !== (openBase[p.id] ?? p.opening)) { await setOpeningBalance(p.id, paise); setOpenBase((b) => ({ ...b, [p.id]: paise })); n++; } } setInfo(tr("im2.openDone", { n })); onDone(); }
    catch (e: any) { setErr(fe(e)); }
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
        catch (e: any) { setResult({ ok, failedAt: k + 1, error: fe(e) }); setStep("done"); onDone(); return; }
      }
      setResult({ ok }); setStep("done"); onDone();
    } catch (e: any) { setResult({ ok, failedAt: 0, error: fe(e) }); setStep("done"); onDone(); }
  }

  const head = (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14, borderBottomWidth: 2, borderColor: t.ink }}>
      <Text style={{ fontFamily: HEAD, fontSize: FONT.title - 2, color: t.ink, flexShrink: 1 }}>{tr("im.title")}</Text>
      <Pressable onPress={onClose} accessibilityRole="button" style={{ minHeight: 48, justifyContent: "center", paddingHorizontal: 8 }}><Text style={{ fontSize: FONT.body, color: t.accent, fontWeight: "600" }}>{tr("im.back")}</Text></Pressable>
    </View>
  );
  const body = { padding: 16, gap: 18 } as const;

  const tile = (icon: string, title: string, sub: string, onPress: () => void, off?: boolean) => (
    <Pressable onPress={onPress} disabled={off} accessibilityRole="button" accessibilityLabel={title} style={{ flexDirection: "row", gap: 14, alignItems: "center", padding: 16, borderRadius: 16, borderWidth: 1.5, borderColor: t.line, backgroundColor: t.surface, opacity: off ? 0.5 : 1, minHeight: 78 }}>
      <Text style={{ fontSize: 30 }}>{icon}</Text>
      <View style={{ flex: 1 }}><Text style={{ fontSize: FONT.body + 1, fontWeight: "800", color: t.ink }}>{title}</Text><Text style={{ fontSize: FONT.small, color: t.muted }}>{sub}</Text></View>
      <Text style={{ fontSize: 22, color: t.muted }}>›</Text>
    </Pressable>
  );
  if (step === "hub") return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>{head}
      <ScrollView contentContainerStyle={body}>
        <Text style={{ fontSize: FONT.body, color: t.muted }}>{tr("im2.hubSub")}</Text>
        {tile("📷", tr("im2.mPhoto"), tr("im2.mPhotoSub"), () => goMethod("photo"))}
        {tile("📄", tr("im2.mSheet"), tr("im2.mSheetSub"), () => goMethod("sheet"))}
        {tile("💰", tr("im2.mOpening"), tr("im2.mOpeningSub"), () => goMethod("opening"))}
        {tile("✨", tr("im2.mScan"), tr("im2.mScanSub"), () => goMethod("scan"), !SCAN_ON)}
      </ScrollView>
    </View>
  );

  if (step === "opening") return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>{head}
      <ScrollView contentContainerStyle={body} keyboardShouldPersistTaps="handled">
        <Text style={{ fontFamily: HEAD, fontSize: FONT.title - 2, color: t.ink }}>{tr("im2.openTitle")}</Text>
        <Text style={{ fontSize: FONT.small, color: t.muted }}>{tr("im2.openSub")}</Text>
        {parties.map((p) => <Field key={p.id} label={p.name} nativeID={`ob-${p.id}`} keyboardType="decimal-pad" value={openVals[p.id] ?? ""} onChangeText={(v) => setOpenVals({ ...openVals, [p.id]: v })} placeholder="0" />)}
        {info ? <Text style={{ fontSize: FONT.body, color: t.paid, fontWeight: "700" }}>{info}</Text> : null}
        {err ? <Text style={{ color: t.due }}>{err}</Text> : null}
        <Row wrap={false}><Btn label={busy ? "…" : tr("im2.openSave")} disabled={busy} onPress={saveOpening} /></Row>
      </ScrollView>
    </View>
  );

  if (step === "photo") return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>{head}
      <ScrollView contentContainerStyle={body}>
        <Text style={{ fontFamily: HEAD, fontSize: FONT.title - 4, color: t.fg }}>{party?.name ?? newParty?.name}</Text>
        <Text style={{ fontSize: FONT.body, color: t.muted }}>{tr("im2.photoHint")}</Text>
        <Row wrap={false}><Btn label={tr("im2.choosePhoto")} onPress={() => pickImage(false)} /></Row>
        <Row wrap={false}><Btn kind="ghost" label={tr("im2.takePhoto")} onPress={() => pickImage(true)} /></Row>
        {Platform.OS === "web" ? <Row wrap={false}><Btn kind="ghost" label={tr("im2.choosePdf")} onPress={pickPdf} /></Row> : null}
        {err ? <Text style={{ color: t.due }}>{err}</Text> : null}
      </ScrollView>
    </View>
  );

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
        <Row wrap={false}><Btn label="›" disabled={!party && !(newParty && newParty.name.trim() && newParty.phone.trim().length >= 8)} onPress={afterParty} /></Row>
      </ScrollView>
    </View>
  );

  if (step === "source") return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>{head}
      <ScrollView contentContainerStyle={body} keyboardShouldPersistTaps="handled">
        <Text style={{ fontFamily: HEAD, fontSize: FONT.title - 4, color: t.fg }}>{party?.name ?? newParty?.name}</Text>
        {method === "scan" ? (
          <Section title={tr("im.how")}>
            <Row wrap={false}><Btn label={busy ? tr("im.scanning") : tr("im.scan")} disabled={!SCAN_ON || busy} onPress={scan} /></Row>
            {!SCAN_ON && <Text style={{ fontSize: FONT.small, color: t.muted }}>{tr("im.scanOff")}</Text>}
            {busy && <ActivityIndicator />}
          </Section>
        ) : (
          <>
            <Text style={{ fontSize: FONT.small, color: t.muted }}>{tr("im2.sheetHint")}</Text>
            {Platform.OS === "web" ? <Row wrap={false}><Btn label={tr("im2.chooseFile")} onPress={pickCsv} /></Row> : null}
            <Row wrap={false}><Btn kind="ghost" label={tr("im2.template")} onPress={async () => { await shareText(IMPORT_TEMPLATE); }} /></Row>
            <Section title={tr("im2.pasteTable")}>
              <Field label="" nativeID="im-paste" multiline value={text} onChangeText={(v) => { setText(v); setErr(""); }} placeholder={tr("im.pastePh")} />
            </Section>
          </>
        )}
        {err ? <Text style={{ color: t.due, fontSize: FONT.body }}>{err}</Text> : null}
        {method !== "scan" ? <Row wrap={false}><Btn label={tr("im.read")} disabled={!text.trim()} onPress={() => readTable(text)} /></Row> : null}
      </ScrollView>
    </View>
  );

  if (step === "running") return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>{head}<View style={{ padding: 24, gap: 14 }}><ActivityIndicator /><Text style={{ fontSize: FONT.body, color: t.fg, textAlign: "center" }}>{tr("im.importing", { i: progress.i, n: progress.n })}</Text></View></View>
  );

  if (step === "done") return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>{head}
      <View style={{ padding: 20, gap: 16 }}>
        <Text style={{ fontFamily: HEAD, fontSize: FONT.title, color: result.error ? t.due : t.paid }}>{tr("im.done", { n: result.ok })}</Text>
        {result.error ? <Text style={{ fontSize: FONT.body, color: t.due }}>{tr("im.failed", { n: result.failedAt ?? 0, err: result.error })}</Text> : null}
        <Row wrap={false}><Btn label={tr("im.reportsLink")} onPress={onClose} /><Btn kind="ghost" label={tr("im.again")} onPress={() => { setPage(null); setText(""); setPhoto(null); setMethod(null); setStep("hub"); setParty(initialParty ?? null); setNewParty(null); }} /></Row>
      </View>
    </View>
  );

  if (!ctxReady) return <View style={{ flex: 1, backgroundColor: t.bg }}>{head}<View style={{ padding: 24 }}><ActivityIndicator /></View></View>;
  // ───────── review ─────────
  const rec = prepared!.reconciliation;
  const rowProblems = (i: number) => prepared!.problems.filter((p) => p.row === i);
  const rowIssue = (i: number) => rec.rowIssues.some((x) => x.row === i);
  const dupRows = new Set(prepared!.entries.filter((e) => e.duplicate).flatMap((e) => e.rows));
  const canImport = prepared!.ready && toImport.length > 0;
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>{head}
      {photo ? (
        <View style={{ borderBottomWidth: 2, borderColor: t.ink, backgroundColor: t.surface }} testID="photo-pane">
          <View style={{ flexDirection: "row", gap: 8, padding: 8, alignItems: "center" }}>
            <Chip label={showPhoto ? tr("im2.hidePhoto") : tr("im2.showPhoto")} on={showPhoto} onPress={() => setShowPhoto(!showPhoto)} />
            {showPhoto ? <Chip label={tr("im2.bigger")} onPress={() => setPhotoH(Math.min(560, photoH + 120))} /> : null}
            {showPhoto ? <Chip label={tr("im2.smaller")} onPress={() => setPhotoH(Math.max(140, photoH - 120))} /> : null}
          </View>
          {showPhoto ? (
            <View style={{ height: photoH, backgroundColor: "#00000012" }}>
              {photo.kind === "pdf"
                ? (Platform.OS === "web" ? createElement("iframe", { src: photo.uri, style: { width: "100%", height: "100%", border: 0 }, title: "page" }) : <Pressable onPress={() => Linking.openURL(photo.uri)}><Text style={{ padding: 16, color: t.accent }}>{tr("im2.openPdf")}</Text></Pressable>)
                : <ScrollView nestedScrollEnabled contentContainerStyle={{ alignItems: "center" }}><Image testID="photo-img" source={{ uri: photo.uri }} style={{ width: "100%", height: photoH * 1.8 }} resizeMode="contain" /></ScrollView>}
            </View>
          ) : null}
        </View>
      ) : null}
      <ScrollView contentContainerStyle={body} keyboardShouldPersistTaps="handled">
        <Text style={{ fontFamily: HEAD, fontSize: FONT.title - 4, color: t.fg }}>{party?.name ?? newParty?.name} · {tr("im.review")}</Text>
        {info ? <Text style={{ fontSize: FONT.small, color: t.muted }}>{info}</Text> : null}
        <Row wrap={false}>
          <Field label={tr("im2.pageTop")} nativeID="pg-top" keyboardType="decimal-pad" value={page!.openingBalance === undefined ? "" : String(page!.openingBalance)} onChangeText={(v) => setPage((p) => p && ({ ...p, openingBalance: v.trim() === "" ? undefined : Number(v.replace(/,/g, "")) || 0 }))} />
          <Field label={tr("im2.pageBottom")} nativeID="pg-bottom" keyboardType="decimal-pad" value={page!.balances?.length ? String(page!.balances[page!.balances.length - 1]!.balance) : ""} onChangeText={(v) => setPage((p) => p && ({ ...p, balances: v.trim() === "" ? [] : [{ afterRow: p.rows.length - 1, balance: Number(v.replace(/,/g, "")) || 0 }] }))} />
        </Row>

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
                <Pressable onPress={() => delRow(i)} accessibilityRole="button" accessibilityLabel={tr("im2.removeRow")}><Text style={{ fontSize: FONT.small, color: t.muted }}>✕ {tr("im2.removeRow")}</Text></Pressable>
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
                  {p.code === "material" && <><Text style={{ fontSize: FONT.small, color: t.due }}>{tr("im.pMaterial", { spoken: p.spoken })}</Text><Row>{(p.options.length ? p.options : ctx.materials).map((m) => <Chip key={m.id} label={m.name} onPress={() => upd(i, { item: m.name })} />)}<Chip label={tr("im2.newItem", { name: p.spoken })} onPress={() => void createItem(i, p.spoken)} /></Row></>}
                  {p.code === "unit" && <><Text style={{ fontSize: FONT.small, color: t.due }}>{tr("im.pUnit")}</Text><Row>{p.options.map((u) => <Chip key={u} label={u} onPress={() => upd(i, { unit: u })} />)}</Row></>}
                  {p.code === "site" && <><Text style={{ fontSize: FONT.small, color: t.due }}>{tr("im.pSite", { spoken: p.spoken })}</Text><Row>{p.options.map((s) => <Chip key={s.id} label={s.name} onPress={() => upd(i, { site: s.name })} />)}</Row></>}
                  {p.code === "mode" && <Text style={{ fontSize: FONT.small, color: t.due }}>{tr("im.pMode")}</Text>}
                  {p.code === "amount-drift" && <Text style={{ fontSize: FONT.small, color: t.muted }}>{tr("im.pDrift", { w: formatINR(p.written), c: formatINR(p.computed) })}</Text>}
                </View>
              ))}
            </View>
          );
        })}

        <Row wrap={false}><Btn kind="ghost" label={tr("im2.addRow")} onPress={addRow} /></Row>
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
