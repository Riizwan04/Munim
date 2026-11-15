import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { buildStatement, linkMessage, statementHtml, statementText, statementUrl, type Lang } from "@munim/ledger-core";
import { createStatementLink, loadStatementData, loadStatementLinks, revokeStatementLink, webOrigin, type LinkRow, type PartyRow, type StatementData } from "./data";
import { localToday } from "./dates";
import { StatementCard } from "./StatementCard";
import { sendWhatsApp, shareText, sharePdf } from "./share";
import { useI18n } from "./i18n";
import { fe } from "./errors";
import { FONT, useTheme } from "./theme";
import { Btn, Chip, Row, Section } from "./ui";

type Period = "month" | "30" | "all";
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function fromDate(p: Period): string | undefined {
  const now = new Date();
  if (p === "month") return iso(new Date(now.getFullYear(), now.getMonth(), 1));
  if (p === "30") { const d = new Date(now); d.setDate(d.getDate() - 30); return iso(d); }
  return undefined;
}

/** Statement for one party (FR-51/62): choose period, site and language, then send on WhatsApp, share, or make a PDF. */
export function Statement({ party, onBack }: { party: PartyRow; onBack: () => void }) {
  const t = useTheme();
  const { tr } = useI18n();
  const [data, setData] = useState<StatementData | null>(null);
  const [err, setErr] = useState("");
  const [period, setPeriod] = useState<Period>("month");
  const [siteId, setSiteId] = useState<string | null>(null);
  const [lang, setLang] = useState<Lang>((["hi", "mr", "en"].includes(party.language) ? party.language : "hi") as Lang);
  const [note, setNote] = useState("");
  const [days, setDays] = useState(30);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [lastUrl, setLastUrl] = useState("");
  const reloadLinks = () => loadStatementLinks(party.id).then(setLinks);
  useEffect(() => { reloadLinks(); }, [party.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { loadStatementData(party.id).then(setData).catch((e) => setErr(fe(e))); }, [party.id]);

  const stmt = useMemo(() => data && buildStatement({
    businessName: data.businessName, partyName: party.name, opening: party.opening, entries: data.entries,
    materialNames: data.materialNames, siteNames: data.siteNames, from: fromDate(period), to: localToday(), siteId, lang,
  }), [data, party, period, siteId, lang]);

  if (err) return <Text style={{ color: t.due, padding: 16 }}>{err}</Text>;
  if (!data || !stmt) return <ActivityIndicator style={{ flex: 1 }} />;
  const text = statementText(stmt);
  const makeLink = async () => {
    const origin = webOrigin();
    if (!origin) { setNote(tr("ln.noWeb")); return; }
    try {
      const l = await createStatementLink(party.id, days);
      const url = statementUrl(origin, l.token);
      setLastUrl(url);
      await sendWhatsApp(party.phone, linkMessage({ lang, businessName: data!.businessName, partyName: party.name, url, balance: stmt!.closing }));
      setNote(tr("ln.created")); reloadLinks();
    } catch (e: any) { setNote(fe(e)); }
  };
  const run = async (fn: () => Promise<unknown>, done: string) => { try { await fn(); setNote(done); } catch (e: any) { setNote(fe(e)); } };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Text onPress={onBack} accessibilityRole="button" style={{ padding: 14, fontSize: FONT.body, color: t.accent, fontWeight: "600" }}>‹ {party.name}</Text>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <Text style={{ fontSize: FONT.title, fontWeight: "700", color: t.ink }}>{tr("st.title")}</Text>
        <Section title={tr("st.period")}>
          <Row>
            <Chip label={tr("st.month")} on={period === "month"} onPress={() => setPeriod("month")} />
            <Chip label={tr("st.30")} on={period === "30"} onPress={() => setPeriod("30")} />
            <Chip label={tr("st.all")} on={period === "all"} onPress={() => setPeriod("all")} />
          </Row>
        </Section>
        {data.sites.length > 0 && (
          <Section title={tr("st.site")}>
            <Row><Chip label={tr("st.allSites")} on={siteId === null} onPress={() => setSiteId(null)} />{data.sites.map((s) => <Chip key={s.id} label={s.name} on={siteId === s.id} onPress={() => setSiteId(s.id)} />)}</Row>
          </Section>
        )}
        <Section title={tr("st.lang")}>
          <Row>{([["hi", "हिन्दी"], ["mr", "मराठी"], ["en", "English"]] as const).map(([k, l]) => <Chip key={k} label={l} on={lang === k} onPress={() => setLang(k)} />)}</Row>
        </Section>

        <StatementCard stmt={stmt} emptyText={tr("st.empty")} />

        <Row wrap={false}><Btn label={tr("st.wa")} onPress={() => run(() => sendWhatsApp(party.phone, text), tr("st.waNote"))} /></Row>
        <Row wrap={false}>
          <Btn kind="ghost" label={tr("st.share")} onPress={() => run(() => shareText(text), tr("st.done"))} />
          <Btn kind="ghost" label={tr("st.pdf")} onPress={() => run(() => sharePdf(statementHtml(stmt)), tr("st.pdfDone"))} />
        </Row>
        {note ? <Text style={{ fontSize: FONT.small, color: t.muted }}>{note}</Text> : null}
        <Text style={{ fontSize: FONT.small, color: t.muted }}>{tr("st.hint")}</Text>

        <Section title={tr("ln.title")}>
          <Text style={{ fontSize: FONT.small, color: t.muted }}>{tr("ln.note")}</Text>
          <Text style={{ fontSize: FONT.small, color: t.fg, fontWeight: "600" }}>{tr("ln.valid")}</Text>
          <Row>{[7, 30, 90].map((n) => <Chip key={n} label={tr("ln.days", { n })} on={days === n} onPress={() => setDays(n)} />)}</Row>
          <Row wrap={false}><Btn label={tr("ln.create")} onPress={makeLink} /></Row>
          {lastUrl ? (
            <View style={{ gap: 6 }}>
              <Text selectable style={{ fontSize: FONT.small, color: t.accent }}>{lastUrl}</Text>
              <Row><Chip label={tr("ln.copy")} onPress={() => run(() => shareText(lastUrl), tr("st.done"))} /></Row>
              <Text style={{ fontSize: 13, color: t.muted }}>{tr("ln.lostNote")}</Text>
            </View>
          ) : null}
          {links.length > 0 && <Text style={{ fontSize: FONT.small, color: t.muted, fontWeight: "700", marginTop: 6 }}>{tr("ln.existing")}</Text>}
          {links.map((l) => {
            const status = l.revoked_at ? "ln.revokedTag" : Date.parse(l.expires_at) <= Date.now() ? "ln.expiredTag" : "ln.activeTag";
            return (
              <View key={l.id} style={{ gap: 4, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: t.line, backgroundColor: t.surface }}>
                <Text style={{ fontSize: FONT.small, color: status === "ln.activeTag" ? t.paid : t.muted, fontWeight: "700" }}>{tr(status)}</Text>
                <Text style={{ fontSize: 13, color: t.muted }}>{tr("ln.line", { c: l.created_at.slice(0, 10), e: l.expires_at.slice(0, 10), n: l.view_count })}</Text>
                {status === "ln.activeTag" && <Row><Chip label={tr("ln.revoke")} onPress={async () => { try { await revokeStatementLink(l.id); reloadLinks(); } catch (e: any) { setNote(fe(e)); } }} /></Row>}
              </View>
            );
          })}
        </Section>
      </ScrollView>
    </View>
  );
}
