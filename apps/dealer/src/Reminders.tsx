import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { reminderMessage, type Lang } from "@munim/ledger-core";
import { loadReminderLog, logReminder, type PartyRow } from "./data";
import { rupee } from "./money";
import { sendWhatsApp } from "./share";
import { useI18n } from "./i18n";
import { FONT, useTheme } from "./theme";
import { Btn, Chip, Row } from "./ui";

const daysAgo = (ts: string | undefined, tr: (k: any, v?: any) => string) => {
  if (!ts) return tr("rem.never");
  const d = Math.floor((Date.now() - Date.parse(ts)) / 86_400_000);
  return d <= 0 ? tr("rem.today") : tr("rem.ago", { n: d });
};
const asLang = (l: string): Lang => (["hi", "mr", "en"].includes(l) ? (l as Lang) : "hi");

/**
 * MANUAL reminders. Nothing is pre-selected, there is no "select all", and nothing is sent automatically or on a schedule.
 * The dealer ticks exactly the people to remind; each reminder opens WhatsApp for that one person and goes only when
 * the dealer taps send there. "Bhej diya" is logged only after the dealer confirms.
 */
export function Reminders({ businessId, business, parties, only, onClose }: {
  businessId: string; business: string; parties: PartyRow[]; only?: PartyRow; onClose: () => void;
}) {
  const t = useTheme();
  const { tr } = useI18n();
  const [chosen, setChosen] = useState<string[]>(only ? [only.id] : []);
  const [sending, setSending] = useState(!!only);
  const [log, setLog] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<"balance" | "overdue">("overdue");
  const [q, setQ] = useState("");
  useEffect(() => { loadReminderLog().then(setLog); }, []);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const rows = parties.filter((p) => p.balance > 0 && (!s || p.name.toLowerCase().includes(s) || p.nicknames.some((n) => n.toLowerCase().includes(s))));
    return rows.sort(sort === "balance" ? (a, b) => b.balance - a.balance : (a, b) => (b.overdueDays ?? -1) - (a.overdueDays ?? -1));
  }, [parties, sort, q]);

  if (sending) {
    const people = chosen.map((id) => parties.find((p) => p.id === id)!).filter(Boolean);
    return <Queue business={business} businessId={businessId} people={people} onDone={(sent) => { if (sent.length) setLog((l) => ({ ...l, ...Object.fromEntries(sent.map((id) => [id, new Date().toISOString()])) })); if (only) onClose(); else { setSending(false); setChosen([]); } }} onBack={() => (only ? onClose() : setSending(false))} />;
  }

  const toggle = (id: string) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ padding: 16, gap: 6, borderBottomWidth: 2, borderColor: t.ink }}>
        <Text style={{ fontSize: FONT.title, fontWeight: "700", color: t.ink }}>{tr("rem.title")}</Text>
        <Text style={{ fontSize: FONT.small, color: t.muted }}>{tr("rem.sub")}</Text>
      </View>
      <View style={{ flexDirection: "row", gap: 8, padding: 10, flexWrap: "wrap", alignItems: "center" }}>
        <Chip label={tr("rem.oldest")} on={sort === "overdue"} onPress={() => setSort("overdue")} />
        <Chip label={tr("rem.highest")} on={sort === "balance"} onPress={() => setSort("balance")} />
      </View>
      <View style={{ paddingHorizontal: 10, paddingBottom: 8 }}>
        <TextInput nativeID="rem-search" value={q} onChangeText={setQ} placeholder={tr("common.search")} placeholderTextColor={t.muted}
          style={{ borderWidth: 2, borderColor: t.line, backgroundColor: t.surface, color: t.fg, borderRadius: 10, paddingHorizontal: 12, minHeight: 48, fontSize: FONT.body }} />
      </View>
      <FlatList data={list} keyExtractor={(p) => p.id} extraData={chosen}
        ListEmptyComponent={<Text style={{ padding: 24, fontSize: FONT.body, color: t.muted }}>{tr("rem.nobody")}</Text>}
        renderItem={({ item }) => {
          const on = chosen.includes(item.id);
          return (
            <Pressable onPress={() => toggle(item.id)} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
              style={{ padding: 14, minHeight: 72, flexDirection: "row", gap: 14, alignItems: "center", borderBottomWidth: 1, borderColor: t.rule, backgroundColor: on ? t.paidBg : t.surface }}>
              <View style={{ width: 32, height: 32, borderRadius: 8, borderWidth: 3, borderColor: on ? t.paid : t.line, backgroundColor: on ? t.paid : "transparent", alignItems: "center", justifyContent: "center" }}>
                {on ? <Text style={{ color: "#fff", fontSize: 20, fontWeight: "700" }}>✓</Text> : null}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: FONT.body + 2, fontWeight: "600", color: t.fg }}>{item.name}</Text>
                <Text style={{ fontSize: FONT.small, color: (item.overdueDays ?? 0) > 30 ? t.due : t.muted }}>
                  {item.overdueDays !== null ? `${tr("rem.daysOverdue", { n: item.overdueDays })} · ` : ""}{daysAgo(log[item.id], tr)}
                </Text>
              </View>
              <Text style={{ fontSize: FONT.body + 2, fontWeight: "700", color: t.due }}>{rupee(item.balance)}</Text>
            </Pressable>
          );
        }} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderTopWidth: 1, borderColor: t.line, backgroundColor: t.surface }}>
        <Pressable onPress={onClose} style={{ padding: 10 }}><Text style={{ fontSize: FONT.body, color: t.muted }}>{tr("common.back")}</Text></Pressable>
        <View style={{ flex: 1 }}><Btn label={chosen.length ? tr("rem.next", { n: chosen.length }) : tr("rem.pick")} disabled={chosen.length === 0} onPress={() => setSending(true)} /></View>
      </View>
    </View>
  );
}

/** One person at a time: edit the message, open WhatsApp, then confirm it was really sent. */
function Queue({ business, businessId, people, onDone, onBack }: { business: string; businessId: string; people: PartyRow[]; onDone: (sentIds: string[]) => void; onBack: () => void }) {
  const t = useTheme();
  const { tr } = useI18n();
  const [i, setI] = useState(0);
  const [lang, setLang] = useState<Lang>(people[0] ? asLang(people[0].language) : "hi");
  const [text, setText] = useState("");
  const [opened, setOpened] = useState(false);
  const [sent, setSent] = useState<string[]>([]);
  const [logged, setLogged] = useState<string[]>([]); // only reminders that were really recorded in the database
  const [skipped, setSkipped] = useState(0);
  const [warn, setWarn] = useState("");
  const p = people[i];
  const make = (party: PartyRow, l: Lang) => reminderMessage({ lang: l, businessName: business, partyName: party.name, balance: party.balance, overdueDays: party.overdueDays });
  useEffect(() => { if (p) { const l = asLang(p.language); setLang(l); setText(make(p, l)); setOpened(false); setWarn(""); } }, [i]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!p) return (
    <View style={{ flex: 1, backgroundColor: t.bg, padding: 20, gap: 16, justifyContent: "center" }}>
      <Text style={{ fontSize: FONT.title, fontWeight: "700", color: t.ink }}>{tr("rem.doneTitle")}</Text>
      <Text style={{ fontSize: FONT.body, color: t.fg }}>{tr("rem.doneBody", { a: sent.length, b: skipped })}</Text>
      {logged.length < sent.length ? <Text style={{ fontSize: FONT.small, color: t.due }}>{tr("rem.logFail", { n: sent.length - logged.length })}</Text> : null}
      <Row wrap={false}><Btn label={tr("common.ok")} onPress={() => onDone(logged)} /></Row>
    </View>
  );
  const next = (wasSent: boolean) => { if (wasSent) setSent((s) => [...s, p.id]); else setSkipped((n) => n + 1); setI(i + 1); };
  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
      <Text onPress={onBack} style={{ fontSize: FONT.body, color: t.accent, fontWeight: "600" }}>‹ {tr("common.back")}</Text>
      <Text style={{ fontSize: FONT.small, color: t.muted }}>{tr("rem.of", { i: i + 1, n: people.length })}</Text>
      <Text style={{ fontSize: FONT.title, fontWeight: "700", color: t.ink }}>{p.name}</Text>
      <Text style={{ fontSize: FONT.body, color: t.due, fontWeight: "700" }}>{tr("rem.due", { v: rupee(p.balance), phone: p.phone })}</Text>
      <Row>{([["hi", "Hindi"], ["mr", "Marathi"], ["en", "English"]] as const).map(([k, l]) => <Chip key={k} label={l} on={lang === k} onPress={() => { setLang(k); setText(make(p, k)); }} />)}</Row>
      <TextInput nativeID="rem-text" multiline value={text} onChangeText={setText}
        style={{ minHeight: 160, textAlignVertical: "top", borderWidth: 2, borderColor: t.line, backgroundColor: t.surface, color: t.fg, borderRadius: 12, padding: 14, fontSize: FONT.body }} />
      {warn ? <Text style={{ color: t.due, fontSize: FONT.small }}>{warn}</Text> : null}
      {!opened ? (
        <Row wrap={false}>
          <Btn label={tr("rem.send")} onPress={async () => { try { await sendWhatsApp(p.phone, text); setOpened(true); } catch (e: any) { setWarn(e.message ?? String(e)); } }} />
          <Btn kind="ghost" label={tr("common.skip")} onPress={() => next(false)} />
        </Row>
      ) : (
        <View style={{ gap: 10 }}>
          <Text style={{ fontSize: FONT.body, color: t.fg, fontWeight: "600" }}>{tr("rem.confirmAsk")}</Text>
          <Row wrap={false}>
            <Btn label={tr("rem.yes")} onPress={async () => {
              try { await logReminder(businessId, p.id, p.balance, text); setLogged((l) => [...l, p.id]); } catch { /* shown on the done screen */ }
              next(true);
            }} />
            <Btn kind="ghost" label={tr("rem.notSent")} onPress={() => { setOpened(false); }} />
          </Row>
        </View>
      )}
    </ScrollView>
  );
}
