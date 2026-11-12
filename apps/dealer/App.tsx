import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import type { Session } from "@supabase/supabase-js";
import { AddEntry } from "./src/AddEntry";
import { EntryDetail } from "./src/EntryDetail";
import { Ledger } from "./src/Ledger";
import { Login } from "./src/Login";
import { PartyList } from "./src/PartyList";
import { loadParties, type PartyRow } from "./src/data";
import { supabase } from "./src/supabase";
import { useTheme } from "./src/theme";

type Screen =
  | { name: "parties" }
  | { name: "ledger"; party: PartyRow }
  | { name: "add"; party?: PartyRow; editingId?: string }
  | { name: "detail"; party: PartyRow; entryId: string };

export default function App() {
  const t = useTheme();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [screen, setScreen] = useState<Screen>({ name: "parties" });
  const [data, setData] = useState<{ businessId: string; business: string; parties: PartyRow[] } | null>(null);
  const [err, setErr] = useState("");
  const [rev, setRev] = useState(0); // bump to force the ledger to reload

  const refresh = useCallback(async () => {
    try { setData(await loadParties()); setErr(""); } catch (e: any) { setErr(e.message ?? String(e)); }
  }, []);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => { setSession(s); if (!s) { setScreen({ name: "parties" }); setData(null); } });
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => { if (session) refresh(); }, [session, refresh]);

  const fresh = (p: PartyRow | undefined) => (p && data ? data.parties.find((x) => x.id === p.id) ?? p : p);
  let body;
  if (session === undefined) body = <View style={{ flex: 1, justifyContent: "center" }}><ActivityIndicator /></View>;
  else if (!session) body = <Login />;
  else if (screen.name === "add" && data)
    body = <AddEntry businessId={data.businessId} parties={data.parties} initialParty={fresh(screen.party)} editingId={screen.editingId}
      onCancel={() => setScreen(screen.party ? (screen.editingId ? { name: "detail", party: screen.party, entryId: screen.editingId } : { name: "ledger", party: screen.party }) : { name: "parties" })}
      onDone={async (p) => { await refresh(); setRev((n) => n + 1); setScreen(p ? { name: "ledger", party: p } : { name: "parties" }); }} />;
  else if (screen.name === "detail")
    body = <EntryDetail entryId={screen.entryId} party={screen.party} onBack={() => setScreen({ name: "ledger", party: screen.party })}
      onEdit={() => setScreen({ name: "add", party: screen.party, editingId: screen.entryId })}
      onChanged={async () => { await refresh(); setRev((n) => n + 1); setScreen({ name: "ledger", party: screen.party }); }} />;
  else if (screen.name === "ledger") {
    const p = fresh(screen.party)!;
    body = <Ledger key={rev} party={p} onBack={() => setScreen({ name: "parties" })} onAdd={() => setScreen({ name: "add", party: p })} onOpen={(id) => setScreen({ name: "detail", party: p, entryId: id })} />;
  } else body = <PartyList data={data} err={err} onRefresh={refresh} onOpen={(p) => setScreen({ name: "ledger", party: p })} onAdd={() => setScreen({ name: "add" })} />;

  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
        <StatusBar style="auto" />
        {body}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
