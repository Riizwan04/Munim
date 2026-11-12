import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { cancelEntry, loadEntry, type EntryDetail as Detail, type PartyRow } from "./data";
import { rupee } from "./money";
import { FONT, useTheme } from "./theme";
import { Btn, Field, Row } from "./ui";
import { entryMessage, lineText, type Lang } from "@munim/ledger-core";
import { sendWhatsApp } from "./share";
import { supabase } from "./supabase";

export function EntryDetail({ entryId, party, onBack, onEdit, onChanged }: { entryId: string; party: PartyRow; onBack: () => void; onEdit: () => void; onChanged: () => void }) {
  const t = useTheme();
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { loadEntry(entryId).then(setD).catch((e) => setErr(e.message)); }, [entryId]);
  if (!d) return err ? <Text style={{ color: t.due, padding: 16 }}>{err}</Text> : <ActivityIndicator style={{ marginTop: 40 }} />;
  const name: Record<string, string> = { sale: "Maal diya", payment: "Paisa mila", charge: "Charge", discount: "Discount", return: "Return" };
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Text onPress={onBack} accessibilityRole="button" style={{ padding: 14, fontSize: FONT.body, color: t.accent, fontWeight: "600" }}>‹ {party.name}</Text>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Text style={{ fontSize: FONT.title, fontWeight: "700", color: t.ink }}>{name[d.type] ?? d.type} · {d.date}</Text>
        {d.siteName ? <Text style={{ fontSize: FONT.body, color: t.muted }}>Site: {d.siteName}</Text> : null}
        {d.lines.map((l, i) => <Text key={i} style={{ fontSize: FONT.body + 1, color: t.fg }}>{l.name}: {l.qty / 1000} {l.unit} × {rupee(l.rate)} = <Text style={{ fontWeight: "700" }}>{rupee(l.total)}</Text></Text>)}
        <Text style={{ fontSize: FONT.big, fontWeight: "700", color: d.type === "payment" ? t.paid : t.due }}>{rupee(d.amount)}</Text>
        <Text style={{ fontSize: FONT.small, color: t.muted }}>Version {d.version} · {d.status}</Text>
        {err ? <Text style={{ color: t.due }}>{err}</Text> : null}
        {d.status === "active" && !cancelling && (
          <Row wrap={false}><Btn label="Party ko WhatsApp par bhejo" onPress={async () => {
            try {
              const b = await supabase.from("businesses").select("name").limit(1).maybeSingle();
              const lang = (["hi", "mr", "en"].includes(party.language) ? party.language : "hi") as Lang;
              const msg = entryMessage({
                lang, businessName: b.data?.name ?? "Munim", partyName: party.name, date: d.date, siteName: d.siteName,
                kind: d.type === "payment" ? "payment" : d.type === "sale" ? "sale" : "other",
                items: d.lines.map((l) => lineText(l.name, l.qty, l.unit, l.rate)), total: d.amount,
                paymentMode: (d.paymentMode as any) ?? undefined, newBalance: party.balance,
              });
              await sendWhatsApp(party.phone, msg);
            } catch (e: any) { setErr(e.message ?? String(e)); }
          }} /></Row>
        )}
        {d.status === "active" && !cancelling && <Row wrap={false}><Btn kind="ghost" label="Badlo (Edit)" onPress={onEdit} /><Btn kind="danger" label="Cancel entry" onPress={() => setCancelling(true)} /></Row>}
        {cancelling && (
          <View style={{ gap: 10 }}>
            <Field label="Cancel karne ka karan (zaroori)" nativeID="cancel-reason" value={reason} onChangeText={setReason} />
            <Text style={{ color: t.muted, fontSize: FONT.small }}>Entry delete nahi hogi, history mein dikhegi lekin baaki par asar nahi padega.</Text>
            {busy ? <ActivityIndicator /> : <Row wrap={false}>
              <Btn kind="danger" label="Haan, cancel" disabled={!reason.trim()} onPress={async () => { setBusy(true); try { await cancelEntry(d.id, reason.trim()); onChanged(); } catch (e: any) { setErr(e.message); setBusy(false); } }} />
              <Btn kind="ghost" label="Nahi" onPress={() => setCancelling(false)} />
            </Row>}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
