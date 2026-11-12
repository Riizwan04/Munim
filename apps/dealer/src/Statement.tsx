import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { buildStatement, labels, statementHtml, statementText, type Lang } from "@munim/ledger-core";
import { loadStatementData, type PartyRow, type StatementData } from "./data";
import { localToday } from "./dates";
import { rs, rupee } from "./money";
import { sendWhatsApp, shareText, sharePdf } from "./share";
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
  const [data, setData] = useState<StatementData | null>(null);
  const [err, setErr] = useState("");
  const [period, setPeriod] = useState<Period>("month");
  const [siteId, setSiteId] = useState<string | null>(null);
  const [lang, setLang] = useState<Lang>((["hi", "mr", "en"].includes(party.language) ? party.language : "hi") as Lang);
  const [note, setNote] = useState("");
  useEffect(() => { loadStatementData(party.id).then(setData).catch((e) => setErr(e.message)); }, [party.id]);

  const stmt = useMemo(() => data && buildStatement({
    businessName: data.businessName, partyName: party.name, opening: party.opening, entries: data.entries,
    materialNames: data.materialNames, siteNames: data.siteNames, from: fromDate(period), to: localToday(), siteId, lang,
  }), [data, party, period, siteId, lang]);
  const L = labels(lang);

  if (err) return <Text style={{ color: t.due, padding: 16 }}>{err}</Text>;
  if (!data || !stmt) return <ActivityIndicator style={{ flex: 1 }} />;
  const text = statementText(stmt);
  const run = async (fn: () => Promise<unknown>, done: string) => { try { await fn(); setNote(done); } catch (e: any) { setNote(e.message ?? String(e)); } };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Text onPress={onBack} accessibilityRole="button" style={{ padding: 14, fontSize: FONT.body, color: t.accent, fontWeight: "600" }}>‹ {party.name}</Text>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <Text style={{ fontSize: FONT.title, fontWeight: "700", color: t.ink }}>Hisaab bhejo</Text>
        <Section title="Kitne samay ka?">
          <Row>
            <Chip label="Is mahine" on={period === "month"} onPress={() => setPeriod("month")} />
            <Chip label="Pichhle 30 din" on={period === "30"} onPress={() => setPeriod("30")} />
            <Chip label="Poora hisaab" on={period === "all"} onPress={() => setPeriod("all")} />
          </Row>
        </Section>
        {data.sites.length > 0 && (
          <Section title="Site">
            <Row><Chip label="Sab" on={siteId === null} onPress={() => setSiteId(null)} />{data.sites.map((s) => <Chip key={s.id} label={s.name} on={siteId === s.id} onPress={() => setSiteId(s.id)} />)}</Row>
          </Section>
        )}
        <Section title="Bhasha">
          <Row>{([["hi", "Hindi"], ["mr", "Marathi"], ["en", "English"]] as const).map(([k, l]) => <Chip key={k} label={l} on={lang === k} onPress={() => setLang(k)} />)}</Row>
        </Section>

        <View style={{ borderWidth: 2, borderColor: t.line, borderRadius: 12, backgroundColor: t.surface, overflow: "hidden" }}>
          <View style={{ padding: 12, gap: 2, borderBottomWidth: 2, borderColor: t.ink }}>
            <Text style={{ fontSize: FONT.small, color: t.muted }}>{L.opening}</Text>
            <Text style={{ fontSize: FONT.body + 2, fontWeight: "700", color: t.fg }}>{rupee(stmt.opening)}</Text>
          </View>
          {stmt.rows.length === 0 && <Text style={{ padding: 14, color: t.muted, fontSize: FONT.body }}>Is samay mein koi entry nahi.</Text>}
          {stmt.rows.map((r, i) => (
            <View key={r.entryId + i} style={{ flexDirection: "row", gap: 8, padding: 12, borderBottomWidth: 1, borderColor: t.rule, backgroundColor: r.kind === "payment" ? t.paidBg : t.surface }}>
              <Text style={{ width: 52, fontSize: FONT.small, color: t.muted }}>{r.date.slice(8, 10)}-{r.date.slice(5, 7)}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: FONT.body, color: r.kind === "payment" ? t.paid : t.ink }}>{r.text}</Text>
                {r.site ? <Text style={{ fontSize: 13, color: t.muted }}>{r.site}</Text> : null}
              </View>
              <Text style={{ fontSize: FONT.body, fontWeight: "700", color: r.amount < 0 ? t.paid : t.fg }}>{r.amount < 0 ? "− " : ""}{rs(Math.abs(r.amount))}</Text>
            </View>
          ))}
          <View style={{ padding: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderTopWidth: 2, borderColor: t.ink }}>
            <Text style={{ fontSize: FONT.body, fontWeight: "700", color: t.fg }}>{stmt.siteName ? L.site_bal : L.closing}</Text>
            <Text style={{ fontSize: FONT.big, fontWeight: "700", color: stmt.closing > 0 ? t.due : t.paid }}>{rupee(stmt.closing)}</Text>
          </View>
        </View>

        <Row wrap={false}><Btn label="WhatsApp par bhejo" onPress={() => run(() => sendWhatsApp(party.phone, text), "WhatsApp khul raha hai. Wahan 'send' dabaiye.")} /></Row>
        <Row wrap={false}>
          <Btn kind="ghost" label="Share karo" onPress={() => run(() => shareText(text), "Ho gaya.")} />
          <Btn kind="ghost" label="PDF banao" onPress={() => run(() => sharePdf(statementHtml(stmt)), "PDF taiyaar.")} />
        </Row>
        {note ? <Text style={{ fontSize: FONT.small, color: t.muted }}>{note}</Text> : null}
        <Text style={{ fontSize: FONT.small, color: t.muted }}>Message bhejne ke liye aapko WhatsApp mein 'send' dabana hoga.</Text>
      </ScrollView>
    </View>
  );
}
