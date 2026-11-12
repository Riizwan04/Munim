import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";
import { COMMON_UNITS } from "@munim/ledger-core";
import { loadMaterialsFull, saveMaterial, type MaterialFull } from "./data";
import { FONT, useTheme } from "./theme";
import { Btn, Chip, Field, Row, Section } from "./ui";

/** Items master (FR-13): brands are separate items under a category; each item lists the units it is sold in. */
export function Items({ businessId }: { businessId: string }) {
  const t = useTheme();
  const [items, setItems] = useState<MaterialFull[] | null>(null);
  const [edit, setEdit] = useState<{ id?: string; name: string; category: string; units: string[]; local: string } | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(() => loadMaterialsFull().then(setItems).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);
  if (!items) return err ? <Text style={{ color: t.due, padding: 16 }}>{err}</Text> : <ActivityIndicator style={{ flex: 1 }} />;

  if (edit) {
    const toggle = (u: string) => setEdit({ ...edit, units: edit.units.includes(u) ? edit.units.filter((x) => x !== u) : [...edit.units, u] });
    const cats = [...new Set(items.map((i) => i.category).filter(Boolean))] as string[];
    return (
      <View style={{ flex: 1, backgroundColor: t.bg, padding: 16, gap: 16 }}>
        <Text style={{ fontSize: FONT.title, fontWeight: "700", color: t.ink }}>{edit.id ? "Item badlo" : "Naya item"}</Text>
        <Field label="Naam (brand ho to brand ka naam, jaise JSW)" nativeID="it-name" value={edit.name} onChangeText={(v) => setEdit({ ...edit, name: v })} />
        <Field label="Category (jaise Cement)" nativeID="it-cat" value={edit.category} onChangeText={(v) => setEdit({ ...edit, category: v })} />
        {cats.length > 0 && <Row>{cats.map((c) => <Chip key={c} label={c} on={edit.category === c} onPress={() => setEdit({ ...edit, category: c })} />)}</Row>}
        <Section title="Kis unit mein bikta hai? (ek ya zyada)">
          <Row>{COMMON_UNITS.map((u) => <Chip key={u} label={u} on={edit.units.includes(u)} onPress={() => toggle(u)} />)}</Row>
        </Section>
        <Field label="Doosre naam (comma se alag, jaise reti, vaalu)" nativeID="it-local" value={edit.local} onChangeText={(v) => setEdit({ ...edit, local: v })} />
        {err ? <Text style={{ color: t.due }}>{err}</Text> : null}
        <Row wrap={false}>
          <Btn label="Save" disabled={!edit.name.trim() || edit.units.length === 0} onPress={async () => {
            try {
              await saveMaterial(businessId, { id: edit.id, name: edit.name.trim(), category: edit.category.trim(), units: edit.units, localNames: edit.local.split(",").map((x) => x.trim()).filter(Boolean) });
              setEdit(null); setErr(""); load();
            } catch (e: any) { setErr(e.message); }
          }} />
          <Btn kind="ghost" label="Rehne do" onPress={() => { setEdit(null); setErr(""); }} />
        </Row>
      </View>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ padding: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 2, borderColor: t.ink }}>
        <Text style={{ fontSize: FONT.title, fontWeight: "700", color: t.ink }}>Maal (Items)</Text>
        <Pressable onPress={() => setEdit({ name: "", category: "", units: [], local: "" })} accessibilityRole="button" style={{ paddingHorizontal: 18, minHeight: 48, justifyContent: "center", borderRadius: 24, backgroundColor: t.paid }}>
          <Text style={{ fontSize: FONT.body, color: "#fff", fontWeight: "700" }}>+ Naya</Text>
        </Pressable>
      </View>
      <FlatList data={items} keyExtractor={(i) => i.id}
        ListEmptyComponent={<Text style={{ padding: 24, fontSize: FONT.body, color: t.muted }}>Abhi koi item nahi. "+ Naya" se jodiye.</Text>}
        renderItem={({ item }) => (
          <Pressable onPress={() => setEdit({ id: item.id, name: item.name, category: item.category ?? "", units: item.units, local: item.localNames.join(", ") })}
            style={{ padding: 16, minHeight: 64, borderBottomWidth: 1, borderColor: t.rule, backgroundColor: t.surface, gap: 2 }}>
            <Text style={{ fontSize: FONT.body + 2, fontWeight: "600", color: t.fg }}>{item.name}</Text>
            <Text style={{ fontSize: FONT.small, color: t.muted }}>{[item.category, item.units.join(" / "), item.localNames.join(", ")].filter(Boolean).join(" · ")}</Text>
          </Pressable>
        )} />
    </View>
  );
}
