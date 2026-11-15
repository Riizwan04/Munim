import { Pressable, Text } from "react-native";
import { useOutbox } from "./offline/outbox";
import { useReachable } from "./offline/net";
import { useI18n } from "./i18n";
import { FONT, useTheme } from "./theme";

/** One thin strip at the top: offline, entries waiting to upload, or entries that could not be saved. Tap for details. */
export function SyncBanner({ onOpen }: { onOpen: () => void }) {
  const t = useTheme();
  const { tr, trn } = useI18n();
  const { pending, failed, syncing } = useOutbox();
  const online = useReachable();
  if (online && pending === 0 && failed === 0) return null;
  const bad = failed > 0;
  const text = bad ? trn("offline.failed", failed)
    : pending > 0 ? (syncing && online ? tr("offline.uploading") : trn("offline.pending", pending))
    : tr("offline.banner");
  return (
    <Pressable onPress={onOpen} accessibilityRole="button" disabled={pending + failed === 0}
      style={{ paddingVertical: 10, paddingHorizontal: 14, backgroundColor: bad ? t.due : online ? t.accent : "#8a5a00" }}>
      <Text style={{ color: "#fff", fontSize: FONT.small, fontWeight: "600" }}>{!online && pending > 0 && !bad ? `${tr("offline.short")}  ·  ` : ""}{text}</Text>
    </Pressable>
  );
}
