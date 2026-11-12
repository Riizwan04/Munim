import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { loadParties, type PartyRow } from "./data";
import { rupee } from "./money";
import { supabase } from "./supabase";
import { FONT, useTheme } from "./theme";

export function PartyList({ onOpen }: { onOpen: (p: PartyRow) => void }) {
  const t = useTheme();
  const [state, setState] = useState<{ business: string; parties: PartyRow[] } | null>(null);
  const [err, setErr] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    try { setState(await loadParties()); setErr(""); } catch (e: any) { setErr(e.message ?? String(e)); }
  }, []);
  useEffect(() => { load(); }, [load]);
  if (err) return <Text style={{ color: t.due, padding: 24, fontSize: FONT.body }}>{err}</Text>;
  if (!state) return <ActivityIndicator style={{ flex: 1 }} />;
  const total = state.parties.reduce((s, p) => s + p.balance, 0);
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ padding: 16, borderBottomWidth: 2, borderColor: t.ink, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", gap: 8, flexWrap: "wrap" }}>
        <View style={{ flexShrink: 1 }}>
          <Text style={{ fontSize: FONT.title, fontWeight: "700", color: t.ink }}>{state.business}</Text>
          <Text style={{ fontSize: FONT.small, color: t.muted }}>Kul baaki (total receivable)</Text>
        </View>
        <Text style={{ fontSize: FONT.big, fontWeight: "700", color: t.due, marginLeft: 8 }}>{rupee(total)}</Text>
      </View>
      <FlatList
        data={state.parties}
        keyExtractor={(p) => p.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        ListEmptyComponent={<Text style={{ padding: 24, fontSize: FONT.body, color: t.muted }}>No parties yet.</Text>}
        renderItem={({ item }) => (
          <Pressable onPress={() => onOpen(item)} accessibilityRole="button" style={{ padding: 16, minHeight: 64, flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1, borderColor: t.rule, backgroundColor: t.surface }}>
            <View style={{ flexShrink: 1 }}>
              <Text style={{ fontSize: FONT.body + 2, fontWeight: "600", color: t.fg }}>{item.name}</Text>
              <Text style={{ fontSize: FONT.small, color: t.muted }}>{item.phone}</Text>
            </View>
            <Text style={{ fontSize: FONT.title, fontWeight: "700", color: item.balance > 0 ? t.due : t.paid }}>{rupee(item.balance)}</Text>
          </Pressable>
        )}
      />
      <Pressable onPress={() => supabase.auth.signOut()} style={{ padding: 16, alignItems: "center" }}>
        <Text style={{ color: t.muted, fontSize: FONT.small }}>Logout</Text>
      </Pressable>
    </View>
  );
}
