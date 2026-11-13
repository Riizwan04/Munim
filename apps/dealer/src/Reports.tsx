import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { agingCsv, buildReport, entriesCsv, materialCsv, partyCsv, qtyText, reportHtml, reportText, type Report } from "@munim/ledger-core";
import { loadReportData, type ReportData } from "./data";
import { localToday } from "./dates";
import { useI18n, type Key } from "./i18n";
import { rs, rupee } from "./money";
import { shareFile, sharePdf, shareText } from "./share";
import { FONT, useTheme } from "./theme";
import { Btn, Chip, Row, Section } from "./ui";

type Period = "month" | "last" | "30" | "all";
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function range(p: Period): { from?: string; to: string } {
  const now = new Date();
  if (p === "month") return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: localToday() };
  if (p === "last") return { from: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: iso(new Date(now.getFullYear(), now.getMonth(), 0)) };
  if (p === "30") { const d = new Date(now); d.setDate(d.getDate() - 30); return { from: iso(d), to: localToday() }; }
  return { to: localToday() };
}

export function Reports({ onImport }: { onImport: () => void }) {
  const t = useTheme();
  const { tr } = useI18n();
  const [data, setData] = useState<ReportData | null>(null);
  const [err, setErr] = useState("");
  const [period, setPeriod] = useState<Period>("month");
  const [note, setNote] = useState("");
  useEffect(() => { loadReportData().then(setData).catch((e) => setErr(e.message ?? String(e))); }, []);

  const rep: Report | null = useMemo(() => data && buildReport({ parties: data.parties, entries: data.entries, materials: data.materials, sites: data.sites, ...range(period) }), [data, period]);
  if (err) return <Text style={{ color: t.due, padding: 16 }}>{err}</Text>;
  if (!data || !rep) return <ActivityIndicator style={{ flex: 1 }} />;

  const s = rep.summary;
  const run = async (fn: () => Promise<unknown>) => { try { await fn(); setNote(tr("rp.exported")); } catch (e: any) { setNote(e.message ?? String(e)); } };
  const stamp = localToday();
  const card = { borderWidth: 2, borderColor: t.line, borderRadius: 12, backgroundColor: t.surface, overflow: "hidden" as const };
  const line = (left: string, right: string, opts: { bold?: boolean; color?: string; sub?: string } = {}) => (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10, padding: 12, borderBottomWidth: 1, borderColor: t.rule }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: FONT.body, fontWeight: opts.bold ? "700" : "400", color: t.fg }}>{left}</Text>
        {opts.sub ? <Text style={{ fontSize: 13, color: t.muted }}>{opts.sub}</Text> : null}
      </View>
      <Text style={{ fontSize: FONT.body, fontWeight: "700", color: opts.color ?? t.fg, fontVariant: ["tabular-nums"] }}>{right}</Text>
    </View>
  );

  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={{ padding: 16, gap: 18 }}>
      <Text style={{ fontSize: FONT.title, fontWeight: "700", color: t.ink }}>{tr("rp.title")}</Text>
      <Section title={tr("rp.period")}>
        <Row>
          {([["month", "rp.thisMonth"], ["last", "rp.lastMonth"], ["30", "rp.last30"], ["all", "rp.all"]] as [Period, Key][]).map(([k, label]) => <Chip key={k} label={tr(label)} on={period === k} onPress={() => setPeriod(k)} />)}
        </Row>
      </Section>

      <Section title={tr("rp.summary")}>
        <View style={card}>
          {line(tr("rp.sales"), rupee(s.sales))}
          {line(tr("rp.received"), rupee(s.collections), { color: t.paid })}
          {s.charges > 0 && line(tr("rp.charges"), rupee(s.charges))}
          {s.discounts > 0 && line(tr("rp.discounts"), `− ${rupee(s.discounts)}`)}
          {s.returns > 0 && line(tr("rp.returns"), `− ${rupee(s.returns)}`)}
          {line(tr("rp.receivable"), rupee(s.receivable), { bold: true, color: t.due })}
        </View>
      </Section>

      <Section title={tr("rp.byItem")}>
        <View style={card}>
          {rep.byMaterial.length === 0 && <Text style={{ padding: 12, color: t.muted, fontSize: FONT.body }}>{tr("rp.empty")}</Text>}
          {rep.byMaterial.map((m) => line(m.name, rupee(m.amount), { sub: `${qtyText(m.qtyByUnit)}${m.category ? ` · ${m.category}` : ""}` }))}
        </View>
      </Section>

      <Section title={tr("rp.byParty")}>
        <View style={card}>
          {rep.byParty.length === 0 && <Text style={{ padding: 12, color: t.muted, fontSize: FONT.body }}>{tr("rp.empty")}</Text>}
          {rep.byParty.map((p) => line(p.name, rupee(p.balance), { color: p.balance > 0 ? t.due : t.paid, sub: tr("rp.partyLine", { s: rupee(p.sales), r: rupee(p.collections) }) }))}
        </View>
      </Section>

      {rep.bySite.some((x) => x.siteId) && (
        <Section title={tr("rp.bySite")}>
          <View style={card}>{rep.bySite.map((x) => line(`${x.partyName} · ${x.siteName || tr("rp.noSite")}`, rupee(x.sales)))}</View>
        </Section>
      )}

      <Section title={tr("rp.aging")}>
        <View style={card}>
          {rep.aging.length === 0 && <Text style={{ padding: 12, color: t.muted, fontSize: FONT.body }}>{tr("rp.empty")}</Text>}
          {rep.aging.map((a) => (
            <View key={a.partyId} style={{ padding: 12, gap: 6, borderBottomWidth: 1, borderColor: t.rule }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontSize: FONT.body, fontWeight: "600", color: t.fg }}>{a.name}</Text>
                <Text style={{ fontSize: FONT.body, fontWeight: "700", color: t.due }}>{rupee(a.total)}</Text>
              </View>
              <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
                {([["rp.b0", a.b0], ["rp.b31", a.b31], ["rp.b61", a.b61], ["rp.b90", a.b90]] as [Key, number][]).filter(([, v]) => v > 0).map(([k, v]) => (
                  <Text key={k} style={{ fontSize: 13, color: k === "rp.b90" ? t.due : t.muted }}>{tr(k)}: {rs(v)}</Text>
                ))}
              </View>
            </View>
          ))}
        </View>
      </Section>

      <Section title={tr("rp.export")}>
        <Row wrap={false}>
          <Btn label={tr("rp.shareText")} onPress={() => run(() => shareText(reportText(rep, data.businessName)))} />
          <Btn kind="ghost" label={tr("rp.pdf")} onPress={() => run(() => sharePdf(reportHtml(rep, data.businessName)))} />
        </Row>
        <Row>
          <Chip label={tr("rp.csvItems")} onPress={() => run(() => shareFile(`items-${stamp}.csv`, materialCsv(rep)))} />
          <Chip label={tr("rp.csvParties")} onPress={() => run(() => shareFile(`parties-${stamp}.csv`, partyCsv(rep)))} />
          <Chip label={tr("rp.csvAging")} onPress={() => run(() => shareFile(`ageing-${stamp}.csv`, agingCsv(rep)))} />
          <Chip label={tr("rp.csvAll")} onPress={() => run(() => shareFile(`all-entries-${stamp}.csv`, entriesCsv({ parties: data.parties, entries: data.entries, materials: data.materials, sites: data.sites })))} />
        </Row>
        {note ? <Text style={{ fontSize: FONT.small, color: t.muted }}>{note}</Text> : null}
      </Section>

      <Pressable onPress={onImport} accessibilityRole="button" style={{ minHeight: 56, justifyContent: "center", paddingHorizontal: 16, borderRadius: 12, borderWidth: 2, borderColor: t.accent }}>
        <Text style={{ fontSize: FONT.body, fontWeight: "700", color: t.accent }}>{tr("rp.import")}</Text>
      </Pressable>
    </ScrollView>
  );
}
