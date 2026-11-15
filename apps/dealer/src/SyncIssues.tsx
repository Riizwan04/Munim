import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { formatINR } from "@munim/ledger-core";
import type { PartyRow } from "./data";
import { useI18n, type Key } from "./i18n";
import { discardItem, retryItem, syncNow, useOutbox } from "./offline/outbox";
import { FONT, useTheme } from "./theme";
import { Btn, Row } from "./ui";

/** Entries stored on this phone that are not on the server yet, or that the server refused. Nothing here is lost until the dealer discards it. */
export function SyncIssues({ parties, onBack }: { parties: PartyRow[]; onBack: () => void }) {
  const t = useTheme();
  const { tr } = useI18n();
  const { items } = useOutbox();
  const [confirm, setConfirm] = useState<string | null>(null);
  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={{ padding: 16, gap: 14 }}>
      <Text onPress={onBack} accessibilityRole="button" style={{ fontSize: FONT.body, color: t.accent, fontWeight: "600" }}>{tr("sync.back")}</Text>
      <Text style={{ fontSize: FONT.title, fontWeight: "700", color: t.ink }}>{tr("sync.title")}</Text>
      <Text style={{ fontSize: FONT.small, color: t.muted }}>{tr("sync.note")}</Text>
      {items.length === 0 ? <Text style={{ fontSize: FONT.body, color: t.paid, fontWeight: "600" }}>{tr("sync.empty")}</Text> : (
        <Row wrap={false}><Btn label={tr("sync.retryAll")} onPress={() => void syncNow()} /></Row>
      )}
      {items.map((it) => {
        const p = it.payload;
        const party = parties.find((x) => x.id === p.party_id)?.name ?? "?";
        const failed = it.status === "failed";
        return (
          <View key={it.id} style={{ gap: 6, padding: 12, borderRadius: 12, borderWidth: 2, borderColor: failed ? t.due : t.line, backgroundColor: t.surface }}>
            <Text style={{ fontSize: FONT.body + 1, fontWeight: "700", color: t.fg }}>{party}</Text>
            <Text style={{ fontSize: FONT.body, color: t.fg }}>{tr(`type.${p.type}` as Key)} · {p.entry_date} · {formatINR(p.amount)}</Text>
            <Text style={{ fontSize: FONT.small, color: failed ? t.due : t.muted, fontWeight: "600" }}>{failed ? tr("sync.couldNotSave") : tr("sync.waiting")}</Text>
            {failed && it.error ? <Text style={{ fontSize: FONT.small, color: t.due }}>{tr("sync.reason", { err: it.error })}</Text> : null}
            {confirm === it.id ? (
              <Row wrap={false}><Btn kind="danger" label={tr("sync.confirmDiscard")} onPress={async () => { await discardItem(it.id); setConfirm(null); }} /><Btn kind="ghost" label={tr("common.no")} onPress={() => setConfirm(null)} /></Row>
            ) : (
              <Row wrap={false}>
                {failed && <Btn kind="ghost" label={tr("sync.retryOne")} onPress={() => void retryItem(it.id)} />}
                <Btn kind="ghost" label={tr("sync.discard")} onPress={() => setConfirm(it.id)} />
              </Row>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}
