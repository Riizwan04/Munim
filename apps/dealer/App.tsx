import { Welcome } from "./src/Welcome";
import { PhoneFrame } from "./src/PhoneFrame";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Platform, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import type { Session } from "@supabase/supabase-js";
import { AddEntry } from "./src/AddEntry";
import { EntryDetail } from "./src/EntryDetail";
import { Ledger } from "./src/Ledger";
import { Login } from "./src/Login";
import { Voice } from "./src/Voice";
import { Talk } from "./src/Talk";
import { Statement } from "./src/Statement";
import { Settings } from "./src/Settings";
import { Reports } from "./src/Reports";
import { Import } from "./src/Import";
import { PublicStatement } from "./src/PublicStatement";
import { tokenFromHash } from "@munim/ledger-core";
import { SyncBanner } from "./src/SyncBanner";
import { SyncIssues } from "./src/SyncIssues";
import { setCacheUser } from "./src/offline/cache";
import { onSynced, startOutbox, stopOutbox } from "./src/offline/outbox";
import { I18nProvider, useI18n } from "./src/i18n";
import { Reminders } from "./src/Reminders";
import { Onboarding } from "./src/Onboarding";
import { Items } from "./src/Items";
import { PartyEdit } from "./src/PartyEdit";
import { Pressable, Text } from "react-native";
import { FONT, HEAD, ThemeProvider, useThemeMode } from "./src/theme";
import { BottomNav } from "./src/BottomNav";
import { Logo } from "./src/Logo";
import { useFonts, Baloo2_700Bold } from "@expo-google-fonts/baloo-2";
import type { ResolvedEntry } from "@munim/ledger-core";
import { PartyList } from "./src/PartyList";
import { loadParties, type Overview, type PartyRow } from "./src/data";
import { configProblems, supabase } from "./src/supabase";
import { installGlobalHandlers } from "./src/diagnostics";
installGlobalHandlers();
import { fe } from "./src/errors";
import { useTheme } from "./src/theme";

type PartyRef2 = PartyRow;
type Screen =
  | { name: "parties" }
  | { name: "ledger"; party: PartyRow }
  | { name: "voice" }
  | { name: "talk" }
  | { name: "items" }
  | { name: "reports" }
  | { name: "import" }
  | { name: "sync" }
  | { name: "settings" }
  | { name: "reminders"; only?: PartyRow }
  | { name: "statement"; party: PartyRow }
  | { name: "partyEdit"; party: PartyRow }
  | { name: "add"; party?: PartyRow; editingId?: string }
  | { name: "detail"; party: PartyRow; entryId: string };

function AppInner() {
  const t = useTheme();
  const { scheme } = useThemeMode();
  const { tr, asstChosen } = useI18n();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [screen, setScreen] = useState<Screen>({ name: "parties" });
  const [data, setData] = useState<Overview | null>(null);
  const [err, setErr] = useState("");
  const [rev, setRev] = useState(0); // bump to force the ledger to reload
  const [queue, setQueue] = useState<{ items: ResolvedEntry[]; i: number; text: string } | null>(null);

  const refresh = useCallback(async () => {
    try { setData(await loadParties()); setErr(""); } catch (e: any) { setErr(fe(e)); }
  }, []);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => { setSession(s); if (!s) { setScreen({ name: "parties" }); setData(null); } });
    return () => data.subscription.unsubscribe();
  }, []);
  // Offline support: the cache and the outbox belong to the signed-in user.
  const uid = session?.user.id ?? null;
  useEffect(() => {
    setCacheUser(uid);
    if (uid) void startOutbox(uid); else stopOutbox();
  }, [uid]);
  useEffect(() => onSynced(() => { void refresh(); setRev((n) => n + 1); }), [refresh]);
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
  if (configProblems.length) {
    return (
      <SafeAreaProvider><SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
        <View style={{ flex: 1, justifyContent: "center", gap: 12, padding: 24 }}>
          <Text style={{ fontSize: FONT.title, fontWeight: "700", color: t.due }}>{tr("setup.title")}</Text>
          <Text style={{ fontSize: FONT.body, color: t.fg }}>{tr("setup.body")}</Text>
          {configProblems.some((p) => p.endsWith("url")) ? <Text style={{ fontSize: FONT.small, color: t.muted }}>• {tr("setup.url")}</Text> : null}
          {configProblems.some((p) => p.endsWith("key")) ? <Text style={{ fontSize: FONT.small, color: t.muted }}>• {tr("setup.key")}</Text> : null}
        </View>
      </SafeAreaView></SafeAreaProvider>
    );
  }
  if (session === undefined) body = <View style={{ flex: 1, justifyContent: "center" }}><ActivityIndicator /></View>;
  else if (!session) body = <Login />;
  else if (asstChosen === false) body = <Welcome />;
  else if (data && !data.businessId) body = <Onboarding onDone={refresh} />;
  else if (screen.name === "reminders" && data)
    body = <Reminders businessId={data.businessId} business={data.business} parties={data.parties} only={screen.only}
      onClose={async () => { await refresh(); setScreen(screen.only ? { name: "ledger", party: screen.only } : { name: "parties" }); }} />;
  else if (screen.name === "sync" && data) body = <SyncIssues parties={data.parties} onBack={() => setScreen({ name: "parties" })} />;
  else if (screen.name === "import" && data) body = <Import businessId={data.businessId} parties={data.parties} onClose={() => setScreen({ name: "reports" })} onDone={() => { refresh(); setRev((n) => n + 1); }} />;
  else if (screen.name === "reports") body = <Reports key={rev} onImport={() => setScreen({ name: "import" })} />;
  else if (screen.name === "settings") body = <Settings onBack={() => setScreen({ name: "parties" })} businessId={data?.businessId ?? ""} tagline={data?.tagline ?? ""} onSaved={refresh} />;
  else if (screen.name === "statement")
    body = <Statement party={fresh(screen.party)!} onBack={() => setScreen({ name: "ledger", party: screen.party })} />;
  else if (screen.name === "partyEdit")
    body = <PartyEdit party={fresh(screen.party)!} onBack={() => setScreen({ name: "ledger", party: screen.party })} onSaved={async () => { await refresh(); setRev((n) => n + 1); setScreen({ name: "ledger", party: screen.party }); }} />;
  else if (screen.name === "talk" && data)
    body = <Talk businessId={data.businessId} onClose={async () => { await refresh(); setRev((n) => n + 1); setScreen({ name: "parties" }); }} onType={() => setScreen({ name: "voice" })}
      onManual={(draft) => { setQueue({ items: [draft as ResolvedEntry], i: 0, text: "" }); setScreen({ name: "add" }); }} />;
  else if (screen.name === "voice")
    body = <Voice onCancel={() => setScreen({ name: "parties" })} onResolved={(items, text) => { setQueue({ items, i: 0, text }); setScreen({ name: "add" }); }} />;
  else if (screen.name === "add" && data)
    body = <AddEntry key={queue ? `q${queue.i}` : "plain"} businessId={data.businessId} parties={data.parties} initialParty={fresh(screen.party)} editingId={screen.editingId}
      prefill={queue?.items[queue.i]} transcript={queue?.text} queuePos={queue ? { i: queue.i, n: queue.items.length } : undefined}
      onSkip={queue ? () => nextInQueue(undefined) : undefined}
      onCancel={() => { setQueue(null);  setScreen(screen.party ? (screen.editingId ? { name: "detail", party: screen.party, entryId: screen.editingId } : { name: "ledger", party: screen.party }) : { name: "parties" }); }}
      onDone={(p) => nextInQueue(p)} />;
  else if (screen.name === "detail")
    body = <EntryDetail entryId={screen.entryId} party={screen.party} onBack={() => setScreen({ name: "ledger", party: screen.party })}
      onEdit={() => setScreen({ name: "add", party: screen.party, editingId: screen.entryId })}
      onChanged={async () => { await refresh(); setRev((n) => n + 1); setScreen({ name: "ledger", party: screen.party }); }} />;
  else if (screen.name === "ledger") {
    const p = fresh(screen.party)!;
    body = <Ledger key={rev} party={p} onBack={() => setScreen({ name: "parties" })} onAdd={() => setScreen({ name: "add", party: p })} onOpen={(id) => setScreen({ name: "detail", party: p, entryId: id })} onEditParty={() => setScreen({ name: "partyEdit", party: p })} onStatement={() => setScreen({ name: "statement", party: p })} onRemind={() => setScreen({ name: "reminders", only: p })} />;
  } else if (screen.name === "items" && data) body = <Items businessId={data.businessId} />;
  else body = <PartyList data={data} err={err} onRefresh={refresh} onOpen={(p) => setScreen({ name: "ledger", party: p })} onAdd={() => setScreen({ name: "add" })} onSettings={() => setScreen({ name: "settings" })} />;

  return (
    <SafeAreaProvider>
      <SafeAreaView edges={["top", "left", "right", "bottom"]} style={{ flex: 1, backgroundColor: session && data?.businessId && screen.name === "parties" ? t.hero : t.bg }}>
        <StatusBar style={scheme === "dark" || (session && data?.businessId && screen.name === "parties") ? "light" : "dark"} />
        {session && data?.businessId && screen.name !== "sync" ? <SyncBanner onOpen={() => setScreen({ name: "sync" })} /> : null}
        <View style={{ flex: 1, backgroundColor: t.bg }}>{body}</View>
        {session && data?.businessId && (screen.name === "parties" || screen.name === "items" || screen.name === "reports" || (screen.name === "reminders" && !screen.only)) ? (
          <BottomNav active={screen.name} onTalk={() => setScreen({ name: "talk" })}
            onGo={(k) => setScreen(k === "items" ? { name: "items" } : k === "reminders" ? { name: "reminders" } : k === "reports" ? { name: "reports" } : { name: "parties" })} />
        ) : null}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

export default function App() {
  // A customer's link (#/s/<token>) shows only their statement: no login, no dealer app, no offline queue.
  const read = () => (Platform.OS === "web" && typeof window !== "undefined" ? tokenFromHash(window.location.hash) : null);
  const [token, setToken] = useState<string | null>(read);
  const [fonts] = useFonts({ Baloo2_700Bold });
  const [waited, setWaited] = useState(false);
  useEffect(() => { const id = setTimeout(() => setWaited(true), 2500); return () => clearTimeout(id); }, []); // never wait forever for a font
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const f = () => setToken(read());
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  return (
    <ThemeProvider>
      <PhoneFrame>
        {!fonts && !waited ? <Splash /> : token
          ? <SafeAreaProvider><SafeAreaView style={{ flex: 1 }}><PublicStatement token={token} /></SafeAreaView></SafeAreaProvider>
          : <I18nProvider><AppInner /></I18nProvider>}
      </PhoneFrame>
    </ThemeProvider>
  );
}

function Splash() {
  const t = useTheme();
  return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: t.hero }}><Logo size={96} /></View>;
}
