import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import type { Session } from "@supabase/supabase-js";
import { Ledger } from "./src/Ledger";
import { Login } from "./src/Login";
import { PartyList } from "./src/PartyList";
import type { PartyRow } from "./src/data";
import { supabase } from "./src/supabase";
import { useTheme } from "./src/theme";

export default function App() {
  const t = useTheme();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [party, setParty] = useState<PartyRow | null>(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => { setSession(s); if (!s) setParty(null); });
    return () => data.subscription.unsubscribe();
  }, []);
  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
        <StatusBar style="auto" />
        {session === undefined ? <View style={{ flex: 1, justifyContent: "center" }}><ActivityIndicator /></View>
          : !session ? <Login />
          : party ? <Ledger party={party} onBack={() => setParty(null)} />
          : <PartyList onOpen={setParty} />}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
