import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { loadLedger, type LedgerRow, type PartyRow } from "./data";
import { rs, rupee } from "./money";
import { FONT, useTheme } from "./theme";

// Notebook layout (Layout A): Date | Item | Qty | Rate | Amount | Site — same as the paper khata, plus Rate.
// Fits a phone with no sideways scroll: Item takes the leftover width; the site shows as a small line under the item.
const W = { date: 64, qty: 86, rate: 60, amt: 90 };

export function Ledger({ party, onBack, onAdd, onOpen, onEditParty, onStatement, onRemind }: { party: PartyRow; onBack: () => void; onAdd: () => void; onOpen: (entryId: string) => void; onEditParty: () => void; onStatement: () => void; onRemind: () => void }) {
  const t = useTheme();
  const [rows, setRows] = useState<LedgerRow[] | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { loadLedger(party).then(setRows).catch((e) => setErr(e.message ?? String(e))); }, [party]);
  const total = rows?.[rows.length - 1]?.amount ?? party.balance;
  const cell = (w: number | undefined, right = false) => ({ ...(w ? { width: w } : { flex: 1, minWidth: 0 }),  paddingHorizontal: 5, paddingVertical: 11, justifyContent: "center" as const, alignItems: right ? ("flex-end" as const) : ("flex-start" as const) });
  const txt = (color: string, bold = false, size: number = FONT.body) => ({ color, fontSize: size, fontWeight: bold ? ("700" as const) : ("400" as const), fontVariant: ["tabular-nums" as const] });
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Pressable onPress={onBack} accessibilityRole="button" style={{ padding: 14, minHeight: 52, justifyContent: "center" }}>
          <Text style={{ fontSize: FONT.body, color: t.accent, fontWeight: "600" }}>‹ Parties</Text>
        </Pressable>
        <View style={{ flexDirection: "row", gap: 6, margin: 8 }}>
          {party.balance > 0 && (
            <Pressable onPress={onRemind} accessibilityRole="button" style={{ paddingHorizontal: 12, minHeight: 48, justifyContent: "center", borderRadius: 24, borderWidth: 2, borderColor: t.due }}>
              <Text style={{ fontSize: FONT.small + 1, color: t.due, fontWeight: "700" }}>Yaad dilao</Text>
            </Pressable>
          )}
          <Pressable onPress={onStatement} accessibilityRole="button" style={{ paddingHorizontal: 14, minHeight: 48, justifyContent: "center", borderRadius: 24, borderWidth: 2, borderColor: t.accent }}>
            <Text style={{ fontSize: FONT.small + 1, color: t.accent, fontWeight: "700" }}>Hisaab bhejo</Text>
          </Pressable>
          <Pressable onPress={onAdd} accessibilityRole="button" style={{ paddingHorizontal: 14, minHeight: 48, justifyContent: "center", borderRadius: 24, backgroundColor: t.paid }}>
            <Text style={{ fontSize: FONT.small + 1, color: "#fff", fontWeight: "700" }}>+ Entry</Text>
          </Pressable>
        </View>
      </View>
      <View style={{ paddingHorizontal: 16, paddingBottom: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", borderBottomWidth: 2, borderColor: t.ink }}>
        <Pressable onPress={onEditParty} accessibilityRole="button" style={{ flexShrink: 1 }}>
          <Text style={{ fontSize: FONT.title, fontWeight: "700", color: t.ink }}>{party.name}</Text>
          <Text style={{ fontSize: 13, color: t.accent }}>Jaankari badlo ›</Text>
        </Pressable>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={{ fontSize: 14, color: t.muted }}>Kul baaki</Text>
          <Text style={{ fontSize: FONT.big, fontWeight: "700", color: t.due }}>{rupee(total)}</Text>
        </View>
      </View>
      {err ? <Text style={{ color: t.due, padding: 16 }}>{err}</Text> : !rows ? <ActivityIndicator style={{ marginTop: 40 }} /> : (
        <ScrollView>
          <View style={{ backgroundColor: t.surface }}>
            <View style={{ flexDirection: "row", borderBottomWidth: 2, borderColor: t.ink }}>
              <View style={cell(W.date)}><Text style={txt(t.muted, true, 12)}>DATE</Text></View>
              <View style={cell(undefined)}><Text style={txt(t.muted, true, 12)}>ITEM</Text></View>
              <View style={cell(W.qty, true)}><Text style={txt(t.muted, true, 12)}>QTY</Text></View>
              <View style={cell(W.rate, true)}><Text style={txt(t.muted, true, 12)}>RATE</Text></View>
              <View style={cell(W.amt, true)}><Text style={txt(t.muted, true, 12)}>AMOUNT</Text></View>
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
                    <Text style={txt(color, isBal || isPay, fs + 1)}>{r.item}</Text>
                    {r.site ? <Text style={txt(t.muted, false, 13)}>{r.site}</Text> : null}
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
