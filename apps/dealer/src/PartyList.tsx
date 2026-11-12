import { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import type { Overview, PartyRow } from "./data";
import { rupee } from "./money";
import { supabase } from "./supabase";
import { FONT, useTheme } from "./theme";

type Sort = "balance" | "overdue";

/** Home: receivable, today's sales & collections, overdue count (FR-70) and the party list sorted by balance or days overdue (FR-71). */
export function PartyList({ data, err, onOpen, onAdd, onVoice, onRefresh }: {
  data: Overview | null; err: string; onOpen: (p: PartyRow) => void; onAdd: () => void; onVoice: () => void; onRefresh: () => Promise<void>;
}) {
  const t = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const [sort, setSort] = useState<Sort>("balance");
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    if (!data) return [];
    const s = q.trim().toLowerCase();
    const rows = data.parties.filter((p) => !s || p.name.toLowerCase().includes(s) || p.nicknames.some((n) => n.toLowerCase().includes(s)));
    return [...rows].sort(sort === "balance" ? (a, b) => b.balance - a.balance : (a, b) => (b.overdueDays ?? -1) - (a.overdueDays ?? -1));
  }, [data, sort, q]);
  if (err) return <Text style={{ color: t.due, padding: 24, fontSize: FONT.body }}>{err}</Text>;
  if (!data) return <ActivityIndicator style={{ flex: 1 }} />;
  const total = data.parties.reduce((s, p) => s + Math.max(p.balance, 0), 0);
  const overdue = data.parties.filter((p) => (p.overdueDays ?? 0) > 30 && p.balance > 0).length;
  const stat = (label: string, value: string, color: string) => (
    <View style={{ flex: 1, minWidth: 100, gap: 2 }}>
      <Text style={{ fontSize: 13, color: t.muted }}>{label}</Text>
      <Text style={{ fontSize: FONT.body + 2, fontWeight: "700", color }}>{value}</Text>
    </View>
  );
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ padding: 16, gap: 12, borderBottomWidth: 2, borderColor: t.ink }}>
        <Text style={{ fontSize: FONT.title, fontWeight: "700", color: t.ink }}>{data.business}</Text>
        <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <Text style={{ fontSize: FONT.small, color: t.muted }}>Kul baaki (total receivable)</Text>
          <Text style={{ fontSize: FONT.big, fontWeight: "700", color: t.due }}>{rupee(total)}</Text>
        </View>
        <View style={{ flexDirection: "row", gap: 12, flexWrap: "wrap" }}>
          {stat("Aaj ki bikri", rupee(data.todaySales), t.fg)}
          {stat("Aaj mila", rupee(data.todayCollections), t.paid)}
          {stat("30 din se purana", `${overdue} party`, overdue ? t.due : t.fg)}
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: 8, padding: 10, alignItems: "center" }}>
        {(["balance", "overdue"] as Sort[]).map((k) => (
          <Pressable key={k} onPress={() => setSort(k)} accessibilityRole="button" style={{ minHeight: 44, paddingHorizontal: 14, justifyContent: "center", borderRadius: 22, borderWidth: 2, borderColor: sort === k ? t.accent : t.line, backgroundColor: sort === k ? t.accent : t.surface }}>
            <Text style={{ fontSize: FONT.small, fontWeight: "600", color: sort === k ? t.accentFg : t.fg }}>{k === "balance" ? "Baaki ke hisab se" : "Purane pehle"}</Text>
          </Pressable>
        ))}
      </View>
      <FlatList
        data={list}
        keyExtractor={(p) => p.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await onRefresh(); setRefreshing(false); }} />}
        ListEmptyComponent={<Text style={{ padding: 24, fontSize: FONT.body, color: t.muted }}>Abhi koi party nahi. "+ Entry" se nayi party jodiye.</Text>}
        renderItem={({ item }) => (
          <Pressable onPress={() => onOpen(item)} accessibilityRole="button" style={{ padding: 16, minHeight: 64, flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1, borderColor: t.rule, backgroundColor: t.surface }}>
            <View style={{ flexShrink: 1 }}>
              <Text style={{ fontSize: FONT.body + 2, fontWeight: "600", color: t.fg }}>{item.name}</Text>
              <Text style={{ fontSize: FONT.small, color: (item.overdueDays ?? 0) > 30 ? t.due : t.muted }}>
                {item.balance > 0 && item.overdueDays !== null ? `${item.overdueDays} din se baaki` : item.phone}
              </Text>
            </View>
            <Text style={{ fontSize: FONT.title, fontWeight: "700", color: item.balance > 0 ? t.due : t.paid }}>{rupee(item.balance)}</Text>
          </Pressable>
        )}
      />
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 12, gap: 8 }}>
        <Pressable onPress={() => supabase.auth.signOut()} style={{ padding: 12 }}>
          <Text style={{ color: t.muted, fontSize: FONT.small }}>Logout</Text>
        </Pressable>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable onPress={onAdd} accessibilityRole="button" style={{ paddingHorizontal: 18, minHeight: 56, justifyContent: "center", borderRadius: 28, borderWidth: 2, borderColor: t.paid }}>
            <Text style={{ fontSize: FONT.body, color: t.paid, fontWeight: "700" }}>+ Entry</Text>
          </Pressable>
          <Pressable onPress={onVoice} accessibilityRole="button" style={{ paddingHorizontal: 22, minHeight: 56, justifyContent: "center", borderRadius: 28, backgroundColor: t.paid }}>
            <Text style={{ fontSize: FONT.body + 1, color: "#fff", fontWeight: "700" }}>🎤 Bolo</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
