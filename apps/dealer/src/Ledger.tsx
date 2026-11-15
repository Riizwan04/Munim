import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { loadLedger, type LedgerRow, type PartyRow } from "./data";
import { rs, rupee } from "./money";
import { useI18n } from "./i18n";
import { fe } from "./errors";
import { FONT, HEAD, useTheme } from "./theme";
import { Avatar } from "./Logo";

// Notebook layout (Layout A): Date | Item | Qty | Rate | Amount | Site — same as the paper khata, plus Rate.
// Fits a phone with no sideways scroll: Item takes the leftover width; the site shows as a small line under the item.
const W = { date: 64, qty: 86, rate: 60, amt: 90 };

export function Ledger({ party, onBack, onAdd, onOpen, onEditParty, onStatement, onRemind }: { party: PartyRow; onBack: () => void; onAdd: () => void; onOpen: (entryId: string) => void; onEditParty: () => void; onStatement: () => void; onRemind: () => void }) {
  const t = useTheme();
  const { tr } = useI18n();
  const itemLabel = (it: string) => (it === "@balance" ? tr("row.balance") : it === "@total" ? tr("row.total") : it.startsWith("@mode:") ? tr(`mode.${it.slice(6)}` as never) : it === "@charge" ? tr("row.charge") : it === "@discount" ? tr("row.discount") : it === "@return" ? tr("row.return") : it);
  const [rows, setRows] = useState<LedgerRow[] | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { loadLedger(party).then(setRows).catch((e) => setErr(fe(e))); }, [party]);
  const total = rows?.[rows.length - 1]?.amount ?? party.balance;
  const cell = (w: number | undefined, right = false) => ({ ...(w ? { width: w } : { flex: 1, minWidth: 0 }),  paddingHorizontal: 5, paddingVertical: 11, justifyContent: "center" as const, alignItems: right ? ("flex-end" as const) : ("flex-start" as const) });
  const txt = (color: string, bold = false, size: number = FONT.body) => ({ color, fontSize: size, fontWeight: bold ? ("700" as const) : ("400" as const), fontVariant: ["tabular-nums" as const] });
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ backgroundColor: t.hero, paddingHorizontal: 14, paddingTop: 4, paddingBottom: 16, borderBottomLeftRadius: 22, borderBottomRightRadius: 22, gap: 8 }}>
        <Pressable onPress={onBack} accessibilityRole="button" style={{ minHeight: 44, justifyContent: "center", alignSelf: "flex-start" }}>
          <Text style={{ fontSize: FONT.body, color: t.heroFg, fontWeight: "700", opacity: 0.95 }}>{tr("ledger.parties")}</Text>
        </Pressable>
        <Pressable onPress={onEditParty} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Avatar name={party.name} size={50} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontFamily: HEAD, fontSize: FONT.title - 1, color: t.heroFg }} numberOfLines={1}>{party.name}</Text>
            <Text style={{ fontSize: 13, color: t.heroFg, opacity: 0.85 }}>{tr("ledger.editParty")}</Text>
          </View>
        </Pressable>
        <View>
          <Text style={{ fontSize: 13, color: t.heroFg, opacity: 0.85 }}>{tr("ledger.balanceDue")}</Text>
          <Text style={{ fontFamily: HEAD, fontSize: 36, lineHeight: 42, color: t.heroFg }} testID="ledger-total">{rupee(total)}</Text>
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 4 }}>
        {party.balance > 0 && (
          <Pressable onPress={onRemind} accessibilityRole="button" style={{ flex: 1, minHeight: 46, justifyContent: "center", alignItems: "center", borderRadius: 23, borderWidth: 1.5, borderColor: t.due }}>
            <Text style={{ fontSize: FONT.small, color: t.due, fontWeight: "700" }}>{tr("ledger.remind")}</Text>
          </Pressable>
        )}
        <Pressable onPress={onStatement} accessibilityRole="button" style={{ flex: 1, minHeight: 46, justifyContent: "center", alignItems: "center", borderRadius: 23, borderWidth: 1.5, borderColor: t.accent }}>
          <Text style={{ fontSize: FONT.small, color: t.accent, fontWeight: "700" }}>{tr("ledger.statement")}</Text>
        </Pressable>
        <Pressable onPress={onAdd} accessibilityRole="button" style={{ flex: 1, minHeight: 46, justifyContent: "center", alignItems: "center", borderRadius: 23, backgroundColor: t.paid }}>
          <Text style={{ fontFamily: HEAD, fontSize: FONT.small, color: t.bg === "#12141f" ? "#06130a" : "#fff" }}>{tr("home.entry")}</Text>
        </Pressable>
      </View>
      {err ? <Text style={{ color: t.due, padding: 16 }}>{err}</Text> : !rows ? <ActivityIndicator style={{ marginTop: 40 }} /> : (
        <ScrollView contentContainerStyle={{ padding: 12 }}>
          <View style={{ backgroundColor: t.surface, borderRadius: 14, overflow: "hidden", borderWidth: 1, borderColor: t.line }}>
            <View style={{ flexDirection: "row", borderBottomWidth: 2, borderColor: t.ink }}>
              <View style={cell(W.date)}><Text style={txt(t.muted, true, 12)}>{tr("col.date")}</Text></View>
              <View style={cell(undefined)}><Text style={txt(t.muted, true, 12)}>{tr("col.item")}</Text></View>
              <View style={cell(W.qty, true)}><Text style={txt(t.muted, true, 12)}>{tr("col.qty")}</Text></View>
              <View style={cell(W.rate, true)}><Text style={txt(t.muted, true, 12)}>{tr("col.rate")}</Text></View>
              <View style={cell(W.amt, true)}><Text style={txt(t.muted, true, 12)}>{tr("col.amount")}</Text></View>
            </View>
            {rows.map((r) => {
              const isBal = r.kind === "balance" || r.kind === "total";
              const isPay = r.kind === "payment";
              const color = isPay ? t.paid : isBal ? t.fg : t.ink;
              const fs = 15;
              return (
                <Pressable key={r.key} disabled={!r.entryId} onPress={() => r.entryId && onOpen(r.entryId)} style={{ flexDirection: "row", borderBottomWidth: r.kind === "total" ? 0 : 1, borderTopWidth: r.kind === "total" ? 2 : 0, borderColor: r.kind === "total" ? t.ink : t.rule, backgroundColor: isPay ? t.paidBg : isBal ? t.bg : t.surface }}>
                  <View style={cell(W.date)}><Text numberOfLines={1} style={txt(t.muted, false, fs)}>{r.date ?? ""}</Text></View>
                  <View style={cell(undefined)}>
                    <Text style={txt(color, isBal || isPay, fs + 1)}>{itemLabel(r.item)}</Text>
                    {r.site ? <Text style={txt(t.muted, false, 13)}>{r.site}</Text> : null}
                    {r.pending ? <Text style={txt(t.muted, false, 13)}>⏳ {tr("row.pending")}</Text> : null}
                  </View>
                  <View style={cell(W.qty, true)}><Text numberOfLines={1} style={txt(color, false, fs)}>{r.qty ?? ""}</Text></View>
                  <View style={cell(W.rate, true)}><Text numberOfLines={1} style={txt(color, false, fs)}>{r.rate !== undefined ? rs(r.rate) : ""}</Text></View>
                  <View style={cell(W.amt, true)}><Text numberOfLines={1} style={txt(r.kind === "total" ? t.due : color, isBal || isPay, fs + 1)}>{isPay ? "− " : ""}{rs(Math.abs(r.amount))}</Text></View>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      )}
    </View>
  );
}
