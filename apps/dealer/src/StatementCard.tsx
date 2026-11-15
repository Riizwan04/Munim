import { Text, View } from "react-native";
import { labels, type Statement } from "@munim/ledger-core";
import { rs, rupee } from "./money";
import { FONT, useTheme } from "./theme";

/** The statement table: opening balance, one row per entry, closing balance. Used by the dealer and on the customer's page. */
export function StatementCard({ stmt, emptyText }: { stmt: Statement; emptyText: string }) {
  const t = useTheme();
  const L = labels(stmt.lang);
  return (
    <View style={{ borderWidth: 2, borderColor: t.line, borderRadius: 12, backgroundColor: t.surface, overflow: "hidden" }}>
      <View style={{ padding: 12, gap: 2, borderBottomWidth: 2, borderColor: t.ink }}>
        <Text style={{ fontSize: FONT.small, color: t.muted }}>{L.opening}</Text>
        <Text style={{ fontSize: FONT.body + 2, fontWeight: "700", color: t.fg }}>{rupee(stmt.opening)}</Text>
      </View>
      {stmt.rows.length === 0 && <Text style={{ padding: 14, color: t.muted, fontSize: FONT.body }}>{emptyText}</Text>}
      {stmt.rows.map((r, i) => (
        <View key={r.entryId + i} style={{ flexDirection: "row", gap: 8, padding: 12, borderBottomWidth: 1, borderColor: t.rule, backgroundColor: r.kind === "payment" ? t.paidBg : t.surface }}>
          <Text style={{ width: 52, fontSize: FONT.small, color: t.muted }}>{r.date.slice(8, 10)}-{r.date.slice(5, 7)}</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: FONT.body, color: r.kind === "payment" ? t.paid : t.ink }}>{r.text}</Text>
            {r.site ? <Text style={{ fontSize: 13, color: t.muted }}>{r.site}</Text> : null}
          </View>
          <Text style={{ fontSize: FONT.body, fontWeight: "700", color: r.amount < 0 ? t.paid : t.fg }}>{r.amount < 0 ? "− " : ""}{rs(Math.abs(r.amount))}</Text>
        </View>
      ))}
      <View style={{ padding: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderTopWidth: 2, borderColor: t.ink }}>
        <Text style={{ fontSize: FONT.body, fontWeight: "700", color: t.fg }}>{stmt.siteName ? L.site_bal : L.closing}</Text>
        <Text style={{ fontSize: FONT.big, fontWeight: "700", color: stmt.closing > 0 ? t.due : t.paid }}>{rupee(stmt.closing)}</Text>
      </View>
    </View>
  );
}
