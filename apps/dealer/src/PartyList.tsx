import { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import type { Overview, PartyRow } from "./data";
import { useI18n } from "./i18n";
/** Up to two letters for the round badge: "R.R Enterprises" -> "RR", "Sample Building Supplies" -> "SB". */
export const monogram = (name: string) => {
  const w = name.replace(/[^\p{L}\p{N}\s.]/gu, "").split(/[\s.]+/).filter(Boolean);
  return ((w[0]?.[0] ?? "M") + (w.length > 1 ? w[1][0] : "")).toUpperCase();
};
import { Avatar, Logo, Tag } from "./Logo";
import { rupee } from "./money";
import { FONT, HEAD, useTheme } from "./theme";

type Sort = "balance" | "overdue";

/** Home: a ledger-ink header with the receivable and today's figures, then one card per party (FR-70, FR-71). */
export function PartyList({ data, err, onOpen, onAdd, onSettings, onRefresh }: {
  data: Overview | null; err: string; onOpen: (p: PartyRow) => void; onAdd: () => void; onSettings: () => void; onRefresh: () => Promise<void>;
}) {
  const t = useTheme();
  const { tr, trn } = useI18n();
  const [refreshing, setRefreshing] = useState(false);
  const [sort, setSort] = useState<Sort>("balance");
  const list = useMemo(() => {
    if (!data) return [];
    return [...data.parties].sort(sort === "balance" ? (a, b) => b.balance - a.balance : (a, b) => (b.overdueDays ?? -1) - (a.overdueDays ?? -1));
  }, [data, sort]);
  if (err) return <Text style={{ color: t.due, padding: 24, fontSize: FONT.body }}>{err}</Text>;
  if (!data) return <ActivityIndicator style={{ flex: 1 }} />;
  const total = data.parties.reduce((s, p) => s + Math.max(p.balance, 0), 0);
  const overdue = data.parties.filter((p) => (p.overdueDays ?? 0) > 30 && p.balance > 0).length;
  const tile = (label: string, value: string) => (
    <View style={{ flex: 1, minWidth: 0, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 10, backgroundColor: "rgba(255,255,255,0.12)", borderWidth: 1, borderStyle: "dashed", borderColor: "rgba(255,255,255,0.35)" }}>
      <Text style={{ fontSize: 11.5, color: t.heroFg, opacity: 0.85 }} numberOfLines={1}>{label}</Text>
      <Text style={{ fontFamily: HEAD, fontSize: FONT.body, color: t.heroFg }} numberOfLines={1}>{value}</Text>
    </View>
  );
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ backgroundColor: t.hero, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16, borderBottomLeftRadius: 22, borderBottomRightRadius: 22, gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Logo size={22} />
          <Text style={{ fontFamily: HEAD, fontSize: 13, color: t.heroFg, opacity: 0.75, flex: 1, letterSpacing: 1.5 }}>MUNIM</Text>
          <Pressable onPress={onSettings} accessibilityRole="button" accessibilityLabel={tr("common.settings")} style={{ minWidth: 46, minHeight: 46, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 24, color: t.heroFg, opacity: 0.9 }}>⚙</Text>
          </Pressable>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }} testID="biz-banner">
          <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: t.saffron, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "rgba(255,255,255,0.35)" }}>
            <Text style={{ fontFamily: HEAD, fontSize: 21, color: t.saffronFg }}>{monogram(data.business)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: HEAD, fontSize: 24, lineHeight: 30, color: t.heroFg }} numberOfLines={2} testID="biz-name">{data.business}</Text>
            {data.tagline ? <Text style={{ fontSize: 13.5, color: t.heroFg, opacity: 0.85 }} numberOfLines={1} testID="biz-tagline">{data.tagline}</Text> : null}
          </View>
        </View>
        <View>
          <Text style={{ fontSize: 13, color: t.heroFg, opacity: 0.85 }}>{tr("home.receivable")}</Text>
          <Text style={{ fontFamily: HEAD, fontSize: 38, lineHeight: 44, color: t.heroFg }} testID="receivable">{rupee(total)}</Text>
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {tile(tr("home.todaySales"), rupee(data.todaySales))}
          {tile(tr("home.todayReceived"), rupee(data.todayCollections))}
          {tile(tr("home.overdue"), trn("home.parties", overdue))}
        </View>
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 4 }}>
        {(["balance", "overdue"] as Sort[]).map((k) => (
          <Pressable key={k} onPress={() => setSort(k)} accessibilityRole="button" style={{ minHeight: 42, paddingHorizontal: 14, justifyContent: "center", borderRadius: 21, borderWidth: 1.5, borderColor: sort === k ? t.accent : t.line, backgroundColor: sort === k ? t.accent : t.surface }}>
            <Text style={{ fontSize: FONT.small - 1, fontWeight: "700", color: sort === k ? t.accentFg : t.fg }}>{k === "balance" ? tr("home.sortBalance") : tr("home.sortOverdue")}</Text>
          </Pressable>
        ))}
        <View style={{ flex: 1 }} />
        <Pressable onPress={onAdd} accessibilityRole="button" style={{ minHeight: 42, paddingHorizontal: 16, justifyContent: "center", borderRadius: 21, backgroundColor: t.paid }}>
          <Text style={{ fontFamily: HEAD, fontSize: FONT.small, color: t.bg === "#12141f" ? "#06130a" : "#fff" }}>{tr("home.entry")}</Text>
        </Pressable>
      </View>

      <FlatList
        data={list}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ padding: 12, gap: 10 }}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={t.accent} onRefresh={async () => { setRefreshing(true); await onRefresh(); setRefreshing(false); }} />}
        ListEmptyComponent={<Text style={{ padding: 24, fontSize: FONT.body, color: t.muted }}>{tr("home.empty")}</Text>}
        renderItem={({ item }) => {
          const owing = item.balance > 0;
          const old = (item.overdueDays ?? 0) > 30;
          return (
            <Pressable onPress={() => onOpen(item)} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 14, backgroundColor: t.surface, borderWidth: 1, borderColor: t.line }}>
              <Avatar name={item.name} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: FONT.body, fontWeight: "700", color: t.fg }} numberOfLines={1}>{item.name}</Text>
                <Text style={{ fontSize: 13, color: old ? t.due : t.muted }} numberOfLines={1}>
                  {owing && item.overdueDays !== null ? tr("home.daysDue", { n: item.overdueDays }) : item.phone}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 3 }}>
                <Text style={{ fontFamily: HEAD, fontSize: FONT.body + 2, color: owing ? t.due : t.paid }}>{rupee(item.balance)}</Text>
                <Tag label={owing ? (old ? tr("tag.overdue") : tr("tag.due")) : tr("tag.clear")} tone={owing ? "bad" : "good"} />
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
