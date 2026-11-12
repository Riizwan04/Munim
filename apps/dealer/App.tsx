import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import type { Session } from "@supabase/supabase-js";
import { AddEntry } from "./src/AddEntry";
import { EntryDetail } from "./src/EntryDetail";
import { Ledger } from "./src/Ledger";
import { Login } from "./src/Login";
import { Voice } from "./src/Voice";
import { Statement } from "./src/Statement";
import { Onboarding } from "./src/Onboarding";
import { Items } from "./src/Items";
import { PartyEdit } from "./src/PartyEdit";
import { Pressable, Text } from "react-native";
import { FONT } from "./src/theme";
import type { ResolvedEntry } from "@munim/ledger-core";
import { PartyList } from "./src/PartyList";
import { loadParties, type Overview, type PartyRow } from "./src/data";
import { supabase } from "./src/supabase";
import { useTheme } from "./src/theme";

type PartyRef2 = PartyRow;
type Screen =
  | { name: "parties" }
  | { name: "ledger"; party: PartyRow }
  | { name: "voice" }
  | { name: "items" }
  | { name: "statement"; party: PartyRow }
  | { name: "partyEdit"; party: PartyRow }
  | { name: "add"; party?: PartyRow; editingId?: string }
  | { name: "detail"; party: PartyRow; entryId: string };

export default function App() {
  const t = useTheme();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [screen, setScreen] = useState<Screen>({ name: "parties" });
  const [data, setData] = useState<Overview | null>(null);
  const [err, setErr] = useState("");
  const [rev, setRev] = useState(0); // bump to force the ledger to reload
  const [queue, setQueue] = useState<{ items: ResolvedEntry[]; i: number; text: string } | null>(null);

  const refresh = useCallback(async () => {
    try { setData(await loadParties()); setErr(""); } catch (e: any) { setErr(e.message ?? String(e)); }
  }, []);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => { setSession(s); if (!s) { setScreen({ name: "parties" }); setData(null); } });
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => { if (session) refresh(); }, [session, refresh]);

  // After a voice entry is saved or skipped: go to the next entry from the same sentence, else back to the ledger.
  const nextInQueue = async (p: PartyRef2 | undefined) => {
    await refresh(); setRev((n) => n + 1);
    if (queue && queue.i + 1 < queue.items.length) { setQueue({ ...queue, i: queue.i + 1 }); setScreen({ name: "add", party: undefined }); return; }
    setQueue(null);
    setScreen(p ? { name: "ledger", party: p } : { name: "parties" });
  };
  const fresh = (p: PartyRow | undefined) => (p && data ? data.parties.find((x) => x.id === p.id) ?? p : p);
  let body;
  if (session === undefined) body = <View style={{ flex: 1, justifyContent: "center" }}><ActivityIndicator /></View>;
  else if (!session) body = <Login />;
  else if (data && !data.businessId) body = <Onboarding onDone={refresh} />;
  else if (screen.name === "statement")
    body = <Statement party={fresh(screen.party)!} onBack={() => setScreen({ name: "ledger", party: screen.party })} />;
  else if (screen.name === "partyEdit")
    body = <PartyEdit party={fresh(screen.party)!} onBack={() => setScreen({ name: "ledger", party: screen.party })} onSaved={async () => { await refresh(); setRev((n) => n + 1); setScreen({ name: "ledger", party: screen.party }); }} />;
  else if (screen.name === "voice")
    body = <Voice onCancel={() => setScreen({ name: "parties" })} onResolved={(items, text) => { setQueue({ items, i: 0, text }); setScreen({ name: "add" }); }} />;
  else if (screen.name === "add" && data)
    body = <AddEntry key={queue ? `q${queue.i}` : "plain"} businessId={data.businessId} parties={data.parties} initialParty={fresh(screen.party)} editingId={screen.editingId}
      prefill={queue?.items[queue.i]} transcript={queue?.text} queueLabel={queue && queue.items.length > 1 ? `Entry ${queue.i + 1}/${queue.items.length}` : undefined}
      onSkip={queue ? () => nextInQueue(undefined) : undefined}
      onCancel={() => { setQueue(null);  setScreen(screen.party ? (screen.editingId ? { name: "detail", party: screen.party, entryId: screen.editingId } : { name: "ledger", party: screen.party }) : { name: "parties" }); }}
      onDone={(p) => nextInQueue(p)} />;
  else if (screen.name === "detail")
    body = <EntryDetail entryId={screen.entryId} party={screen.party} onBack={() => setScreen({ name: "ledger", party: screen.party })}
      onEdit={() => setScreen({ name: "add", party: screen.party, editingId: screen.entryId })}
      onChanged={async () => { await refresh(); setRev((n) => n + 1); setScreen({ name: "ledger", party: screen.party }); }} />;
  else if (screen.name === "ledger") {
    const p = fresh(screen.party)!;
    body = <Ledger key={rev} party={p} onBack={() => setScreen({ name: "parties" })} onAdd={() => setScreen({ name: "add", party: p })} onOpen={(id) => setScreen({ name: "detail", party: p, entryId: id })} onEditParty={() => setScreen({ name: "partyEdit", party: p })} onStatement={() => setScreen({ name: "statement", party: p })} />;
  } else if (screen.name === "items" && data) body = <Items businessId={data.businessId} />;
  else body = <PartyList data={data} err={err} onRefresh={refresh} onOpen={(p) => setScreen({ name: "ledger", party: p })} onAdd={() => setScreen({ name: "add" })} onVoice={() => setScreen({ name: "voice" })} />;

  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
        <StatusBar style="auto" />
        <View style={{ flex: 1 }}>{body}</View>
        {session && data?.businessId && (screen.name === "parties" || screen.name === "items") ? (
          <View style={{ flexDirection: "row", borderTopWidth: 1, borderColor: t.line, backgroundColor: t.surface }}>
            {([["parties", "Parties"], ["items", "Maal (Items)"]] as const).map(([k, label]) => (
              <Pressable key={k} onPress={() => setScreen(k === "items" ? { name: "items" } : { name: "parties" })} accessibilityRole="tab" style={{ flex: 1, minHeight: 56, alignItems: "center", justifyContent: "center", borderTopWidth: 3, borderColor: screen.name === k ? t.accent : "transparent" }}>
                <Text style={{ fontSize: FONT.body, fontWeight: "700", color: screen.name === k ? t.accent : t.muted }}>{label}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
