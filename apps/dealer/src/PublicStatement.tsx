import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Platform, ScrollView, Text, TextInput, View } from "react-native";
import { buildStatement, isPublicError, payloadToStatementInput, statementHtml, type Lang, type PublicStatementPayload } from "@munim/ledger-core";
import { fetchPublicStatement } from "./data";
import { localToday } from "./dates";
import { LANGS, translate, type Key } from "./i18n";
import { rupee } from "./money";
import { sharePdf } from "./share";
import { StatementCard } from "./StatementCard";
import { FONT, useTheme, HEAD } from "./theme";
import { Btn, Chip, Row, Section } from "./ui";

type Phase = "loading" | "pin" | "ready" | "invalid" | "locked" | "error";
type Period = "month" | "30" | "all";
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function fromDate(p: Period): string | undefined {
  const now = new Date();
  if (p === "month") return iso(new Date(now.getFullYear(), now.getMonth(), 1));
  if (p === "30") { const d = new Date(now); d.setDate(d.getDate() - 30); return iso(d); }
  return undefined;
}

/**
 * The customer's page: opened from the link the shop sent, with no app and no login. They enter the last 4 digits of their
 * phone number and see ONLY their own account, read-only. The server decides what they may see (get_statement).
 */
export function PublicStatement({ token }: { token: string }) {
  const t = useTheme();
  const [lang, setLang] = useState<Lang>("en");
  const T = (k: Key, v?: Record<string, string | number>) => translate(lang, k, v);
  const [phase, setPhase] = useState<Phase>("loading");
  const [data, setData] = useState<PublicStatementPayload | null>(null);
  const [pin, setPin] = useState("");
  const [wrong, setWrong] = useState(false);
  const [busy, setBusy] = useState(false);
  const [period, setPeriod] = useState<Period>("month");
  const [siteId, setSiteId] = useState<string | null>(null);

  useEffect(() => { // keep the page and its link out of search engines and referrer headers
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    for (const [name, content] of [["robots", "noindex,nofollow"], ["referrer", "no-referrer"]] as const) {
      const m = document.createElement("meta"); m.name = name; m.content = content; document.head.appendChild(m);
    }
    document.title = "Statement";
  }, []);

  async function load(code?: string) {
    setBusy(true);
    try {
      const r = await fetchPublicStatement(token, code);
      if (isPublicError(r)) {
        setWrong(r.error === "wrong_pin");
        setPhase(r.error === "pin_required" || r.error === "wrong_pin" ? "pin" : r.error === "locked" ? "locked" : "invalid");
      } else {
        setData(r); setPhase("ready");
        const l = r.party.language; if (l === "hi" || l === "mr" || l === "en") setLang(l);
      }
    } catch { setPhase("error"); }
    setBusy(false);
  }
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const stmt = useMemo(() => data && buildStatement(payloadToStatementInput(data, { from: fromDate(period), to: localToday(), siteId, lang })), [data, period, siteId, lang]);
  const wrap = { width: "100%" as const, maxWidth: 560, alignSelf: "center" as const, padding: 16, gap: 18 };
  const langChips = <Row>{LANGS.map((l) => <Chip key={l.k} label={l.label} on={lang === l.k} onPress={() => setLang(l.k)} />)}</Row>;
  const Shell = ({ children }: { children: React.ReactNode }) => (
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
      <View style={wrap}>{children}<Text style={{ fontSize: 13, color: t.muted, textAlign: "center", marginTop: 12 }}>{T("ps.footer")}</Text></View>
    </ScrollView>
  );

  if (phase === "loading") return <Shell><ActivityIndicator style={{ marginTop: 60 }} /><Text style={{ textAlign: "center", color: t.muted, fontSize: FONT.body }}>{T("ps.loading")}</Text></Shell>;
  if (phase === "invalid" || phase === "locked" || phase === "error") return (
    <Shell>{langChips}<Text style={{ fontFamily: HEAD, fontSize: FONT.title - 2, color: t.due }}>{T(phase === "locked" ? "ps.locked" : phase === "error" ? "ps.error" : "ps.invalid")}</Text></Shell>
  );
  if (phase === "pin") return (
    <Shell>
      {langChips}
      <Text style={{ fontFamily: HEAD, fontSize: FONT.title - 2, color: t.ink }}>{T("ps.pinTitle")}</Text>
      <TextInput nativeID="ps-pin" value={pin} onChangeText={(v) => { setPin(v.replace(/\D/g, "").slice(0, 4)); setWrong(false); }} keyboardType="number-pad" maxLength={4} placeholder={T("ps.pinPh")} placeholderTextColor={t.muted}
        onSubmitEditing={() => pin.length === 4 && load(pin)} style={{ borderWidth: 2, borderColor: wrong ? t.due : t.line, backgroundColor: t.surface, color: t.fg, borderRadius: 12, padding: 16, fontSize: 28, letterSpacing: 8, textAlign: "center" }} />
      {wrong ? <Text style={{ color: t.due, fontSize: FONT.body, fontWeight: "600" }}>{T("ps.wrongPin")}</Text> : null}
      <Row wrap={false}><Btn label={T("ps.open")} disabled={pin.length !== 4 || busy} onPress={() => load(pin)} /></Row>
    </Shell>
  );

  const d = data!;
  return (
    <Shell>
      {langChips}
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: FONT.small, color: t.muted }}>{T("ps.from", { business: d.business.name })}</Text>
        {d.business.tagline ? <Text style={{ fontSize: FONT.small, color: t.muted }}>{d.business.tagline}</Text> : null}
        <Text style={{ fontFamily: HEAD, fontSize: FONT.title, color: t.ink }}>{T("ps.balanceOf", { name: d.party.name })}</Text>
      </View>
      <View style={{ gap: 2 }}>
        <Text style={{ fontSize: FONT.small, color: t.muted }}>{T("ps.due")}</Text>
        <Text style={{ fontFamily: HEAD, fontSize: 40, color: stmt!.closing > 0 ? t.due : t.paid }}>{rupee(stmt!.closing)}</Text>
      </View>
      <Section title={T("st.period")}>
        <Row>{([["month", "st.month"], ["30", "st.30"], ["all", "st.all"]] as [Period, Key][]).map(([k, label]) => <Chip key={k} label={T(label)} on={period === k} onPress={() => setPeriod(k)} />)}</Row>
      </Section>
      {d.sites.length > 0 && (
        <Section title={T("st.site")}>
          <Row><Chip label={T("st.allSites")} on={siteId === null} onPress={() => setSiteId(null)} />{d.sites.map((s) => <Chip key={s.id} label={s.name} on={siteId === s.id} onPress={() => setSiteId(s.id)} />)}</Row>
        </Section>
      )}
      <StatementCard stmt={stmt!} emptyText={T("st.empty")} />
      <Row wrap={false}><Btn kind="ghost" label={T("st.pdf")} onPress={() => sharePdf(statementHtml(stmt!))} /></Row>
      <Text style={{ fontSize: 13, color: t.muted }}>{T("ps.updated", { t: d.generated_at.slice(0, 16).replace("T", " ") })}</Text>
    </Shell>
  );
}
